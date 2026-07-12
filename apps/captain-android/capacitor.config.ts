import type { CapacitorConfig } from '@capacitor/cli';

declare const process: { env: Record<string, string | undefined> };

const liveReload = process.env.CAPACITOR_LIVE_RELOAD;

// In production, load from locally bundled web assets (webDir) for offline-first support.
// JS bundle updates are handled by otaService.js (custom OTA mechanism).
// In dev, use CAPACITOR_LIVE_RELOAD env var to point to a local Vite dev server.
const server: CapacitorConfig['server'] | undefined = liveReload
  ? { url: liveReload, androidScheme: 'https' }
  : undefined;

const android: CapacitorConfig['android'] = liveReload
  ? { allowMixedContent: true }
  : {};

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
