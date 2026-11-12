// ─────────────────────────────────────────────────────────────────────────────
// DesktopUpdateBanner — "Update now" card for the Windows desktop apps
// ─────────────────────────────────────────────────────────────────────────────
// Appears only inside the Tauri desktop app, only when a newer version is
// available. Nothing is downloaded or installed until the user clicks
// "Update now". "Later" hides it until the next launch.
//
// Shown as a compact card centred at the top: on the cashier screen that is the
// empty middle of the blue header (clock on the left, cashier name on the
// right), so it covers nothing the cashier uses. It sits above every other
// top bar (the offline / print-queue bar is z-[9999]) so it can never be hidden.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ArrowUpCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useDesktopUpdate } from '../../hooks/useDesktopUpdate';

// Plain wording for the cashier; the raw message stays in the tooltip for support.
function friendlyError(error) {
  const msg = String(error || '').toLowerCase();
  if (msg.includes('signature')) return 'Failed its security check. Contact support.';
  if (msg.includes('no update available')) return 'This update is no longer available.';
  return 'Could not download it. Check the internet.';
}

function percent(downloaded, total) {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((downloaded / total) * 100));
}

export default function DesktopUpdateBanner() {
  const { status, currentVersion, version, downloaded, total, error, install } = useDesktopUpdate();
  const [dismissed, setDismissed] = useState(false);

  const busy = status === 'downloading' || status === 'installing';
  // Once the user started an update, keep the card up until the app restarts.
  if (status === 'idle' || (dismissed && !busy)) return null;

  const pct = percent(downloaded, total);

  let icon;
  let title;
  let subtitle;
  if (status === 'downloading') {
    icon = <Loader2 size={18} className="animate-spin" />;
    title = `Downloading update${pct != null ? ` · ${pct}%` : '…'}`;
    subtitle = 'Keep the app open. It restarts when ready.';
  } else if (status === 'installing') {
    icon = <Loader2 size={18} className="animate-spin" />;
    title = 'Installing update…';
    subtitle = 'The app is restarting.';
  } else if (status === 'error') {
    icon = <AlertTriangle size={18} />;
    title = 'Update failed';
    subtitle = friendlyError(error);
  } else {
    icon = <ArrowUpCircle size={18} />;
    title = `Update available · v${version}`;
    subtitle = currentVersion
      ? `You have v${currentVersion} · restarts to update`
      : 'The app restarts to update';
  }

  const isError = status === 'error';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[10000] w-[min(460px,calc(100vw-32px))]"
    >
      <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
        <div className="flex items-center gap-3 px-3 py-2">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              isError ? 'bg-red-50 text-red-600' : 'bg-[#1E3A8A]/10 text-[#1E3A8A]'
            }`}
          >
            {icon}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-gray-900">{title}</p>
            <p className="truncate text-[11px] font-medium text-gray-500" title={isError && error ? error : subtitle}>{subtitle}</p>
          </div>

          {!busy && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={install}
                className="rounded-full bg-[#1E3A8A] px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#152C6B]"
              >
                {isError ? 'Try again' : 'Update now'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-full px-2.5 py-1.5 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                Later
              </button>
            </div>
          )}
        </div>

        {busy && (
          <div className="h-1 w-full bg-gray-100">
            <div
              className={`h-full bg-[#1E3A8A] transition-[width] duration-300 ${pct == null ? 'w-1/3 animate-pulse' : ''}`}
              style={pct != null ? { width: `${status === 'installing' ? 100 : pct}%` } : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
