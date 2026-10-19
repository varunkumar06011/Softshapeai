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
//
// The socket is shared: connect/disconnect are reference-counted, so the bar
// and restaurant table views can both hold it and one unmounting doesn't cut
// the other's live updates.
// ─────────────────────────────────────────────────────────────────────────────

import { getEdgeUrl, isEdgeAvailableFast } from './edgeHealth';

let ws = null;
let wsEdgeUrl = null; // edge URL the current socket was opened against
let reconnectTimer = null;
let pingTimer = null;
let pongTimer = null;
let lastMessageAt = 0;
let connected = false;
// True while a reconnect attempt is opening the socket, so onopen dispatches
// edge:reconnect and listeners catch up on events missed while down.
let reconnecting = false;
let refCount = 0;
let listeners = new Set();

const RECONNECT_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 20000;
// No message (pong or event) this long after a ping → the connection is dead.
// When a phone walks out of WiFi range the socket often stays "open" with no
// close event for minutes; without this, live updates silently stopped.
const PONG_TIMEOUT_MS = 10000;

// R5: Tauri/Capacitor print helpers removed — edge server print service is sole transport.

export function isEdgeSocketConnected() {
  return connected;
}

/** Take a reference to the shared socket and make sure it is connected. */
export function connectEdgeSocket() {
  refCount++;
  openSocket();
}

function clearTimers() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (pongTimer) {
    clearTimeout(pongTimer);
    pongTimer = null;
  }
}

/** Drop the current socket without triggering onclose, then reconnect. */
function restartSocket(reason) {
  console.warn(`[EdgeSocket] ${reason} — reconnecting`);
  clearTimers();
  if (ws) {
    ws.onclose = null;
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
  connected = false;
  scheduleReconnect();
}

function openSocket() {
  if (refCount <= 0) return;
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
    wsEdgeUrl = edgeUrl;
  } catch (err) {
    console.warn('[EdgeSocket] Failed to create WebSocket:', err.message);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    const wasReconnect = reconnecting;
    reconnecting = false;
    connected = true;
    lastMessageAt = Date.now();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    console.log(`[EdgeSocket] Connected to ${wsUrl}${wasReconnect ? ' (reconnect)' : ''}`);

    // R5: Frontend no longer handles print jobs — edge server print service is sole transport.
    try {
      ws.send(JSON.stringify({ type: 'register' }));
    } catch {
      // Best-effort registration
    }

    // On reconnect, dispatch a full refresh event so listeners can catch up
    // on any order/table events missed during the disconnect period.
    if (wasReconnect) {
      try {
        window.dispatchEvent(new CustomEvent('edge:reconnect'));
      } catch { /* ignore if window not available */ }
    }

    // Keepalive ping + dead-connection detection
    clearTimers();
    pingTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // Edge URL changed (rediscovered after a DHCP change, or the captain
      // switched outlets) — move to the new PC instead of staying on the old one.
      if (getEdgeUrl() !== wsEdgeUrl) {
        restartSocket('Edge server URL changed');
        return;
      }
      const pingSentAt = Date.now();
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // ignore — the pong timeout below handles a dead socket
      }
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = setTimeout(() => {
        pongTimer = null;
        if (lastMessageAt < pingSentAt) restartSocket('No response to ping');
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  };

  ws.onmessage = (event) => {
    lastMessageAt = Date.now();
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'pong') return; // keepalive response

      // R5: print_job handling removed — edge server print service is the sole transport.

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
    } catch {
      // Non-JSON message — ignore
    }
  };

  ws.onerror = () => {
    console.warn('[EdgeSocket] WebSocket error');
  };

  ws.onclose = (event) => {
    connected = false;
    console.log('[EdgeSocket] Disconnected (code:', event.code, ')');
    clearTimers();
    // Only reconnect if edge is still available
    scheduleReconnect();
  };
}

/** Release a reference; the socket closes when the last holder releases. */
export function disconnectEdgeSocket() {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearTimers();
  if (ws) {
    ws.onclose = null; // prevent reconnect on intentional close
    ws.close();
    ws = null;
  }
  wsEdgeUrl = null;
  connected = false;
  reconnecting = false;
}

function scheduleReconnect() {
  if (reconnectTimer || refCount <= 0) return;
  reconnectTimer = setTimeout(async () => {
    // Use isEdgeAvailableFast() — direct health check with no 30s cache.
    // isEdgeAvailable() can return stale false for up to 30s after
    // resetEdgeCache() is called during normal cashier operations (bill
    // print, KOT reprint), causing the socket to loop "checking but not
    // connecting" even though the edge server is perfectly fine.
    reconnectTimer = null;
    const edgeUp = await isEdgeAvailableFast().catch(() => false);
    if (edgeUp && refCount > 0) {
      reconnecting = true;
      openSocket();
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
