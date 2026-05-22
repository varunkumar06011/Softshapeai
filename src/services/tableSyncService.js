import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { API_BASE, fetchTables, updateTableStatus } from "./tableApi";

const TABLES_CACHE_KEY = "softshape_tables_cache_v3";

export const TABLE_STATUS = {
  FREE: "Free",
  OCCUPIED: "Occupied",
  PREPARING: "Preparing",
  READY: "Ready",
  BILLING: "Waiting Bill",
};

const BACKEND_TO_FRONTEND = {
  AVAILABLE: TABLE_STATUS.FREE,
  OCCUPIED: TABLE_STATUS.OCCUPIED,
  RESERVED: "Reserved",
  CLEANING: "Cleaning",
};

const FRONTEND_TO_BACKEND = {
  [TABLE_STATUS.FREE]: "AVAILABLE",
  [TABLE_STATUS.OCCUPIED]: "OCCUPIED",
  Reserved: "RESERVED",
  Cleaning: "CLEANING",
};

const FRONTEND_ONLY_STATUSES = new Set([
  TABLE_STATUS.PREPARING,
  TABLE_STATUS.READY,
  TABLE_STATUS.BILLING,
]);

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

function mapBackendTable(row, existing = null) {
  const dbStatus = row.status;
  const persistedStatus = BACKEND_TO_FRONTEND[dbStatus] ?? TABLE_STATUS.FREE;

  const base = {
    backendId: row.id,
    id: parseDisplayId(row.number),
    number: row.number,
    dbStatus,
    status:
      existing && FRONTEND_ONLY_STATUSES.has(existing.status)
        ? existing.status
        : persistedStatus,
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
    status: FRONTEND_ONLY_STATUSES.has(existing.status)
      ? existing.status
      : persistedStatus,
  };
}

function mergeTablesFromApi(apiTables, currentTables) {
  return apiTables.map((row) => {
    const existing = currentTables.find((t) => t.backendId === row.id);
    return mapBackendTable(row, existing);
  });
}

function findTableIndex(tables, backendId) {
  return tables.findIndex((t) => t.backendId === backendId);
}

let sharedSocket = null;
let socketRefCount = 0;

function acquireSocket(handlers) {
  if (!sharedSocket) {
    sharedSocket = io(API_BASE, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
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
    }
  };
}

async function persistStatusChanges(prevTables, nextTables) {
  const tasks = [];

  for (const table of nextTables) {
    if (!table.backendId) continue;

    const prev = prevTables.find((t) => t.backendId === table.backendId);
    const nextBackend = FRONTEND_TO_BACKEND[table.status];
    if (!nextBackend) continue;

    const prevBackend =
      prev?.dbStatus ?? FRONTEND_TO_BACKEND[prev?.status] ?? "AVAILABLE";

    if (nextBackend !== prevBackend) {
      tasks.push(
        updateTableStatus(table.backendId, nextBackend)
          .then((updated) => ({ table, updated }))
          .catch((err) => {
            console.error(
              `[TableSync] Failed to persist status for ${table.number}:`,
              err
            );
            return { table, error: err };
          })
      );
    }
  }

  return Promise.all(tasks);
}

export function useTableSync() {
  const [tables, setTablesState] = useState(() => readCache());
  const [isSyncing, setIsSyncing] = useState(true);
  const tablesRef = useRef(tables);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    let cancelled = false;

    const loadTables = async () => {
      setIsSyncing(true);
      try {
        const apiTables = await fetchTables();
        if (cancelled) return;
        setTablesState((current) => {
          const merged = mergeTablesFromApi(apiTables, current);
          writeCache(merged);
          return merged;
        });
      } catch (err) {
        console.error("[TableSync] Failed to load tables:", err);
        if (!cancelled) {
          setTablesState((current) => (current.length > 0 ? current : []));
        }
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    };

    loadTables();

    const releaseSocket = acquireSocket({
      onUpdated: (row) => {
        setTablesState((current) => {
          const idx = findTableIndex(current, row.id);
          if (idx === -1) return current;
          const next = [...current];
          next[idx] = mapBackendTable(row, current[idx]);
          writeCache(next);
          return next;
        });
      },
      onCreated: (row) => {
        setTablesState((current) => {
          if (findTableIndex(current, row.id) !== -1) return current;
          const next = [...current, mapBackendTable(row)];
          writeCache(next);
          return next;
        });
      },
      onDeleted: ({ id }) => {
        setTablesState((current) => {
          const next = current.filter((t) => t.backendId !== id);
          writeCache(next);
          return next;
        });
      },
    });

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
            copy[idx] = mapBackendTable(result.updated, copy[idx]);
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
