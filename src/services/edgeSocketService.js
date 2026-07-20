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

// ── Tauri invoke helper ──────────────────────────────────────────────────────
// Available only inside the Tauri webview (cashier desktop). Captain web/APK
// won't have this, so print_job events are silently ignored there — the cashier
// desktop is the only device that should physically print.
function getTauriInvoke() {
  const t = window.__TAURI__;
  if (!t) return null;
  if (t.core && typeof t.core.invoke === 'function') return t.core.invoke.bind(t.core);
  if (typeof t.invoke === 'function') return t.invoke.bind(t);
  if (t.tauri && typeof t.tauri.invoke === 'function') return t.tauri.invoke.bind(t.tauri);
  return null;
}

// ── Print job handler ────────────────────────────────────────────────────────
// When the edge server broadcasts a print_job via WebSocket, the Tauri frontend
// (cashier desktop) receives it and sends the ESC/POS bytes to the physical
// printer via Tauri's print_raw / print_network commands. After printing (or
// on error), it sends a print_ack back to the edge server so it can resolve the
// HTTP response to the captain.
async function handlePrintJob(msgData) {
  const eventId = msgData?.eventId;
  const printData = msgData?.data || {};
  const { printerName, escposData } = printData;
  if (!eventId || !escposData) return;

  const invoke = getTauriInvoke();
  if (!invoke) return; // Not running in Tauri — ignore (captain web/APK)

  // Convert escposData [{ type, format, data }] → byte array
  const rawString = escposData.map(d => d.data || '').join('');
  const bytes = Array.from(new TextEncoder().encode(rawString));
  if (bytes.length === 0) {
    sendPrintAck(eventId, false, 'Empty print data');
    return;
  }

  let ok = false;
  let error = null;
  try {
    // Network printer (IP:port) vs USB/local printer
    const netMatch = printerName && printerName.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
    if (netMatch) {
      await invoke('print_network', {
        ip: netMatch[1],
        port: parseInt(netMatch[2], 10),
        bytes,
      });
    } else {
      await invoke('print_raw', {
        printerName: printerName || '',
        bytes,
      });
    }
    ok = true;
    console.log(`[EdgeSocket] Print job ${eventId} → ${printerName} ✓ (${bytes.length} bytes)`);
  } catch (err) {
    error = err?.message || String(err);
    console.error(`[EdgeSocket] Print job ${eventId} → ${printerName} ✗ ${error}`);
  }

  sendPrintAck(eventId, ok, error);
}

function sendPrintAck(eventId, ok, error) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'print_ack', eventId, ok, error: error || undefined }));
    } catch (err) {
      console.warn('[EdgeSocket] Failed to send print_ack:', err.message);
    }
  }
}

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

      // ── print_job: send to physical printer via Tauri and send print_ack back ──
      // This is the critical path: edge server broadcasts print_job → Tauri frontend
      // prints via Rust print bridge → sends print_ack → edge server resolves HTTP
      // response to the captain. Without this, all edge-server printing times out.
      if (msg.type === 'print_job') {
        handlePrintJob(msg.data);
        return;
      }

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
