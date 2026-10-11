package com.soupytag.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "SoupyDocument")
public class SoupyDocumentPlugin extends Plugin {
    private static final String TAG = "SoupyDocument";
    private static final AtomicBoolean PICKER_IN_PROGRESS = new AtomicBoolean(false);

    @PluginMethod
    public void saveDocument(PluginCall call) {
        if (!PICKER_IN_PROGRESS.compareAndSet(false, true)) {
            call.reject("A document save is already in progress.");
            return;
        }

        String stage = "validate";
        String token = null;
        DocumentPayload.Staged staged = null;
        try {
            String fileName = call.getString("fileName");
            String mimeType = call.getString("mimeType");
            String base64 = call.getString("base64");
            fileName = DocumentPayload.validateFileName(fileName, mimeType);
            File directory = stagingDirectory();
            DocumentPayload.cleanupStale(directory, System.currentTimeMillis());

            stage = "stage";
            staged = DocumentPayload.stage(directory, base64, fileName, mimeType);
            token = staged.token;

            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(staged.mimeType);
            intent.putExtra(Intent.EXTRA_TITLE, fileName);

            while (call.getData().length() > 0) call.getData().remove(call.getData().keys().next());
            call.getData().put("stagedToken", token);
            Log.i(TAG, "stage=ready bytes=" + staged.length + " mime=" + staged.mimeType);
            startActivityForResult(call, intent, "saveDocumentResult");
        } catch (Exception error) {
            DocumentPayload.cleanup(staged);
            if (staged == null) DocumentPayload.cleanup(stagingDirectory(), token);
            PICKER_IN_PROGRESS.set(false);
            String bytes = error instanceof DocumentPayload.StagingException
                ? Long.toString(((DocumentPayload.StagingException) error).bytes)
                : "unknown";
            Log.w(TAG, "stage=" + stage + " bytes=" + bytes + " error=" + error.getClass().getSimpleName());
            call.reject("Could not prepare the document for saving.");
        }
    }

    @ActivityCallback
    private void saveDocumentResult(PluginCall call, ActivityResult result) {
        File directory = stagingDirectory();
        String token = call == null ? null : call.getString("stagedToken");
        DocumentPayload.Staged staged = null;
        Uri uri = null;
        String stage = "restore";
        try {
            if (result.getResultCode() == Activity.RESULT_CANCELED) {
                DocumentPayload.cleanup(directory, token);
                Log.i(TAG, "stage=cancelled bytes=0");
                JSObject response = new JSObject();
                response.put("cancelled", true);
                call.resolve(response);
                return;
            }
            uri = result.getData() == null ? null : result.getData().getData();
            if (uri == null) throw new IllegalStateException("The system picker returned no document.");

            staged = DocumentPayload.restore(directory, token);
            ContentResolver resolver = getContext().getContentResolver();
            stage = "write";
            long copied;
            try (OutputStream output = resolver.openOutputStream(uri, "w")) {
                if (output == null) throw new IllegalStateException("The selected location could not be opened.");
                copied = DocumentPayload.copyTo(staged, output);
            }
            if (copied != staged.length) throw new IllegalStateException("The document write was incomplete.");

            stage = "verify";
            long reportedSize = documentSize(resolver, uri);
            boolean verifiedByReadback = false;
            InputStream readback = null;
            try {
                readback = resolver.openInputStream(uri);
            } catch (Exception ignored) {
                // Some document providers permit writes but do not expose read access.
            }
            if (readback != null) {
                DocumentPayload.verifyReadback(staged, readback);
                verifiedByReadback = true;
            }
            if (!verifiedByReadback && reportedSize != staged.length)
                throw new IllegalStateException("The selected location could not confirm the complete document.");

            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("uri", uri.toString());
            response.put("fileName", displayName(uri));
            response.put("bytes", staged.length);
            call.resolve(response);
            Log.i(TAG, "stage=saved bytes=" + staged.length + " verified=" +
                (verifiedByReadback ? "readback" : "provider-size"));
        } catch (Exception error) {
            if (uri != null) {
                try {
                    getContext().getContentResolver().delete(uri, null, null);
                } catch (Exception ignored) {
                    Log.w(TAG, "stage=cleanup error=" + ignored.getClass().getSimpleName());
                }
            }
            Log.w(TAG, "stage=" + stage + " bytes=" +
                (staged == null ? "unknown" : staged.length) + " error=" + error.getClass().getSimpleName());
            if (call != null) call.reject("Could not verify the saved document. The export was not confirmed.");
        } finally {
            DocumentPayload.cleanup(staged);
            if (staged == null) DocumentPayload.cleanup(directory, token);
            PICKER_IN_PROGRESS.set(false);
        }
    }

    @PluginMethod
    public void openDocument(PluginCall call) {
        if (!PICKER_IN_PROGRESS.compareAndSet(false, true)) {
            call.reject("A document picker is already in progress.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/html" });
        try {
            startActivityForResult(call, intent, "openDocumentResult");
        } catch (Exception error) {
            PICKER_IN_PROGRESS.set(false);
            call.reject("Could not open the document picker.");
        }
    }

    @ActivityCallback
    private void openDocumentResult(PluginCall call, ActivityResult result) {
        try {
            if (result.getResultCode() == Activity.RESULT_CANCELED) {
                JSObject response = new JSObject();
                response.put("cancelled", true);
                call.resolve(response);
                return;
            }
            Uri uri = result.getData() == null ? null : result.getData().getData();
            if (uri == null) {
                call.reject("The system picker did not return a document location");
                return;
            }
            try (InputStream input = getContext().getContentResolver().openInputStream(uri);
                 java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                if (input == null) throw new IllegalStateException("Could not open selected document");
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > DocumentPayload.MAX_TRAIL_BYTES)
                        throw new IllegalArgumentException("Choose a trail file smaller than 13 MB.");
                    output.write(buffer, 0, count);
                }
                JSObject response = new JSObject();
                response.put("cancelled", false);
                response.put("base64", android.util.Base64.encodeToString(output.toByteArray(), android.util.Base64.NO_WRAP));
                response.put("fileName", displayName(uri));
                response.put("mimeType", getContext().getContentResolver().getType(uri));
                call.resolve(response);
            }
        } catch (Exception error) {
            if (call != null) call.reject("Could not open the selected document");
        } finally {
            PICKER_IN_PROGRESS.set(false);
        }
    }

    private File stagingDirectory() {
        return new File(getContext().getNoBackupFilesDir(), "pending-document-saves");
    }

    private long documentSize(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (column >= 0 && !cursor.isNull(column)) return cursor.getLong(column);
            }
        } catch (Exception ignored) {
        }
        return -1;
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) return cursor.getString(column);
            }
        } catch (Exception ignored) {
        }
        return uri.getLastPathSegment();
    }
}
