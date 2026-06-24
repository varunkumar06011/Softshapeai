import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../hooks/useSocket";
import { fetchVenueSections, updateVenueTableSession } from "./venueTableApi";
import { getVenueId } from "./venueApiConfig";
import { validateTableIntegrity } from "../utils/syncInvariant";
import { apiUrl } from "./apiConfig";
import { getVenueTablesCacheKey, getRecentlyTerminatedKey, LEGACY_UNSCOPED_KEYS } from "../utils/cacheKeys";

function isRecentlyTerminated(tableId) {
  try {
    const raw = localStorage.getItem(getRecentlyTerminatedKey());
    const map = raw ? JSON.parse(raw) : {};
    const ts = map[tableId];
    return ts && Date.now() - ts < 30000; // 30 seconds — same as VenueSectionView
  } catch { return false; }
}

/** Force a table to Free state — used when backend still returns stale data for a terminated table */
function sanitizeTerminatedTable(table) {
  return {
    ...table,
    status: 'Free',
    workflowStatus: 'Free',
    dbStatus: 'AVAILABLE',
    activeOrder: null,
    orders: [],
    items: [],
    kotHistory: [],
    currentBill: 0,
    guests: 0,
    captainId: null,
    time: null,
  };
}

export const VENUE_TABLE_STATUS = {
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
    // Evict stale un-scoped venue cache
    LEGACY_UNSCOPED_KEYS.forEach(k => {
      if (k.startsWith('softshape_venue_tables_cache')) localStorage.removeItem(k);
    });
    const raw = localStorage.getItem(getVenueTablesCacheKey());
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      console.warn('[VenueTableSync] Cache parse error — treating as empty');
      return [];
    }
    // Deduplicate cached tables to prevent duplicate cards on load
    const deduped = parsed.filter((table, index, self) =>
      index === self.findIndex(t => t.backendId === table.backendId)
    );
    console.log('[VenueTableSync] readCache:', deduped.length, 'tables');
    return deduped;
  } catch {
    return [];
  }
}

function writeCache(tables) {
  try {
    localStorage.setItem(getVenueTablesCacheKey(), JSON.stringify(tables));
  } catch {}
}

/**
 * Map a backend venue table row → frontend table object.
 * Keeps the full section name as `sectionName` for labeling.
 */
export function getVenueTableLabel(sectionName, tableNumber) {
  const name = (sectionName || '').toLowerCase();
  if (name.includes('gobox') || name.includes('go box') || name.includes('bar parcel')) return `GB${tableNumber}`;
  if (name.includes('bar')) return `B${tableNumber}`;
  if (name.includes('family restaurant')) return `F${tableNumber}`;
  if (name.includes('conference')) return `C${tableNumber}`;
  if (name.includes('pdr')) return `PDR${tableNumber}`;
  if (name.includes('rooms')) return `R${tableNumber}`;
  if (name.includes('parcel')) return `P${tableNumber}`;
  return `V${tableNumber}`;
}
function mapBackendTable(row, existing = null, { keepWorkflowStatus = false } = {}) {
  // Staleness guard: if existing has a newer updatedAt, keep existing status/currentBill
  const incomingTableUpdated = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  const existingTableUpdated = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  const isStale = incomingTableUpdated > 0 && existingTableUpdated > 0 && incomingTableUpdated < existingTableUpdated;

  const dbStatus = isStale && existing ? existing.dbStatus : row.status;
  const persistedStatus = isStale && existing ? existing.status : (row.workflowStatus || toFrontendStatus(dbStatus));
  // Recover sectionName from sectionTag when section.name is absent (partial payloads / cold cache)
  const rawSectionName = row.section?.name ?? existing?.sectionName ?? null;
  const sectionTagFallback = (row.sectionTag ?? existing?.sectionTag ?? '').toLowerCase();
  const sectionName = rawSectionName || (() => {
    if (sectionTagFallback.includes('gobox') || sectionTagFallback.includes('bar-parcel')) return 'GoBox';
    if (sectionTagFallback.includes('conference')) return 'Conference Hall';
    if (sectionTagFallback.includes('family-restaurant')) return 'Family Restaurant';
    if (sectionTagFallback.includes('-pdr')) return 'PDR';
    if (sectionTagFallback.includes('-rooms')) return 'Rooms';
    if (sectionTagFallback.includes('restaurant-parcel')) return 'Parcel';
    return existing?.sectionName ?? '';
  })();
  const section = row.section ?? existing?.section;
  const sectionId = row.sectionId ?? existing?.sectionId;
  const sectionTag = row.sectionTag ?? existing?.sectionTag ?? null;

  const incomingOrder = row.orders?.[0] || row.activeOrder || null;
  const existingOrder = existing?.activeOrder;
  let activeOrder = incomingOrder;
  if (incomingOrder && existingOrder && incomingOrder.id === existingOrder.id) {
    const incomingUpdated = incomingOrder.updatedAt ? new Date(incomingOrder.updatedAt).getTime() : 0;
    const existingUpdated = existingOrder.updatedAt ? new Date(existingOrder.updatedAt).getTime() : 0;
    const incomingItems = incomingOrder.items || [];
    const existingItems = existingOrder.items || [];
    if (existingUpdated >= incomingUpdated) {
      // Existing is newer — keep it, but merge in any items from incoming not already present
      const existingIds = new Set(existingItems.map(i => i.id).filter(Boolean));
      const newFromIncoming = incomingItems.filter(i => i.id && !existingIds.has(i.id));
      activeOrder = {
        ...existingOrder,
        items: [...existingItems, ...newFromIncoming],
      };
    } else {
      // Incoming is newer — use it but keep any existing items missing from incoming (partial payloads)
      const incomingIds = new Set(incomingItems.map(i => i.id).filter(Boolean));
      const missingFromIncoming = existingItems.filter(
        i => i.id && !incomingIds.has(i.id) && !i.removedFromBill
      );
      activeOrder = {
        ...incomingOrder,
        items: [...incomingItems, ...missingFromIncoming],
      };
    }
    // Preserve existing items if incoming has none (partial socket payloads)
    if (incomingItems.length === 0 && existingItems.length > 0) {
      activeOrder = { ...incomingOrder, items: existingItems };
    }
  }
  // Fall back to existing if no incoming order at all (prevents wipe on partial socket payloads)
  if (!activeOrder && existingOrder && dbStatus !== 'AVAILABLE') {
    activeOrder = existingOrder;
  }

  // Use whichever has MORE KOT entries - the DB cannot have FEWER than local unless the table was reset
  const dbKotHistory = Array.isArray(row.kotHistory) ? row.kotHistory : [];
  const existingKotHistory = existing?.kotHistory ?? [];
  const mergedKotHistory = dbStatus === 'AVAILABLE' ? []
    : (_persistingCount > 0 && existing)
      ? existingKotHistory  // preserve local during active writes
      : (dbKotHistory.length >= existingKotHistory.length ? dbKotHistory : existingKotHistory);

  const base = {
    backendId: row.id,
    id: row.id,          // use full UUID as ID for venue (no numeric collision between sections)
    number: row.number,
    displayName: getVenueTableLabel(sectionName, row.number),
    name: getVenueTableLabel(sectionName, row.number), // Fallback alias
    dbStatus,
    status: (keepWorkflowStatus || _persistingCount > 0) && existing ? existing.status : persistedStatus,
    capacity: row.capacity,
    sectionId: sectionId,
    sectionName: sectionName,
    section: section,
    sectionTag: sectionTag,
    guests: _persistingCount > 0 && existing ? existing.guests : (row.guests ?? 0),
    time: _persistingCount > 0 && existing ? existing.time : (row.sessionStartedAt ? (() => { try { const d = new Date(row.sessionStartedAt); return isNaN(d.getTime()) ? null : d.toISOString(); } catch { return null; } })() : null),
    captainId: _persistingCount > 0 && existing ? existing.captainId : (row.captainId ?? null),
    kotHistory: mergedKotHistory,
    items: activeOrder?.items || existing?.items || [],
    currentBill: dbStatus === 'AVAILABLE' ? 0 : (isStale && existing ? existing.currentBill : Math.max(_persistingCount > 0 && existing ? existing.currentBill : (row.currentBill ?? 0), activeOrder ? Number(activeOrder.totalAmount ?? 0) : 0)),
    updatedAt: row.updatedAt || existing?.updatedAt || null,
    activeOrder: dbStatus === 'AVAILABLE' ? null : activeOrder,
  };

  return base;
}

/**
 * Flatten sections API response → flat array of table objects.
 * Handles: wrapped { sections: [...] }, flat [...], and tables already flattened.
 */
function flattenSections(raw) {
  // Unwrap common response wrappers
  let sections = raw;
  if (!Array.isArray(sections) && sections && typeof sections === 'object') {
    if (Array.isArray(sections.sections)) sections = sections.sections;
    else if (Array.isArray(sections.data)) sections = sections.data;
    else if (Array.isArray(sections.tables)) sections = sections.tables;
    else if (sections.data && Array.isArray(sections.data.sections)) sections = sections.data.sections;
  }
  if (!Array.isArray(sections)) {
    console.warn('[VenueTableSync] flattenSections: input is not an array after unwrapping', raw);
    return [];
  }
  if (sections.length === 0) return [];
  if (Array.isArray(sections[0]?.tables)) {
    return sections.flatMap((sec) =>
      (sec.tables || []).map((t) => ({
        ...t,
        section: { id: sec.id, name: sec.name, restaurantId: sec.restaurantId },
        sectionId: t.sectionId ?? sec.id,
      }))
    );
  }
  // Already flat array of tables — ensure each has a section name
  return sections.map(t => ({
    ...t,
    section: t.section || { name: t.sectionName || t.sectionTag || '' },
  }));
}

function findTableIndex(tables, backendId) {
  return tables.findIndex((t) => t.backendId === backendId);
}

// ─── Persist changes to backend ───────────────────────────────────────────────

let _persistingCount = 0;
let _lastLocalUpdate = 0;

async function persistStatusChanges(prevTables, nextTables) {
  const tasks = [];

  for (const table of nextTables) {
    if (!table.backendId || table.backendId.startsWith("local-")) continue;

    const prev = prevTables.find((t) => t.backendId === table.backendId);
    const changed =
      !prev ||
      table.status !== prev.status ||
      table.captainId !== prev.captainId ||
      table.guests !== prev.guests ||
      table.time !== prev.time ||
      table.currentBill !== prev.currentBill ||
      JSON.stringify(table.kotHistory ?? []) !== JSON.stringify(prev.kotHistory ?? []);

    if (changed) {
      // Ensure status is a valid workflow status string, not a backend enum
      // Backend enum values like "OCCUPIED" need to be converted to "Occupied"
      let statusToSend = table.status;
      if (statusToSend === 'OCCUPIED') statusToSend = 'Occupied';
      else if (statusToSend === 'AVAILABLE') statusToSend = 'Free';
      else if (statusToSend === 'BILLING_REQUESTED') statusToSend = 'Waiting Bill';
      else if (statusToSend === 'RESERVED') statusToSend = 'Reserved';
      else if (statusToSend === 'CLEANING') statusToSend = 'Cleaning';

      tasks.push(
        updateVenueTableSession(table.backendId, {
          status: statusToSend,
          captainId: table.captainId ?? null,
          guests: table.guests ?? 0,
          time: table.time ?? null,
          currentBill: table.currentBill ?? 0,
          kotHistory: table.kotHistory ?? [],
        })
          .then((updated) => ({ updated }))
          .catch((err) => {
            console.error(`[VenueTableSync] Failed to persist ${table.backendId}:`, err);
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

// ─── Socket ───────────────────────────────────────────────────────────────────

let sharedSocket = null;
let socketListenersAttached = false;

function acquireSocket(handlers) {
  const noop = () => {};
  try {
    if (!sharedSocket) {
      sharedSocket = getSocket();
    }
    if (!socketListenersAttached) {
      socketListenersAttached = true;
      sharedSocket.on("connect", () => {
        sharedSocket.emit("join", getVenueId());
      });
    }
    sharedSocket.emit("join", getVenueId());

    const { onUpdated, onCreated, onDeleted, onOrderCreated, onOrderUpdated } = handlers;
    sharedSocket.on("table:updated", onUpdated);
    sharedSocket.on("table:created", onCreated);
    sharedSocket.on("table:deleted", onDeleted);
    sharedSocket.on("order:created", onOrderCreated);
    sharedSocket.on("order:updated", onOrderUpdated);

    return () => {
      sharedSocket?.off("table:updated", onUpdated);
      sharedSocket?.off("table:created", onCreated);
      sharedSocket?.off("table:deleted", onDeleted);
      sharedSocket?.off("order:created", onOrderCreated);
      sharedSocket?.off("order:updated", onOrderUpdated);
    };
  } catch (err) {
    console.error("[VenueTableSync] Socket init failed:", err);
    return noop;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVenueTableSync() {
  const [tables, setTablesState] = useState(() => {
    const cached = readCache();
    if (cached.length > 0) {
      return cached
        .filter(t => {
          // Only hide occupied tables that were recently terminated.
          // Free tables must always show so they can be reused immediately.
          const isFree = t.status === 'Free' || t.status === 'AVAILABLE' || t.dbStatus === 'AVAILABLE';
          return isFree || !isRecentlyTerminated(t.backendId);
        })
        .map(t => {
          if (t.status === 'Free' || t.status === 'AVAILABLE' || t.dbStatus === 'AVAILABLE') {
            return { ...t, kotHistory: [], currentBill: 0, activeOrder: null, guests: 0, time: null };
          }
          return t;
        });
    }
    return [];
  });
  const [isSyncing, setIsSyncing] = useState(() => readCache().length === 0);
  const tablesRef = useRef(tables);
  const isFetchingRef = useRef(false);
  const fetchStartTimeRef = useRef(0);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const loadTables = useCallback(async (isRetry = false) => {
    // Cancel any previous in-flight fetch before starting a new one.
    // This prevents stale responses from overwriting fresh data.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      // Give the aborted fetch's finally block one tick to reset isFetchingRef
      await new Promise(r => setTimeout(r, 0));
    }
    // Auto-reset if a previous fetch got stuck (e.g. zombie promise, uncaught exception)
    if (isFetchingRef.current && Date.now() - fetchStartTimeRef.current > 20000) {
      console.warn('[VenueTableSync] Fetch lock stuck for >20s, forcing reset');
      isFetchingRef.current = false;
    }
    if (isFetchingRef.current) {
      console.log('[VenueTableSync] Fetch already in progress, skipping');
      return;
    }
    isFetchingRef.current = true;
    fetchStartTimeRef.current = Date.now();
    const thisFetchStartedAt = fetchStartTimeRef.current;
    abortControllerRef.current = new AbortController();
    setIsSyncing(true);
    try {
      console.log('[VenueTableSync] Fetching /api/venue/sections ...');
      const sections = await fetchVenueSections(abortControllerRef.current.signal);
      // Always use valid data even if component briefly unmounted (React Strict Mode).
      // React safely ignores state updates on unmounted components.
      console.log('[VenueTableSync] Received sections:', sections?.length ?? 0, sections);
      const flat = flattenSections(sections);
      console.log('[VenueTableSync] Flattened tables:', flat?.length ?? 0, flat);
      // Pre-compute merged tables for rehydration scan (uses current ref for consistency)
      const mergedForRehydration = flat.map((row) => {
        const existing = tablesRef.current.find((t) => t.backendId === row.id);
        return mapBackendTable(row, existing);
      });

      setTablesState((current) => {
        const merged = flat.map((row) => {
            const existing = current.find((t) => t.backendId === row.id);
            // Guard: if a socket event updated this table after this fetch started,
            // preserve the newer local state rather than overwriting with stale fetch data
            if (existing && existing.lastUpdatedAt && existing.lastUpdatedAt > thisFetchStartedAt) {
              return existing;
            }
            let after = mapBackendTable(row, existing);
            if (existing) validateTableIntegrity('venueTableSync.mergeTablesFromApi', existing, after);
            // If backend still returns stale data for a recently terminated table, sanitize it
            if (isRecentlyTerminated(row.id)) {
              after = sanitizeTerminatedTable(after);
            }
            return after;
          });
        // Deduplicate by backendId to prevent duplicate cards
        const deduped = merged.filter((table, index, self) =>
          index === self.findIndex(t => t.backendId === table.backendId)
        );
        writeCache(deduped);
        return deduped;
      });

      // Auto-retry once if result is empty and this wasn't already a retry
      if (flat.length === 0 && !isRetry) {
        console.warn('[VenueTableSync] Empty result — retrying in 2s');
        setTimeout(() => loadTables(true), 2000);
      }

      // Cold-load rehydration: if API returned occupied tables with no activeOrder,
      // fetch the dedicated order endpoint to recover them (catches partial payloads on hard refresh)
      const needsRehydration = mergedForRehydration.filter(t =>
        t.dbStatus !== 'AVAILABLE' && !t.activeOrder && t.backendId && !String(t.backendId).startsWith('local-')
      );
      if (needsRehydration.length > 0) {
        Promise.all(
          needsRehydration.map(t =>
            fetch(apiUrl(`/api/orders/table/${t.backendId}`), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
              .then(r => (r.ok ? r.json() : null))
              .then(order => ({ tableId: t.backendId, order }))
              .catch(err => {
                console.warn('[VenueTableSync] Rehydration failed for table', t.number, err.message);
                return null;
              })
          )
        ).then(results => {
          const recovered = results.filter(Boolean);
          if (recovered.length > 0) {
            setTablesState(prev => {
              const next = prev.map(t => {
                const rec = recovered.find(r => r.tableId === t.backendId);
                if (rec && rec.order && !t.activeOrder) {
                  return {
                    ...t,
                    activeOrder: rec.order,
                    currentBill: rec.order.totalAmount ?? t.currentBill ?? 0,
                  };
                }
                return t;
              });
              writeCache(next);
              return next;
            });
          }
        });
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.log('[VenueTableSync] Fetch aborted — scheduling immediate retry');
        // Retry immediately after a short tick so the aborting remount stabilizes first
        setTimeout(() => {
          if (tablesRef.current.length === 0 && !isFetchingRef.current) {
            loadTables(true);
          }
        }, 300);
      } else {
        console.error("[VenueTableSync] Fetch failed:", err);
        if (!isRetry) {
          console.warn('[VenueTableSync] Fetch error — retrying in 3s');
          setTimeout(() => loadTables(true), 3000);
        }
      }
    } finally {
      isFetchingRef.current = false;
      fetchStartTimeRef.current = 0;
      // Don't null out abortControllerRef — cleanup may need it
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadTables();

    const releaseSocket = acquireSocket({
      onUpdated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== getVenueId()) return;
        const updatedTable = payload?.table || payload;
        if (!updatedTable?.id) return;

        const incomingIsAvailable = updatedTable.status === 'AVAILABLE' || updatedTable.workflowStatus === 'Free' || updatedTable.status === 'TERMINATED';

        // If table was recently terminated but backend now says AVAILABLE, accept it immediately
        // (the settlement succeeded). Only skip if backend is trying to re-populate a settled table.
        if (isRecentlyTerminated(updatedTable.id) && !incomingIsAvailable) {
          console.warn('[VenueTableSync] Ignoring stale re-populate for recently terminated table', updatedTable.id);
          return;
        }

        // Detect settled/terminated tables and emit clear event to frontend
        const isSettledOrTerminated = incomingIsAvailable;
        const existingTable = tablesRef.current.find(t => t.backendId === updatedTable.id);
        const hadActiveOrder = existingTable?.activeOrder && existingTable.activeOrder.items?.length > 0;
        if (isSettledOrTerminated && hadActiveOrder) {
          window.dispatchEvent(new CustomEvent('table:settled', {
            detail: { tableId: updatedTable.id, tableNumber: existingTable?.number }
          }));
        }

        setTablesState((prev) => {
          const hasTable = prev.some((t) => t.backendId === updatedTable.id);
          let next;
          if (hasTable) {
            next = prev.map((t) => {
              if (t.backendId !== updatedTable.id) return t;
              // Guard: if socket says AVAILABLE but local table has an active order,
              // skip this update — it's a stale/race event. Wait for the correct one.
              // EXCEPTION: if this table was recently terminated, the AVAILABLE update is the
              // legitimate settlement confirmation and must be accepted.
              if (incomingIsAvailable && t.activeOrder && !isRecentlyTerminated(t.backendId)) {
                console.warn('[VenueTableSync] Skipping stale AVAILABLE event for occupied table', t.number);
                return t;
              }
              const before = t;
              let after = mapBackendTable(updatedTable, t);
              // If backend still returns stale data for a recently terminated table, sanitize it
              if (isRecentlyTerminated(updatedTable.id)) {
                after = sanitizeTerminatedTable(after);
              }
              after.lastUpdatedAt = Date.now();
              validateTableIntegrity('venueTableSync', before, after);
              return after;
            });
          } else {
            // Table missing from state (e.g., filtered on mount) — add it now
            let after = mapBackendTable(updatedTable, null);
            if (isRecentlyTerminated(updatedTable.id)) {
              after = sanitizeTerminatedTable(after);
            }
            next = [...prev, after];
          }
          writeCache(next);
          return next;
        });
      },
      onCreated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== getVenueId()) return;
        const newTable = payload?.table || payload;
        if (!newTable?.id) return;
        if (isRecentlyTerminated(newTable.id)) {
          console.warn('[VenueTableSync] Ignoring create for recently terminated table', newTable.id);
          return;
        }
        setTablesState((prev) => {
          if (findTableIndex(prev, newTable.id) !== -1) return prev;
          const after = mapBackendTable(newTable);
          after.lastUpdatedAt = Date.now();
          const next = [...prev, after];
          // Deduplicate by backendId to prevent duplicate cards
          const deduped = next.filter((table, index, self) =>
            index === self.findIndex(t => t.backendId === table.backendId)
          );
          writeCache(deduped);
          return deduped;
        });
      },
      onDeleted: ({ id, restaurantId }) => {
        if (restaurantId && restaurantId !== getVenueId()) return;
        setTablesState((prev) => {
          const next = prev.filter((t) => t.backendId !== id);
          writeCache(next);
          return next;
        });
      },
      onOrderCreated: (payload) => {
        const order = payload?.order || payload;
        if (!order?.tableId) return;
        if (payload?.isExtraTable) return; // extra-table orders must never leak into venue tables
        if (isRecentlyTerminated(order.tableId)) return;
        if (payload?.restaurantId && payload.restaurantId !== getVenueId()) return;
        setTablesState((prev) => {
          const next = prev.map((t) =>
            t.backendId === order.tableId
              ? {
                  ...t,
                  status: t.status === 'Free' ? 'Occupied' : t.status,
                  workflowStatus: t.status === 'Free' ? 'Occupied' : t.workflowStatus,
                  activeOrder: order,
                  items: order.items || t.items || [],
                  currentBill: Math.max(Number(t.currentBill ?? 0), Number(order.totalAmount ?? 0)),
                  lastUpdatedAt: Date.now(),
                }
              : t
          );
          writeCache(next);
          return next;
        });
      },
      onOrderUpdated: (payload) => {
        const order = payload?.order || payload;
        if (!order?.tableId) return;
        if (payload?.isExtraTable) return; // extra-table orders must never leak into venue tables
        if (isRecentlyTerminated(order.tableId)) return;
        if (payload?.restaurantId && payload.restaurantId !== getVenueId()) return;
        setTablesState((prev) => {
          const next = prev.map((t) => {
            if (t.backendId !== order.tableId) return t;
            // Guard: ignore stale order updates for tables already settled/available
            if (t.dbStatus === 'AVAILABLE' || t.status === 'Free' || t.workflowStatus === 'Free') {
              console.warn('[VenueTableSync] Ignoring stale order:updated for settled table', t.number);
              return t;
            }
            return {
              ...t,
              activeOrder: order,
              items: order.items || t.items || [],
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
      console.log("[VenueTableSync] Socket reconnected — refetching tables to recover missed events");
      loadTables().catch((err) =>
        console.warn("[VenueTableSync] Reconnect refetch failed:", err.message)
      );
    };
    socket.on("connect", onReconnect);

    // Fallback: if tables stay empty (e.g. all fetches aborted by Strict Mode),
    // retry every 5 seconds until we get data.
    const fallbackInterval = setInterval(() => {
      if (tablesRef.current.length === 0 && !isFetchingRef.current) {
        console.warn('[VenueTableSync] Tables still empty — forcing refetch');
        loadTables(true);
      }
    }, 2000); // Reduced from 5s → 2s for faster recovery on slow devices

    return () => {
      // Don't abort in-flight fetches on unmount — React Strict Mode causes
      // mount/unmount cycles and aborting leads to infinite fetch loops.
      // React safely ignores state updates on unmounted components.
      clearInterval(fallbackInterval);
      releaseSocket();
      socket.off("connect", onReconnect);
    };
  }, [loadTables]);

  const setTables = useCallback((updater, { skipPersist = false } = {}) => {
    const current = tablesRef.current ?? [];
    const next = typeof updater === "function" ? updater(current) : updater;

    // Deduplicate by backendId to prevent duplicate cards
    const deduped = next.filter((table, index, self) =>
      index === self.findIndex(t => t.backendId === table.backendId)
    );

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
          const finalDeduped = updated.filter((table, index, self) =>
            index === self.findIndex(t => t.backendId === table.backendId)
          );
          writeCache(finalDeduped);
          tablesRef.current = finalDeduped;
          return finalDeduped;
        });
      }).catch((e) =>
        console.error("[VenueTableSync] Persist error:", e)
      );
    }
  }, []);

  return {
    tables: tables ?? [],
    setTables,
    isSyncing,
    TABLE_STATUS: VENUE_TABLE_STATUS,
    refetch: loadTables,
  };
}
