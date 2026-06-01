import { useCallback, useEffect, useState } from "react";
import { checkUnlocked } from "./billing";

const COUNT_KEY = "soupytag:ai:count:v1";

export const FREE_LIMIT = 5;

function readCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = Number(localStorage.getItem(COUNT_KEY) ?? "0");
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function useAiUsage() {
  const [count, setCount] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Initial load: read counter, ask billing service whether this device is unlocked.
  useEffect(() => {
    setCount(readCount());
    checkUnlocked()
      .then(setUnlocked)
      .catch(() => setUnlocked(false));
  }, []);

  const remaining = Math.max(0, FREE_LIMIT - count);

  // Returns true if the caller may proceed; false if the paywall opened.
  const requestAiCall = useCallback((): boolean => {
    if (unlocked) return true;
    if (readCount() >= FREE_LIMIT) {
      setPaywallOpen(true);
      return false;
    }
    return true;
  }, [unlocked]);

  // Call after a successful AI request.
  const recordAiCall = useCallback(() => {
    if (unlocked) return;
    const next = readCount() + 1;
    try {
      localStorage.setItem(COUNT_KEY, String(next));
    } catch {}
    setCount(next);
  }, [unlocked]);

  // Called by the paywall after a successful purchase or restore.
  const markUnlocked = useCallback(() => {
    setUnlocked(true);
    setPaywallOpen(false);
  }, []);

  // Re-check entitlement from the billing service (e.g. after restore).
  const refreshUnlock = useCallback(async () => {
    const ok = await checkUnlocked();
    setUnlocked(ok);
    return ok;
  }, []);

  return {
    count,
    remaining,
    unlocked,
    paywallOpen,
    setPaywallOpen,
    requestAiCall,
    recordAiCall,
    markUnlocked,
    refreshUnlock,
  };
}
