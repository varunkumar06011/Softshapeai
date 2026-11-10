// ─────────────────────────────────────────────────────────────────────────────
// DesktopUpdateBanner — Cashier desktop (Tauri) update prompt
// ─────────────────────────────────────────────────────────────────────────────
// Checks for a new release quietly in the background. Nothing is downloaded or
// installed until the cashier clicks "Update now".
//
// Install is blocked while a bill is open or changes are waiting to sync, so a
// restart can never lose an order. Installing restarts the app.
//
// Desktop only (Tauri). Does nothing in the browser or on Android.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useSyncStatus } from '../../context/SyncStatusContext';

const FIRST_CHECK_DELAY_MS = 15_000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function getInvoke() {
  return window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || null;
}

export default function DesktopUpdateBanner({ hasOpenBills = false }) {
  const { hasPending } = useSyncStatus();
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const invoke = getInvoke();
    if (!invoke) return undefined;

    let cancelled = false;
    const check = async () => {
      try {
        const info = await invoke('check_for_update');
        if (!cancelled && info) setUpdate(info);
      } catch {
        // Silent: the next scheduled check will try again.
      }
    };

    const firstTimer = setTimeout(check, FIRST_CHECK_DELAY_MS);
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, []);

  if (!update || dismissed) return null;

  const blocked = hasOpenBills || hasPending;
  const blockReason = hasOpenBills
    ? 'Close open bills first, then update.'
    : 'Wait for pending changes to sync, then update.';

  const handleUpdateNow = async () => {
    const invoke = getInvoke();
    if (!invoke || blocked || installing) return;
    setInstalling(true);
    setError(null);
    try {
      // On success the app restarts, so this promise does not resolve in practice.
      await invoke('install_update');
    } catch (err) {
      setInstalling(false);
      setError(String(err));
    }
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[9998] max-w-sm rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-lg"
    >
      <p className="text-sm font-semibold text-[#1E293B]">
        SoftShape Cashier {update.version} is available
      </p>
      {blocked && <p className="mt-1 text-xs text-[#64748B]">{blockReason}</p>}
      {!blocked && !installing && (
        <p className="mt-1 text-xs text-[#64748B]">
          The billing service restarts during the update. Captains are disconnected for about a minute.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">Update failed: {error}</p>}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={installing}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"
        >
          Later
        </button>
        <button
          type="button"
          onClick={handleUpdateNow}
          disabled={blocked || installing}
          className="rounded-lg bg-[#1E293B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {installing ? 'Installing…' : 'Update now'}
        </button>
      </div>
    </div>
  );
}
