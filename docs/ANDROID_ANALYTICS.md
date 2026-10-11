# Optional Android Firebase Analytics

Firebase Analytics is prepared but no Firebase project or app configuration is included. Without a valid `google-services.json`, the native bridge reports itself unconfigured and collection stays disabled. Even with configuration, collection remains off unless the user opts in under Settings.

## Routing, consent, and event schema

- Android routes only to the native Firebase Analytics SDK. The web app routes only to the existing PostHog integration; other platforms are inert. Android events are never also sent to PostHog.
- Android collection defaults to disabled in the manifest. The merged manifest removes `FirebaseInitProvider`, so Firebase does not initialize from a content provider before consent is read. Native startup checks the exact persisted Firebase consent and an explicit revocation-marker record before manually initializing Firebase; a missing marker, missing/corrupt consent, a revocation marker, or storage-read errors leave Firebase uninitialized and fail closed. The app does not assert that network leakage occurred under the prior ordering; provider removal and the grant gate prevent that automatic initialization path.
- Firebase-specific grants from earlier test builds without the revocation-marker record fail closed after upgrade and require a new opt-in. Existing PostHog grants still do not authorize Google.
- Revocation immediately blocks new JavaScript-originated Firebase events, then disables collection and applies denied Analytics Storage consent. The native choice is recorded in two separate preference files; either durable denial record blocks Firebase initialization at the next launch. The UI reports when native disable could not be confirmed or when session-only disable succeeded but neither durable write did, and offers retry. If both independent preference writes fail, durable revocation cannot be guaranteed; the error remains visible, and on a restart a surviving old app grant without a revocation marker cannot be distinguished from consent. Ad Storage, Ad User Data, and Ad Personalization are always denied. Advertising-ID collection and screen reporting are disabled, and the merged manifest removes `AD_ID`.
- The existing v1 choice authorized PostHog only. Existing grants are not carried over to Google; Android asks for a fresh choice. Existing denials remain denials. No pre-consent events are replayed, and the app does not send an install event when the user later opts in.
- Only `app_opened` (a later app start when Firebase consent was already persisted at startup), `tag_created` (`method`: `tap`, `box`, or `redact`), and `report_exported` (`method`, bounded `tag_count`, `timestamp_included`) are explicitly sent to Firebase. `timestamp_included` is encoded as the Firebase-supported integer `0L` or `1L` in the native event bundle. Other existing events and all exception capture are omitted on Android. Invalid names, values, and extra properties are rejected by both TypeScript and native allowlists.
- Firebase Analytics can collect its standard lifecycle/engagement events while enabled, including `first_open`, `session_start`, and `user_engagement`. `first_open` is an SDK-defined app event, not a count of Google Play downloads or a reliable install count. Report only consenting users' explicitly logged events as opt-in activity; do not infer downloads or backfill use before consent.
- Firebase may receive a Firebase app-instance identifier and app/device/OS and network metadata (including IP address). These data are pseudonymous, not anonymous. The SDK does not receive account IDs, email addresses, photos, image content, audio, transcripts, notes, report text, filenames, paths, URLs, user-entered labels, or raw errors from this event schema. Confirm the final SDK disclosures before release.

The small native Capacitor bridge is intentional: it reads persisted Firebase-specific consent and applies collection controls before the WebView starts, then validates every event again before logging. A JavaScript-only or web-tag implementation cannot provide that startup guarantee.

## Manual Firebase setup (not performed for this change)

1. Create or select a **non-production test Firebase project** using the authorized project owner; no project or account is created by this change.
2. Register the release Android app with package name `com.soupytag.app`. For local debug builds, also register `com.soupytag.app.testerpreview` (the debug application ID suffix in `android/app/build.gradle`).
3. Download the project's Android `google-services.json` containing the relevant registered clients and put it at `android/app/google-services.json` locally. That path is git-ignored. Do not commit it, API keys, or any other Firebase project configuration. The existing Gradle script applies Google Services only when this file is present.
4. Build and install a debug/test APK. Do not enable analytics for production or submit/release this build as part of this work. Configuration only makes Firebase available; collection still requires fresh user consent.

## Test-build verification

1. On a clean install, confirm Firebase DebugView has no app analytics before the Settings switch is enabled and remains empty after denying consent.
2. Enable consent, restart the app, and confirm `app_opened`; create a test tag and complete an export to confirm only the fixed events and allowed properties appear. Confirm no filenames, labels, text, photos, URLs, or identifiers from another provider appear.
3. Revoke consent while online, then perform further actions and restart. Confirm subsequent events stop. Re-consent and confirm only activity after the new choice is logged; earlier actions are not replayed.
4. Inspect the merged debug manifest (`:app:processDebugMainManifest`) and the packaged APK to confirm `FirebaseInitProvider` and `com.google.android.gms.permission.AD_ID` are absent, collection and automatic screen reporting are disabled by default, and no unexpected permissions were added. Review Firebase DebugView's automatic events and the current Firebase SDK data disclosures.
5. Record the tested Firebase SDK versions, app version, build variant, consent transitions, and manifest result before making a release decision.

The native instrumentation regression test creates a test-only Firebase app with collection enabled, deletes/corrupts the app's Firebase-specific consent while leaving the SDK preference behind, and verifies startup does not initialize Firebase. It also checks the merged application package for `FirebaseInitProvider`. This test is not evidence of real-device network behavior unless it is run on an Android test device with the Android build dependencies available.

## Privacy notice and Play Data Safety review

The in-app privacy notice and Settings copy are proposed review text, not a substitute for legal review or a live policy update. They now identify Firebase on Android and PostHog on web, note pseudonymous identifiers and possible SDK/device/network metadata, list the explicitly sent event schema, and explain the provider-specific consent refresh. Keep this disclosure accurate if SDK versions or settings change.

Before any release, the owner must confirm Firebase's current Android SDK data disclosures and the merged manifest, then review the Play Data Safety answers. Likely declarations to assess include app interactions (custom events and lifecycle/engagement events) and device or other IDs (Firebase app-instance ID); also verify whether app info/performance, diagnostics, approximate location inference, or other data categories apply to the exact SDK/version. Confirm purpose, collection, sharing with Google, encryption in transit, deletion options, and whether any data is linked to a person. Do not describe analytics as anonymous or “no data.” No Play Console declarations or live policy are changed here.

## Rollback

For a test build, revoke analytics in Settings and remove the local ignored `android/app/google-services.json`; a build without Firebase configuration fails closed. To remove the feature from a future code build, remove the Firebase SDK dependency, native bridge/startup integration, manifest metadata and Firebase consent UI/copy, then build and verify that the merged manifest and APK no longer include Firebase Analytics. Disabling collection cannot retract events already transmitted to Google.
