# Google Play Store Listing — SoupyTag

> The canonical, up-to-date listing copy lives in [`store-assets/play-listing.md`](store-assets/play-listing.md).
> Use that file when filling in the Play Console. This file keeps the Console setup details that
> aren't listing copy: category, deep links, and keywords.

---

## Category

**Primary:** Productivity
**Secondary:** Business

---

## Deep links / Android App Links

**Web domain:** `https://soupytag.company`
**Package name:** `com.soupytag.app`

The Android manifest declares a verified App Links intent filter (`autoVerify`) for
`https://soupytag.company`. For verification to succeed, the signing certificate's SHA-256
fingerprint must be live at `https://soupytag.company/.well-known/assetlinks.json`.

### How to get your SHA-256 fingerprint

1. If you use **Play App Signing** (recommended): Play Console → **Setup → App signing** → copy
   the SHA-256 from the *app signing key certificate* (not the upload key).
2. If you sign locally, run:
   ```bash
   keytool -list -v -keystore your-keystore.jks
   ```
   and copy the **SHA256** value under "Certificate fingerprints".
3. Paste it into `public/.well-known/assetlinks.json` in place of `INSERT_YOUR_SHA256_FINGERPRINT_HERE`.
4. Republish the site so the file is live at `https://soupytag.company/.well-known/assetlinks.json`.
5. In the Google Play Console, go to **Grow → Deep links** and confirm the domain verifies.

### Supported deep link paths

- `https://soupytag.company/` — Opens the app home screen
- `https://soupytag.company/privacy` — Opens the privacy policy

---

## Tags / search keywords (Play Console)

photo markup, image annotation, defect inspection, quality control, field report, voice notes, punch list, snag list, property inspection, technician app, photo notes, markup tool

---

## Contact & support

**Developer website:** https://soupytag.company
**Privacy policy:** https://soupytag.company/privacy
