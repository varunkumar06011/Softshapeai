// ─────────────────────────────────────────────────────────────────────────────
// Capacitor Config — Android app configuration for SoftShape Cashier POS
// ─────────────────────────────────────────────────────────────────────────────
// Configures the Capacitor native wrapper for Android:
//   - appId: ai.softshape.cashier (Android package name)
//   - appName: "SoftShape Cashier" (display name)
//   - webDir: dist (built web assets directory)
//   - androidScheme: https (for secure context APIs)
//   - allowMixedContent: true (for HTTP backend in dev)
//   - SplashScreen: 1s launch duration, no spinner
// ─────────────────────────────────────────────────────────────────────────────

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.softshape.cashier',
  appName: 'SoftShape Cashier',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#FFF5F5',
      showSpinner: false,
    },
  },
};

export default config;
