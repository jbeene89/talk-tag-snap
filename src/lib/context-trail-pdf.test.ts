import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { createTrailPdf } from "./context-trail-pdf.ts";
import type { ContextTrail } from "./context-trail.ts";

const testFonts = async () => ({
  latin: readFileSync(new URL("../assets/fonts/context-trail/DejaVuSans.ttf", import.meta.url)).toString("base64"),
  cjk: readFileSync(new URL("../assets/fonts/context-trail/NotoSansSC-Regular.ttf", import.meta.url)).toString("base64"),
});

const jpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxA//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxA//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

function fixture(): ContextTrail {
  return {
    version: 2,
    title: "Pump inspection",
    report: { title: "Annual pump inspection", reference: "Site 4B / Frame set 27" },
    levels: Array.from({ length: 3 }, (_, index) => ({
      id: `view-${index + 1}`,
      title: ["Wide view", "Flange", "Crack detail"][index],
      note:
        index === 1
          ? `${"Long note text ".repeat(125)}End of complete note.`
          : `Photo ${index + 1} note`,
      image: jpeg,
      width: 1600,
      height: 1000,
      annotations: [
        {
          id: `mark-${index + 1}`,
          label: ["Paint blister", "Corrosion", "Hairline crack"][index],
          box: { x: 0.2, y: 0.25, w: 0.2, h: 0.15 },
          severity: index === 2 ? "major" : "minor",
          shape: index === 1 ? "ellipse" : "box",
        },
      ],
      ...(index < 2 ? { hotspot: { x: 0.3, y: 0.3, w: 0.3, h: 0.3 } } : {}),
      ...(index === 2 ? { videoTime: 12.4 } : {}),
    })),
  };
}

test("creates a multi-page PDF with every photo, mark reference, note, and report context", async () => {
  const pdf = await createTrailPdf(fixture(), testFonts);
  assert.equal(pdf.type, "application/pdf");
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const pageCount = (bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pageCount >= 6, `expected at least six report pages, got ${pageCount}`);
  const readableStreams: Buffer[] = [];
  for (const match of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      readableStreams.push(inflateSync(Buffer.from(match[1], "latin1")));
    } catch {
      continue;
    }
  }
  const text = Buffer.concat(readableStreams).toString("latin1");
  for (const value of [
    "Annual pump inspection",
    "Site 4B / Frame set 27",
    "Paint blister",
    "Corrosion",
    "Hairline crack",
    "End of complete note.",
    "Video frame reference",
    "Link to view 2",
  ]) {
    assert.ok(text.includes(value), `missing PDF content: ${value}`);
  }
});

test("rejects an empty report instead of emitting a misleading blank PDF", async () => {
  await assert.rejects(createTrailPdf({ ...fixture(), levels: [] }), /Add a photo/);
});

test("paginates long notes and large mark lists without dropping their final text", async () => {
  const trail = fixture();
  trail.levels = [trail.levels[0]];
  trail.levels[0].note = `${"Long inspection note ".repeat(90)}END OF FULL NOTE`;
  trail.levels[0].annotations = Array.from({ length: 70 }, (_, index) => ({
    id: `long-mark-${index}`,
    label: `Annotation ${index + 1}: ${"synthetic detailed label ".repeat(12)}`,
    box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    severity: "major" as const,
    shape: "box" as const,
  }));
  const pdf = await createTrailPdf(trail, testFonts);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  const pageCount = (bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pageCount > 2, "long content should continue onto additional pages");
  const decoded = [];
  for (const match of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      decoded.push(inflateSync(Buffer.from(match[1], "latin1")));
    } catch {
      continue;
    }
  }
  const text = Buffer.concat(decoded).toString("latin1");
  assert.ok(text.includes("END OF FULL NOTE"));
  assert.ok(text.includes("Annotation 70:"));
});

test("renders and maps valid CJK, arrow, bullet and Greek report text", async () => {
  const trail = fixture();
  trail.levels = [trail.levels[0]];
  trail.levels[0].note = "裂缝 detected → replace • Δ 2 mm";
  const pdf = await createTrailPdf(trail, testFonts);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  const decoded: Buffer[] = [];
  for (const match of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      decoded.push(inflateSync(Buffer.from(match[1], "latin1")));
    } catch {
      continue;
    }
  }
  const mappings = Buffer.concat(decoded).toString("latin1");
  for (const codePoint of ["88c2", "7f1d", "2192", "2022", "0394"]) {
    assert.ok(mappings.includes(codePoint), `missing Unicode ToUnicode mapping: ${codePoint}`);
  }
  assert.ok(mappings.includes("detected"));
  assert.ok(mappings.includes("replace"));
  assert.ok(mappings.includes("2 mm"));
});

test("wraps a long report reference within the page header", async () => {
  const trail = fixture();
  trail.report.reference = "W".repeat(80);
  trail.levels = [trail.levels[0]];
  const pdf = await createTrailPdf(trail, testFonts);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  const decoded: Buffer[] = [];
  for (const match of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      decoded.push(inflateSync(Buffer.from(match[1], "latin1")));
    } catch {
      continue;
    }
  }
  const content = Buffer.concat(decoded).toString("latin1");
  assert.ok(content.includes("(Reference:"));
  assert.ok(content.includes("WWWWWWWWWWWWWWWWWW"));
  assert.ok(!content.includes(`(Reference: ${trail.report.reference}) Tj`));
});
