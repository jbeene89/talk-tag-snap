import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || 'https://soupytag.company';

const config: CapacitorConfig = {
  appId: 'com.soupytag.app',
  appName: 'SoupyTag',
  webDir: 'dist',
  server: {
    // Loads your live published web app inside the native shell.
    // This means updates you publish on Lovable instantly appear in the Android app —
    // no need to rebuild and re-upload to Play Store for content/UI changes.
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
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
