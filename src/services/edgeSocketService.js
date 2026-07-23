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
import { getLocalPrinterMapping } from '../utils/offlineDB';

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

// ── Capacitor platform check ─────────────────────────────────────────────────
// Captain APK runs on Capacitor (Android). If a network printer (IP:port) is
// configured, the captain can print directly to it over the restaurant LAN —
// no Tauri desktop or Print Agent required.
function isCapacitor() {
  return !!(window.Capacitor?.isNativePlatform?.());
}

// Check if this device can print: Tauri desktop with printers, or Capacitor
// Android with a network printer IP configured in localStorage or printer mapping.
function canPrintToDevice() {
  if (getTauriInvoke()) return true;
  if (isCapacitor()) {
    const netIp = localStorage.getItem('offline_network_printer_ip');
    if (netIp) return true;
  }
  return false;
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
  let { printerName, escposData } = printData;
  const jobType = msgData?.type || printData.type;
  if (!eventId || !escposData) return;

  const invoke = getTauriInvoke();
  const capacitor = isCapacitor();
  if (!invoke && !capacitor) return; // Not Tauri or Capacitor — ignore (web browser)

  // Resolve printer name from local mapping when edge server sends null.
  // The edge server sends printerName: null when no printer is configured
  // for that item type — the frontend resolves from its local mapping.
  if (!printerName) {
    try {
      const mapping = await getLocalPrinterMapping();
      if (jobType === 'KOT' || jobType === 'CANCEL_KOT') printerName = mapping.kitchen;
      else if (jobType === 'BAR_KOT') printerName = mapping.bar;
      else if (jobType === 'FINAL_BILL' || jobType === 'BILL') printerName = mapping.bill;
    } catch { /* ignore — will fail with empty printer name */ }
  }

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
    if (invoke) {
      // ── Tauri desktop path (cashier) ──
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
    } else if (capacitor) {
      // ── Capacitor Android path (captain) ──
      // Network printer (IP:port) takes priority — captain prints over LAN WiFi.
      const netMatch = printerName && printerName.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
      if (netMatch) {
        const { registerPlugin } = await import('@capacitor/core');
        const EscposPrint = registerPlugin('EscposPrint');
        await EscposPrint.printNetwork({ ip: netMatch[1], port: parseInt(netMatch[2], 10), bytes });
      } else {
        // Fall back to localStorage network printer IP if no IP:port in printerName
        const netIp = localStorage.getItem('offline_network_printer_ip');
        if (netIp) {
          const netPort = parseInt(localStorage.getItem('offline_network_printer_port') || '9100', 10);
          const { registerPlugin } = await import('@capacitor/core');
          const EscposPrint = registerPlugin('EscposPrint');
          await EscposPrint.printNetwork({ ip: netIp, port: netPort, bytes });
        } else if (printerName) {
          // Bluetooth/USB printer via Capacitor plugin
          const { registerPlugin } = await import('@capacitor/core');
          const EscposPrint = registerPlugin('EscposPrint');
          await EscposPrint.printRaw({ printerName, bytes });
        } else {
          throw new Error('No printer configured on this device');
        }
      }
    }
    ok = true;
    console.log(`[EdgeSocket] Print job ${eventId} → ${printerName || '(network)'} ✓ (${bytes.length} bytes)`);
  } catch (err) {
    error = err?.message || String(err);
    console.error(`[EdgeSocket] Print job ${eventId} → ${printerName || '(network)'} ✗ ${error}`);
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
    const wasReconnect = connected === false && reconnectTimer !== null;
    connected = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    console.log(`[EdgeSocket] Connected to ${wsUrl}${wasReconnect ? ' (reconnect)' : ''}`);

    // Register client capabilities with the edge server.
    // Tauri desktops (cashier) and Capacitor Android (captain) with a network
    // printer configured can physically print. Captain web sends canPrint=false.
    const canPrint = canPrintToDevice();
    try {
      ws.send(JSON.stringify({ type: 'register', canPrint }));
    } catch {
      // Best-effort — the server will default to canPrint=false
    }

    // On reconnect, dispatch a full refresh event so listeners can catch up
    // on any order/table events missed during the disconnect period.
    if (wasReconnect) {
      try {
        window.dispatchEvent(new CustomEvent('edge:reconnect'));
      } catch { /* ignore if window not available */ }
    }

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
