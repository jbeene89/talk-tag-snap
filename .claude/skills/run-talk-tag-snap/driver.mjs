#!/usr/bin/env node
// Driver for SoupyTag (talk-tag-snap) — launches headless Chromium against a
// running instance of the app and drives the real capture → tag → export flow,
// saving screenshots you can inspect.
//
// Usage:
//   node .claude/skills/run-talk-tag-snap/driver.mjs [baseUrl] [command]
//
//   baseUrl   default http://127.0.0.1:4321  (the served dist/client SPA)
//   command   smoke   (default) capture → tap-tag → describe → export; screenshots
//             boot    just load the capture screen and screenshot it
//
// Requires playwright-core (install once: `npm install --no-save playwright-core`)
// and the container's prebuilt Chromium at /opt/pw-browsers/chromium.
//
// Screenshots are written next to this driver as run-<command>-*.png and, for
// the export step, run-export.jpg (the actual image the app produces).

import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || "http://127.0.0.1:4321";
const CMD = process.argv[3] || "smoke";
const SAMPLE = join(HERE, "..", "..", "..", "store-assets", "sample-valve-crack.png");
const out = (name) => join(HERE, name);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

const log = (...a) => console.log(...a);
let failed = false;

try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);

  // Onboarding dialog shows on first run — dismiss it.
  const skip = page.locator("button", { hasText: /^Skip$/i }).first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: out(`run-${CMD}-capture.png`) });
  log("capture screen:", out(`run-${CMD}-capture.png`));

  if (CMD === "boot") {
    log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
    await browser.close();
    process.exit(errors.length ? 1 : 0);
  }

  // --- smoke: full flow ---
  // Upload the sample image via the hidden file input.
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE);
  await page.waitForTimeout(1500);

  // Tap-to-tag: enter Tap mode, click the image, describe, set severity, save.
  const img = page.locator("img").first();
  const box = await img.boundingBox();
  if (!box) throw new Error("image not visible after upload");
  await page.locator("button", { hasText: /^Tap$/ }).click();
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.waitForTimeout(600);

  const caption = page.locator('input[aria-label="Tag description"]');
  if (!(await caption.isVisible().catch(() => false))) throw new Error("caption sheet did not open");
  await caption.fill("Cracked weld at base");
  await page.locator('button[aria-label="Set severity to Major"]').click();
  await page.locator('button[aria-label="Save description"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: out("run-smoke-tagged.png") });
  log("tagged screen:", out("run-smoke-tagged.png"));

  // Copy-as-text and read it back from the clipboard.
  await page.locator('button[aria-label="Copy list as text"]').click();
  await page.waitForTimeout(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => "(denied)"));
  log("clipboard summary:", JSON.stringify(clip));

  // Export (Download): intercept toBlob to capture the produced image + mime.
  await page.evaluate(() => {
    window.__exportData = null;
    window.__exportMime = null;
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      window.__exportMime = type;
      return orig.call(
        this,
        (blob) => {
          const r = new FileReader();
          r.onload = () => (window.__exportData = r.result);
          r.readAsDataURL(blob);
          cb(blob);
        },
        type,
        q,
      );
    };
  });
  await page.locator('button[aria-label="Download"]').click();
  await page.waitForTimeout(1000);
  const mime = await page.evaluate(() => window.__exportMime);
  const dataUrl = await page.evaluate(() => window.__exportData);
  if (dataUrl) {
    writeFileSync(out("run-export.jpg"), Buffer.from(dataUrl.split(",")[1], "base64"));
    log("exported image:", out("run-export.jpg"), `(${mime})`);
  } else {
    throw new Error("export produced no blob");
  }

  const okClip = /Cracked weld at base/.test(clip);
  if (!okClip) throw new Error(`clipboard did not contain the tag text: ${clip}`);
  log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
  log("SMOKE OK");
} catch (e) {
  failed = true;
  log("SMOKE FAILED:", e.message);
  await page.screenshot({ path: out("run-failure.png") }).catch(() => {});
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
