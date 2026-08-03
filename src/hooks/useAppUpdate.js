// ─────────────────────────────────────────────────────────────────────────────
// useAppUpdate — Cross-platform native update state hook
// ─────────────────────────────────────────────────────────────────────────────
// Drives update UI for both Cashier Desktop (Tauri) and Captain Android
// (Capacitor).  Checks the backend manifest on startup, supports a manual
// "Search for new updates" action, and exposes install helpers.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { checkForUpdate, installUpdate, getAppLabel } from '../services/appUpdateService';

function detectAppKey() {
  if (typeof window === 'undefined') return 'captain';
  const path = window.location.pathname;
  if (path.startsWith('/captain')) return 'captain';
  if (path.startsWith('/cashier')) return 'cashier';
  if (path.startsWith('/admin')) return 'admin';
  return 'captain';
}

export function useAppUpdate() {
  const [appKey] = useState(detectAppKey);
  const [state, setState] = useState({
    checking: true,
    hasUpdate: false,
    mandatory: false,
    currentVersion: null,
    latestVersion: null,
    downloadUrl: null,
    releaseNotes: null,
    packageId: null,
    manifest: null,
    error: null,
    dismissed: false,
    installing: false,
    installError: null,
    appName: getAppLabel(appKey),
  });

  const handleResult = useCallback((result) => {
    const m = result.manifest;
    setState((s) => ({
      ...s,
      checking: false,
      hasUpdate: !!m?.updateAvailable,
      mandatory: !!m?.mandatory,
      currentVersion: m?.currentVersion || s.currentVersion,
      latestVersion: m?.latestVersion || s.latestVersion,
      downloadUrl: m?.downloadUrl || null,
      releaseNotes: m?.releaseNotes || null,
      packageId: m?.packageId || null,
      manifest: m || null,
      error: result.error || null,
      dismissed: m?.mandatory ? false : s.dismissed,
    }));
  }, []);

  const runCheck = useCallback(async (force = false) => {
    setState((s) => ({ ...s, checking: true, error: null }));
    const result = await checkForUpdate(appKey, force);
    handleResult(result);
  }, [appKey, handleResult]);

  const checkNow = useCallback(() => runCheck(true), [runCheck]);

  const installNow = useCallback(async () => {
    if (!state.manifest) return { state: 'failed', error: 'No update selected' };
    setState((s) => ({ ...s, installing: true, installError: null }));
    const result = await installUpdate(state.manifest);
    setState((s) => ({
      ...s,
      installing: false,
      installError: result.error,
    }));
    return result;
  }, [state.manifest]);

  const dismiss = useCallback(() => {
    if (state.mandatory) return;
    setState((s) => ({ ...s, dismissed: true }));
  }, [state.mandatory]);

  useEffect(() => {
    let active = true;
    (async () => {
      setState((s) => ({ ...s, checking: true }));
      const result = await checkForUpdate(appKey, false);
      if (active) handleResult(result);
    })();
    return () => { active = false; };
  }, [appKey, handleResult]);

  return {
    ...state,
    appKey,
    appName: getAppLabel(appKey),
    checking: state.checking,
    hasUpdate: state.hasUpdate,
    mandatory: state.mandatory,
    checkNow,
    installNow,
    dismiss,
  };
}
