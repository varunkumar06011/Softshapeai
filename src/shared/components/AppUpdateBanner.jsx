// ─────────────────────────────────────────────────────────────────────────────
// AppUpdateBanner — Cross-platform native update notification
// ─────────────────────────────────────────────────────────────────────────────
// Shows a top banner for optional minor/patch releases and a full-screen
// blocking modal for mandatory major releases.  Actions are backed by the
// shared useAppUpdate hook which calls the backend manifest endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Download, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { isTauri, isCapacitor } from '../../services/appUpdateService';

export default function AppUpdateBanner() {
  const {
    hasUpdate,
    mandatory,
    currentVersion,
    latestVersion,
    releaseNotes,
    appName,
    checking,
    error,
    installError,
    installing,
    dismissed,
    installNow,
    checkNow,
    dismiss,
  } = useAppUpdate();

  const [lastResult, setLastResult] = useState(null);

  // Only render on native platforms (Tauri desktop or Capacitor Android).
  // On web/PWA, update checks always fail (no native version) and would
  // produce a spurious error banner.
  if (!isTauri() && !isCapacitor()) return null;

  if (checking && !hasUpdate) {
    return null; // Don't flash UI while checking
  }

  if (!hasUpdate && !error) return null;

  const onInstall = async () => {
    const res = await installNow();
    setLastResult(res);
  };

  const versionLine = currentVersion && latestVersion
    ? `v${currentVersion} → v${latestVersion}`
    : currentVersion
      ? `v${currentVersion}`
      : '';

  if (mandatory) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-center gap-3 text-[#B71C1C] mb-4">
            <AlertTriangle size={28} />
            <h2 className="text-xl font-bold">Update required</h2>
          </div>
          <p className="text-gray-900 font-medium mb-2">
            {appName} {versionLine}
          </p>
          {releaseNotes && (
            <div className="text-sm text-gray-600 mb-4 max-h-40 overflow-auto whitespace-pre-line">
              {releaseNotes}
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 mb-4 bg-red-50 p-2 rounded-lg">
              {error}
            </p>
          )}
          {installError && (
            <p className="text-sm text-red-600 mb-4 bg-red-50 p-2 rounded-lg">
              {installError}
            </p>
          )}
          {lastResult?.state === 'restart_required' && (
            <p className="text-sm text-green-700 mb-4 bg-green-50 p-2 rounded-lg">
              Update downloaded. Please restart {appName} to finish installing.
            </p>
          )}
          <div className="flex flex-col gap-3">
            <button
              onClick={onInstall}
              disabled={installing}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#E53935] text-white py-3 text-sm font-bold hover:bg-[#B71C1C] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {installing ? 'Downloading…' : 'Update now'}
            </button>
            <button
              onClick={checkNow}
              disabled={checking}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-300 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {checking ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              Retry check
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="fixed left-0 right-0 z-[200] bg-[#B71C1C] text-white px-4 py-3 shadow-lg" style={{ top: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">
            {appName} update available: {versionLine}
          </p>
          {releaseNotes && (
            <p className="text-xs text-white/80 truncate">
              {releaseNotes.split('\n')[0]}
            </p>
          )}
          {error && (
            <p className="text-xs text-white/80 truncate">{error}</p>
          )}
          {installError && (
            <p className="text-xs text-white/80 truncate">{installError}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onInstall}
            disabled={installing}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#B71C1C] hover:bg-white/90 disabled:opacity-70"
          >
            {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {installing ? '…' : 'Update'}
          </button>
          <button
            onClick={dismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:bg-white/10"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
