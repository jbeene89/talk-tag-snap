import { useCallback, useEffect, useState } from "react";

const COUNT_KEY = "soupytag:ai:count:v1";
const UNLOCK_KEY = "soupytag:ai:unlocked:v1";

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

function readUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function useAiUsage() {
  const [count, setCount] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    setCount(readCount());
    setUnlocked(readUnlocked());
  }, []);

  const remaining = Math.max(0, FREE_LIMIT - count);

  // Returns true if the caller may proceed; false if the paywall opened.
  const requestAiCall = useCallback((): boolean => {
    if (readUnlocked()) return true;
    if (readCount() >= FREE_LIMIT) {
      setPaywallOpen(true);
      return false;
    }
    return true;
  }, []);

  // Call after a successful AI request.
  const recordAiCall = useCallback(() => {
    if (readUnlocked()) return;
    const next = readCount() + 1;
    try {
      localStorage.setItem(COUNT_KEY, String(next));
    } catch {}
    setCount(next);
  }, []);

  const unlock = useCallback(() => {
    try {
      localStorage.setItem(UNLOCK_KEY, "1");
    } catch {}
    setUnlocked(true);
    setPaywallOpen(false);
  }, []);

  return {
    count,
    remaining,
    unlocked,
    paywallOpen,
    setPaywallOpen,
    requestAiCall,
    recordAiCall,
    unlock,
  };
}
