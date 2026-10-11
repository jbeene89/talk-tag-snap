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
    private static final DocumentRequestGate REQUEST_GATE = new DocumentRequestGate();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void saveDocument(PluginCall call) {
        if (!isValidRequestId(call.getString("requestId"))) {
            call.reject("The document request is invalid.");
            return;
        }
        String requestId = call.getString("requestId");
        if (!beginPicker("saveDocument", requestId)) {
            call.reject("A document save is already in progress.");
            return;
        }

        try {
            DocumentIo.execute(() -> stageAndLaunchPicker(call));
        } catch (RejectedExecutionException error) {
            finishPicker("saveDocument", requestId);
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
                finishPicker("saveDocument", requestId);
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
                    finishPicker("saveDocument", tokenRequestId(call));
                });
            } catch (RejectedExecutionException rejected) {
                finishPicker("saveDocument", tokenRequestId(call));
            }
            call.reject("Could not open the document picker.");
        }
    }

    @ActivityCallback
    private void saveDocumentResult(PluginCall call, ActivityResult result) {
        if (!validatePickerCallback(call, "saveDocument")) return;
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
                writeAndVerify(call, resultCode, destinationCreatedByPicker, token, uri, tokenRequestId(call))
            );
        } catch (RejectedExecutionException error) {
            Log.w(TAG, "stage=queue bytes=unknown error=" + error.getClass().getSimpleName());
            finishSaveWithoutDestination(call, token, false);
        }
    }

    private void finishSaveWithoutDestination(PluginCall call, String token, boolean cancelled) {
        String requestId = tokenRequestId(call);
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
                    finishPicker("saveDocument", requestId);
                });
            });
        } catch (RejectedExecutionException error) {
            mainHandler.post(() -> {
                if (cancelled && call != null) {
                    call.resolve(requestResult(call, true, false, "cancelled"));
                } else if (call != null) {
                    call.resolve(requestResult(call, false, false, "save_failed"));
                }
                finishPicker("saveDocument", requestId);
            });
        }
    }

    private void writeAndVerify(
        PluginCall call,
        int resultCode,
        boolean destinationCreatedByPicker,
        String token,
        Uri uri,
        String requestId
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
                response.put("requestId", requestId);
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
            mainHandler.post(() -> finishPicker("saveDocument", requestId));
        }
    }

    @PluginMethod
    public void openDocument(PluginCall call) {
        String requestId = call.getString("requestId");
        if (!isValidRequestId(requestId)) {
            call.reject("The document request is invalid.");
            return;
        }
        if (!beginPicker("openDocument", requestId)) {
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
            finishPicker("openDocument", tokenRequestId(call));
            call.reject("Could not open the document picker.");
        }
    }

    @ActivityCallback
    private void openDocumentResult(PluginCall call, ActivityResult result) {
        if (!validatePickerCallback(call, "openDocument")) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            mainHandler.post(() -> {
                if (result.getResultCode() == Activity.RESULT_CANCELED && call != null) {
                    call.resolve(requestResult(call, true, false, "cancelled"));
                } else if (call != null) {
                    call.resolve(requestResult(call, false, false, "open_failed"));
                }
                finishPicker("openDocument", tokenRequestId(call));
            });
            return;
        }

        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            mainHandler.post(() -> {
                if (call != null) call.resolve(requestResult(call, false, false, "open_failed"));
                finishPicker("openDocument", tokenRequestId(call));
            });
            return;
        }
        String requestId = tokenRequestId(call);
        try {
            DocumentIo.execute(() -> readOpenedDocument(call, requestId, uri));
        } catch (RejectedExecutionException error) {
            Log.w(TAG, "stage=open-queue bytes=0 error=" + error.getClass().getSimpleName());
            mainHandler.post(() -> {
                if (call != null) call.resolve(requestResult(call, false, false, "open_failed"));
                finishPicker("openDocument", requestId);
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
                    finishPicker("openDocument", requestId);
                }
            });
        } catch (Exception error) {
            Log.w(TAG, "stage=open-read bytes=unknown error=" + error.getClass().getSimpleName());
            mainHandler.post(() -> {
                if (call != null) call.resolve(requestResult(requestId, false, false, "open_failed"));
                finishPicker("openDocument", requestId);
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

    private boolean beginPicker(String method, String requestId) {
        if (!PICKER_IN_PROGRESS.compareAndSet(false, true)) return false;
        if (REQUEST_GATE.begin(method, requestId)) return true;
        PICKER_IN_PROGRESS.set(false);
        return false;
    }

    private void finishPicker(String method, String requestId) {
        if (REQUEST_GATE.finish(method, requestId)) PICKER_IN_PROGRESS.set(false);
    }

    private void finishUncorrelatedPicker(String method) {
        if (REQUEST_GATE.finishUncorrelatedCallback(method)) PICKER_IN_PROGRESS.set(false);
    }

    private boolean validatePickerCallback(PluginCall call, String method) {
        if (call == null) {
            finishUncorrelatedPicker(method);
            return false;
        }
        if (!"SoupyDocument".equals(call.getPluginId()) || !method.equals(call.getMethodName())) {
            return false;
        }

        String requestId = tokenRequestId(call);
        if (!isValidRequestId(requestId)) {
            finishUncorrelatedPicker(method);
            call.resolve(requestResult((String) null, false, false,
                method.equals("openDocument") ? "open_failed" : "save_failed"));
            return false;
        }
        if (!REQUEST_GATE.correlate(method, requestId)) return false;
        PICKER_IN_PROGRESS.set(true);
        return true;
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
