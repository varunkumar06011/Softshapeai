import type { CapacitorConfig } from '@capacitor/cli';

declare const process: { env: Record<string, string | undefined> };

const liveReload = process.env.CAPACITOR_LIVE_RELOAD;

// In production, load from locally bundled web assets (webDir) for offline-first support.
// JS bundle updates are handled by otaService.js (custom OTA mechanism).
// In dev, use CAPACITOR_LIVE_RELOAD env var to point to a local Vite dev server.
const server: CapacitorConfig['server'] | undefined = liveReload
  ? { url: liveReload, androidScheme: 'https' }
  : undefined;

// allowMixedContent is required in production too: the captain app loads from
// https://localhost (Capacitor's default androidScheme), but the edge server
// runs on HTTP (http://<cashier-lan-ip>:3101). Without this, the Android WebView
// blocks all edge server requests as mixed content, preventing KOT printing via LAN.
const android: CapacitorConfig['android'] = {
  allowMixedContent: true,
};

const config: CapacitorConfig = {
  appId: 'ai.softshape.captain',
  appName: 'SoftShape Captain',
  webDir: '../../dist',
  android,
  ...(server ? { server } : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#FFF5F5',
      showSpinner: false,
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['phone'],
    },
  },
};

export default config;
