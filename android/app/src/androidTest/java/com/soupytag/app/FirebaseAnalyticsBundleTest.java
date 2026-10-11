package com.soupytag.app;

import static org.junit.Assert.assertEquals;

import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.JSObject;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FirebaseAnalyticsBundleTest {
    @Test
    public void convertsTimestampBooleanToFirebaseSupportedLong() throws Exception {
        JSObject parameters = new JSObject();
        parameters.put("method", "download");
        parameters.put("tag_count", 3);
        parameters.put("timestamp_included", true);

        Bundle bundle = FirebaseAnalyticsEventPolicy.toBundle(parameters);

        assertEquals("download", bundle.getString("method"));
        assertEquals(3L, bundle.getLong("tag_count"));
        assertEquals(1L, bundle.getLong("timestamp_included"));

        parameters.put("timestamp_included", false);
        bundle = FirebaseAnalyticsEventPolicy.toBundle(parameters);
        assertEquals(0L, bundle.getLong("timestamp_included"));
    }
}
