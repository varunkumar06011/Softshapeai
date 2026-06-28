// ─────────────────────────────────────────────────────────────────────────────
// useAppUpdate — Hook for checking Android APK updates from GitHub Releases
// ─────────────────────────────────────────────────────────────────────────────
// Polls the GitHub Releases API for the latest APK version and compares it
// with the currently installed app version. If a newer version is found,
// exposes the download URL so the UI can prompt the user to update.
//
// APK mapping: Each Android app package ID maps to a specific APK filename
// in the GitHub release assets (admin-android.apk, cashier-android.apk, etc.)
//
// Returns: { updateAvailable, latestVersion, downloadUrl, appName, checkNow }
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

// GitHub repo hosting the releases
const REPO = 'varunkumar06011/Softshapeai';

// Maps Android package IDs to APK filenames in GitHub release assets
const APK_MAP = {
  'ai.softshape.admin': 'admin-android.apk',
  'ai.softshape.cashier': 'cashier-android.apk',
  'ai.softshape.captain': 'captain-android.apk',
};

// Human-readable app names for update prompt UI
const APP_NAME_MAP = {
  'ai.softshape.admin': 'SoftShape Admin',
  'ai.softshape.cashier': 'SoftShape Cashier',
  'ai.softshape.captain': 'SoftShape Captain',
};

function isCapacitor() {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
}

function normalizeVersion(v) {
  return String(v).replace(/^v/, '').trim();
}

function compareVersion(a, b) {
  const partsA = normalizeVersion(a).split('.').map(Number);
  const partsB = normalizeVersion(b).split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const pa = partsA[i] || 0;
    const pb = partsB[i] || 0;
    if (pa > pb) return 1;
    if (pa < pb) return -1;
  }
  return 0;
}

export function useAppUpdate() {
  const [state, setState] = useState({
    checking: false,
    hasUpdate: false,
    currentVersion: null,
    latestVersion: null,
    downloadUrl: null,
    appName: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!isCapacitor()) return;

      setState((s) => ({ ...s, checking: true }));

      try {
        const { App } = await import('@capacitor/app');
        const appInfo = await App.getInfo();
        const appId = appInfo.id;
        const currentVersion = appInfo.version || '0.0.0';
        const appName = APP_NAME_MAP[appId] || appInfo.name || 'SoftShape App';
        const apkFile = APK_MAP[appId];

        if (!apkFile) {
          setState((s) => ({ ...s, checking: false, appName }));
          return;
        }

        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
        if (!res.ok) throw new Error('Failed to check for updates');
        const data = await res.json();
        const latestVersion = data.tag_name || 'v0.0.0';
        const hasUpdate = compareVersion(latestVersion, currentVersion) > 0;
        const downloadUrl = `https://github.com/${REPO}/releases/download/${latestVersion}/${apkFile}`;

        if (!cancelled) {
          setState({
            checking: false,
            hasUpdate,
            currentVersion,
            latestVersion,
            downloadUrl,
            appName,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ ...s, checking: false, error: err.message }));
        }
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  return state;
}
