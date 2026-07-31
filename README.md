# SoupyTag

Snap a photo (or grab a frame from a video), mark the exact problem, describe it, and share a clean tagged image. Built for field techs, inspectors, and anyone who needs to make "this thing, right here" unmistakable.

## What it does

- **Capture** a photo with your phone camera, pick one from your library, or scrub through a video and grab any frame.
- **Tag problems** three dependable ways:
  - **Tap** — point at the problem and SoupyTag places a movable box immediately.
  - **Box** — drag the exact boundary yourself.
  - **Circle** — switch any tag to an ellipse outline for round features.
- **Describe** each tag with voice, typing, or one-tap quick labels (crack, rust, leak, …) and mark it info, minor, or major.
- **Redact** — drag over faces, license plates, or ID numbers to paint them out before sharing.
- **Report details** — add a title and reference/location that print on the exported image and the copied summary.
- **AI auto-find** is retained as future add-on work but is not enabled in the current UI.
- **Edit** labels, remove tags, undo.
- **Export** the annotated photo (JPG or lossless PNG) to your camera roll or share sheet (Teams, email, SMS, etc.).
- **Works offline** — since 1.3.0 the Android app packages the web bundle inside the APK, so capture, tagging, and export work with no signal.

## Tech

- **Frontend:** TanStack Start (React 19, Vite 7), Tailwind CSS v4, shadcn/ui
- **Mobile shell:** Capacitor (Android + iOS wrap of the web app)
- **Future AI add-on:** Lovable AI Gateway → Google Gemini for optional object detection
- **Backend:** Lovable Cloud (server functions only; no DB required for core flow)
- **Voice input:** Web Speech API (browser-native, free)
- **Payments:** RevenueCat → Google Play Billing for the one-time unlock

## Pricing model

- **Core manual tagging:** available without an AI counter or paywall.
- **Existing purchase:** the $2.99 `unlock_unlimited` product and RevenueCat `unlimited` entitlement remain unchanged and restorable.
- **Future AI add-on:** sales are deferred until auto-find is accurate and dependable enough to charge for.

## Privacy

- The manual capture, tagging, description, save, and share flow does not send photos to an AI service.
- If optional AI returns, photos will be processed only after an explicit AI action and will not be stored by SoupyTag.
- No accounts, no tracking, no analytics on photo content.
- Full policy: `/privacy` route in the app.

---

## Running locally

```bash
bun install
bun run dev
```

App runs at `http://localhost:8080`. The core flow does not require AI services.

---

## Shipping to the Google Play Store

There are **two services you need to set up** before publishing. Follow them in order.

### Step 1 — Google Play Console (the storefront)

1. Sign up at [play.google.com/console](https://play.google.com/console) ($25 one-time fee).
2. Create a new app. Choose a package name like `com.soupytag.app` — write it down, you'll need it.
3. Fill out the store listing (description, screenshots, privacy policy URL — point this at `https://your-domain/privacy`).
4. Go to **Monetize → Products → In-app products** and create a one-time product:
   - **Product ID:** `unlock_unlimited` (exact spelling matters)
   - **Name:** Unlimited AI Tagging
   - **Price:** $2.99 USD
   - **Status:** Active
5. Under **Setup → API access**, create a Service Account and download its JSON key — you'll hand this to RevenueCat in Step 2.

### Step 2 — RevenueCat (the payment processor)

1. Sign up at [revenuecat.com](https://www.revenuecat.com) (free up to $2,500/month revenue).
2. Create a new **Project**, then add a new **App** of type Google Play.
3. Paste your package name from Step 1, then upload the Service Account JSON from Step 1.
4. Go to **Products** and add the product ID `unlock_unlimited` (must match Play Console exactly).
5. Go to **Entitlements**, create one called `unlimited`, and attach the `unlock_unlimited` product to it.
6. Go to **Offerings**, create a default offering containing the `unlock_unlimited` product.
7. Open **Project Settings → API keys** and copy the **Android SDK key** (starts with `goog_`).

### Step 3 — Wire the key into the app

Create a file called `.env` in the project root (next to `package.json`) and add:

```
VITE_REVENUECAT_ANDROID_API_KEY=goog_xxxxxxxxxxxxxxxxxxxxx
```

This is a publishable client key — safe to ship in the app binary, but **don't commit `.env` to git** (already excluded by default).

### Step 4 — Build and ship the Android app

Since 1.3.0 the Android app **bundles the web app inside the APK** (offline-capable, instant startup). `bun run build:mobile` produces an SPA build in `dist/client`, which `cap sync` copies into the native project.

```bash
bun install
bun run sync:android   # = build:mobile + cap sync android
bunx cap open android
```

Android Studio opens. From there:
1. Bump `versionCode` and `versionName` in `android/app/build.gradle` if you haven't already.
2. **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**
3. Upload the resulting `.aab` to Play Console under **Release → Internal testing**.
4. Add your own Google account as an internal tester so you can purchase the unlock without being charged real money (Google refunds test purchases automatically).
5. Test the purchase end-to-end, then promote to **Production** when ready.

> **Note:** because the web app is bundled, app UI changes now require a new `.aab` upload — publishing on Lovable only updates the website, not the installed app. To point a debug build at a dev server instead, set `CAPACITOR_SERVER_URL=http://<your-ip>:8080` before `cap sync`.

### Step 5 — Verified deep links (App Links)

The manifest declares `autoVerify` App Links for `https://soupytag.company`. For them to work, put your **app signing key's** SHA-256 fingerprint (Play Console → Setup → App signing) into `public/.well-known/assetlinks.json` and republish the website. Details in `play-store-listing.md`.

### Sanity checklist before submitting for review

- [ ] Privacy policy URL works (`/privacy` route)
- [ ] App icon and screenshots uploaded
- [ ] Store listing copy matches `store-assets/play-listing.md` (no AI or unshipped-feature claims)
- [ ] "Restore previous purchase" button visible in the paywall (required by Google)
- [ ] Tested unlock + restore on a real device with an internal-test account
- [ ] Airplane-mode test: app opens, tagging and export work offline
- [ ] `assetlinks.json` deployed with the app-signing SHA-256 (deep links verify in Play Console)
- [ ] Removed any debug logging from production builds

---

## License

Proprietary. All rights reserved.
