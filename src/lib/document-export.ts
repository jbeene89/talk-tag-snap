import { MAX_TRAIL_FILE_BYTES, parseTrail } from "./context-trail.ts";

export const MAX_PDF_EXPORT_BYTES = 64 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/json": ".json",
  "text/html": ".html",
};

export async function validateDocumentExport(blob: Blob, fileName: string): Promise<void> {
  if (!blob.size) throw new Error("The document export is empty.");
  const extension = MIME_EXTENSIONS[blob.type];
  if (!extension || !fileName.toLowerCase().endsWith(extension))
    throw new Error("The document type and filename extension do not match.");
  const maxBytes = blob.type === "application/pdf" ? MAX_PDF_EXPORT_BYTES : MAX_TRAIL_FILE_BYTES;
  if (blob.size > maxBytes) throw new Error("The document exceeds the supported size limit.");

  if (blob.type === "application/pdf") {
    const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (new TextDecoder().decode(header) !== "%PDF-")
      throw new Error("The PDF export does not have a valid PDF signature.");
    const trailer = await blob.slice(Math.max(0, blob.size - 2048)).text();
    if (!trailer.includes("%%EOF"))
      throw new Error("The PDF export is incomplete.");
    return;
  }

  const source = await blob.text();
  if (blob.type === "application/json" && !source.trimStart().startsWith("{"))
    throw new Error("The JSON export does not have a valid trail signature.");
  if (blob.type === "text/html" && !/^\s*<!doctype html>/i.test(source))
    throw new Error("The HTML export does not have a valid document signature.");
  parseTrail(source);
}
