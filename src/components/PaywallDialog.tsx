import { useState } from "react";
import { Sparkles, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/lib/analytics";
import { FREE_LIMIT } from "@/lib/usage";
import { isNative, purchaseUnlock, restorePurchases, devUnlockLocal } from "@/lib/billing";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked: () => void;
};

export function PaywallDialog({ open, onOpenChange, onUnlocked }: Props) {
  const [busy, setBusy] = useState<null | "buy" | "restore">(null);
  const [error, setError] = useState<string | null>(null);
  const native = isNative();
  const analytics = useAnalytics();

  const handleBuy = async () => {
    setError(null);
    setBusy("buy");
    analytics.capture("purchase_started", { product: "unlock_unlimited", price_usd: 2.99 });
    try {
      const result = await purchaseUnlock();
      if (result.ok) {
        onUnlocked();
        analytics.capture("purchase_completed", { product: "unlock_unlimited" });
      } else if (result.reason === "cancelled") {
        // user backed out — say nothing
      } else if (result.reason === "unavailable") {
        setError("Purchases only work in the Android app from the Play Store.");
        analytics.capture("purchase_failed", { reason: "unavailable" });
      } else {
        setError(result.message ?? "Purchase failed. Please try again.");
        analytics.capture("purchase_failed", { reason: "error" });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setBusy("restore");
    try {
      const result = await restorePurchases();
      if (result.ok) {
        onUnlocked();
        analytics.capture("purchase_restored");
      } else if (result.reason === "unavailable") {
        setError("Restore only works in the Android app from the Play Store.");
        analytics.capture("purchase_restore_failed", { reason: "unavailable" });
      } else {
        setError(result.message ?? "No previous purchase found on this Google account.");
        analytics.capture("purchase_restore_failed", { reason: "not_found" });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDevUnlock = () => {
    devUnlockLocal();
    onUnlocked();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 sm:max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-yellow-400 flex items-center justify-center mb-2">
            <Sparkles className="w-6 h-6 text-neutral-950" />
          </div>
          <DialogTitle className="text-xl">You've used your {FREE_LIMIT} free tags</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Unlock unlimited AI tagging for a one-time payment of{" "}
            <span className="text-neutral-100 font-semibold">$2.99</span>. No subscription, no
            account needed.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {[
            "Unlimited AI auto-scans",
            "Unlimited tap-to-identify",
            "Unlimited box-to-identify",
            "Works forever on your Google account",
          ].map((line) => (
            <li key={line} className="flex items-center gap-2 text-sm text-neutral-200">
              <Check className="w-4 h-4 text-yellow-400 shrink-0" />
              {line}
            </li>
          ))}
        </ul>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={handleBuy}
            disabled={!!busy || !native}
            className="w-full bg-yellow-400 text-neutral-950 hover:bg-yellow-300 h-11 text-base font-semibold disabled:bg-yellow-400/40"
          >
            {busy === "buy" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Opening Google Play…
              </>
            ) : (
              "Unlock for $2.99"
            )}
          </Button>

          <Button
            onClick={handleRestore}
            disabled={!!busy || !native}
            variant="outline"
            className="w-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 hover:text-neutral-100"
          >
            {busy === "restore" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Checking…
              </>
            ) : (
              "Restore previous purchase"
            )}
          </Button>

          {!native && (
            <div className="rounded-lg bg-neutral-800/60 border border-neutral-700 p-3 text-xs text-neutral-400 space-y-2">
              <p>
                You're previewing in a browser, so Google Play isn't available. To test the rest of
                the app:
              </p>
              <Button
                onClick={handleDevUnlock}
                variant="ghost"
                size="sm"
                className="w-full text-yellow-400 hover:text-yellow-300 hover:bg-neutral-800"
              >
                Simulate unlock (preview only)
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={!!busy}
            className="w-full text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
          >
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
