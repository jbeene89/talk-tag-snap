package com.soupytag.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.analytics.FirebaseAnalytics;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FirebaseAnalyticsStartupTest {
    @Test
    public void missingAppConsentDoesNotInitializeEvenWithRetainedSdkGrant() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        clearFirebaseApps(context);
        context.getSharedPreferences(FirebaseAnalyticsStartup.PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(FirebaseAnalyticsStartup.CONSENT_KEY, "granted")
            .commit();
        context.getSharedPreferences(
            FirebaseAnalyticsStartup.REVOCATION_PREFERENCES,
            Context.MODE_PRIVATE
        ).edit().putBoolean(FirebaseAnalyticsStartup.REVOCATION_KEY, false).commit();

        FirebaseOptions oldOptions = new FirebaseOptions.Builder()
            .setApplicationId("1:123456789:android:consent-test")
            .setApiKey("test-only-key")
            .setProjectId("consent-test")
            .build();
        FirebaseApp oldApp = FirebaseApp.initializeApp(context, oldOptions);
        FirebaseAnalytics.getInstance(oldApp).setAnalyticsCollectionEnabled(true);
        oldApp.delete();

        context.getSharedPreferences(FirebaseAnalyticsStartup.PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .remove(FirebaseAnalyticsStartup.CONSENT_KEY)
            .commit();
        context.getSharedPreferences(
            FirebaseAnalyticsStartup.REVOCATION_PREFERENCES,
            Context.MODE_PRIVATE
        ).edit().putBoolean(FirebaseAnalyticsStartup.REVOCATION_KEY, false).commit();

        FirebaseAnalyticsStartup.denyRuntimeCollection();
        assertFalse(FirebaseAnalyticsStartup.apply(context, true));
        assertTrue(FirebaseApp.getApps(context).isEmpty());
        assertFalse(FirebaseAnalyticsStartup.runtimeCollectionAllowed());
    }

    @Test
    public void corruptConsentAndStaleRevocationStateRemainFailClosed() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        clearFirebaseApps(context);
        context.getSharedPreferences(FirebaseAnalyticsStartup.PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(FirebaseAnalyticsStartup.CONSENT_KEY, "corrupt")
            .commit();
        context.getSharedPreferences(
            FirebaseAnalyticsStartup.REVOCATION_PREFERENCES,
            Context.MODE_PRIVATE
        ).edit().putBoolean(FirebaseAnalyticsStartup.REVOCATION_KEY, false).commit();

        assertFalse(FirebaseAnalyticsStartup.apply(context, true));
        assertTrue(FirebaseApp.getApps(context).isEmpty());
        assertFalse(FirebaseAnalyticsStartup.runtimeCollectionAllowed());
    }

    @Test
    public void missingRevocationMarkerDoesNotTrustAnOldGrant() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        clearFirebaseApps(context);
        context.getSharedPreferences(FirebaseAnalyticsStartup.PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(FirebaseAnalyticsStartup.CONSENT_KEY, "granted")
            .commit();
        context.getSharedPreferences(
            FirebaseAnalyticsStartup.REVOCATION_PREFERENCES,
            Context.MODE_PRIVATE
        ).edit().remove(FirebaseAnalyticsStartup.REVOCATION_KEY).commit();

        assertTrue(FirebaseAnalyticsStartup.readRevocation(context));
        assertFalse(FirebaseAnalyticsStartup.apply(context, true));
        assertTrue(FirebaseApp.getApps(context).isEmpty());
    }

    @Test
    public void mergedAppDoesNotDeclareFirebaseAutoInitProvider() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager manager = context.getPackageManager();
        PackageInfo info = manager.getPackageInfo(
            context.getPackageName(),
            PackageManager.GET_PROVIDERS
        );
        if (info.providers == null) return;
        for (android.content.pm.ProviderInfo provider : info.providers) {
            assertFalse(
                "FirebaseInitProvider must not initialize before consent is checked",
                "com.google.firebase.provider.FirebaseInitProvider".equals(provider.name)
            );
        }
    }

    private static void clearFirebaseApps(Context context) {
        for (FirebaseApp app : FirebaseApp.getApps(context)) {
            app.delete();
        }
    }
}
