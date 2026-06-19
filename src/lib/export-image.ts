type ExportAdapters = {
  saveNative?: (blob: Blob, fileName: string) => Promise<unknown>;
  downloadWeb: (blob: Blob, fileName: string) => void | Promise<void>;
};

export async function saveImageWithAdapters(
  blob: Blob,
  fileName: string,
  adapters: ExportAdapters,
): Promise<boolean> {
  if (adapters.saveNative) {
    try {
      await adapters.saveNative(blob, fileName);
      return true;
    } catch {
      // Continue to the browser fallback when an older native shell lacks the saver.
    }
  }

  try {
    await adapters.downloadWeb(blob, fileName);
    return true;
  } catch {
    return false;
  }
}
