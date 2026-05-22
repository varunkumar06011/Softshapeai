import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "../hooks/useSocket";
import { fetchTables, RESTAURANT_ID, updateTableSession } from "./tableApi";

const TABLES_CACHE_KEY = "softshape_tables_cache_v3";
const POLL_INTERVAL_MS = 5000;

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
    return raw ? JSON.parse(raw) : [];
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
  const persistedStatus = row.workflowStatus || toFrontendStatus(dbStatus);

  const base = {
    backendId: row.id,
    id: parseDisplayId(row.number),
    number: row.number,
    dbStatus,
    status: keepWorkflowStatus && existing ? existing.status : persistedStatus,
    capacity: row.capacity,
    sectionId: row.sectionId,
    section: row.section,
    guests: row.guests ?? 0,
    time: row.sessionStartedAt ?? null,
    captainId: row.captainId ?? null,
    kotHistory: Array.isArray(row.kotHistory) ? row.kotHistory : [],
    currentBill: row.currentBill ?? 0,
    activeOrder: row.orders?.[0] || row.activeOrder || null,
  };

  return base;
}

function mergeTablesFromApi(apiTables, currentTables) {
  return flattenSections(apiTables).map((row) => {
    const existing = currentTables.find((t) => t.backendId === row.id);
    return mapBackendTable(row, existing);
  });
}

function createFallbackApiTables() {
  return Array.from({ length: 20 }, (_, i) => ({
    id: String(i + 1),
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
    socket.emit("join", RESTAURANT_ID);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.log("[Socket] Connection error:", err.message);
  });
}

function acquireSocket(handlers) {
  const noop = () => {};

  try {
    if (!sharedSocket) {
      sharedSocket = getSocket();
      attachSocketLogging(sharedSocket);
    }

    sharedSocket.emit("join", RESTAURANT_ID);

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
      table.currentBill !== prev.currentBill ||
      JSON.stringify(table.kotHistory ?? []) !== JSON.stringify(prev.kotHistory ?? []);

    if (sessionChanged) {
      tasks.push(
        updateTableSession(table.backendId, {
          status: table.status,
          captainId: table.captainId ?? null,
          guests: table.guests ?? 0,
          time: table.time ?? null,
          currentBill: table.currentBill ?? 0,
          kotHistory: table.kotHistory ?? [],
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
    if (cached.length > 0) return cached;
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
        apiTables = flattenSections(await fetchTables(RESTAURANT_ID));
      } catch (err) {
        console.error("[TableSync] GET /api/tables failed:", err);
      }

      if (cancelled) return;

      setTablesState((current) => {
        const useFallback = !apiTables || !Array.isArray(apiTables) || apiTables.length === 0;
        const merged = useFallback ? getFallbackTables(current) : mergeTablesFromApi(apiTables, current);
        writeCache(merged);
        return merged;
      });

      setIsSyncing(false);
    };

    loadTables();

    const releaseSocket = acquireSocket({
      onUpdated: (payload) => {
        if (payload?.restaurantId && payload.restaurantId !== RESTAURANT_ID) return;
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
        if (payload?.restaurantId && payload.restaurantId !== RESTAURANT_ID) return;
        const newTable = unwrapTableEvent(payload);
        if (!newTable?.id) return;

        setTablesState((prev) => {
          if (findTableIndex(prev, newTable.id) !== -1) return prev;
          const next = [...prev, mapBackendTable(newTable)];
          writeCache(next);
          return next;
        });
      },
      onDeleted: ({ id, restaurantId }) => {
        if (restaurantId && restaurantId !== RESTAURANT_ID) return;
        setTablesState((prev) => {
          const next = prev.filter((t) => t.backendId !== id);
          writeCache(next);
          return next;
        });
      },
    });

    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      try {
        const apiTables = flattenSections(await fetchTables(RESTAURANT_ID));
        if (cancelled || apiTables.length === 0) return;

        setTablesState((current) => {
          const merged = mergeTablesFromApi(apiTables, current);
          writeCache(merged);
          return merged;
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
    setTablesState((prev) => {
      const current = prev ?? [];
      const next = typeof updater === "function" ? updater(current) : updater;

      writeCache(next);
      tablesRef.current = next;

      if (!skipPersist) {
        persistStatusChanges(current, next).then((results) => {
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
            writeCache(updated);
            return updated;
          });
        });
      }

      return next;
    });
  }, []);

  return {
    tables: tables ?? [],
    setTables,
    isSyncing,
    TABLE_STATUS,
  };
}
