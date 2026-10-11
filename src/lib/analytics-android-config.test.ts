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

test("native Firebase collection and advertising identifiers are disabled by default", () => {
  assert.match(
    manifest,
    /com\.google\.firebase\.provider\.FirebaseInitProvider[\s\S]*?tools:node="remove"/,
  );
  assert.match(manifest, /firebase_analytics_collection_enabled" android:value="false"/);
  assert.match(
    manifest,
    /firebase_analytics_automatic_screen_reporting_enabled" android:value="false"/,
  );
  assert.match(manifest, /google_analytics_adid_collection_enabled" android:value="false"/);
  assert.match(manifest, /com\.google\.android\.gms\.permission\.AD_ID".*tools:node="remove"/);
  assert.match(gradle, /com\.google\.firebase:firebase-analytics/);
});

test("native consent is applied before Capacitor starts the web view", () => {
  assert.ok(
    activity.indexOf("FirebaseAnalyticsStartup.apply(this)") < activity.indexOf("super.onCreate"),
  );
  const startup = readFileSync(
    new URL(
      "../../android/app/src/main/java/com/soupytag/app/FirebaseAnalyticsStartup.java",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    startup,
    /shouldInitialize\(readConsent\(context\), readRevocation\(context\), hasConfiguration\(context\)\)[\s\S]*?initializeWithConsent\(context\)/,
  );
  assert.match(startup, /REVOCATION_PREFERENCES/);
  assert.match(startup, /getBoolean\(REVOCATION_KEY, true\)/);
  assert.match(activity, /registerPlugin\(FirebaseAnalyticsPlugin\.class\)/);
});
