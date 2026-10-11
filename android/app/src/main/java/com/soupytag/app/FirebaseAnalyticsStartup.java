package com.soupytag.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.analytics.FirebaseAnalytics;

import java.util.HashMap;
import java.util.Map;

final class FirebaseAnalyticsStartup {
    static final String PREFERENCES = "soupytag_firebase_analytics";
    static final String CONSENT_KEY = "consent";
    static final Object CONSENT_LOCK = new Object();

    private FirebaseAnalyticsStartup() {}

    static boolean isConfigured(Context context) {
        try {
            return FirebaseOptions.fromResource(context) != null;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static boolean isConsentStorageAvailable(Context context) {
        try {
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .getString(CONSENT_KEY, "unset");
            return true;
        } catch (RuntimeException ignored) {
            return false;
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

    static boolean disableCollectionIfInitialized(Context context) {
        try {
            if (FirebaseApp.getApps(context).isEmpty()) return true;
            FirebaseAnalytics analytics = FirebaseAnalytics.getInstance(context);
            analytics.setAnalyticsCollectionEnabled(false);
            analytics.setConsent(consentMap(false));
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static FirebaseAnalytics getInitializedAnalytics(Context context) {
        try {
            if (FirebaseApp.getApps(context).isEmpty()) return null;
            return FirebaseAnalytics.getInstance(context);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    static boolean initializeAfterConsent(Context context) {
        if (!isConfigured(context) || !shouldInitialize(readConsent(context), true)) return false;
        try {
            FirebaseApp app = FirebaseApp.getApps(context).isEmpty()
                ? FirebaseApp.initializeApp(context)
                : FirebaseApp.getInstance();
            if (app == null) return false;

            FirebaseAnalytics analytics = FirebaseAnalytics.getInstance(app);
            analytics.setAnalyticsCollectionEnabled(false);
            analytics.setConsent(consentMap(true));
            analytics.setAnalyticsCollectionEnabled(true);
            return true;
        } catch (RuntimeException ignored) {
            disableCollectionIfInitialized(context);
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
        return shouldInitialize(consent, configured);
    }

    static boolean isRevocationConfirmed(
        boolean configured,
        boolean consentPersisted,
        boolean collectionDisabled
    ) {
        return (!configured || consentPersisted) && collectionDisabled;
    }

    static boolean shouldInitialize(String consent, boolean configured) {
        return configured && "granted".equals(consent);
    }
}
