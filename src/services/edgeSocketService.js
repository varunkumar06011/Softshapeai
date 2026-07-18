// ─────────────────────────────────────────────────────────────────────────────
// edgeSocketService.js — LAN WebSocket client for edge server real-time events
// ─────────────────────────────────────────────────────────────────────────────
// When the edge server is available, connects to its WebSocket endpoint (/ws)
// to receive real-time order and table updates over the LAN — without relying
// on the cloud Socket.IO server.
//
// Events from the edge WebSocket are re-dispatched as custom DOM events so
// that tableSyncService and other listeners can handle them uniformly:
//   edge:order:created   → { order, tableId, requestId }
//   edge:order:updated   → { orderId, tableId, kotNumber, requestId }
//   edge:order:settled   → { orderId, tableId, requestId }
//   edge:table:updated   → { table, tableId, requestId }
//
// Usage:
//   import { connectEdgeSocket, disconnectEdgeSocket } from '../services/edgeSocketService';
//   connectEdgeSocket(); // on mount / when edge becomes available
//   disconnectEdgeSocket(); // on unmount / when edge goes down
// ─────────────────────────────────────────────────────────────────────────────

import { getEdgeUrl, isEdgeAvailable } from './edgeHealth';

let ws = null;
let reconnectTimer = null;
let pingTimer = null;
let connected = false;
let listeners = new Set();

const RECONNECT_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 30000;

export function isEdgeSocketConnected() {
  return connected;
}

export function connectEdgeSocket() {
  // Don't connect if already connected or connecting
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  const edgeUrl = getEdgeUrl();
  if (!edgeUrl) return;

  // Convert http(s):// to ws(s)://
  const wsUrl = edgeUrl.replace(/^http/, 'ws') + '/ws';

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.warn('[EdgeSocket] Failed to create WebSocket:', err.message);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected = true;
    console.log('[EdgeSocket] Connected to', wsUrl);

    // Start keepalive ping
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // ignore
        }
      }
    }, PING_INTERVAL_MS);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'pong') return; // keepalive response

      // Re-dispatch as DOM event for tableSyncService and other listeners
      const eventType = `edge:${msg.type}`;
      const domEvent = new CustomEvent(eventType, { detail: msg.data });
      window.dispatchEvent(domEvent);

      // Also notify direct subscribers
      for (const listener of listeners) {
        try {
          listener(msg.type, msg.data);
        } catch (err) {
          console.error('[EdgeSocket] Listener error:', err);
        }
      }
    } catch (err) {
      // Non-JSON message — ignore
    }
  };

  ws.onerror = (err) => {
    console.warn('[EdgeSocket] WebSocket error');
  };

  ws.onclose = (event) => {
    connected = false;
    console.log('[EdgeSocket] Disconnected (code:', event.code, ')');
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    // Only reconnect if edge is still available
    scheduleReconnect();
  };
}

export function disconnectEdgeSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (ws) {
    ws.onclose = null; // prevent reconnect on intentional close
    ws.close();
    ws = null;
  }
  connected = false;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    // Only reconnect if edge is still available
    const edgeUp = await isEdgeAvailable().catch(() => false);
    if (edgeUp) {
      connectEdgeSocket();
    } else {
      // Edge is down — try again later
      scheduleReconnect();
    }
  }, RECONNECT_INTERVAL_MS);
}

// Subscribe to edge socket events directly (alternative to DOM events)
// Returns an unsubscribe function.
export function onEdgeEvent(callback) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
