package com.soupytag.app;

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
        synchronized (FirebaseAnalyticsStartup.CONSENT_LOCK) {
            boolean configured = FirebaseAnalyticsStartup.isConfigured(getContext());
            String consent = configured ? FirebaseAnalyticsStartup.readConsent(getContext()) : "denied";
            JSObject result = new JSObject();
            result.put("configured", configured);
            result.put("consent", consent);
            result.put("confirmed", !configured || FirebaseAnalyticsStartup.isConsentStorageAvailable(getContext()));
            call.resolve(result);
        }
    }

    @PluginMethod
    public void setConsent(PluginCall call) {
        String requested = call.getString("consent");
        if (!"granted".equals(requested) && !"denied".equals(requested)) {
            call.reject("Invalid analytics consent");
            return;
        }

        synchronized (FirebaseAnalyticsStartup.CONSENT_LOCK) {
            boolean configured = FirebaseAnalyticsStartup.isConfigured(getContext());
            boolean confirmed;
            String applied;
            String error = null;

            if ("denied".equals(requested)) {
                boolean persisted = FirebaseAnalyticsStartup.persistConsent(getContext(), "denied");
                boolean disabled = FirebaseAnalyticsStartup.disableCollectionIfInitialized(getContext());
                confirmed = FirebaseAnalyticsStartup.isRevocationConfirmed(
                    configured,
                    persisted,
                    disabled
                );
                applied = "denied";
                if (!disabled) error = "disable";
                else if (!persisted && configured) error = "storage";
            } else if (!configured) {
                boolean disabled = FirebaseAnalyticsStartup.disableCollectionIfInitialized(getContext());
                confirmed = disabled;
                applied = "denied";
                if (!disabled) error = "disable";
            } else if (!FirebaseAnalyticsStartup.persistConsent(getContext(), "granted")) {
                boolean disabled = FirebaseAnalyticsStartup.disableCollectionIfInitialized(getContext());
                boolean deniedPersisted = FirebaseAnalyticsStartup.persistConsent(getContext(), "denied");
                confirmed = disabled && deniedPersisted;
                applied = "denied";
                error = "storage";
            } else if (FirebaseAnalyticsStartup.initializeAfterConsent(getContext())) {
                confirmed = true;
                applied = "granted";
            } else {
                boolean disabled = FirebaseAnalyticsStartup.disableCollectionIfInitialized(getContext());
                boolean deniedPersisted = FirebaseAnalyticsStartup.persistConsent(getContext(), "denied");
                confirmed = disabled && deniedPersisted;
                applied = "denied";
                error = "initialize";
            }

            JSObject result = new JSObject();
            result.put("configured", configured);
            result.put("consent", applied);
            result.put("confirmed", confirmed);
            if (error != null) result.put("error", error);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void logEvent(PluginCall call) {
        String name = call.getString("name");
        JSObject parameters = call.getObject("parameters");
        if (!FirebaseAnalyticsEventPolicy.isAllowed(name, parameters)) {
            call.resolve();
            return;
        }

        synchronized (FirebaseAnalyticsStartup.CONSENT_LOCK) {
            String consent = FirebaseAnalyticsStartup.readConsent(getContext());
            FirebaseAnalytics analytics = FirebaseAnalyticsStartup.shouldCollect(
                consent,
                FirebaseAnalyticsStartup.isConfigured(getContext())
            )
                ? FirebaseAnalyticsStartup.getInitializedAnalytics(getContext())
                : null;
            if (!FirebaseAnalyticsStartup.shouldCollect(consent, analytics != null)) {
                call.resolve();
                return;
            }

            analytics.logEvent(name, FirebaseAnalyticsEventPolicy.toBundle(parameters));
            call.resolve();
        }
    }
}
