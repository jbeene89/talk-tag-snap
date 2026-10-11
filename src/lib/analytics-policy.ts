export type AnalyticsConsent = "unset" | "granted" | "denied";
export type AnalyticsProvider = "firebase" | "posthog" | "none";
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;
export type FirebaseRevocationResult = {
  configured: boolean;
  collectionDisabled: boolean;
  persisted: boolean;
};

export const ANALYTICS_CONSENT_KEY = "soupytag:analytics:consent:v2";
export const LEGACY_ANALYTICS_CONSENT_KEY = "soupytag:analytics:consent:v1";

export function getAnalyticsProvider(platform: string): AnalyticsProvider {
  if (platform === "android") return "firebase";
  if (platform === "web") return "posthog";
  return "none";
}

export function firebaseCollectionEnabled(consent: AnalyticsConsent, configured: boolean): boolean {
  return configured && consent === "granted";
}

export function canCaptureFirebaseEvent(
  consent: AnalyticsConsent,
  configured: boolean,
  revocationPending: boolean,
): boolean {
  return firebaseCollectionEnabled(consent, configured) && !revocationPending;
}

export function shouldLogFirebaseAppOpen(
  ready: boolean,
  consent: AnalyticsConsent,
  consentAtStartup: boolean,
): boolean {
  return ready && consent === "granted" && consentAtStartup;
}

export async function revokeFirebaseAnalytics(
  setConsent: () => Promise<FirebaseRevocationResult>,
): Promise<FirebaseRevocationResult> {
  let result: FirebaseRevocationResult = {
    configured: false,
    collectionDisabled: false,
    persisted: false,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      result = await setConsent();
      if (result.collectionDisabled && result.persisted) return result;
    } catch {
      result = { configured: false, collectionDisabled: false, persisted: false };
    }
  }
  return result;
}

export function readAnalyticsConsent(storage: Pick<Storage, "getItem">): AnalyticsConsent {
  try {
    const current = storage.getItem(ANALYTICS_CONSENT_KEY);
    if (current === "granted" || current === "denied") return current;
    if (current !== null) return "unset";
    return storage.getItem(LEGACY_ANALYTICS_CONSENT_KEY) === "denied" ? "denied" : "unset";
  } catch {
    return "unset";
  }
}

export function firebaseEvent(
  event: string,
  properties: AnalyticsProperties = {},
): { name: string; parameters: Record<string, string | number | boolean> } | null {
  if (event === "manual_tag_created") {
    const method = properties.method;
    if (method !== "tap" && method !== "box" && method !== "redact") return null;
    return { name: "tag_created", parameters: { method } };
  }

  if (event === "export_completed") {
    const method = properties.method;
    const tagCount = properties.tag_count;
    const timestampIncluded = properties.timestamp_included;
    if (
      (method !== "download" && method !== "share" && method !== "share_fallback_save") ||
      typeof tagCount !== "number" ||
      !Number.isInteger(tagCount) ||
      tagCount < 0 ||
      tagCount > 1000 ||
      typeof timestampIncluded !== "boolean"
    ) {
      return null;
    }
    return {
      name: "report_exported",
      parameters: {
        method,
        tag_count: tagCount,
        timestamp_included: timestampIncluded,
      },
    };
  }

  if (event === "app_opened") return { name: "app_opened", parameters: {} };
  return null;
}
