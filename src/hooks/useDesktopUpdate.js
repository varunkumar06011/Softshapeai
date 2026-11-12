// ─────────────────────────────────────────────────────────────────────────────
// useDesktopUpdate — "Update now" flow for the Windows desktop apps (Tauri)
// ─────────────────────────────────────────────────────────────────────────────
// The desktop app NEVER installs an update by itself. This hook only:
//   1. asks the native side whether a newer version exists  (`check_update`)
//   2. exposes `install()`, which downloads + installs it   (`install_update`)
// `install()` is wired to the "Update now" button, so nothing changes until the
// user clicks it.
//
// Checks run 30s after launch and then every 6 hours. A failed check (offline,
// no release yet, build without updater) is silent — the app keeps working.
// Outside the desktop app (browser / Android) the hook does nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';

const FIRST_CHECK_DELAY_MS = 30 * 1000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function getTauri() {
  if (typeof window === 'undefined') return { invoke: null, listen: null };
  return {
    invoke: window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null,
    listen: window.__TAURI__?.event?.listen || null,
  };
}

const INITIAL = {
  // idle → available → downloading → installing   (error can follow downloading)
  status: 'idle',
  currentVersion: null,
  version: null,
  notes: null,
  downloaded: 0,
  total: null,
  error: null,
};

export function useDesktopUpdate() {
  const [state, setState] = useState(INITIAL);
  const working = useRef(false); // a check or an install is in flight

  const check = useCallback(async () => {
    const { invoke } = getTauri();
    if (!invoke || working.current) return;
    working.current = true;
    try {
      const info = await invoke('check_update');
      setState((s) => (info?.available
        ? { ...s, status: 'available', currentVersion: info.currentVersion ?? s.currentVersion, version: info.version, notes: info.notes ?? null, error: null }
        : { ...s, status: 'idle', currentVersion: info?.currentVersion ?? s.currentVersion, version: null, notes: null }));
    } catch (err) {
      // Offline / no release / updater unavailable: keep whatever we already know.
      console.warn('[Updater] Check failed:', err?.message || err);
    } finally {
      working.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    const { invoke, listen } = getTauri();
    if (!invoke || working.current) return;
    working.current = true;
    setState((s) => ({ ...s, status: 'downloading', downloaded: 0, total: null, error: null }));

    let unlisten = null;
    try {
      if (listen) {
        unlisten = await listen('update-progress', (e) => {
          const p = e?.payload || {};
          setState((s) => ({ ...s, downloaded: Number(p.downloaded) || 0, total: p.total != null ? Number(p.total) : null }));
        });
      }
    } catch { /* progress is cosmetic */ }

    try {
      await invoke('install_update');
      // On Windows the installer closes this app and relaunches the new version.
      setState((s) => ({ ...s, status: 'installing' }));
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', error: String(err?.message || err) }));
    } finally {
      working.current = false;
      try { unlisten?.(); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!getTauri().invoke) return undefined;
    const first = setTimeout(check, FIRST_CHECK_DELAY_MS);
    const every = setInterval(check, RECHECK_INTERVAL_MS);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [check]);

  return { ...state, check, install };
}
