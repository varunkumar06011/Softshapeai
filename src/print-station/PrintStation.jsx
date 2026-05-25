/**
 * /print-station
 *
 * Keep this page open on kitchen / bar PCs that have QZ Tray installed.
 * It silently connects to the socket server, listens for `new_kot` events,
 * and triggers QZ Tray printing locally — the captain's device never needs
 * QZ Tray.
 *
 * URL query params:
 *   ?role=kitchen   → prints food items only  (KITCHEN_PRINTER)
 *   ?role=bar       → prints liquor items only (BAR_PRINTER)
 *   ?role=all       → prints both (default, for a single-printer setup)
 *   ?restaurantId=xxx  → scope to a specific restaurant room
 */

import { useEffect, useRef, useState } from 'react';
import { QZ_CERT } from '../services/certificate.js';
import { API_BASE } from '../services/apiConfig.js';

const KITCHEN_PRINTER = import.meta.env.VITE_KITCHEN_PRINTER_NAME || 'KITCHEN_PRINTER';
const BAR_PRINTER     = import.meta.env.VITE_BAR_PRINTER_NAME     || 'BAR_PRINTER';
const VITE_API_URL    = import.meta.env.VITE_API_URL              || API_BASE;

// ── ESC/POS helpers ──────────────────────────────────────────────────────────
const ESC = '\x1B';
const GS  = '\x1D';
const CMD = {
  INIT:         ESC + '@',
  ALIGN_CENTER: ESC + 'a\x01',
  ALIGN_LEFT:   ESC + 'a\x00',
  BOLD_ON:      ESC + 'E\x01',
  BOLD_OFF:     ESC + 'E\x00',
  DOUBLE_HEIGHT: GS + '!\x01',
  NORMAL_SIZE:   GS + '!\x00',
  CUT:           GS + 'V\x41\x03',
};

function divider(ch = '-', w = 32) { return ch.repeat(w) + '\n'; }
function pad(s, w) { return String(s).slice(0, w).padEnd(w); }

function buildKOTCommands({ tableNumber, kotId, items, type }) {
  const label = type === 'liquor' ? 'BAR ORDER' : 'KITCHEN ORDER';
  const lines = [
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON + CMD.DOUBLE_HEIGHT,
    label + '\n',
    CMD.NORMAL_SIZE + CMD.BOLD_OFF,
    divider(),
    CMD.ALIGN_LEFT,
    `Table : ${tableNumber}\n`,
    `KOT   : ${String(kotId).slice(-6).toUpperCase()}\n`,
    `Time  : ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}\n`,
    divider(),
    CMD.BOLD_ON,
    pad('ITEM', 22) + pad('QTY', 4) + '\n',
    CMD.BOLD_OFF,
    divider(),
  ];

  items.forEach(item => {
    const name = String(item.name || '').slice(0, 22);
    const qty  = String(item.quantity || 1);
    lines.push(pad(name, 22) + pad(qty, 4) + '\n');
    if (item.notes) lines.push(`  ** ${item.notes} **\n`);
  });

  lines.push(divider(), '\n\n', CMD.CUT);
  return lines.map(c => ({ type: 'raw', format: 'plain', data: c }));
}

// ── QZ Tray helpers ──────────────────────────────────────────────────────────
let qzInstance = null;

async function getQZ() {
  if (!qzInstance) {
    const mod = await import('qz-tray');
    qzInstance = mod.default;
  }
  return qzInstance;
}

async function connectQZ() {
  const qz = await getQZ();

  qz.security.setCertificatePromise(function (resolve) {
    resolve(QZ_CERT);
  });

  qz.security.setSignaturePromise(function (toSign) {
    return function (resolve, reject) {
      fetch(`${VITE_API_URL}/api/print/qz-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toSign }),
      })
        .then(r => r.json())
        .then(d => resolve(d.signature))
        .catch(reject);
    };
  });

  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  return qz;
}

async function printData(printerName, data) {
  const qz = await connectQZ();
  const config = qz.configs.create(printerName);
  await qz.print(config, data);
}

// ── Main component ───────────────────────────────────────────────────────────
export default function PrintStation() {
  const params      = new URLSearchParams(window.location.search);
  const role        = params.get('role') || 'all';          // kitchen | bar | all
  const restaurantId = params.get('restaurantId') || '';

  const [status,   setStatus]   = useState('Connecting…');
  const [qzReady,  setQzReady]  = useState(false);
  const [log,      setLog]      = useState([]);
  const socketRef  = useRef(null);

  const addLog = (msg, ok = true) =>
    setLog(prev => [{ msg, ok, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));

  // ── QZ Tray init ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setStatus('Connecting to QZ Tray…');
        await connectQZ();
        setQzReady(true);
        setStatus('QZ Tray connected ✓');
        addLog('QZ Tray connected');
      } catch (err) {
        setStatus(`QZ Tray error: ${err.message}`);
        addLog(`QZ Tray error: ${err.message}`, false);
      }
    })();
  }, []);

  // ── Socket.io subscription ───────────────────────────────────────────────
  useEffect(() => {
    let socket;
    (async () => {
      const { io } = await import('socket.io-client');
      socket = io(API_BASE, {
        path: '/socket.io',
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        // Join restaurant room (if provided) or a wildcard room
        const room = restaurantId || '__all__';
        socket.emit('join', room);
        setStatus(prev =>
          prev.includes('QZ') ? prev : 'Socket connected ✓'
        );
        addLog(`Socket connected (room: ${room})`);
      });

      socket.on('disconnect', () => addLog('Socket disconnected', false));

      socket.on('new_kot', async (payload) => {
        const { kotId, tableNumber, foodItems = [], liquorItems = [] } = payload;
        addLog(`KOT received — Table ${tableNumber} | food:${foodItems.length} liquor:${liquorItems.length}`);

        const jobs = [];

        if ((role === 'kitchen' || role === 'all') && foodItems.length > 0) {
          jobs.push(
            printData(KITCHEN_PRINTER, buildKOTCommands({ tableNumber, kotId, items: foodItems, type: 'food' }))
              .then(() => addLog(`✓ Kitchen printed — Table ${tableNumber}`))
              .catch(err => addLog(`✗ Kitchen print failed: ${err.message}`, false))
          );
        }

        if ((role === 'bar' || role === 'all') && liquorItems.length > 0) {
          jobs.push(
            printData(BAR_PRINTER, buildKOTCommands({ tableNumber, kotId, items: liquorItems, type: 'liquor' }))
              .then(() => addLog(`✓ Bar printed — Table ${tableNumber}`))
              .catch(err => addLog(`✗ Bar print failed: ${err.message}`, false))
          );
        }

        await Promise.allSettled(jobs);
      });
    })();

    return () => {
      socket?.disconnect();
    };
  }, [role, restaurantId]);

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f0f',
      color: '#e5e5e5',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 24px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: '#1a1a1a', border: '1px solid #2a2a2a',
          borderRadius: 16, padding: '10px 20px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 22 }}>🖨️</span>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: 1, textTransform: 'uppercase' }}>
            Print Station
          </span>
          <span style={{
            background: role === 'bar' ? '#7c3aed' : role === 'kitchen' ? '#059669' : '#1d4ed8',
            color: '#fff', fontSize: 11, fontWeight: 700,
            borderRadius: 8, padding: '2px 10px', textTransform: 'uppercase',
          }}>
            {role}
          </span>
        </div>

        {/* Status pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: qzReady ? '#052e16' : '#1c1917',
          border: `1px solid ${qzReady ? '#16a34a' : '#44403c'}`,
          borderRadius: 999, padding: '6px 16px', fontSize: 13,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: qzReady ? '#22c55e' : '#f59e0b',
            boxShadow: qzReady ? '0 0 6px #22c55e' : '0 0 6px #f59e0b',
            animation: 'pulse 2s infinite',
          }} />
          {status}
        </div>
      </div>

      {/* Setup instructions */}
      {!qzReady && (
        <div style={{
          background: '#1c1917', border: '1px solid #44403c',
          borderRadius: 12, padding: '16px 20px', maxWidth: 460, marginBottom: 24,
          fontSize: 13, lineHeight: 1.7, color: '#a8a29e',
        }}>
          <strong style={{ color: '#fbbf24' }}>⚠ QZ Tray not detected.</strong><br />
          Make sure QZ Tray is running on this PC, then refresh this page.
        </div>
      )}

      {/* Instructions card */}
      <div style={{
        background: '#141414', border: '1px solid #1e1e1e',
        borderRadius: 14, padding: '20px 24px', maxWidth: 480,
        width: '100%', marginBottom: 28, fontSize: 13,
      }}>
        <p style={{ margin: '0 0 8px', color: '#71717a', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
          Setup
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#a1a1aa', lineHeight: 1.9 }}>
          <li>Keep this page open — do not close it</li>
          <li>QZ Tray must be running in the system tray</li>
          <li>
            Scope by role:&nbsp;
            <code style={{ background: '#1e1e1e', padding: '1px 6px', borderRadius: 4 }}>?role=kitchen</code>,&nbsp;
            <code style={{ background: '#1e1e1e', padding: '1px 6px', borderRadius: 4 }}>?role=bar</code>,&nbsp;
            <code style={{ background: '#1e1e1e', padding: '1px 6px', borderRadius: 4 }}>?role=all</code>
          </li>
        </ul>
      </div>

      {/* Print log */}
      <div style={{
        background: '#0a0a0a', border: '1px solid #1e1e1e',
        borderRadius: 14, width: '100%', maxWidth: 480,
        maxHeight: 380, overflowY: 'auto',
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid #1e1e1e',
          fontSize: 11, fontWeight: 700, color: '#52525b',
          textTransform: 'uppercase', letterSpacing: 1,
        }}>
          Print Log
        </div>
        {log.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#3f3f46', fontSize: 13 }}>
            Waiting for KOT events…
          </div>
        ) : log.map((entry, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 16px', borderBottom: '1px solid #111',
            fontSize: 12,
          }}>
            <span style={{ color: '#3f3f46', flexShrink: 0, paddingTop: 1 }}>{entry.ts}</span>
            <span style={{ color: entry.ok ? '#a3e635' : '#f87171' }}>{entry.msg}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
