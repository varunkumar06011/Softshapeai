import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.softshape.captain',
  appName: 'SoftShape Captain',
  webDir: '../../dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
    url: 'https://localhost/captain.html',
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
