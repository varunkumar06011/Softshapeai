// ─────────────────────────────────────────────────────────────────────────────
// useAppUpdate — Detects new native APK releases for Capacitor Android apps
// ─────────────────────────────────────────────────────────────────────────────
// Compares the installed native app version with the latest GitHub release.
// Returns update metadata for the AppUpdateBanner component.
//
// The app name is detected from the current hostname/path so the correct
// APK asset and label are used for each app.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { checkForNativeUpdate, ANDROID_APK_ASSETS } from '../services/appUpdateService';

const APP_NAMES = {
  captain: 'Captain',
  cashier: 'Cashier',
  admin: 'Admin',
};

function detectAppKey() {
  const path = window.location.pathname;
  if (path.startsWith('/captain')) return 'captain';
  if (path.startsWith('/cashier')) return 'cashier';
  if (path.startsWith('/admin')) return 'admin';
  return 'captain';
}

export function useAppUpdate() {
  const [state, setState] = useState({
    checking: true,
    hasUpdate: false,
    currentVersion: null,
    latestVersion: null,
    downloadUrl: null,
    appName: 'SoftShape',
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const appKey = detectAppKey();
      const apkAssetName = ANDROID_APK_ASSETS[appKey];
      if (!apkAssetName) {
        setState(s => ({ ...s, checking: false }));
        return;
      }

      let currentVersion = null;
      try {
        const info = await App.getInfo();
        currentVersion = info.version;
      } catch {
        setState(s => ({ ...s, checking: false }));
        return;
      }

      const result = await checkForNativeUpdate(apkAssetName);
      if (cancelled) return;

      setState({
        checking: false,
        hasUpdate: result.updateAvailable,
        currentVersion: currentVersion || result.currentVersion,
        latestVersion: result.latestVersion,
        downloadUrl: result.downloadUrl || result.releaseUrl,
        appName: APP_NAMES[appKey] || 'SoftShape',
      });
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return state;
}
