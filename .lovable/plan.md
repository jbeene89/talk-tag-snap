## What we're building

A mobile-first web app for your coworker. Flow:

1. He opens it on his phone, taps a big **Capture** button → phone camera opens.
2. After the photo, he taps **Hold to talk** and says something like *"the Zenly unit on the left, dented"*.
3. App transcribes his speech, then asks an AI vision model: *"find the Zenly unit in this image"*.
4. AI returns a bounding box → app draws a highlight rectangle + his label on the photo.
5. He can add more annotations (repeat step 2), undo, or clear.
6. **Download / Share** button → saves the annotated photo to his phone, or opens the native share sheet so he can send it through Teams himself.

No Teams login required for now — you said annotation first, Teams later.

## Screens

- **Capture screen** — full-bleed camera button, recent shots strip at bottom.
- **Annotate screen** — the photo fills the screen, floating mic button, list of annotations he's added (each tappable to remove), Download/Share button in header.

## How the smart part works

- **Voice → text**: browser's built-in speech recognition (free, works on his phone, no setup).
- **Text + photo → highlighted region**: Lovable AI (Gemini vision model) — we send it the photo plus his transcribed phrase and ask for the bounding box of what he described. This needs Lovable Cloud turned on so the AI key stays secure.
- **Drawing the box**: done in the browser on top of the image, then "flattened" into the saved file so the highlight is baked into the downloaded photo.

## What he gets

A single annotated JPEG saved to his phone's camera roll (or shared straight into Teams via the phone's share sheet). Looks like: original photo + colored rectangle + his label text near the box.

## Honest caveats

- **Auto-detect accuracy**: vision AI is good but not perfect. If it misses, he can re-record the phrase with more detail (*"the gray box mounted on the wall, top right"*). If accuracy turns out shaky in real use, we add a fallback: tap the spot, then talk.
- **Browser speech recognition** works great in Chrome on Android, decent on iOS Safari. If he's on a locked-down work phone we may need to swap in a paid transcription service later.
- **Per-use cost**: each annotation = 1 small AI call. Cheap, but not zero.

## Next step after this ships

When he's happy with the flow, we add a "Post to Teams" button that drops the annotated image directly into a chosen channel (requires connecting his Teams account once).

## Technical notes

- TanStack Start, mobile-first layout, viewport locked to mobile preview.
- Camera via `<input type="file" capture="environment">` (works on iOS + Android, no permissions dance).
- Speech via Web Speech API (`webkitSpeechRecognition`).
- Annotation render: HTML canvas overlay; export via `canvas.toBlob()` → download link / Web Share API.
- Vision call: `createServerFn` → Lovable AI Gateway, model `google/gemini-3-flash-preview`, prompt asks for normalized `[x,y,w,h]` bbox JSON for the described object. Requires enabling Lovable Cloud for the secret.
- State kept in component state; no DB until he wants history.