// ─────────────────────────────────────────────────────────────────────────────
// DesktopUpdateBanner — "Update now" banner for the Windows desktop apps
// ─────────────────────────────────────────────────────────────────────────────
// Appears only inside the Tauri desktop app, only when a newer version is
// available. Nothing is downloaded or installed until the user clicks
// "Update now". "Later" hides the banner until the next launch.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { useDesktopUpdate } from '../../hooks/useDesktopUpdate';

function percent(downloaded, total) {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((downloaded / total) * 100));
}

export default function DesktopUpdateBanner() {
  const { status, currentVersion, version, downloaded, total, error, install } = useDesktopUpdate();
  const [dismissed, setDismissed] = useState(false);

  const busy = status === 'downloading' || status === 'installing';
  // Once the user started an update, keep the banner up until the app restarts.
  if (status === 'idle' || (dismissed && !busy)) return null;

  const pct = percent(downloaded, total);

  return (
    <div className="fixed left-0 right-0 top-0 z-[200] bg-[#1E3A8A] text-white px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
        <div className="flex-1 min-w-0">
          {status === 'downloading' && (
            <>
              <p className="text-sm font-bold">Downloading update{pct != null ? `… ${pct}%` : '…'}</p>
              <p className="text-xs text-white/80">Keep the app open. It will restart when the update is ready.</p>
            </>
          )}
          {status === 'installing' && (
            <>
              <p className="text-sm font-bold">Installing update…</p>
              <p className="text-xs text-white/80">The app is restarting.</p>
            </>
          )}
          {status === 'error' && (
            <>
              <p className="text-sm font-bold">Update failed</p>
              <p className="text-xs text-white/80 truncate">{error || 'Something went wrong. Try again.'}</p>
            </>
          )}
          {status === 'available' && (
            <>
              <p className="text-sm font-bold truncate">
                Update available{currentVersion ? `: v${currentVersion} → v${version}` : `: v${version}`}
              </p>
              <p className="text-xs text-white/80">
                The app restarts during the update. Nothing changes until you click Update now.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {busy ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <button
                type="button"
                onClick={install}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#1E3A8A] hover:bg-white/90 transition-colors"
              >
                <Download size={14} />
                {status === 'error' ? 'Try again' : 'Update now'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-white/10 transition-colors"
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
