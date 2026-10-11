import { test } from "node:test";
import assert from "node:assert/strict";
import { trailHtml, type ContextTrail } from "./context-trail.ts";
import { MAX_PDF_EXPORT_BYTES, validateDocumentExport } from "./document-export.ts";

function fixture(): ContextTrail {
  return {
    version: 2,
    title: "Synthetic report",
    report: { title: "Offline test", reference: "Fixture 1" },
    levels: [
      {
        id: "wide",
        title: "Wide view",
        note: "",
        image: "data:image/jpeg;base64,AAAA",
        width: 100,
        height: 80,
        annotations: [],
        hotspot: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
      },
      {
        id: "detail",
        title: "Detail",
        note: "",
        image: "data:image/jpeg;base64,AAAA",
        width: 80,
        height: 100,
        annotations: [],
      },
    ],
  };
}

test("preflights complete supported PDF, editable JSON, and offline HTML exports", async () => {
  await validateDocumentExport(
    new Blob(["%PDF-1.7\nsynthetic fixture\n%%EOF"], { type: "application/pdf" }),
    "report.pdf",
  );
  await validateDocumentExport(
    new Blob([JSON.stringify(fixture())], { type: "application/json" }),
    "report.context-trail.json",
  );
  await validateDocumentExport(
    new Blob([trailHtml(fixture())], { type: "text/html" }),
    "report.html",
  );
});

test("rejects empty, malformed, oversized, and MIME-mismatched document exports", async () => {
  await assert.rejects(
    validateDocumentExport(new Blob([], { type: "application/pdf" }), "report.pdf"),
    /empty/,
  );
  await assert.rejects(
    validateDocumentExport(new Blob(["not a pdf"], { type: "application/pdf" }), "report.pdf"),
    /signature/,
  );
  await assert.rejects(
    validateDocumentExport(new Blob(["%PDF-1.7"], { type: "application/pdf" }), "report.pdf"),
    /incomplete/,
  );
  await assert.rejects(
    validateDocumentExport(
      { size: MAX_PDF_EXPORT_BYTES + 1, type: "application/pdf" } as Blob,
      "report.pdf",
    ),
    /size limit/,
  );
  await assert.rejects(
    validateDocumentExport(new Blob(["{"], { type: "application/json" }), "report.json"),
  );
  await assert.rejects(
    validateDocumentExport(new Blob(["<html></html>"], { type: "text/html" }), "report.html"),
    /signature/,
  );
  await assert.rejects(
    validateDocumentExport(new Blob(["%PDF-"], { type: "application/pdf" }), "report.html"),
    /extension/,
  );
});
