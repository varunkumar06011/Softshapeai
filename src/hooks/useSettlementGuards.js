import { useState, useEffect, useCallback, useRef } from 'react';
import {
  markSettledOrder,
  markSettledTable,
  loadSettlementGuards,
  clearSettlementGuards,
  flushSettlementGuards,
} from '../utils/settlementGuardWriter';

/**
 * Hook for managing settlement guards.
 *
 * Settlement guards are orderIds/tableIds that have been settled locally so that
 * the cashier cannot double-settle a table/order and stale sync events do not
 * revert the UI. The sets are persisted to IndexedDB (via a batched writer) and
 * survive app restarts and app kills.
 */
export function useSettlementGuards(hasPending, lastSyncAt) {
  const [settledOrderIds, setSettledOrderIdsState] = useState(() => new Set());
  const [settledTableIds, setSettledTableIdsState] = useState(() => new Set());
  const settledTableIdsRef = useRef(settledTableIds);
  useEffect(() => { settledTableIdsRef.current = settledTableIds; }, [settledTableIds]);

  // Load persisted guards on mount. The writer also restores from a snapshot
  // if the IndexedDB flush was interrupted by a crash/kill.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { orderIds, tableIds } = await loadSettlementGuards();
      if (cancelled) return;
      setSettledOrderIdsState(orderIds);
      setSettledTableIdsState(tableIds);
    })();
    return () => { cancelled = true; };
  }, []);

  // Persisted setters: update state and queue a batched IndexedDB write
  const setSettledOrderIds = useCallback((updater) => {
    setSettledOrderIdsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      next.forEach(id => markSettledOrder(id));
      return next;
    });
  }, []);

  const setSettledTableIds = useCallback((updater) => {
    setSettledTableIdsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      next.forEach(id => markSettledTable(id));
      return next;
    });
  }, []);

  // Once all pending actions have synced, wait 5 minutes before clearing guards.
  // The TTL prevents double-settlement from a second click that generates a new
  // requestId (which would bypass both edge command_log and cloud ProcessedRequest
  // idempotency checks, both keyed on requestId). The edge server's status check
  // (order.status === 'SETTLED') is the primary guard; this TTL is the secondary.
  useEffect(() => {
    if (!hasPending && lastSyncAt && (settledOrderIds.size > 0 || settledTableIds.size > 0)) {
      const timer = setTimeout(() => {
        clearSettlementGuards()
          .then(() => {
            setSettledOrderIdsState(new Set());
            setSettledTableIdsState(new Set());
          })
          .catch(err => console.error('[SettlementGuard] Failed to clear guards:', err));
      }, 5 * 60 * 1000);
      return () => clearTimeout(timer);
    }
  }, [hasPending, lastSyncAt, settledOrderIds.size, settledTableIds.size]);

  // Flush pending guards on app unload (desktop) and Capacitor pause (mobile)
  // so the last settlement in a burst survives a crash or kill.
  useEffect(() => {
    const onUnload = () => {
      flushSettlementGuards();
    };
    window.addEventListener('beforeunload', onUnload);

    let removePauseListener = null;
    if (window.Capacitor?.isNativePlatform?.()) {
      import('@capacitor/core').then(({ App }) => {
        const listener = App.addListener('pause', () => {
          flushSettlementGuards().catch(err => console.error('[SettlementGuard] Pause flush failed:', err.message));
        });
        removePauseListener = () => listener.then(l => l.remove()).catch(() => {});
      }).catch(() => {
        // Capacitor core not available; beforeunload fallback is enough.
      });
    }

    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (removePauseListener) removePauseListener();
    };
  }, []);

  return {
    settledOrderIds,
    settledTableIds,
    settledTableIdsRef,
    setSettledOrderIds,
    setSettledTableIds,
  };
}
