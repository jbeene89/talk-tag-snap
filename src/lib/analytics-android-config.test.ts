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
const startup = readFileSync(
  new URL(
    "../../android/app/src/main/java/com/soupytag/app/FirebaseAnalyticsStartup.java",
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
  assert.doesNotMatch(manifest, /firebase_analytics_automatic_screen_reporting_enabled/);
  assert.match(manifest, /google_analytics_adid_collection_enabled" android:value="false"/);
  assert.match(manifest, /com\.google\.android\.gms\.permission\.AD_ID".*tools:node="remove"/);
  assert.match(manifest, /ACCESS_ADSERVICES_AD_ID".*tools:node="remove"/);
  assert.match(manifest, /ACCESS_ADSERVICES_ATTRIBUTION".*tools:node="remove"/);
  assert.match(manifest, /ACCESS_ADSERVICES_TOPICS".*tools:node="remove"/);
  assert.match(manifest, /ACCESS_ADSERVICES_CUSTOM_AUDIENCE".*tools:node="remove"/);
  assert.match(manifest, /FirebaseInitProvider[\s\S]*?tools:node="remove"/);
  assert.match(gradle, /com\.google\.firebase:firebase-analytics/);
});

test("Firebase initializes only after the native consent value has been persisted", () => {
  assert.doesNotMatch(activity, /FirebaseAnalyticsStartup\.apply/);
  assert.match(startup, /FirebaseApp\.initializeApp\(context\)/);
  assert.match(
    startup,
    /shouldInitialize\(readConsent\(context\), true\)[\s\S]*?FirebaseApp\.initializeApp/,
  );
  assert.match(startup, /"granted"\.equals\(consent\)/);
  assert.match(activity, /registerPlugin\(FirebaseAnalyticsPlugin\.class\)/);
});
