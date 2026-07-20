// ─────────────────────────────────────────────────────────────────────────────
// Table Sync Service — Real-time table state with Socket.IO sync
// ─────────────────────────────────────────────────────────────────────────────
// Provides a React hook (useTableSync) that maintains real-time table state
// by combining REST API polling with Socket.IO event updates:
//   - Initial fetch from backend on mount
//   - Socket.IO events: table_updated, table_created, table_deleted, order_updated
//   - Recently terminated table tracking (30s grace period to prevent flicker)
//   - Table integrity validation (detects data corruption)
//   - Per-restaurant cache scoping (prevents cross-tenant data leakage)
//   - Legacy cache key cleanup
//
// This is the regular restaurant equivalent of barTableSyncService.js (for bar tables).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../hooks/useSocket";
import { fetchTables, updateTableSession } from "./tableApi";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { validateTableIntegrity } from "../utils/syncInvariant";
import { connectEdgeSocket, disconnectEdgeSocket, onEdgeEvent } from "./edgeSocketService";
import { getTablesCacheKey, LEGACY_UNSCOPED_KEYS } from "../utils/cacheKeys";

// ── Cross-device termination grace window (in-memory, not localStorage) ───────
// When a table is settled/terminated, the server emits "table:terminated" with a
// server-authoritative timestamp. All devices in the outlet receive it and enter
// a 5-second grace window during which stale non-Free events for that table are
// blocked. This prevents flickering during the settlement transition.
//
// Map<tableId, terminatedAtMs>
// Tables are only blocked briefly during settlement, not permanently.
// A table can be re-occupied immediately after settlement.
const terminatedTables = new Map();

function isRecentlyTerminated(tableId) {
  const terminatedAt = terminatedTables.get(tableId);
  if (!terminatedAt) return false;
  // Block for 5 seconds only to prevent flickering during settlement
  return Date.now() - terminatedAt < 5000;
}

function markRecentlyTerminated(tableId) {
  terminatedTables.set(tableId, Date.now());
}

export function clearTerminatedTable(tableId) {
  terminatedTables.delete(tableId);
}

// INVARIANT: A table with dbStatus === 'AVAILABLE' or workflowStatus === 'Free' MUST ALWAYS have kotHistory = [], currentBill = 0, activeOrder = null. No exception.
export const TABLE_STATUS = {
  FREE: "Free",
  OCCUPIED: "Occupied",
  PREPARING: "Preparing",
  READY: "Ready",
  BILLING: "Waiting Bill",
};

function toFrontendStatus(backendStatus) {
  const map = {
    AVAILABLE: "Free",
    OCCUPIED: "Occupied",
    PREPARING: "Preparing",
    READY: "Ready",
    BILLING_REQUESTED: "Waiting Bill",
    BILLING: "Waiting Bill",
    RESERVED: "Reserved",
    CLEANING: "Cleaning",
  };
  return map[backendStatus] || "Free";
}

let _legacyCleanupDone = false;
function readCache() {
  try {
    // Clear contaminated un-scoped legacy caches (once per page load)
    if (!_legacyCleanupDone) {
      LEGACY_UNSCOPED_KEYS.forEach(key => {
        if (key.startsWith('softshape_tables_cache')) localStorage.removeItem(key);
      });
      _legacyCleanupDone = true;
    }
    const raw = localStorage.getItem(getTablesCacheKey());
    const parsed = raw ? JSON.parse(raw) : [];
    // Deduplicate cached tables to prevent duplicate cards on load
    return Array.from(new Map(parsed.map(t => [t.backendId, t])).values());
  } catch {
    return [];
  }
}

function writeCache(tables) {
  try {
    localStorage.setItem(getTablesCacheKey(), JSON.stringify(tables));
    localStorage.setItem(`${getTablesCacheKey()}:ts`, String(Date.now()));
  } catch {
    /* ignore storage failures */
  }
}

let _cacheWriteTimer = null;
let _pendingCacheTables = null;
function writeCacheDebounced(tables) {
  _pendingCacheTables = tables;
  if (_cacheWriteTimer) clearTimeout(_cacheWriteTimer);
  _cacheWriteTimer = setTimeout(() => {
    _cacheWriteTimer = null;
    if (_pendingCacheTables) writeCache(_pendingCacheTables);
  }, 1000);
}

export function getTableCacheAgeMs() {
  try {
    const ts = localStorage.getItem(`${getTablesCacheKey()}:ts`);
    if (!ts) return Infinity;
    return Date.now() - Number(ts);
  } catch {
    return Infinity;
  }
}

function parseDisplayId(number) {
  const match = String(number).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : number;
}

function flattenSections(payload) {
  if (!Array.isArray(payload)) return [];
  if (payload.length > 0 && Array.isArray(payload[0]?.tables)) {
    return payload.flatMap((section) => section.tables || []);
  }
  return payload;
}

function unwrapTableEvent(payload) {
  return payload?.table || payload;
}

function normalizeKots(kots) {
  if (!Array.isArray(kots)) return [];
  return kots.map(kot => ({
    id: String(kot.kotNumber ?? kot.id ?? ''),
    time: kot.createdAt ? new Date(kot.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : null,
    items: (kot.items || []).map(ki => ({
      id: ki.menuItemId || ki.id,
      n: ki.name ?? ki.n,
      p: Number(ki.price ?? ki.p ?? 0),
      q: Number(ki.quantity ?? ki.q ?? 0),
      s: ki.status === 'CANCELLED' ? 'Cancelled' : (ki.s ?? 'KOT Sent'),
      orderItemId: ki.orderItemId,
      notes: ki.notes,
      menuType: ki.menuType || null,
      gstEnabled: ki.gstEnabled ?? null,
    })),
  }));
}

function mapBackendTable(row, existing = null, { keepWorkflowStatus = false } = {}) {
  const incomingTableUpdated = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  const existingTableUpdated = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  const isStale = incomingTableUpdated > 0 && existingTableUpdated > 0 && incomingTableUpdated < existingTableUpdated;

  const dbStatus = isStale && existing ? existing.dbStatus : row.status;
  let persistedStatus = isStale && existing ? existing.status : (row.workflowStatus || toFrontendStatus(dbStatus));

  // Protect "Waiting Bill" status from being downgraded by stale API data.
  // If the existing table is "Waiting Bill" and the incoming status is not Free/AVAILABLE
  // (which would indicate settlement), keep "Waiting Bill" so the table doesn't
  // revert to "Occupied" and lose its billing state.
  if (existing && (existing.status === 'Waiting Bill' || existing.workflowStatus === 'Waiting Bill')) {
    const incomingIsFree = row.status === 'AVAILABLE' || row.status === 'Free' || row.workflowStatus === 'Free';
    if (!incomingIsFree) {
      persistedStatus = 'Waiting Bill';
    }
  }

  const rawIncomingOrder = row.orders?.[0] || row.activeOrder || null;
  // Defensive: an order can only belong to this table if its tableId matches the row id.
  const incomingOrder = rawIncomingOrder && rawIncomingOrder.tableId === row.id ? rawIncomingOrder : null;
  const existingOrder = existing?.activeOrder;
  let activeOrder = incomingOrder;

  if (incomingOrder && existingOrder && incomingOrder.id === existingOrder.id) {
    const incomingUpdated = incomingOrder.updatedAt ? new Date(incomingOrder.updatedAt).getTime() : 0;
    const existingUpdated = existingOrder.updatedAt ? new Date(existingOrder.updatedAt).getTime() : 0;
    const incomingItems = incomingOrder.items || [];
    const existingItems = existingOrder.items || [];

    if (existingUpdated >= incomingUpdated) {
      // Existing is newer or same — keep it.
      // Only use incoming items if existing has none (partial payload fallback).
      if (existingItems.length === 0 && incomingItems.length > 0) {
        activeOrder = { ...existingOrder, items: incomingItems };
      } else {
        activeOrder = existingOrder;
      }
    } else {
      // Incoming is newer — server is authoritative, trust it directly.
      // Only preserve existing items if incoming has none (genuine partial payload).
      // Preserve local cancellations: if an item was locally cancelled but the
      // incoming payload hasn't confirmed the cancel yet, keep it cancelled
      const existingCancelledIds = new Set(
        existingItems.filter(i => i.removedFromBill && i.id).map(i => i.id)
      );
      const preservedIncomingItems = incomingItems.map(incomingItem => {
        if (existingCancelledIds.has(incomingItem.id) && !incomingItem.removedFromBill) {
          return { ...incomingItem, removedFromBill: true, quantity: 0 };
        }
        return incomingItem;
      });
      if (incomingItems.length === 0 && existingItems.length > 0) {
        activeOrder = { ...incomingOrder, items: existingItems };
      } else {
        activeOrder = { ...incomingOrder, items: preservedIncomingItems };
      }
    }
  }

  // Don't fall back to existing activeOrder on partial REST payloads — server is authoritative.
  // If the REST sync omits order data, activeOrder will be null and the next socket event
  // or explicit fetch will populate it. Preserving stale activeOrder risks showing items
  // from a settled order.

  // Ghost detection: if backend claims non-Free but has no billable items, no bill, and no guests,
  // the table is in a corrupt state (active order with zero items after settle/terminate).
  // Force it to Free to prevent stable incorrect display.
  const incomingOrders = Array.isArray(row.orders) ? row.orders : [];
  const incomingItemCount = incomingOrders.reduce((sum, o) => {
    if (!Array.isArray(o?.items)) return sum;
    return sum + o.items.filter(i => !i.removedFromBill && i.quantity > 0).length;
  }, 0);
  const hasNoSession = incomingItemCount === 0 && (row.currentBill ?? 0) === 0 && (row.guests ?? 0) === 0;
  const claimsNonFree = row.workflowStatus !== 'Free' && row.status !== 'Free' && dbStatus !== 'AVAILABLE';
  const isGhost = Array.isArray(row.orders) && claimsNonFree && hasNoSession;
  if (isGhost) {
    console.warn('[TableSync] Normalizing ghost table to Free (no session data) for table', row.number, row.workflowStatus || row.status);
  }

  const isFreeWorkflow = isGhost || row.workflowStatus === 'Free' || row.status === 'Free' || dbStatus === 'AVAILABLE';

  // kotHistory: normalize DB kots relation (authoritative), fall back to legacy kotHistory
  const incomingKot = (Array.isArray(row.kots) && row.kots.length > 0)
    ? normalizeKots(row.kots)
    : (Array.isArray(row.kotHistory)
      ? row.kotHistory.map((kot, ki) => {
          const existingKot = existing?.kotHistory?.[ki];
          return {
            ...kot,
            items: kot.items ? kot.items.map((item, ii) => ({
              ...item,
              orderItemId: existingKot?.items?.[ii]?.orderItemId ?? item.orderItemId,
            })) : [],
          };
        })
      : []);
  const existingKot = existing?.kotHistory ?? [];
  const mergedKotHistory = isFreeWorkflow ? []
    : (incomingKot.length > 0 ? incomingKot : existingKot);

  const base = {
    backendId: row.id,
    id: parseDisplayId(row.number),
    number: row.number,
    dbStatus,
    status: keepWorkflowStatus && existing ? existing.status : persistedStatus,
    capacity: row.capacity,
    sectionId: row.sectionId,
    section: row.section,
    guests: isFreeWorkflow ? 0 : (row.guests ?? 0),
    time: (isFreeWorkflow || !row.sessionStartedAt) ? null : (() => { try { const d = new Date(row.sessionStartedAt); return isNaN(d.getTime()) ? null : d.toISOString(); } catch { return null; } })(),
    captainId: isFreeWorkflow ? null : (row.captainId ?? null),
    kotHistory: mergedKotHistory,
    currentBill: isFreeWorkflow ? 0 : Math.max(row.currentBill ?? 0, activeOrder ? Number(activeOrder.totalAmount ?? 0) : 0),
    activeOrder: isFreeWorkflow ? null : activeOrder,
    discount: isFreeWorkflow ? null : (row.discount != null ? Number(row.discount) : null),
    updatedAt: isStale && existing ? existing.updatedAt : (row.updatedAt || existing?.updatedAt || null),
  };

  return base;
}

function mergeTablesFromApi(apiTables, currentTables) {
  let flat = flattenSections(apiTables);
  
  // Deduplicate API tables by backendId or number to prevent duplicate cards
  const seen = new Map();
  flat = flat.filter(table => {
    const key = table.id || table.number;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
  
  flat = flat.sort((a, b) => Number(a.number) - Number(b.number));

  const merged = flat.map((row) => {
    const existing = currentTables.find((t) => t.backendId === row.id || (row.id.startsWith("local-") && t.number === row.number));
    const after = mapBackendTable(row, existing);
    if (existing) validateTableIntegrity('tableSync.mergeTablesFromApi', existing, after);
    return after;
  });

  // Preserve locally-updated tables that are missing from the API response.
  // This prevents "Waiting Bill" tables from disappearing when the API refetch
  // returns stale data before the billing request is reflected in the backend.
  // Only preserve tables with active state (non-Free with data).
  const apiBackendIds = new Set(flat.map(t => t.id));
  for (const current of currentTables) {
    if (current.backendId && apiBackendIds.has(current.backendId)) continue;
    const isWaitingBill = current.status === 'Waiting Bill' || current.workflowStatus === 'Waiting Bill';
    const hasActiveData = (current.kotHistory?.length > 0) || (current.currentBill ?? 0) > 0 || current.activeOrder;
    if (isWaitingBill || (hasActiveData && current.status !== 'Free' && current.status !== 'AVAILABLE')) {
      merged.push(current);
    }
  }

  return merged;
}

function getFallbackTables() {
  console.warn("[TableSync] Fetch failed or returned empty; showing no tables.");
  return [];
}

function findTableIndex(tables, backendId) {
  return tables.findIndex((t) => t.backendId === backendId);
}

// Server is authoritative — directly use incoming order
function mergeOrder(incoming, existing) {
  return incoming;
}

function mergeOrderItems(existing = [], incoming = []) {
  return incoming;
}

let sharedSocket = null;
let socketRefCount = 0;
let socketListenersAttached = false;
let _persistingCount = 0;
let _lastLocalUpdate = 0;

// Re-fetch callback registered by useTableSync so the reconnect handler
// can call it without a direct import cycle.
let _reconnectRefetch = null;

export function registerReconnectRefetch(fn) {
  _reconnectRefetch = fn;
}

function attachSocketLogging(socket) {
  if (socketListenersAttached) return;
  socketListenersAttached = true;

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket.id);
    socket.emit("join", getCurrentRestaurantId());

    // Re-fetch on every reconnect to recover orders missed during the gap.
    // Skip if local mutations are in-flight to avoid clobbering unsaved changes.
    if (_reconnectRefetch && getCurrentRestaurantId() && localStorage.getItem('ss_token')) {
      if (_persistingCount > 0) {
        console.log(`[Socket] Reconnected but ${_persistingCount} local mutation(s) in-flight — deferring refetch`);
        // Retry refetch after a short delay to let in-flight mutations complete
        setTimeout(() => {
          if (_persistingCount === 0 && _reconnectRefetch) {
            console.log("[Socket] In-flight mutations cleared — refetching tables");
            _reconnectRefetch().catch((err) =>
              console.warn("[Socket] Deferred reconnect refetch failed:", err.message)
            );
          }
        }, 3000);
      } else {
        console.log("[Socket] Reconnected — refetching tables to recover missed events");
        _reconnectRefetch().catch((err) =>
          console.warn("[Socket] Reconnect refetch failed:", err.message)
        );
      }
    }
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.log("[Socket] Connection error:", err.message);
  });
}

function acquireSocket(handlers) {
  const noop = () => { };

  try {
    if (!sharedSocket) {
      sharedSocket = getSocket();
      attachSocketLogging(sharedSocket);
    }

    sharedSocket.emit("join", getCurrentRestaurantId());

    const { onUpdated, onCreated, onDeleted, onOrderCreated, onOrderUpdated, onTerminated } = handlers;
    sharedSocket.on("table:updated", onUpdated);
    sharedSocket.on("table:created", onCreated);
    sharedSocket.on("table:deleted", onDeleted);
    if (onOrderCreated) sharedSocket.on("order:created", onOrderCreated);
    if (onOrderUpdated) sharedSocket.on("order:updated", onOrderUpdated);
    if (onTerminated) sharedSocket.on("table:terminated", onTerminated);
    socketRefCount += 1;

    return () => {
      sharedSocket?.off("table:updated", onUpdated);
      sharedSocket?.off("table:created", onCreated);
      sharedSocket?.off("table:deleted", onDeleted);
      if (onOrderCreated) sharedSocket?.off("order:created", onOrderCreated);
      if (onOrderUpdated) sharedSocket?.off("order:updated", onOrderUpdated);
      if (onTerminated) sharedSocket?.off("table:terminated", onTerminated);
      socketRefCount = Math.max(0, socketRefCount - 1);
    };
  } catch (err) {
    console.error("[TableSync] Socket init failed:", err);
    return noop;
  }
}

async function persistStatusChanges(prevTables, nextTables) {
  const tasks = [];
  const VALID_STATUSES = new Set(["Free","Occupied","Preparing","Ready","Waiting Bill","Reserved","Cleaning"]);

  for (const table of nextTables) {
    if (!table.backendId) continue;

    // Guard: skip persisting session updates for recently terminated tables.
    // A socket event may have briefly revived the table with stale data before
    // the grace window blocked it. Persisting that stale state would re-populate
    // the table with old items on the backend, causing "old items adding to new
    // tables" and "table automatically settling" bugs.
    if (isRecentlyTerminated(table.backendId)) {
      // Only persist if the table is being set to Free (legitimate termination confirm)
      const isFree = table.status === 'Free' || table.status === 'AVAILABLE' || table.workflowStatus === 'Free';
      if (!isFree) {
        console.warn('[TableSync] Skipping persist for recently terminated table', table.number, '— status:', table.status);
        continue;
      }
    }

    const prev = prevTables.find((t) => t.backendId === table.backendId);
    const sessionChanged =
      !prev ||
      table.status !== prev.status ||
      table.captainId !== prev.captainId ||
      table.guests !== prev.guests ||
      table.time !== prev.time ||
      table.currentBill !== prev.currentBill;

    if (sessionChanged) {
      // Ensure status is a valid workflow status string, not a backend enum
      // Backend enum values like "OCCUPIED" need to be converted to "Occupied"
      let statusToSend = table.status;
      if (statusToSend === 'OCCUPIED') statusToSend = 'Occupied';
      else if (statusToSend === 'PREPARING') statusToSend = 'Preparing';
      else if (statusToSend === 'READY') statusToSend = 'Ready';
      else if (statusToSend === 'AVAILABLE') statusToSend = 'Free';
      else if (statusToSend === 'BILLING_REQUESTED') statusToSend = 'Waiting Bill';
      else if (statusToSend === 'BILLING') statusToSend = 'Waiting Bill';
      else if (statusToSend === 'RESERVED') statusToSend = 'Reserved';
      else if (statusToSend === 'CLEANING') statusToSend = 'Cleaning';

      tasks.push(
        updateTableSession(table.backendId, {
          status: statusToSend,
          captainId: table.captainId ?? null,
          guests: table.guests ?? 0,
          time: table.time ?? null,
          currentBill: table.currentBill ?? 0,
        })
          .then((updated) => ({ updated }))
          .catch((err) => {
            console.error(`[TableSync] Failed to persist ${table.number}:`, err);
            return { error: err };
          })
      );
    }
  }

  return Promise.all(tasks);
}

export function useTableSync({ shouldSkipTableUpdate = null } = {}) {
  const [tables, setTablesState] = useState(() => {
    const cached = readCache();
    if (cached.length > 0) {
      return cached.map(t => {
        if (t.status === 'Free' || t.status === 'AVAILABLE' || t.dbStatus === 'AVAILABLE' || t.workflowStatus === 'Free') {
          return { ...t, kotHistory: [], currentBill: 0, activeOrder: null, guests: 0, time: null };
        }
        return t;
      });
    }
    return [];
  });
  const [isSyncing, setIsSyncing] = useState(true);
  const tablesRef = useRef(tables);
  const cancelledRef = useRef(false);
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(false);
  const abortControllerRef = useRef(null);
  const shouldSkipTableUpdateRef = useRef(shouldSkipTableUpdate);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    shouldSkipTableUpdateRef.current = shouldSkipTableUpdate;
  }, [shouldSkipTableUpdate]);

  const loadTables = useCallback(async () => {
    const rid = getCurrentRestaurantId();
    const token = localStorage.getItem('ss_token');
    if (!rid || !token) {
      setIsSyncing(false);
      return;
    }
    // Abort any in-flight fetch instead of silently dropping the user's refresh click.
    if (isFetchingRef.current && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isFetchingRef.current = true;
    abortControllerRef.current = new AbortController();
    cancelledRef.current = false;
    setIsSyncing(true);
    let apiTables = null;

    try {
      apiTables = flattenSections(await fetchTables(rid, abortControllerRef.current.signal));
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.log('[TableSync] Fetch aborted');
      } else {
        console.error("[TableSync] GET /api/tables failed:", err);
      }
    } finally {
      // Always reset the fetching flag so the refresh button works even if
      // the fetch hung and was aborted by a subsequent call.
      isFetchingRef.current = false;
      abortControllerRef.current = null;
    }

    if (!mountedRef.current || cancelledRef.current) {
      return;
    }

    setTablesState((current) => {
      const apiEmpty = !apiTables || !Array.isArray(apiTables) || apiTables.length === 0;
      const occupiedCount = current.filter(t => t.status && t.status !== 'Free' && t.status !== 'AVAILABLE').length;
      if (apiEmpty && occupiedCount > 0) {
        console.warn('[TableSync] Refetch returned empty but local cache has occupied tables; keeping cache to avoid data loss');
        return current;
      }
      const merged = apiEmpty ? [] : mergeTablesFromApi(apiTables, current);
      // Deduplicate by backendId to prevent duplicate cards
      let deduped = Array.from(new Map(merged.map(t => [t.backendId, t])).values());
      // Guard: preserve active table's existing entry during KOT submission to prevent duplicate display
      if (shouldSkipTableUpdate) {
        deduped = deduped.map(t => shouldSkipTableUpdate(t) ? (current.find(c => c.backendId === t.backendId) || t) : t);
      }
      writeCache(deduped);
      return deduped;
    });

    if (mountedRef.current && !cancelledRef.current) setIsSyncing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadTables();
    // Register so the socket reconnect handler can trigger a refetch
    // to recover any orders missed while the socket was down.
    registerReconnectRefetch(loadTables);

    const releaseSocket = acquireSocket({
      onTerminated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== getCurrentRestaurantId()) return;
        if (!payload?.tableId) return;
        // Enter the grace window using the server-authoritative timestamp
        markRecentlyTerminated(payload.tableId);
        // Also dispatch the settled event for UI feedback (same as before)
        const existingTable = tablesRef.current.find(t => t.backendId === payload.tableId);
        window.dispatchEvent(new CustomEvent('table:settled', {
          detail: { tableId: payload.tableId, tableNumber: existingTable?.number }
        }));
      },
      onUpdated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== getCurrentRestaurantId()) return;
        const updatedTable = unwrapTableEvent(payload);
        if (!updatedTable?.id) return;

        // Detect settled/terminated tables and emit clear event to frontend
        const isSettledOrTerminated = updatedTable.status === 'AVAILABLE' || updatedTable.workflowStatus === 'Free' || updatedTable.status === 'TERMINATED';
        const existingTable = tablesRef.current.find(t => t.backendId === updatedTable.id);
        const hadActiveOrder = existingTable?.activeOrder && existingTable.activeOrder.items?.length > 0;
        if (isSettledOrTerminated && hadActiveOrder) {
          // Fallback: if the table:terminated event was missed (e.g. socket not yet
          // connected), mark it here from the table:updated event as a safety net.
          markRecentlyTerminated(updatedTable.id);
          window.dispatchEvent(new CustomEvent('table:settled', {
            detail: { tableId: updatedTable.id, tableNumber: existingTable?.number }
          }));
        }

        setTablesState((prev) => {
          const next = prev.map((t) => {
            if (t.backendId !== updatedTable.id) return t;
            // Guard: skip active table during KOT submission to prevent duplicate items in display
            if (shouldSkipTableUpdate && shouldSkipTableUpdate(t)) return t;
            const incomingIsAvailable = updatedTable.status === 'AVAILABLE' || updatedTable.workflowStatus === 'Free';
            // If this table was recently settled/terminated, block any stale event that would revive it
            if (isRecentlyTerminated(t.backendId) && !incomingIsAvailable) {
              console.warn('[TableSync] Skipping stale non-Free event for recently settled table', t.number);
              return t;
            }
            // Guard: if socket says AVAILABLE but local table has an active order,
            // skip this update — it's a stale/race event. Wait for the correct one.
            // EXCEPTION: if this table was recently terminated, the AVAILABLE update is the
            // legitimate settlement confirmation and must be accepted.
            if (incomingIsAvailable && !isRecentlyTerminated(t.backendId)) {
              // Use tablesRef.current (synchronously updated) instead of prev (pre-commit state)
              // to correctly check if this table was just cleared by terminate/settle.
              const refTable = tablesRef.current.find(rt => rt.backendId === updatedTable.id);
              if (refTable?.activeOrder) {
                console.warn('[TableSync] Skipping stale AVAILABLE event for occupied table', t.number);
                return t;
              }
            }
            const incomingTableUpdated = updatedTable.updatedAt ? new Date(updatedTable.updatedAt).getTime() : 0;
            const existingTableUpdated = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
            if (incomingTableUpdated > 0 && existingTableUpdated > 0 && incomingTableUpdated < existingTableUpdated) {
              console.warn('[TableSync] Skipping stale table:updated event for', t.number, { incoming: incomingTableUpdated, existing: existingTableUpdated });
              return t;
            }
            // Safety: skip ghost occupied/preparing events (claims occupied but has no
            // active session data — no orders, no bill, no guests). Such an event carries
            // no real session and is a stale rebroadcast; accepting it flips the card back
            // to Occupied/Preparing and causes flicker. Skip regardless of the current
            // local status so an already-flipped ghost state cannot keep ping-ponging.
            // Count actual live items across all incoming orders. A stale/ghost event
            // often carries an order object whose items array is empty (order was settled
            // or all items removed), so orders.length alone is not a reliable session signal.
            const incomingOrders = Array.isArray(updatedTable.orders) ? updatedTable.orders : [];
            const incomingItemCount = incomingOrders.reduce((sum, o) => {
              if (!Array.isArray(o?.items)) return sum;
              return sum + o.items.filter(i => !i.removedFromBill && i.quantity > 0).length;
            }, 0);
            const hasNoSession = incomingItemCount === 0 && (updatedTable.currentBill ?? 0) === 0 && (updatedTable.guests ?? 0) === 0;
            // Any non-Free claim (Occupied / Preparing / Confirmed / Ready / Waiting Bill)
            // is contradictory when the table carries no billable items, no bill and no
            // guests — a genuinely active table always has at least one billable item.
            // These are stale/corrupt rebroadcasts (e.g. an order left in an active status
            // with all items removed after settle/terminate) and must never flip the card.
            const claimsNonFree = !incomingIsAvailable;
            if (claimsNonFree && hasNoSession) {
              console.warn('[TableSync] Skipping ghost non-Free event (no session data) for table', t.number, updatedTable.workflowStatus || updatedTable.status);
              return t;
            }
            const before = t;
            const after = mapBackendTable(updatedTable, t);
            validateTableIntegrity('tableSync', before, after);
            return after;
          });
          writeCacheDebounced(next);
          return next;
        });
      },
      onCreated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== getCurrentRestaurantId()) return;
        const newTable = unwrapTableEvent(payload);
        if (!newTable?.id) return;

        setTablesState((prev) => {
          if (findTableIndex(prev, newTable.id) !== -1) return prev;
          const next = [...prev, mapBackendTable(newTable)];
          // Deduplicate by backendId to prevent duplicate cards
          const deduped = Array.from(new Map(next.map(t => [t.backendId, t])).values());
          writeCacheDebounced(deduped);
          return deduped;
        });
      },
      onDeleted: ({ id, restaurantId }) => {
        if (restaurantId && restaurantId !== getCurrentRestaurantId()) return;
        setTablesState((prev) => {
          const next = prev.filter((t) => t.backendId !== id);
          writeCacheDebounced(next);
          return next;
        });
      },
      onOrderCreated: (payload) => {
        const order = payload?.order || payload;
        if (!order?.tableId) return;
        if (isRecentlyTerminated(order.tableId)) return;
        setTablesState((prev) => {
          const next = prev.map((t) => {
            if (t.backendId !== order.tableId) return t;
            if (shouldSkipTableUpdate && shouldSkipTableUpdate(t)) return t;
            const hasItems = (order.items || []).length > 0;
            if ((t.dbStatus === 'AVAILABLE' || t.status === 'Free' || t.workflowStatus === 'Free') && !hasItems) {
              console.warn('[TableSync] Ignoring stale order:created (no items) for settled table', t.number);
              return t;
            }
            return {
              ...t,
              status: t.status === 'Free' ? 'Occupied' : t.status,
              workflowStatus: t.workflowStatus === 'Free' ? 'Occupied' : t.workflowStatus,
              activeOrder: mergeOrder(order, t.activeOrder),
              items: mergeOrderItems(t.items || [], order.items || []),
              currentBill: Math.max(Number(t.currentBill ?? 0), Number(order.totalAmount ?? 0)),
            };
          });
          writeCacheDebounced(next);
          return next;
        });
      },
      onOrderUpdated: (payload) => {
        const order = payload?.order || payload;
        if (!order?.tableId) return;
        if (isRecentlyTerminated(order.tableId)) return;
        setTablesState((prev) => {
          const next = prev.map((t) => {
            if (t.backendId !== order.tableId) return t;
            if (shouldSkipTableUpdate && shouldSkipTableUpdate(t)) return t;
            const hasItems = (order.items || []).length > 0;
            if ((t.dbStatus === 'AVAILABLE' || t.status === 'Free' || t.workflowStatus === 'Free') && !hasItems) {
              console.warn('[TableSync] Ignoring stale order:updated (no items) for settled table', t.number);
              return t;
            }
            return {
              ...t,
              status: t.status === 'Free' ? 'Occupied' : t.status,
              workflowStatus: t.workflowStatus === 'Free' ? 'Occupied' : t.workflowStatus,
              activeOrder: mergeOrder(order, t.activeOrder),
              items: mergeOrderItems(t.items || [], order.items || []),
              currentBill: Number(order.totalAmount ?? t.currentBill ?? 0),
            };
          });
          writeCacheDebounced(next);
          return next;
        });
      },
    });

    // ── Edge WebSocket: connect for LAN real-time updates (Bug 2 fix) ────────
    // The edge server broadcasts order/table events over WebSocket to all
    // LAN clients. We connect and listen for events — on any event, we
    // trigger a debounced refetch to pull the updated state from the edge.
    connectEdgeSocket();
    let edgeDebounceTimer = null;
    const edgeUnsub = onEdgeEvent((type, data) => {
      if (edgeDebounceTimer) clearTimeout(edgeDebounceTimer);
      edgeDebounceTimer = setTimeout(() => {
        edgeDebounceTimer = null;
        if (mountedRef.current && !cancelledRef.current) {
          loadTables();
        }
      }, 300);
    });

    // On edge reconnect, do an immediate full refresh (non-debounced) to
    // catch up on any order/table events missed during the disconnect.
    const handleEdgeReconnect = () => {
      if (mountedRef.current && !cancelledRef.current) {
        loadTables();
      }
    };
    window.addEventListener('edge:reconnect', handleEdgeReconnect);

    // Periodic edge refresh: every 60 seconds, trigger a loadTables() call
    // to catch any missed edge events (WebSocket dropped, event lost, etc).
    // This is a safety net — the real-time WebSocket + reconnect refresh
    // handle the common cases, but periodic polling ensures correctness
    // even if an event is silently dropped.
    const EDGE_POLL_INTERVAL_MS = 60_000;
    const edgePollTimer = setInterval(() => {
      if (mountedRef.current && !cancelledRef.current) {
        loadTables();
      }
    }, EDGE_POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
      releaseSocket();
      clearInterval(edgePollTimer);
      window.removeEventListener('edge:reconnect', handleEdgeReconnect);
      // Disconnect edge socket when no more table sync instances are active
      disconnectEdgeSocket();
      if (edgeUnsub) edgeUnsub();
    };
  }, [loadTables]);

  const setTables = useCallback((updater, { skipPersist = false } = {}) => {
    const current = tablesRef.current ?? [];
    const next = typeof updater === "function" ? updater(current) : updater;

    // Deduplicate by backendId to prevent duplicate cards
    const deduped = Array.from(new Map(next.map(t => [t.backendId, t])).values());

    writeCacheDebounced(deduped);
    tablesRef.current = deduped;
    setTablesState(deduped);

    if (!skipPersist) {
      _persistingCount += 1;
      _lastLocalUpdate = Date.now();
      persistStatusChanges(current, deduped).then((results) => {
        _persistingCount = Math.max(0, _persistingCount - 1);
        if (!results.length) return;
        setTablesState((latest) => {
          let updated = latest;
          for (const result of results) {
            if (!result.updated) continue;
            const idx = findTableIndex(updated, result.updated.id);
            if (idx === -1) continue;
            const copy = [...updated];
            const existing = copy[idx];

            // Guard: skip persisting for the active table when the consumer explicitly
            // asks us to (e.g. during KOT submission). Applying a partial response here can
            // overwrite optimistic state and cause ghost items or flicker.
            if (shouldSkipTableUpdateRef.current && shouldSkipTableUpdateRef.current(existing)) {
              continue;
            }

            // If the PATCH response includes the full order/kot data, use the server-
            // authoritative mapBackendTable. If it doesn't (partial response), only merge
            // top-level session fields so we don't ghost-detect and wipe activeOrder/kotHistory.
            if (result.updated.orders || result.updated.activeOrder) {
              copy[idx] = mapBackendTable(result.updated, existing, { keepWorkflowStatus: true });
            } else {
              const { orders, activeOrder, kotHistory, ...sessionFields } = result.updated;
              copy[idx] = { ...existing, ...sessionFields };
            }
            updated = copy;
          }
          // Deduplicate after persisting changes
          const finalDeduped = Array.from(new Map(updated.map(t => [t.backendId, t])).values());
          writeCacheDebounced(finalDeduped);
          // Keep the synchronously-read ref in sync with committed state so that
          // subsequent socket-event guards (e.g. stale AVAILABLE check) read fresh data.
          tablesRef.current = finalDeduped;
          return finalDeduped;
        });
      });
    }
  }, []);

  return {
    tables: tables ?? [],
    setTables,
    isSyncing,
    TABLE_STATUS,
    refetch: loadTables,
  };
}
