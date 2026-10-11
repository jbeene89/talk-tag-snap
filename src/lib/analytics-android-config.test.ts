import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const manifest = readFileSync(
  new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url),
  "utf8",
);
const gradle = readFileSync(new URL("../../android/app/build.gradle", import.meta.url), "utf8");
const activity = readFileSync(
  new URL("../../android/app/src/main/java/com/soupytag/app/MainActivity.java", import.meta.url),
  "utf8",
);
const plugin = readFileSync(
  new URL(
    "../../android/app/src/main/java/com/soupytag/app/FirebaseAnalyticsPlugin.java",
    import.meta.url,
  ),
  "utf8",
);
const startup = readFileSync(
  new URL(
    "../../android/app/src/main/java/com/soupytag/app/FirebaseAnalyticsStartup.java",
    import.meta.url,
  ),
  "utf8",
);
const eventPolicy = readFileSync(
  new URL(
    "../../android/app/src/main/java/com/soupytag/app/FirebaseAnalyticsEventPolicy.java",
    import.meta.url,
  ),
  "utf8",
);

test("native Firebase collection and advertising identifiers are disabled by default", () => {
  assert.match(manifest, /firebase_analytics_collection_enabled" android:value="false"/);
  assert.match(
    manifest,
    /google_analytics_automatic_screen_reporting_enabled" android:value="false"/,
  );
  assert.match(manifest, /google_analytics_adid_collection_enabled" android:value="false"/);
  assert.match(manifest, /com\.google\.android\.gms\.permission\.AD_ID".*tools:node="remove"/);
  assert.match(manifest, /ACCESS_ADSERVICES_AD_ID".*tools:node="remove"/);
  assert.match(manifest, /ACCESS_ADSERVICES_ATTRIBUTION".*tools:node="remove"/);
  assert.match(manifest, /ACCESS_ADSERVICES_TOPICS".*tools:node="remove"/);
  assert.match(manifest, /ACCESS_ADSERVICES_CUSTOM_AUDIENCE".*tools:node="remove"/);
  assert.match(gradle, /com\.google\.firebase:firebase-analytics/);
});

test("Firebase automatic provider is removed and SDK startup is consent-gated", () => {
  assert.match(
    manifest,
    /android:name="com\.google\.firebase\.provider\.FirebaseInitProvider"[\s\S]*?tools:node="remove"/,
  );
  assert.doesNotMatch(activity, /FirebaseAnalyticsStartup|FirebaseAnalytics\.getInstance/);
  assert.match(activity, /registerPlugin\(FirebaseAnalyticsPlugin\.class\)/);
  assert.match(plugin, /FirebaseAnalyticsStartup\.updateConsent\(/);
  assert.match(plugin, /FirebaseAnalyticsStartup\.setCollectionEnabled\(getContext\(\), enabled\)/);
  assert.match(eventPolicy, /Iterator<String> keys = parameters\.keys\(\)/);
  assert.doesNotMatch(eventPolicy, /parameters\.keySet\(\)/);
  const persistGrant = startup.indexOf('if (!store.persist("granted"))');
  const enableAfterGrant = startup.indexOf("collection.setEnabled(true)", persistGrant);
  assert.ok(persistGrant >= 0 && enableAfterGrant > persistGrant);
  const eventLog = plugin.indexOf("public void logEvent");
  const eventConsentCheck = plugin.indexOf("isCollectionEnabled()", eventLog);
  const firebaseLookup = plugin.indexOf("getInitializedAnalytics", eventLog);
  assert.ok(eventLog >= 0 && eventConsentCheck > eventLog && eventConsentCheck < firebaseLookup);
  assert.doesNotMatch(startup, /static void apply\(/);
  assert.match(startup, /FirebaseApp\.initializeApp\(context\)/);
  assert.match(startup, /FirebaseAnalytics\.getInstance\(context\)/);
});

test("Firebase config path is effectively ignored before local setup", () => {
  assert.match(
    readFileSync(new URL("../../.gitignore", import.meta.url), "utf8"),
    /^android\/app\/google-services\.json$/m,
  );
});
