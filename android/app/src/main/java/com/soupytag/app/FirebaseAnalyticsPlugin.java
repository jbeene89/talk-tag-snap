package com.soupytag.app;

import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.analytics.FirebaseAnalytics;

@CapacitorPlugin(name = "FirebaseAnalyticsBridge")
public class FirebaseAnalyticsPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        FirebaseAnalytics analytics = FirebaseAnalyticsStartup.getAnalytics(getContext());
        boolean configured = analytics != null;
        String consent = configured ? FirebaseAnalyticsStartup.readConsent(getContext()) : "denied";
        JSObject result = new JSObject();
        result.put("configured", configured);
        result.put("consent", consent);
        call.resolve(result);
    }

    @PluginMethod
    public void setConsent(PluginCall call) {
        String requested = call.getString("consent");
        if (!"granted".equals(requested) && !"denied".equals(requested)) {
            call.reject("Invalid analytics consent");
            return;
        }

        FirebaseAnalytics analytics = FirebaseAnalyticsStartup.getAnalytics(getContext());
        boolean configured = analytics != null;
        String applied = configured ? requested : "denied";
        if ("denied".equals(applied) && analytics != null) {
            analytics.setAnalyticsCollectionEnabled(false);
        }
        boolean persisted = FirebaseAnalyticsStartup.persistConsent(getContext(), applied);
        if (!persisted) applied = "denied";

        if (analytics != null) {
            analytics.setConsent(FirebaseAnalyticsStartup.consentMap("granted".equals(applied)));
            analytics.setAnalyticsCollectionEnabled("granted".equals(applied) && persisted);
        }

        JSObject result = new JSObject();
        result.put("configured", configured && persisted);
        result.put("consent", applied);
        call.resolve(result);
    }

    @PluginMethod
    public void logEvent(PluginCall call) {
        String name = call.getString("name");
        JSObject parameters = call.getObject("parameters");
        if (!FirebaseAnalyticsEventPolicy.isAllowed(name, parameters)) {
            call.resolve();
            return;
        }

        FirebaseAnalytics analytics = FirebaseAnalyticsStartup.getAnalytics(getContext());
        String consent = FirebaseAnalyticsStartup.readConsent(getContext());
        if (!FirebaseAnalyticsStartup.shouldCollect(consent, analytics != null)) {
            call.resolve();
            return;
        }

        Bundle bundle = new Bundle();
        if (parameters != null) {
            for (String key : parameters.keySet()) {
                Object value = parameters.opt(key);
                if (value instanceof String) bundle.putString(key, (String) value);
                else if (value instanceof Boolean) bundle.putBoolean(key, (Boolean) value);
                else if (value instanceof Integer) bundle.putLong(key, ((Integer) value).longValue());
                else if (value instanceof Long) bundle.putLong(key, (Long) value);
            }
        }
        analytics.logEvent(name, bundle);
        call.resolve();
    }
}
