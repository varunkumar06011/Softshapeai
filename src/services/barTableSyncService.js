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
import { getBarTablesCacheKey, LEGACY_UNSCOPED_KEYS } from "../utils/cacheKeys";
import { connectEdgeSocket, disconnectEdgeSocket, onEdgeEvent } from "./edgeSocketService";

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
    // Evict stale caches that may contain local-N fake IDs (once per page load)
    if (!_legacyCleanupDone) {
      LEGACY_UNSCOPED_KEYS.forEach(k => {
        if (k.startsWith('softshape_bar_tables_cache')) localStorage.removeItem(k);
      });
      _legacyCleanupDone = true;
    }
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

// Convert DB kots relation (from tableInclude) to frontend kotHistory format
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
    })),
  }));
}

function mapBackendTable(row, existing = null, { keepWorkflowStatus = false } = {}) {
  // Staleness guard: if existing has a newer updatedAt, keep existing status/currentBill
  const incomingTableUpdated = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  const existingTableUpdated = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  const isStale = incomingTableUpdated > 0 && existingTableUpdated > 0 && incomingTableUpdated < existingTableUpdated;

  const dbStatus = isStale && existing ? existing.dbStatus : row.status;
  const persistedStatus = isStale && existing ? existing.status : (row.workflowStatus || toFrontendStatus(dbStatus));
  const mergedKotHistory = (Array.isArray(row.kots) && row.kots.length > 0) ? normalizeKots(row.kots) : (Array.isArray(row.kotHistory) ? row.kotHistory : []);

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
  const isGhost = claimsNonFree && hasNoSession;
  if (isGhost) {
    console.warn('[BarTableSync] Normalizing ghost table to Free (no session data) for table', row.number, row.workflowStatus || row.status);
  }

  const isFreeWorkflow = isGhost || dbStatus === 'AVAILABLE' || row.workflowStatus === 'Free' || row.status === 'Free';

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
      const inc = (Array.isArray(row.kots) && row.kots.length > 0) ? normalizeKots(row.kots) : (Array.isArray(row.kotHistory) ? row.kotHistory : []);
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
      const isFree = table.status === 'Free' || table.status === 'AVAILABLE' || table.workflowStatus === 'Free';
      if (!isFree) {
        console.warn('[BarTableSync] Skipping persist for recently terminated table', table.number, '— status:', table.status);
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
    // Abort any in-flight fetch instead of silently dropping the refresh click.
    if (isFetchingRef.current && abortControllerRef.current) {
      abortControllerRef.current.abort();
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
    } finally {
      // Always reset the fetching flag so the refresh button works even if
      // the fetch hung and was aborted by a subsequent call.
      isFetchingRef.current = false;
      abortControllerRef.current = null;
    }

    if (!mountedRef.current || cancelledRef.current) {
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

    if (mountedRef.current && !cancelledRef.current) setIsSyncing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadTables();

    const releaseSocket = acquireSocket({
      onTerminated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== getCurrentRestaurantId()) return;
        if (!payload?.tableId) return;
        markRecentlyTerminated(payload.tableId);
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
          // Fallback: if the table:terminated event was missed, mark it here
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
              console.warn('[BarTableSync] Skipping ghost non-Free event (no session data) for table', t.number, updatedTable.workflowStatus || updatedTable.status);
              return t;
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
            // Guard: skip stale order:created with no items for settled/Free tables to prevent ghost items
            const hasItems = (order.items || []).length > 0;
            if ((t.dbStatus === 'AVAILABLE' || t.status === 'Free' || t.workflowStatus === 'Free') && !hasItems) {
              console.warn('[BarTableSync] Ignoring stale order:created (no items) for settled table', t.number);
              return t;
            }
            return {
              ...t,
              status: t.status === 'Free' ? 'Occupied' : t.status,
              workflowStatus: t.workflowStatus === 'Free' ? 'Occupied' : t.workflowStatus,
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
            const hasItems = (order.items || []).length > 0;
            if ((t.dbStatus === 'AVAILABLE' || t.status === 'Free' || t.workflowStatus === 'Free') && !hasItems) {
              console.warn('[BarTableSync] Ignoring stale order:updated (no items) for settled table', t.number);
              return t;
            }
            return {
              ...t,
              status: t.status === 'Free' ? 'Occupied' : t.status,
              workflowStatus: t.workflowStatus === 'Free' ? 'Occupied' : t.workflowStatus,
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

    // ── Edge WebSocket: connect for LAN real-time updates (Bug 2 fix) ────────
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

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
      releaseSocket();
      socket.off("connect", onReconnect);
      disconnectEdgeSocket();
      if (edgeUnsub) edgeUnsub();
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
