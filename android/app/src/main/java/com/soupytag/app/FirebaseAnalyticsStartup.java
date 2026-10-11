package com.soupytag.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.analytics.FirebaseAnalytics;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

final class FirebaseAnalyticsStartup {
    static final String PREFERENCES = "soupytag_firebase_analytics";
    static final String REVOCATION_PREFERENCES = "soupytag_firebase_analytics_revocation";
    static final String CONSENT_KEY = "consent";
    static final String REVOCATION_KEY = "revoked";
    private static final AtomicBoolean COLLECTION_ALLOWED = new AtomicBoolean(false);

    private FirebaseAnalyticsStartup() {}

    static boolean apply(Context context) {
        return apply(context, hasConfiguration(context));
    }

    static boolean apply(Context context, boolean configured) {
        if (!shouldInitialize(readConsent(context), readRevocation(context), configured)) {
            COLLECTION_ALLOWED.set(false);
            disableIfAlreadyInitialized(context);
            return false;
        }
        return initializeWithConsent(context) != null;
    }

    static FirebaseAnalytics initializeWithConsent(Context context) {
        if (!shouldInitialize(readConsent(context), readRevocation(context), hasConfiguration(context))) {
            COLLECTION_ALLOWED.set(false);
            return null;
        }

        try {
            FirebaseApp app = FirebaseApp.getApps(context).isEmpty()
                ? FirebaseApp.initializeApp(context, FirebaseOptions.fromResource(context))
                : FirebaseApp.getInstance();
            if (app == null) return null;

            FirebaseAnalytics analytics = FirebaseAnalytics.getInstance(app);
            analytics.setConsent(consentMap(true));
            analytics.setAnalyticsCollectionEnabled(true);
            COLLECTION_ALLOWED.set(true);
            return analytics;
        } catch (RuntimeException ignored) {
            COLLECTION_ALLOWED.set(false);
            return null;
        }
    }

    static FirebaseAnalytics initializedAnalytics(Context context) {
        try {
            if (FirebaseApp.getApps(context).isEmpty()) return null;
            return FirebaseAnalytics.getInstance(FirebaseApp.getInstance());
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    static boolean hasConfiguration(Context context) {
        try {
            return FirebaseOptions.fromResource(context) != null;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static String readConsent(Context context) {
        try {
            String consent = preferences(context).getString(CONSENT_KEY, "unset");
            return "granted".equals(consent) || "denied".equals(consent) ? consent : "unset";
        } catch (RuntimeException ignored) {
            return "unset";
        }
    }

    static boolean readRevocation(Context context) {
        try {
            return revocationPreferences(context).getBoolean(REVOCATION_KEY, true);
        } catch (RuntimeException ignored) {
            return true;
        }
    }

    static boolean persistConsent(Context context, String consent) {
        try {
            return preferences(context).edit().putString(CONSENT_KEY, consent).commit()
                && consent.equals(readConsent(context));
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static boolean persistRevocation(Context context, boolean revoked) {
        try {
            return revocationPreferences(context).edit().putBoolean(REVOCATION_KEY, revoked).commit()
                && readRevocation(context) == revoked;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    static boolean shouldInitialize(String consent, boolean revoked, boolean configured) {
        return configured && "granted".equals(consent) && !revoked;
    }

    static boolean revocationPersisted(boolean consentWrite, boolean revocationWrite) {
        return consentWrite || revocationWrite;
    }

    static boolean shouldCollect(String consent, boolean configured, boolean runtimeAllowed) {
        return configured && runtimeAllowed && "granted".equals(consent);
    }

    static void denyRuntimeCollection() {
        COLLECTION_ALLOWED.set(false);
    }

    static boolean runtimeCollectionAllowed() {
        return COLLECTION_ALLOWED.get();
    }

    private static void disableIfAlreadyInitialized(Context context) {
        FirebaseAnalytics analytics = initializedAnalytics(context);
        if (analytics == null) return;
        try {
            analytics.setAnalyticsCollectionEnabled(false);
            analytics.setConsent(consentMap(false));
        } catch (RuntimeException ignored) {
            COLLECTION_ALLOWED.set(false);
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static SharedPreferences revocationPreferences(Context context) {
        return context.getSharedPreferences(REVOCATION_PREFERENCES, Context.MODE_PRIVATE);
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
}
