import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bug, CheckCircle2, Lightbulb, Loader2, Mail, MessageSquare } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAnalytics } from "@/lib/analytics";
import { submitFeedback } from "@/lib/feedback.functions";

type Category = "bug" | "idea" | "other";

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const submit = useServerFn(submitFeedback);
  const analytics = useAnalytics();
  const [category, setCategory] = useState<Category>("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "error">("idle");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("busy");
    try {
      await submit({
        data: {
          category,
          message,
          email,
          website,
          analyticsDistinctId: analytics.distinctId ?? undefined,
          diagnostics: includeDiagnostics
            ? {
                appVersion: "1.2.1",
                platform: navigator.platform || "unknown",
                userAgent: navigator.userAgent,
              }
            : undefined,
        },
      });
      analytics.capture("feedback_sent", {
        category,
        has_email: Boolean(email),
        has_diagnostics: includeDiagnostics,
      });
      setStatus("sent");
      setMessage("");
    } catch (error) {
      analytics.captureException(error, { flow: "feedback" });
      setStatus("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-md border-neutral-700 bg-neutral-950 text-neutral-100 sm:rounded-[1.5rem]">
        <DialogTitle className="text-2xl font-black tracking-[-0.03em]">
          Tell us what you found.
        </DialogTitle>
        <DialogDescription className="text-neutral-400">
          Report a bug or suggest an improvement. Photos and annotation text are never attached.
        </DialogDescription>

        {status === "sent" ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-12 w-12 text-yellow-400" />
            <h3 className="mt-4 text-xl font-black">Feedback received</h3>
            <p className="mt-2 max-w-xs text-sm text-neutral-400">
              Thank you for helping make SoupyTag sharper.
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-6 min-h-12 rounded-xl bg-yellow-400 px-6 font-black text-neutral-950"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-2" aria-label="Feedback category">
              {[
                ["bug", "Bug", Bug],
                ["idea", "Idea", Lightbulb],
                ["other", "Other", MessageSquare],
              ].map(([value, label, Icon]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setCategory(value as Category)}
                  aria-pressed={category === value}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${
                    category === value
                      ? "border-yellow-400 bg-yellow-400 text-neutral-950"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {String(label)}
                </button>
              ))}
            </div>

            <label className="block text-sm font-bold">
              Message
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened, or what would make the app better?"
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 font-normal text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-yellow-400"
              />
              <span className="mt-1 block text-right font-mono text-[10px] text-neutral-500">
                {message.length}/2000
              </span>
            </label>

            <label className="block text-sm font-bold">
              Reply email <span className="font-normal text-neutral-500">(optional)</span>
              <div className="relative mt-2">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-neutral-500" />
                <input
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="min-h-12 w-full rounded-xl border border-neutral-700 bg-neutral-900 pl-10 pr-3 text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                />
              </div>
            </label>

            <label className="flex items-start justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
              <span>
                <span className="block text-sm font-bold">Include device details</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">
                  App version, platform, and browser engine only.
                </span>
              </span>
              <Switch
                checked={includeDiagnostics}
                onCheckedChange={setIncludeDiagnostics}
                aria-label="Include device details"
              />
            </label>

            <input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            {status === "error" && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
              >
                Feedback could not be sent. You can email{" "}
                <a className="font-bold underline" href="mailto:hello@soupytag.company">
                  hello@soupytag.company
                </a>
                .
              </div>
            )}

            <button
              type="submit"
              disabled={status === "busy" || message.trim().length < 10}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 font-black text-neutral-950 disabled:opacity-40"
            >
              {status === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {status === "busy" ? "Sending..." : "Send feedback"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
