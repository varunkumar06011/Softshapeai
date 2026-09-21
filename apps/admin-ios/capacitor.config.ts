import type { CapacitorConfig } from '@capacitor/cli';

declare const process: { env: Record<string, string | undefined> };

const liveReload = process.env.CAPACITOR_LIVE_RELOAD;

// In production, load from locally bundled web assets (webDir) — the app is
// fully bundled and iOS updates ship via the App Store (no OTA).
// In dev, use CAPACITOR_LIVE_RELOAD env var to point to a local Vite dev server.
const server: CapacitorConfig['server'] | undefined = liveReload
  ? { url: liveReload }
  : undefined;

const config: CapacitorConfig = {
  appId: 'ai.softshape.admin',
  appName: 'SoftShape Admin',
  webDir: '../../dist',
  ios: {
    // Render with a mobile viewport on iPad instead of requesting the
    // desktop version of the site — the admin UI is designed for touch.
    preferredContentMode: 'mobile',
    backgroundColor: '#FFF5F5',
    // External links (support, docs) must open in Safari, not inside the app.
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  ...(server ? { server } : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#FFF5F5',
      showSpinner: false,
    },
    Keyboard: {
      // Shrink the webview when the keyboard opens so login/search inputs
      // are never hidden behind it.
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
