// ─────────────────────────────────────────────────────────────────────────────
// Bar Table Sync Service — Real-time bar table state with Socket.IO sync
// ─────────────────────────────────────────────────────────────────────────────
// Provides a React hook (useBarTableSync) that maintains real-time bar table
// state by combining REST API polling with Socket.IO event updates:
//   - Initial fetch from backend on mount
//   - Socket.IO events: table_updated, table_created, table_deleted, order_updated
//   - Recently terminated table tracking (30s grace period to prevent flicker)
//   - Table integrity validation (detects data corruption)
//   - Per-restaurant cache scoping (prevents cross-tenant data leakage)
//   - Legacy cache key cleanup
//
// This is the bar equivalent of tableSyncService.js (for regular restaurant tables).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../hooks/useSocket";
import { fetchBarTables, updateBarTableSession } from "./barTableApi";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { validateTableIntegrity } from "../utils/syncInvariant";
import { getBarTablesCacheKey, getRecentlyTerminatedKey, LEGACY_UNSCOPED_KEYS } from "../utils/cacheKeys";

// Check if a table was recently terminated (within 30s) to prevent UI flicker
// when a table is deleted and immediately recreated
function isRecentlyTerminated(tableId) {
  try {
    const raw = localStorage.getItem(getRecentlyTerminatedKey());
    const map = raw ? JSON.parse(raw) : {};
    const ts = map[tableId];
    return ts && Date.now() - ts < 30000; // 30 seconds — same as VenueSectionView
  } catch { return false; }
}

// Mark a table as recently terminated in localStorage so all tabs/devices share the guard
function markRecentlyTerminated(tableId) {
  try {
    const key = getRecentlyTerminatedKey();
    const raw = localStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : {};
    map[tableId] = Date.now();
    localStorage.setItem(key, JSON.stringify(map));
  } catch { /* ignore */ }
}

let _persistingCount = 0;
let _lastLocalUpdate = 0;

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
    BILLING_REQUESTED: "Waiting Bill",
    RESERVED: "Reserved",
    CLEANING: "Cleaning",
  };
  return map[backendStatus] || "Free";
}

function readCache() {
  try {
    // Evict stale caches that may contain local-N fake IDs
    LEGACY_UNSCOPED_KEYS.forEach(k => {
      if (k.startsWith('softshape_bar_tables_cache')) localStorage.removeItem(k);
    });
    const raw = localStorage.getItem(getBarTablesCacheKey());
    const parsed = raw ? JSON.parse(raw) : [];
    // Drop any local-N entries that slipped through, then deduplicate by backendId
    const clean = parsed.filter(t => t.backendId && !String(t.backendId).startsWith('local-'));
    return Array.from(new Map(clean.map(t => [t.backendId, t])).values());
  } catch {
    return [];
  }
}

function writeCache(tables) {
  try {
    localStorage.setItem(getBarTablesCacheKey(), JSON.stringify(tables));
  } catch {
    /* ignore storage failures */
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

// Server is now authoritative — no merging needed.
// The backend filters removedFromBill and quantity <= 0 items in tableInclude,
// so incoming data is clean and complete.
function mergeOrderItems(existing = [], incoming = []) {
  return incoming;
}

// Server is authoritative — directly use incoming order
function mergeOrder(incoming, existing) {
  return incoming;
}

function mapBackendTable(row, existing = null, { keepWorkflowStatus = false } = {}) {
  // Staleness guard: if existing has a newer updatedAt, keep existing status/currentBill
  const incomingTableUpdated = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  const existingTableUpdated = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  const isStale = incomingTableUpdated > 0 && existingTableUpdated > 0 && incomingTableUpdated < existingTableUpdated;

  const dbStatus = isStale && existing ? existing.dbStatus : row.status;
  const isFreeWorkflow = dbStatus === 'AVAILABLE' || row.workflowStatus === 'Free' || row.status === 'Free';
  const persistedStatus = isStale && existing ? existing.status : (row.workflowStatus || toFrontendStatus(dbStatus));
  const mergedKotHistory = Array.isArray(row.kots) ? row.kots : (Array.isArray(row.kotHistory) ? row.kotHistory : []);

  const rawIncomingOrder = row.orders?.[0] || row.activeOrder || null;
  // Defensive: an order can only belong to this table if its tableId matches the row id.
  const incomingOrder = rawIncomingOrder && rawIncomingOrder.tableId === row.id ? rawIncomingOrder : null;
  const existingOrder = existing?.activeOrder;
  let activeOrder = incomingOrder;
  // Server is authoritative — directly use incoming items (no merge)
  if (incomingOrder && existingOrder && incomingOrder.id === existingOrder.id) {
    const incomingUpdated = incomingOrder.updatedAt ? new Date(incomingOrder.updatedAt).getTime() : 0;
    const existingUpdated = existingOrder.updatedAt ? new Date(existingOrder.updatedAt).getTime() : 0;
    if (existingUpdated >= incomingUpdated) {
      // Existing is newer — keep it
      activeOrder = existingOrder;
    } else {
      // Incoming is newer — use it directly
      activeOrder = incomingOrder;
    }
  }
  // Preserve existing items if incoming has none (partial socket payloads)
  if (incomingOrder && existingOrder && (!incomingOrder.items || incomingOrder.items.length === 0) && existingOrder.items?.length > 0) {
    activeOrder = { ...incomingOrder, items: existingOrder.items };
  }
  // Fall back to existing if no incoming order and table is not free
  if (!activeOrder && existingOrder && row.status !== 'AVAILABLE') {
    activeOrder = existingOrder;
  }

  const base = {
    backendId: row.id,
    id: parseDisplayId(row.number),
    number: row.number,
    dbStatus,
    status: (keepWorkflowStatus || _persistingCount > 0) && existing ? existing.status : persistedStatus,
    capacity: row.capacity,
    sectionId: row.sectionId,
    section: row.section,
    guests: _persistingCount > 0 && existing ? existing.guests : (row.guests ?? 0),
    time: _persistingCount > 0 && existing ? existing.time : (row.sessionStartedAt ? (() => { try { const d = new Date(row.sessionStartedAt); return isNaN(d.getTime()) ? null : d.toISOString(); } catch { return null; } })() : null),
    captainId: _persistingCount > 0 && existing ? existing.captainId : (row.captainId ?? null),
    kotHistory: (() => {
      if (isFreeWorkflow) return [];
      // Server is authoritative — use kots relation if available, fall back to kotHistory
      const inc = Array.isArray(row.kots) ? row.kots : (Array.isArray(row.kotHistory) ? row.kotHistory : []);
      return inc;
    })(),
    currentBill: isFreeWorkflow ? 0 : (isStale && existing ? existing.currentBill : (row.currentBill ?? existing?.currentBill ?? 0)),
    updatedAt: row.updatedAt || existing?.updatedAt || null,
    activeOrder: isFreeWorkflow ? null : activeOrder,
  };

  return base;
}

function mergeTablesFromApi(apiTables, currentTables) {
  let flat = flattenSections(apiTables);

  // Deduplicate by real DB id (not by number — numbers repeat across sections)
  const seen = new Set();
  flat = flat.filter(table => {
    if (!table.id || seen.has(table.id)) return false;
    seen.add(table.id);
    return true;
  });

  // Sort by section then number for stable display order
  flat.sort((a, b) => {
    const sA = a.sectionId || '';
    const sB = b.sectionId || '';
    if (sA !== sB) return sA.localeCompare(sB);
    return Number(a.number) - Number(b.number);
  });

  return flat.map((row) => {
    const existing = currentTables.find((t) => t.backendId === row.id);
    return mapBackendTable(row, existing);
  });
}

function findTableIndex(tables, backendId) {
  return tables.findIndex((t) => t.backendId === backendId);
}

let sharedSocket = null;
let socketRefCount = 0;
let socketListenersAttached = false;

function attachSocketLogging(socket) {
  if (socketListenersAttached) return;
  socketListenersAttached = true;

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket.id);
    socket.emit("join", getCurrentRestaurantId());
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

    const { onUpdated, onCreated, onDeleted, onOrderCreated, onOrderUpdated } = handlers;
    sharedSocket.on("table:updated", onUpdated);
    sharedSocket.on("table:created", onCreated);
    sharedSocket.on("table:deleted", onDeleted);
    if (onOrderCreated) sharedSocket.on("order:created", onOrderCreated);
    if (onOrderUpdated) sharedSocket.on("order:updated", onOrderUpdated);
    socketRefCount += 1;

    return () => {
      sharedSocket?.off("table:updated", onUpdated);
      sharedSocket?.off("table:created", onCreated);
      sharedSocket?.off("table:deleted", onDeleted);
      if (onOrderCreated) sharedSocket?.off("order:created", onOrderCreated);
      if (onOrderUpdated) sharedSocket?.off("order:updated", onOrderUpdated);
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
      else if (statusToSend === 'AVAILABLE') statusToSend = 'Free';
      else if (statusToSend === 'BILLING_REQUESTED') statusToSend = 'Waiting Bill';
      else if (statusToSend === 'RESERVED') statusToSend = 'Reserved';
      else if (statusToSend === 'CLEANING') statusToSend = 'Cleaning';

      tasks.push(
        updateBarTableSession(table.backendId, {
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

  if (tasks.length > 0) {
    _persistingCount++;
    return Promise.all(tasks).finally(() => {
      _persistingCount = Math.max(0, _persistingCount - 1);
    });
  }
  return [];
}

export function useBarTableSync({ shouldSkipTableUpdate = null } = {}) {
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
    return []; // No local fakes — wait for real API data
  });
  const [isSyncing, setIsSyncing] = useState(() => readCache().length === 0);
  const tablesRef = useRef(tables);
  const cancelledRef = useRef(false);
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(false);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const loadTables = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log('[BarTableSync] Fetch already in progress, skipping');
      return;
    }
    isFetchingRef.current = true;
    abortControllerRef.current = new AbortController();
    cancelledRef.current = false;
    setIsSyncing(true);
    const thisFetchStartedAt = Date.now();
    let apiTables = null;

    try {
      apiTables = flattenSections(await fetchBarTables(abortControllerRef.current.signal));
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.log('[BarTableSync] Fetch aborted');
      } else {
        console.error("[BarTableSync] GET /api/tables failed:", err);
      }
    }

    if (!mountedRef.current || cancelledRef.current) {
      isFetchingRef.current = false;
      abortControllerRef.current = null;
      return;
    }

    if (!apiTables || !Array.isArray(apiTables) || apiTables.length === 0) {
      console.warn('[BarTableSync] API returned no tables — keeping current state, not injecting local fakes');
      // Retry once after 1500ms in case the socket race caused an empty response
      setTimeout(() => {
        if (!mountedRef.current || cancelledRef.current) return;
        fetchBarTables()
          .then(retryData => {
            if (!mountedRef.current || cancelledRef.current) return;
            const retryFlat = flattenSections(retryData);
            if (retryFlat.length > 0) {
              setTablesState((current) => {
                const merged = mergeTablesFromApi(retryFlat, current);
                const deduped = Array.from(new Map(merged.map(t => [t.backendId, t])).values());
                writeCache(deduped);
                return deduped;
              });
            }
          })
          .catch(err => console.warn('[BarTableSync] Retry fetch failed:', err.message));
      }, 1500);
      isFetchingRef.current = false;
      abortControllerRef.current = null;
      if (mountedRef.current && !cancelledRef.current) setIsSyncing(false);
      return;
    }

    setTablesState((current) => {
      const merged = mergeTablesFromApi(apiTables, current).map((row) => {
        const existing = current.find(t => t.backendId === row.backendId);
        if (existing && existing.lastUpdatedAt && existing.lastUpdatedAt > thisFetchStartedAt) {
          return existing;
        }
        return row;
      });
      // Deduplicate by backendId to prevent duplicate cards
      let deduped = Array.from(new Map(merged.map(t => [t.backendId, t])).values());
      // Guard: preserve active table's existing entry during KOT submission to prevent duplicate display
      if (shouldSkipTableUpdate) {
        deduped = deduped.map(t => shouldSkipTableUpdate(t) ? (current.find(c => c.backendId === t.backendId) || t) : t);
      }
      writeCache(deduped);
      return deduped;
    });

    isFetchingRef.current = false;
    abortControllerRef.current = null;
    if (mountedRef.current && !cancelledRef.current) setIsSyncing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadTables();

    const releaseSocket = acquireSocket({
      onUpdated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== getCurrentRestaurantId()) return;
        const updatedTable = unwrapTableEvent(payload);
        if (!updatedTable?.id) return;

        // Detect settled/terminated tables and emit clear event to frontend
        const isSettledOrTerminated = updatedTable.status === 'AVAILABLE' || updatedTable.workflowStatus === 'Free' || updatedTable.status === 'TERMINATED';
        const existingTable = tablesRef.current.find(t => t.backendId === updatedTable.id);
        const hadActiveOrder = existingTable?.activeOrder && existingTable.activeOrder.items?.length > 0;
        if (isSettledOrTerminated && hadActiveOrder) {
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
              console.warn('[BarTableSync] Skipping stale non-Free event for recently settled table', t.number);
              return t;
            }
            // Guard: if socket says AVAILABLE but local table has an active order,
            // skip this update — it's a stale/race event. Wait for the correct one.
            // EXCEPTION: if this table was recently terminated, the AVAILABLE update is the
            // legitimate settlement confirmation and must be accepted.
            if (incomingIsAvailable && !isRecentlyTerminated(t.backendId)) {
              // Use tablesRef.current (synchronously updated) instead of prev (pre-commit state)
              // to correctly check if this table was just cleared by terminate/settle
              const refTable = tablesRef.current.find(rt => rt.backendId === updatedTable.id);
              if (refTable?.activeOrder) {
                console.warn('[BarTableSync] Skipping stale AVAILABLE event for occupied table', t.number);
                return t;
              }
            }
            const before = t;
            const after = mapBackendTable(updatedTable, t);
            after.lastUpdatedAt = Date.now();
            validateTableIntegrity('barTableSync', before, after);
            return after;
          });
          writeCache(next);
          return next;
        });
      },
      onCreated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== getCurrentRestaurantId()) return;
        const newTable = unwrapTableEvent(payload);
        if (!newTable?.id) return;

        setTablesState((prev) => {
          if (findTableIndex(prev, newTable.id) !== -1) return prev;
          const after = mapBackendTable(newTable);
          after.lastUpdatedAt = Date.now();
          const next = [...prev, after];
          // Deduplicate by backendId to prevent duplicate cards
          const deduped = Array.from(new Map(next.map(t => [t.backendId, t])).values());
          writeCache(deduped);
          return deduped;
        });
      },
      onDeleted: ({ id, restaurantId }) => {
        if (restaurantId && restaurantId !== getCurrentRestaurantId()) return;
        setTablesState((prev) => {
          const next = prev.filter((t) => t.backendId !== id);
          writeCache(next);
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
            // Guard: skip active table during KOT submission to prevent duplicate items in display
            if (shouldSkipTableUpdate && shouldSkipTableUpdate(t)) return t;
            return {
              ...t,
              status: t.status === 'Free' ? 'Occupied' : t.status,
              workflowStatus: t.status === 'Free' ? 'Occupied' : t.workflowStatus,
              activeOrder: mergeOrder(order, t.activeOrder),
              items: mergeOrderItems(t.items || [], order.items || []),
              currentBill: Math.max(Number(t.currentBill ?? 0), Number(order.totalAmount ?? 0)),
              lastUpdatedAt: Date.now(),
            };
          });
          writeCache(next);
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
            // Guard: skip active table during KOT submission to prevent duplicate items in display
            if (shouldSkipTableUpdate && shouldSkipTableUpdate(t)) return t;
            if (t.dbStatus === 'AVAILABLE' || t.status === 'Free' || t.workflowStatus === 'Free') {
              console.warn('[BarTableSync] Ignoring stale order:updated for settled table', t.number);
              return t;
            }
            return {
              ...t,
              activeOrder: mergeOrder(order, t.activeOrder),
              items: mergeOrderItems(t.items || [], order.items || []),
              currentBill: Number(order.totalAmount ?? t.currentBill ?? 0),
              lastUpdatedAt: Date.now(),
            };
          });
          writeCache(next);
          return next;
        });
      },
    });

    // Re-fetch on every reconnect to recover orders missed during the gap.
    const socket = getSocket();
    const onReconnect = () => {
      console.log("[BarTableSync] Socket reconnected — refetching tables to recover missed events");
      loadTables().catch((err) =>
        console.warn("[BarTableSync] Reconnect refetch failed:", err.message)
      );
    };
    socket.on("connect", onReconnect);

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
      releaseSocket();
      socket.off("connect", onReconnect);
    };
  }, [loadTables]);

  const setTables = useCallback((updater, { skipPersist = false } = {}) => {
    const current = tablesRef.current ?? [];
    const next = typeof updater === "function" ? updater(current) : updater;

    // Deduplicate by backendId to prevent duplicate cards
    const deduped = Array.from(new Map(next.map(t => [t.backendId, t])).values());

    writeCache(deduped);
    tablesRef.current = deduped;
    setTablesState(deduped);

    _lastLocalUpdate = Date.now();

    if (!skipPersist) {
      persistStatusChanges(current, deduped).then((results) => {
        if (!results || !results.length) return;

        _lastLocalUpdate = Date.now();
        setTablesState((latest) => {
          let updated = latest;
          for (const result of results) {
            if (!result.updated) continue;
            const idx = findTableIndex(updated, result.updated.id);
            if (idx === -1) continue;
            const copy = [...updated];
            copy[idx] = mapBackendTable(result.updated, copy[idx], {
              keepWorkflowStatus: true,
            });
            updated = copy;
          }
          // Deduplicate after persisting changes
          const finalDeduped = Array.from(new Map(updated.map(t => [t.backendId, t])).values());
          writeCache(finalDeduped);
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
