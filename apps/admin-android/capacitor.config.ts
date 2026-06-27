import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.softshape.admin',
  appName: 'SoftShape Admin',
  webDir: '../../dist',
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
