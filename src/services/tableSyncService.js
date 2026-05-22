import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { API_BASE } from "./apiConfig";
import { fetchTables, updateTableSession } from "./tableApi";

const TABLES_CACHE_KEY = "softshape_tables_cache_v3";
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds as fallback when socket is down

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
  const persistedStatus = row.workflowStatus || toFrontendStatus(dbStatus);

  const base = {
    backendId: row.id,
    id: parseDisplayId(row.number),
    number: row.number,
    dbStatus,
    status: persistedStatus,
    capacity: row.capacity,
    sectionId: row.sectionId,
    section: row.section,
    guests: row.guests ?? 0,
    time: row.sessionStartedAt ?? null,
    captainId: row.captainId ?? null,
    kotHistory: Array.isArray(row.kotHistory) ? row.kotHistory : [],
    currentBill: row.currentBill ?? 0,
  };

  if (!existing) return base;

  return {
    ...base,
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

// ─── Socket Management ───────────────────────────────────────────────
let sharedSocket = null;
let socketRefCount = 0;
let socketListenersAttached = false;
let socketConnected = false;

function attachSocketLogging(socket) {
  if (socketListenersAttached) return;
  socketListenersAttached = true;

  socket.on("connect", () => {
    socketConnected = true;
    console.log("[Socket] Connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    socketConnected = false;
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    socketConnected = false;
    console.log("[Socket] Connection error:", err.message);
  });

  socket.on("reconnect_failed", () => {
    socketConnected = false;
    console.warn("[Socket] All reconnection attempts failed — falling back to REST polling");
  });
}

function acquireSocket(handlers) {
  const noop = () => {};

  try {
    if (!sharedSocket) {
      console.log("[TableSync] Socket.io connecting to", API_BASE);
      sharedSocket = io(API_BASE, {
        // Match backend: path without trailing slash, polling first
        path: "/socket.io",
        transports: ["polling", "websocket"],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 15000,
        timeout: 10000,
        // Don't add trailing slash — fixes reverse proxy 502
        addTrailingSlash: false,
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
        socketConnected = false;
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

// ─── Hook ────────────────────────────────────────────────────────────
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

    // ── Load tables from API ──
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

    // ── Socket.io for real-time updates ──
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

    // ── REST Polling fallback ──
    // Poll the API every POLL_INTERVAL_MS so that even if Socket.io
    // is broken (502 on reverse proxy), table changes from other users
    // still appear within a few seconds.
    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      try {
        const apiTables = await fetchTables();
        if (cancelled || !apiTables || !Array.isArray(apiTables) || apiTables.length === 0) return;

        setTablesState((current) => {
          const merged = mergeTablesFromApi(apiTables, current);
          writeCache(merged);
          return merged;
        });
      } catch {
        // Silently ignore poll failures — we'll try again next interval
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      releaseSocket();
      clearInterval(pollInterval);
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
