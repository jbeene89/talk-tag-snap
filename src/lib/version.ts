// Keep in sync with android/app/build.gradle versionName when cutting a release.
export const APP_VERSION = "1.4.1";

// Production web origin — the bundled native app uses this for API calls,
// since its WebView origin (https://localhost) can't resolve relative URLs.
export const PROD_ORIGIN = "https://soupytag.company";
