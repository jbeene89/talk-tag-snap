package com.soupytag.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FirebaseAnalyticsEventPolicyTest {
    @Test
    public void rejectsEventsBeforeConsentOrWithoutConfiguration() {
        assertFalse(FirebaseAnalyticsStartup.shouldCollect("unset", true));
        assertFalse(FirebaseAnalyticsStartup.shouldCollect("denied", true));
        assertFalse(FirebaseAnalyticsStartup.shouldCollect("granted", false));
        assertTrue(FirebaseAnalyticsStartup.shouldCollect("granted", true));
    }
}
