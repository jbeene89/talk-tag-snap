import { jsPDF } from "jspdf";
import { sevOf, shapeOf, type Severity } from "./annotations.ts";
import { validateTrail, type ContextTrail, type TrailLevel } from "./context-trail.ts";

const LATIN_FONT = "TrailDejaVu";
const CJK_FONT = "TrailNoto";
const latinFontUrl = new URL("../assets/fonts/context-trail/DejaVuSans.ttf", import.meta.url);
const cjkFontUrl = new URL("../assets/fonts/context-trail/NotoSansSC-Regular.ttf", import.meta.url);
const COLORS: Record<Severity, [number, number, number]> = {
  info: [14, 165, 233],
  minor: [202, 138, 4],
  major: [220, 38, 38],
};
const MARGIN = 40;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const TEXT_EDGE_PADDING = 4;

type FontData = { latin: string; cjk: string };
type FontLoader = () => Promise<FontData>;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function loadBundledFonts(): Promise<FontData> {
  const [latin, cjk] = await Promise.all([fetch(latinFontUrl), fetch(cjkFontUrl)]);
  if (!latin.ok || !cjk.ok) throw new Error("Offline PDF fonts could not be loaded.");
  const [latinBytes, cjkBytes] = await Promise.all([latin.arrayBuffer(), cjk.arrayBuffer()]);
  return {
    latin: toBase64(new Uint8Array(latinBytes)),
    cjk: toBase64(new Uint8Array(cjkBytes)),
  };
}

function registerFont(doc: jsPDF, family: string, file: string, data: string) {
  doc.addFileToVFS(file, data);
  doc.addFont(file, family, "normal");
}

function fontForCharacter(doc: jsPDF, character: string): string {
  const codePoint = character.codePointAt(0)!;
  if (codePoint >= 0x20 && codePoint <= 0x7e) return "helvetica";
  for (const family of [LATIN_FONT, CJK_FONT]) {
    doc.setFont(family, "normal");
    const tables = doc.getFont().metadata.cmap.tables as Array<{
      isUnicode: boolean;
      codeMap: Record<number, number>;
    }>;
    if (tables.some((table) => table.isUnicode && table.codeMap[codePoint] !== undefined))
      return family;
  }
  throw new Error(
    `PDF report cannot render character U+${codePoint.toString(16).toUpperCase()}. Save the editable trail instead.`,
  );
}

function textWidth(doc: jsPDF, text: string): number {
  return [...text].reduce((width, character) => {
    const family = fontForCharacter(doc, character);
    doc.setFont(family, "normal");
    return width + doc.getTextWidth(character);
  }, 0);
}

function splitTextToWidth(doc: jsPDF, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    let lineWidth = 0;
    for (const character of paragraph) {
      const characterWidth = textWidth(doc, character);
      if (line && lineWidth + characterWidth > width - TEXT_EDGE_PADDING) {
        lines.push(line);
        line = "";
        lineWidth = 0;
      }
      line += character;
      lineWidth += characterWidth;
    }
    lines.push(line);
  }
  return lines;
}

function drawText(doc: jsPDF, text: string, x: number, y: number) {
  let run = "";
  let runFamily = "";
  const startX = x;
  for (const character of text) {
    const family = fontForCharacter(doc, character);
    if (run && family !== runFamily) {
      doc.setFont(runFamily, "normal");
      if (x + doc.getTextWidth(run) > PAGE_WIDTH - MARGIN + 0.01)
        throw new Error("PDF text exceeds the page content margin.");
      doc.text(run, x, y);
      x += doc.getTextWidth(run);
      run = "";
    }
    run += character;
    runFamily = family;
  }
  if (run) {
    doc.setFont(runFamily, "normal");
    if (x + doc.getTextWidth(run) > PAGE_WIDTH - MARGIN + 0.01)
      throw new Error("PDF text exceeds the page content margin.");
    doc.text(run, x, y);
  }
  if (startX < MARGIN - 0.01) throw new Error("PDF text exceeds the page content margin.");
}

function drawHeader(doc: jsPDF, trail: ContextTrail, heading: string): number {
  const title = trail.report.title.trim() || trail.title.trim() || "Context Trail Report";
  doc.setFontSize(14);
  let y = 34;
  const width = PAGE_WIDTH - MARGIN * 2;
  const titleLines = splitTextToWidth(doc, title, width);
  titleLines.forEach((line, index) => drawText(doc, line, MARGIN, y + index * 16));
  y += titleLines.length * 16;
  doc.setFontSize(9);
  const reference = trail.report.reference.trim();
  if (reference) {
    const referenceLines = splitTextToWidth(doc, `Reference: ${reference}`, width);
    referenceLines.forEach((line, index) => drawText(doc, line, MARGIN, y + index * 12 + 1));
    y += referenceLines.length * 12 + 2;
  }
  doc.setFontSize(12);
  const headingLines = splitTextToWidth(doc, heading, width);
  headingLines.forEach((line, index) => drawText(doc, line, MARGIN, y + 3 + index * 14));
  return y + headingLines.length * 14 + 7;
}

function fitImage(level: TrailLevel, maxHeight = 420) {
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const scale = Math.min(maxWidth / level.width, maxHeight / level.height);
  return { width: level.width * scale, height: level.height * scale };
}

function drawPhotoPage(doc: jsPDF, trail: ContextTrail, level: TrailLevel, index: number) {
  const label = level.title || `View ${index + 1}`;
  doc.addPage();
  const headerBottom = drawHeader(doc, trail, `${index + 1}. ${label}`);
  const context = trail.levels
    .slice(0, index + 1)
    .map((entry, i) => `${i + 1}. ${entry.title || `View ${i + 1}`}`)
    .join("  >  ");
  doc.setFontSize(9);
  const contextY = headerBottom + 14;
  const contextLines = splitTextToWidth(doc, `Context: ${context}`, PAGE_WIDTH - MARGIN * 2);
  contextLines.forEach((line, lineIndex) => drawText(doc, line, MARGIN, contextY + lineIndex * 10));
  let photoY = contextY + contextLines.length * 10 + 12;
  if (level.videoTime !== undefined) {
    drawText(doc, `Video frame reference: ${level.videoTime.toFixed(1)}s`, MARGIN, photoY);
    photoY += 13;
  }

  const image = fitImage(level, Math.max(100, PAGE_HEIGHT - photoY - 110));
  const x = (PAGE_WIDTH - image.width) / 2;
  const y = photoY;
  doc.addImage(
    level.image,
    level.image.startsWith("data:image/png") ? "PNG" : "JPEG",
    x,
    y,
    image.width,
    image.height,
  );
  level.annotations.forEach((annotation, annotationIndex) => {
    const left = x + annotation.box.x * image.width;
    const top = y + annotation.box.y * image.height;
    const width = annotation.box.w * image.width;
    const height = annotation.box.h * image.height;
    if (annotation.kind === "redact") {
      doc.setFillColor(10, 10, 10);
      doc.rect(left, top, width, height, "F");
      return;
    }
    const color = COLORS[sevOf(annotation)];
    doc.setDrawColor(...color);
    doc.setLineWidth(2);
    if (shapeOf(annotation) === "ellipse")
      doc.ellipse(left + width / 2, top + height / 2, width / 2, height / 2);
    else doc.rect(left, top, width, height);
    const mark = `${annotationIndex + 1}`;
    doc.setFontSize(9);
    doc.setFont(LATIN_FONT, "normal");
    doc.setFillColor(10, 10, 10);
    doc.rect(left, Math.max(y, top - 14), Math.max(16, doc.getTextWidth(mark) + 8), 13, "F");
    doc.setTextColor(...color);
    drawText(doc, mark, left + 4, Math.max(y + 10, top - 4));
  });
  if (index < trail.levels.length - 1 && level.hotspot) {
    const hotspot = level.hotspot;
    doc.setDrawColor(250, 204, 21);
    doc.setLineWidth(2);
    doc.rect(
      x + hotspot.x * image.width,
      y + hotspot.y * image.height,
      hotspot.w * image.width,
      hotspot.h * image.height,
    );
    doc.setTextColor(120, 83, 0);
    doc.setFontSize(8);
    drawText(doc, `Link to view ${index + 2}`, MARGIN, y + image.height + 15);
  }
}

function addDetailPages(doc: jsPDF, trail: ContextTrail, index: number) {
  const level = trail.levels[index];
  const heading = `${index + 1}. ${level.title || `View ${index + 1}`} — notes and marks`;
  doc.addPage();
  let y = drawHeader(doc, trail, heading) + 20;
  const bottom = PAGE_HEIGHT - 46;
  const width = PAGE_WIDTH - MARGIN * 2;
  const writeSection = (title: string, content: string) => {
    doc.setFontSize(11);
    if (y + 20 > bottom) {
      doc.addPage();
      y = drawHeader(doc, trail, `${heading} (continued)`) + 20;
      doc.setFontSize(11);
    }
    drawText(doc, title, MARGIN, y);
    y += 16;
    doc.setFontSize(10);
    const lines = splitTextToWidth(doc, content || "(none)", width);
    for (const line of lines) {
      if (y + 14 > bottom) {
        doc.addPage();
        y = drawHeader(doc, trail, `${heading} (continued)`) + 20;
        doc.setFontSize(10);
      }
      drawText(doc, line, MARGIN, y);
      y += 14;
    }
    y += 12;
  };
  writeSection("Notes", level.note);
  if (level.annotations.length) {
    const marks = level.annotations.map((annotation, i) =>
      annotation.kind === "redact"
        ? `${i + 1}. Redacted area`
        : `${i + 1}. [${sevOf(annotation).toUpperCase()} · ${shapeOf(annotation)}] ${annotation.label || "(no label)"}`,
    );
    writeSection("Annotation mark references", marks.join("\n"));
  } else {
    writeSection("Annotation mark references", "No annotations on this photo.");
  }
  if (index < trail.levels.length - 1) {
    const next = trail.levels[index + 1];
    writeSection(
      "Linked context",
      level.hotspot
        ? `The highlighted frame area links to view ${index + 2}: ${next.title || "Untitled view"}.`
        : `Next view: ${next.title || "Untitled view"} (no link box saved).`,
    );
  }
}

async function supportedPdfImage(level: TrailLevel): Promise<string> {
  const needsRedaction = level.annotations.some((annotation) => annotation.kind === "redact");
  if (
    !needsRedaction &&
    (level.image.startsWith("data:image/jpeg") || level.image.startsWith("data:image/png"))
  )
    return level.image;
  const photo = new Image();
  await new Promise<void>((resolve, reject) => {
    photo.onload = () => resolve();
    photo.onerror = () =>
      reject(new Error("A photo in this trail could not be prepared for PDF export."));
    photo.src = level.image;
  });
  const canvas = document.createElement("canvas");
  canvas.width = photo.naturalWidth;
  canvas.height = photo.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo processing is unavailable.");
  context.drawImage(photo, 0, 0);
  level.annotations.forEach((annotation) => {
    if (annotation.kind !== "redact") return;
    context.fillStyle = "#0a0a0a";
    context.fillRect(
      annotation.box.x * canvas.width,
      annotation.box.y * canvas.height,
      annotation.box.w * canvas.width,
      annotation.box.h * canvas.height,
    );
  });
  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function createTrailPdf(
  value: ContextTrail,
  loadFonts: FontLoader = loadBundledFonts,
): Promise<Blob> {
  const trail = validateTrail(value);
  if (!trail.levels.length) throw new Error("Add a photo before creating a PDF report.");
  const levels = await Promise.all(
    trail.levels.map(async (level) => ({ ...level, image: await supportedPdfImage(level) })),
  );
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const fonts = await loadFonts();
  registerFont(doc, LATIN_FONT, "DejaVuSans.ttf", fonts.latin);
  registerFont(doc, CJK_FONT, "NotoSansSC-Regular.ttf", fonts.cjk);
  doc.setProperties({
    title: trail.report.title || trail.title || "Context Trail Report",
    subject: trail.report.reference ? `Reference ${trail.report.reference}` : "Context Trail",
    creator: "Talk&Tag",
  });
  doc.deletePage(1);
  levels.forEach((level, index) => {
    drawPhotoPage(doc, trail, level, index);
    addDetailPages(doc, trail, index);
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont(LATIN_FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 20, { align: "right" });
  }
  return doc.output("blob");
}
