// ─────────────────────────────────────────────────────────────────────────────
// Waiter Call Service — Real-time waiter call management via Socket.IO
// ─────────────────────────────────────────────────────────────────────────────
// Manages waiter calls from customer QR menus to restaurant staff:
//   - Listens to Socket.IO events for incoming waiter calls
//   - Provides a React hook (useWaiterCalls) for components to subscribe
//   - Tracks active and resolved calls
//   - Supports both authenticated (staff) and public (customer) socket channels
//   - Per-restaurant call tracking with localStorage persistence
//
// Socket events:
//   - 'waiter_call' — new call from a customer (received by staff)
//   - 'waiter_call_resolved' — call marked as resolved by staff
//
// The service uses a pub/sub pattern so multiple components can subscribe
// to waiter call updates without duplicate socket listeners.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { getSocket, getPublicSocket } from "../hooks/useSocket";
import { API_BASE } from "./apiConfig";
import { getTenantScopedKey } from "../utils/cacheKeys";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";

export { API_BASE };

// Set of subscriber functions notified on waiter call state changes
const subscribers = new Set();
// Whether the authenticated socket listener has been attached
let isListenerAttached = false;
// Whether the public (unauthenticated) socket listener has been attached
let isPublicListenerAttached = false;

/**
 * Reset listener flags so that socket listeners are re-attached
 * after a disconnect/reconnect cycle. Called by disconnectSocket()
 * in useSocket.js to prevent stale closures.
 */
export function resetWaiterCallListeners() {
  isListenerAttached = false;
  isPublicListenerAttached = false;
}

/**
 * Ensures the socket is connected to the restaurant room and
 * the global `waiter:event` listener is registered exactly once.
 *
 * Safe to call multiple times — idempotent.
 */
export function initSocket() {
  const socket = getSocket();

  // ── Room join logic ──────────────────────────────────────────
  const restaurantId = getCurrentRestaurantId();
  const joinRoom = () => {
    if (!socket.connected) {
      console.log("[WaiterCallSync] joinRoom called but socket not connected — will join on connect");
      return;
    }
    if (!restaurantId) {
      console.warn("[WaiterCallSync] No restaurantId available — cannot join room");
      return;
    }
    socket.emit("join", restaurantId);
    console.log("[WaiterCallSync] Joined room", restaurantId, "(id:", socket.id, ")");
  };

  // Join immediately if already connected
  if (socket.connected) {
    joinRoom();
  }

  // ── Global event listeners (exactly once) ─────────────────────
  if (!isListenerAttached) {
    // Re-join on every connect/reconnect — this is the CRITICAL handler
    // that ensures room membership survives network drops.
    socket.on("connect", () => {
      console.log("[WaiterCallSync] Socket connected/reconnected — joining room");
      joinRoom();
    });

    // Listen for waiter events relayed by the server
    socket.on("waiter:event", (data) => {
      console.log("[WaiterCallSync] Received waiter:event via Socket.io", data);
      subscribers.forEach(callback => {
        try { callback(data); } catch (e) { console.error("[WaiterCallSync] Subscriber error", e); }
      });
    });

    // Also listen on the manager-level reconnect event as a safety net
    socket.io.on("reconnect", (attempt) => {
      console.log(`[WaiterCallSync] Socket.io manager reconnected after ${attempt} attempt(s)`);
      // The "connect" handler above will fire automatically, but log here for visibility
    });

    isListenerAttached = true;
    console.log("[WaiterCallSync] Global listeners registered");
  }
}

/**
 * Initialize public socket for customer-facing pages.
 * Uses a separate socket instance (getPublicSocket) with HMAC signature
 * verification instead of JWT auth.
 */
export function initPublicSocket(slug, tableId, sig) {
  const socket = getPublicSocket(slug, tableId, sig);

  if (!isPublicListenerAttached) {
    // Listen for waiter events (captain acknowledgments relayed by server)
    socket.on("waiter:event", (data) => {
      console.log("[WaiterCallSync] Received waiter:event via public socket", data);
      subscribers.forEach(callback => {
        try { callback(data); } catch (e) { console.error("[WaiterCallSync] Subscriber error", e); }
      });
    });

    isPublicListenerAttached = true;
    console.log("[WaiterCallSync] Public socket listeners registered");
  }
}

/**
 * Broadcast a waiter call event to all captain panels via Socket.io.
 *
 * Flow:
 *   1. Emit over Socket.io (primary — real-time across devices)
 *   2. localStorage event (cross-tab fallback on same device)
 *
 * NOTE: We do NOT notify in-process subscribers here — the server
 * relay (socket.to(room).emit) handles delivery to captain tabs.
 * Calling subscribers locally would cause double-delivery if the
 * captain panel runs in the same JS context.
 *
 * Returns `true` if the socket was connected at emit time.
 */
export function broadcastWaiterEvent(type, payload, outlet = 'restaurant') {
  const socket = getSocket();
  const restaurantId = `softshape-${outlet}`;

  // Ensure socket is ready
  if (!socket.connected) {
    console.warn("[WaiterCallSync] Socket not connected — calling connect() before emit");
    socket.connect();
    // socket.io will buffer the emit and send once connected
  }

  console.log(
    "[WaiterCallSync] Broadcasting waiter:event",
    { type, payload, connected: socket.connected, id: socket.id }
  );

  // Primary: emit to server which relays to all room members (excluding sender)
  socket.emit("waiter:event", { restaurantId, type, payload });

  // Cross-tab fallback via localStorage (same browser, different tab)
  try {
    const eventKey = `softshape_local_event_${Date.now()}_${Math.random()}`;
    localStorage.setItem(eventKey, JSON.stringify({ type, payload }));
    setTimeout(() => localStorage.removeItem(eventKey), 1000);
  } catch (e) {
    console.error("[WaiterCallSync] Local storage fallback failed", e);
  }

  return socket.connected;
}

/**
 * React hook that tracks active waiter calls in real time.
 *
 * Listens for:
 *  - Socket.io `waiter:event` (cross-device, primary)
 *  - localStorage `storage` events (cross-tab fallback)
 *  - localStorage DB on mount (survive page refresh)
 */
export function useWaiterCalls() {
  const [activeCalls, setActiveCalls] = useState([]);

  useEffect(() => {
    // Ensure socket is connected and listening
    initSocket();

    const handleMessage = (data) => {
      if (!data || !data.type) {
        console.warn("[WaiterCallSync] Received malformed waiter event", data);
        return;
      }

      if (data.type === 'customer:call_waiter') {
        const { tableId, callId, timestamp, source } = data.payload || {};

        if (!tableId || !callId) {
          console.warn("[WaiterCallSync] call_waiter missing tableId or callId", data.payload);
          return;
        }

        console.log("[WaiterCallSync] Processing call_waiter:", { tableId, callId, source });

        setActiveCalls(prev => {
          // Prevent duplicate by callId
          if (prev.find(c => c.callId === callId)) {
            console.log("[WaiterCallSync] Duplicate callId ignored:", callId);
            return prev;
          }
          const newCall = {
            tableId,
            callId,
            timestamp,
            localTimestamp: Date.now(),
            status: 'pending',
            source: source || 'restaurant'
          };
          console.log("[WaiterCallSync] Adding new call to activeCalls:", newCall);
          return [...prev, newCall];
        });

      } else if (data.type === 'captain:accept_waiter_call') {
        const { callId, captainId, captainName } = data.payload || {};

        if (!callId) {
          console.warn("[WaiterCallSync] accept_waiter_call missing callId", data.payload);
          return;
        }

        console.log("[WaiterCallSync] Processing accept_waiter_call:", { callId, captainId, captainName });

        setActiveCalls(prev => {
          const callExists = prev.find(c => c.callId === callId);
          if (!callExists) return prev;
          
          return prev.map(c => 
            c.callId === callId 
              ? { ...c, status: 'accepted', acceptedBy: { id: captainId, name: captainName } } 
              : c
          );
        });
        
        // Auto-remove accepted calls after 12 seconds
        setTimeout(() => {
          setActiveCalls(prev => prev.filter(c => c.callId !== callId));
        }, 12000);
      }
    };

    // ── Cross-tab sync via localStorage ───────────────────────────
    const handleStorage = (e) => {
      if (e.key && e.key.startsWith('softshape_local_event_') && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          handleMessage(data);
        } catch (err) {
          console.error("[WaiterCallSync] Failed to parse localStorage event", err);
        }
      } else if (e.key === getTenantScopedKey('softshape_waiter_calls') && e.newValue) {
        try {
          const db = JSON.parse(e.newValue);
          const pending = Object.values(db).filter(c => c.status === 'pending');
          setActiveCalls(prev => {
            const newCalls = [...prev];
            let changed = false;
            pending.forEach(p => {
              if (!newCalls.find(c => c.callId === p.callId)) {
                newCalls.push({ ...p, localTimestamp: p.timestamp });
                changed = true;
              }
            });
            return changed ? newCalls : prev;
          });
        } catch (err) {
          console.error("[WaiterCallSync] Failed to parse waiter_calls DB", err);
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    // ── Load persisted calls from localStorage (survive refresh) ──
    try {
      const db = JSON.parse(localStorage.getItem(getTenantScopedKey('softshape_waiter_calls')) || '{}');
      const now = Date.now();
      const STALE_MS = 5 * 60 * 1000; // 5 min
      const pending = Object.values(db).filter(c =>
        c.status === 'pending' && (now - (c.timestamp || 0)) < STALE_MS
      );
      if (pending.length > 0) {
        setActiveCalls(prev => {
          const newCalls = [...prev];
          pending.forEach(p => {
            if (!newCalls.find(c => c.callId === p.callId)) {
               // Use original timestamp for initial time left calculation
               newCalls.push({ ...p, localTimestamp: p.timestamp });
            }
          });
          return newCalls;
        });
      }
    } catch (e) {
      console.error("[WaiterCallSync] Failed to load persisted calls", e);
    }

    // Register this component's handler
    subscribers.add(handleMessage);

    return () => {
      subscribers.delete(handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const clearCall = useCallback((callId) => {
    console.log("[WaiterCallSync] Clearing call:", callId);
    setActiveCalls(prev => prev.filter(c => c.callId !== callId));
    try {
      const db = JSON.parse(localStorage.getItem(getTenantScopedKey('softshape_waiter_calls')) || '{}');
      const tableKey = Object.keys(db).find(key => db[key].callId === callId);
      if (tableKey) {
        delete db[tableKey];
        localStorage.setItem(getTenantScopedKey('softshape_waiter_calls'), JSON.stringify(db));
      }
    } catch (e) {
      console.error("[WaiterCallSync] Failed to clear call from localStorage", e);
    }
  }, []);

  return { activeCalls, clearCall };
}
