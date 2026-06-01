import { Sparkles, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FREE_LIMIT } from "@/lib/usage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: () => void;
};

export function PaywallDialog({ open, onOpenChange, onUnlock }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 sm:max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-yellow-400 flex items-center justify-center mb-2">
            <Sparkles className="w-6 h-6 text-neutral-950" />
          </div>
          <DialogTitle className="text-xl">You've used your {FREE_LIMIT} free tags</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Unlock unlimited AI tagging for a one-time payment of <span className="text-neutral-100 font-semibold">$2.99</span>. No subscription, no account needed.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {[
            "Unlimited AI auto-scans",
            "Unlimited tap-to-identify",
            "Unlimited box-to-identify",
            "Works forever on this device",
          ].map((line) => (
            <li key={line} className="flex items-center gap-2 text-sm text-neutral-200">
              <Check className="w-4 h-4 text-yellow-400 shrink-0" />
              {line}
            </li>
          ))}
        </ul>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={onUnlock}
            className="w-full bg-yellow-400 text-neutral-950 hover:bg-yellow-300 h-11 text-base font-semibold"
          >
            Unlock for $2.99
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
          >
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
