import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANALYTICS_CONSENT_KEY,
  LEGACY_ANALYTICS_CONSENT_KEY,
  firebaseCollectionEnabled,
  firebaseEvent,
  firebaseGrantConfirmed,
  getAnalyticsProvider,
  firebaseStartupAllowed,
  firebaseRevocationConfirmed,
  readAnalyticsConsent,
  shouldLogFirebaseAppOpen,
} from "./analytics-policy.ts";

function storage(values: Record<string, string> = {}): Pick<Storage, "getItem"> {
  return { getItem: (key) => values[key] ?? null };
}

test("previous PostHog grants require a fresh provider-specific choice", () => {
  assert.equal(
    readAnalyticsConsent(storage({ [LEGACY_ANALYTICS_CONSENT_KEY]: "granted" })),
    "unset",
  );
  assert.equal(
    readAnalyticsConsent(storage({ [LEGACY_ANALYTICS_CONSENT_KEY]: "denied" })),
    "denied",
  );
  assert.equal(
    readAnalyticsConsent(
      storage({
        [ANALYTICS_CONSENT_KEY]: "granted",
        [LEGACY_ANALYTICS_CONSENT_KEY]: "denied",
      }),
    ),
    "granted",
  );
});

test("invalid and unavailable consent fail closed", () => {
  assert.equal(readAnalyticsConsent(storage({ [ANALYTICS_CONSENT_KEY]: "maybe" })), "unset");
  assert.equal(
    readAnalyticsConsent({
      getItem() {
        throw new Error("storage unavailable");
      },
    }),
    "unset",
  );
});

test("analytics routing is Android Firebase, web PostHog, and otherwise inert", () => {
  assert.equal(getAnalyticsProvider("android"), "firebase");
  assert.equal(getAnalyticsProvider("web"), "posthog");
  assert.equal(getAnalyticsProvider("ios"), "none");
  assert.equal(getAnalyticsProvider("unknown"), "none");
});

test("Firebase starts closed, revokes immediately, and does not backfill on re-consent", () => {
  assert.equal(firebaseCollectionEnabled("unset", true), false);
  assert.equal(firebaseCollectionEnabled("denied", true), false);
  assert.equal(firebaseCollectionEnabled("granted", false), false);
  assert.equal(firebaseCollectionEnabled("granted", true), true);

  assert.equal(shouldLogFirebaseAppOpen(true, "granted", false), false);
  assert.equal(shouldLogFirebaseAppOpen(true, "denied", true), false);
  assert.equal(shouldLogFirebaseAppOpen(false, "granted", true), false);
  assert.equal(shouldLogFirebaseAppOpen(true, "granted", true), true);
});

test("Firebase startup requires matching confirmed native and web grants", () => {
  assert.equal(firebaseStartupAllowed(true, "granted", "granted", true), true);
  assert.equal(firebaseStartupAllowed(true, "granted", "denied", true), false);
  assert.equal(firebaseStartupAllowed(true, "denied", "granted", true), false);
  assert.equal(firebaseStartupAllowed(true, "granted", "granted", false), false);
  assert.equal(firebaseStartupAllowed(false, "granted", "granted", true), false);
});

test("Firebase grant and revocation statuses require native confirmation and recover on retry", () => {
  assert.equal(firebaseGrantConfirmed(true, "granted", false), false);
  assert.equal(firebaseGrantConfirmed(true, "granted", true), true);
  assert.equal(firebaseRevocationConfirmed("denied", false), false);
  assert.equal(firebaseRevocationConfirmed("denied", true), true);
});

test("Firebase receives only fixed events and constrained properties", () => {
  assert.deepEqual(firebaseEvent("app_opened"), {
    name: "app_opened",
    parameters: {},
  });
  assert.deepEqual(firebaseEvent("manual_tag_created", { method: "box", label: "private text" }), {
    name: "tag_created",
    parameters: { method: "box" },
  });
  assert.deepEqual(
    firebaseEvent("export_completed", {
      method: "download",
      tag_count: 2,
      timestamp_included: false,
      filename: "private.jpg",
    }),
    {
      name: "report_exported",
      parameters: { method: "download", tag_count: 2, timestamp_included: false },
    },
  );
  assert.equal(firebaseEvent("manual_tag_created", { method: "free text" }), null);
  assert.equal(firebaseEvent("export_completed", { method: "download" }), null);
  assert.equal(
    firebaseEvent("export_completed", {
      method: "download",
      tag_count: 1001,
      timestamp_included: true,
    }),
    null,
  );
  assert.equal(firebaseEvent("feedback_sent", { message: "private text" }), null);
  assert.equal(firebaseEvent("photo_loaded", { url: "private path" }), null);
});
