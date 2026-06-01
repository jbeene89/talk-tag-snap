# SoupyTag

Snap a photo, tap or describe what's in it, and SoupyTag draws a labeled box around it. Built for field techs, inspectors, and anyone who needs to quickly annotate "this thing, right here" on a photo and share it.

## What it does

- **Capture** a photo with your phone camera (or pick one from your library).
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

## Privacy

- Photos are sent to Google's Gemini API **only** when you trigger an AI action (scan, tap, draw, voice).
- Photos are **not** stored on any server — they're processed in-memory and discarded.
- No accounts, no tracking, no analytics on photo content.
- Full policy: `/privacy` route in the app.

## AI costs (for operators)

Each AI tag costs the operator roughly **$0.003** (less than half a cent). See the project plan and chat notes for the pricing/paywall strategy.

## Running locally

```bash
bun install
bun run dev
```

App runs at `http://localhost:8080`. Lovable Cloud must be enabled for AI features to work.

## Building the Android app

```bash
bun run build
bunx cap sync android
bunx cap open android
```

Then build & sign in Android Studio.

## License

Proprietary. All rights reserved.
