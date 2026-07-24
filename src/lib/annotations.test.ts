import assert from "node:assert/strict";
import test from "node:test";

import {
  type Annotation,
  defectNumbers,
  reportFileBase,
  reportText,
  tagSummary,
} from "./annotations.ts";

const box = { x: 0, y: 0, w: 0.1, h: 0.1 };

function defect(id: string, label: string, severity?: Annotation["severity"]): Annotation {
  return { id, label, box, severity };
}

function redact(id: string): Annotation {
  return { id, label: "", box, kind: "redact" };
}

test("defectNumbers numbers defects in order and skips redactions", () => {
  const list = [defect("a", "crack"), redact("r"), defect("b", "leak")];
  const nums = defectNumbers(list);
  assert.equal(nums.get("a"), 1);
  assert.equal(nums.get("b"), 2);
  assert.equal(nums.has("r"), false);
});

test("reportText numbers only defects and includes severity by default", () => {
  const list = [defect("a", "crack", "major"), redact("r"), defect("b", "leak", "minor")];
  const text = reportText(list);
  assert.equal(text, "1. [MAJOR] crack\n2. [MINOR] leak");
});

test("reportText prepends title, reference, and timestamp when present", () => {
  const text = reportText([defect("a", "crack", "info")], {
    title: "  Roof survey  ",
    reference: "Unit 4B",
    timestamp: "Jul 6, 2026",
  });
  assert.equal(text, "Roof survey\nRef: Unit 4B\nJul 6, 2026\n\n1. [INFO] crack");
});

test("reportText can omit severity tags", () => {
  const text = reportText([defect("a", "crack", "major")], { withSeverity: false });
  assert.equal(text, "1. crack");
});

test("reportText falls back to (no description) for empty labels", () => {
  assert.equal(reportText([defect("a", "  ")]), "1. [MINOR] (no description)");
});

test("reportText with only a header and no defects returns the header", () => {
  assert.equal(reportText([redact("r")], { title: "Site A" }), "Site A");
});

test("reportFileBase slugifies the title and falls back to defect", () => {
  assert.equal(reportFileBase("Roof Survey #4"), "roof-survey-4");
  assert.equal(reportFileBase("   "), "defect");
  assert.equal(reportFileBase(undefined), "defect");
});

test("tagSummary counts defects and notes hidden redactions", () => {
  assert.equal(tagSummary([defect("a", "x")]), "1 tag");
  assert.equal(tagSummary([defect("a", "x"), defect("b", "y")]), "2 tags");
  assert.equal(tagSummary([defect("a", "x"), redact("r")]), "1 tag · 1 hidden");
});
