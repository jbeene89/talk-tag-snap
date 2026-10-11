import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizedBox,
  validateTrail,
  parseTrail,
  trailHtml,
  canPreviewTrail,
  MAX_TRAIL_LEVELS,
  MAX_TRAIL_ANNOTATIONS,
  MAX_TRAIL_BYTES,
  MAX_TRAIL_FILE_BYTES,
  type ContextTrail,
} from "./context-trail.ts";
const fixture = (): ContextTrail => ({
  version: 2,
  title: "Pump inspection",
  report: { title: "North pump inspection", reference: "Unit 4B" },
  levels: [
    {
      id: "wide",
      title: "Where",
      note: "South shed",
      image: "data:image/jpeg;base64,/9j/",
      width: 1200,
      height: 800,
      annotations: [
        {
          id: "mark-1",
          label: "Crack at flange",
          box: { x: 0.4, y: 0.4, w: 0.1, h: 0.08 },
          severity: "major",
          shape: "ellipse",
        },
      ],
      hotspot: { x: 0.2, y: 0.3, w: 0.2, h: 0.4 },
    },
    {
      id: "close",
      title: "Exact problem",
      note: "Cracked coupling",
      image: "data:image/png;base64,AAAA",
      width: 800,
      height: 1200,
      annotations: [],
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
test("round-trips and re-edits three linked annotated photos and report metadata", () => {
  const original = fixture();
  original.levels.push({
    id: "mid",
    title: "Pump housing",
    note: "Observe the bracket and pipe joint.",
    image: "data:image/webp;base64,AAAA",
    width: 640,
    height: 480,
    annotations: [
      {
        id: "box-mark",
        label: "Loose bracket",
        box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
        severity: "info",
        shape: "box",
      },
    ],
    hotspot: { x: 0.5, y: 0.2, w: 0.2, h: 0.3 },
  });
  original.levels[0].annotations.push({
    id: "redacted",
    label: "",
    box: { x: 0.05, y: 0.1, w: 0.12, h: 0.14 },
    kind: "redact",
  });
  original.levels[1].annotations = [
    {
      id: "box-mark",
      label: "Loose bracket",
      box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      severity: "info",
      shape: "box",
    },
  ];
  original.levels[2].annotations = [
    {
      id: "oval-mark",
      label: "Hairline crack",
      box: { x: 0.4, y: 0.4, w: 0.2, h: 0.1 },
      severity: "major",
      shape: "ellipse",
    },
  ];
  const saved = JSON.stringify(validateTrail(original));
  const reopened = parseTrail(saved);
  assert.deepEqual(reopened, validateTrail(original));
  reopened.levels[1].note = "Edited after reopening";
  reopened.levels[2].annotations[0].label = "Edited crack label";
  const savedAgain = parseTrail(JSON.stringify(validateTrail(reopened)));
  assert.equal(savedAgain.report.reference, "Unit 4B");
  assert.equal(savedAgain.levels[0].hotspot?.w, original.levels[0].hotspot?.w);
  assert.equal(savedAgain.levels[1].note, "Edited after reopening");
  assert.equal(savedAgain.levels[2].annotations[0].label, "Edited crack label");
  assert.equal(savedAgain.levels[0].annotations[1].kind, "redact");
});
test("migrates v1 JSON and HTML to v2 without losing supported legacy fields", () => {
  const current = fixture();
  const legacy = {
    version: 1,
    title: current.title,
    levels: current.levels.map(({ annotations: _annotations, ...level }) => level),
  };
  const expected = {
    ...current,
    report: { title: "", reference: "" },
    levels: current.levels.map((level) => ({ ...level, annotations: [] })),
  };
  assert.deepEqual(parseTrail(JSON.stringify(legacy)), expected);
  assert.deepEqual(parseTrail(trailHtml(validateTrail(legacy))), expected);
});
test("hostile titles and notes stay in inert data and are rendered as text", () => {
  const t = fixture();
  t.title = "</script><img src=x onerror=alert(1)>";
  t.levels[0].note = '<script>alert("oops")</script>';
  t.levels[0].annotations[0].label = '<img src=x onerror="alert(2)">';
  const html = trailHtml(t);
  assert.ok(!html.includes(t.title));
  assert.ok(!html.includes(t.levels[0].note));
  assert.ok(!html.includes(t.levels[0].annotations[0].label));
  assert.ok(html.includes("textContent=l.note"));
  assert.ok(html.includes("m.textContent="));
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
      t.levels[0].annotations[0].box.x = 0.95;
    },
    (t: ContextTrail) => {
      t.levels[0].annotations[0].shape = "arrow" as "box";
    },
    (t: ContextTrail) => {
      t.levels[0].annotations[0].box.w = Number.POSITIVE_INFINITY;
    },
    (t: ContextTrail) => {
      t.levels[0].annotations = Array(MAX_TRAIL_ANNOTATIONS + 1).fill(t.levels[0].annotations[0]);
    },
    (t: ContextTrail) => {
      t.levels[0].annotations.push({ ...t.levels[0].annotations[0] });
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
test("rejects an oversized trail before parsing its payload", () => {
  assert.throws(() => parseTrail(" ".repeat(MAX_TRAIL_FILE_BYTES + 1)), /smaller than 12 MB/);
});
test("drafts can contain unlinked levels; viewer exports are offline and have no remote dependencies", () => {
  const t = fixture();
  assert.deepEqual(validateTrail({ ...t, levels: [] }), { ...t, levels: [] });
  const html = trailHtml(t);
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(!html.includes('src="https://'));
});

test("a near-limit trail reopens its own HTML with heavily escaped metadata", () => {
  const t = fixture();
  t.title = "<".repeat(160);
  t.levels = Array.from({ length: MAX_TRAIL_LEVELS }, (_, i) => ({
    ...t.levels[0],
    id: `level-${i}`,
    title: "<".repeat(160),
    note: "&".repeat(2000),
  }));
  const bytes = new TextEncoder().encode(JSON.stringify(t)).byteLength;
  t.levels[0].image += "A".repeat(Math.floor((MAX_TRAIL_BYTES - bytes - 1024) / 4) * 4);
  validateTrail(t);
  const html = trailHtml(t);
  const fileBytes = new TextEncoder().encode(html).byteLength;
  assert.ok(fileBytes > MAX_TRAIL_BYTES + 32_000);
  assert.ok(fileBytes < MAX_TRAIL_FILE_BYTES);
  assert.deepEqual(parseTrail(html), t);
});
