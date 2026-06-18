import { Capacitor, registerPlugin } from "@capacitor/core";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.soupytag.app";

type ReviewPlugin = {
  requestReview: () => Promise<{ launched: boolean }>;
};

const Review = registerPlugin<ReviewPlugin>("SoupyReview");

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
}): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
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
      return true;
    } catch {
      // Older tester builds do not have these plugins. Continue to web fallbacks.
    }
  }

  const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
    }
  }
  return false;
}
