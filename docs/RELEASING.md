# Releasing SoupyTag to Google Play

There are two ways to ship a build. Once the one-time setup below is done, **the
GitHub Actions way is a single tag push** and everything else is automatic.

- **Automated (recommended):** push a version tag and GitHub builds + signs +
  uploads the app for you — see [Automated releases](#automated-releases).
- **Manual:** build the `.aab` on your own machine and upload it in Play Console
  — see [Manual release](#manual-release-fallback).

---

## Automated releases

The `.github/workflows/android-release.yml` workflow builds a signed Android App
Bundle and uploads it to Google Play. It runs when you **push a tag like
`v1.4.0`**, or on demand from the **Actions** tab ("Android release" → *Run
workflow*, where you can choose the track).

### One-time setup — add 5 repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository
secret.** Add each of these:

| Secret name | What it is |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Your **upload keystore**, base64-encoded (see below) |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore (store) password |
| `ANDROID_KEY_ALIAS` | The key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | The password for that key alias |
| `PLAY_SERVICE_ACCOUNT_JSON` | A Play Console service-account JSON key (see below) |

#### Getting `ANDROID_KEYSTORE_BASE64`

If you already have the keystore you originally signed the app with (a `.jks` or
`.keystore` file), turn it into one line of base64:

```bash
# macOS / Linux
base64 -i your-upload-key.jks | tr -d '\n' > keystore.b64
# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-upload-key.jks")) > keystore.b64
```

Paste the contents of `keystore.b64` as the secret value.

> **Lost the keystore?** If the app uses **Play App Signing** (most apps do), you
> can reset the *upload* key: Play Console → your app → **Setup → App integrity →
> App signing → Request upload key reset**, then generate a new one with
> `keytool -genkey -v -keystore upload-key.jks -alias upload -keyalg RSA -keysize 2048 -validity 9125`
> and register it. This does **not** change the app's real signing key, so
> existing installs keep updating normally.

#### Getting `PLAY_SERVICE_ACCOUNT_JSON`

1. Play Console → **Setup → API access** (or Google Cloud → IAM → Service
   Accounts) → create a service account.
2. Create a **JSON key** for it and download the file.
3. Back in Play Console → **Users and permissions → Invite the service account's
   email**, and grant it at least **Release** access to this app (Admin is
   simplest to start).
4. Paste the entire JSON file contents as the secret value.

### Cutting a release

1. **Bump the version** in `android/app/build.gradle` — increase `versionCode`
   by 1 (Google rejects a duplicate) and set the human-facing `versionName`.
   Keep `src/lib/version.ts`'s `APP_VERSION` in sync.
2. **Update the release notes** in `distribution/whatsnew/whatsnew-en-US`
   (max 500 characters — this is what shows on the Play listing).
3. Commit, then tag and push:
   ```bash
   git tag v1.4.0
   git push origin v1.4.0
   ```
4. Watch the **Actions** tab. On success the build lands on the **internal
   testing** track by default (change the track via *Run workflow* inputs, or
   promote it in Play Console). The signed `.aab` is also attached to the run as
   the `soupytag-release-aab` artifact.

> **First release for a brand-new app:** Google requires the *very first* upload
> for a package to be done by hand in Play Console. After that, the API (and this
> workflow) can take over. SoupyTag already exists in Play, so this doesn't apply
> unless you change the package name.

---

## Manual release (fallback)

On your own machine, with your keystore available:

```bash
git pull
npm install
npm run sync:android      # builds the offline web bundle + copies it into Android
npx cap open android
```

In Android Studio: **Build → Generate Signed Bundle / APK → Android App
Bundle**, sign with your keystore, and upload the resulting `.aab` under
**Play Console → Release → (Internal testing / Production)**. Paste the listing
copy and release notes from [`store-assets/play-listing.md`](../store-assets/play-listing.md).

See the root [`README.md`](../README.md) for the full pre-submission checklist.
