# SoupyTag credentials map

**This file contains no secrets.** It records *what* credentials exist, *where*
each one is stored, and *how to recover it* if lost. Keep it accurate — it is
the thing that prevents another lost-key incident.

> Rule: a credential that exists in only one place is already lost. Every row
> below should have at least two locations.

## The credentials

| # | Credential | What it's for | Where it lives |
| --- | --- | --- | --- |
| 1 | **Upload keystore** (`soupytag-upload.jks`) | Signs release `.aab` files before upload to Play | Google Drive · GitHub secret `ANDROID_KEYSTORE_BASE64` (base64) |
| 2 | **Keystore password** | Unlocks #1 (store + key password are the same) | Google Password Manager / Bitwarden, entry "SoupyTag upload keystore" · GitHub secrets `ANDROID_KEYSTORE_PASSWORD` + `ANDROID_KEY_PASSWORD` |
| 3 | **Keystore alias** | Names the key inside #1 | Value is `upload` (not secret) · GitHub secret `ANDROID_KEY_ALIAS` |
| 4 | **Play service account JSON** | Lets CI upload to Play automatically | Play Console → Setup → API access · GitHub secret `PLAY_SERVICE_ACCOUNT_JSON` |
| 5 | **Play Console login** | Everything store-side | Google account `j.beene89@…` + 2FA |
| 6 | **RevenueCat API key** | In-app purchase entitlements | RevenueCat dashboard · app source |

GitHub secrets live at:
`https://github.com/jbeene89/talk-tag-snap/settings/secrets/actions`

## Recovery procedures

### Lost the keystore file, but still have the base64
Recover it from the `ANDROID_KEYSTORE_BASE64` value (Drive copy or GitHub secret):

```bash
# macOS / Linux
base64 -d keystore.b64 > soupytag-upload.jks
keytool -list -v -keystore soupytag-upload.jks   # should print: Alias name: upload
```

```powershell
# Windows
[IO.File]::WriteAllBytes("soupytag-upload.jks", [Convert]::FromBase64String((Get-Content keystore.b64 -Raw)))
```

### Lost the keystore password
The keystore is unusable. Treat it as a lost key and do an upload key reset (below).

### Lost the keystore entirely → upload key reset
Only possible because the app uses **Play App Signing** (Google holds the real
app signing key; the upload key is just your ticket to hand them builds).

1. Generate a new key:
   ```bash
   keytool -genkeypair -v -keystore soupytag-upload.jks -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -dname "CN=SoupyTag, O=SoupyTag, C=US"
   ```
2. Export its certificate for Google:
   ```bash
   keytool -export -rfc -keystore soupytag-upload.jks -alias upload -file upload_certificate.pem
   ```
3. Play Console → **Test and release → Setup → App integrity → App signing** →
   **Request upload key reset** → attach `upload_certificate.pem`.
4. Wait for Google to activate it (typically 1–2 business days).
5. **Immediately** store the new key per the table above — Drive *and* GitHub secrets.
6. Update the 4 GitHub secrets so CI keeps working.

> Existing installs are unaffected by an upload key reset. Google re-signs with
> the unchanged app signing key.

## Release checklist

- [ ] Bump `versionCode` (Google rejects duplicates) and `versionName` in
      `android/app/build.gradle`; keep `src/lib/version.ts` in sync
- [ ] Update `distribution/whatsnew/whatsnew-en-US` (max 500 chars)
- [ ] Tag `vX.Y.Z` and push → the `Android release` workflow builds and signs
- [ ] Download the `soupytag-release-aab` artifact, or let CI upload it
- [ ] Airplane-mode smoke test before promoting to production

See [`RELEASING.md`](RELEASING.md) for the full release flow.
