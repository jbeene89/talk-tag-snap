package com.soupytag.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
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
import java.util.concurrent.RejectedExecutionException;

@CapacitorPlugin(name = "SoupyDocument")
public class SoupyDocumentPlugin extends Plugin {
    private static final String TAG = "SoupyDocument";
    private static final AtomicBoolean PICKER_IN_PROGRESS = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void saveDocument(PluginCall call) {
        if (!isValidRequestId(call.getString("requestId"))) {
            call.reject("The document request is invalid.");
            return;
        }
        if (!PICKER_IN_PROGRESS.compareAndSet(false, true)) {
            call.reject("A document save is already in progress.");
            return;
        }

        try {
            DocumentIo.execute(() -> stageAndLaunchPicker(call));
        } catch (RejectedExecutionException error) {
            PICKER_IN_PROGRESS.set(false);
            call.reject("Another document operation is still finishing. Try again.");
        }
    }

    private void stageAndLaunchPicker(PluginCall call) {
        String stage = "validate";
        String requestId = call.getString("requestId");
        DocumentPayload.Staged staged = null;
        try {
            String fileName = DocumentPayload.validateFileName(
                call.getString("fileName"),
                call.getString("mimeType")
            );
            String mimeType = call.getString("mimeType");
            String base64 = call.getString("base64");
            File directory = stagingDirectory();
            DocumentPayload.cleanupStale(directory, System.currentTimeMillis());

            stage = "stage";
            staged = DocumentPayload.stage(directory, base64, fileName, mimeType);
            DocumentPayload.Staged ready = staged;
            while (call.getData().length() > 0) call.getData().remove(call.getData().keys().next());
            call.getData().put("stagedToken", ready.token);
            call.getData().put("requestId", requestId);
            Log.i(TAG, "stage=ready bytes=" + ready.length + " mime=" + ready.mimeType);
            mainHandler.post(() -> launchSavePicker(call, ready, fileName));
        } catch (Exception error) {
            DocumentPayload.cleanup(staged);
            String bytes = error instanceof DocumentPayload.StagingException
                ? Long.toString(((DocumentPayload.StagingException) error).bytes)
                : "unknown";
            Log.w(TAG, "stage=" + stage + " bytes=" + bytes + " error=" + error.getClass().getSimpleName());
            mainHandler.post(() -> {
                PICKER_IN_PROGRESS.set(false);
                call.reject("Could not prepare the document for saving.");
            });
        }
    }

    private void launchSavePicker(PluginCall call, DocumentPayload.Staged staged, String fileName) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(staged.mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        try {
            startActivityForResult(call, intent, "saveDocumentResult");
        } catch (Exception error) {
            Log.w(TAG, "stage=picker bytes=" + staged.length + " error=" + error.getClass().getSimpleName());
            try {
                DocumentIo.execute(() -> {
                    DocumentPayload.cleanup(staged);
                    PICKER_IN_PROGRESS.set(false);
                });
            } catch (RejectedExecutionException rejected) {
                PICKER_IN_PROGRESS.set(false);
            }
            call.reject("Could not open the document picker.");
        }
    }

    @ActivityCallback
    private void saveDocumentResult(PluginCall call, ActivityResult result) {
        String token = call == null ? null : call.getString("stagedToken");
        if (result.getResultCode() != Activity.RESULT_OK) {
            boolean cancelled = result.getResultCode() == Activity.RESULT_CANCELED;
            finishSaveWithoutDestination(call, token, cancelled);
            return;
        }

        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            finishSaveWithoutDestination(call, token, false);
            return;
        }
        int resultCode = result.getResultCode();
        boolean destinationCreatedByPicker = resultCode == Activity.RESULT_OK && uri != null;
        try {
            DocumentIo.execute(() ->
                writeAndVerify(call, resultCode, destinationCreatedByPicker, token, uri)
            );
        } catch (RejectedExecutionException error) {
            Log.w(TAG, "stage=queue bytes=unknown error=" + error.getClass().getSimpleName());
            finishSaveWithoutDestination(call, token, false);
        }
    }

    private void finishSaveWithoutDestination(PluginCall call, String token, boolean cancelled) {
        try {
            DocumentIo.execute(() -> {
                DocumentPayload.cleanup(stagingDirectory(), token);
                mainHandler.post(() -> {
                    if (cancelled && call != null) {
                        Log.i(TAG, "stage=cancelled bytes=0");
                        call.resolve(requestResult(call, true, false, "cancelled"));
                    } else if (call != null) {
                        call.resolve(requestResult(call, false, false, "save_failed"));
                    }
                    PICKER_IN_PROGRESS.set(false);
                });
            });
        } catch (RejectedExecutionException error) {
            mainHandler.post(() -> {
                if (cancelled && call != null) {
                    call.resolve(requestResult(call, true, false, "cancelled"));
                } else if (call != null) {
                    call.resolve(requestResult(call, false, false, "save_failed"));
                }
                PICKER_IN_PROGRESS.set(false);
            });
        }
    }

    private void writeAndVerify(
        PluginCall call,
        int resultCode,
        boolean destinationCreatedByPicker,
        String token,
        Uri uri
    ) {
        DocumentPayload.Staged staged = null;
        boolean restoredRequest = false;
        boolean writeAttempted = false;
        String stage = "restore";
        try {
            if (resultCode != Activity.RESULT_OK)
                throw new IllegalStateException("The document picker did not confirm a new destination.");
            if (call == null || !isValidToken(token))
                throw new IllegalStateException("The staged save request is invalid.");
            staged = DocumentPayload.restore(stagingDirectory(), token);
            restoredRequest = true;
            ContentResolver resolver = getContext().getContentResolver();
            stage = "write";
            writeAttempted = true;
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

            String savedName = displayName(uri);
            long savedBytes = staged.length;
            boolean readbackVerified = verifiedByReadback;
            mainHandler.post(() -> {
                JSObject response = new JSObject();
                response.put("requestId", tokenRequestId(call));
                response.put("ok", true);
                response.put("cancelled", false);
                response.put("uri", uri.toString());
                response.put("fileName", savedName);
                response.put("bytes", savedBytes);
                call.resolve(response);
                Log.i(TAG, "stage=saved bytes=" + savedBytes + " verified=" +
                    (readbackVerified ? "readback" : "provider-size"));
            });
        } catch (Exception error) {
            if (DocumentPayload.mayDeleteDestination(
                resultCode,
                destinationCreatedByPicker,
                restoredRequest,
                writeAttempted
            )) {
                try {
                    getContext().getContentResolver().delete(uri, null, null);
                } catch (Exception ignored) {
                    Log.w(TAG, "stage=cleanup error=" + ignored.getClass().getSimpleName());
                }
            }
            Log.w(TAG, "stage=" + stage + " bytes=" +
                (staged == null ? "unknown" : staged.length) + " error=" + error.getClass().getSimpleName());
            mainHandler.post(() -> {
                if (call != null) call.resolve(requestResult(call, false, false, "save_failed"));
            });
        } finally {
            DocumentPayload.cleanup(staged);
            if (staged == null) DocumentPayload.cleanup(stagingDirectory(), token);
            mainHandler.post(() -> PICKER_IN_PROGRESS.set(false));
        }
    }

    @PluginMethod
    public void openDocument(PluginCall call) {
        if (!isValidRequestId(call.getString("requestId"))) {
            call.reject("The document request is invalid.");
            return;
        }
        if (!PICKER_IN_PROGRESS.compareAndSet(false, true)) {
            call.reject("A document picker is already in progress.");
            return;
        }
        mainHandler.post(() -> launchOpenPicker(call));
    }

    private void launchOpenPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/html" });
        try {
            startActivityForResult(call, intent, "openDocumentResult");
        } catch (Exception error) {
            Log.w(TAG, "stage=open-picker bytes=0 error=" + error.getClass().getSimpleName());
            PICKER_IN_PROGRESS.set(false);
            call.reject("Could not open the document picker.");
        }
    }

    @ActivityCallback
    private void openDocumentResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK) {
            mainHandler.post(() -> {
                if (result.getResultCode() == Activity.RESULT_CANCELED && call != null) {
                    call.resolve(requestResult(call, true, false, "cancelled"));
                } else if (call != null) {
                    call.resolve(requestResult(call, false, false, "open_failed"));
                }
                PICKER_IN_PROGRESS.set(false);
            });
            return;
        }

        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            mainHandler.post(() -> {
                if (call != null) call.resolve(requestResult(call, false, false, "open_failed"));
                PICKER_IN_PROGRESS.set(false);
            });
            return;
        }
        try {
            String requestId = call.getString("requestId");
            DocumentIo.execute(() -> readOpenedDocument(call, requestId, uri));
        } catch (RejectedExecutionException error) {
            Log.w(TAG, "stage=open-queue bytes=0 error=" + error.getClass().getSimpleName());
            mainHandler.post(() -> {
                if (call != null) call.resolve(requestResult(call, false, false, "open_failed"));
                PICKER_IN_PROGRESS.set(false);
            });
        }
    }

    private void readOpenedDocument(PluginCall call, String requestId, Uri uri) {
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
            String base64 = android.util.Base64.encodeToString(output.toByteArray(), android.util.Base64.NO_WRAP);
            String name = displayName(uri);
            String mimeType = getContext().getContentResolver().getType(uri);
            long bytes = output.size();
            JSObject response = new JSObject();
            response.put("requestId", requestId);
            response.put("ok", true);
            response.put("cancelled", false);
            response.put("base64", base64);
            response.put("fileName", name);
            response.put("mimeType", mimeType);
            Log.i(TAG, "stage=open-read bytes=" + bytes + " mime=" + mimeType);
            mainHandler.post(() -> {
                try {
                    if (call != null) call.resolve(response);
                } finally {
                    PICKER_IN_PROGRESS.set(false);
                }
            });
        } catch (Exception error) {
            Log.w(TAG, "stage=open-read bytes=unknown error=" + error.getClass().getSimpleName());
            mainHandler.post(() -> {
                if (call != null) call.resolve(requestResult(requestId, false, false, "open_failed"));
                PICKER_IN_PROGRESS.set(false);
            });
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

    private boolean isValidToken(String token) {
        return token != null && token.matches("[0-9a-fA-F-]{36}");
    }

    private boolean isValidRequestId(String requestId) {
        return requestId != null &&
            requestId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    }

    private String tokenRequestId(PluginCall call) {
        return call == null ? null : call.getString("requestId");
    }

    private JSObject requestResult(PluginCall call, boolean cancelled, boolean ok, String errorCode) {
        return requestResult(tokenRequestId(call), cancelled, ok, errorCode);
    }

    private JSObject requestResult(String requestId, boolean cancelled, boolean ok, String errorCode) {
        JSObject response = new JSObject();
        if (requestId != null) response.put("requestId", requestId);
        response.put("ok", ok);
        response.put("cancelled", cancelled);
        if (!ok && !cancelled) response.put("errorCode", errorCode);
        return response;
    }
}
