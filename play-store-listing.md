# Google Play Store Listing — SoupyTag

> Copy the sections below into the Google Play Console when setting up or updating your store listing.

---

## App title

**SoupyTag — Tag Defects with Voice & AI**

*(You can also use **Soupy Talk & Tag** if you prefer that as the display name.)*

---

## Short description (max 80 characters)

Snap photos, tap defects, describe with voice. Share tagged reports in seconds — no account needed.

---

## Full description

SoupyTag turns photos into structured inspection reports.

Snap a picture of any item, tap the spot you want to flag, and describe the problem with your voice. The app outlines the defect for you and builds a clean, shareable image with labels and severity markers.

Perfect for field technicians, quality control, property managers, and anyone who needs to document issues quickly and clearly.

**Key features:**
• **Quick Capture** — Take a photo or pick one from your gallery in one tap.
• **Smart Tagging** — Tap anywhere on the photo to drop a pin and label the issue.
• **Voice Descriptions** — Describe defects hands-free; your voice note is saved with the tag.
• **Annotate & Markup** — Draw outlines, add severity levels, and number each issue automatically.
• **One-Tap Share** — Export tagged images via email, messages, or any app on your phone.
• **Offline Mode** — Capture and tag even without a signal; share when you're back online.
• **Wrap Kits** — Browse and manage WrapKit Cloud app bundles from inside SoupyTag.
• **No Account Required** — Jump straight in. No signup, no passwords, no hassle.

Download SoupyTag and turn every photo into a clear, professional report.

---

## Category

**Primary:** Productivity  
**Secondary:** Business

---

## Deep links / Android App Links

**Web domain:** `https://soupytag.company`  
**Package name:** `com.soupytag.app`

To enable verified deep links (Android App Links), upload the following SHA-256 fingerprint into `public/.well-known/assetlinks.json` and deploy it to `https://soupytag.company/.well-known/assetlinks.json`.

### How to get your SHA-256 fingerprint

1. Open Android Studio (or use `keytool` / `gradlew`).
2. For your signing keystore, run:
   ```bash
   keytool -list -v -keystore your-keystore.jks
   ```
3. Copy the **SHA256** value under "Certificate fingerprints".
4. Paste it into `public/.well-known/assetlinks.json` in place of `INSERT_YOUR_SHA256_FINGERPRINT_HERE`.
5. Republish the site so the file is live at `https://soupytag.company/.well-known/assetlinks.json`.
6. In the Google Play Console, go to **Deep links** and verify your domain.

### Supported deep link paths (suggested)

- `https://soupytag.company/` — Opens the app home screen
- `https://soupytag.company/share/{id}` — Opens a specific shared tag/report *(if you add share links later)*

---

## Tags / search keywords (Play Console)

photo tagging, defect inspection, quality control, field report, voice notes, image annotation, markup tool, offline camera, technician app, property inspection, snag list, punch list

---

## Contact & support

**Developer website:** https://soupytag.company  
**Privacy policy:** https://soupytag.company/privacy
