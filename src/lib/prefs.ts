// Device-level preferences that persist across inspections (unlike the
// per-photo session). Kept DOM-free and defensive so a corrupt or partial
// value never breaks startup.

export type ExportFormat = "jpg" | "png";

export type Prefs = {
  includeTimestamp: boolean;
  useUTC: boolean;
  exportFormat: ExportFormat;
  haptics: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  includeTimestamp: false,
  useUTC: false,
  exportFormat: "jpg",
  haptics: true,
};

export const PREFS_KEY = "soupytag:prefs:v1";

type MinimalStorage = Pick<Storage, "getItem" | "setItem">;

export function loadPrefs(storage: MinimalStorage | undefined): Prefs {
  if (!storage) return { ...DEFAULT_PREFS };
  try {
    const raw = storage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      includeTimestamp: parsed.includeTimestamp === true,
      useUTC: parsed.useUTC === true,
      exportFormat: parsed.exportFormat === "png" ? "png" : "jpg",
      haptics: parsed.haptics !== false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: MinimalStorage | undefined, prefs: Prefs): void {
  if (!storage) return;
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage full / unavailable — preferences are best-effort
  }
}
