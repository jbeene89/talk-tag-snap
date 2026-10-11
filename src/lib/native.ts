import { Capacitor, registerPlugin } from "@capacitor/core";

import { saveImageWithAdapters } from "@/lib/export-image";
import { shareWithAdapters, type ShareOutcome } from "@/lib/share-image";

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
  }) => Promise<{ cancelled?: boolean; fileName?: string; uri?: string }>;
  openDocument: () => Promise<{
    cancelled?: boolean;
    base64?: string;
    fileName?: string;
    mimeType?: string;
  }>;
};

const DocumentPicker = registerPlugin<DocumentPlugin>("SoupyDocument");

export function usesNativeDocumentPicker(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
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
}): Promise<{ cancelled: boolean; fileName: string; location?: string }> {
  if (usesNativeDocumentPicker()) {
    const result = await DocumentPicker.saveDocument({
      base64: await blobToBase64(blob),
      fileName,
      mimeType: blob.type || "application/octet-stream",
    });
    return {
      cancelled: Boolean(result.cancelled),
      fileName: result.fileName || fileName,
      ...(result.uri ? { location: result.uri } : {}),
    };
  }
  downloadBlobInBrowser(blob, fileName);
  return { cancelled: false, fileName };
}

export async function openDocument(): Promise<{ cancelled: boolean; file?: File }> {
  if (!usesNativeDocumentPicker()) return { cancelled: false };
  const result = await DocumentPicker.openDocument();
  if (result.cancelled) return { cancelled: true };
  if (!result.base64) throw new Error("The selected document was empty.");
  const binary = atob(result.base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const fileName = result.fileName || "context-trail";
  return {
    cancelled: false,
    file: new File([bytes], fileName, { type: result.mimeType || "application/octet-stream" }),
  };
}
