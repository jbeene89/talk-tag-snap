import { test } from "node:test";
import assert from "node:assert/strict";
import { validateImageFile, MAX_IMAGE_BYTES } from "./image-import.ts";
test("accepts normal images and OS file pickers without a MIME type", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", ""]) assert.doesNotThrow(() => validateImageFile({size: 4096, type}));
});
test("rejects empty, oversized and non-image inputs", () => {
  assert.throws(() => validateImageFile({size:0,type:"image/png"}), /empty/);
  assert.throws(() => validateImageFile({size:MAX_IMAGE_BYTES+1,type:"image/jpeg"}), /20 MB/);
  assert.throws(() => validateImageFile({size:1024,type:"application/pdf"}), /image file/);
});
