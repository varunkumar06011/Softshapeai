// ─────────────────────────────────────────────────────────────────────────────
// App Update Service — Checks for new native APK releases on GitHub
// ─────────────────────────────────────────────────────────────────────────────
// Used by Capacitor Android apps to detect when a new APK is available and
// prompt the user to download it. JS/HTML updates are handled by otaService.js
// (custom OTA mechanism — downloads web bundle, verifies SHA-256, applies on
// next launch). This service only handles native APK updates.
//
// Flow:
//   1. Read installed native app version via @capacitor/app
//   2. Fetch latest GitHub release tag from the GitHub API
//   3. Compare semver versions
//   4. If newer release exists, return download URL + release notes
//
// The app calling this service must pass its own APK asset name so the correct
// download link is returned.
// ─────────────────────────────────────────────────────────────────────────────

import { App } from '@capacitor/app';

const REPO = 'varunkumar06011/Softshapeai';
const RELEASES_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases/latest`;

/**
 * Parse a version string into a numeric tuple for comparison.
 * Supports "v1.2.3" and "1.2.3" formats.
 */
function parseVersion(version) {
  const clean = String(version || '').replace(/^v/i, '').trim();
  const parts = clean.split('.').map(p => parseInt(p, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Compare two semver version strings.
 * Returns:
 *   > 0 if b > a
 *   < 0 if b < a
 *   0 if equal
 */
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return vb[i] - va[i];
  }
  return 0;
}

/**
 * Detect if the app is running inside a Capacitor WebView.
 */
function isCapacitorApp() {
  return !!(window?.Capacitor?.isNativePlatform?.() || window?.Capacitor?.getPlatform?.());
}

/**
 * Check whether a newer APK release is available.
 *
 * @param {string} apkAssetName - GitHub release asset name for this app's APK,
 *                                e.g. 'captain-android.apk'
 * @returns {Promise<{ updateAvailable: boolean, currentVersion: string|null, latestVersion: string|null, downloadUrl: string|null, releaseUrl: string|null, releaseNotes: string|null }>}
 */
export async function checkForNativeUpdate(apkAssetName) {
  try {
    if (!isCapacitorApp()) {
      return { updateAvailable: false, currentVersion: null, latestVersion: null, downloadUrl: null, releaseUrl: null, releaseNotes: null };
    }

    const appInfo = await App.getInfo();
    const currentVersion = appInfo.version;

    const res = await fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const release = await res.json();
    const latestVersion = release.tag_name;
    const releaseNotes = release.body || null;
    const releaseUrl = release.html_url || RELEASES_PAGE_URL;

    const asset = release.assets?.find(a => a.name === apkAssetName);
    const downloadUrl = asset?.browser_download_url || null;

    const updateAvailable = compareVersions(currentVersion, latestVersion) > 0;

    return {
      updateAvailable,
      currentVersion,
      latestVersion,
      downloadUrl,
      releaseUrl,
      releaseNotes,
    };
  } catch (err) {
    console.warn('[AppUpdateService] Failed to check for native update:', err.message);
    return {
      updateAvailable: false,
      currentVersion: null,
      latestVersion: null,
      downloadUrl: null,
      releaseUrl: null,
      releaseNotes: null,
    };
  }
}

/**
 * Convenience mapping for each SoftShape Android app.
 */
export const ANDROID_APK_ASSETS = {
  captain: 'captain-android.apk',
  cashier: 'cashier-android.apk',
  admin: 'admin-android.apk',
};
