import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizedBox,
  validateTrail,
  parseTrail,
  trailHtml,
  canPreviewTrail,
  MAX_TRAIL_LEVELS,
  type ContextTrail,
} from "./context-trail.ts";
const fixture = (): ContextTrail => ({
  version: 1,
  title: "Pump inspection",
  levels: [
    {
      id: "wide",
      title: "Where",
      note: "South shed",
      image: "data:image/jpeg;base64,/9j/",
      width: 1200,
      height: 800,
      hotspot: { x: 0.2, y: 0.3, w: 0.2, h: 0.4 },
    },
    {
      id: "close",
      title: "Exact problem",
      note: "Cracked coupling",
      image: "data:image/png;base64,AAAA",
      width: 800,
      height: 1200,
      videoTime: 12.4,
    },
  ],
});
test("normalizes reverse drags and clamps to the actual image", () => {
  assert.deepEqual(normalizedBox({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.3 }), {
    x: 0.2,
    y: 0.3,
    w: 0.6000000000000001,
    h: 0.6000000000000001,
  });
  assert.deepEqual(normalizedBox({ x: -1, y: -2 }, { x: 5, y: 6 }), { x: 0, y: 0, w: 1, h: 1 });
});
test("requires a linked sequence before viewing or sharing", () => {
  const t = fixture();
  assert.equal(canPreviewTrail(t), true);
  delete t.levels[0].hotspot;
  assert.equal(canPreviewTrail(t), false);
  assert.throws(() => trailHtml(t), /box each link/);
});
test("reopens both a draft and its standalone viewer without losing frames or highlights", () => {
  const t = fixture();
  assert.deepEqual(parseTrail(JSON.stringify(t)), t);
  assert.deepEqual(parseTrail(trailHtml(t)), t);
});
test("hostile titles and notes stay in inert data and are rendered as text", () => {
  const t = fixture();
  t.title = "</script><img src=x onerror=alert(1)>";
  t.levels[0].note = '<script>alert("oops")</script>';
  const html = trailHtml(t);
  assert.ok(!html.includes(t.title));
  assert.ok(!html.includes(t.levels[0].note));
  assert.ok(html.includes("textContent=l.note"));
  assert.deepEqual(parseTrail(html), t);
});
test("rejects remote images, duplicate ids, invalid coordinates and oversized sequences", () => {
  for (const mutate of [
    (t: ContextTrail) => {
      t.levels[0].image = "https://example.com/photo.jpg";
    },
    (t: ContextTrail) => {
      t.levels[1].id = "wide";
    },
    (t: ContextTrail) => {
      t.levels[0].hotspot!.w = NaN;
    },
    (t: ContextTrail) => {
      t.levels[0].hotspot!.x = 0.95;
    },
    (t: ContextTrail) => {
      t.levels[1].videoTime = -1;
    },
    (t: ContextTrail) => {
      t.levels = Array(MAX_TRAIL_LEVELS + 1).fill(t.levels[0]);
    },
  ]) {
    const t = fixture();
    mutate(t);
    assert.throws(() => validateTrail(t));
  }
});
test("drafts can contain unlinked levels; viewer exports are offline and have no remote dependencies", () => {
  const t = fixture();
  assert.deepEqual(validateTrail({ ...t, levels: [] }), { ...t, levels: [] });
  const html = trailHtml(t);
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(!html.includes('src="https://'));
});
