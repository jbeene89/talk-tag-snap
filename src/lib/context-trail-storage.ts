import { validateTrail, type ContextTrail } from "./context-trail";
import { createLatestWriter } from "./latest-writer";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("soupytag-context-trails", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Draft storage is unavailable. Save a trail file to keep your work."));
  });
}
async function transaction(
  mode: IDBTransactionMode,
  value?: ContextTrail,
  key = "current",
): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      const store = tx.objectStore("drafts");
      const request = mode === "readonly" ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () =>
        reject(new Error("Could not save this draft. Save a trail file before closing."));
      tx.onabort = () =>
        reject(new Error("Draft storage is full. Save a trail file before closing."));
    });
  } finally {
    db.close();
  }
}
let pendingWrite: Promise<void> = Promise.resolve();
const persistLatest = createLatestWriter<ContextTrail>(async (trail) => {
  await transaction("readwrite", validateTrail(trail));
});

export async function loadTrailDraft(): Promise<ContextTrail | null> {
  await pendingWrite;
  const value = await transaction("readonly");
  return value ? validateTrail(value) : null;
}
export async function loadTrailDraftBackup(): Promise<ContextTrail | null> {
  const value = await transaction("readonly", undefined, "previous");
  return value ? validateTrail(value) : null;
}
export async function saveTrailDraft(trail: ContextTrail): Promise<void> {
  const write = persistLatest(trail);
  // Loading/closing waits for the latest state, even when intermediate edits coalesce.
  pendingWrite = write.catch(() => {});
  await write;
}
export async function saveTrailDraftBackup(trail: ContextTrail): Promise<void> {
  await transaction("readwrite", validateTrail(trail), "previous");
}
