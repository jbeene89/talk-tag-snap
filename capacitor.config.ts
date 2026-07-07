import type { CapacitorConfig } from '@capacitor/cli';

// The app ships with the web bundle packaged inside the APK (built via
// `bun run build:mobile`), so it opens instantly and works fully offline.
// Set CAPACITOR_SERVER_URL to point the shell at a dev server for live reload.
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.soupytag.app',
  appName: 'SoupyTag',
  webDir: 'dist/client',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        },
      }
    : {}),
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
  },
};

export default config;
