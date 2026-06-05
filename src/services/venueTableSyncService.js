import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../hooks/useSocket";
import { fetchVenueSections, VENUE_ID, updateVenueTableSession } from "./venueTableApi";

const TABLES_CACHE_KEY = "softshape_venue_tables_cache_v1";

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
    const raw = localStorage.getItem(TABLES_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Deduplicate cached tables to prevent duplicate cards on load
    return parsed.filter((table, index, self) =>
      index === self.findIndex(t => t.backendId === table.backendId)
    );
  } catch {
    return [];
  }
}

function writeCache(tables) {
  try {
    localStorage.setItem(TABLES_CACHE_KEY, JSON.stringify(tables));
  } catch {}
}

/**
 * Map a backend venue table row → frontend table object.
 * Keeps the full section name as `sectionName` for labeling.
 */
export function getVenueTableLabel(sectionName, tableNumber) {
  const name = (sectionName || '').toLowerCase();
  if (name.includes('bar parcel')) return `BP${tableNumber}`;
  if (name.includes('bar')) return `B${tableNumber}`;
  if (name.includes('family restaurant')) return `T${tableNumber}`;
  if (name.includes('conference')) return `C${tableNumber}`;
  if (name.includes('pdr')) return `PDR${tableNumber}`;
  if (name.includes('rooms')) return `R${tableNumber}`;
  if (name.includes('parcel')) return `P${tableNumber}`;
  return `V${tableNumber}`;
}
function mapBackendTable(row, existing = null, { keepWorkflowStatus = false } = {}) {
  const dbStatus = row.status;
  const persistedStatus = row.workflowStatus || toFrontendStatus(dbStatus);
  const sectionName = row.section?.name ?? existing?.sectionName ?? "";
  const section = row.section ?? existing?.section;
  const sectionId = row.sectionId ?? existing?.sectionId;
  const sectionTag = row.sectionTag ?? existing?.sectionTag ?? null;

  const incomingOrder = row.orders?.[0] || row.activeOrder || null;
  const existingOrder = existing?.activeOrder;
  let activeOrder = incomingOrder;
  if (incomingOrder && existingOrder && incomingOrder.id === existingOrder.id) {
    const incomingUpdated = incomingOrder.updatedAt ? new Date(incomingOrder.updatedAt).getTime() : 0;
    const existingUpdated = existingOrder.updatedAt ? new Date(existingOrder.updatedAt).getTime() : 0;
    // Keep existing if it's newer OR has more items (items are never deleted from DB, only flagged)
    if (existingUpdated >= incomingUpdated ||
        (incomingOrder.items?.length ?? 0) < (existingOrder.items?.length ?? 0)) {
      activeOrder = existingOrder;
    }
    // Preserve existing items if incoming has none (prevents wipe on partial socket payloads)
    if ((!incomingOrder.items || incomingOrder.items.length === 0) && existingOrder.items?.length > 0) {
      activeOrder = existingOrder;
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
    time: _persistingCount > 0 && existing ? existing.time : (row.sessionStartedAt ? new Date(row.sessionStartedAt).toISOString() : null),
    captainId: _persistingCount > 0 && existing ? existing.captainId : (row.captainId ?? null),
    kotHistory: mergedKotHistory,
    items: activeOrder?.items || existing?.items || [],
    currentBill: dbStatus === 'AVAILABLE' ? 0 : Math.max(_persistingCount > 0 && existing ? existing.currentBill : (row.currentBill ?? 0), activeOrder ? Number(activeOrder.totalAmount ?? 0) : 0),
    activeOrder: dbStatus === 'AVAILABLE' ? null : activeOrder,
  };

  return base;
}

/**
 * Flatten sections API response → flat array of table objects.
 */
function flattenSections(sections) {
  if (!Array.isArray(sections)) return [];
  if (sections.length > 0 && Array.isArray(sections[0]?.tables)) {
    return sections.flatMap((sec) =>
      (sec.tables || []).map((t) => ({
        ...t,
        section: { id: sec.id, name: sec.name, restaurantId: sec.restaurantId },
        sectionId: t.sectionId ?? sec.id,
      }))
    );
  }
  return sections;
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
        sharedSocket.emit("join", VENUE_ID);
      });
    }
    sharedSocket.emit("join", VENUE_ID);

    const { onUpdated, onCreated, onDeleted } = handlers;
    sharedSocket.on("table:updated", onUpdated);
    sharedSocket.on("table:created", onCreated);
    sharedSocket.on("table:deleted", onDeleted);

    return () => {
      sharedSocket?.off("table:updated", onUpdated);
      sharedSocket?.off("table:created", onCreated);
      sharedSocket?.off("table:deleted", onDeleted);
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
      return cached.map(t => {
        if (t.status === 'Free' || t.status === 'AVAILABLE' || t.dbStatus === 'AVAILABLE') {
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

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const loadTables = useCallback(async () => {
    cancelledRef.current = false;
    setIsSyncing(true);
    try {
      console.log('[VenueTableSync] Fetching /api/venue/sections ...');
      const sections = await fetchVenueSections();
      if (cancelledRef.current) return;
      console.log('[VenueTableSync] Received sections:', sections?.length ?? 0, sections);
      const flat = flattenSections(sections);
      console.log('[VenueTableSync] Flattened tables:', flat?.length ?? 0, flat);
      setTablesState((current) => {
        const merged = flat.map((row) => {
          const existing = current.find((t) => t.backendId === row.id);
          return mapBackendTable(row, existing);
        });
        // Deduplicate by backendId to prevent duplicate cards
        const deduped = merged.filter((table, index, self) =>
          index === self.findIndex(t => t.backendId === table.backendId)
        );
        writeCache(deduped);
        return deduped;
      });
    } catch (err) {
      console.error("[VenueTableSync] Fetch failed:", err);
    } finally {
      if (!cancelledRef.current) setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadTables();

    const releaseSocket = acquireSocket({
      onUpdated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== VENUE_ID) return;
        const updatedTable = payload?.table || payload;
        if (!updatedTable?.id) return;
        setTablesState((prev) => {
          const next = prev.map((t) =>
            t.backendId === updatedTable.id ? mapBackendTable(updatedTable, t) : t
          );
          writeCache(next);
          return next;
        });
      },
      onCreated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== VENUE_ID) return;
        const newTable = payload?.table || payload;
        if (!newTable?.id) return;
        setTablesState((prev) => {
          if (findTableIndex(prev, newTable.id) !== -1) return prev;
          const next = [...prev, mapBackendTable(newTable)];
          // Deduplicate by backendId to prevent duplicate cards
          const deduped = next.filter((table, index, self) =>
            index === self.findIndex(t => t.backendId === table.backendId)
          );
          writeCache(deduped);
          return deduped;
        });
      },
      onDeleted: ({ id, restaurantId }) => {
        if (restaurantId && restaurantId !== VENUE_ID) return;
        setTablesState((prev) => {
          const next = prev.filter((t) => t.backendId !== id);
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

    return () => {
      cancelledRef.current = true;
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
