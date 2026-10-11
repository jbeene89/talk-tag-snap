import { validateTrail, type ContextTrail } from "./context-trail.ts";

export async function hydrateTrailDraft(options: {
  loadCurrent: () => Promise<ContextTrail | null>;
  loadBackup: () => Promise<ContextTrail | null>;
  prepare: (trail: ContextTrail) => Promise<ContextTrail>;
  emptyTrail: () => ContextTrail;
}): Promise<{
  trail: ContextTrail;
  hasBackup: boolean;
  backupReadError: unknown | null;
}> {
  const current = await options.loadCurrent();
  let backup: ContextTrail | null = null;
  let backupReadError: unknown | null = null;
  try {
    backup = await options.loadBackup();
  } catch (error) {
    backupReadError = error;
  }
  const trail = validateTrail(await options.prepare(current ?? options.emptyTrail()));
  return { trail, hasBackup: backup !== null, backupReadError };
}

export async function restoreTrailBackup(options: {
  loadBackup: () => Promise<ContextTrail | null>;
  current: ContextTrail;
  prepare: (trail: ContextTrail) => Promise<ContextTrail>;
  saveCurrent: (trail: ContextTrail) => Promise<void>;
  saveBackup: (trail: ContextTrail) => Promise<void>;
  commit: (trail: ContextTrail) => void;
}): Promise<boolean> {
  const backup = await options.loadBackup();
  if (!backup) return false;
  const restored = validateTrail(await options.prepare(backup));
  const current = validateTrail(options.current);
  await options.saveCurrent(current);
  await options.saveBackup(current);
  options.commit(restored);
  return true;
}
