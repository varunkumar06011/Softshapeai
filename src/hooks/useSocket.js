import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { API_BASE } from "../services/apiConfig";

let socketInstance = null;
let eventQueue = [];
let isProcessingQueue = false;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(API_BASE, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 5000, // 5s backoff as required
      reconnectionDelayMax: 30000,
      timeout: 20000,
      addTrailingSlash: false,
    });

    // Queue pending events during disconnect
    socketInstance.on("disconnect", () => {
      console.warn("[Socket] Disconnected, queuing events");
    });

    socketInstance.on("connect", () => {
      console.log("[Socket] Reconnected, processing queued events");
      processEventQueue();
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
