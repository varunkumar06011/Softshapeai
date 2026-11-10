// ─────────────────────────────────────────────────────────────────────────────
// OtaUpdateBanner — Android web-bundle update prompt
// ─────────────────────────────────────────────────────────────────────────────
// Shows when a new web bundle has been downloaded (staged) by otaService.
// Nothing is applied until the user clicks "Update now".
//
// Install is blocked while changes are waiting to sync or KOTs are queued,
// so the reload cannot lose an order. Installing reloads the app.
//
// Android only. Renders nothing on web, desktop, or iOS.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useSyncStatus } from '../../context/SyncStatusContext';
import { getStagedOta, applyStagedOta } from '../../services/otaService';
import { hasQueuedKots } from '../../services/kotQueue';

const REFRESH_MS = 5_000;

function isAndroid() {
  return window?.Capacitor?.getPlatform?.() === 'android';
}

export default function OtaUpdateBanner() {
  const { hasPending } = useSyncStatus();
  const [staged, setStaged] = useState(null);
  const [kotsQueued, setKotsQueued] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  // Re-read staged status and the KOT queue periodically; both live outside React state
  useEffect(() => {
    if (!isAndroid()) return undefined;
    const refresh = () => {
      setStaged(getStagedOta());
      setKotsQueued(hasQueuedKots());
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (!isAndroid() || !staged || dismissed) return null;

  const blocked = hasPending || kotsQueued;
  const blockReason = kotsQueued
    ? 'Send or clear queued KOTs first, then update.'
    : 'Wait for pending changes to sync, then update.';

  const handleUpdateNow = async () => {
    if (blocked || applying) return;
    setApplying(true);
    setError(null);
    // On success the page reloads, so this only matters when the apply fails
    const ok = await applyStagedOta();
    if (!ok) {
      setApplying(false);
      setError('Could not apply the update. You can keep using this version and try again later.');
    }
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-4 z-[9998] rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-lg"
    >
      <p className="text-sm font-semibold text-[#1E293B]">
        Update {staged.version} is ready
      </p>
      {blocked && <p className="mt-1 text-xs text-[#64748B]">{blockReason}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={applying}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"
        >
          Later
        </button>
        <button
          type="button"
          onClick={handleUpdateNow}
          disabled={blocked || applying}
          className="rounded-lg bg-[#1E293B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applying ? 'Updating…' : 'Update now'}
        </button>
      </div>
    </div>
  );
}
