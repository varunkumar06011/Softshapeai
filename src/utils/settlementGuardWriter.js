import {
  getSettledOrderIds,
  setSettledOrderIds as persistSettledOrderIds,
  getSettledTableIds,
  setSettledTableIds as persistSettledTableIds,
} from './offlineDB';
import { getTenantScopedKey } from './cacheKeys';

const SNAPSHOT_KEY = '__settlement_guard_snapshot__';
const FLUSH_DELAY_MS = 300;

let pendingOrderIds = new Set();
let pendingTableIds = new Set();
let hasPendingFlush = false;
let flushTimer = null;

function getSnapshotKey() {
  return getTenantScopedKey(SNAPSHOT_KEY);
}

function writeSnapshot() {
  try {
    localStorage.setItem(getSnapshotKey(), JSON.stringify({
      orderIds: Array.from(pendingOrderIds),
      tableIds: Array.from(pendingTableIds),
      ts: Date.now(),
    }));
  } catch (err) {
    console.warn('[SettlementGuard] Failed to write snapshot:', err.message);
  }
}

function clearSnapshot() {
  try {
    localStorage.removeItem(getSnapshotKey());
  } catch {
    // localStorage may be unavailable; ignore.
  }
}

async function doFlush() {
  hasPendingFlush = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const orderIds = new Set(pendingOrderIds);
  const tableIds = new Set(pendingTableIds);
  pendingOrderIds = new Set();
  pendingTableIds = new Set();

  if (orderIds.size === 0 && tableIds.size === 0) {
    clearSnapshot();
    return;
  }

  try {
    await Promise.all([
      orderIds.size > 0 ? persistSettledOrderIds(orderIds) : Promise.resolve(),
      tableIds.size > 0 ? persistSettledTableIds(tableIds) : Promise.resolve(),
    ]);
    clearSnapshot();
  } catch (err) {
    console.error('[SettlementGuard] Flush failed:', err.message);
    // Restore pending sets so the next change or timer will retry.
    orderIds.forEach(id => pendingOrderIds.add(id));
    tableIds.forEach(id => pendingTableIds.add(id));
    writeSnapshot();
  }
}

function scheduleFlush() {
  writeSnapshot();
  if (hasPendingFlush) return;
  hasPendingFlush = true;
  flushTimer = setTimeout(() => {
    flushSettlementGuards().catch(err => console.error('[SettlementGuard] Scheduled flush failed:', err.message));
  }, FLUSH_DELAY_MS);
}

/**
 * Mark an orderId as settled. The change is buffered in memory and flushed
 * to IndexedDB once per burst (debounced) to avoid thrashing during rush hour.
 */
export function markSettledOrder(orderId) {
  pendingOrderIds.add(orderId);
  scheduleFlush();
}

/**
 * Mark a tableId as settled. The change is buffered in memory and flushed
 * to IndexedDB once per burst.
 */
export function markSettledTable(tableId) {
  pendingTableIds.add(tableId);
  scheduleFlush();
}

/**
 * Explicitly flush any pending settlement guards to IndexedDB.
 * Returns a promise that resolves when the flush is complete.
 */
export async function flushSettlementGuards() {
  return doFlush();
}

/**
 * Load persisted settlement guards from IndexedDB, falling back to the
 * in-memory snapshot if the IndexedDB read is empty (e.g., after a crash/kill).
 */
export async function loadSettlementGuards() {
  try {
    const [orderIds, tableIds] = await Promise.all([
      getSettledOrderIds(),
      getSettledTableIds(),
    ]);

    if (orderIds.size === 0 && tableIds.size === 0) {
      // IndexedDB is empty; try the snapshot in case the flush was interrupted.
      const snapshot = safeParseJSON(localStorage.getItem(getSnapshotKey()), {});
      if (Array.isArray(snapshot.orderIds) && Array.isArray(snapshot.tableIds)) {
        return {
          orderIds: new Set(snapshot.orderIds),
          tableIds: new Set(snapshot.tableIds),
        };
      }
    }

    return { orderIds, tableIds };
  } catch (err) {
    console.error('[SettlementGuard] Failed to load guards:', err.message);
    return { orderIds: new Set(), tableIds: new Set() };
  }
}

/**
 * Clear all pending and persisted settlement guards. Used after all pending
 * actions have synced.
 */
export async function clearSettlementGuards() {
  pendingOrderIds = new Set();
  pendingTableIds = new Set();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  hasPendingFlush = false;
  clearSnapshot();
  await Promise.all([
    persistSettledOrderIds(new Set()),
    persistSettledTableIds(new Set()),
  ]);
}
