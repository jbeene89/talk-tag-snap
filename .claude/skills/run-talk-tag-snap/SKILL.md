---
name: run-talk-tag-snap
description: Build, launch, screenshot, and drive the SoupyTag (talk-tag-snap) photo-defect-tagging app. Use when asked to run, start, launch, smoke-test, or screenshot the app, or to confirm a change works in the real running app (capture → tag → export) rather than just unit tests.
---

# Run SoupyTag (talk-tag-snap)

SoupyTag is a **client-side web app** — TanStack Start (React 19 + Vite), Tailwind,
shadcn/ui — wrapped for Android with Capacitor. The whole capture → tag → describe →
export flow runs in the browser with no backend, which is exactly what ships inside
the Android APK.

You drive it by **building the offline SPA bundle, serving `dist/client` statically,
and pointing the committed driver (`driver.mjs`, headless Chromium via playwright-core)
at it.** The driver performs a real user flow — upload a photo, tap to place a defect
tag, type a description, set severity, copy the text summary, and export the annotated
image — and saves screenshots plus the actual exported image for you to inspect.

All paths below are relative to the repo root (`talk-tag-snap/`).

## Prerequisites

- Node 22 + npm, and the container's prebuilt Chromium at `/opt/pw-browsers/chromium`
  (already present — do **not** run `playwright install`).
- Install app deps and the driver's one extra dependency:

```bash
npm install
npm install --no-save playwright-core
```

## Build (the offline SPA the driver serves)

```bash
npm run build:mobile
```

This runs `MOBILE_BUILD=1 vite build`, which emits a static SPA shell into
`dist/client/` (`index.html` + assets). Do **not** use plain `npm run build` for this —
that produces the Cloudflare/nitro SSR `.output/` layout, not the standalone SPA.

## Run — agent path (drive the real app)

Serve the built bundle, then run the driver against it:

```bash
# serve the offline bundle on IPv4
python3 -m http.server 4321 --bind 127.0.0.1 -d dist/client &
sleep 2

# drive it: capture -> tap-tag -> describe -> severity -> copy -> export
node .claude/skills/run-talk-tag-snap/driver.mjs http://127.0.0.1:4321 smoke
```

On success it prints `SMOKE OK` (exit 0) and writes, next to the driver:

- `run-smoke-capture.png` — the capture/home screen
- `run-smoke-tagged.png` — the photo with the placed defect tag
- `run-export.jpg` — the **actual exported image** the app produced (annotated photo)
- and logs the clipboard summary, e.g. `1. [MAJOR] Cracked weld at base`

**Look at `run-smoke-tagged.png` and `run-export.jpg`** — a blank frame or an error
page means it did not really run. On failure the driver writes `run-failure.png` and
exits 1.

Just want the home screen? `... driver.mjs http://127.0.0.1:4321 boot` loads it and
screenshots `run-boot-capture.png`.

The driver is agent tooling; extend it (more `aria-label` locators for Box/Circle/Hide
markup, redaction, the report-details dialog) as needed — the app's controls all carry
stable `aria-label`s the driver keys off.

## Run — human path

```bash
npm run dev        # SSR dev server on http://localhost:8080
```

Opens the same app with hot reload. Useless headless (it just serves), and some
non-core routes expect Supabase env vars — but the capture/tag/export flow is
client-side and works. For automated driving prefer the built-SPA path above.

## Test (pure-logic unit tests)

```bash
npm test           # node --test over src/lib/*.test.ts — 23 tests
npx tsc --noEmit   # typecheck
npm run lint       # eslint (expect 0 errors; some pre-existing `any` warnings)
```

The report-text/numbering and preferences logic lives in `src/lib/annotations.ts`
and `src/lib/prefs.ts` with tests — direct-invocation coverage for PRs that touch
that logic, no browser needed.

## Gotchas

- **`build:mobile`, not `build`.** The offline SPA only comes out of the
  `MOBILE_BUILD=1` path (`vite.config.ts` turns on `spa` prerender and disables the
  nitro/Cloudflare pipeline). Plain `build` gives you `.output/` (SSR) instead.
- **The prerender step needs IPv4.** `build:mobile` briefly boots a Vite preview
  server to prerender the shell; `vite.config.ts` pins `preview.host` to `127.0.0.1`
  for mobile builds because the container has no IPv6 (a raw build would die with
  `EAFNOSUPPORT ... :::4173`). Serve with `--bind 127.0.0.1` for the same reason.
- **Onboarding dialog blocks the UI on first load** — a 4-step walkthrough. The
  driver clicks **Skip** before doing anything; if you drive manually, dismiss it
  first or the capture buttons aren't reachable.
- **Photo upload is a hidden `<input type="file">`**, not a native picker. Use
  Playwright's `setInputFiles` on `input[type=file]` (the driver does); there's no
  file-chooser dialog to intercept.
- **Export never hits disk in headless.** The annotated image is produced by
  `canvas.toBlob` and handed to the Web Share / save path. To capture it, monkey-patch
  `HTMLCanvasElement.prototype.toBlob` and read the blob as a data URL (the driver does
  this to write `run-export.jpg`).
- **Clipboard read needs granted permissions** — the driver calls
  `ctx.grantPermissions(["clipboard-read","clipboard-write"])`; without it
  `navigator.clipboard.readText()` rejects.
- **A `favicon.ico` 404 is the only console error** when serving via
  `python3 -m http.server` and is harmless — the driver ignores it.

## Troubleshooting

- `Cannot find package 'playwright-core'` → `npm install --no-save playwright-core`.
- `build:mobile` dies with `Failed to start the Vite preview server … EAFNOSUPPORT
  :::4173` → you ran a raw `vite build` without `MOBILE_BUILD=1`; use
  `npm run build:mobile` (which sets it and applies the IPv4 preview host).
- Driver: `image not visible after upload` / `SMOKE FAILED` → confirm
  `store-assets/sample-valve-crack.png` exists (the driver uploads it) and that the
  static server returned 200 for `/`.
- Driver: `caption sheet did not open` → the tap missed the image or onboarding wasn't
  dismissed; check `run-failure.png`.
