import { useState, useEffect, useCallback } from 'react';

// Using PieSocket relay for distributed frontend communication
// Re-using the same API key as menuSyncService but connecting to a separate room for isolation.
const PIESOCKET_API_KEY = "VCXCEuvhGcBDP7XhiJJUDvR1e1PNwgvPAY2ZeMyB";
const WAITER_CALL_ROOM = "softshape_waiter_calls_demo";
const WS_URL = `wss://free.blr2.piesocket.com/v3/${WAITER_CALL_ROOM}?api_key=${PIESOCKET_API_KEY}`;

let globalSocket = null;
let isConnecting = false;
let reconnectAttempts = 0;
let pingInterval = null;
const MAX_RECONNECT_DELAY = 30000; // cap at 30s
const subscribers = new Set();

function getReconnectDelay() {
  // Exponential backoff: 3s, 6s, 12s, 24s, 30s max
  return Math.min(3000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
}

function startPing() {
  stopPing();
  pingInterval = setInterval(() => {
    if (globalSocket && globalSocket.readyState === WebSocket.OPEN) {
      try { globalSocket.send(JSON.stringify({ type: 'ping' })); } catch (_) {}
    }
  }, 25000); // every 25s — keeps connection alive
}

function stopPing() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
}

export function initSocket() {
  if (globalSocket || isConnecting) return;
  isConnecting = true;

  try {
    globalSocket = new WebSocket(WS_URL);

    globalSocket.onopen = () => {
      console.log('[WaiterCallSync] Connected to Realtime Relay');
      isConnecting = false;
      reconnectAttempts = 0; // reset backoff on success
      startPing();
    };

    globalSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping' || data.type === 'pong') return; // ignore keepalives
        subscribers.forEach(callback => callback(data));
      } catch (err) {
        console.error("Failed to parse socket message", err);
      }
    };

    globalSocket.onclose = () => {
      const delay = getReconnectDelay();
      console.log(`[WaiterCallSync] Disconnected. Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts + 1})`);
      globalSocket = null;
      isConnecting = false;
      stopPing();
      reconnectAttempts++;
      setTimeout(initSocket, delay);
    };

    globalSocket.onerror = () => {
      globalSocket?.close();
    };
  } catch (err) {
    isConnecting = false;
    console.error('[WaiterCallSync] Connection failed', err);
  }
}

// Function to broadcast an event globally
export function broadcastWaiterEvent(type, payload) {
  if (globalSocket && globalSocket.readyState === WebSocket.OPEN) {
    globalSocket.send(JSON.stringify({ type, payload }));
  } else if (!globalSocket || globalSocket.readyState !== WebSocket.OPEN) {
    // If socket isn't open yet, we can try to initialize it or just rely on the fallback below
    initSocket();
  }

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
