import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSettledOrderIds,
  setSettledOrderIds as persistSettledOrderIds,
  getSettledTableIds,
  setSettledTableIds as persistSettledTableIds,
  clearAllSettlementGuards,
} from '../utils/offlineDB';

/**
 * Hook for managing settlement guards.
 *
 * Settlement guards are orderIds/tableIds that have been settled locally so that
 * the cashier cannot double-settle a table/order and stale sync events do not
 * revert the UI. The sets are persisted to IndexedDB and survive app restarts.
 */
export function useSettlementGuards(hasPending, lastSyncAt) {
  const [settledOrderIds, setSettledOrderIdsState] = useState(() => new Set());
  const [settledTableIds, setSettledTableIdsState] = useState(() => new Set());
  const settledTableIdsRef = useRef(settledTableIds);
  useEffect(() => { settledTableIdsRef.current = settledTableIds; }, [settledTableIds]);

  // Load persisted guards on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [orderIds, tableIds] = await Promise.all([
        getSettledOrderIds(),
        getSettledTableIds(),
      ]);
      if (cancelled) return;
      setSettledOrderIdsState(orderIds);
      setSettledTableIdsState(tableIds);
    })();
    return () => { cancelled = true; };
  }, []);

  // Persisted setters: update state and write to IndexedDB
  const setSettledOrderIds = useCallback((updater) => {
    setSettledOrderIdsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistSettledOrderIds(next).catch(err => console.error('[SettlementGuard] Failed to persist orderIds:', err));
      return next;
    });
  }, []);

  const setSettledTableIds = useCallback((updater) => {
    setSettledTableIdsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistSettledTableIds(next).catch(err => console.error('[SettlementGuard] Failed to persist tableIds:', err));
      return next;
    });
  }, []);

  // Once all pending actions have synced, clear guards so future sessions can
  // settle the same table/order again if needed.
  useEffect(() => {
    if (!hasPending && lastSyncAt && (settledOrderIds.size > 0 || settledTableIds.size > 0)) {
      clearAllSettlementGuards()
        .then(() => {
          setSettledOrderIdsState(new Set());
          setSettledTableIdsState(new Set());
        })
        .catch(err => console.error('[SettlementGuard] Failed to clear guards:', err));
    }
  }, [hasPending, lastSyncAt, settledOrderIds.size, settledTableIds.size]);

  return {
    settledOrderIds,
    settledTableIds,
    settledTableIdsRef,
    setSettledOrderIds,
    setSettledTableIds,
  };
}
