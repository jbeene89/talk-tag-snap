import { useCallback, useEffect, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Loader2, Lock, Sparkles, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { supabase } from "@/integrations/supabase/client";
import { getStripe, getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { confirmUnlock, createUnlockCheckout, getMyUnlock } from "@/lib/unlock.functions";
import { devUnlockLocal, isNative } from "@/lib/billing";

type State = "loading" | "signed-out" | "locked" | "paying" | "unlocked";

const PERKS = [
  "Unlimited photo and video tagging",
  "Tap, box, blur and describe",
  "Timestamped, shareable reports",
  "One payment — yours forever",
];

export function UnlockGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const markUnlocked = useCallback(() => {
    devUnlockLocal();
    setState("unlocked");
  }, []);

  useEffect(() => {
    // The Android app is bought on Google Play, so it is already paid for.
    if (isNative()) {
      markUnlocked();
      return;
    }

    let cancelled = false;

    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setState("signed-out");
        return;
      }
      setEmail(data.user.email ?? null);

      // Coming back from the payment page?
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");
      if (sessionId) {
        try {
          const result = await confirmUnlock({
            data: { sessionId, environment: getStripeEnvironment() },
          });
          window.history.replaceState({}, "", window.location.pathname);
          if (result.unlocked) {
            markUnlocked();
            return;
          }
        } catch {
          /* fall through to the normal check */
        }
      }

      const mine = await getMyUnlock();
      if (cancelled) return;
      if (mine.unlocked) markUnlocked();
      else setState("locked");
    };

    run().catch(() => setState("signed-out"));
    return () => {
      cancelled = true;
    };
  }, [markUnlocked]);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const result = await createUnlockCheckout({
      data: {
        returnUrl: `${window.location.origin}/?session_id={CHECKOUT_SESSION_ID}`,
        environment: getStripeEnvironment(),
      },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Payment could not be started.");
    return result.clientSecret;
  }, []);

  if (state === "unlocked") return <>{children}</>;

  if (state === "loading") {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-yellow-400" aria-label="Loading" />
      </main>
    );
  }

  if (state === "paying") {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <PaymentTestModeBanner />
        <div className="mx-auto max-w-xl p-4">
          <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
          <Button
            variant="ghost"
            className="mt-4 w-full text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
            onClick={() => setState("locked")}
          >
            Back
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-md px-5 py-12">
        <div className="w-14 h-14 rounded-2xl bg-yellow-400 flex items-center justify-center mb-5">
          {state === "signed-out" ? (
            <Lock className="w-7 h-7 text-neutral-950" />
          ) : (
            <Sparkles className="w-7 h-7 text-neutral-950" />
          )}
        </div>

        <h1 className="text-2xl font-semibold">SoupyTag</h1>
        <p className="mt-2 text-neutral-400">
          Snap a photo, mark what matters, and share it. One-time payment of{" "}
          <span className="text-neutral-100 font-semibold">$2.99</span> — no subscription.
        </p>

        <ul className="mt-6 space-y-2">
          {PERKS.map((line) => (
            <li key={line} className="flex items-center gap-2 text-sm text-neutral-200">
              <Check className="w-4 h-4 text-yellow-400 shrink-0" />
              {line}
            </li>
          ))}
        </ul>

        {error && (
          <p className="mt-5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-7 space-y-3">
          {state === "signed-out" ? (
            <>
              <Button
                className="w-full h-11 bg-yellow-400 text-neutral-950 hover:bg-yellow-300 text-base font-semibold"
                onClick={() => {
                  window.location.href = "/login?next=%2F";
                }}
              >
                Sign in to continue
              </Button>
              <p className="text-xs text-neutral-500 text-center">
                Signing in keeps your purchase on every device you use.
              </p>
            </>
          ) : (
            <>
              <Button
                className="w-full h-11 bg-yellow-400 text-neutral-950 hover:bg-yellow-300 text-base font-semibold"
                disabled={!isPaymentsConfigured()}
                onClick={() => {
                  setError(null);
                  if (!isPaymentsConfigured()) {
                    setError("Payments are not set up yet. Please try again later.");
                    return;
                  }
                  setState("paying");
                }}
              >
                Buy SoupyTag — $2.99
              </Button>
              <Button
                variant="outline"
                className="w-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 hover:text-neutral-100"
                onClick={async () => {
                  setError(null);
                  const mine = await getMyUnlock().catch(() => ({ unlocked: false }));
                  if (mine.unlocked) markUnlocked();
                  else setError("No purchase found on this account yet.");
                }}
              >
                I already bought it
              </Button>
              <button
                type="button"
                className="w-full text-xs text-neutral-500 hover:text-neutral-300"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setState("signed-out");
                }}
              >
                Signed in as {email ?? "you"} — sign out
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
