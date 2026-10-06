import { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  videoFile: File;
  initialTime?: number;
  onCancel: () => void;
  onPickFrame: (frameFile: File, atTime: number) => void | Promise<void>;
  continuous?: boolean;
  pickedCount?: number;
  captureDisabled?: boolean;
  onDone?: () => void;
  feedback?: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Lets the user scrub through an uploaded video and grab any single frame.
 * That frame is handed back to the parent as a JPEG File, which then flows
 * into the normal photo-tagging pipeline.
 */
export function VideoFramePicker({
  videoFile,
  initialTime = 0,
  onCancel,
  onPickFrame,
  continuous = false,
  pickedCount = 0,
  captureDisabled = false,
  onDone,
  feedback,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [videoUrl, setVideoUrl] = useState<string>("");
  useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  const handleLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setReady(true);
    // Nudge currentTime so iOS/Android actually paints the first frame
    // instead of showing a black box until the user scrubs.
    try {
      const start = initialTime > 0 ? Math.min(initialTime, v.duration || initialTime) : 0.001;
      v.currentTime = start;
      setCurrent(start);
    } catch {
      // ignore
    }
  };

  const handleSeek = (value: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = value;
    setCurrent(value);
  };

  const step = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.max(0, Math.min(duration, (v.currentTime || 0) + delta));
    handleSeek(next);
  };

  const handleGrabFrame = async () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    setGrabbing(true);
    setError(null);
    try {
      // Wait for the seek to settle so we actually capture the displayed frame.
      v.pause();
      await new Promise<void>((resolve, reject) => {
        if (!v.seeking && v.readyState >= 2) {
          resolve();
          return;
        }
        const onSeeked = () => {
          clearTimeout(timeout);
          v.removeEventListener("seeked", onSeeked);
          resolve();
        };
        const timeout = setTimeout(() => {
          v.removeEventListener("seeked", onSeeked);
          reject(new Error("The video is still loading. Wait a moment and capture again."));
        }, 5000);
        v.addEventListener("seeked", onSeeked);
      });

      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) {
        setError("Couldn't read this video. Try a different file.");
        setGrabbing(false);
        return;
      }
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) {
        setError("Couldn't read this video. Try a different file.");
        setGrabbing(false);
        return;
      }
      ctx.drawImage(v, 0, 0, w, h);
      const blob: Blob | null = await new Promise((resolve) =>
        c.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) {
        setError("Couldn't capture that frame. Try another moment.");
        setGrabbing(false);
        return;
      }
      const file = new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" });
      await onPickFrame(file, v.currentTime || 0);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong reading the video.");
    } finally {
      setGrabbing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950 text-neutral-100 flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <button
          onClick={onCancel}
          disabled={grabbing || captureDisabled}
          className="flex items-center gap-1.5 text-sm text-neutral-300 active:text-white"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
        <span className="text-sm font-medium text-neutral-400">
          {continuous ? `Context Trail · ${pickedCount} frames` : "Pick a frame to tag"}
        </span>
        {continuous ? (
          <button
            className="min-h-11 px-3 font-semibold text-yellow-400 disabled:opacity-40"
            onClick={onDone}
            disabled={grabbing}
          >
            Done
          </button>
        ) : (
          <span className="w-12" />
        )}
      </header>

      <div className="flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          onLoadedMetadata={handleLoaded}
          onLoadedData={() => setReady(true)}
          onTimeUpdate={(e) => setCurrent((e.target as HTMLVideoElement).currentTime)}
          playsInline
          muted
          controls
          preload="auto"
          className="max-h-full max-w-full"
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="shrink-0 px-4 pt-3 pb-5 border-t border-neutral-800 bg-neutral-950 space-y-3">
        <div className="flex items-center gap-3 text-xs text-neutral-400 font-mono">
          <span>{formatTime(current)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={current}
            disabled={!ready}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="flex-1 accent-yellow-400"
            aria-label="Seek video to pick a frame"
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => step(-1)}
            disabled={!ready}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 text-xs text-neutral-200 active:bg-neutral-700 disabled:opacity-40"
          >
            −1s
          </button>
          <button
            onClick={() => step(-0.1)}
            disabled={!ready}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 text-xs text-neutral-200 active:bg-neutral-700 disabled:opacity-40"
          >
            −0.1s
          </button>
          <button
            onClick={() => step(0.1)}
            disabled={!ready}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 text-xs text-neutral-200 active:bg-neutral-700 disabled:opacity-40"
          >
            +0.1s
          </button>
          <button
            onClick={() => step(1)}
            disabled={!ready}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 text-xs text-neutral-200 active:bg-neutral-700 disabled:opacity-40"
          >
            +1s
          </button>
        </div>

        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        {continuous && feedback && (
          <p className="text-xs text-yellow-300 text-center" role="status">
            {feedback}
          </p>
        )}

        <Button
          onClick={handleGrabFrame}
          disabled={!ready || grabbing || captureDisabled}
          className="w-full h-12 bg-yellow-400 text-neutral-950 hover:bg-yellow-300 text-base font-semibold"
        >
          {grabbing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Capturing…
            </>
          ) : (
            <>
              <Camera className="w-5 h-5" /> {continuous ? "Add frame to trail" : "Use this frame"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
