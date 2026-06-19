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
}: {
  blob: Blob;
  fileName: string;
  title: string;
  text: string;
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
      await Share.share({ title, text, files: [saved.uri], dialogTitle: "Share tagged photo" });
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
