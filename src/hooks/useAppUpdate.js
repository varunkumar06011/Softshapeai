// ─────────────────────────────────────────────────────────────────────────────
// useAppUpdate — Detects new native APK releases for Capacitor Android apps
// ─────────────────────────────────────────────────────────────────────────────
// Compares the installed native app version with the latest GitHub release and
// returns update metadata for the AppUpdateBanner. The banner only offers a
// download link — the user decides when to install. Nothing installs itself.
//
// Which APK to offer is decided by the app's own package id (reliable), not by
// the page URL: the banner mounts before routing, so at that moment the admin
// app is still on "/" and a path-based guess would hand it the captain APK.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { checkForNativeUpdate, ANDROID_APK_ASSETS } from '../services/appUpdateService';

const APP_BY_PACKAGE = {
  'ai.softshape.admin': 'admin',
  'ai.softshape.cashier': 'cashier',
  'ai.softshape.captain': 'captain',
};

const APP_NAMES = {
  captain: 'Captain',
  cashier: 'Cashier',
  admin: 'Admin',
};

// Fallback only (unknown package id, e.g. a custom build): guess from the URL.
function detectAppKeyFromPath() {
  const path = window.location.pathname;
  if (path.startsWith('/captain')) return 'captain';
  if (path.startsWith('/cashier')) return 'cashier';
  if (path.startsWith('/admin')) return 'admin';
  return null;
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
      let info;
      try {
        info = await App.getInfo();
      } catch {
        if (!cancelled) setState((s) => ({ ...s, checking: false }));
        return;
      }

      const appKey = APP_BY_PACKAGE[info.id] || detectAppKeyFromPath();
      const apkAssetName = appKey ? ANDROID_APK_ASSETS[appKey] : null;
      if (!apkAssetName) {
        if (!cancelled) setState((s) => ({ ...s, checking: false }));
        return;
      }

      const result = await checkForNativeUpdate(apkAssetName);
      if (cancelled) return;

      setState({
        checking: false,
        hasUpdate: result.updateAvailable,
        currentVersion: info.version || result.currentVersion,
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
