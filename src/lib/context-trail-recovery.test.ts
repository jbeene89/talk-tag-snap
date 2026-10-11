import { test } from "node:test";
import assert from "node:assert/strict";
import { hydrateTrailDraft, restoreTrailBackup } from "./context-trail-recovery.ts";
import type { ContextTrail } from "./context-trail.ts";

function draft(title: string): ContextTrail {
  return {
    version: 2,
    title,
    report: { title: "", reference: "" },
    levels: [],
  };
}

test("a backup read failure does not prevent restoring the current draft", async () => {
  const current = draft("Current work");
  const result = await hydrateTrailDraft({
    loadCurrent: async () => current,
    loadBackup: async () => {
      throw new Error("backup unavailable");
    },
    prepare: async (trail) => trail,
    emptyTrail: () => draft("Empty"),
  });

  assert.deepEqual(result.trail, current);
  assert.equal(result.hasBackup, false);
  assert.match(String(result.backupReadError), /backup unavailable/);
});

test("failed draft processing never enables a draft replacement", async () => {
  const current = draft("Current work");
  const previous = draft("Previous work");
  const currentSaved = current;
  const backupSaved = previous;

  await assert.rejects(
    hydrateTrailDraft({
      loadCurrent: async () => currentSaved,
      loadBackup: async () => backupSaved,
      prepare: async () => {
        throw new Error("redaction processing failed");
      },
      emptyTrail: () => draft("Empty"),
    }),
    /redaction processing failed/,
  );

  assert.equal(currentSaved.title, "Current work");
  assert.equal(backupSaved.title, "Previous work");
});

test("a failed backup restore is processed before either saved draft can be replaced", async () => {
  const current = draft("Current work");
  const previous = draft("Previous work");
  let currentSaved = current;
  let backupSaved = previous;
  let committed: ContextTrail | null = null;

  await assert.rejects(
    restoreTrailBackup({
      loadBackup: async () => backupSaved,
      current,
      prepare: async () => {
        throw new Error("backup redaction failed");
      },
      saveCurrent: async (trail) => {
        currentSaved = trail;
      },
      saveBackup: async (trail) => {
        backupSaved = trail;
      },
      commit: (trail) => {
        committed = trail;
      },
    }),
    /backup redaction failed/,
  );

  assert.equal(currentSaved.title, "Current work");
  assert.equal(backupSaved.title, "Previous work");
  assert.equal(committed, null);
});
