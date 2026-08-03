// ─────────────────────────────────────────────────────────────────────────────
// AppUpdateSettings — Native app update controls for the Settings UI
// ─────────────────────────────────────────────────────────────────────────────
// Renders current version, latest known version, update status, and manual
// "Search for new updates" / "Update now" controls.  Visible only when the
// app is running as a native Tauri desktop or Capacitor Android build.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Search, Download, RotateCcw, AlertCircle, Check, Loader2, ShieldAlert } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { isTauri, isCapacitor } from '../../services/appUpdateService';

function StatusLine({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

export default function AppUpdateSettings() {
  const native = isTauri() || isCapacitor();
  const {
    checking,
    hasUpdate,
    mandatory,
    currentVersion,
    latestVersion,
    releaseNotes,
    error,
    installError,
    installing,
    appName,
    checkNow,
    installNow,
  } = useAppUpdate();

  const [lastResult, setLastResult] = useState(null);

  if (!native) {
    return null;
  }

  const onInstall = async () => {
    const res = await installNow();
    setLastResult(res);
  };

  const statusText = checking
    ? 'Checking for updates…'
    : hasUpdate
    ? mandatory
      ? 'Update required'
      : 'Update available'
    : 'Up to date';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2.5 ${hasUpdate ? 'bg-red-50 text-[#E53935]' : 'bg-green-50 text-green-600'}`}>
          {hasUpdate ? <ShieldAlert size={22} /> : <Check size={22} />}
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900">{appName} Update</h3>
          <p className="text-sm text-gray-500">{statusText}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-1">
        <StatusLine label="Installed version" value={currentVersion ? `v${currentVersion}` : '—'} />
        <StatusLine label="Latest version" value={latestVersion ? `v${latestVersion}` : '—'} />
      </div>

      {releaseNotes && hasUpdate && (
        <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl whitespace-pre-line max-h-40 overflow-auto">
          {releaseNotes}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {installError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{installError}</span>
        </div>
      )}

      {lastResult?.state === 'restart_required' && (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
          Update downloaded. Restart {appName} to finish installing.
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          onClick={checkNow}
          disabled={checking}
          className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {checking ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {checking ? 'Checking…' : 'Search for new updates'}
        </button>

        {hasUpdate && (
          <button
            onClick={onInstall}
            disabled={installing}
            className="flex items-center gap-2 rounded-xl bg-[#E53935] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#B71C1C] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {installing ? 'Downloading…' : 'Update now'}
          </button>
        )}

        {(error || installError || lastResult?.error) && (
          <button
            onClick={checkNow}
            className="flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw size={16} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
