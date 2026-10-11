package com.soupytag.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.app.Activity;
import android.util.Base64;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class DocumentPayloadTest {
    @Test
    public void stagesAndRestoresMultiMegabytePdfFromOpaqueToken() throws Exception {
        byte[] bytes = new byte[3 * 1024 * 1024];
        byte[] header = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(header, 0, bytes, 0, header.length);
        byte[] trailer = "\n%%EOF".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(trailer, 0, bytes, bytes.length - trailer.length, trailer.length);
        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
        File directory = stagingDirectory();

        DocumentPayload.Staged staged =
            DocumentPayload.stage(directory, base64, "inspection.pdf", "application/pdf");
        DocumentPayload.Staged restored = DocumentPayload.restore(directory, staged.token);
        ByteArrayOutputStream saved = new ByteArrayOutputStream();
        assertEquals(bytes.length, DocumentPayload.copyTo(restored, saved));
        assertArrayEquals(bytes, saved.toByteArray());
        DocumentPayload.verifyReadback(restored, new ByteArrayInputStream(bytes));

        assertEquals(bytes.length, restored.length);
        assertTrue(restored.dataFile.isFile());
        DocumentPayload.cleanup(restored);
        assertFalse(restored.dataFile.exists());
        assertFalse(restored.metadataFile.exists());
    }

    @Test
    public void rejectsEmptyCorruptAndMismatchedDocumentPayloads() throws Exception {
        File directory = stagingDirectory();
        assertThrows(IOException.class, () -> DocumentPayload.stage(
            directory, "", "inspection.pdf", "application/pdf"));
        assertThrows(IOException.class, () -> DocumentPayload.stage(
            directory, Base64.encodeToString("not pdf".getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP),
            "inspection.pdf", "application/pdf"));
        assertThrows(IOException.class, () -> DocumentPayload.stage(
            directory, Base64.encodeToString("{".getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP),
            "inspection.context-trail.json", "application/json"));
        assertThrows(IOException.class, () -> DocumentPayload.stage(
            directory, Base64.encodeToString(
                "<!doctype html><html></html>".getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP),
            "inspection.json", "text/html"));
        assertTrue(Arrays.stream(directory.listFiles()).noneMatch(file -> file.getName().endsWith(".data")));
    }

    @Test
    public void validatesTrailJsonAndHtmlBeforeStagingThem() throws Exception {
        File directory = stagingDirectory();
        String json = "{\"version\":2,\"levels\":[]}";
        DocumentPayload.Staged jsonStage = DocumentPayload.stage(
            directory, Base64.encodeToString(json.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP),
            "inspection.context-trail.json", "application/json");
        DocumentPayload.cleanup(jsonStage);

        String html = "<!doctype html><html><body>Offline report</body></html>";
        DocumentPayload.Staged htmlStage = DocumentPayload.stage(
            directory, Base64.encodeToString(html.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP),
            "inspection.html", "text/html");
        DocumentPayload.cleanup(htmlStage);
        assertTrue(Arrays.stream(directory.listFiles()).noneMatch(file -> file.getName().endsWith(".data")));
    }

    @Test
    public void rejectsProviderReadbackThatWasTruncatedOrChanged() throws Exception {
        byte[] bytes = "%PDF-1.7\ncomplete\n%%EOF".getBytes(StandardCharsets.US_ASCII);
        File directory = stagingDirectory();
        DocumentPayload.Staged staged = DocumentPayload.stage(
            directory, Base64.encodeToString(bytes, Base64.NO_WRAP), "inspection.pdf", "application/pdf");
        assertThrows(IOException.class, () -> DocumentPayload.verifyReadback(
            staged, new ByteArrayInputStream(Arrays.copyOf(bytes, bytes.length - 1))));
        DocumentPayload.cleanup(staged);
    }

    @Test
    public void rejectsProviderWriteFailuresAndCleansCancelledStaging() throws Exception {
        byte[] bytes = "%PDF-1.7\ncomplete\n%%EOF".getBytes(StandardCharsets.US_ASCII);
        File directory = stagingDirectory();
        DocumentPayload.Staged staged = DocumentPayload.stage(
            directory, Base64.encodeToString(bytes, Base64.NO_WRAP), "inspection.pdf", "application/pdf");
        assertThrows(IOException.class, () -> DocumentPayload.copyTo(staged, new OutputStream() {
            @Override
            public void write(int value) throws IOException {
                throw new IOException("synthetic provider write failure");
            }
        }));

        DocumentPayload.cleanup(directory, staged.token);
        assertFalse(staged.dataFile.exists());
        assertFalse(staged.metadataFile.exists());
    }

    @Test
    public void slowProviderWorkRunsOffMainAndExecutorQueueIsBounded() throws Exception {
        CountDownLatch slowProviderEntered = new CountDownLatch(1);
        CountDownLatch releaseSlowProvider = new CountDownLatch(1);
        CountDownLatch queuedWorkFinished = new CountDownLatch(1);
        DocumentIo.execute(() -> {
            slowProviderEntered.countDown();
            try {
                releaseSlowProvider.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        });
        assertTrue(slowProviderEntered.await(2, TimeUnit.SECONDS));

        DocumentIo.execute(queuedWorkFinished::countDown);
        assertThrows(RejectedExecutionException.class, () -> DocumentIo.execute(() -> {}));

        CountDownLatch mainThreadResponsive = new CountDownLatch(1);
        long startedAt = System.nanoTime();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(mainThreadResponsive::countDown);
        assertTrue(mainThreadResponsive.await(1, TimeUnit.SECONDS));
        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt) < 1000);

        releaseSlowProvider.countDown();
        assertTrue(queuedWorkFinished.await(2, TimeUnit.SECONDS));
    }

    @Test
    public void destinationCleanupRequiresSuccessfulResultRestoredRequestAndWriteAttempt() {
        assertFalse(DocumentPayload.mayDeleteDestination(Activity.RESULT_CANCELED, true, true, true));
        assertFalse(DocumentPayload.mayDeleteDestination(Activity.RESULT_OK, false, true, true));
        assertFalse(DocumentPayload.mayDeleteDestination(Activity.RESULT_OK, true, false, true));
        assertFalse(DocumentPayload.mayDeleteDestination(Activity.RESULT_OK, true, true, false));
        assertTrue(DocumentPayload.mayDeleteDestination(Activity.RESULT_OK, true, true, true));
    }

    @Test
    public void stagedRequestCanBeRestoredAfterPickerLifecycleRecreation() throws Exception {
        File directory = stagingDirectory();
        String pdf = "%PDF-1.7\nlifecycle fixture\n%%EOF";
        DocumentPayload.Staged original = DocumentPayload.stage(
            directory,
            Base64.encodeToString(pdf.getBytes(StandardCharsets.US_ASCII), Base64.NO_WRAP),
            "lifecycle.pdf",
            "application/pdf"
        );

        DocumentPayload.Staged afterRecreation = DocumentPayload.restore(directory, original.token);
        assertEquals(original.token, afterRecreation.token);
        assertEquals(original.length, afterRecreation.length);
        DocumentPayload.cleanup(afterRecreation);
    }

    private File stagingDirectory() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(context.getCacheDir(), "document-payload-tests");
        File[] oldFiles = directory.listFiles();
        if (oldFiles != null) for (File file : oldFiles) file.delete();
        assertTrue(directory.exists() || directory.mkdirs());
        return directory;
    }
}
