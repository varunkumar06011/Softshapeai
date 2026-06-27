import type { CapacitorConfig } from '@capacitor/cli';

declare const process: { env: Record<string, string | undefined> };

const liveReload = process.env.CAPACITOR_LIVE_RELOAD;

const server: CapacitorConfig['server'] = liveReload
  ? { url: liveReload, androidScheme: 'https' }
  : { androidScheme: 'https' };

const android: CapacitorConfig['android'] = liveReload
  ? { allowMixedContent: true }
  : {};

const config: CapacitorConfig = {
  appId: 'ai.softshape.captain',
  appName: 'SoftShape Captain',
  webDir: '../../dist',
  android,
  server,
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
