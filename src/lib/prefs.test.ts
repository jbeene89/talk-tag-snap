import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_PREFS, loadPrefs, PREFS_KEY, type Prefs, savePrefs } from "./prefs.ts";

function storageWith(value: string | null) {
  return {
    getItem: (key: string) => (key === PREFS_KEY ? value : null),
    setItem: () => {},
  };
}

test("loadPrefs returns defaults when nothing is stored", () => {
  assert.deepEqual(loadPrefs(storageWith(null)), DEFAULT_PREFS);
});

test("loadPrefs returns defaults when storage is undefined (SSR)", () => {
  assert.deepEqual(loadPrefs(undefined), DEFAULT_PREFS);
});

test("loadPrefs coerces stored values and ignores unknown export formats", () => {
  const stored = JSON.stringify({
    includeTimestamp: true,
    useUTC: true,
    exportFormat: "gif",
    haptics: false,
  });
  assert.deepEqual(loadPrefs(storageWith(stored)), {
    includeTimestamp: true,
    useUTC: true,
    exportFormat: "jpg",
    haptics: false,
  });
});

test("loadPrefs survives corrupt JSON", () => {
  assert.deepEqual(loadPrefs(storageWith("{not json")), DEFAULT_PREFS);
});

test("savePrefs round-trips through loadPrefs", () => {
  let saved: string | null = null;
  const storage = {
    getItem: (key: string) => (key === PREFS_KEY ? saved : null),
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  const prefs: Prefs = {
    includeTimestamp: true,
    useUTC: false,
    exportFormat: "png",
    haptics: true,
  };
  savePrefs(storage, prefs);
  assert.deepEqual(loadPrefs(storage), prefs);
});
