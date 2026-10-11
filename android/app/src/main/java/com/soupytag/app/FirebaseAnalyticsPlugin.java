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
        boolean configured = FirebaseAnalyticsStartup.isConfigured(getContext());
        JSObject result = new JSObject();
        result.put("configured", configured);
        String consent = FirebaseAnalyticsStartup.readConsent(getContext());
        boolean consentPersisted = "granted".equals(consent) || "denied".equals(consent);
        boolean collectionConfirmed = FirebaseAnalyticsStartup.isCollectionStateConfirmed();
        result.put("consent", consent);
        result.put("collectionEnabled", FirebaseAnalyticsStartup.isCollectionEnabled());
        result.put("collectionConfirmed", collectionConfirmed);
        result.put("consentPersisted", consentPersisted);
        result.put("confirmed", collectionConfirmed && consentPersisted);
        call.resolve(result);
    }

    @PluginMethod
    public void setConsent(PluginCall call) {
        String requested = call.getString("consent");
        if (!"granted".equals(requested) && !"denied".equals(requested)) {
            call.reject("Invalid analytics consent");
            return;
        }

        boolean configured = FirebaseAnalyticsStartup.isConfigured(getContext());
        FirebaseAnalyticsStartup.ConsentResult consentResult =
            FirebaseAnalyticsStartup.updateConsent(
                requested,
                configured,
                consent -> FirebaseAnalyticsStartup.persistConsent(getContext(), consent),
                enabled -> FirebaseAnalyticsStartup.setCollectionEnabled(getContext(), enabled)
            );
        JSObject result = new JSObject();
        result.put("configured", consentResult.configured);
        result.put("consent", consentResult.consent);
        result.put("collectionEnabled", consentResult.collectionEnabled);
        result.put("collectionConfirmed", consentResult.collectionConfirmed);
        result.put("consentPersisted", consentResult.consentPersisted);
        result.put("confirmed", consentResult.confirmed);
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

        String consent = FirebaseAnalyticsStartup.readConsent(getContext());
        if (
            !FirebaseAnalyticsStartup.isCollectionEnabled() ||
            !FirebaseAnalyticsStartup.isCollectionStateConfirmed() ||
            !FirebaseAnalyticsStartup.shouldCollect(
                consent,
                FirebaseAnalyticsStartup.isConfigured(getContext())
            )
        ) {
            call.resolve();
            return;
        }

        FirebaseAnalytics analytics = FirebaseAnalyticsStartup.getInitializedAnalytics(getContext());
        if (analytics == null) {
            call.resolve();
            return;
        }

        analytics.logEvent(name, FirebaseAnalyticsEventPolicy.toBundle(parameters));
        call.resolve();
    }
}
