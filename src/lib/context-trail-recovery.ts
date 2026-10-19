import { parseTrail, validateTrail, type ContextTrail } from "./context-trail.ts";

export async function replaceTrailFromFile(options: {
  file: Pick<File, "text">;
  current: () => ContextTrail;
  prepare: (trail: ContextTrail) => Promise<ContextTrail>;
  saveCurrent: (trail: ContextTrail) => Promise<void>;
  saveBackup: (trail: ContextTrail) => Promise<void>;
  commit: (trail: ContextTrail) => void;
}): Promise<boolean> {
  const imported = validateTrail(
    await options.prepare(parseTrail(await options.file.text())),
  );
  const current = validateTrail(options.current());
  const hasWork =
    Boolean(current.title.trim() || current.report.title.trim() || current.report.reference.trim()) ||
    current.levels.length > 0;
  if (hasWork) {
    await options.saveCurrent(current);
    await options.saveBackup(current);
  }
  options.commit(imported);
  return hasWork;
}

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

export async function prepareTrailRedactions(
  trail: ContextTrail,
  prepareImage: (
    image: string,
    annotations: ContextTrail["levels"][number]["annotations"],
  ) => Promise<{ image: string; width: number; height: number }>,
): Promise<ContextTrail> {
  const levels = await Promise.all(
    trail.levels.map(async (level) => {
      if (
        level.redactionsBaked ||
        !level.annotations.some((annotation) => annotation.kind === "redact")
      )
        return level;
      const photo = await prepareImage(level.image, level.annotations);
      return { ...level, ...photo, redactionsBaked: true };
    }),
  );
  return { ...trail, levels };
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
