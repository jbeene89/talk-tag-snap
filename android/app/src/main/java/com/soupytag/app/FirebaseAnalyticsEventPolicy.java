package com.soupytag.app;

import android.os.Bundle;

import com.getcapacitor.JSObject;

import java.util.Iterator;

final class FirebaseAnalyticsEventPolicy {
    private FirebaseAnalyticsEventPolicy() {}

    static boolean isAllowed(String name, JSObject parameters) {
        if ("app_opened".equals(name)) return parameters == null || parameters.length() == 0;
        if ("tag_created".equals(name)) {
            if (parameters == null || parameters.length() != 1) return false;
            String method = parameters.optString("method", "");
            return "tap".equals(method) || "box".equals(method) || "redact".equals(method);
        }
        if ("report_exported".equals(name)) {
            if (parameters == null || parameters.length() != 3) return false;
            String method = parameters.optString("method", "");
            Object tagCountValue = parameters.opt("tag_count");
            if (!(tagCountValue instanceof Number)) return false;
            double tagCount = ((Number) tagCountValue).doubleValue();
            Object timestampIncluded = parameters.opt("timestamp_included");
            return ("download".equals(method)
                || "share".equals(method)
                || "share_fallback_save".equals(method))
                && tagCount >= 0
                && tagCount == Math.floor(tagCount)
                && tagCount <= 1000
                && timestampIncluded instanceof Boolean;
        }
        return false;
    }

    static Bundle toBundle(JSObject parameters) {
        Bundle bundle = new Bundle();
        if (parameters == null) return bundle;

        Iterator<String> keys = parameters.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = parameters.opt(key);
            if (value instanceof String) {
                bundle.putString(key, (String) value);
            } else if (value instanceof Boolean && "timestamp_included".equals(key)) {
                bundle.putLong(key, (Boolean) value ? 1L : 0L);
            } else if (value instanceof Integer) {
                bundle.putLong(key, ((Integer) value).longValue());
            } else if (value instanceof Long) {
                bundle.putLong(key, (Long) value);
            }
        }
        return bundle;
    }
}
