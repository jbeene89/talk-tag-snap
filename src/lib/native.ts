import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";

import { saveImageWithAdapters } from "@/lib/export-image";
import { shareWithAdapters, type ShareOutcome } from "@/lib/share-image";
import { validateDocumentExport } from "@/lib/document-export";
import {
  createRestoredResultListenerInstaller,
  DocumentRestoredResultCoordinator,
} from "@/lib/document-restored-result";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.soupytag.app";

type ReviewPlugin = {
  requestReview: () => Promise<{ launched: boolean }>;
};

const Review = registerPlugin<ReviewPlugin>("SoupyReview");

type ExportPlugin = {
  saveImage: (options: {
    base64: string;
    fileName: string;
    mimeType: string;
  }) => Promise<{ uri: string }>;
};

const Export = registerPlugin<ExportPlugin>("SoupyExport");

type DocumentPlugin = {
  saveDocument: (options: {
    base64: string;
    fileName: string;
    mimeType: string;
    requestId: string;
  }) => Promise<{
    requestId?: string;
    ok?: boolean;
    cancelled?: boolean;
    fileName?: string;
    uri?: string;
  }>;
  openDocument: (options: { requestId: string }) => Promise<{
    requestId?: string;
    ok?: boolean;
    cancelled?: boolean;
    base64?: string;
    fileName?: string;
    mimeType?: string;
  }>;
};

const DocumentPicker = registerPlugin<DocumentPlugin>("SoupyDocument");
export const documentRestoredResults = new DocumentRestoredResultCoordinator();
const installRestoredResultListener = createRestoredResultListenerInstaller();

export function usesNativeDocumentPicker(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function initializeDocumentRestoredResults(): Promise<unknown> {
  if (typeof window === "undefined" || !usesNativeDocumentPicker())
    return Promise.resolve(undefined);
  return installRestoredResultListener(
    (listener) => App.addListener("appRestoredResult", listener),
    (event) => {
      void documentRestoredResults.acceptRestoredResult(event);
    },
  ).catch(() => {
    documentRestoredResults.reportListenerFailure();
    return undefined;
  });
}

export async function openStoreListing(): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: PLAY_STORE_URL });
    return;
  } catch {
    if (typeof window !== "undefined") window.open(PLAY_STORE_URL, "_blank", "noopener,noreferrer");
  }
}

export async function requestNativeReview(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return false;
  try {
    const result = await Review.requestReview();
    return result.launched;
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

function downloadBlobInBrowser(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1_000);
}

export async function saveImage({
  blob,
  fileName,
}: {
  blob: Blob;
  fileName: string;
}): Promise<boolean> {
  const saveNative = Capacitor.isNativePlatform()
    ? async (image: Blob, name: string) => {
        const base64 = await blobToBase64(image);
        try {
          await Export.saveImage({
            base64,
            fileName: name,
            mimeType: image.type || "image/jpeg",
          });
          return;
        } catch {
          const { Filesystem, Directory } = await import("@capacitor/filesystem");
          await Filesystem.writeFile({
            path: `SoupyTag/${name}`,
            data: base64,
            directory: Directory.Documents,
            recursive: true,
          });
        }
      }
    : undefined;

  return saveImageWithAdapters(blob, fileName, {
    saveNative,
    downloadWeb: downloadBlobInBrowser,
  });
}

export async function shareImage({
  blob,
  fileName,
  title,
  text,
  dialogTitle = "Share tagged photo",
}: {
  blob: Blob;
  fileName: string;
  title: string;
  text: string;
  dialogTitle?: string;
}): Promise<ShareOutcome> {
  const shareNative = Capacitor.isNativePlatform()
    ? async () => {
        const [{ Filesystem, Directory }, { Share }] = await Promise.all([
          import("@capacitor/filesystem"),
          import("@capacitor/share"),
        ]);
        const saved = await Filesystem.writeFile({
          path: `shares/${fileName}`,
          data: await blobToBase64(blob),
          directory: Directory.Cache,
          recursive: true,
        });
        await Share.share({ title, text, files: [saved.uri], dialogTitle });
      }
    : undefined;

  const shareWeb = async () => {
    const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return;
    }
    throw new Error("Web share unavailable");
  };

  return shareWithAdapters({ shareNative, shareWeb });
}

/** Documents belong in Documents, never the photo gallery's image-only plugin. */
export async function saveDocument({
  blob,
  fileName,
}: {
  blob: Blob;
  fileName: string;
}): Promise<{ cancelled: boolean; success: boolean; fileName: string; location?: string }> {
  await validateDocumentExport(blob, fileName);
  if (usesNativeDocumentPicker()) {
    const requestId = crypto.randomUUID();
    const outcome = documentRestoredResults.waitFor("saveDocument", requestId);
    try {
      const base64 = await blobToBase64(blob);
      void DocumentPicker.saveDocument({
        base64,
        fileName,
        mimeType: blob.type || "application/octet-stream",
        requestId,
      })
        .then((result) =>
          documentRestoredResults.acceptPromiseResult("saveDocument", requestId, result),
        )
        .catch((error: unknown) => {
          documentRestoredResults.failRequest("saveDocument", requestId, error);
        });
    } catch (error) {
      documentRestoredResults.failRequest("saveDocument", requestId, error);
    }
    const result = await outcome;
    if (result.operation !== "saveDocument") throw new Error("The save result was invalid.");
    return {
      cancelled: result.cancelled,
      success: result.success,
      fileName: result.fileName || fileName,
      ...("location" in result && result.location ? { location: result.location } : {}),
    };
  }
  downloadBlobInBrowser(blob, fileName);
  return { cancelled: false, success: true, fileName };
}

export async function openDocument(): Promise<{ cancelled: boolean; file?: File }> {
  if (!usesNativeDocumentPicker()) return { cancelled: false };
  const requestId = crypto.randomUUID();
  const outcome = documentRestoredResults.waitFor("openDocument", requestId);
  try {
    void DocumentPicker.openDocument({ requestId })
      .then((result) =>
        documentRestoredResults.acceptPromiseResult("openDocument", requestId, result),
      )
      .catch((error: unknown) => {
        documentRestoredResults.failRequest("openDocument", requestId, error);
      });
  } catch (error) {
    documentRestoredResults.failRequest("openDocument", requestId, error);
  }
  const result = await outcome;
  if (result.operation !== "openDocument") throw new Error("The open result was invalid.");
  return result;
}
