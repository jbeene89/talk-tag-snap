import assert from "node:assert/strict";
import test from "node:test";

import { shareWithAdapters } from "./share-image.ts";

test("treats a dismissed native share sheet as cancelled without using a fallback", async () => {
  let webFallbackCalled = false;

  const outcome = await shareWithAdapters({
    shareNative: async () => {
      throw new Error("Share canceled");
    },
    shareWeb: async () => {
      webFallbackCalled = true;
    },
  });

  assert.equal(outcome, "cancelled");
  assert.equal(webFallbackCalled, false);
});
