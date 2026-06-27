import assert from "node:assert/strict";
import test from "node:test";

import { saveImageWithAdapters } from "./export-image.ts";

test("uses the native image saver when it is available", async () => {
  const calls: string[] = [];
  const result = await saveImageWithAdapters(new Blob(["image"]), "tagged.jpg", {
    saveNative: async () => { calls.push("native"); },
    downloadWeb: () => { calls.push("web"); },
  });

  assert.equal(result, true);
  assert.deepEqual(calls, ["native"]);
});

test("falls back to a browser download when native saving fails", async () => {
  const calls: string[] = [];
  const result = await saveImageWithAdapters(new Blob(["image"]), "tagged.jpg", {
    saveNative: async () => {
      calls.push("native");
      throw new Error("plugin unavailable");
    },
    downloadWeb: () => { calls.push("web"); },
  });

  assert.equal(result, true);
  assert.deepEqual(calls, ["native", "web"]);
});
