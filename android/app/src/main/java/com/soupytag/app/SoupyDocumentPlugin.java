package com.soupytag.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "SoupyDocument")
public class SoupyDocumentPlugin extends Plugin {
    private static final int MAX_DOCUMENT_BYTES = 12 * 1024 * 1024 + 256 * 1024;
    private final Map<PluginCall, String> pendingDocuments = new ConcurrentHashMap<>();

    @PluginMethod
    public void saveDocument(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType");
        String base64 = call.getString("base64");
        if (fileName == null || mimeType == null || base64 == null) {
            call.reject("A filename, MIME type, and document are required");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        pendingDocuments.put(call, base64);
        startActivityForResult(call, intent, "saveDocumentResult");
    }

    @ActivityCallback
    private void saveDocumentResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            pendingDocuments.remove(call);
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            pendingDocuments.remove(call);
            call.reject("The system picker did not return a document location");
            return;
        }
        try {
            String base64 = pendingDocuments.remove(call);
            if (base64 == null) throw new IllegalStateException("The pending document was lost");
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (output == null) throw new IllegalStateException("Could not open document location");
                output.write(bytes);
            }
            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("uri", uri.toString());
            response.put("fileName", displayName(uri));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not save the selected document", error);
        }
    }

    @PluginMethod
    public void openDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/html" });
        startActivityForResult(call, intent, "openDocumentResult");
    }

    @ActivityCallback
    private void openDocumentResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            call.reject("The system picker did not return a document");
            return;
        }
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalStateException("Could not open selected document");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > MAX_DOCUMENT_BYTES)
                    throw new IllegalArgumentException("Choose a trail file smaller than 13 MB.");
                output.write(buffer, 0, count);
            }
            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            response.put("fileName", displayName(uri));
            response.put("mimeType", getContext().getContentResolver().getType(uri));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not open the selected document", error);
        }
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
