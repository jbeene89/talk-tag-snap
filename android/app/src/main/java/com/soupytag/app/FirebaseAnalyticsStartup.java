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

    private static volatile boolean collectionEnabled;
    private static volatile boolean collectionStateConfirmed = true;

    private FirebaseAnalyticsStartup() {}

    interface ConsentStore {
        boolean persist(String consent);
    }

    interface CollectionController {
        boolean setEnabled(boolean enabled);
    }

    static final class ConsentResult {
        final boolean configured;
        final String consent;
        final boolean collectionEnabled;
        final boolean collectionConfirmed;
        final boolean consentPersisted;
        final boolean confirmed;

        ConsentResult(
            boolean configured,
            String consent,
            boolean collectionEnabled,
            boolean collectionConfirmed,
            boolean consentPersisted
        ) {
            this.configured = configured;
            this.consent = consent;
            this.collectionEnabled = collectionEnabled;
            this.collectionConfirmed = collectionConfirmed;
            this.consentPersisted = consentPersisted;
            this.confirmed = collectionConfirmed && consentPersisted;
        }
    }

    static ConsentResult updateConsent(
        String requested,
        boolean configured,
        ConsentStore store,
        CollectionController collection
    ) {
        if ("denied".equals(requested)) {
            boolean disabled = collection.setEnabled(false);
            boolean persisted = store.persist("denied");
            return new ConsentResult(
                configured,
                persisted ? "denied" : "unset",
                false,
                disabled,
                persisted
            );
        }

        if (!"granted".equals(requested) || !configured) {
            boolean disabled = collection.setEnabled(false);
            boolean persisted = store.persist("denied");
            return new ConsentResult(false, "denied", false, disabled, persisted);
        }

        if (!store.persist("granted")) {
            boolean disabled = collection.setEnabled(false);
            return new ConsentResult(configured, "unset", false, disabled, false);
        }

        if (!collection.setEnabled(true)) {
            boolean disabled = collection.setEnabled(false);
            boolean persisted = store.persist("denied");
            return new ConsentResult(configured, "unset", false, disabled, persisted);
        }
        return new ConsentResult(true, "granted", true, true, true);
    }

    static boolean isConfigured(Context context) {
        if (FirebaseOptions.fromResource(context) != null) return true;
        for (FirebaseApp app : FirebaseApp.getApps(context)) {
            if (FirebaseApp.DEFAULT_APP_NAME.equals(app.getName())) return true;
        }
        return false;
    }

    static boolean isCollectionEnabled() {
        return collectionEnabled;
    }

    static boolean isCollectionStateConfirmed() {
        return collectionStateConfirmed;
    }

    static FirebaseAnalytics getInitializedAnalytics(Context context) {
        for (FirebaseApp app : FirebaseApp.getApps(context)) {
            if (FirebaseApp.DEFAULT_APP_NAME.equals(app.getName())) {
                try {
                    return FirebaseAnalytics.getInstance(context);
                } catch (RuntimeException ignored) {
                    collectionStateConfirmed = false;
                    return null;
                }
            }
        }
        return null;
    }

    static boolean setCollectionEnabled(Context context, boolean enabled) {
        if (!enabled) {
            boolean hasDefaultApp = false;
            for (FirebaseApp app : FirebaseApp.getApps(context)) {
                if (FirebaseApp.DEFAULT_APP_NAME.equals(app.getName())) {
                    hasDefaultApp = true;
                    break;
                }
            }
            if (!hasDefaultApp) {
                collectionEnabled = false;
                collectionStateConfirmed = true;
                return true;
            }
            FirebaseAnalytics analytics = getInitializedAnalytics(context);
            if (analytics == null) {
                return false;
            }
            try {
                analytics.setAnalyticsCollectionEnabled(false);
                analytics.setConsent(consentMap(false));
                collectionEnabled = false;
                collectionStateConfirmed = true;
                return true;
            } catch (RuntimeException ignored) {
                collectionEnabled = false;
                collectionStateConfirmed = false;
                return false;
            }
        }

        FirebaseAnalytics analytics = null;
        try {
            FirebaseApp app = null;
            for (FirebaseApp existing : FirebaseApp.getApps(context)) {
                if (FirebaseApp.DEFAULT_APP_NAME.equals(existing.getName())) {
                    app = existing;
                    break;
                }
            }
            if (app == null) app = FirebaseApp.initializeApp(context);
            if (app == null) {
                collectionEnabled = false;
                return false;
            }
            analytics = FirebaseAnalytics.getInstance(context);
            analytics.setAnalyticsCollectionEnabled(false);
            analytics.setConsent(consentMap(true));
            analytics.setAnalyticsCollectionEnabled(true);
            collectionEnabled = true;
            collectionStateConfirmed = true;
            return true;
        } catch (RuntimeException ignored) {
            collectionEnabled = false;
            collectionStateConfirmed = false;
            if (analytics != null) {
                try {
                    analytics.setAnalyticsCollectionEnabled(false);
                    analytics.setConsent(consentMap(false));
                    collectionStateConfirmed = true;
                } catch (RuntimeException ignoredAgain) {
                    collectionStateConfirmed = false;
                }
            }
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
            SharedPreferences preferences =
                context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
            boolean committed = preferences.edit().putString(CONSENT_KEY, consent).commit();
            return committed && consent.equals(preferences.getString(CONSENT_KEY, null));
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
