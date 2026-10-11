import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Download,
  FileText,
  ImagePlus,
  Layers,
  Loader2,
  Share2,
  Square,
  Video,
  X,
} from "lucide-react";
import { VideoFramePicker } from "./VideoFramePicker";
import { loadImageFile } from "@/lib/image-import";
import {
  canPreviewTrail,
  levelLabel,
  MAX_TRAIL_FILE_BYTES,
  MAX_TRAIL_LEVELS,
  MAX_TRAIL_ANNOTATIONS,
  normalizedBox,
  parseTrail,
  trailHtml,
  validateTrail,
  type ContextTrail,
  type TrailBox,
  type TrailLevel,
} from "@/lib/context-trail";
import {
  loadTrailDraft,
  loadTrailDraftBackup,
  saveTrailDraft,
  saveTrailDraftBackup,
} from "@/lib/context-trail-storage";
import { openDocument, saveDocument, shareImage, usesNativeDocumentPicker } from "@/lib/native";
import { createTrailPdf } from "@/lib/context-trail-pdf";
import type { Annotation } from "@/lib/annotations";
import "./context-trail.css";

type Props = {
  onClose: () => void;
  initialImage?: string | null;
  initialAnnotations?: Annotation[];
  initialReport?: { title: string; reference: string };
};
type Point = { x: number; y: number };
const emptyTrail = (): ContextTrail => ({
  version: 2,
  title: "",
  report: { title: "", reference: "" },
  levels: [],
});
const hasTrailWork = (trail: ContextTrail) =>
  Boolean(trail.title.trim() || trail.report.title.trim() || trail.report.reference.trim()) ||
  trail.levels.length > 0;

async function prepareImage(
  url: string,
  annotations: Annotation[] = [],
): Promise<{ image: string; width: number; height: number }> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This photo could not be opened."));
    image.src = url;
  });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Photo processing is unavailable.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  // Carry redactions into the pixels before storing or sharing the source photo.
  for (const a of annotations) {
    const { x, y, w, h } = a.box;
    if (a.kind === "redact") {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height);
    }
  }
  return {
    image: canvas.toDataURL("image/jpeg", 0.86),
    width: canvas.width,
    height: canvas.height,
  };
}

async function redactStoredPhotos(trail: ContextTrail): Promise<ContextTrail> {
  const levels = await Promise.all(
    trail.levels.map(async (level) => {
      if (!level.annotations.some((annotation) => annotation.kind === "redact")) return level;
      const photo = await prepareImage(level.image, level.annotations);
      return { ...level, ...photo };
    }),
  );
  return { ...trail, levels };
}

export function ContextTrailEditor({
  onClose,
  initialImage,
  initialAnnotations = [],
  initialReport = { title: "", reference: "" },
}: Props) {
  const [trail, setTrail] = useState<ContextTrail>(emptyTrail);
  const [hydrated, setHydrated] = useState(false);
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState(false);
  const [boxing, setBoxing] = useState(false);
  const [draftBox, setDraftBox] = useState<TrailBox | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Opening draft…");
  const [video, setVideo] = useState<File | null>(null);
  const [videoPicker, setVideoPicker] = useState(false);
  const [videoAt, setVideoAt] = useState(0);
  const [videoPicked, setVideoPicked] = useState(0);
  const [newPrompt, setNewPrompt] = useState(false);
  const [marking, setMarking] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const start = useRef<Point | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const recordInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const trailRef = useRef(trail);
  const importBusy = useRef(false);
  const actionBusy = useRef(false);
  const initialRef = useRef({
    image: initialImage,
    annotations: initialAnnotations,
    report: initialReport,
  });
  const returnFocus = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement),
  );
  trailRef.current = trail;
  const current = trail.levels[active];
  const hasNext = active < trail.levels.length - 1;
  const ready = canPreviewTrail(trail);
  const completeLinks = trail.levels.slice(0, -1).filter((level) => level.hotspot).length;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let saved: ContextTrail | null = null;
      try {
        saved = await loadTrailDraft();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not open your draft.");
      }
      try {
        let next = saved ?? emptyTrail();
        if (saved) {
          const previous = await loadTrailDraftBackup();
          if (previous && !cancelled) setHasBackup(true);
          next = await redactStoredPhotos(saved);
        } else {
          next.report = { ...initialRef.current.report };
        }
        if (!next.levels.length && initialRef.current.image) {
          const photo = await prepareImage(
            initialRef.current.image,
            initialRef.current.annotations,
          );
          next = {
            ...next,
            levels: [
              {
                ...photo,
                id: crypto.randomUUID(),
                title: "Where",
                note: "",
                annotations: initialRef.current.annotations.map((a) => structuredClone(a)),
              },
            ],
          };
        }
        if (!cancelled) {
          setTrail(next);
          setStatus(
            saved?.levels.length ? "Draft restored on this device" : "Start wide, then move closer",
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not open your draft.");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setStatus("Saving draft…");
    void saveTrailDraft(trail)
      .then(() => {
        if (!cancelled) setStatus("Autosaved working draft on this device");
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStatus("Draft not saved");
          setError(e instanceof Error ? e.message : "Save a trail file before closing.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trail, hydrated]);

  useEffect(() => {
    const input = importInput.current;
    if (!input) return;
    const handleCancel = () => {
      actionBusy.current = false;
      setBusy(false);
      setStatus("Open cancelled; current draft kept");
    };
    input.addEventListener("cancel", handleCancel);
    return () => input.removeEventListener("cancel", handleCancel);
  }, []);

  async function close() {
    if (busy || actionBusy.current) return;
    try {
      if (hydrated) await saveTrailDraft(trailRef.current);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save a trail file before closing.");
    }
  }

  async function addFiles(files: File[], time?: number) {
    if (actionBusy.current || importBusy.current || !files.length) return;
    actionBusy.current = true;
    importBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const before = trailRef.current;
      if (before.levels.length + files.length > MAX_TRAIL_LEVELS)
        throw new Error(`A trail can hold up to ${MAX_TRAIL_LEVELS} views. Choose fewer photos.`);
      const additions: TrailLevel[] = [];
      // Decode sequentially to limit memory use on field phones; commit the batch only when all succeed.
      for (const file of files) {
        const decoded = await loadImageFile(file);
        const photo = await prepareImage(decoded.url);
        additions.push({
          ...photo,
          id: crypto.randomUUID(),
          title: levelLabel(before.levels.length + additions.length),
          note: "",
          annotations: [],
          ...(time !== undefined ? { videoTime: time } : {}),
        });
      }
      const next = validateTrail({ ...before, levels: [...before.levels, ...additions] });
      trailRef.current = next;
      setTrail(next);
      setActive(before.levels.length > 0 ? before.levels.length - 1 : 0);
      setPreview(false);
      setBoxing(false);
      if (time !== undefined) setVideoPicked((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that photo. Try a JPG or PNG.");
    } finally {
      actionBusy.current = false;
      importBusy.current = false;
      setBusy(false);
    }
  }

  async function openFile(file: File, alreadyLocked = false) {
    if (!alreadyLocked && actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    try {
      if (file.size > MAX_TRAIL_FILE_BYTES)
        throw new Error("Choose a trail file smaller than 12 MB.");
      await replaceFromFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "This trail file could not be opened.");
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }

  async function replaceFromFile(file: File) {
    const next = validateTrail(await redactStoredPhotos(parseTrail(await file.text())));
    const currentTrail = trailRef.current;
    if (hasTrailWork(currentTrail)) {
      await saveTrailDraft(currentTrail);
      await saveTrailDraftBackup(currentTrail);
      setHasBackup(true);
    }
    trailRef.current = next;
    setTrail(next);
    setActive(0);
    setPreview(false);
    setBoxing(false);
    setMarking(false);
    setStatus(`Opened ${file.name}; previous draft kept in local recovery`);
  }

  async function chooseTrail() {
    if (actionBusy.current) return;
    if (!usesNativeDocumentPicker()) {
      actionBusy.current = true;
      setBusy(true);
      setError("");
      if (importInput.current) importInput.current.click();
      else {
        actionBusy.current = false;
        setBusy(false);
      }
      return;
    }
    actionBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const picked = await openDocument();
      if (picked.cancelled) {
        setStatus("Open cancelled; current draft kept");
        return;
      }
      if (picked.file) {
        await replaceFromFile(picked.file);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open a trail file.");
      return;
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
    importInput.current?.click();
  }

  async function restoreBackup() {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const backup = await loadTrailDraftBackup();
      if (!backup) {
        setHasBackup(false);
        setError("No previous trail is available to restore.");
        return;
      }
      const currentTrail = trailRef.current;
      await saveTrailDraft(currentTrail);
      await saveTrailDraftBackup(currentTrail);
      const restored = await redactStoredPhotos(backup);
      trailRef.current = restored;
      setTrail(restored);
      setActive(0);
      setPreview(false);
      setBoxing(false);
      setMarking(false);
      setStatus("Previous trail restored; replaced draft kept in local recovery");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore the previous trail.");
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }

  function updateLevel(patch: Partial<TrailLevel>) {
    setTrail((before) => ({
      ...before,
      levels: before.levels.map((level, i) => (i === active ? { ...level, ...patch } : level)),
    }));
  }
  function go(index: number) {
    setActive(index);
    setBoxing(false);
    setMarking(false);
    setDraftBox(null);
    start.current = null;
  }
  function point(e: React.PointerEvent): Point | null {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((!boxing && !marking) || (boxing && !hasNext) || e.button !== 0) return;
    const p = point(e);
    if (!p) return;
    start.current = p;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraftBox(normalizedBox(p, p));
  }
  function pointerMove(e: React.PointerEvent) {
    const p = point(e);
    if ((boxing || marking) && start.current && p) setDraftBox(normalizedBox(start.current, p));
  }
  function pointerUp(e: React.PointerEvent) {
    const p = point(e);
    if ((!boxing && !marking) || !start.current || !p) return;
    const box = normalizedBox(start.current, p);
    start.current = null;
    setDraftBox(null);
    if (box.w < 0.02 || box.h < 0.02) {
      setError(
        marking
          ? "Drag a larger box around the annotation."
          : "Drag a larger box around the subject that leads to the next photo.",
      );
      return;
    }
    if (marking) {
      if (current.annotations.length >= MAX_TRAIL_ANNOTATIONS) {
        setError(`A photo can contain up to ${MAX_TRAIL_ANNOTATIONS} annotations.`);
        return;
      }
      updateLevel({
        annotations: [
          ...current.annotations,
          {
            id: crypto.randomUUID(),
            label: "New mark",
            box,
            severity: "minor",
            shape: "box",
          },
        ],
      });
      setMarking(false);
    } else {
      updateLevel({ hotspot: box });
      setBoxing(false);
    }
    setError("");
  }
  async function saveOrShare(kind: "draft" | "viewer" | "share" | "pdf") {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const draft = kind === "draft";
      const pdf = kind === "pdf";
      const blob = pdf
        ? await createTrailPdf(trail)
        : new Blob([draft ? JSON.stringify(validateTrail(trail)) : trailHtml(trail)], {
            type: draft ? "application/json" : "text/html",
          });
      const base =
        (trail.title.trim() || "context-trail")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 50) || "context-trail";
      const fileName = `${base}.${draft ? "context-trail.json" : pdf ? "pdf" : "html"}`;
      if (kind === "share") {
        const result = await shareImage({
          blob,
          fileName,
          title: trail.title || "Context Trail",
          text: "Open the attached HTML file in a browser. Tap the yellow highlights to follow the detail.",
          dialogTitle: "Share Context Trail",
        });
        if (result === "cancelled") {
          setStatus("Sharing cancelled; draft kept");
          return;
        }
        if (result === "shared") {
          setStatus("Share sheet finished; delivery depends on the receiving app");
          return;
        }
        setStatus("Sharing unavailable; working draft kept. Use Save trail to choose a location.");
        return;
      }
      const result = await saveDocument({ blob, fileName });
      if (result.cancelled) {
        setStatus("Save cancelled; working draft kept");
        return;
      }
      const action = result.location
        ? `Saved ${result.fileName} using the system picker`
        : `Download started: ${result.fileName} (check browser downloads)`;
      setStatus(
        pdf
          ? `PDF report ${action}`
          : draft
            ? `Editable trail ${action}`
            : `Offline HTML viewer ${action}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the trail. Try again.");
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }

  async function newTrail() {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const currentTrail = trailRef.current;
      if (hasTrailWork(currentTrail)) {
        const result = await saveDocument({
          blob: new Blob([JSON.stringify(validateTrail(currentTrail))], {
            type: "application/json",
          }),
          fileName: `context-trail-backup-${Date.now()}.json`,
        });
        if (result.cancelled) {
          setStatus("Backup save cancelled; current trail kept");
          return;
        }
        await saveTrailDraftBackup(currentTrail);
        setHasBackup(true);
      }
      const empty = emptyTrail();
      trailRef.current = empty;
      setTrail(empty);
      setActive(0);
      setPreview(false);
      setBoxing(false);
      setMarking(false);
      setNewPrompt(false);
      setVideo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save the current trail first.");
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }

  const box = draftBox ?? current?.hotspot;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          asChild
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <section className="trail-workspace" aria-label="Context Trail editor">
            <header className="trail-header">
              <button
                className="trail-icon"
                onClick={() => void close()}
                disabled={busy}
                aria-label="Close Context Trail"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="trail-heading">
                <Dialog.Title asChild>
                  <h1>Context Trail</h1>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <p>Show where. Follow the detail.</p>
                </Dialog.Description>
              </div>
              <button
                className="trail-button"
                onClick={() => {
                  setPreview(!preview);
                  go(0);
                }}
                disabled={!ready || busy}
              >
                {preview ? "Edit trail" : "Preview"}
              </button>
            </header>
            {!hydrated ? (
              <div className="trail-empty">
                <Loader2 className="animate-spin" /> Opening your trail…
              </div>
            ) : (
              <>
                <div className="trail-top">
                  <label className="trail-title">
                    <span>Trail title</span>
                    <input
                      aria-label="Trail title"
                      placeholder="e.g. Pump leak, south shed"
                      value={trail.title}
                      maxLength={160}
                      disabled={preview || busy}
                      onChange={(e) => setTrail({ ...trail, title: e.target.value })}
                    />
                  </label>
                  <div className="trail-report-fields">
                    <label>
                      <span>Report title</span>
                      <input
                        aria-label="Report title"
                        maxLength={160}
                        value={trail.report.title}
                        disabled={busy}
                        onChange={(e) =>
                          setTrail({ ...trail, report: { ...trail.report, title: e.target.value } })
                        }
                      />
                    </label>
                    <label>
                      <span>Report reference</span>
                      <input
                        aria-label="Report reference"
                        maxLength={80}
                        value={trail.report.reference}
                        disabled={busy}
                        onChange={(e) =>
                          setTrail({
                            ...trail,
                            report: { ...trail.report, reference: e.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                  <nav className="trail-crumbs" aria-label="Context trail levels">
                    {trail.levels.map((level, i) => (
                      <button
                        key={level.id}
                        aria-current={i === active ? "step" : undefined}
                        onClick={() => go(i)}
                        disabled={busy}
                      >
                        <span>{i + 1}</span>
                        {level.title || levelLabel(i)}
                        {i < trail.levels.length - 1 && !level.hotspot && (
                          <span className="trail-link-needed" aria-label="Needs a link">
                            ·
                          </span>
                        )}
                      </button>
                    ))}
                  </nav>
                </div>
                <div className="trail-body">
                  {!current ? (
                    <div className="trail-empty">
                      <Layers size={48} strokeWidth={1.5} />
                      <h2>Start with the wider view.</h2>
                      <p>
                        Then add closer photos of the same subject.
                        <br />
                        Link each view with a yellow highlight.
                      </p>
                      <button
                        className="trail-button trail-primary"
                        disabled={busy}
                        onClick={() => photoInput.current?.click()}
                      >
                        <ImagePlus size={18} /> Add photos, wide to close
                      </button>
                      <button
                        className="trail-button"
                        disabled={busy}
                        onClick={() => void chooseTrail()}
                      >
                        Open editable trail file
                      </button>
                      <p className="trail-guidance">
                        Opening replaces this working trail only after a valid file is selected. The
                        previous draft is kept in local recovery.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="trail-image-area">
                        <div
                          ref={stage}
                          className={`trail-stage ${boxing || marking ? "trail-drawing" : ""}`}
                          style={{
                            aspectRatio: `${current.width}/${current.height}`,
                            width: `min(100%, ${(52 * current.width) / current.height}dvh)`,
                          }}
                          onPointerDown={pointerDown}
                          onPointerMove={pointerMove}
                          onPointerUp={pointerUp}
                          onPointerCancel={() => {
                            start.current = null;
                            setDraftBox(null);
                          }}
                        >
                          <img
                            src={current.image}
                            alt={current.title || levelLabel(active)}
                            draggable={false}
                          />
                          {current.annotations.map((annotation, i) => (
                            <div
                              key={annotation.id}
                              className={`trail-mark ${annotation.kind === "redact" ? "trail-mark-redact" : ""}`}
                              style={{
                                left: `${annotation.box.x * 100}%`,
                                top: `${annotation.box.y * 100}%`,
                                width: `${annotation.box.w * 100}%`,
                                height: `${annotation.box.h * 100}%`,
                                borderColor:
                                  annotation.severity === "major"
                                    ? "#ef4444"
                                    : annotation.severity === "info"
                                      ? "#38bdf8"
                                      : "#facc15",
                                borderRadius: annotation.shape === "ellipse" ? "50%" : "6px",
                              }}
                            >
                              {annotation.kind === "redact"
                                ? null
                                : `${i + 1}. ${annotation.severity?.toUpperCase() ?? "MINOR"}`}
                            </div>
                          ))}
                          {box && hasNext && (
                            <button
                              className={`trail-hotspot ${boxing || marking ? "trail-inert" : ""}`}
                              aria-label={`Open closer view: ${trail.levels[active + 1].title}`}
                              style={{
                                left: `${box.x * 100}%`,
                                top: `${box.y * 100}%`,
                                width: `${box.w * 100}%`,
                                height: `${box.h * 100}%`,
                              }}
                              onClick={() => {
                                if (!boxing && !marking) go(active + 1);
                              }}
                              tabIndex={boxing || marking ? -1 : 0}
                            >
                              <span>
                                Open closer view <ArrowRight size={14} />
                              </span>
                            </button>
                          )}
                        </div>
                        <div className="trail-view-nav">
                          <button
                            className="trail-button"
                            onClick={() => go(active - 1)}
                            disabled={active === 0 || busy}
                          >
                            <ArrowLeft size={16} /> Wider
                          </button>
                          <span>
                            {active + 1} / {trail.levels.length}
                            {current.videoTime !== undefined &&
                              ` · video ${current.videoTime.toFixed(1)}s`}
                          </span>
                          <button
                            className="trail-button"
                            onClick={() => go(active + 1)}
                            disabled={!hasNext || busy}
                          >
                            Closer <ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                      <aside className="trail-details">
                        {preview ? (
                          <>
                            <h2>{current.title || levelLabel(active)}</h2>
                            <p className="trail-note">{current.note || "No description added."}</p>
                            <p className="trail-guidance">
                              {hasNext
                                ? "Tap the yellow highlight to open the closer view."
                                : "The exact detail, with the wider context one tap away."}
                            </p>
                            <button
                              className="trail-button"
                              disabled={active === 0}
                              onClick={() => go(0)}
                            >
                              Back to the widest view
                            </button>
                          </>
                        ) : (
                          <>
                            <label>
                              <span>View name</span>
                              <input
                                aria-label="View name"
                                maxLength={160}
                                value={current.title}
                                disabled={busy}
                                onChange={(e) => updateLevel({ title: e.target.value })}
                              />
                            </label>
                            <section
                              className="trail-annotation-editor"
                              aria-label="Photo annotations"
                            >
                              <h3>Photo annotations</h3>
                              {current.annotations.map((annotation, i) => (
                                <div className="trail-annotation" key={annotation.id}>
                                  <label>
                                    <span>
                                      {annotation.kind === "redact"
                                        ? "Redacted pixels"
                                        : `Mark ${i + 1} label`}
                                    </span>
                                    <input
                                      aria-label={`Mark ${i + 1} label`}
                                      maxLength={500}
                                      value={
                                        annotation.kind === "redact"
                                          ? "Redaction"
                                          : annotation.label
                                      }
                                      disabled={busy || annotation.kind === "redact"}
                                      onChange={(e) =>
                                        updateLevel({
                                          annotations: current.annotations.map((mark, index) =>
                                            index === i ? { ...mark, label: e.target.value } : mark,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  {annotation.kind !== "redact" && (
                                    <div className="trail-annotation-options">
                                      <label>
                                        <span>Severity</span>
                                        <select
                                          aria-label={`Mark ${i + 1} severity`}
                                          value={annotation.severity ?? "minor"}
                                          disabled={busy}
                                          onChange={(e) =>
                                            updateLevel({
                                              annotations: current.annotations.map((mark, index) =>
                                                index === i
                                                  ? {
                                                      ...mark,
                                                      severity: e.target
                                                        .value as Annotation["severity"],
                                                    }
                                                  : mark,
                                              ),
                                            })
                                          }
                                        >
                                          <option value="info">Info</option>
                                          <option value="minor">Minor</option>
                                          <option value="major">Major</option>
                                        </select>
                                      </label>
                                      <label>
                                        <span>Shape</span>
                                        <select
                                          aria-label={`Mark ${i + 1} shape`}
                                          value={annotation.shape ?? "box"}
                                          disabled={busy}
                                          onChange={(e) =>
                                            updateLevel({
                                              annotations: current.annotations.map((mark, index) =>
                                                index === i
                                                  ? {
                                                      ...mark,
                                                      shape: e.target.value as Annotation["shape"],
                                                    }
                                                  : mark,
                                              ),
                                            })
                                          }
                                        >
                                          <option value="box">Box</option>
                                          <option value="ellipse">Ellipse</option>
                                        </select>
                                      </label>
                                      <button
                                        className="trail-button"
                                        disabled={busy}
                                        onClick={() =>
                                          updateLevel({
                                            annotations: current.annotations.filter(
                                              (_, index) => index !== i,
                                            ),
                                          })
                                        }
                                      >
                                        Remove mark
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                              <button
                                className={`trail-button ${marking ? "trail-primary" : ""}`}
                                disabled={
                                  busy || current.annotations.length >= MAX_TRAIL_ANNOTATIONS
                                }
                                aria-pressed={marking}
                                onClick={() => {
                                  setMarking(!marking);
                                  setBoxing(false);
                                  setDraftBox(null);
                                }}
                              >
                                {marking ? "Cancel mark" : "Draw annotation mark"}
                              </button>
                              <p className="trail-guidance">
                                {marking
                                  ? "Drag on the photo to place a box. Edit the mark label, severity and shape below."
                                  : "Mark geometry, labels and severity are saved with each photo."}
                              </p>
                            </section>
                            <label>
                              <span>What should someone know?</span>
                              <textarea
                                aria-label="View description"
                                maxLength={2000}
                                placeholder="Describe the location, part, or problem…"
                                value={current.note}
                                disabled={busy}
                                onChange={(e) => updateLevel({ note: e.target.value })}
                              />
                            </label>
                            {hasNext ? (
                              <div className="trail-link-panel">
                                <p>
                                  Link to{" "}
                                  <strong>
                                    {trail.levels[active + 1].title || levelLabel(active + 1)}
                                  </strong>
                                </p>
                                <button
                                  className={`trail-button ${boxing ? "trail-primary" : ""}`}
                                  disabled={busy}
                                  aria-pressed={boxing}
                                  onClick={() => {
                                    setBoxing(!boxing);
                                    setDraftBox(null);
                                    setError("");
                                  }}
                                >
                                  <Square size={17} />
                                  {boxing
                                    ? "Cancel drawing"
                                    : current.hotspot
                                      ? "Redraw link"
                                      : "Box the subject"}
                                </button>
                                <p className="trail-guidance">
                                  {boxing
                                    ? "Drag on the photo around the subject shown in the next view."
                                    : current.hotspot
                                      ? "Highlight linked. Tap it to try the closer view."
                                      : "Draw a box on this photo, or use the centered box and redraw it later."}
                                </p>
                                {!current.hotspot && !boxing && (
                                  <button
                                    className="trail-button"
                                    disabled={busy}
                                    onClick={() =>
                                      updateLevel({ hotspot: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 } })
                                    }
                                  >
                                    Use centered box
                                  </button>
                                )}
                              </div>
                            ) : (
                              <p className="trail-guidance">
                                {trail.levels.length < 2
                                  ? "Add a closer view to link this photo."
                                  : "This is your closest detail. Add a photo to continue the trail."}
                              </p>
                            )}
                          </>
                        )}
                      </aside>
                    </>
                  )}
                </div>
                {!preview && (
                  <div className="trail-capture" aria-label="Add a trail view">
                    <button
                      className="trail-button"
                      disabled={busy || trail.levels.length >= MAX_TRAIL_LEVELS}
                      onClick={() => cameraInput.current?.click()}
                    >
                      <Camera size={17} /> Take photo
                    </button>
                    <button
                      className="trail-button"
                      disabled={busy || trail.levels.length >= MAX_TRAIL_LEVELS}
                      onClick={() => photoInput.current?.click()}
                    >
                      <ImagePlus size={17} /> Add photos
                    </button>
                    <button
                      className="trail-button"
                      disabled={busy || trail.levels.length >= MAX_TRAIL_LEVELS}
                      onClick={() => {
                        if (video) setVideoPicker(true);
                        else videoInput.current?.click();
                      }}
                    >
                      <Video size={17} />
                      {video ? "More video frames" : "Video frames"}
                    </button>
                    <button
                      className="trail-button"
                      disabled={busy || trail.levels.length >= MAX_TRAIL_LEVELS}
                      onClick={() => recordInput.current?.click()}
                    >
                      Record video
                    </button>
                  </div>
                )}
                <footer className="trail-footer">
                  <div className="trail-save-status" role="status">
                    {busy ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Working…
                      </>
                    ) : (
                      <>
                        <Check size={14} /> {status}
                      </>
                    )}
                    {trail.levels.length > 1 && (
                      <span>
                        {completeLinks} / {trail.levels.length - 1} views linked
                      </span>
                    )}
                  </div>
                  {error && (
                    <p className="trail-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="trail-actions">
                    <p className="trail-action-hint">
                      Autosave keeps the working draft on this device. Save creates editable JSON;
                      Open replaces only after validation and keeps the previous draft in local
                      recovery. HTML is a viewer, PDF is a report, and Share opens the system share
                      sheet. Older v1 files migrate their stored photos, notes, and links, but
                      report details and structured marks omitted by v1 cannot be reconstructed.
                      Main-screen Copy remains a separate plain-text summary.
                    </p>
                    <button
                      className="trail-button"
                      disabled={busy || !trail.levels.length}
                      onClick={() => void saveOrShare("draft")}
                    >
                      <Download size={16} /> Save editable trail
                    </button>
                    <button
                      className="trail-button"
                      disabled={busy || !ready}
                      onClick={() => void saveOrShare("viewer")}
                    >
                      Save offline HTML viewer
                    </button>
                    <button
                      className="trail-button"
                      disabled={busy || !trail.levels.length}
                      onClick={() => void saveOrShare("pdf")}
                    >
                      <FileText size={16} /> Export PDF report
                    </button>
                    <button
                      className="trail-button trail-primary"
                      disabled={busy || !ready}
                      onClick={() => void saveOrShare("share")}
                    >
                      <Share2 size={17} /> Share HTML viewer
                    </button>
                    <button
                      className="trail-button"
                      disabled={busy}
                      onClick={() => void chooseTrail()}
                    >
                      Open editable trail
                    </button>
                    <button
                      className="trail-button"
                      disabled={busy || !hasBackup}
                      onClick={() => void restoreBackup()}
                    >
                      Restore previous draft
                    </button>
                    <button
                      className="trail-button"
                      disabled={busy}
                      onClick={() => setNewPrompt(true)}
                    >
                      New trail
                    </button>
                  </div>
                </footer>
              </>
            )}
            <input
              ref={photoInput}
              aria-label="Add trail photos"
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInput}
              aria-label="Take trail photo"
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <input
              ref={videoInput}
              aria-label="Choose trail video"
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setVideo(f);
                  setVideoAt(0);
                  setVideoPicked(0);
                  setVideoPicker(true);
                }
                e.target.value = "";
              }}
            />
            <input
              ref={recordInput}
              aria-label="Record trail video"
              type="file"
              accept="video/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setVideo(f);
                  setVideoAt(0);
                  setVideoPicked(0);
                  setVideoPicker(true);
                }
                e.target.value = "";
              }}
            />
            <input
              ref={importInput}
              aria-label="Open Context Trail file"
              type="file"
              accept=".json,.html,application/json,text/html"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void openFile(f, true);
                else {
                  actionBusy.current = false;
                  setBusy(false);
                  setStatus("Open cancelled; current draft kept");
                }
                e.target.value = "";
              }}
            />
            {video && videoPicker && (
              <VideoFramePicker
                videoFile={video}
                initialTime={videoAt}
                onCancel={() => setVideoPicker(false)}
                onPickFrame={(file, at) => {
                  setVideoAt(at);
                  return addFiles([file], at);
                }}
                continuous
                pickedCount={videoPicked}
                captureDisabled={busy || trail.levels.length >= MAX_TRAIL_LEVELS}
                onDone={() => {
                  setVideoPicker(false);
                  setActive(0);
                }}
                feedback={
                  error ||
                  (videoPicked
                    ? `${videoPicked} frame${videoPicked === 1 ? "" : "s"} added. Scrub closer and capture the next view.`
                    : "Start wide, then capture the closer views in order.")
                }
              />
            )}
            {newPrompt && (
              <div
                className="trail-confirm"
                role="dialog"
                aria-modal="true"
                aria-label="Start a new trail"
              >
                <div>
                  <h2>Keep this trail before starting another.</h2>
                  <p>Your current trail will be saved as a backup file.</p>
                  <button
                    className="trail-button trail-primary"
                    disabled={busy}
                    onClick={() => void newTrail()}
                  >
                    Save backup and start new
                  </button>
                  <button
                    className="trail-button"
                    disabled={busy}
                    onClick={() => setNewPrompt(false)}
                  >
                    <X size={16} /> Keep editing
                  </button>
                </div>
              </div>
            )}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
