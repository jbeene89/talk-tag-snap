import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Mic, Download, Share2, X, RotateCcw, Loader2, Sparkles } from "lucide-react";
import { detectBoundingBox, scanObjects } from "@/lib/detect.functions";

export const Route = createFileRoute("/")({
  component: AnnotatePage,
  head: () => ({
    meta: [
      { title: "Photo Annotator — Tap, Talk, Tag" },
      { name: "description", content: "Snap a photo, say what to highlight, and the app marks it for you." },
    ],
  }),
});

type Annotation = {
  id: string;
  label: string;
  box: { x: number; y: number; w: number; h: number } | null;
};

function AnnotatePage() {
  const detect = useServerFn(detectBoundingBox);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSpeechSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setTranscript(text);
      if (text) handleDetect(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e: any) => {
      setListening(false);
      setError(e?.error === "not-allowed" ? "Microphone permission denied." : "Couldn't hear that. Try again.");
    };
    recognitionRef.current = rec;
    return () => {
      try { rec.abort(); } catch {}
    };
  }, [imageDataUrl]); // rebind ok

  const handleFile = (file: File) => {
    setError(null);
    setAnnotations([]);
    setTranscript("");
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
        setImageDataUrl(url);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const handleDetect = useCallback(
    async (phrase: string) => {
      if (!imageDataUrl) return;
      setProcessing(true);
      setError(null);
      try {
        const mime = imageDataUrl.substring(5, imageDataUrl.indexOf(";"));
        const result = await detect({ data: { imageBase64: imageDataUrl, mimeType: mime, phrase } });
        if (result.error) setError(result.error);
        if (!result.box) {
          setError((prev) => prev ?? `Couldn't find "${phrase}" in the photo. Try more detail.`);
        } else {
          setAnnotations((prev) => [
            ...prev,
            { id: `${Date.now()}`, label: result.label, box: result.box },
          ]);
          setTranscript("");
        }
      } catch (e) {
        console.error(e);
        setError("Something went wrong. Try again.");
      } finally {
        setProcessing(false);
      }
    },
    [imageDataUrl, detect],
  );

  const startListening = () => {
    if (!recognitionRef.current || listening || processing) return;
    setError(null);
    setTranscript("");
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // already started
    }
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const reset = () => {
    setImageDataUrl(null);
    setImageSize(null);
    setAnnotations([]);
    setTranscript("");
    setError(null);
  };

  const exportImage = async (share: boolean) => {
    if (!imageDataUrl || !imageSize) return;
    const canvas = document.createElement("canvas");
    canvas.width = imageSize.w;
    canvas.height = imageSize.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.src = imageDataUrl;
    await new Promise((res) => (img.onload = res));
    ctx.drawImage(img, 0, 0);

    const strokeW = Math.max(4, Math.round(imageSize.w * 0.006));
    const fontSize = Math.max(20, Math.round(imageSize.w * 0.028));
    ctx.lineWidth = strokeW;
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";

    annotations.forEach((a) => {
      if (!a.box) return;
      const x = a.box.x * imageSize.w;
      const y = a.box.y * imageSize.h;
      const w = a.box.w * imageSize.w;
      const h = a.box.h * imageSize.h;
      ctx.strokeStyle = "#facc15";
      ctx.strokeRect(x, y, w, h);
      const pad = fontSize * 0.4;
      const textW = ctx.measureText(a.label).width + pad * 2;
      const textH = fontSize + pad * 1.2;
      const ty = y - textH < 0 ? y + strokeW : y - textH;
      ctx.fillStyle = "#facc15";
      ctx.fillRect(x, ty, textW, textH);
      ctx.fillStyle = "#111827";
      ctx.fillText(a.label, x + pad, ty + pad * 0.6);
    });

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `annotated-${Date.now()}.jpg`, { type: "image/jpeg" });
      if (share && (navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
        try {
          await (navigator as any).share({ files: [file], title: "Annotated photo" });
          return;
        } catch {
          // fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/jpeg", 0.92);
  };

  // ---------- Capture screen ----------
  if (!imageDataUrl) {
    return (
      <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
        <header className="px-5 pt-8 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Tap. Talk. Tag.</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Snap a photo, say what's in it, and the app highlights it for you.
          </p>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-xs aspect-square rounded-3xl bg-yellow-400 text-neutral-950 flex flex-col items-center justify-center gap-3 shadow-2xl shadow-yellow-400/20 active:scale-95 transition-transform"
          >
            <Camera className="w-16 h-16" strokeWidth={2.2} />
            <span className="text-xl font-semibold">Take Photo</span>
          </button>
          <p className="text-xs text-neutral-500 mt-6 text-center max-w-xs">
            Opens your camera. Or pick an existing photo from your gallery.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  // ---------- Annotate screen ----------
  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-sm text-neutral-300 active:text-white"
        >
          <RotateCcw className="w-4 h-4" /> New
        </button>
        <span className="text-sm font-medium text-neutral-400">
          {annotations.length} tag{annotations.length === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => exportImage(false)}
            disabled={annotations.length === 0}
            className="p-2 rounded-lg bg-neutral-800 disabled:opacity-40 active:bg-neutral-700"
            aria-label="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => exportImage(true)}
            disabled={annotations.length === 0}
            className="p-2 rounded-lg bg-yellow-400 text-neutral-950 disabled:opacity-40 active:bg-yellow-300"
            aria-label="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        <div className="relative max-h-full max-w-full">
          <img
            src={imageDataUrl}
            alt="Captured"
            className="block max-h-[calc(100vh-220px)] max-w-full object-contain"
          />
          {/* Boxes overlay (positioned by % over the image) */}
          <div className="absolute inset-0 pointer-events-none">
            {annotations.map((a) =>
              a.box ? (
                <div
                  key={a.id}
                  className="absolute border-[3px] border-yellow-400"
                  style={{
                    left: `${a.box.x * 100}%`,
                    top: `${a.box.y * 100}%`,
                    width: `${a.box.w * 100}%`,
                    height: `${a.box.h * 100}%`,
                  }}
                >
                  <span className="absolute -top-6 left-0 bg-yellow-400 text-neutral-950 text-xs font-semibold px-1.5 py-0.5 rounded">
                    {a.label}
                  </span>
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Status / transcript / errors */}
      <div className="px-4 pt-2 min-h-[2rem] text-center text-sm">
        {processing && (
          <span className="inline-flex items-center gap-2 text-neutral-300">
            <Loader2 className="w-4 h-4 animate-spin" /> Finding "{transcript}"…
          </span>
        )}
        {!processing && listening && (
          <span className="text-yellow-400 font-medium">Listening… say what to highlight</span>
        )}
        {!processing && !listening && transcript && (
          <span className="text-neutral-400">Heard: "{transcript}"</span>
        )}
        {error && <div className="text-red-400 mt-1">{error}</div>}
      </div>

      {/* Annotation chips */}
      {annotations.length > 0 && (
        <div className="px-4 py-2 flex gap-2 flex-wrap">
          {annotations.map((a) => (
            <button
              key={a.id}
              onClick={() => removeAnnotation(a.id)}
              className="flex items-center gap-1 bg-neutral-800 text-neutral-200 text-xs px-2 py-1 rounded-full active:bg-neutral-700"
            >
              {a.label}
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {/* Mic button */}
      <div className="px-4 pt-2 pb-6 flex justify-center">
        {speechSupported ? (
          <button
            onClick={startListening}
            disabled={listening || processing}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
              listening
                ? "bg-red-500 animate-pulse"
                : "bg-yellow-400 text-neutral-950 disabled:opacity-50"
            }`}
            aria-label="Talk to highlight"
          >
            <Mic className="w-8 h-8" strokeWidth={2.2} />
          </button>
        ) : (
          <TypeFallback onSubmit={handleDetect} disabled={processing} />
        )}
      </div>
    </div>
  );
}

function TypeFallback({ onSubmit, disabled }: { onSubmit: (s: string) => void; disabled: boolean }) {
  const [v, setV] = useState("");
  return (
    <form
      className="w-full max-w-sm flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) {
          onSubmit(v.trim());
          setV("");
        }
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Type what to highlight…"
        className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
      />
      <button
        type="submit"
        disabled={disabled || !v.trim()}
        className="px-4 rounded-lg bg-yellow-400 text-neutral-950 font-medium disabled:opacity-40"
      >
        Tag
      </button>
    </form>
  );
}
