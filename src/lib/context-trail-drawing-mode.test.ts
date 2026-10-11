import { test } from "node:test";
import assert from "node:assert/strict";
import { toggleTrailDrawingMode } from "./context-trail-drawing-mode.ts";

test("switching drawing modes disables the prior mode in both directions", () => {
  assert.equal(toggleTrailDrawingMode("link", "annotation"), "annotation");
  assert.equal(toggleTrailDrawingMode("annotation", "link"), "link");
});

test("selecting the active drawing mode cancels it", () => {
  assert.equal(toggleTrailDrawingMode("link", "link"), null);
  assert.equal(toggleTrailDrawingMode("annotation", "annotation"), null);
});
