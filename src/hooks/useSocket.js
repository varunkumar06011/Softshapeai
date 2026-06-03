import { useEffect } from "react";
import { io } from "socket.io-client";
import { API_BASE } from "../services/apiConfig";

let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(API_BASE, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      addTrailingSlash: false,
    });
  }

  return socketInstance;
}

export function useSocket(restaurantId) {
  const socket = getSocket();

  useEffect(() => {
    if (!restaurantId) return;

    const join = () => socket.emit("join", restaurantId);
    join();
    socket.on("connect", join);

    return () => {
      socket.off("connect", join);
    };
  }, [restaurantId, socket]);

  return socket;
}
