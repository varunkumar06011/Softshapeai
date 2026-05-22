import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { API_BASE } from "./apiConfig";
import { fetchTables, updateTableStatus } from "./tableApi";

const TABLES_CACHE_KEY = "softshape_tables_cache_v3";

export const TABLE_STATUS = {
  FREE: "Free",
  OCCUPIED: "Occupied",
  PREPARING: "Preparing",
  READY: "Ready",
  BILLING: "Waiting Bill",
};

function toBackendStatus(frontendStatus) {
  const map = {
    Free: "AVAILABLE",
    Occupied: "OCCUPIED",
    Preparing: "OCCUPIED",
    Ready: "OCCUPIED",
    "Waiting Bill": "OCCUPIED",
    Reserved: "RESERVED",
    Cleaning: "CLEANING",
  };
  return map[frontendStatus] || "AVAILABLE";
}

function toFrontendStatus(backendStatus) {
  const map = {
    AVAILABLE: "Free",
    OCCUPIED: "Occupied",
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
    /* quota or private mode */
  }
}

function parseDisplayId(number) {
  const match = String(number).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : number;
}

function defaultSessionFields() {
  return {
    guests: 0,
    time: null,
    captainId: null,
    kotHistory: [],
    currentBill: 0,
  };
}

function mapBackendTable(row, existing = null, { keepWorkflowStatus = false } = {}) {
  const dbStatus = row.status;
  const persistedStatus = toFrontendStatus(dbStatus);

  const base = {
    backendId: row.id,
    id: parseDisplayId(row.number),
    number: row.number,
    dbStatus,
    status: persistedStatus,
    capacity: row.capacity,
    sectionId: row.sectionId,
    section: row.section,
    ...defaultSessionFields(),
  };

  if (!existing) return base;

  return {
    ...base,
    guests: existing.guests ?? 0,
    time: existing.time ?? null,
    captainId: existing.captainId ?? null,
    kotHistory: existing.kotHistory ?? [],
    currentBill: existing.currentBill ?? 0,
    status: keepWorkflowStatus ? existing.status : persistedStatus,
  };
}

function mergeTablesFromApi(apiTables, currentTables) {
  return apiTables.map((row) => {
    const existing = currentTables.find((t) => t.backendId === row.id);
    return mapBackendTable(row, existing, { keepWorkflowStatus: false });
  });
}

function createFallbackApiTables() {
  return Array.from({ length: 20 }, (_, i) => ({
    id: String(i + 1),
    number: `T${i + 1}`,
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
      console.log("[TableSync] Socket.io connecting to", API_BASE);
      sharedSocket = io(API_BASE, {
        transports: ["polling", "websocket"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      });
      attachSocketLogging(sharedSocket);
    }

    const { onUpdated, onCreated, onDeleted } = handlers;
    sharedSocket.on("table:updated", onUpdated);
    sharedSocket.on("table:created", onCreated);
    sharedSocket.on("table:deleted", onDeleted);
    socketRefCount += 1;

    return () => {
      sharedSocket?.off("table:updated", onUpdated);
      sharedSocket?.off("table:created", onCreated);
      sharedSocket?.off("table:deleted", onDeleted);
      socketRefCount -= 1;
      if (socketRefCount <= 0 && sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
        socketRefCount = 0;
        socketListenersAttached = false;
      }
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
    const nextBackend = toBackendStatus(table.status);
    const prevBackend = prev
      ? toBackendStatus(prev.status)
      : (prev?.dbStatus ?? "AVAILABLE");

    if (nextBackend !== prevBackend) {
      tasks.push(
        updateTableStatus(table.backendId, nextBackend)
          .then((updated) => ({ updated }))
          .catch((err) => {
            console.error(
              `[TableSync] Failed to persist status for ${table.number}:`,
              err
            );
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
        apiTables = await fetchTables();
        console.log("[TableSync] GET /api/tables response:", apiTables);
      } catch (err) {
        console.error("[TableSync] GET /api/tables failed:", err);
      }

      if (cancelled) return;

      setTablesState((current) => {
        const useFallback =
          !apiTables || !Array.isArray(apiTables) || apiTables.length === 0;

        const merged = useFallback
          ? getFallbackTables(current)
          : mergeTablesFromApi(apiTables, current);

        writeCache(merged);
        return merged;
      });

      if (!cancelled) setIsSyncing(false);
    };

    loadTables();

    let releaseSocket = () => {};

    try {
      releaseSocket = acquireSocket({
        onUpdated: (updatedTable) => {
          console.log("[Socket] table:updated received:", updatedTable);
          setTablesState((prev) => {
            const next = prev.map((t) =>
              t.backendId === updatedTable.id
                ? mapBackendTable(updatedTable, t, { keepWorkflowStatus: false })
                : t
            );
            writeCache(next);
            return next;
          });
        },
        onCreated: (newTable) => {
          console.log("[Socket] table:created received:", newTable);
          setTablesState((prev) => {
            if (findTableIndex(prev, newTable.id) !== -1) return prev;
            const next = [...prev, mapBackendTable(newTable)];
            writeCache(next);
            return next;
          });
        },
        onDeleted: ({ id }) => {
          console.log("[Socket] table:deleted received:", id);
          setTablesState((prev) => {
            const next = prev.filter((t) => t.backendId !== id);
            writeCache(next);
            return next;
          });
        },
      });
    } catch (err) {
      console.error("[TableSync] Socket setup failed:", err);
    }

    return () => {
      cancelled = true;
      releaseSocket();
    };
  }, []);

  const setTables = useCallback((updater) => {
    setTablesState((prev) => {
      const current = prev ?? [];
      const next =
        typeof updater === "function" ? updater(current) : updater;

      writeCache(next);
      tablesRef.current = next;

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
