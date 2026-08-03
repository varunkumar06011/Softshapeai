// ─────────────────────────────────────────────────────────────────────────────
// App Update Service — Cross-platform native update detection and installation
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the GitHub-only Android checker.  This service:
//   - Detects runtime (Tauri desktop vs Capacitor Android vs browser)
//   - Reads the current native app version
//   - Calls the backend /api/app-updates endpoint for a normalized manifest
//   - Caches results and enforces a simple state machine
//   - Triggers Tauri installer downloads for Cashier Desktop
//   - Opens the Android package installer / browser for Captain Android APKs
//
// JS/HTML OTA updates are still handled by otaService.js — this service only
// deals with native app updates.
// ─────────────────────────────────────────────────────────────────────────────

import { App } from '@capacitor/app';
import { apiUrl } from './apiConfig';
import { parseSemver } from '../utils/versionCompare';

const APP_CONFIG = {
  cashier: { app: 'cashier', platform: 'windows', label: 'Cashier', packageId: null },
  captain: { app: 'captain', platform: 'android', label: 'Captain', packageId: 'ai.softshape.captain' },
  admin:   { app: 'admin',   platform: 'android', label: 'Admin',   packageId: 'ai.softshape.admin' },
};

export function isTauri() {
  return typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

export function isCapacitor() {
  return typeof window !== 'undefined' && !!(window?.Capacitor?.isNativePlatform?.());
}

function getTauriInvoke() {
  if (typeof window === 'undefined') return null;
  return (
    window.__TAURI__?.core?.invoke ||
    window.__TAURI__?.invoke ||
    window.__TAURI_INTERNALS__?.invoke ||
    null
  );
}

function detectAppKey() {
  const path = window?.location?.pathname || '/';
  if (path.startsWith('/captain')) return 'captain';
  if (path.startsWith('/cashier')) return 'cashier';
  if (path.startsWith('/admin')) return 'admin';
  // Fallback: Tauri identifier / Capacitor appId would be more reliable here.
  return isTauri() ? 'cashier' : 'captain';
}

function getAppConfig(appKey) {
  return APP_CONFIG[appKey] || null;
}

function metaKey(app, platform) {
  return `ss_update_meta_${app}_${platform}`;
}

function readCache(app, platform) {
  try {
    const raw = localStorage.getItem(metaKey(app, platform));
    if (!raw) return null;
    const meta = JSON.parse(raw);
    const ttl = 1000 * 60 * 5; // 5 minute automatic check cooldown
    if (Date.now() - meta.timestamp > ttl) return null;
    return meta;
  } catch {
    return null;
  }
}

function writeCache(app, platform, result) {
  try {
    localStorage.setItem(
      metaKey(app, platform),
      JSON.stringify({ ...result, timestamp: Date.now() })
    );
  } catch {
    // Ignore storage errors
  }
}

export function invalidateUpdateCache() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('ss_update_')) localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}

export async function getCurrentVersion() {
  if (isTauri()) {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        return await invoke('get_app_version');
      } catch (err) {
        console.warn('[AppUpdateService] get_app_version failed:', err?.message);
      }
    }
  }

  if (isCapacitor()) {
    try {
      const info = await App.getInfo();
      return info.version;
    } catch (err) {
      console.warn('[AppUpdateService] App.getInfo failed:', err?.message);
    }
  }

  return null;
}

const inFlightChecks = new Map();

/**
 * Check for a native app update using the backend manifest endpoint.
 *
 * @param {string} [appKey] - 'cashier', 'captain', or 'admin'
 * @param {boolean} [force] - Bypass the automatic check cooldown once
 * @returns {Promise<{ state: string, manifest: object|null, error: string|null }>}
 */
export async function checkForUpdate(appKey, force = false) {
  appKey = appKey || detectAppKey();
  const cfg = getAppConfig(appKey);
  if (!cfg) {
    return { state: 'failed', manifest: null, error: `Unknown app: ${appKey}` };
  }

  // Reuse in-flight check to prevent duplicate concurrent requests.
  const flightKey = `${cfg.app}_${cfg.platform}`;
  const existing = inFlightChecks.get(flightKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      const cached = force ? null : readCache(cfg.app, cfg.platform);
      if (cached) {
        return { state: cached.updateAvailable ? (cached.mandatory ? 'available_mandatory' : 'available_optional') : 'up_to_date', manifest: cached, error: null };
      }

      const currentVersion = await getCurrentVersion();
      if (!currentVersion) {
        return { state: 'failed', manifest: null, error: 'Could not determine installed version' };
      }

      if (!parseSemver(currentVersion)) {
        return { state: 'failed', manifest: null, error: `Invalid installed version: ${currentVersion}` };
      }

      const url = apiUrl(`/api/app-updates/${cfg.app}/${cfg.platform}/${encodeURIComponent(currentVersion)}`);
      const res = await fetch(url, { method: 'GET' });

      if (res.status === 503) {
        return { state: 'unavailable', manifest: null, error: 'Update server is temporarily unavailable' };
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text}`);
      }

      const manifest = await res.json();
      const result = {
        state: manifest.updateAvailable ? (manifest.mandatory ? 'available_mandatory' : 'available_optional') : 'up_to_date',
        manifest,
        error: null,
      };

      writeCache(cfg.app, cfg.platform, manifest);
      return result;
    } catch (err) {
      console.warn('[AppUpdateService] Update check failed:', err?.message);
      return { state: 'failed', manifest: null, error: err?.message || 'Network error' };
    } finally {
      inFlightChecks.delete(flightKey);
    }
  })();

  inFlightChecks.set(flightKey, promise);
  return promise;
}

export function getAppLabel(appKey) {
  return APP_CONFIG[appKey]?.label || 'SoftShape';
}

export function getAppPlatformLabel(appKey) {
  return APP_CONFIG[appKey]?.platform === 'windows' ? 'Windows' : 'Android';
}

const inFlightInstalls = new Map();

/**
 * Trigger the platform-native installer for the validated update manifest.
 * For Tauri this invokes the Rust `install_update` command.
 * For Android this opens the APK download URL in the browser (installer UI).
 *
 * @param {object} manifest - Normalized manifest from checkForUpdate
 * @returns {Promise<{ state: string, error: string|null }>}
 */
export async function installUpdate(manifest) {
  if (!manifest?.updateAvailable || !manifest.downloadUrl) {
    return { state: 'failed', error: 'No update to install' };
  }

  // Only one installation per app/platform at a time.
  const installKey = `${manifest.app}_${manifest.platform}`;
  const existingInstall = inFlightInstalls.get(installKey);
  if (existingInstall) return existingInstall;

  const installPromise = (async () => {
    try {
      if (manifest.app === 'cashier' && isTauri()) {
        const invoke = getTauriInvoke();
        if (!invoke) throw new Error('Tauri bridge not available');
        await invoke('install_update', { latest_version: manifest.latestVersion });
        invalidateUpdateCache();
        return { state: 'restart_required', error: null };
      }

      if (manifest.platform === 'android') {
        const expectedAppKey = Object.keys(APP_CONFIG).find(
          (k) => APP_CONFIG[k].app === manifest.app && APP_CONFIG[k].platform === 'android'
        );
        const expectedPackageId = expectedAppKey ? APP_CONFIG[expectedAppKey].packageId : null;
        if (expectedPackageId && manifest.packageId && manifest.packageId !== expectedPackageId) {
          throw new Error(`APK package ID does not match this app: expected ${expectedPackageId}, got ${manifest.packageId}`);
        }

        window.open(manifest.downloadUrl, '_blank');
        invalidateUpdateCache();
        return { state: 'installing', error: null };
      }

      throw new Error('No installer available for this platform');
    } catch (err) {
      console.warn('[AppUpdateService] Install failed:', err?.message);
      return { state: 'failed', error: err?.message || 'Installation failed' };
    } finally {
      inFlightInstalls.delete(installKey);
    }
  })();

  inFlightInstalls.set(installKey, installPromise);
  return installPromise;
}

/**
 * Legacy convenience mapping for any code still expecting it.
 * Not used for the new backend-driven flow.
 */
export const ANDROID_APK_ASSETS = {
  captain: 'captain-android.apk',
  cashier: 'cashier-android.apk',
  admin: 'admin-android.apk',
};
