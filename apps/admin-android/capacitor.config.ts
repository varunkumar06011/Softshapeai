import type { CapacitorConfig } from '@capacitor/cli';

declare const process: { env: Record<string, string | undefined> };

const liveReload = process.env.CAPACITOR_LIVE_RELOAD;

const android: CapacitorConfig['android'] = liveReload
  ? { allowMixedContent: true }
  : {};

const config: CapacitorConfig = {
  appId: 'ai.softshape.admin',
  appName: 'SoftShape Admin',
  webDir: '../../dist',
  android,
  server: {
    androidScheme: 'https',
  },
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
