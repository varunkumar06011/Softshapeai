import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../hooks/useSocket";
import { fetchBarTables, BAR_ID, updateBarTableSession } from "./barTableApi";

let _persistingCount = 0;
let _lastLocalUpdate = 0;
const TABLES_CACHE_KEY = "softshape_bar_tables_cache_v3";
const POLL_INTERVAL_MS = 30000; // 30s — socket handles real-time; polling is true fallback

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

function mapBackendTable(row, existing = null, { keepWorkflowStatus = false } = {}) {
  const dbStatus = row.status;
  const isFreeWorkflow = dbStatus === 'AVAILABLE' || row.workflowStatus === 'Free' || row.status === 'Free';
  const persistedStatus = row.workflowStatus || toFrontendStatus(dbStatus);
  const mergedKotHistory = Array.isArray(row.kotHistory) ? row.kotHistory : [];

  const incomingOrder = row.orders?.[0] || row.activeOrder || null;
  const existingOrder = existing?.activeOrder;
  let activeOrder = incomingOrder;
  if (incomingOrder && existingOrder && incomingOrder.id === existingOrder.id) {
    const incomingUpdated = incomingOrder.updatedAt ? new Date(incomingOrder.updatedAt).getTime() : 0;
    const existingUpdated = existingOrder.updatedAt ? new Date(existingOrder.updatedAt).getTime() : 0;
    if (existingUpdated > incomingUpdated) {
      activeOrder = existingOrder;
    }
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
    time: _persistingCount > 0 && existing ? existing.time : (row.sessionStartedAt ? new Date(row.sessionStartedAt).toISOString() : null),
    captainId: _persistingCount > 0 && existing ? existing.captainId : (row.captainId ?? null),
    kotHistory: isFreeWorkflow ? [] : (Array.isArray(row.kotHistory) ? row.kotHistory : (existing?.kotHistory ?? [])),
    currentBill: isFreeWorkflow ? 0 : (row.currentBill ?? existing?.currentBill ?? 0),
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
  
  // Strictly enforce 30 tables capacity locally
  const existingNumbers = new Set(flat.map((t) => Number(t.number)));
  const missing = [];
  for (let i = 1; i <= 30; i++) {
    if (!existingNumbers.has(i)) {
      missing.push({
        id: `local-${i}`,
        number: i,
        status: "AVAILABLE",
        capacity: 4,
        sectionId: "main-hall",
        section: { id: "main-hall", name: "Main Hall" },
      });
    }
  }
  
  // Combine API tables with any missing local tables, sorted by table number
  flat = [...flat, ...missing].sort((a, b) => Number(a.number) - Number(b.number));

  return flat.map((row) => {
    const existing = currentTables.find((t) => t.backendId === row.id || (row.id.startsWith("local-") && t.number === row.number));
    return mapBackendTable(row, existing);
  });
}

function createFallbackApiTables() {
  return Array.from({ length: 30 }, (_, i) => ({
    id: `local-${i + 1}`,
    number: i + 1,
    status: "AVAILABLE",
    capacity: 4,
    sectionId: "main-hall",
    section: { id: "main-hall", name: "Main Hall" },
  }));
}

function getFallbackTables(currentTables = []) {
  console.warn("[TableSync] Using fallback tables (fetch failed or empty)");
  return mergeTablesFromApi(createFallbackApiTables(), currentTables);
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
    socket.emit("join", BAR_ID);
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

    sharedSocket.emit("join", BAR_ID);

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
      tasks.push(
        updateBarTableSession(table.backendId, {
          status: table.status,
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

export function useBarTableSync() {
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
    return getFallbackTables([]);
  });
  const [isSyncing, setIsSyncing] = useState(true);
  const tablesRef = useRef(tables);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    let cancelled = false;

    const loadTables = async () => {
      setIsSyncing(true);
      let apiTables = null;

      try {
        apiTables = flattenSections(await fetchBarTables());
      } catch (err) {
        console.error("[TableSync] GET /api/tables failed:", err);
      }

      if (cancelled) return;

      setTablesState((current) => {
        const useFallback = !apiTables || !Array.isArray(apiTables) || apiTables.length === 0;
        const merged = useFallback ? getFallbackTables(current) : mergeTablesFromApi(apiTables, current);
        // Deduplicate by backendId to prevent duplicate cards
        const deduped = merged.filter((table, index, self) =>
          index === self.findIndex(t => t.backendId === table.backendId)
        );
        writeCache(deduped);
        return deduped;
      });

      setIsSyncing(false);
    };

    loadTables();

    const releaseSocket = acquireSocket({
      onUpdated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== BAR_ID) return;
        const updatedTable = unwrapTableEvent(payload);
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
        if (payload?.restaurantId && payload.restaurantId !== BAR_ID) return;
        const newTable = unwrapTableEvent(payload);
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
        if (restaurantId && restaurantId !== BAR_ID) return;
        setTablesState((prev) => {
          const next = prev.filter((t) => t.backendId !== id);
          writeCache(next);
          return next;
        });
      },
    });

    const pollInterval = setInterval(async () => {
      // Automatic midnight reset
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        const today = now.toLocaleDateString();
        if (localStorage.getItem('last_bartable_reset_date') !== today) {
          localStorage.setItem('last_bartable_reset_date', today);
          setTablesState((prev) => {
            const next = prev.map((t) => {
              if (t.status === 'Free' || t.status === 'AVAILABLE') return t;
              return { ...t, status: 'Free', captainId: null, guests: 0, time: null, currentBill: 0, kotHistory: [] };
            });
            persistStatusChanges(prev, next).catch((e) => console.error("Auto reset failed", e));
            writeCache(next);
            return next;
          });
          return;
        }
      }

      if (_persistingCount > 0) return;
      if (cancelled) return;
      const fetchStartTime = Date.now();
      try {
        const apiTables = flattenSections(await fetchBarTables());
        if (cancelled || apiTables.length === 0) return;

        if (_persistingCount > 0 || _lastLocalUpdate > fetchStartTime) return;

        setTablesState((current) => {
          const merged = mergeTablesFromApi(apiTables, current);
          // Deduplicate by backendId to prevent duplicate cards
          const deduped = merged.filter((table, index, self) =>
            index === self.findIndex(t => t.backendId === table.backendId)
          );
          writeCache(deduped);
          return deduped;
        });
      } catch {
        /* polling is a fallback, keep quiet */
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      releaseSocket();
      clearInterval(pollInterval);
    };
  }, []);

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
      });
    }
  }, []);

  return {
    tables: tables ?? [],
    setTables,
    isSyncing,
    TABLE_STATUS,
  };
}
