import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Mic,
  Download,
  Share2,
  RotateCcw,
  Sparkles,
  Hand,
  Square,
  Check,
  Trash2,
  Undo2,
  Redo2,
  ClipboardCopy,
  ClipboardCheck,
  ImagePlus,
  Video as VideoIcon,
  Clock,
  Globe,
  Settings,
} from "lucide-react";

import { OnboardingDialog } from "@/components/OnboardingDialog";
import { createTapFallbackBox } from "@/lib/detection-guards";
import { useAiUsage } from "@/lib/usage";
import { SettingsDialog } from "@/components/SettingsDialog";
import { VideoFramePicker } from "@/components/VideoFramePicker";
import { useAnalytics } from "@/lib/analytics";
import { requestNativeReview, saveImage, shareImage } from "@/lib/native";
import { hasCompletedCurrentOnboarding } from "@/lib/onboarding";
import { getSessionPersistenceAction } from "@/lib/session-persistence";

export const Route = createFileRoute("/")({
  component: AnnotatePage,
  head: () => ({
    meta: [
      { title: "Tag Defects — Tap, Outline, Describe" },
      {
        name: "description",
        content:
          "Snap a photo, tap or box the problem, describe it, and share a clear marked-up image.",
      },
      { property: "og:title", content: "Tag Defects — Tap, Outline, Describe" },
      {
        property: "og:description",
        content:
          "Snap a photo, mark the problem, describe what's wrong, and share a tagged image in seconds.",
      },
      { property: "og:url", content: "https://soupytag.company/" },
    ],
    links: [{ rel: "canonical", href: "https://soupytag.company/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "SoupyTag",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web, Android",
          description:
            "Photo defect tagging with voice and AI. Snap, mark the problem, describe it, and share a tagged image in seconds.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
});

type Box = { x: number; y: number; w: number; h: number };
type Severity = "info" | "minor" | "major";
type Annotation = {
  id: string;
  label: string;
  box: Box;
  severity?: Severity;
};

type DragKind = "move" | "nw" | "ne" | "sw" | "se" | null;

// Tailwind colors mapped per severity. Used for box border, badge bg, and canvas export.
const SEV_HEX: Record<Severity, string> = {
  info: "#38bdf8", // sky-400
  minor: "#facc15", // yellow-400
  major: "#ef4444", // red-500
};
const SEV_BORDER: Record<Severity, string> = {
  info: "border-sky-400",
  minor: "border-yellow-400",
  major: "border-red-500",
};
const SEV_BG: Record<Severity, string> = {
  info: "bg-sky-400",
  minor: "bg-yellow-400",
  major: "bg-red-500",
};
const SEV_TEXT: Record<Severity, string> = {
  info: "text-neutral-950",
  minor: "text-neutral-950",
  major: "text-white",
};
const sevOf = (a: Annotation): Severity => a.severity ?? "minor";

function formatStamp(d: Date, useUTC: boolean): string {
  if (useUTC) {
    return d.toLocaleString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function AnnotatePage() {
  const usage = useAiUsage();
  const analytics = useAnalytics();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [tapMode, setTapMode] = useState(false);
  const [boxMode, setBoxMode] = useState(false);
  const [drawing, setDrawing] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [videoResumeTime, setVideoResumeTime] = useState(0);
  const [includeTimestamp, setIncludeTimestamp] = useState(false);
  const [useUTC, setUseUTC] = useState(false);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const recognitionRef = useRef<any>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasCompletedCurrentOnboarding(window.localStorage)) {
      setOnboardingOpen(true);
      analytics.capture("onboarding_started");
    }
  }, [analytics]);

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
      setError(
        e?.error === "not-allowed"
          ? "Microphone permission denied."
          : "Couldn't hear that. Try again.",
      );
    };
    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {}
    };
  }, []);

  // ---- Persist to localStorage so a tab crash doesn't lose the inspection ----
  const STORAGE_KEY = "soupytag:session:v1";
  const [sessionHydrated, setSessionHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.imageDataUrl && data?.imageSize) {
          setImageDataUrl(data.imageDataUrl);
          setImageSize(data.imageSize);
          setAnnotations(Array.isArray(data.annotations) ? data.annotations : []);
        }
      }
    } catch {}
    setSessionHydrated(true);
  }, []);

  useEffect(() => {
    const action = getSessionPersistenceAction(sessionHydrated, imageDataUrl, imageSize);
    if (action === "skip") return;
    try {
      if (action === "save" && imageDataUrl && imageSize) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ imageDataUrl, imageSize, annotations }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, [sessionHydrated, imageDataUrl, imageSize, annotations]);

  const [copied, setCopied] = useState(false);

  // ---- Pinch-zoom on the photo ----
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const zoomViewportRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<null | {
    startDist: number;
    startScale: number;
    startX: number;
    startY: number;
    focalX: number;
    focalY: number;
  }>(null);
  // Voice auto-advance: when caption is saved while mic was on, jump to next unlabeled box and re-arm mic
  const wasListeningRef = useRef(false);
  const autoAdvanceRef = useRef(false);

  // Pinch gesture handlers — attached natively so we can preventDefault and beat the page-zoom behavior
  useEffect(() => {
    const el = zoomViewportRef.current;
    if (!el) return;
    const clamp = (s: number) => Math.max(1, Math.min(5, s));
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const rect = el.getBoundingClientRect();
      pinchRef.current = {
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startScale: zoom.s,
        startX: zoom.x,
        startY: zoom.y,
        focalX: (a.clientX + b.clientX) / 2 - rect.left,
        focalY: (a.clientY + b.clientY) / 2 - rect.top,
      };
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const p = pinchRef.current;
      const newScale = clamp((dist / p.startDist) * p.startScale);
      const k = newScale / p.startScale;
      // Zoom around the original focal point
      const nx = p.focalX - (p.focalX - p.startX) * k;
      const ny = p.focalY - (p.focalY - p.startY) * k;
      setZoom({ s: newScale, x: nx, y: ny });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current = null;
        // Snap back if essentially 1x
        setZoom((z) => (z.s <= 1.02 ? { s: 1, x: 0, y: 0 } : z));
      }
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [zoom.s, zoom.x, zoom.y, imageDataUrl]);

  const resetZoom = () => setZoom({ s: 1, x: 0, y: 0 });

  const handleFile = (file: File, source: "camera" | "library" | "video" = "library") => {
    setError(null);
    setNotice(null);
    setAnnotations([]);
    setPast([]);
    setFuture([]);
    setSelectedId(null);
    setCaptionDraft("");
    setZoom({ s: 1, x: 0, y: 0 });
    setCapturedAt(new Date());

    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
        setImageDataUrl(url);
        analytics.capture("photo_loaded", {
          source,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
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
        return [...prev, { id, label: "", box, severity: "minor" }];
      });
      setSelectedId(id);
      setCaptionDraft("");
      // Focus caption input after sheet renders
      requestAnimationFrame(() => captionInputRef.current?.focus());
    },
    [commit],
  );

  const handleImageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tapMode || !imageDataUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setError(null);
    addAnnotationAndSelect(createTapFallbackBox({ x, y }));
    setTapMode(false);
    analytics.capture("manual_tag_created", { method: "tap" });
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
    if (!boxMode) return;
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

  const handlePointerUp = () => {
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

    addAnnotationAndSelect(userBox);
    setError(null);
    setBoxMode(false);
    analytics.capture("manual_tag_created", { method: "box" });
  };

  // ---- Move / resize selected annotation ----

  const moveRef = useRef<{
    kind: DragKind;
    id: string | null;
    startBox: Box | null;
    startPos: { x: number; y: number } | null;
    snapshot: Annotation[] | null;
    moved: boolean;
  }>({ kind: null, id: null, startBox: null, startPos: null, snapshot: null, moved: false });

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
    moveRef.current = {
      kind,
      id,
      startBox: { ...box },
      startPos: pos,
      snapshot: annotations,
      moved: false,
    };
  };

  const onBoxDragMove = (e: React.PointerEvent) => {
    const m = moveRef.current;
    if (!m.kind || !m.id || !m.startBox || !m.startPos) return;
    const pos = getContainerPos(e.clientX, e.clientY);
    if (!pos) return;
    const dx = pos.x - m.startPos.x;
    const dy = pos.y - m.startPos.y;
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) m.moved = true;

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
    const m = moveRef.current;
    if (m.kind && m.moved && m.snapshot) {
      commit(m.snapshot);
    }
    moveRef.current = {
      kind: null,
      id: null,
      startBox: null,
      startPos: null,
      snapshot: null,
      moved: false,
    };
  };

  // ---- Caption helpers ----

  const saveCaption = () => {
    if (!selectedId) return;
    const newLabel = captionDraft.trim();
    const currentId = selectedId;
    const wantsContinue = wasListeningRef.current;
    let nextId: string | null = null;
    setAnnotations((prev) => {
      const target = prev.find((a) => a.id === currentId);
      if (target && target.label !== newLabel) commit(prev);
      const updated = prev.map((a) => (a.id === currentId ? { ...a, label: newLabel } : a));
      // Find next annotation (in order) with an empty label
      const idx = updated.findIndex((a) => a.id === currentId);
      const after = updated.slice(idx + 1).concat(updated.slice(0, idx));
      const next = after.find((a) => !a.label?.trim());
      nextId = next?.id ?? null;
      return updated;
    });
    if (nextId) {
      setSelectedId(nextId);
      setCaptionDraft("");
      requestAnimationFrame(() => captionInputRef.current?.focus());
      if (wantsContinue) {
        // Restart mic on the next box
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
            setListening(true);
          } catch {}
        }, 250);
      }
    } else {
      setSelectedId(null);
      setCaptionDraft("");
      wasListeningRef.current = false;
    }
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setAnnotations((prev) => {
      commit(prev);
      return prev.filter((a) => a.id !== selectedId);
    });
    setSelectedId(null);
    setCaptionDraft("");
  };

  // Flush the current caption draft into the selected annotation without
  // clearing selection. Used before switching boxes, toggling modes, sharing.
  const flushCaptionDraft = useCallback(() => {
    if (!selectedId) return;
    const newLabel = captionDraft.trim();
    setAnnotations((prev) => {
      const target = prev.find((a) => a.id === selectedId);
      if (!target || target.label === newLabel) return prev;
      commit(prev);
      return prev.map((a) => (a.id === selectedId ? { ...a, label: newLabel } : a));
    });
  }, [selectedId, captionDraft, commit]);

  const setSeverity = (sev: Severity) => {
    if (!selectedId) return;
    setAnnotations((prev) => {
      const target = prev.find((a) => a.id === selectedId);
      if (!target || sevOf(target) === sev) return prev;
      commit(prev);
      return prev.map((a) => (a.id === selectedId ? { ...a, severity: sev } : a));
    });
  };

  const selectExisting = (id: string) => {
    if (tapMode || boxMode) return;
    flushCaptionDraft();
    const a = annotations.find((x) => x.id === id);
    if (!a) return;
    setSelectedId(id);
    setCaptionDraft(a.label);
    requestAnimationFrame(() => captionInputRef.current?.focus());
  };

  const deselect = () => {
    flushCaptionDraft();
    setSelectedId(null);
    setCaptionDraft("");
  };

  const copyAsText = async () => {
    if (annotations.length === 0) return;
    flushCaptionDraft();
    // Read fresh annotations after flush via functional update
    setAnnotations((curr) => {
      const lines = curr.map((a, i) => `${i + 1}. ${a.label?.trim() || "(no description)"}`);
      const header =
        includeTimestamp && capturedAt ? `Tagged ${formatStamp(capturedAt, useUTC)}\n\n` : "";
      const text = header + lines.join("\n");
      navigator.clipboard
        ?.writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
          analytics.capture("annotation_list_copied", { tag_count: curr.length });
        })
        .catch(() => setError("Couldn't copy to clipboard."));
      return curr;
    });
  };

  const startListening = () => {
    if (!recognitionRef.current || listening) return;
    setError(null);
    try {
      recognitionRef.current.start();
      setListening(true);
      wasListeningRef.current = true;
    } catch {
      // already started
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current || !listening) return;
    wasListeningRef.current = false;
    try {
      recognitionRef.current.stop();
    } catch {}
  };

  const reset = () => {
    setImageDataUrl(null);
    setImageSize(null);
    setAnnotations([]);
    setPast([]);
    setFuture([]);

    setSelectedId(null);
    setCaptionDraft("");
    setError(null);
    setNotice(null);
    setTapMode(false);
    setBoxMode(false);
    setZoom({ s: 1, x: 0, y: 0 });
    setVideoFile(null);
    setShowVideoPicker(false);
    setVideoResumeTime(0);
    setCapturedAt(null);
  };

  // ---- Export ----

  const recordShareAndMaybeReview = async () => {
    const countKey = "soupytag:share:count:v1";
    const reviewKey = "soupytag:review:requested:v1";
    const next = Number(localStorage.getItem(countKey) ?? "0") + 1;
    localStorage.setItem(countKey, String(next));
    if (next >= 3 && localStorage.getItem(reviewKey) !== "1") {
      localStorage.setItem(reviewKey, "1");
      const launched = await requestNativeReview();
      analytics.capture("native_review_requested", { launched, share_count: next });
    }
  };

  const exportImage = async (share: boolean) => {
    if (!imageDataUrl || !imageSize) return;
    setError(null);
    setNotice(null);
    // Auto-save any in-progress caption first
    flushCaptionDraft();
    const exportList = selectedId
      ? annotations.map((a) => (a.id === selectedId ? { ...a, label: captionDraft.trim() } : a))
      : annotations;
    if (selectedId) {
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

    exportList.forEach((a, i) => {
      const x = a.box.x * imageSize.w;
      const y = a.box.y * imageSize.h;
      const w = a.box.w * imageSize.w;
      const h = a.box.h * imageSize.h;
      const sev = sevOf(a);
      const color = SEV_HEX[sev];
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);
      const label = `${i + 1}. ${a.label?.trim() || "(no description)"}`;
      const pad = fontSize * 0.4;
      const textW = ctx.measureText(label).width + pad * 2;
      const textH = fontSize + pad * 1.2;
      const ty = y - textH < 0 ? y + strokeW : y - textH;
      const tx = Math.max(0, Math.min(x, imageSize.w - textW));
      ctx.fillStyle = color;
      ctx.fillRect(tx, ty, textW, textH);
      ctx.fillStyle = sev === "major" ? "#ffffff" : "#111827";
      ctx.fillText(label, tx + pad, ty + pad * 0.6);
    });

    if (includeTimestamp && capturedAt) {
      const stampSize = Math.max(18, Math.round(imageSize.w * 0.024));
      ctx.font = `600 ${stampSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "bottom";
      const stamp = formatStamp(capturedAt, useUTC);
      const pad = stampSize * 0.5;
      const tw = ctx.measureText(stamp).width + pad * 2;
      const th = stampSize + pad * 1.2;
      const sx = imageSize.w - tw - pad;
      const sy = imageSize.h - pad;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(sx, sy - th, tw, th);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(stamp, sx + pad, sy - pad * 0.4);
      ctx.textBaseline = "top";
    }

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const fileName = `defect-${Date.now()}.jpg`;
        const shareText = exportList
          .map(
            (annotation, index) =>
              `${index + 1}. [${sevOf(annotation).toUpperCase()}] ${annotation.label?.trim() || "(no description)"}`,
          )
          .join("\n");
        if (share) {
          const shareOutcome = await shareImage({
            blob,
            fileName,
            title: "SoupyTag inspection",
            text: shareText,
          });
          if (shareOutcome === "shared") {
            analytics.capture("export_completed", {
              method: "share",
              tag_count: exportList.length,
              timestamp_included: includeTimestamp,
            });
            await recordShareAndMaybeReview();
            return;
          }
          if (shareOutcome === "cancelled") {
            setNotice("Sharing canceled.");
            return;
          }
        }
        const saved = await saveImage({ blob, fileName });
        if (!saved) {
          setError(share ? "Couldn't share or save this image." : "Couldn't save this image.");
          return;
        }
        setNotice(
          share
            ? "Sharing wasn't available, so SoupyTag saved the image instead."
            : "Saved to Pictures/SoupyTag.",
        );
        analytics.capture("export_completed", {
          method: share ? "share_fallback_save" : "download",
          tag_count: exportList.length,
          timestamp_included: includeTimestamp,
        });
      },
      "image/jpeg",
      0.92,
    );
  };

  const appOverlays = (
    <>
      <OnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onReplayOnboarding={() => {
          setSettingsOpen(false);
          analytics.capture("onboarding_replayed");
          setOnboardingOpen(true);
        }}
        onUnlocked={usage.markUnlocked}
      />
    </>
  );

  // ---------- Capture screen ----------
  if (!imageDataUrl) {
    return (
      <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
        <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tag the problem.</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Snap a photo, tap or box the spot, then describe exactly what's wrong.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
          >
            <Settings className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-xs aspect-square rounded-3xl bg-yellow-400 text-neutral-950 flex flex-col items-center justify-center gap-3 shadow-2xl shadow-yellow-400/20 active:scale-95 transition-transform"
          >
            <Camera className="w-16 h-16" strokeWidth={2.2} />
            <span className="text-xl font-semibold">Take Photo</span>
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="w-full max-w-xs py-4 rounded-2xl bg-neutral-800 text-neutral-100 flex items-center justify-center gap-2 border border-neutral-700 active:scale-95 transition-transform"
          >
            <ImagePlus className="w-5 h-5" />
            <span className="text-base font-medium">Upload from device</span>
          </button>
          <button
            onClick={() => videoInputRef.current?.click()}
            className="w-full max-w-xs py-4 rounded-2xl bg-neutral-800 text-neutral-100 flex items-center justify-center gap-2 border border-neutral-700 active:scale-95 transition-transform"
          >
            <VideoIcon className="w-5 h-5" />
            <span className="text-base font-medium">Pick frame from video</span>
          </button>
          <p className="text-xs text-neutral-500 mt-2 text-center max-w-xs">
            Take a new photo, upload one you already have, or scrub a video to grab any frame.
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
            if (f) handleFile(f, "camera");
            e.target.value = "";
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f, "library");
            e.target.value = "";
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setVideoFile(f);
              setVideoResumeTime(0);
              setShowVideoPicker(true);
            }
            e.target.value = "";
          }}
        />
        {videoFile && showVideoPicker && (
          <VideoFramePicker
            videoFile={videoFile}
            initialTime={videoResumeTime}
            onCancel={() => setShowVideoPicker(false)}
            onPickFrame={(frame, atTime) => {
              setShowVideoPicker(false);
              setVideoResumeTime(atTime);
              handleFile(frame, "video");
            }}
          />
        )}
        {appOverlays}
      </div>
    );
  }

  // ---------- Annotate screen ----------
  const selected = selectedId ? (annotations.find((a) => a.id === selectedId) ?? null) : null;

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      <h1 className="sr-only">Tag defects in your photo</h1>
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-neutral-300 active:text-white"
          >
            <RotateCcw className="w-4 h-4" /> New
          </button>
          {videoFile && (
            <button
              onClick={() => setShowVideoPicker(true)}
              className="flex items-center gap-1 text-xs text-yellow-400 active:text-yellow-300 px-2 py-1 rounded-md bg-neutral-800"
              title="Pick another frame from the same video"
            >
              <VideoIcon className="w-3.5 h-3.5" /> Video
            </button>
          )}
        </div>
        <div className="flex flex-col items-center leading-tight">
          <span className="text-sm font-medium text-neutral-400">
            {annotations.length} tag{annotations.length === 1 ? "" : "s"}
          </span>
          <span className="text-[10px] text-yellow-400">AI add-on coming soon</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg bg-neutral-800 active:bg-neutral-700"
            aria-label="Open settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={undo}
            disabled={past.length === 0}
            className="p-2 rounded-lg bg-neutral-800 disabled:opacity-40 active:bg-neutral-700"
            aria-label="Undo"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            className="p-2 rounded-lg bg-neutral-800 disabled:opacity-40 active:bg-neutral-700"
            aria-label="Redo"
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIncludeTimestamp((v) => !v)}
            className={`p-2 rounded-lg active:bg-neutral-700 ${
              includeTimestamp
                ? "bg-yellow-400 text-neutral-950"
                : "bg-neutral-800 text-neutral-200"
            }`}
            aria-label={includeTimestamp ? "Timestamp on" : "Timestamp off"}
            title={
              capturedAt
                ? `${includeTimestamp ? "On" : "Off"} — ${formatStamp(capturedAt, useUTC)} (${useUTC ? "UTC" : "Local"})`
                : "Add timestamp to exported image and copied text"
            }
          >
            <Clock className="w-4 h-4" />
          </button>
          {includeTimestamp && (
            <button
              onClick={() => setUseUTC((v) => !v)}
              className="p-2 rounded-lg bg-neutral-800 text-neutral-200 active:bg-neutral-700"
              aria-label={useUTC ? "Switch to local time" : "Switch to UTC"}
              title={useUTC ? "UTC time — click for local" : "Local time — click for UTC"}
            >
              <Globe className="w-4 h-4" />
              <span className="sr-only">{useUTC ? "UTC" : "Local"}</span>
            </button>
          )}
          <button
            onClick={copyAsText}
            disabled={annotations.length === 0}
            className="p-2 rounded-lg bg-neutral-800 disabled:opacity-40 active:bg-neutral-700"
            aria-label="Copy list as text"
            title="Copy numbered list to clipboard"
          >
            {copied ? (
              <ClipboardCheck className="w-4 h-4 text-yellow-400" />
            ) : (
              <ClipboardCopy className="w-4 h-4" />
            )}
          </button>
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

      <div
        ref={zoomViewportRef}
        className="relative flex-1 flex items-center justify-center bg-black overflow-hidden"
        style={{ touchAction: zoom.s > 1 ? "none" : undefined }}
      >
        <div
          style={{
            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
            transformOrigin: "0 0",
            transition: pinchRef.current ? "none" : "transform 0.15s ease-out",
          }}
        >
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
              alt="Photo being annotated for defect tagging"
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
              {annotations.map((a, i) => {
                const isSelected = a.id === selectedId;
                const sev = sevOf(a);
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={tapMode || boxMode ? -1 : 0}
                    aria-label={`Tag ${i + 1}: ${a.label || "No description"}. Severity ${sev}.`}
                    className={`absolute ${SEV_BORDER[sev]} ${isSelected ? "border-2 bg-white/5" : "border-[3px]"} ${tapMode || boxMode ? "pointer-events-none" : ""}`}
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
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectExisting(a.id);
                      }
                    }}
                  >
                    <span
                      className="absolute -top-6 flex items-center gap-1 pointer-events-none"
                      style={
                        a.box.x + a.box.w / 2 > 0.55
                          ? { right: 0, flexDirection: "row-reverse" }
                          : { left: 0 }
                      }
                    >
                      <span
                        className={`${SEV_BG[sev]} ${SEV_TEXT[sev]} text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow`}
                      >
                        {i + 1}
                      </span>
                      {a.label && (
                        <span
                          className={`${SEV_BG[sev]} ${SEV_TEXT[sev]} text-xs font-semibold px-1.5 py-0.5 rounded max-w-[60vw] truncate`}
                        >
                          {a.label}
                        </span>
                      )}
                    </span>
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
        {zoom.s > 1 && (
          <button
            onClick={resetZoom}
            className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-neutral-900/80 border border-neutral-700 text-xs text-yellow-400 backdrop-blur-sm"
          >
            Reset zoom
          </button>
        )}
      </div>

      {/* Status line */}
      <div className="px-4 pt-2 min-h-[1.75rem] text-center text-sm" aria-live="polite">
        {tapMode && !error && (
          <span className="text-yellow-400 font-medium">Tap the problem area</span>
        )}
        {boxMode && !error && (
          <span className="text-yellow-400 font-medium">Drag a box around the problem</span>
        )}
        {!tapMode && !boxMode && !selected && annotations.length > 0 && !error && (
          <span className="text-neutral-500">Tap any box to edit its description</span>
        )}
        {error && (
          <div role="alert" className="text-red-400 mt-1">
            {error}
          </div>
        )}
        {!error && notice && (
          <div role="status" className="text-emerald-400 mt-1">
            {notice}
          </div>
        )}
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
          <div className="flex gap-1.5 mb-2">
            {(["info", "minor", "major"] as const).map((sev) => {
              const active = selected && sevOf(selected) === sev;
              const label = sev === "info" ? "Info" : sev === "minor" ? "Minor" : "Major";
              return (
                <button
                  key={sev}
                  onClick={() => setSeverity(sev)}
                  aria-pressed={active}
                  aria-label={`Set severity to ${label}`}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                    active
                      ? `${SEV_BG[sev]} ${SEV_TEXT[sev]} border-transparent`
                      : "bg-neutral-800 text-neutral-400 border-neutral-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
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
              aria-label="Tag description"
              className="flex-1 bg-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500"
            />
            {speechSupported && (
              <button
                onClick={listening ? stopListening : startListening}
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
          />
          <button
            onClick={() => setError("AI auto-find is coming soon. Use Tap or Box for now.")}
            className="flex flex-col items-center gap-1 text-xs text-neutral-500 active:text-neutral-300"
            aria-label="AI auto-find coming soon"
          >
            <span className="w-14 h-14 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
              <Sparkles className="w-6 h-6 text-neutral-500" />
            </span>
            AI soon
          </button>
        </div>
      )}
      {appOverlays}
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
      aria-pressed={active}
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
