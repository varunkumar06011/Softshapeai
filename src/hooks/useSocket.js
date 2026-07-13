// ─────────────────────────────────────────────────────────────────────────────
// useSocket — Socket.IO connection management and event queueing hook
// ─────────────────────────────────────────────────────────────────────────────
// Manages a singleton Socket.IO client connection with:
//   - JWT authentication (sends token in auth handshake)
//   - Auto-reconnect with exponential backoff
//   - Event queue: buffers events emitted while disconnected, replays on reconnect
//   - Event processing queue: ensures events are processed in order (FIFO)
//   - Waiter call listener reset on reconnect
//
// The socket instance is shared across the app (module-level singleton).
// Events are queued during disconnection and flushed when the socket reconnects.
//
// Exports:
//   useSocket(eventHandlers) — React hook that subscribes to socket events
//   reconnectSocket(token)   — forces a reconnect with a new JWT token
//   getSocket()              — returns the raw socket instance (for testing)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { API_BASE } from "../services/apiConfig";
import { safeGetJSON } from "../utils/safeParseJSON";

// Singleton socket instance — shared across the entire app
let socketInstance = null;
// Buffer for events emitted while socket is disconnected
let eventQueue = [];
// Ensures events are processed in order (FIFO)
let isProcessingQueue = false;

// ── Socket disconnect listener system (replaces window.dispatchEvent) ──
const socketDisconnectListeners = new Set();

export function onSocketDisconnect(callback) {
  socketDisconnectListeners.add(callback);
  return () => socketDisconnectListeners.delete(callback);
}

function notifySocketDisconnect() {
  socketDisconnectListeners.forEach(cb => {
    try { cb(); } catch (e) { console.debug('[Socket] disconnect listener error:', e); }
  });
}

export function reconnectSocket(token) {
  if (!socketInstance) return;
  socketInstance.auth = { token };
  socketInstance.disconnect().connect();
}

export function disconnectSocket() {
  if (!socketInstance) return;
  try {
    socketInstance.disconnect();
  } catch (e) {
    console.debug('[Socket] disconnectSocket error:', e);
  }
  socketInstance = null;
  eventQueue = [];
  isProcessingQueue = false;
  notifySocketDisconnect();
}

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(API_BASE, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      randomizationFactor: 0.7,  // 0.7 — more jitter to prevent thundering herd reconnects
      timeout: 45000,           // 45s — covers Railway cold starts (can take 30s)
      autoConnect: true,
      forceNew: false,
      addTrailingSlash: false,
      // Prevent server-side timeout killing idle connections
      pingInterval: 25000,   // slightly under server's 30s
      pingTimeout: 60000,    // well under server's 120s — gives real time to recover
      auth: { token: localStorage.getItem('ss_token') },
    });

    // Queue pending events during disconnect
    socketInstance.on("disconnect", () => {
      console.warn("[Socket] Disconnected, queuing events");
    });

    socketInstance.on("connect", () => {
      console.log("[Socket] Reconnected, processing queued events");
      processEventQueue();
    });

    socketInstance.on("connect_error", (err) => {
      console.warn("[Socket] Connection error:", err.message);
    });

    socketInstance.on("reconnect_attempt", (attempt) => {
      console.log(`[Socket] Reconnect attempt #${attempt}`);
    });

    socketInstance.on("reconnect_failed", () => {
      console.error("[Socket] All reconnect attempts failed");
    });

    socketInstance.io.on("ping", () => {
      console.debug("[Socket] Ping sent to server");
    });
  }

  return socketInstance;
}

function processEventQueue() {
  if (isProcessingQueue || eventQueue.length === 0) return;

  isProcessingQueue = true;
  console.log(`[Socket] Processing ${eventQueue.length} queued events`);

  while (eventQueue.length > 0) {
    const { event, data } = eventQueue.shift();
    try {
      socketInstance.emit(event, data);
    } catch (error) {
      console.error("[Socket] Failed to emit queued event:", error);
    }
  }

  isProcessingQueue = false;
}

export function safeEmit(event, data) {
  const socket = getSocket();
  if (socket.connected) {
    socket.emit(event, data);
  } else {
    console.warn(`[Socket] Not connected — queuing event: ${event}`);
    eventQueue.push({ event, data });
  }
}

export function useSocket(restaurantId) {
  const socket = getSocket();
  const prevRestaurantIdRef = useRef(null);
  const prevTokenRef = useRef(localStorage.getItem('ss_token'));

  useEffect(() => {
    if (!restaurantId) return;

    const join = () => {
      const prev = prevRestaurantIdRef.current;
      if (prev && prev !== restaurantId) {
        socket.emit("leave", prev);
      }
      socket.emit("join", restaurantId);
      // Also join the shared kitchen room for low-stock alerts
      try {
        const rest = safeGetJSON('ss_restaurant', {});
        const kitchenId = rest.sharedKitchenOutletId || restaurantId;
        if (kitchenId !== restaurantId) {
          socket.emit("join:kitchen", kitchenId);
        }
      } catch (e) { console.debug('[Socket] ss_restaurant parse error:', e); }
      prevRestaurantIdRef.current = restaurantId;
    };

    join();
    socket.on("connect", join);

    return () => {
      socket.off("connect", join);
      if (prevRestaurantIdRef.current) {
        socket.emit("leave", prevRestaurantIdRef.current);
        prevRestaurantIdRef.current = null;
      }
    };
  }, [restaurantId, socket]);

  // Reconnect socket when auth token changes (e.g. re-login as different user)
  useEffect(() => {
    const checkToken = () => {
      const currentToken = localStorage.getItem('ss_token');
      if (currentToken !== prevTokenRef.current) {
        prevTokenRef.current = currentToken;
        if (currentToken) {
          reconnectSocket(currentToken);
        }
      }
    };
    // Check on mount and when window regains focus (e.g. switching back from another tab/portal)
    checkToken();
    window.addEventListener('focus', checkToken);
    return () => window.removeEventListener('focus', checkToken);
  }, []);

  return socket;
}

// ─── Public (customer-facing) socket — separate instance ─────────────
// Customers don't have JWT tokens. This is a completely separate socket
// instance from the staff singleton above, avoiding auth conflicts.
let publicSocketInstance = null;

export function getPublicSocket(slug, tableId, sig) {
  if (!publicSocketInstance) {
    publicSocketInstance = io(API_BASE, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      randomizationFactor: 0.5,
      timeout: 45000,
      autoConnect: true,
      forceNew: true,
      addTrailingSlash: false,
      pingInterval: 25000,
      pingTimeout: 60000,
      // No auth token — public connection
    });

    // Store params on the socket instance so the reconnect handler
    // always uses current values, avoiding stale closure bugs
    publicSocketInstance.__publicParams = { slug, tableId, sig };

    // Re-emit join:public on every connect/reconnect using stored params
    publicSocketInstance.on("connect", () => {
      const params = publicSocketInstance.__publicParams;
      if (params) {
        console.log("[PublicSocket] Connected — joining public room");
        publicSocketInstance.emit("join:public", {
          slug: params.slug,
          tableId: params.tableId,
          sig: params.sig,
        });
      }
    });

    publicSocketInstance.on("connect_error", (err) => {
      console.warn("[PublicSocket] Connection error:", err.message);
    });

    publicSocketInstance.on("auth:error", (err) => {
      console.warn("[PublicSocket] Auth error:", err.message);
    });

    // Store globally for menu-item-updated listeners
    // (accessed via getPublicSocketInstance() — no longer on window)
  } else {
    // Update stored params in case they changed (e.g. different table)
    publicSocketInstance.__publicParams = { slug, tableId, sig };
  }

  return publicSocketInstance;
}

export function disconnectPublicSocket() {
  if (publicSocketInstance) {
    try {
      publicSocketInstance.disconnect();
    } catch (e) {
      console.debug('[PublicSocket] disconnect error:', e);
    }
    publicSocketInstance = null;
  }
}

// Returns the current public socket instance without creating one.
// Use this instead of window.__softshape_public_socket.
export function getPublicSocketInstance() {
  return publicSocketInstance;
}
