// Shared annotation model + pure helpers for the tagging flow.
// Kept framework-free so the logic is unit-testable without a DOM.

export type Severity = "info" | "minor" | "major";
export type Shape = "box" | "ellipse";
export type Kind = "defect" | "redact";
export type Box = { x: number; y: number; w: number; h: number };

export type Annotation = {
  id: string;
  label: string;
  box: Box;
  severity?: Severity;
  /** Outline shape for a defect. Ignored for redactions (always filled). */
  shape?: Shape;
  /** "redact" annotations hide a region on export and are not numbered. */
  kind?: Kind;
};

export const SEVERITIES: readonly Severity[] = ["info", "minor", "major"] as const;

export const sevOf = (a: Annotation): Severity => a.severity ?? "minor";
export const shapeOf = (a: Annotation): Shape => a.shape ?? "box";
export const isRedaction = (a: Annotation): boolean => a.kind === "redact";
export const isDefect = (a: Annotation): boolean => !isRedaction(a);

// Common field-defect terms surfaced as one-tap chips to speed up tagging.
export const QUICK_LABELS: readonly string[] = [
  "Crack",
  "Rust / corrosion",
  "Leak",
  "Dent",
  "Missing part",
  "Loose / detached",
  "Worn",
  "Damaged",
] as const;

/** Defects only, in array order — the list that gets numbered and reported. */
export function defects(annotations: Annotation[]): Annotation[] {
  return annotations.filter(isDefect);
}

export function redactions(annotations: Annotation[]): Annotation[] {
  return annotations.filter(isRedaction);
}

/**
 * Maps each defect annotation id to its 1-based display number, skipping
 * redactions so on-image badges, the copied list, and the share text agree.
 */
export function defectNumbers(annotations: Annotation[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const a of annotations) {
    if (isDefect(a)) map.set(a.id, ++n);
  }
  return map;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Filename stem for an exported image, derived from the report title. */
export function reportFileBase(title?: string): string {
  const slug = slugify((title ?? "").trim());
  return slug || "defect";
}

export type ReportTextOptions = {
  title?: string;
  reference?: string;
  timestamp?: string;
  withSeverity?: boolean;
};

/**
 * Builds the plain-text report shared alongside the image and copied to the
 * clipboard. Header lines (title / reference / timestamp) are included only
 * when present; the numbered body lists defects in order.
 */
export function reportText(annotations: Annotation[], options: ReportTextOptions = {}): string {
  const { title, reference, timestamp, withSeverity = true } = options;
  const header: string[] = [];
  if (title?.trim()) header.push(title.trim());
  if (reference?.trim()) header.push(`Ref: ${reference.trim()}`);
  if (timestamp?.trim()) header.push(timestamp.trim());

  const body = defects(annotations).map((a, i) => {
    const desc = a.label?.trim() || "(no description)";
    return withSeverity ? `${i + 1}. [${sevOf(a).toUpperCase()}] ${desc}` : `${i + 1}. ${desc}`;
  });

  if (header.length === 0) return body.join("\n");
  if (body.length === 0) return header.join("\n");
  return `${header.join("\n")}\n\n${body.join("\n")}`;
}

/** Count summary used for the header chip, e.g. "3 tags · 1 hidden". */
export function tagSummary(annotations: Annotation[]): string {
  const d = defects(annotations).length;
  const r = redactions(annotations).length;
  const base = `${d} tag${d === 1 ? "" : "s"}`;
  return r > 0 ? `${base} · ${r} hidden` : base;
}
