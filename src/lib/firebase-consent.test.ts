import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveFirebaseConsent,
  shouldCaptureFirebaseEvent,
  updateFirebaseConsent,
  type FirebaseConsentBridge,
  type FirebaseNativeConsentStatus,
} from "./firebase-consent.ts";

const granted: FirebaseNativeConsentStatus = {
  configured: true,
  consent: "granted",
  collectionEnabled: true,
  collectionConfirmed: true,
  consentPersisted: true,
  confirmed: true,
};
const denied: FirebaseNativeConsentStatus = {
  configured: true,
  consent: "denied",
  collectionEnabled: false,
  collectionConfirmed: true,
  consentPersisted: true,
  confirmed: true,
};

function bridge(
  status: FirebaseNativeConsentStatus,
  setConsent: FirebaseConsentBridge["setConsent"] = async () => status,
): FirebaseConsentBridge {
  return { getStatus: async () => status, setConsent };
}

test("missing browser consent keeps a stale native grant disabled on restart", async () => {
  const requests: string[] = [];
  const result = await resolveFirebaseConsent(
    "unset",
    bridge(granted, async ({ consent }) => {
      requests.push(consent);
      return denied;
    }),
    () => true,
  );

  assert.deepEqual(requests, ["denied"]);
  assert.equal(result.consent, "denied");
  assert.equal(result.collectionEnabled, false);
  assert.equal(result.confirmed, true);
});

test("a missing native app-consent value cannot reuse an old browser grant", async () => {
  const requests: string[] = [];
  const missingNativeConsent: FirebaseNativeConsentStatus = {
    configured: true,
    consent: "unset",
    collectionEnabled: false,
    collectionConfirmed: true,
    consentPersisted: false,
    confirmed: false,
  };
  const result = await resolveFirebaseConsent(
    "granted",
    bridge(missingNativeConsent, async ({ consent }) => {
      requests.push(consent);
      return denied;
    }),
    () => true,
  );

  assert.deepEqual(requests, ["denied"]);
  assert.equal(result.consent, "denied");
  assert.equal(result.collectionEnabled, false);
  assert.equal(result.confirmed, true);
});

test("revocation blocks locally before a bridge failure and can be retried", async () => {
  const writes: string[] = [];
  let attempts = 0;
  let blocked = false;
  const captureAllowed = () => shouldCaptureFirebaseEvent("granted", true, blocked);
  assert.equal(captureAllowed(), true);
  const nativeBridge = bridge(granted, async ({ consent }) => {
    attempts += 1;
    assert.equal(captureAllowed(), false);
    assert.equal(writes.at(-1), "denied");
    if (attempts === 1) throw new Error("bridge unavailable before native disable");
    assert.equal(consent, "denied");
    return denied;
  });

  blocked = true;
  const firstAttempt = updateFirebaseConsent("denied", nativeBridge, (value) => {
    writes.push(value);
    return true;
  });
  assert.equal(captureAllowed(), false);
  const first = await firstAttempt;
  assert.equal(first.confirmed, false);
  assert.equal(first.consent, "denied");
  assert.equal(first.collectionEnabled, false);

  const recovered = await updateFirebaseConsent("denied", nativeBridge, (value) => {
    writes.push(value);
    return true;
  });
  assert.equal(recovered.confirmed, true);
  assert.equal(recovered.consent, "denied");
  assert.equal(recovered.collectionEnabled, false);
  assert.equal(attempts, 2);
});

test("a browser storage failure triggers native opt-out before rejecting a grant", async () => {
  const requests: string[] = [];
  const result = await updateFirebaseConsent(
    "granted",
    bridge(granted, async ({ consent }) => {
      requests.push(consent);
      return denied;
    }),
    () => false,
  );

  assert.deepEqual(requests, ["denied"]);
  assert.equal(result.consent, "unset");
  assert.equal(result.confirmed, false);
  assert.equal(result.collectionConfirmed, true);
  assert.equal(result.consentPersisted, true);
  assert.equal(result.collectionEnabled, false);
});

test("native storage failure distinguishes in-session disable from durable denial", async () => {
  const partialDenial: FirebaseNativeConsentStatus = {
    configured: true,
    consent: "unset",
    collectionEnabled: false,
    collectionConfirmed: true,
    consentPersisted: false,
    confirmed: false,
  };
  const result = await updateFirebaseConsent(
    "denied",
    bridge(granted, async () => partialDenial),
    () => true,
  );

  assert.equal(result.consent, "denied");
  assert.equal(result.collectionConfirmed, true);
  assert.equal(result.consentPersisted, false);
  assert.equal(result.confirmed, false);
});

test("native status failure retries an explicit durable denial", async () => {
  const nativeBridge: FirebaseConsentBridge = {
    getStatus: async () => {
      throw new Error("bridge unavailable");
    },
    setConsent: async ({ consent }) => {
      assert.equal(consent, "denied");
      return denied;
    },
  };

  const result = await resolveFirebaseConsent("granted", nativeBridge, () => true);
  assert.equal(result.consent, "denied");
  assert.equal(result.confirmed, true);
  assert.equal(result.collectionEnabled, false);
});
