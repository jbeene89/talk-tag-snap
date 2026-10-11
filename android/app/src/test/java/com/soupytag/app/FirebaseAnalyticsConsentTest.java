package com.soupytag.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Test;

public class FirebaseAnalyticsConsentTest {
    @Test
    public void revocationDisablesBeforePersistingDenial() {
        List<String> operations = new ArrayList<>();
        FirebaseAnalyticsStartup.ConsentResult result = FirebaseAnalyticsStartup.updateConsent(
            "denied",
            true,
            consent -> {
                operations.add("persist:" + consent);
                return true;
            },
            enabled -> {
                operations.add("enabled:" + enabled);
                return true;
            }
        );

        assertEquals(Arrays.asList("enabled:false", "persist:denied"), operations);
        assertTrue(result.confirmed);
        assertFalse(result.collectionEnabled);
        assertEquals("denied", result.consent);
    }

    @Test
    public void failedNativeDisableOrStorageWriteIsNotConfirmed() {
        FirebaseAnalyticsStartup.ConsentResult disableFailed = FirebaseAnalyticsStartup.updateConsent(
            "denied",
            true,
            consent -> true,
            enabled -> false
        );
        FirebaseAnalyticsStartup.ConsentResult storageFailed = FirebaseAnalyticsStartup.updateConsent(
            "denied",
            true,
            consent -> false,
            enabled -> true
        );

        assertFalse(disableFailed.confirmed);
        assertFalse(storageFailed.confirmed);
        assertFalse(disableFailed.collectionEnabled);
        assertFalse(storageFailed.collectionEnabled);
        assertTrue(storageFailed.collectionConfirmed);
        assertFalse(storageFailed.consentPersisted);
    }

    @Test
    public void nativeDenialCanBeRetriedAfterStorageFailure() {
        int[] writes = {0};
        FirebaseAnalyticsStartup.ConsentStore store = consent -> ++writes[0] > 1;
        FirebaseAnalyticsStartup.CollectionController collection = enabled -> !enabled;

        FirebaseAnalyticsStartup.ConsentResult first =
            FirebaseAnalyticsStartup.updateConsent("denied", true, store, collection);
        FirebaseAnalyticsStartup.ConsentResult retry =
            FirebaseAnalyticsStartup.updateConsent("denied", true, store, collection);

        assertFalse(first.confirmed);
        assertTrue(retry.confirmed);
        assertEquals(2, writes[0]);
    }

    @Test
    public void failedGrantStorageNeverEnablesCollection() {
        boolean[] enabled = {false};
        FirebaseAnalyticsStartup.ConsentResult result = FirebaseAnalyticsStartup.updateConsent(
            "granted",
            true,
            consent -> false,
            value -> {
                enabled[0] = value;
                return true;
            }
        );

        assertFalse(result.confirmed);
        assertFalse(result.collectionEnabled);
        assertFalse(enabled[0]);
    }

    @Test
    public void grantPersistsConsentBeforeEnablingCollection() {
        List<String> operations = new ArrayList<>();
        FirebaseAnalyticsStartup.ConsentResult result = FirebaseAnalyticsStartup.updateConsent(
            "granted",
            true,
            consent -> {
                operations.add("persist:" + consent);
                return true;
            },
            enabled -> {
                operations.add("enabled:" + enabled);
                return enabled;
            }
        );

        assertEquals(Arrays.asList("persist:granted", "enabled:true"), operations);
        assertTrue(result.confirmed);
        assertTrue(result.collectionEnabled);
        assertEquals("granted", result.consent);
    }
}
