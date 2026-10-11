package com.soupytag.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
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

    private File stagingDirectory() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(context.getCacheDir(), "document-payload-tests");
        File[] oldFiles = directory.listFiles();
        if (oldFiles != null) for (File file : oldFiles) file.delete();
        assertTrue(directory.exists() || directory.mkdirs());
        return directory;
    }
}
