import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  ExternalLink,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Star,
} from "lucide-react";

import { FeedbackDialog } from "@/components/FeedbackDialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAnalytics } from "@/lib/analytics";
import { restorePurchases } from "@/lib/billing";
import { openStoreListing } from "@/lib/native";

export function SettingsDialog({
  open,
  onOpenChange,
  onReplayOnboarding,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplayOnboarding: () => void;
  onUnlocked: () => void;
}) {
  const analytics = useAnalytics();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  const rowClass =
    "flex min-h-14 w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 text-left text-sm font-bold text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto border-neutral-700 bg-neutral-950 text-neutral-100 sm:rounded-[1.5rem]">
          <div>
            <p className="font-mono text-[10px] font-black tracking-[0.22em] text-yellow-400">
              SOUPYTAG / SETTINGS
            </p>
            <DialogTitle className="mt-2 text-3xl font-black tracking-[-0.04em]">
              Keep the field moving.
            </DialogTitle>
            <DialogDescription className="mt-2 text-neutral-400">
              Guidance, support, privacy, and purchase controls.
            </DialogDescription>
          </div>

          <div className="space-y-2">
            <button type="button" className={rowClass} onClick={onReplayOnboarding}>
              <BookOpen className="h-5 w-5 text-yellow-400" /> Replay walkthrough
            </button>
            <button type="button" className={rowClass} onClick={() => setFeedbackOpen(true)}>
              <MessageSquare className="h-5 w-5 text-yellow-400" /> Send feedback
            </button>
            <button
              type="button"
              className={rowClass}
              onClick={async () => {
                analytics.capture("store_rating_link_opened");
                await openStoreListing();
              }}
            >
              <Star className="h-5 w-5 text-yellow-400" /> Rate SoupyTag
              <ExternalLink className="ml-auto h-4 w-4 text-neutral-500" />
            </button>
            <button
              type="button"
              className={rowClass}
              onClick={async () => {
                setRestoreStatus("Checking Google Play...");
                const result = await restorePurchases();
                if (result.ok) {
                  onUnlocked();
                  setRestoreStatus("Purchase restored.");
                  analytics.capture("purchase_restored");
                } else {
                  setRestoreStatus(result.message ?? "No purchase found on this Google account.");
                }
              }}
            >
              <RotateCcw className="h-5 w-5 text-yellow-400" /> Restore purchase
            </button>
            {restoreStatus && (
              <p role="status" className="px-2 text-xs text-neutral-400">
                {restoreStatus}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold">
                  <BarChart3 className="h-4 w-4 text-yellow-400" /> Help improve SoupyTag
                </div>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Share anonymous feature usage only. Never photos, labels, prompts, voice, email,
                  or feedback text.
                </p>
              </div>
              <Switch
                checked={analytics.consent === "granted"}
                onCheckedChange={(checked) => analytics.setConsent(checked ? "granted" : "denied")}
                aria-label="Share anonymous usage analytics"
              />
            </div>
          </div>

          <a href="/privacy" className={`${rowClass} no-underline`}>
            <ShieldCheck className="h-5 w-5 text-yellow-400" /> Privacy policy
            <ExternalLink className="ml-auto h-4 w-4 text-neutral-500" />
          </a>

          <div className="border-t border-neutral-800 pt-4 text-xs leading-5 text-neutral-500">
            <p className="font-bold text-neutral-300">SoupyTag 1.2.1</p>
            <p>Package: com.soupytag.app</p>
            <p>AI add-on coming soon. Existing unlimited purchases remain recognized.</p>
          </div>
        </DialogContent>
      </Dialog>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
