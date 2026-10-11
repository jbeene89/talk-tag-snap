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
        boolean configured = FirebaseAnalyticsStartup.hasConfiguration(getContext());
        boolean revoked = FirebaseAnalyticsStartup.readRevocation(getContext());
        String consent = configured ? FirebaseAnalyticsStartup.readConsent(getContext()) : "denied";
        if (revoked) consent = "denied";
        JSObject result = new JSObject();
        result.put("configured", configured);
        result.put("consent", consent);
        result.put(
            "collectionEnabled",
            FirebaseAnalyticsStartup.shouldCollect(
                consent,
                configured,
                FirebaseAnalyticsStartup.runtimeCollectionAllowed()
            )
        );
        call.resolve(result);
    }

    @PluginMethod
    public void setConsent(PluginCall call) {
        String requested = call.getString("consent");
        if (!"granted".equals(requested) && !"denied".equals(requested)) {
            call.reject("Invalid analytics consent");
            return;
        }

        JSObject result = new JSObject();
        boolean configured = FirebaseAnalyticsStartup.hasConfiguration(getContext());
        if ("denied".equals(requested)) {
            FirebaseAnalyticsStartup.denyRuntimeCollection();
            boolean disabled = true;
            FirebaseAnalytics analytics = FirebaseAnalyticsStartup.initializedAnalytics(getContext());
            if (analytics != null) {
                try {
                    analytics.setAnalyticsCollectionEnabled(false);
                    analytics.setConsent(FirebaseAnalyticsStartup.consentMap(false));
                } catch (RuntimeException ignored) {
                    disabled = false;
                }
            }
            boolean revocationSaved =
                FirebaseAnalyticsStartup.persistRevocation(getContext(), true);
            boolean consentSaved = FirebaseAnalyticsStartup.persistConsent(getContext(), "denied");
            boolean persisted =
                FirebaseAnalyticsStartup.revocationPersisted(consentSaved, revocationSaved);
            result.put("configured", configured);
            result.put(
                "consent",
                persisted ? "denied" : FirebaseAnalyticsStartup.readConsent(getContext())
            );
            result.put("collectionDisabled", disabled);
            result.put("persisted", persisted);
            result.put("collectionEnabled", false);
            call.resolve(result);
            return;
        }

        if (!configured) {
            FirebaseAnalyticsStartup.denyRuntimeCollection();
            result.put("configured", false);
            result.put("consent", "denied");
            result.put("collectionEnabled", false);
            result.put("collectionDisabled", true);
            result.put("persisted", false);
            call.resolve(result);
            return;
        }

        boolean consentSaved = FirebaseAnalyticsStartup.persistConsent(getContext(), "granted");
        boolean revocationCleared = consentSaved &&
            FirebaseAnalyticsStartup.persistRevocation(getContext(), false);
        FirebaseAnalytics analytics = revocationCleared
            ? FirebaseAnalyticsStartup.initializeWithConsent(getContext())
            : null;
        boolean enabled = analytics != null;
        if (!enabled) {
            FirebaseAnalyticsStartup.denyRuntimeCollection();
            boolean deniedSaved = FirebaseAnalyticsStartup.persistConsent(getContext(), "denied");
            boolean revocationSaved =
                FirebaseAnalyticsStartup.persistRevocation(getContext(), true);
            result.put("consent", "denied");
            result.put(
                "persisted",
                FirebaseAnalyticsStartup.revocationPersisted(deniedSaved, revocationSaved)
            );
        } else {
            result.put("consent", "granted");
            result.put("persisted", true);
        }
        result.put("configured", true);
        result.put("collectionEnabled", enabled);
        result.put("collectionDisabled", !enabled);
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

        FirebaseAnalytics analytics = FirebaseAnalyticsStartup.initializedAnalytics(getContext());
        String consent = FirebaseAnalyticsStartup.readConsent(getContext());
        if (!FirebaseAnalyticsStartup.shouldCollect(
            consent,
            analytics != null,
            FirebaseAnalyticsStartup.runtimeCollectionAllowed()
        ) || FirebaseAnalyticsStartup.readRevocation(getContext())) {
            call.resolve();
            return;
        }

        analytics.logEvent(name, FirebaseAnalyticsEventPolicy.toBundle(parameters));
        call.resolve();
    }
}
