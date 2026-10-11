package com.soupytag.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.firebase.FirebaseApp;
import com.google.firebase.analytics.FirebaseAnalytics;

import java.util.HashMap;
import java.util.Map;

final class FirebaseAnalyticsStartup {
    static final String PREFERENCES = "soupytag_firebase_analytics";
    static final String CONSENT_KEY = "consent";

    private FirebaseAnalyticsStartup() {}

    static void apply(Context context) {
        FirebaseAnalytics analytics = getAnalytics(context);
        if (analytics == null) {
            persistConsent(context, "denied");
            return;
        }

        try {
            analytics.setAnalyticsCollectionEnabled(false);
            String consent = readConsent(context);
            analytics.setConsent(consentMap("granted".equals(consent)));
            if ("granted".equals(consent)) {
                analytics.setAnalyticsCollectionEnabled(true);
            } else if (!"denied".equals(consent)) {
                persistConsent(context, "denied");
            }
        } catch (RuntimeException ignored) {
            analytics.setAnalyticsCollectionEnabled(false);
        }
    }

    static FirebaseAnalytics getAnalytics(Context context) {
        try {
            if (FirebaseApp.getApps(context).isEmpty()) return null;
            return FirebaseAnalytics.getInstance(context);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    static String readConsent(Context context) {
        try {
            SharedPreferences preferences =
                context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
            String consent = preferences.getString(CONSENT_KEY, "unset");
            return "granted".equals(consent) || "denied".equals(consent) ? consent : "unset";
        } catch (RuntimeException ignored) {
            return "unset";
        }
    }

    static boolean persistConsent(Context context, String consent) {
        try {
            return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit().putString(CONSENT_KEY, consent).commit();
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static Map<FirebaseAnalytics.ConsentType, FirebaseAnalytics.ConsentStatus> consentMap(
        boolean analyticsGranted
    ) {
        Map<FirebaseAnalytics.ConsentType, FirebaseAnalytics.ConsentStatus> consent =
            new HashMap<>();
        consent.put(
            FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE,
            analyticsGranted
                ? FirebaseAnalytics.ConsentStatus.GRANTED
                : FirebaseAnalytics.ConsentStatus.DENIED
        );
        consent.put(
            FirebaseAnalytics.ConsentType.AD_STORAGE,
            FirebaseAnalytics.ConsentStatus.DENIED
        );
        consent.put(
            FirebaseAnalytics.ConsentType.AD_USER_DATA,
            FirebaseAnalytics.ConsentStatus.DENIED
        );
        consent.put(
            FirebaseAnalytics.ConsentType.AD_PERSONALIZATION,
            FirebaseAnalytics.ConsentStatus.DENIED
        );
        return consent;
    }

    static boolean shouldCollect(String consent, boolean configured) {
        return configured && "granted".equals(consent);
    }
}
