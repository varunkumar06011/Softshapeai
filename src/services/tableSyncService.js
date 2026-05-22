import { useState, useEffect, useCallback, useRef } from 'react';

// Using PieSocket's free public demo API key for realtime pub/sub without backend config
const PIESOCKET_API_KEY = "VCXCEuvhGcBDP7XhiJJUDvR1e1PNwgvPAY2ZeMyB";
const ROOM_ID = "softshape_tables_demo_1";
const WS_URL = `wss://free.blr2.piesocket.com/v3/${ROOM_ID}?api_key=${PIESOCKET_API_KEY}`;

const TABLE_STATUS = {
  FREE: 'Free',
  OCCUPIED: 'Occupied',
  PREPARING: 'Preparing',
  READY: 'Ready',
  BILLING: 'Waiting Bill'
};

function generateDefaultTables() {
  return Array.from({ length: 24 }, (_, i) => ({
    id: i + 1,
    status: i % 5 === 0 ? TABLE_STATUS.OCCUPIED : TABLE_STATUS.FREE,
    guests: i % 5 === 0 ? 4 : 0,
    time: i % 5 === 0 ? '24m' : null,
    captainId: i % 5 === 0 ? 'C1' : null,
    kotHistory: i % 5 === 0 ? [
      { 
        id: '1001', 
        time: '12:15 PM', 
        items: [
          { n: 'Chicken Biryani', q: 2, p: 450, s: 'Served' },
          { n: 'Coke', q: 2, p: 60, s: 'Served' }
        ] 
      }
    ] : [],
    currentBill: i % 5 === 0 ? 1020 : 0
  }));
}

// Global state to avoid multiple socket connections in one browser if multiple hooks are used
let globalSocket = null;
let globalTables = null;
const subscribers = new Set();
let isConnecting = false;

function broadcastUpdate(tables) {
  if (globalSocket && globalSocket.readyState === WebSocket.OPEN) {
    globalSocket.send(JSON.stringify({ type: 'SYNC_TABLES', payload: tables }));
  }
}

function notifySubscribers() {
  subscribers.forEach(callback => callback(globalTables));
}

function initSocket() {
  if (globalSocket || isConnecting) return;
  isConnecting = true;

  try {
    globalSocket = new WebSocket(WS_URL);

    globalSocket.onopen = () => {
      console.log("[TableSync] Connected to Realtime Relay");
      isConnecting = false;
      // Request latest state from any other connected peer
      globalSocket.send(JSON.stringify({ type: 'REQUEST_STATE' }));
      
      // If no peer answers in 1.5s and we don't have tables, load defaults
      setTimeout(() => {
        if (!globalTables) {
          // Check localStorage as a final fallback before defaults
          const saved = localStorage.getItem('softshape_tables_v2');
          globalTables = saved ? JSON.parse(saved) : generateDefaultTables();
          notifySubscribers();
          broadcastUpdate(globalTables); // Inform future peers
        }
      }, 1500);
    };

    globalSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'REQUEST_STATE' && globalTables) {
          // Someone asked for state, and we have it, so send it back
          broadcastUpdate(globalTables);
        } else if (data.type === 'SYNC_TABLES' && data.payload) {
          // Received updated state from another peer
          globalTables = data.payload;
          localStorage.setItem('softshape_tables_v2', JSON.stringify(globalTables));
          notifySubscribers();
        }
      } catch (err) {
        // Ignore parsing errors for non-JSON messages
      }
    };

    globalSocket.onclose = () => {
      console.log("[TableSync] Disconnected. Reconnecting...");
      globalSocket = null;
      isConnecting = false;
      setTimeout(initSocket, 3000);
    };

    globalSocket.onerror = (err) => {
      console.error("[TableSync] WebSocket Error", err);
      globalSocket?.close();
    };
  } catch (err) {
    isConnecting = false;
    console.error("[TableSync] Connection failed", err);
  }
}

export function useTableSync() {
  const [tables, setTablesState] = useState(() => {
    if (globalTables) return globalTables;
    const saved = localStorage.getItem('softshape_tables_v2');
    return saved ? JSON.parse(saved) : null;
  });

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    initSocket();

    const handleUpdate = (newTables) => {
      setTablesState(newTables);
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 800);
    };

    subscribers.add(handleUpdate);
    
    // Ensure component gets initial global tables if it already exists
    if (globalTables) {
      handleUpdate(globalTables);
    }

    const handleStorageChange = (e) => {
      if (e.key === 'softshape_tables_v2' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          globalTables = parsed;
          handleUpdate(parsed);
        } catch (err) {}
      }
    };
    
    const handleCustomEvent = (e) => {
      if (e.detail) {
        globalTables = e.detail;
        handleUpdate(e.detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('softshape_tables_updated', handleCustomEvent);

    return () => {
      subscribers.delete(handleUpdate);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('softshape_tables_updated', handleCustomEvent);
    };
  }, []);

  const setTables = useCallback((updater) => {
    const currentData = globalTables || tables || generateDefaultTables();
    const nextTables = typeof updater === 'function' ? updater(currentData) : updater;
    globalTables = nextTables;
    localStorage.setItem('softshape_tables_v2', JSON.stringify(nextTables));
    
    // Optimistic local update
    setTablesState(nextTables);
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 800);

    // Broadcast globally
    broadcastUpdate(nextTables);
    
    // Notify other components in the same window
    notifySubscribers();
    
    // Dispatch custom event for any legacy listeners
    try {
      window.dispatchEvent(new CustomEvent('softshape_tables_updated', { detail: nextTables }));
    } catch (_) {}
  }, [tables]);

  return { tables: tables || generateDefaultTables(), setTables, isSyncing, TABLE_STATUS };
}
