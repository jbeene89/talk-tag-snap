# SoupyTag

Snap a photo (or grab a frame from a video), tap or describe what's in it, and SoupyTag draws a labeled box around it. Built for field techs, inspectors, and anyone who needs to quickly annotate "this thing, right here" and share it.

## What it does

- **Capture** a photo with your phone camera, pick one from your library, or scrub through a video and grab any frame.
- **Tag objects** three ways:
  - **Scan** — AI finds notable objects in the whole photo automatically.
  - **Tap** — point at something, AI identifies it and draws a tight box.
  - **Draw** — drag a box around a region, AI labels what's inside.
  - **Voice/text** — say or type *"the dented unit on the left"* and AI finds it.
- **Edit** labels, remove tags, undo.
- **Export** the annotated photo to your camera roll or share sheet (Teams, email, SMS, etc.).

## Tech

- **Frontend:** TanStack Start (React 19, Vite 7), Tailwind CSS v4, shadcn/ui
- **Mobile shell:** Capacitor (Android + iOS wrap of the web app)
- **AI:** Lovable AI Gateway → Google Gemini 2.5 Flash & Pro for object detection
- **Backend:** Lovable Cloud (server functions only; no DB required for core flow)
- **Voice input:** Web Speech API (browser-native, free)
- **Payments:** RevenueCat → Google Play Billing for the one-time unlock

## Pricing model

- **Free trial:** 5 AI tags per device.
- **Unlock:** $2.99 one-time in-app purchase for unlimited AI tagging.
- Each AI tag costs the operator roughly **$0.003** (less than half a cent), so break-even is around 850 tags per paying user.

## Privacy

- Photos are sent to Google's Gemini API **only** when you trigger an AI action (scan, tap, draw, voice).
- Photos are **not** stored on any server — they're processed in-memory and discarded.
- No accounts, no tracking, no analytics on photo content.
- Full policy: `/privacy` route in the app.

---

## Running locally

```bash
bun install
bun run dev
```

App runs at `http://localhost:8080`. Lovable Cloud must be enabled for AI features to work.

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

```bash
bun install
bun run build
bunx cap sync android
bunx cap open android
```

Android Studio opens. From there:
1. **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**
2. Upload the resulting `.aab` to Play Console under **Release → Internal testing**.
3. Add your own Google account as an internal tester so you can purchase the unlock without being charged real money (Google refunds test purchases automatically).
4. Test the purchase end-to-end, then promote to **Production** when ready.

### Sanity checklist before submitting for review

- [ ] Privacy policy URL works (`/privacy` route)
- [ ] App icon and screenshots uploaded
- [ ] "Restore previous purchase" button visible in the paywall (required by Google)
- [ ] Tested unlock + restore on a real device with an internal-test account
- [ ] Removed any debug logging from production builds

---

## License

Proprietary. All rights reserved.
