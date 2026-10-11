package com.soupytag.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.getcapacitor.JSObject;

import org.junit.Test;

public class FirebaseAnalyticsEventPolicyTest {
    @Test
    public void rejectsEventsBeforeConsentOrWithoutConfiguration() {
        assertFalse(FirebaseAnalyticsStartup.shouldCollect("unset", true));
        assertFalse(FirebaseAnalyticsStartup.shouldCollect("denied", true));
        assertFalse(FirebaseAnalyticsStartup.shouldCollect("granted", false));
        assertTrue(FirebaseAnalyticsStartup.shouldCollect("granted", true));
    }

    @Test
    public void acceptsOnlyAllowlistedEventsAndProperties() throws Exception {
        assertTrue(FirebaseAnalyticsEventPolicy.isAllowed("app_opened", new JSObject()));

        JSObject tag = new JSObject();
        tag.put("method", "box");
        assertTrue(FirebaseAnalyticsEventPolicy.isAllowed("tag_created", tag));
        tag.put("label", "private text");
        assertFalse(FirebaseAnalyticsEventPolicy.isAllowed("tag_created", tag));

        JSObject export = new JSObject();
        export.put("method", "download");
        export.put("tag_count", 3);
        export.put("timestamp_included", false);
        assertTrue(FirebaseAnalyticsEventPolicy.isAllowed("report_exported", export));
        export.put("tag_count", "3");
        assertFalse(FirebaseAnalyticsEventPolicy.isAllowed("report_exported", export));
        export.put("tag_count", 3);
        export.put("filename", "private.jpg");
        assertFalse(FirebaseAnalyticsEventPolicy.isAllowed("report_exported", export));
        assertFalse(FirebaseAnalyticsEventPolicy.isAllowed("feedback_sent", new JSObject()));
    }
}
