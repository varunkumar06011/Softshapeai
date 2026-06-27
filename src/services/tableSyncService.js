import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../hooks/useSocket";
import { fetchTables, updateTableSession } from "./tableApi";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { validateTableIntegrity } from "../utils/syncInvariant";
import { getTablesCacheKey, getRecentlyTerminatedKey, LEGACY_UNSCOPED_KEYS } from "../utils/cacheKeys";



function isRecentlyTerminated(tableId) {
  try {
    const raw = localStorage.getItem(getRecentlyTerminatedKey());
    const map = raw ? JSON.parse(raw) : {};
    const ts = map[tableId];
    return ts && Date.now() - ts < 30000; // 30 seconds — same as VenueSectionView
  } catch { return false; }
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
    BILLING_REQUESTED: "Waiting Bill",
    RESERVED: "Reserved",
    CLEANING: "Cleaning",
  };
  return map[backendStatus] || "Free";
}

function readCache() {
  try {
    // Clear contaminated un-scoped legacy caches
    LEGACY_UNSCOPED_KEYS.forEach(key => {
      if (key.startsWith('softshape_tables_cache')) localStorage.removeItem(key);
    });
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

function mapBackendTable(row, existing = null, { keepWorkflowStatus = false } = {}) {
  const dbStatus = row.status;
  const persistedStatus = row.workflowStatus || toFrontendStatus(dbStatus);

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
      // Existing is newer or same — keep existing but merge in any incoming items
      // that incoming has and existing does not (additive merge, never drop)
      const existingIds = new Set(existingItems.map(i => i.id).filter(Boolean));
      const newFromIncoming = incomingItems.filter(i => i.id && !existingIds.has(i.id));
      activeOrder = {
        ...existingOrder,
        items: [...existingItems, ...newFromIncoming],
      };
    } else {
      // Incoming is newer — use it but keep any existing items not in incoming
      // (prevents item loss if incoming is a partial response)
      const incomingIds = new Set(incomingItems.map(i => i.id).filter(Boolean));
      const missingFromIncoming = existingItems.filter(
        i => i.id && !incomingIds.has(i.id) && !i.removedFromBill
      );
      activeOrder = {
        ...incomingOrder,
        items: [...incomingItems, ...missingFromIncoming],
      };
    }
  }

  // Fall back to existing if no incoming order and table is not free (prevents wipe on partial payloads)
  const isFreeWorkflow = row.workflowStatus === 'Free' || row.status === 'Free' || dbStatus === 'AVAILABLE';
  if (!activeOrder && existing?.activeOrder && !isFreeWorkflow) {
    activeOrder = existing.activeOrder;
  }

  // kotHistory: keep whichever has more entries (incoming payloads can be partial)
  const incomingKot = Array.isArray(row.kotHistory)
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
    : [];
  const existingKot = existing?.kotHistory ?? [];
  const mergedKotHistory = isFreeWorkflow ? []
    : (incomingKot.length >= existingKot.length ? incomingKot : existingKot);

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

  return flat.map((row) => {
    const existing = currentTables.find((t) => t.backendId === row.id || (row.id.startsWith("local-") && t.number === row.number));
    const after = mapBackendTable(row, existing);
    if (existing) validateTableIntegrity('tableSync.mergeTablesFromApi', existing, after);
    return after;
  });
}

function getFallbackTables() {
  console.warn("[TableSync] Fetch failed or returned empty; showing no tables.");
  return [];
}

function findTableIndex(tables, backendId) {
  return tables.findIndex((t) => t.backendId === backendId);
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
    if (_reconnectRefetch) {
      console.log("[Socket] Reconnected — refetching tables to recover missed events");
      _reconnectRefetch().catch((err) =>
        console.warn("[Socket] Reconnect refetch failed:", err.message)
      );
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

    const { onUpdated, onCreated, onDeleted } = handlers;
    sharedSocket.on("table:updated", onUpdated);
    sharedSocket.on("table:created", onCreated);
    sharedSocket.on("table:deleted", onDeleted);
    socketRefCount += 1;

    return () => {
      sharedSocket?.off("table:updated", onUpdated);
      sharedSocket?.off("table:created", onCreated);
      sharedSocket?.off("table:deleted", onDeleted);
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

export function useTableSync() {
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

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const loadTables = useCallback(async () => {
    if (isFetchingRef.current) {
      console.log('[TableSync] Fetch already in progress, skipping');
      return;
    }
    isFetchingRef.current = true;
    abortControllerRef.current = new AbortController();
    cancelledRef.current = false;
    setIsSyncing(true);
    let apiTables = null;

    try {
      apiTables = flattenSections(await fetchTables(getCurrentRestaurantId(), abortControllerRef.current.signal));
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.log('[TableSync] Fetch aborted');
      } else {
        console.error("[TableSync] GET /api/tables failed:", err);
      }
    }

    if (!mountedRef.current || cancelledRef.current) {
      isFetchingRef.current = false;
      abortControllerRef.current = null;
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
      const deduped = Array.from(new Map(merged.map(t => [t.backendId, t])).values());
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
    // Register so the socket reconnect handler can trigger a refetch
    // to recover any orders missed while the socket was down.
    registerReconnectRefetch(loadTables);

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
          window.dispatchEvent(new CustomEvent('table:settled', {
            detail: { tableId: updatedTable.id, tableNumber: existingTable?.number }
          }));
        }

        setTablesState((prev) => {
          const next = prev.map((t) => {
            if (t.backendId !== updatedTable.id) return t;
            // Guard: if socket says AVAILABLE but local table has an active order,
            // skip this update — it's a stale/race event. Wait for the correct one.
            // EXCEPTION: if this table was recently terminated, the AVAILABLE update is the
            // legitimate settlement confirmation and must be accepted.
            const incomingIsAvailable = updatedTable.status === 'AVAILABLE' || updatedTable.workflowStatus === 'Free';
            if (incomingIsAvailable && t.activeOrder && !isRecentlyTerminated(t.backendId)) {
              console.warn('[TableSync] Skipping stale AVAILABLE event for occupied table', t.number);
              return t;
            }
            const before = t;
            const after = mapBackendTable(updatedTable, t);
            validateTableIntegrity('tableSync', before, after);
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
          const next = [...prev, mapBackendTable(newTable)];
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
    });

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
      releaseSocket();
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
            copy[idx] = mapBackendTable(result.updated, copy[idx], {
              keepWorkflowStatus: true,
            });
            updated = copy;
          }
          // Deduplicate after persisting changes
          const finalDeduped = Array.from(new Map(updated.map(t => [t.backendId, t])).values());
          writeCache(finalDeduped);
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
