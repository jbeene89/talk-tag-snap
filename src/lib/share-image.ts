export type ShareOutcome = "shared" | "cancelled" | "unavailable";

type ShareAdapters = {
  shareNative?: () => Promise<void>;
  shareWeb?: () => Promise<void>;
};

export async function shareWithAdapters(_adapters: ShareAdapters): Promise<ShareOutcome> {
  const isCancelled = (error: unknown) => {
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    return message.toLowerCase().includes("cancel");
  };

  if (_adapters.shareNative) {
    try {
      await _adapters.shareNative();
      return "shared";
    } catch (error) {
      if (isCancelled(error)) return "cancelled";
    }
  }

  if (_adapters.shareWeb) {
    try {
      await _adapters.shareWeb();
      return "shared";
    } catch (error) {
      if (isCancelled(error)) return "cancelled";
    }
  }

  return "unavailable";
}
