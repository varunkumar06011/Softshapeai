// ─────────────────────────────────────────────────────────────────────────────
// otaService.js — OTA web bundle update service for Capacitor Android apps
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the server.url OTA mechanism. Android apps load from local bundled
// assets and use this service to check for and apply JS bundle updates.
//
// Flow:
//   1. On startup: checkAndApplyOtaOnStartup()
//      - Re-opens the bundle the staff already accepted (so it survives restarts)
//      - Never applies a newer bundle by itself
//      - If the accepted bundle is corrupted, fall back to bundled assets
//   2. In background: checkAndDownloadOta()
//      - Calls GET /api/ota/version for latest bundle metadata
//      - If newer, downloads ZIP into a staging folder (ota/next), verifies SHA-256
//      - The running app is not touched; the update is only "staged"
//   3. Applying: applyStagedOta() — called ONLY when the user clicks "Update now"
//      - Moves the staged bundle into place and reloads into it
//   4. Corruption recovery:
//      - If the OTA bundle fails to load, the app falls back to bundled assets
//      - The corrupted OTA directory is cleaned up automatically
//
// Desktop apps (Tauri) use the Tauri updater for full-app updates — this
// service is a no-op on desktop platforms.
// ─────────────────────────────────────────────────────────────────────────────

import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { unzip } from 'fflate';
import { apiUrl } from './apiConfig';

const OTA_DIR = 'ota';
const OTA_CURRENT_DIR = 'ota/current';
const OTA_NEXT_DIR = 'ota/next';
const OTA_DOWNLOAD_DIR = 'ota/downloads';
const OTA_META_KEY = 'ss_ota_meta';
const OTA_STAGED_META_KEY = 'ss_ota_staged';

// ── Platform detection ───────────────────────────────────────────────────────

// OTA bundle swapping is Android-only: it navigates the webview to a file://
// URI, which WKWebView on iOS cannot load. iOS updates ship via the App Store.
function isCapacitorApp() {
  return window?.Capacitor?.getPlatform?.() === 'android';
}

function isTauriApp() {
  return !!window.__TAURI__;
}

// ── Metadata storage ─────────────────────────────────────────────────────────

function getOtaMeta() {
  try {
    const stored = localStorage.getItem(OTA_META_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function setOtaMeta(meta) {
  try {
    localStorage.setItem(OTA_META_KEY, JSON.stringify(meta));
  } catch { /* ignore */ }
}

function clearOtaMeta() {
  try {
    localStorage.removeItem(OTA_META_KEY);
  } catch { /* ignore */ }
}

// Metadata for a downloaded-but-not-yet-applied bundle (lives in ota/next)
function getStagedMeta() {
  try {
    const stored = localStorage.getItem(OTA_STAGED_META_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function setStagedMeta(meta) {
  try {
    localStorage.setItem(OTA_STAGED_META_KEY, JSON.stringify(meta));
  } catch { /* ignore */ }
}

function clearStagedMeta() {
  try {
    localStorage.removeItem(OTA_STAGED_META_KEY);
  } catch { /* ignore */ }
}

// ── Version comparison ───────────────────────────────────────────────────────

function parseVersion(version) {
  const clean = String(version || '').replace(/^v/i, '').trim();
  return clean.split('.').map(p => parseInt(p, 10) || 0);
}

function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return vb[i] - va[i];
  }
  return 0;
}

// ── SHA-256 hash verification ────────────────────────────────────────────────

async function sha256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Check for OTA update ─────────────────────────────────────────────────────

/**
 * Check if a newer web bundle is available.
 * Returns the version info if an update is available, null otherwise.
 */
export async function checkForOtaUpdate() {
  if (!isCapacitorApp() || isTauriApp()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(apiUrl('/api/ota/version'), { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.version || !data.downloadUrl || !data.sha256) return null;

    const meta = getOtaMeta();
    const currentVersion = meta?.version || __APP_VERSION__ || '0.0.0';

    // Already downloaded and waiting for "Update now" — no need to fetch again
    const staged = getStagedMeta();
    if (staged && compareVersions(staged.version, data.version) <= 0) {
      return null;
    }

    if (compareVersions(currentVersion, data.version) > 0) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn('[OTA] Failed to check for update:', err.message);
    return null;
  }
}

// ── Download and verify bundle ───────────────────────────────────────────────

/**
 * Download the OTA bundle ZIP, verify its SHA-256 hash, and extract it.
 * Returns true on success, false on failure.
 */
export async function downloadOtaToStaging(updateInfo) {
  if (!isCapacitorApp() || isTauriApp()) return false;

  const { version, downloadUrl, sha256: expectedHash, releaseNotes } = updateInfo;
  console.log(`[OTA] Downloading bundle v${version} from ${downloadUrl}`);

  try {
    // 1. Download the ZIP
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const zipBuffer = await res.arrayBuffer();

    // 2. Verify SHA-256
    const actualHash = await sha256(zipBuffer);
    if (actualHash !== expectedHash) {
      throw new Error(`Hash mismatch: expected ${expectedHash}, got ${actualHash}`);
    }
    console.log('[OTA] SHA-256 verified');

    // 3. Extract ZIP (async to avoid blocking main thread)
    const files = await new Promise((resolve, reject) => {
      unzip(new Uint8Array(zipBuffer), (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    console.log(`[OTA] Extracted ${Object.keys(files).length} files`);

    // 4. Write each file to the OTA directory
    // Start from an empty staging folder so leftovers from a failed try are not mixed in
    await cleanupDir(OTA_NEXT_DIR);
    try {
      await Filesystem.mkdir({
        path: OTA_NEXT_DIR,
        directory: Directory.Data,
        recursive: true,
      });
    } catch { /* directory may already exist */ }

    for (const [filename, data] of Object.entries(files)) {
      // Skip directory entries
      if (filename.endsWith('/')) continue;

      // Remove leading slashes for filesystem path
      const cleanPath = filename.replace(/^\/+/, '');
      const fullPath = `${OTA_NEXT_DIR}/${cleanPath}`;

      // Ensure parent directory exists
      const dirPath = fullPath.split('/').slice(0, -1).join('/');
      if (dirPath) {
        try {
          await Filesystem.mkdir({
            path: dirPath,
            directory: Directory.Data,
            recursive: true,
          });
        } catch { /* may exist */ }
      }

      // Write file as base64
      const base64Data = arrayBufferToBase64(data);
      await Filesystem.writeFile({
        path: fullPath,
        data: base64Data,
        directory: Directory.Data,
        recursive: true,
      });
    }

    // 5. Verify the bundle has an index.html
    try {
      await Filesystem.stat({
        path: `${OTA_NEXT_DIR}/index.html`,
        directory: Directory.Data,
      });
    } catch {
      throw new Error('OTA bundle missing index.html — corrupted or invalid');
    }

    // 6. Record it as staged. The running app keeps its current bundle until "Update now".
    setStagedMeta({
      version,
      stagedAt: Date.now(),
      releaseNotes: releaseNotes || null,
    });

    console.log(`[OTA] Bundle v${version} downloaded and staged — waiting for user to tap Update now`);
    return true;
  } catch (err) {
    console.error('[OTA] Download failed:', err.message);
    // Clean up partial download; the accepted bundle (ota/current) is untouched
    await cleanupDir(OTA_NEXT_DIR);
    return false;
  }
}

// ── Apply OTA on startup ─────────────────────────────────────────────────────

/**
 * On app startup, check if an OTA bundle is pending and navigate to it.
 * If the bundle is corrupted, clean up and fall back to bundled assets.
 *
 * This should be called early in the app lifecycle, before React renders.
 */
export async function checkAndApplyOtaOnStartup() {
  if (!isCapacitorApp() || isTauriApp()) return;

  // Only re-open the bundle the user already accepted. A staged update is never applied here.
  const meta = getOtaMeta();
  if (!meta || meta.status !== 'applied') return;

  // Already running from the OTA bundle — don't reload again
  if (window.location.href.includes(OTA_CURRENT_DIR)) return;

  try {
    // Verify the OTA bundle still exists and has index.html
    await Filesystem.stat({
      path: `${OTA_CURRENT_DIR}/index.html`,
      directory: Directory.Data,
    });

    // Get the URI for the OTA index.html
    const { uri } = await Filesystem.getUri({
      path: `${OTA_CURRENT_DIR}/index.html`,
      directory: Directory.Data,
    });

    console.log(`[OTA] Re-opening accepted bundle v${meta.version}`);
    window.location.replace(uri);
  } catch (err) {
    console.warn('[OTA] Accepted bundle not found or corrupted — falling back to bundled assets:', err.message);
    await cleanupDir(OTA_CURRENT_DIR);
    clearOtaMeta();
  }
}

// ── Apply staged update (user clicked "Update now") ──────────────────────────

/** The downloaded-but-not-yet-applied update, or null. */
export function getStagedOta() {
  return getStagedMeta();
}

/**
 * Move the staged bundle into place and reload into it.
 * Only call this from a direct user action (the "Update now" button).
 * The caller must make sure no orders or KOTs are unsynced first.
 */
export async function applyStagedOta() {
  if (!isCapacitorApp() || isTauriApp()) return false;

  const staged = getStagedMeta();
  if (!staged) return false;

  try {
    await Filesystem.stat({
      path: `${OTA_NEXT_DIR}/index.html`,
      directory: Directory.Data,
    });

    // Replace the accepted bundle with the staged one
    await cleanupDir(OTA_CURRENT_DIR);
    await Filesystem.rename({
      from: OTA_NEXT_DIR,
      to: OTA_CURRENT_DIR,
      directory: Directory.Data,
      toDirectory: Directory.Data,
    });

    setOtaMeta({
      version: staged.version,
      appliedAt: Date.now(),
      releaseNotes: staged.releaseNotes || null,
      status: 'applied',
    });
    clearStagedMeta();

    const { uri } = await Filesystem.getUri({
      path: `${OTA_CURRENT_DIR}/index.html`,
      directory: Directory.Data,
    });
    console.log(`[OTA] Applied v${staged.version} — reloading`);
    window.location.replace(uri);
    return true;
  } catch (err) {
    console.error('[OTA] Apply failed — staying on the current version:', err.message);
    await cleanupDir(OTA_NEXT_DIR);
    clearStagedMeta();
    return false;
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupDir(path) {
  try {
    await Filesystem.rmdir({
      path,
      directory: Directory.Data,
      recursive: true,
    });
  } catch { /* ignore */ }
}

// ── Rollback to bundled assets ───────────────────────────────────────────────

/**
 * If the current OTA bundle is causing issues, roll back to the bundled assets.
 * Removes the OTA directory and metadata, then reloads the app.
 */
export async function rollbackOta() {
  if (!isCapacitorApp()) return;

  console.log('[OTA] Rolling back to bundled assets');
  await cleanupDir(OTA_CURRENT_DIR);
  await cleanupDir(OTA_NEXT_DIR);
  clearOtaMeta();
  clearStagedMeta();

  // Reload from bundled assets — Capacitor will load from webDir
  window.location.replace('/');
}

// ── Get current OTA status ───────────────────────────────────────────────────

export function getOtaStatus() {
  const meta = getOtaMeta();
  return {
    hasOtaBundle: meta?.status === 'applied',
    version: meta?.version || null,
    appliedAt: meta?.appliedAt || null,
    releaseNotes: meta?.releaseNotes || null,
  };
}

// ── Full OTA check flow (for background polling) ─────────────────────────────

/**
 * Check for an OTA update and download it into staging if available.
 * Non-blocking — returns immediately if no update or download fails.
 * Nothing is applied here; the user applies it with applyStagedOta().
 */
export async function checkAndDownloadOta() {
  if (!isCapacitorApp() || isTauriApp()) return;

  try {
    const update = await checkForOtaUpdate();
    if (!update) return;

    const success = await downloadOtaToStaging(update);
    if (success) {
      console.log(`[OTA] Update v${update.version} staged — waiting for user to tap Update now`);
    }
  } catch (err) {
    console.warn('[OTA] Background check failed:', err.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
