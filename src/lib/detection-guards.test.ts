import assert from "node:assert/strict";
import test from "node:test";

import { chooseTapBox, createTapFallbackBox, withTimeout } from "./detection-guards.ts";

test("creates a bounded fallback box centered on a tap near the image edge", () => {
  assert.deepEqual(createTapFallbackBox({ x: 0.98, y: 0.02 }), {
    x: 0.88,
    y: 0,
    w: 0.12,
    h: 0.12,
  });
});

test("rejects an AI box that is far from the tapped point", () => {
  assert.deepEqual(
    chooseTapBox(
      { x: 0.2, y: 0.45, w: 0.3, h: 0.45 },
      { x: 0.72, y: 0.2 },
    ),
    createTapFallbackBox({ x: 0.72, y: 0.2 }),
  );
});

test("keeps a tight AI box that contains the tapped point", () => {
  assert.deepEqual(
    chooseTapBox(
      { x: 0.42, y: 0.38, w: 0.18, h: 0.16 },
      { x: 0.5, y: 0.45 },
    ),
    { x: 0.42, y: 0.38, w: 0.18, h: 0.16 },
  );
});

test("times out an AI request that never settles", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 20),
    /AI request timed out/,
  );
});
