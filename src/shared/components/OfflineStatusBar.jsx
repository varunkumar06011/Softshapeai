// ─────────────────────────────────────────────────────────────────────────────
// OfflineStatusBar — Offline status indicator with sync queue and pending actions
// ─────────────────────────────────────────────────────────────────────────────
// Displays a status bar showing the app's online/offline state:
//   - Online: green bar with "All synced" or last sync time
//   - Offline: red/amber bar with pending action count and retry button
//   - Sync error: shows last error message with retry option
//   - Auth expired: prompts re-login when JWT expires during offline mode
//   - Expandable details: shows cache age for menu and table data
//   - Pending actions modal trigger (view/retry/sync queued actions)
//
// Uses SyncStatusContext for state and syncEngine for action processing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, X, Clock, ChevronDown } from 'lucide-react';
import { useSyncStatus } from '../../context/SyncStatusContext';
import { getMenuCacheAgeMs } from '../../services/menuSyncService';
import { getTableCacheAgeMs } from '../../services/tableSyncService';
import { flushQueuedPrintJobs } from '../../utils/printOffline';

export default function OfflineStatusBar() {
  const {
    isOnline,
    isOffline,
    syncStatus,
    pendingCount,
    lastSyncAt,
    lastError,
    authExpired,
    hasConflicts,
    conflicts,
    triggerSync,
    dismissConflict,
    dismissAllConflicts,
    dismissAuthExpired,
  } = useSyncStatus();

  const [showConflicts, setShowConflicts] = useState(false);
  const [showPendingDetail, setShowPendingDetail] = useState(false);
  const [printFlush, setPrintFlush] = useState({ running: false, result: null });

  // Auto-show conflict panel when conflicts arrive
  useEffect(() => {
    if (hasConflicts) setShowConflicts(true);
  }, [hasConflicts]);

  async function handleRetryPrints() {
    setPrintFlush({ running: true, result: null });
    try {
      const result = await flushQueuedPrintJobs();
      setPrintFlush({ running: false, result: `${result.flushed} printed, ${result.failed} failed` });
      // Clear status after 3 seconds
      setTimeout(() => setPrintFlush({ running: false, result: null }), 3000);
    } catch (err) {
      setPrintFlush({ running: false, result: err?.message || 'Retry failed' });
      setTimeout(() => setPrintFlush({ running: false, result: null }), 3000);
    }
  }

  // Don't render if everything is fine and no pending actions
  if (isOnline && syncStatus === 'idle' && pendingCount === 0 && !hasConflicts) {
    return null;
  }

  const isSyncing = syncStatus === 'syncing';
  const hasError = syncStatus === 'error' || syncStatus === 'paused';
  const staleMinutes = lastSyncAt ? Math.floor((Date.now() - lastSyncAt) / 60000) : null;
  const isStale = staleMinutes !== null && staleMinutes > 5;
  const STALE_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
  const menuCacheAgeMs = getMenuCacheAgeMs();
  const tableCacheAgeMs = getTableCacheAgeMs();
  const isMenuCacheStale = menuCacheAgeMs > STALE_CACHE_MS;
  const isTableCacheStale = tableCacheAgeMs > STALE_CACHE_MS;
  const isAnyCacheStale = isMenuCacheStale || isTableCacheStale;

  return (
    <>
      {/* Status bar */}
      <div
        className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between px-4 py-2 text-xs font-medium transition-all duration-300 ${
          isOffline
            ? 'bg-amber-500 text-white'
            : hasError
            ? 'bg-red-500 text-white'
            : isSyncing
            ? 'bg-blue-500 text-white'
            : 'bg-emerald-500 text-white'
        }`}
      >
        <div className="flex items-center gap-2">
          {isOffline ? (
            <>
              <WifiOff size={14} />
              <span>Offline — actions will sync when reconnected</span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Syncing {pendingCount > 0 ? `(${pendingCount} pending)` : '...'} </span>
            </>
          ) : hasError ? (
            <>
              <AlertTriangle size={14} />
              <span>{lastError || 'Sync error'}</span>
            </>
          ) : (
            <>
              <Wifi size={14} />
              <span>Online {pendingCount > 0 ? `— ${pendingCount} pending` : ''}</span>
            </>
          )}

          {pendingCount > 0 && (
            <button
              onClick={() => setShowPendingDetail(!showPendingDetail)}
              className="ml-2 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30 transition-colors"
            >
              <Clock size={10} />
              {pendingCount} pending
              <ChevronDown size={10} className={`transition-transform ${showPendingDetail ? 'rotate-180' : ''}`} />
            </button>
          )}

          {hasConflicts && (
            <button
              onClick={() => setShowConflicts(!showConflicts)}
              className="ml-2 flex items-center gap-1 rounded-full bg-red-700 px-2 py-0.5 hover:bg-red-800 transition-colors animate-pulse"
            >
              <AlertTriangle size={10} />
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
            </button>
          )}

          {isStale && isOnline && (
            <span className="ml-2 flex items-center gap-1 text-white/80">
              <Clock size={10} />
              Last sync {staleMinutes}m ago
            </span>
          )}

          {authExpired && (
            <span className="ml-2 flex items-center gap-1 rounded-full bg-red-700 px-2 py-0.5 animate-pulse">
              <AlertTriangle size={10} />
              Session expired
            </span>
          )}

          {isOffline && isAnyCacheStale && (
            <span className="ml-2 flex items-center gap-1 rounded-full bg-amber-700 px-2 py-0.5">
              <AlertTriangle size={10} />
              Stale cache ({isMenuCacheStale ? 'menu' : ''}{isMenuCacheStale && isTableCacheStale ? '+' : ''}{isTableCacheStale ? 'tables' : ''})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isOffline && (
            <button
              onClick={handleRetryPrints}
              disabled={printFlush.running}
              className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 hover:bg-white/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={printFlush.running ? 'animate-spin' : ''} />
              {printFlush.result ? printFlush.result : 'Retry prints'}
            </button>
          )}
          {isOnline && (hasError || pendingCount > 0) && (
            <button
              onClick={triggerSync}
              disabled={isSyncing}
              className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 hover:bg-white/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              Retry sync
            </button>
          )}
        </div>
      </div>

      {/* Spacer to prevent content from being hidden behind the status bar */}
      <div className="h-8" />

      {/* Pending actions detail dropdown */}
      {showPendingDetail && pendingCount > 0 && (
        <div className="fixed top-8 left-4 right-4 z-[9998] rounded-b-lg bg-white shadow-lg border border-gray-200 p-3 text-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm">Pending Actions ({pendingCount})</span>
            <button onClick={() => setShowPendingDetail(false)}>
              <X size={14} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Actions will be automatically synced when connection is restored.
            {lastSyncAt && ` Last sync: ${new Date(lastSyncAt).toLocaleTimeString('en-IN')}`}
          </p>
          {isOnline && (
            <button
              onClick={() => { triggerSync(); setShowPendingDetail(false); }}
              className="w-full py-2 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors"
            >
              Sync Now
            </button>
          )}
        </div>
      )}

      {/* Conflict resolution panel */}
      {showConflicts && hasConflicts && (
        <div className="fixed top-8 left-4 right-4 z-[9998] max-h-[60vh] overflow-y-auto rounded-b-lg bg-white shadow-xl border border-red-200 p-3 text-gray-800">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-sm flex items-center gap-2 text-red-600">
              <AlertTriangle size={16} />
              Sync Conflicts ({conflicts.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={dismissAllConflicts}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Dismiss all
              </button>
              <button onClick={() => setShowConflicts(false)}>
                <X size={14} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {conflicts.map((conflict) => (
              <div
                key={conflict.actionId}
                className={`rounded-lg border p-3 text-xs ${
                  conflict.alertLevel === 'error'
                    ? 'border-red-300 bg-red-50'
                    : conflict.alertLevel === 'warning'
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-blue-300 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-bold mb-1">
                      {conflict.actionType} — {conflict.resolution}
                    </div>
                    <div className="text-gray-600">{conflict.message}</div>
                    {conflict.requestId && (
                      <div className="text-gray-400 mt-1 text-[10px]">Ref: {conflict.requestId.slice(0, 12)}</div>
                    )}
                  </div>
                  <button
                    onClick={() => dismissConflict(conflict.actionId)}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
