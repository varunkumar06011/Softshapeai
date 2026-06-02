import { useState, useEffect, useCallback } from 'react';
import { getSocket } from "../hooks/useSocket";

const subscribers = new Set();
let isListenerAttached = false;

export function initSocket() {
  const socket = getSocket();

  // Make sure the socket joins the restaurant room so it receives relayed events
  const joinRoom = () => {
    socket.emit("join", "softshape-restaurant");
  };

  if (socket.connected) {
    joinRoom();
  }
  socket.on("connect", joinRoom);

  if (!isListenerAttached) {
    socket.on("waiter:event", (data) => {
      console.log("[WaiterCallSync] Received waiter:event via Socket.io", data);
      subscribers.forEach(callback => callback(data));
    });
    isListenerAttached = true;
  }
}

// Function to broadcast an event globally
export function broadcastWaiterEvent(type, payload) {
  const socket = getSocket();
  const restaurantId = "softshape-restaurant"; // Match global config

  console.log("[WaiterCallSync] Broadcasting waiter:event via Socket.io", { type, payload });
  socket.emit("waiter:event", { restaurantId, type, payload });

  // Notify all components in the CURRENT tab immediately
  try {
    const data = { type, payload };
    subscribers.forEach(callback => callback(data));
  } catch (err) {}

  // Local fallback for cross-tab testing (works perfectly on localhost)
  try {
    const eventKey = `softshape_local_event_${Date.now()}_${Math.random()}`;
    localStorage.setItem(eventKey, JSON.stringify({ type, payload }));
    setTimeout(() => localStorage.removeItem(eventKey), 1000);
  } catch (e) {
    console.error("Local fallback failed", e);
  }
}

export function useWaiterCalls() {
  const [activeCalls, setActiveCalls] = useState([]);

  useEffect(() => {
    initSocket();

    const handleMessage = (data) => {
      if (data.type === 'customer:call_waiter') {
        const { tableId, callId, timestamp, source } = data.payload;
        setActiveCalls(prev => {
          if (prev.find(c => c.callId === callId)) return prev;
          return [...prev, { tableId, callId, timestamp, localTimestamp: Date.now(), status: 'pending', source }];
        });
      } else if (data.type === 'captain:accept_waiter_call') {
        const { callId, captainId, captainName } = data.payload;
        setActiveCalls(prev => {
          const callExists = prev.find(c => c.callId === callId);
          if (!callExists) return prev;
          
          return prev.map(c => 
            c.callId === callId 
              ? { ...c, status: 'accepted', acceptedBy: { id: captainId, name: captainName } } 
              : c
          );
        });
        
        setTimeout(() => {
          setActiveCalls(prev => prev.filter(c => c.callId !== callId));
        }, 12000);
      }
    };

    // Listen to local storage events for instant cross-tab sync
    const handleStorage = (e) => {
      if (e.key && e.key.startsWith('softshape_local_event_') && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          handleMessage(data);
        } catch (err) {}
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
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    // Load initial state from local DB to survive Captain Panel refreshes
    try {
      const db = JSON.parse(localStorage.getItem('softshape_waiter_calls') || '{}');
      const pending = Object.values(db).filter(c => c.status === 'pending');
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
    } catch (e) {}

    subscribers.add(handleMessage);

    return () => {
      subscribers.delete(handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const clearCall = useCallback((callId) => {
    setActiveCalls(prev => prev.filter(c => c.callId !== callId));
    try {
      const db = JSON.parse(localStorage.getItem('softshape_waiter_calls') || '{}');
      const tableKey = Object.keys(db).find(key => db[key].callId === callId);
      if (tableKey) {
        delete db[tableKey];
        localStorage.setItem('softshape_waiter_calls', JSON.stringify(db));
      }
    } catch (e) {}
  }, []);

  return { activeCalls, clearCall };
}
