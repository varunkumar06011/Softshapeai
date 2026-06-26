import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { API_BASE } from "../services/apiConfig";
import { authService } from "../services/authService";

let socketInstance = null;
let eventQueue = [];
let isProcessingQueue = false;

export function reconnectSocket(token) {
  if (!socketInstance) return;
  socketInstance.auth = { token };
  socketInstance.disconnect().connect();
}

export function disconnectSocket() {
  if (!socketInstance) return;
  try {
    socketInstance.disconnect();
  } catch {
    /* ignore */
  }
  socketInstance = null;
  eventQueue = [];
  isProcessingQueue = false;
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
      randomizationFactor: 0.5,
      timeout: 45000,           // 45s — covers Railway cold starts (can take 30s)
      autoConnect: true,
      forceNew: false,
      addTrailingSlash: false,
      // Prevent server-side timeout killing idle connections
      pingInterval: 25000,   // slightly under server's 30s
      pingTimeout: 60000,    // well under server's 120s — gives real time to recover
      auth: { token: authService.getToken() },
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

  useEffect(() => {
    if (!restaurantId) return;

    const join = () => {
      const prev = prevRestaurantIdRef.current;
      if (prev && prev !== restaurantId) {
        socket.emit("leave", prev);
      }
      socket.emit("join", restaurantId);
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

    // Re-emit join:public on every connect/reconnect
    publicSocketInstance.on("connect", () => {
      console.log("[PublicSocket] Connected — joining public room");
      publicSocketInstance.emit("join:public", { slug, tableId, sig });
    });

    publicSocketInstance.on("connect_error", (err) => {
      console.warn("[PublicSocket] Connection error:", err.message);
    });

    publicSocketInstance.on("auth:error", (err) => {
      console.warn("[PublicSocket] Auth error:", err.message);
    });

    // Store globally for menu-item-updated listeners
    window.__softshape_public_socket = publicSocketInstance;
  }

  return publicSocketInstance;
}

export function disconnectPublicSocket() {
  if (publicSocketInstance) {
    try {
      publicSocketInstance.disconnect();
    } catch {
      /* ignore */
    }
    publicSocketInstance = null;
    window.__softshape_public_socket = null;
  }
}
