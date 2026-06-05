import { useState, useEffect, useCallback } from 'react';
import { getSocket } from "../hooks/useSocket";

const subscribers = new Set();
let isListenerAttached = false;

/**
 * Ensures the socket is connected to the restaurant room and
 * the global `waiter:event` listener is registered exactly once.
 *
 * Safe to call multiple times — idempotent.
 */
export function initSocket() {
  const socket = getSocket();

  // ── Room join logic ──────────────────────────────────────────
  const joinRoom = () => {
    if (!socket.connected) {
      console.log("[WaiterCallSync] joinRoom called but socket not connected — will join on connect");
      return;
    }
    socket.emit("join", "softshape-restaurant");
    console.log("[WaiterCallSync] Joined room softshape-restaurant (id:", socket.id, ")");
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
      } else if (e.key === 'softshape_waiter_calls' && e.newValue) {
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
      const db = JSON.parse(localStorage.getItem('softshape_waiter_calls') || '{}');
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
      const db = JSON.parse(localStorage.getItem('softshape_waiter_calls') || '{}');
      const tableKey = Object.keys(db).find(key => db[key].callId === callId);
      if (tableKey) {
        delete db[tableKey];
        localStorage.setItem('softshape_waiter_calls', JSON.stringify(db));
      }
    } catch (e) {
      console.error("[WaiterCallSync] Failed to clear call from localStorage", e);
    }
  }, []);

  return { activeCalls, clearCall };
}
