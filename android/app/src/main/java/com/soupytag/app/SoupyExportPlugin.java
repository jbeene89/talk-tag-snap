package com.soupytag.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "SoupyExport")
public class SoupyExportPlugin extends Plugin {
    @PluginMethod
    public void saveImage(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("MediaStore export requires Android 10 or newer");
            return;
        }

        String base64 = call.getString("base64");
        String requestedName = call.getString("fileName", "soupytag.jpg");
        String mimeType = call.getString("mimeType", "image/jpeg");
        if (base64 == null || base64.isEmpty()) {
            call.reject("Image data is required");
            return;
        }

        String fileName = requestedName.replaceAll("[^a-zA-Z0-9._-]", "_");
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        values.put(
            MediaStore.Images.Media.RELATIVE_PATH,
            Environment.DIRECTORY_PICTURES + "/SoupyTag"
        );
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Could not create image destination");

            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (OutputStream output = resolver.openOutputStream(uri)) {
                if (output == null) throw new IllegalStateException("Could not open image destination");
                output.write(bytes);
            }

            ContentValues published = new ContentValues();
            published.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, published, null, null);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            if (uri != null) resolver.delete(uri, null, null);
            call.reject("Could not save image", error);
        }
    }
}
