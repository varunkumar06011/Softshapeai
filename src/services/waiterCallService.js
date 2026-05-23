import { useState, useEffect, useCallback } from 'react';

// Using PieSocket relay for distributed frontend communication
// Re-using the same API key as menuSyncService but connecting to a separate room for isolation.
const PIESOCKET_API_KEY = "VCXCEuvhGcBDP7XhiJJUDvR1e1PNwgvPAY2ZeMyB";
const WAITER_CALL_ROOM = "softshape_waiter_calls_demo";
const WS_URL = `wss://free.blr2.piesocket.com/v3/${WAITER_CALL_ROOM}?api_key=${PIESOCKET_API_KEY}`;

let globalSocket = null;
let isConnecting = false;
const subscribers = new Set();

function initSocket() {
  if (globalSocket || isConnecting) return;
  isConnecting = true;

  try {
    globalSocket = new WebSocket(WS_URL);

    globalSocket.onopen = () => {
      console.log('[WaiterCallSync] Connected to Realtime Relay');
      isConnecting = false;
    };

    globalSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Notify all subscribers of the new event
        subscribers.forEach(callback => callback(data));
      } catch (err) {
        console.error("Failed to parse socket message", err);
      }
    };

    globalSocket.onclose = () => {
      console.log('[WaiterCallSync] Disconnected. Reconnecting in 3s...');
      globalSocket = null;
      isConnecting = false;
      setTimeout(initSocket, 3000);
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
  }
}

export function useWaiterCalls() {
  const [activeCalls, setActiveCalls] = useState([]);

  useEffect(() => {
    initSocket();

    const handleMessage = (data) => {
      if (data.type === 'customer:call_waiter') {
        const { tableId, callId, timestamp } = data.payload;
        // Check if we already have it to avoid duplicates
        setActiveCalls(prev => {
          if (prev.find(c => c.callId === callId)) return prev;
          return [...prev, { tableId, callId, timestamp, status: 'pending' }];
        });
      } else if (data.type === 'captain:accept_waiter_call') {
        const { callId, captainId, captainName } = data.payload;
        setActiveCalls(prev => {
          const callExists = prev.find(c => c.callId === callId);
          if (!callExists) return prev; // Not relevant or already removed
          
          // Update the call to show it was accepted
          return prev.map(c => 
            c.callId === callId 
              ? { ...c, status: 'accepted', acceptedBy: { id: captainId, name: captainName } } 
              : c
          );
        });
        
        // Auto-remove accepted calls after a short delay (e.g. 5 seconds)
        setTimeout(() => {
          setActiveCalls(prev => prev.filter(c => c.callId !== callId));
        }, 5000);
      }
    };

    subscribers.add(handleMessage);

    return () => {
      subscribers.delete(handleMessage);
    };
  }, []);

  const clearCall = useCallback((callId) => {
    setActiveCalls(prev => prev.filter(c => c.callId !== callId));
  }, []);

  return { activeCalls, clearCall };
}
