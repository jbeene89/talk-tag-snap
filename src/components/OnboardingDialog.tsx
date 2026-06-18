import { useState } from "react";
import { Camera, Check, Mic, Share2, Sparkles } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAnalytics } from "@/lib/analytics";

const ONBOARDING_KEY = "soupytag:onboarding:v1:complete";

const STEPS = [
  {
    eyebrow: "01 / CAPTURE",
    title: "Start with what you see.",
    body: "Take a photo, choose one from your device, or pull the exact frame from a video.",
    icon: Camera,
  },
  {
    eyebrow: "02 / LOCATE",
    title: "Point. Box. Auto-find.",
    body: "Let AI locate objects, tap a precise spot, or draw the boundary yourself.",
    icon: Sparkles,
  },
  {
    eyebrow: "03 / EXPLAIN",
    title: "Add the detail that matters.",
    body: "Dictate or type a note, then mark it as info, minor, or major.",
    icon: Mic,
  },
  {
    eyebrow: "04 / SEND",
    title: "Make the problem obvious.",
    body: "Export a clean marked-up image or share it directly with your team.",
    icon: Share2,
  },
] as const;

export function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ONBOARDING_KEY) === "1";
}

export function OnboardingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const analytics = useAnalytics();
  const current = STEPS[step];
  const Icon = current.icon;

  const finish = (skipped: boolean) => {
    window.localStorage.setItem(ONBOARDING_KEY, "1");
    analytics.capture(skipped ? "onboarding_skipped" : "onboarding_completed", {
      last_step: step + 1,
    });
    setStep(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(true)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-md overflow-hidden border-neutral-700 bg-neutral-950 p-0 text-neutral-100 shadow-2xl shadow-black sm:rounded-[2rem]">
        <div className="relative min-h-[34rem] overflow-hidden px-6 pb-6 pt-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-yellow-400/15 blur-3xl" />
          <div className="relative">
            <div className="flex gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
              {STEPS.map((item, index) => (
                <div
                  key={item.eyebrow}
                  className={`h-1 flex-1 rounded-full ${index <= step ? "bg-yellow-400" : "bg-neutral-800"}`}
                />
              ))}
            </div>

            <p className="mt-8 font-mono text-[11px] font-bold tracking-[0.22em] text-yellow-400">
              {current.eyebrow}
            </p>
            <DialogTitle className="mt-3 max-w-xs text-left text-3xl font-black leading-[1.05] tracking-[-0.04em]">
              {current.title}
            </DialogTitle>
            <DialogDescription className="mt-3 max-w-sm text-left text-base leading-6 text-neutral-400">
              {current.body}
            </DialogDescription>

            <div className="relative mt-8 flex h-52 items-center justify-center overflow-hidden rounded-[1.75rem] border border-neutral-800 bg-neutral-900">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(250,204,21,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(250,204,21,.15)_1px,transparent_1px)] [background-size:24px_24px]" />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl border border-yellow-400/30 bg-yellow-400/10 shadow-[0_0_70px_rgba(250,204,21,.16)]">
                <Icon className="h-12 w-12 text-yellow-400" strokeWidth={1.8} />
              </div>
              {step === 1 && (
                <div className="absolute left-[26%] top-[28%] h-[42%] w-[48%] rounded border-2 border-yellow-400">
                  <span className="absolute -top-6 left-0 rounded bg-yellow-400 px-2 py-0.5 text-[10px] font-bold text-neutral-950">
                    1. valve
                  </span>
                </div>
              )}
              {step === 2 && (
                <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                  {[
                    ["INFO", "bg-sky-400"],
                    ["MINOR", "bg-yellow-400"],
                    ["MAJOR", "bg-red-500"],
                  ].map(([label, color]) => (
                    <span
                      key={label}
                      className={`flex-1 rounded-md py-1 text-center text-[9px] font-black text-neutral-950 ${color}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {step === 3 && (
                <div className="absolute bottom-5 flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-xs font-black text-neutral-950">
                  <Share2 className="h-4 w-4" /> READY TO SHARE
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => finish(true)}
                className="min-h-12 rounded-xl px-3 text-sm font-semibold text-neutral-400 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
              >
                Skip
              </button>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((value) => value - 1)}
                  className="min-h-12 rounded-xl border border-neutral-700 px-4 text-sm font-bold text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  step === STEPS.length - 1 ? finish(false) : setStep((value) => value + 1)
                }
                className="ml-auto flex min-h-12 min-w-32 items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 text-sm font-black text-neutral-950 hover:bg-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
              >
                {step === STEPS.length - 1 ? (
                  <>
                    <Check className="h-4 w-4" /> Start tagging
                  </>
                ) : (
                  "Next"
                )}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
