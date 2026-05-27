import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Mic,
  Download,
  Share2,
  RotateCcw,
  Loader2,
  Sparkles,
  Hand,
  Square,
  Check,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";

import { scanObjects, identifyAtPoint, identifyInBox } from "@/lib/detect.functions";

export const Route = createFileRoute("/")({
  component: AnnotatePage,
  head: () => ({
    meta: [
      { title: "Tag Defects — Tap, Outline, Describe" },
      {
        name: "description",
        content:
          "Snap a photo of broken things or construction mistakes. AI outlines the spot, you describe the problem.",
      },
    ],
  }),
});

type Box = { x: number; y: number; w: number; h: number };
type Annotation = {
  id: string;
  label: string;
  box: Box;
};

type DragKind = "move" | "nw" | "ne" | "sw" | "se" | null;

function AnnotatePage() {
  const scan = useServerFn(scanObjects);
  const identify = useServerFn(identifyAtPoint);
  const identifyBox = useServerFn(identifyInBox);

  const [tapMode, setTapMode] = useState(false);
  const [boxMode, setBoxMode] = useState(false);
  const [drawing, setDrawing] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const drawingRef = useRef<{ active: boolean; start: { x: number; y: number } | null }>({
    active: false,
    start: null,
  });

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [past, setPast] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);

  // Speech recognition — dictates into the caption draft
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
      if (text) {
        setCaptionDraft((prev) => (prev ? `${prev} ${text}` : text));
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e: any) => {
      setListening(false);
      setError(e?.error === "not-allowed" ? "Microphone permission denied." : "Couldn't hear that. Try again.");
    };
    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {}
    };
  }, []);

  const handleFile = (file: File) => {
    setError(null);
    setAnnotations([]);
    setSelectedId(null);
    setCaptionDraft("");
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

  // ---- History (undo/redo) ----

  const HISTORY_LIMIT = 50;
  const commit = useCallback((snapshot: Annotation[]) => {
    setPast((p) => {
      const next = [...p, snapshot];
      if (next.length > HISTORY_LIMIT) next.shift();
      return next;
    });
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setAnnotations((curr) => {
        setFuture((f) => [...f, curr]);
        return prev;
      });
      setSelectedId(null);
      setCaptionDraft("");
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      setAnnotations((curr) => {
        setPast((p) => [...p, curr]);
        return next;
      });
      setSelectedId(null);
      setCaptionDraft("");
      return f.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---- Annotation creation ----

  const addAnnotationAndSelect = useCallback(
    (box: Box) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setAnnotations((prev) => {
        commit(prev);
        return [...prev, { id, label: "", box }];
      });
      setSelectedId(id);
      setCaptionDraft("");
      // Focus caption input after sheet renders
      requestAnimationFrame(() => captionInputRef.current?.focus());
    },
    [commit],
  );


  const handleAutoScan = async () => {
    if (!imageDataUrl || processing) return;
    setProcessing(true);
    setBusyText("Scanning photo…");
    setError(null);
    try {
      const mime = imageDataUrl.substring(5, imageDataUrl.indexOf(";"));
      const result = await scan({ data: { imageBase64: imageDataUrl, mimeType: mime } });
      if (result.error) setError(result.error);
      if (!result.items.length) {
        setError((prev) => prev ?? "No objects found. Try tap or box mode.");
      } else {
        // Add all boxes with blank labels — user captions each one.
        const newOnes = result.items.map((it, i) => ({
          id: `auto-${Date.now()}-${i}`,
          label: "",
          box: it.box,
        }));
        setAnnotations((prev) => [...prev, ...newOnes]);
        // Select the first new one for captioning
        setSelectedId(newOnes[0].id);
        setCaptionDraft("");
        requestAnimationFrame(() => captionInputRef.current?.focus());
      }
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Try again.");
    } finally {
      setProcessing(false);
      setBusyText("");
    }
  };

  const handleImageTap = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tapMode || !imageDataUrl || processing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setProcessing(true);
    setBusyText("Outlining tapped spot…");
    setError(null);
    try {
      const mime = imageDataUrl.substring(5, imageDataUrl.indexOf(";"));
      const result = await identify({
        data: { imageBase64: imageDataUrl, mimeType: mime, point: { x, y } },
      });
      if (result.error) setError(result.error);
      if (!result.box) {
        // Fallback: drop a small box at the tap point so the user still gets an annotation
        const fallback: Box = {
          x: Math.max(0, x - 0.05),
          y: Math.max(0, y - 0.05),
          w: 0.1,
          h: 0.1,
        };
        addAnnotationAndSelect(fallback);
        setError("AI couldn't outline that spot. Drag the box to position it.");
      } else {
        addAnnotationAndSelect(result.box);
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Try again.");
    } finally {
      setProcessing(false);
      setBusyText("");
    }
  };

  // ---- Drawing a new box (Box mode) ----

  const getPointerPos = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!boxMode || processing) return;
    e.preventDefault();
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    const p = getPointerPos(e);
    drawingRef.current = { active: true, start: p };
    setDrawing({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!boxMode || !drawingRef.current.active || !drawingRef.current.start) return;
    const p = getPointerPos(e);
    setDrawing({
      x1: drawingRef.current.start.x,
      y1: drawingRef.current.start.y,
      x2: p.x,
      y2: p.y,
    });
  };

  const handlePointerUp = async () => {
    if (!boxMode || !drawingRef.current.active || !drawingRef.current.start) return;
    drawingRef.current = { active: false, start: null };
    const d = drawing;
    setDrawing(null);
    if (!d || !imageDataUrl) return;
    const userBox: Box = {
      x: Math.min(d.x1, d.x2),
      y: Math.min(d.y1, d.y2),
      w: Math.abs(d.x2 - d.x1),
      h: Math.abs(d.y2 - d.y1),
    };
    if (userBox.w < 0.02 || userBox.h < 0.02) return;

    // Ask AI to tighten the box, but if it fails, just use the drawn box.
    setProcessing(true);
    setBusyText("Tightening outline…");
    setError(null);
    try {
      const mime = imageDataUrl.substring(5, imageDataUrl.indexOf(";"));
      const result = await identifyBox({
        data: { imageBase64: imageDataUrl, mimeType: mime, region: userBox },
      });
      addAnnotationAndSelect(result?.box ?? userBox);
    } catch (err) {
      console.error(err);
      addAnnotationAndSelect(userBox);
    } finally {
      setProcessing(false);
      setBusyText("");
    }
  };

  // ---- Move / resize selected annotation ----

  const moveRef = useRef<{
    kind: DragKind;
    id: string | null;
    startBox: Box | null;
    startPos: { x: number; y: number } | null;
  }>({ kind: null, id: null, startBox: null, startPos: null });

  const getContainerPos = (clientX: number, clientY: number) => {
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const startBoxDrag = (e: React.PointerEvent, id: string, kind: DragKind, box: Box) => {
    if (tapMode || boxMode) return; // don't conflict with drawing modes
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    const pos = getContainerPos(e.clientX, e.clientY);
    if (!pos) return;
    setSelectedId(id);
    moveRef.current = { kind, id, startBox: { ...box }, startPos: pos };
  };

  const onBoxDragMove = (e: React.PointerEvent) => {
    const m = moveRef.current;
    if (!m.kind || !m.id || !m.startBox || !m.startPos) return;
    const pos = getContainerPos(e.clientX, e.clientY);
    if (!pos) return;
    const dx = pos.x - m.startPos.x;
    const dy = pos.y - m.startPos.y;
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== m.id) return a;
        const b = { ...m.startBox! };
        if (m.kind === "move") {
          b.x = Math.max(0, Math.min(1 - b.w, b.x + dx));
          b.y = Math.max(0, Math.min(1 - b.h, b.y + dy));
        } else {
          let x1 = b.x;
          let y1 = b.y;
          let x2 = b.x + b.w;
          let y2 = b.y + b.h;
          if (m.kind === "nw") {
            x1 = Math.max(0, Math.min(x2 - 0.02, b.x + dx));
            y1 = Math.max(0, Math.min(y2 - 0.02, b.y + dy));
          } else if (m.kind === "ne") {
            x2 = Math.max(x1 + 0.02, Math.min(1, b.x + b.w + dx));
            y1 = Math.max(0, Math.min(y2 - 0.02, b.y + dy));
          } else if (m.kind === "sw") {
            x1 = Math.max(0, Math.min(x2 - 0.02, b.x + dx));
            y2 = Math.max(y1 + 0.02, Math.min(1, b.y + b.h + dy));
          } else if (m.kind === "se") {
            x2 = Math.max(x1 + 0.02, Math.min(1, b.x + b.w + dx));
            y2 = Math.max(y1 + 0.02, Math.min(1, b.y + b.h + dy));
          }
          b.x = x1;
          b.y = y1;
          b.w = x2 - x1;
          b.h = y2 - y1;
        }
        return { ...a, box: b };
      }),
    );
  };

  const endBoxDrag = () => {
    moveRef.current = { kind: null, id: null, startBox: null, startPos: null };
  };

  // ---- Caption helpers ----

  const saveCaption = () => {
    if (!selectedId) return;
    setAnnotations((prev) =>
      prev.map((a) => (a.id === selectedId ? { ...a, label: captionDraft.trim() } : a)),
    );
    setSelectedId(null);
    setCaptionDraft("");
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
    setCaptionDraft("");
  };

  const selectExisting = (id: string) => {
    if (tapMode || boxMode) return;
    const a = annotations.find((x) => x.id === id);
    if (!a) return;
    setSelectedId(id);
    setCaptionDraft(a.label);
    requestAnimationFrame(() => captionInputRef.current?.focus());
  };

  const startListening = () => {
    if (!recognitionRef.current || listening || processing) return;
    setError(null);
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // already started
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current || !listening) return;
    try {
      recognitionRef.current.stop();
    } catch {}
  };

  const reset = () => {
    setImageDataUrl(null);
    setImageSize(null);
    setAnnotations([]);
    setSelectedId(null);
    setCaptionDraft("");
    setError(null);
    setTapMode(false);
    setBoxMode(false);
  };

  // ---- Export ----

  const exportImage = async (share: boolean) => {
    if (!imageDataUrl || !imageSize) return;
    // Auto-save any in-progress caption first
    let exportList = annotations;
    if (selectedId) {
      exportList = annotations.map((a) =>
        a.id === selectedId ? { ...a, label: captionDraft.trim() } : a,
      );
      setAnnotations(exportList);
      setSelectedId(null);
      setCaptionDraft("");
    }

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

    exportList.forEach((a) => {
      const x = a.box.x * imageSize.w;
      const y = a.box.y * imageSize.h;
      const w = a.box.w * imageSize.w;
      const h = a.box.h * imageSize.h;
      ctx.strokeStyle = "#facc15";
      ctx.strokeRect(x, y, w, h);
      const label = a.label || "(no description)";
      const pad = fontSize * 0.4;
      const textW = ctx.measureText(label).width + pad * 2;
      const textH = fontSize + pad * 1.2;
      const ty = y - textH < 0 ? y + strokeW : y - textH;
      ctx.fillStyle = "#facc15";
      ctx.fillRect(x, ty, textW, textH);
      ctx.fillStyle = "#111827";
      ctx.fillText(label, x + pad, ty + pad * 0.6);
    });

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], `defect-${Date.now()}.jpg`, { type: "image/jpeg" });
        if (share && (navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
          try {
            await (navigator as any).share({ files: [file], title: "Tagged photo" });
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
      },
      "image/jpeg",
      0.92,
    );
  };

  // ---------- Capture screen ----------
  if (!imageDataUrl) {
    return (
      <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
        <header className="px-5 pt-8 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Tag the problem.</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Snap a photo of broken things or construction mistakes. AI outlines the spot — you describe what's wrong.
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
  const selected = selectedId ? annotations.find((a) => a.id === selectedId) ?? null : null;

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
        <div
          ref={imageContainerRef}
          onClick={boxMode ? undefined : handleImageTap}
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => {
            handlePointerMove(e);
            onBoxDragMove(e);
          }}
          onPointerUp={(e) => {
            handlePointerUp();
            endBoxDrag();
          }}
          onPointerCancel={(e) => {
            handlePointerUp();
            endBoxDrag();
          }}
          className={`relative max-h-full max-w-full ${tapMode || boxMode ? "cursor-crosshair" : ""}`}
          style={tapMode || boxMode ? { touchAction: "none" } : undefined}
        >
          <img
            src={imageDataUrl}
            alt="Captured"
            className="block max-h-[calc(100vh-300px)] max-w-full object-contain select-none pointer-events-none"
            draggable={false}
          />
          {(tapMode || boxMode) && (
            <div className="absolute inset-0 ring-2 ring-yellow-400/60 ring-inset pointer-events-none" />
          )}
          {drawing && (
            <div
              className="absolute border-2 border-yellow-400 bg-yellow-400/15 pointer-events-none"
              style={{
                left: `${Math.min(drawing.x1, drawing.x2) * 100}%`,
                top: `${Math.min(drawing.y1, drawing.y2) * 100}%`,
                width: `${Math.abs(drawing.x2 - drawing.x1) * 100}%`,
                height: `${Math.abs(drawing.y2 - drawing.y1) * 100}%`,
              }}
            />
          )}

          {/* Annotation boxes */}
          <div className="absolute inset-0">
            {annotations.map((a) => {
              const isSelected = a.id === selectedId;
              return (
                <div
                  key={a.id}
                  className={`absolute ${isSelected ? "border-2 border-yellow-300 bg-yellow-400/10" : "border-[3px] border-yellow-400"} ${tapMode || boxMode ? "pointer-events-none" : ""}`}
                  style={{
                    left: `${a.box.x * 100}%`,
                    top: `${a.box.y * 100}%`,
                    width: `${a.box.w * 100}%`,
                    height: `${a.box.h * 100}%`,
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => {
                    if (isSelected) {
                      startBoxDrag(e, a.id, "move", a.box);
                    } else {
                      e.stopPropagation();
                      selectExisting(a.id);
                    }
                  }}
                >
                  {a.label && (
                    <span className="absolute -top-6 left-0 bg-yellow-400 text-neutral-950 text-xs font-semibold px-1.5 py-0.5 rounded pointer-events-none">
                      {a.label}
                    </span>
                  )}
                  {isSelected && !tapMode && !boxMode && (
                    <>
                      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                        <div
                          key={corner}
                          onPointerDown={(e) => startBoxDrag(e, a.id, corner, a.box)}
                          className="absolute w-6 h-6 bg-yellow-300 border-2 border-neutral-950 rounded-full"
                          style={{
                            left: corner.includes("w") ? "-12px" : "auto",
                            right: corner.includes("e") ? "-12px" : "auto",
                            top: corner.includes("n") ? "-12px" : "auto",
                            bottom: corner.includes("s") ? "-12px" : "auto",
                            touchAction: "none",
                            cursor: `${corner}-resize`,
                          }}
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status line */}
      <div className="px-4 pt-2 min-h-[1.75rem] text-center text-sm">
        {processing && (
          <span className="inline-flex items-center gap-2 text-neutral-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            {busyText || "Working…"}
          </span>
        )}
        {!processing && tapMode && !error && (
          <span className="text-yellow-400 font-medium">Tap the problem area</span>
        )}
        {!processing && boxMode && !error && (
          <span className="text-yellow-400 font-medium">Drag a box around the problem</span>
        )}
        {!processing && !tapMode && !boxMode && !selected && annotations.length > 0 && !error && (
          <span className="text-neutral-500">Tap any box to edit its description</span>
        )}
        {error && <div className="text-red-400 mt-1">{error}</div>}
      </div>

      {/* Caption sheet (visible when a box is selected) */}
      {selected ? (
        <div className="px-4 py-3 border-t border-neutral-800 bg-neutral-900">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Describe the problem
            </span>
            <button
              onClick={deleteSelected}
              className="ml-auto flex items-center gap-1 text-xs text-red-400 active:text-red-300"
              aria-label="Delete tag"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={captionInputRef}
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCaption();
              }}
              placeholder="e.g. weld cracked at base"
              className="flex-1 bg-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
            />
            {speechSupported && (
              <button
                onClick={listening ? stopListening : startListening}
                disabled={processing}
                className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                  listening
                    ? "bg-red-500 animate-pulse text-white"
                    : "bg-neutral-800 text-yellow-400 border border-neutral-700"
                }`}
                aria-label={listening ? "Stop listening" : "Dictate description"}
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={saveCaption}
              className="w-11 h-11 rounded-full bg-yellow-400 text-neutral-950 flex items-center justify-center shrink-0 active:bg-yellow-300"
              aria-label="Save description"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        // Action row when nothing selected
        <div className="px-4 pt-2 pb-6 flex justify-center items-center gap-5">
          <ModeButton
            active={tapMode}
            onClick={() => {
              setTapMode((v) => !v);
              setBoxMode(false);
              setSelectedId(null);
            }}
            icon={<Hand className="w-6 h-6" />}
            label={tapMode ? "Tap on" : "Tap"}
            disabled={processing}
          />
          <ModeButton
            active={boxMode}
            onClick={() => {
              setBoxMode((v) => !v);
              setTapMode(false);
              setSelectedId(null);
            }}
            icon={<Square className="w-6 h-6" />}
            label={boxMode ? "Box on" : "Box"}
            disabled={processing}
          />
          <button
            onClick={handleAutoScan}
            disabled={processing}
            className="flex flex-col items-center gap-1 text-xs text-neutral-300 disabled:opacity-40 active:text-white"
            aria-label="Auto-detect everything"
          >
            <span className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-700">
              <Sparkles className="w-6 h-6 text-yellow-400" />
            </span>
            Auto-find
          </button>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 text-xs disabled:opacity-40"
    >
      <span
        className={`w-14 h-14 rounded-full flex items-center justify-center border ${
          active
            ? "bg-yellow-400 text-neutral-950 border-yellow-300"
            : "bg-neutral-800 text-yellow-400 border-neutral-700"
        }`}
      >
        {icon}
      </span>
      <span className={active ? "text-yellow-400 font-medium" : "text-neutral-300"}>{label}</span>
    </button>
  );
}
