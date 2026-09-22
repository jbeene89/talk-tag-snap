# SoupyTag: September 2026 store refresh

Package: `com.soupytag.app`. Candidate: `1.4.1`, version code `7`.

## Included assets
Six 1080 x 1920 RGB PNG store images, six unchanged Android captures under `raw/`, one 1024 x 500 feature graphic, a contact sheet, and alt text and hashes in `screenshots.json`. Rebuild the layouts using the included Pillow script and an installed system font. No font files are distributed.

## Product value
SoupyTag makes a field handoff clearer: mark the exact problem in a photo, explain it, choose severity, and add a report title or reference. The screenshots show a practice valve inspection, not a real customer report. They demonstrate manual markup, not automatic AI defect recognition.

## Improvements in this candidate
- A bundled sample inspection so people can learn without providing a photo.
- Responsive toolbar and photo sizing, including dark native system bars.
- Image decoding errors and size checks, visible loading status, and preservation of the current session when another image fails to open.
- Guards against stale or cancelled image imports; restored session timestamps.
- Accurate clipboard error handling and removal of stale launch/AI marketing copy.
- A corrected mobile build configuration and regenerated npm lockfile.

## Validation
All 25 Node tests passed. TypeScript checking passed. The mobile web bundle, Android debug APK and unsigned release AAB built locally using JDK21. An Android 36.1 emulator was used to verify a corrupt-image error, sample loading, report details, markup/severity editing and guide replay. Final screenshots were visually reviewed. No physical-device or purchase-flow validation is claimed.

## Release boundaries
These assets are prepared for review alongside the new candidate; they are not evidence of Play submission or approval. Confirm current version-code availability, correct release signing, Play declarations and physical-device behavior before publishing. Do not publish new-feature screenshots before the matching binary. Existing purchase controls were not changed.

## Suggested short description
Mark photo defects, add clear notes and share a more useful inspection image.

## Next product experiment
A multi-photo job report is a sensible next experiment, after these core workflows are verified with testers. It is not implemented or shown in this asset set.
