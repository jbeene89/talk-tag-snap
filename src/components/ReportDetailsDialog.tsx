import { FileText } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { ExportFormat } from "@/lib/prefs";

export type ReportDetails = {
  title: string;
  reference: string;
};

export function ReportDetailsDialog({
  open,
  onOpenChange,
  details,
  onDetailsChange,
  exportFormat,
  onExportFormatChange,
  haptics,
  onHapticsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: ReportDetails;
  onDetailsChange: (next: ReportDetails) => void;
  exportFormat: ExportFormat;
  onExportFormatChange: (next: ExportFormat) => void;
  haptics: boolean;
  onHapticsChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-md border-neutral-700 bg-neutral-950 text-neutral-100 sm:rounded-[1.5rem]">
        <DialogTitle className="flex items-center gap-2 text-2xl font-black tracking-[-0.03em]">
          <FileText className="h-5 w-5 text-yellow-400" /> Report details
        </DialogTitle>
        <DialogDescription className="text-neutral-400">
          A title and reference print on the shared image and the copied summary. Both are optional.
        </DialogDescription>

        <div className="mt-2 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Report title
            </span>
            <input
              value={details.title}
              onChange={(e) => onDetailsChange({ ...details, title: e.target.value.slice(0, 80) })}
              placeholder="e.g. Roof survey — Building C"
              aria-label="Report title"
              className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Reference / location
            </span>
            <input
              value={details.reference}
              onChange={(e) =>
                onDetailsChange({ ...details, reference: e.target.value.slice(0, 80) })
              }
              placeholder="e.g. Unit 4B, asset #10293"
              aria-label="Reference or location"
              className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
            />
          </label>

          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Export format
            </span>
            <div className="mt-1 flex gap-1.5">
              {(["jpg", "png"] as const).map((fmt) => {
                const active = exportFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => onExportFormatChange(fmt)}
                    aria-pressed={active}
                    className={`flex-1 rounded-md border py-2 text-xs font-semibold transition-colors ${
                      active
                        ? "border-transparent bg-yellow-400 text-neutral-950"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {fmt === "jpg" ? "JPG (smaller)" : "PNG (lossless)"}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2.5">
            <span className="text-sm text-neutral-200">
              Vibrate when a tag is placed
              <span className="mt-0.5 block text-xs text-neutral-500">
                Light haptic feedback on supported devices.
              </span>
            </span>
            <Switch
              checked={haptics}
              onCheckedChange={onHapticsChange}
              aria-label="Vibrate when a tag is placed"
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
