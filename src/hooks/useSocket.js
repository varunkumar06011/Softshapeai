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
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 10000,
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
