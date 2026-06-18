// Billing service — RevenueCat on native Android, local fallback on web preview.
//
// On Android (Capacitor): real Google Play Billing via RevenueCat. Receipts are
// validated server-side by RevenueCat and the user's purchase persists across
// device changes when they log into Google Play with the same account.
//
// On web (Lovable preview, desktop browser): there's no Play Billing available,
// so we expose a "dev unlock" so the gating UI is still testable. The real
// purchase only runs in the published Android app.

import { Capacitor } from "@capacitor/core";

// RevenueCat entitlement identifier — must match what you create in the
// RevenueCat dashboard (Entitlements → "unlimited").
const ENTITLEMENT_ID = "unlimited";

// Public RevenueCat Android SDK key, e.g. "goog_xxxxxxxxxxxxxx".
// This is a PUBLISHABLE client key — safe to ship in the app binary.
// Set in your local .env file before building the Android app.
const REVENUECAT_ANDROID_API_KEY =
  (import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY as string | undefined) ?? "";

const LOCAL_UNLOCK_KEY = "soupytag:ai:unlocked:v1";

export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "unavailable" | "error"; message?: string };

let initialized = false;
let initializing: Promise<void> | null = null;

export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function errorDetails(error: unknown): { code?: string; message: string } {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown };
    return {
      code: typeof value.code === "string" ? value.code : undefined,
      message: typeof value.message === "string" ? value.message : "Purchase failed.",
    };
  }
  return { message: "Purchase failed." };
}

function readLocalUnlock(): boolean {
  try {
    return localStorage.getItem(LOCAL_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLocalUnlock(value: boolean) {
  try {
    if (value) localStorage.setItem(LOCAL_UNLOCK_KEY, "1");
    else localStorage.removeItem(LOCAL_UNLOCK_KEY);
  } catch {}
}

async function initRevenueCat(): Promise<void> {
  if (initialized) return;
  if (initializing) return initializing;
  initializing = (async () => {
    if (!isNative()) {
      initialized = true;
      return;
    }
    if (!REVENUECAT_ANDROID_API_KEY) {
      console.warn("[billing] VITE_REVENUECAT_ANDROID_API_KEY is not set. Purchases will fail.");
      initialized = true;
      return;
    }
    const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey: REVENUECAT_ANDROID_API_KEY });
    initialized = true;
  })();
  return initializing;
}

/** True if the user has the "unlimited" entitlement, OR (on web) the local flag. */
export async function checkUnlocked(): Promise<boolean> {
  // Local flag wins immediately (covers web dev unlock and a cached native unlock).
  if (readLocalUnlock()) return true;

  if (!isNative()) return false;

  try {
    await initRevenueCat();
    if (!REVENUECAT_ANDROID_API_KEY) return false;
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.getCustomerInfo();
    const active = customerInfo?.entitlements?.active ?? {};
    const unlocked = Boolean(active[ENTITLEMENT_ID]);
    if (unlocked) writeLocalUnlock(true);
    return unlocked;
  } catch (err) {
    console.error("[billing] checkUnlocked failed", err);
    return false;
  }
}

/** Start the purchase flow. Resolves once the user completes or cancels. */
export async function purchaseUnlock(): Promise<PurchaseResult> {
  if (!isNative()) {
    return { ok: false, reason: "unavailable" };
  }

  if (!REVENUECAT_ANDROID_API_KEY) {
    return {
      ok: false,
      reason: "error",
      message: "Payment system is not configured. Contact support.",
    };
  }

  try {
    await initRevenueCat();
    const { Purchases, PURCHASES_ERROR_CODE } = await import("@revenuecat/purchases-capacitor");

    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) {
      return {
        ok: false,
        reason: "error",
        message: "No products available. Check Play Console listing.",
      };
    }

    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const unlocked = Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]);
    if (unlocked) writeLocalUnlock(true);
    return unlocked
      ? { ok: true }
      : { ok: false, reason: "error", message: "Purchase didn't grant entitlement." };
  } catch (err: unknown) {
    const details = errorDetails(err);
    if (details.code === "1" || /cancel/i.test(details.message)) {
      return { ok: false, reason: "cancelled" };
    }
    console.error("[billing] purchase failed", err);
    return { ok: false, reason: "error", message: details.message };
  }
}

/** Re-check the user's purchases (e.g. on a new device). */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isNative()) return { ok: false, reason: "unavailable" };
  try {
    await initRevenueCat();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.restorePurchases();
    const unlocked = Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]);
    if (unlocked) writeLocalUnlock(true);
    return unlocked
      ? { ok: true }
      : { ok: false, reason: "error", message: "No previous purchase found." };
  } catch (err: unknown) {
    console.error("[billing] restore failed", err);
    return { ok: false, reason: "error", message: errorDetails(err).message };
  }
}

/** Dev-only: simulate a successful unlock on web so gating UI is testable. */
export function devUnlockLocal() {
  writeLocalUnlock(true);
}
