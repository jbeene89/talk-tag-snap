# Android production receipt: 1.5.1 / code 10

Soupy Talk&Tag version 1.5.1, version code 10, was submitted to Google Play
production on 2026-10-11 at 07:39 UTC. At 08:14 UTC, Play Console confirmed
**Available on Google Play — Full rollout**, covering the existing 172
countries/regions. This records release availability, not downloads or usage.

## Published artifact

| Field | Verified value |
| --- | --- |
| Package | `com.soupytag.app` |
| Version | `1.5.1` / `10` |
| Minimum / target SDK | `24` / `36` |
| AAB size | `10,852,371` bytes |
| AAB SHA-256 | `8EC109E52EEB98418263A5B46EC26F7B282024BDCD11AEDA61065D14E0E8196A` |
| Upload certificate SHA-256 | `1F005203B034F4DB5342960F5BF73525122F8DB8F3AFBB4B3647D1C52937FC3C` |
| Release name | `1.5.1 (10) - Offline trails and PDF reports` |

[Verified Play release](https://play.google.com/console/u/0/developers/4955597931776827505/app/4974432986815294998/tracks/4698167860179164911/releases/6/details)

Release notes: “Save and reopen Context Trails offline. Create and share PDF
reports.” The existing upload key signed the bundle locally; signature and
public certificate checks passed. The bundle is not debuggable, contains local
web assets and both PDF font assets, and has no Capacitor `server.url` or signing
files. Feedback remains enabled. No source change or new deployment is implied
by this receipt.

## Exact source provenance

- Approved PR #16 head: `4f4d0426b51fef2de561e093f51eb02e3fc34306`.
- Approved PR #18 head: `1ac018e57fb39e0f18f3abec2a057993cc9b688a`.
- Approved integration **tree**, not a commit:
  `7e9a4194562fba84d13940d7cb714ffc649394ea`.
- Integration resolution: the union of both `package.json` test lists.
- Packaging change from that tree: `android/app/build.gradle` version code
  `9` to `10`. Generated Capacitor dependency paths were local build output.
- Reconciliation base: `869b624191223c93fb3debfc14cede06061f7931`, including
  merged diagnostic PR #23.

The reconciliation restores 46 changed application, consent, dependency, test,
license and documentation paths verbatim from the approved integration tree.
The version-code edit and this receipt are its only additional changed paths.
The PR #23 verification workflow, four signing-verification scripts and
`docs/RELEASING.md` remain byte-identical to the reconciliation base. Later PR
#16/#21 revisions and redundant PR #19 are not merged. Environment files, local
dependency paths, signing properties, credentials, private artifacts and test
photos are not included.

## Fresh reconciliation validation

Checks run on the reconciled source on 2026-10-11:

- `npm test`: 77 passed, 0 failed.
- `tsc --noEmit`: passed.
- ESLint on changed TypeScript/TSX: 0 errors, 9 warnings.
- `npm run sync:android`: offline web build and Android sync passed.
- Offline Gradle `testDebugUnitTest`: 7 native JVM tests passed.
- `compileDebugAndroidTestJavaWithJavac`: document/consent instrumentation
  tests compiled; they were not executed on an Android device.
- Exact `DocumentRequestGateTest` on the host JVM: 4 tests passed.
- `processReleaseMainManifest`: passed; package/version/SDKs match the table.
  Firebase initialization provider and advertising permissions are absent;
  collection, automatic screen reporting and advertising-ID collection default
  to disabled.

The rebuilt runtime is compared against the signed AAB and preserved candidate,
not just against source filenames. All packaged JavaScript, CSS, fonts, images
and Capacitor configuration bytes match. The only raw HTML difference is the
generated TanStack root-match serialization timestamp; normalizing only that
value produces identical HTML. This is runtime-content parity, not a claim that
the entire AAB was reproduced byte-for-byte.

No final-device Save/Open/recovery acceptance was performed during this
reconciliation. Earlier phone PDF happy-path evidence covered a prior preview,
not final native lifecycle recovery. Production approval does not establish
those device checks. Code 10 is already used in production; any subsequent
upload must use a higher version code.
