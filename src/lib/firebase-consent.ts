import type { AnalyticsConsent } from "./analytics-policy.ts";

export type FirebaseConsentUpdateStatus = "idle" | "pending" | "unconfirmed";

export type FirebaseNativeConsentStatus = {
  configured: boolean;
  consent: AnalyticsConsent;
  collectionEnabled: boolean;
  collectionConfirmed: boolean;
  consentPersisted: boolean;
  confirmed: boolean;
};

export type FirebaseConsentBridge = {
  getStatus(): Promise<FirebaseNativeConsentStatus>;
  setConsent(options: {
    consent: Exclude<AnalyticsConsent, "unset">;
  }): Promise<FirebaseNativeConsentStatus>;
};

export type FirebaseConsentResult = FirebaseNativeConsentStatus & {
  consent: AnalyticsConsent;
};

type PersistBrowserConsent = (consent: AnalyticsConsent) => boolean;

export function shouldCaptureFirebaseEvent(
  consent: AnalyticsConsent,
  nativeCollectionEnabled: boolean,
  blocked: boolean,
): boolean {
  return !blocked && nativeCollectionEnabled && consent === "granted";
}

function isConfirmed(
  result: FirebaseNativeConsentStatus,
  consent: Exclude<AnalyticsConsent, "unset">,
): boolean {
  if (!result.confirmed || result.consent !== consent) return false;
  return consent === "granted"
    ? result.configured &&
        result.collectionEnabled &&
        result.collectionConfirmed &&
        result.consentPersisted
    : !result.collectionEnabled && result.collectionConfirmed && result.consentPersisted;
}

export async function updateFirebaseConsent(
  consent: Exclude<AnalyticsConsent, "unset">,
  bridge: FirebaseConsentBridge,
  persistBrowserConsent: PersistBrowserConsent,
): Promise<FirebaseConsentResult> {
  if (consent === "denied") {
    persistBrowserConsent("denied");
    try {
      const result = await bridge.setConsent({ consent });
      if (isConfirmed(result, consent)) return result;
      return { ...result, consent: "denied", confirmed: false };
    } catch {
      // Keep the JavaScript event gate closed and expose the unconfirmed native result.
    }
    return {
      configured: false,
      consent: "denied",
      collectionEnabled: false,
      collectionConfirmed: false,
      consentPersisted: false,
      confirmed: false,
    };
  }

  if (!persistBrowserConsent("granted")) {
    const denied = await updateFirebaseConsent("denied", bridge, persistBrowserConsent);
    return {
      ...denied,
      consent: "unset",
      configured: false,
      confirmed: false,
    };
  }

  const keepOff = async (): Promise<FirebaseConsentResult> => {
    const denied = await updateFirebaseConsent("denied", bridge, persistBrowserConsent);
    persistBrowserConsent("unset");
    return {
      ...denied,
      consent: "unset",
      configured: false,
      confirmed: false,
    };
  };

  try {
    const result = await bridge.setConsent({ consent });
    if (isConfirmed(result, consent)) return result;
    if (result.confirmed && result.consent === "denied" && !result.collectionEnabled) {
      persistBrowserConsent("denied");
      return result;
    }
    if (result.consent === "denied" && !result.collectionEnabled) {
      return { ...result, consent: "unset", confirmed: false };
    }
  } catch {
    // A bridge failure must not make a browser-side grant sufficient to enable collection.
  }
  return keepOff();
}

export async function resolveFirebaseConsent(
  browserConsent: AnalyticsConsent,
  bridge: FirebaseConsentBridge,
  persistBrowserConsent: PersistBrowserConsent,
): Promise<FirebaseConsentResult> {
  try {
    const nativeStatus = await bridge.getStatus();
    if (
      browserConsent === "granted" &&
      nativeStatus.configured &&
      nativeStatus.consent === "granted"
    ) {
      return await updateFirebaseConsent("granted", bridge, persistBrowserConsent);
    }
  } catch {
    // Even when native status cannot be read, attempt to persist and confirm a native denial.
  }

  return updateFirebaseConsent("denied", bridge, persistBrowserConsent).then((result) => ({
    ...result,
    consent: browserConsent === "denied" ? "denied" : result.confirmed ? "denied" : "unset",
  }));
}
