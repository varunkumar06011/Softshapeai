/**
 * /print-station
 *
 * Keep this tab open on the CASHIER PC all day.
 * QZ Tray must be running on the same machine.
 *
 * Listens for `print_job` socket events and routes to the correct printer:
 *   KOT     → VITE_KITCHEN_PRINTER_NAME
 *   BAR_KOT → VITE_BAR_PRINTER_NAME
 *   BILL    → VITE_BILLING_PRINTER_NAME
 *
 * Captain's mobile never touches QZ Tray — only this page does.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { QZ_CERT } from '../services/certificate.js';
import { API_BASE } from '../services/apiConfig.js';

const KITCHEN_PRINTER = import.meta.env.VITE_KITCHEN_PRINTER_NAME || 'KITCHEN_PRINTER';
const BAR_PRINTER     = import.meta.env.VITE_BAR_PRINTER_NAME     || 'BAR_PRINTER';
const BILLING_PRINTER = import.meta.env.VITE_BILLING_PRINTER_NAME || 'BILLING_PRINTER';
const VITE_API_URL    = import.meta.env.VITE_API_URL || API_BASE;

// ── ESC/POS constants ────────────────────────────────────────────────────────
const ESC = '\x1B';
const GS  = '\x1D';
const CMD = {
  INIT:           ESC + '@',
  ALIGN_CENTER:   ESC + 'a\x01',
  ALIGN_LEFT:     ESC + 'a\x00',
  BOLD_ON:        ESC + 'E\x01',
  BOLD_OFF:       ESC + 'E\x00',
  DOUBLE_HEIGHT:  GS  + '!\x01',
  NORMAL_SIZE:    GS  + '!\x00',
  CUT:            GS  + 'V\x41\x03',
};
function divider(ch = '-', w = 32) { return ch.repeat(w) + '\n'; }
function pad(s, w) { return String(s).slice(0, w).padEnd(w); }
function padRight(l, r, w = 32) {
  return l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r;
}

// ── ESC/POS builders ─────────────────────────────────────────────────────────
function buildKOTCommands({ tableNumber, kotId, items, label = 'KITCHEN ORDER' }) {
  const cmds = [
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
  (items || []).forEach(item => {
    cmds.push(pad(String(item.name || ''), 22) + pad(String(item.quantity || 1), 4) + '\n');
    if (item.notes) cmds.push(`  ** ${item.notes} **\n`);
  });
  cmds.push(divider(), '\n\n', CMD.CUT);
  return cmds.map(c => ({ type: 'raw', format: 'plain', data: c }));
}

function buildBillCommands({ tableNumber, items, totalAmount }) {
  const cmds = [
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON + CMD.DOUBLE_HEIGHT,
    'BILL RECEIPT\n',
    CMD.NORMAL_SIZE + CMD.BOLD_OFF,
    divider(),
    CMD.ALIGN_LEFT,
    `Table : ${tableNumber}\n`,
    `Date  : ${new Date().toLocaleString('en-IN')}\n`,
    divider(),
    CMD.BOLD_ON,
    pad('ITEM', 20) + pad('QTY', 4) + pad('AMT', 8) + '\n',
    CMD.BOLD_OFF,
    divider(),
  ];
  (items || []).forEach(item => {
    const name = String(item.name || item.n || '').slice(0, 20);
    const qty  = String(item.quantity || item.q || 1);
    const amt  = 'Rs.' + ((item.price || item.p || 0) * (item.quantity || item.q || 1)).toFixed(0);
    cmds.push(pad(name, 20) + pad(qty, 4) + pad(amt, 8) + '\n');
  });
  const subtotal = Number(totalAmount) || 0;
  const tax = subtotal * 0.05;
  const total = subtotal + tax;
  cmds.push(
    divider(),
    padRight('Subtotal', 'Rs.' + subtotal.toFixed(0)) + '\n',
    padRight('GST (5%)', 'Rs.' + tax.toFixed(0)) + '\n',
    divider('='),
    CMD.BOLD_ON,
    padRight('TOTAL', 'Rs.' + total.toFixed(0)) + '\n',
    CMD.BOLD_OFF,
    divider(),
    CMD.ALIGN_CENTER,
    'Thank you! Visit again.\n',
    'Powered by Softshape.ai\n',
    '\n\n\n',
    CMD.CUT,
  );
  return cmds.map(c => ({ type: 'raw', format: 'plain', data: c }));
}

// ── QZ Tray singleton ────────────────────────────────────────────────────────
let _qz = null;

async function getQZ() {
  if (!_qz) {
    const mod = await import('qz-tray');
    _qz = mod.default;
  }
  return _qz;
}

async function connectQZ() {
  const qz = await getQZ();
  qz.security.setCertificatePromise(function (resolve) { resolve(QZ_CERT); });
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
  if (!qz.websocket.isActive()) await qz.websocket.connect();
  return qz;
}

async function sendToPrinter(printerName, data) {
  const qz = await connectQZ();
  const config = qz.configs.create(printerName);
  await qz.print(config, data);
}

// ── Component ────────────────────────────────────────────────────────────────
const MAX_LOG = 10;

export default function PrintStation() {
  const [qzStatus,  setQzStatus]  = useState('connecting'); // connecting | ready | error
  const [sockOk,    setSockOk]    = useState(false);
  const [log,       setLog]       = useState([]);
  const socketRef   = useRef(null);
  const retryTimer  = useRef(null);

  const pushLog = useCallback((msg, ok = true) => {
    setLog(prev => [
      { msg, ok, ts: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
      ...prev,
    ].slice(0, MAX_LOG));
  }, []);

  // ── QZ Tray init + retry ─────────────────────────────────────────────────
  const initQZ = useCallback(async () => {
    setQzStatus('connecting');
    try {
      await connectQZ();
      setQzStatus('ready');
      pushLog('QZ Tray connected ✓');
    } catch (err) {
      setQzStatus('error');
      pushLog(`QZ Tray error: ${err.message}`, false);
      // Retry every 10 s
      retryTimer.current = setTimeout(initQZ, 10_000);
    }
  }, [pushLog]);

  useEffect(() => {
    initQZ();
    return () => clearTimeout(retryTimer.current);
  }, [initQZ]);

  // ── Socket.io ────────────────────────────────────────────────────────────
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
        setSockOk(true);
        // Join all rooms so we catch jobs regardless of restaurantId
        socket.emit('join', '__print_station__');
        pushLog('Socket connected ✓');
      });
      socket.on('disconnect', () => {
        setSockOk(false);
        pushLog('Socket disconnected', false);
      });

      socket.on('print_job', async ({ type, data }) => {
        pushLog(`Received print_job [${type}] — Table ${data?.tableNumber ?? '?'}`);
        try {
          let cmds, printer;
          if (type === 'KOT') {
            cmds    = buildKOTCommands({ ...data, label: 'KITCHEN ORDER' });
            printer = KITCHEN_PRINTER;
          } else if (type === 'BAR_KOT') {
            cmds    = buildKOTCommands({ ...data, label: 'BAR ORDER' });
            printer = BAR_PRINTER;
          } else if (type === 'BILL') {
            cmds    = buildBillCommands(data);
            printer = BILLING_PRINTER;
          } else {
            pushLog(`Unknown print_job type: ${type}`, false);
            return;
          }
          await sendToPrinter(printer, cmds);
          pushLog(`✓ Printed [${type}] → ${printer} (Table ${data?.tableNumber ?? '?'})`);
        } catch (err) {
          pushLog(`✗ Print failed [${type}]: ${err.message}`, false);
          // If QZ dropped, try reconnecting
          if (err.message.includes('websocket') || err.message.includes('connect')) {
            setQzStatus('error');
            initQZ();
          }
        }
      });
    })();
    return () => socket?.disconnect();
  }, [pushLog, initQZ]);

  // ── QZ disconnect watcher ────────────────────────────────────────────────
  useEffect(() => {
    if (qzStatus !== 'ready') return;
    const checkInterval = setInterval(async () => {
      try {
        const qz = await getQZ();
        if (!qz.websocket.isActive()) {
          setQzStatus('error');
          pushLog('QZ Tray disconnected — retrying…', false);
          initQZ();
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(checkInterval);
  }, [qzStatus, pushLog, initQZ]);

  // ── Derived state ────────────────────────────────────────────────────────
  const allOk    = qzStatus === 'ready' && sockOk;
  const qzError  = qzStatus === 'error';

  // ── Styles (inline — no Tailwind needed) ────────────────────────────────
  const s = {
    root: {
      minHeight: '100vh',
      background: '#0c0c0c',
      color: '#e5e5e5',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '48px 24px',
    },
    card: {
      width: '100%',
      maxWidth: 520,
      background: '#141414',
      border: '1px solid #1f1f1f',
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 0 40px rgba(0,0,0,0.6)',
    },
    header: {
      padding: '28px 28px 20px',
      borderBottom: '1px solid #1f1f1f',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    },
    iconWrap: {
      width: 48, height: 48, borderRadius: 14,
      background: allOk ? '#052e16' : qzError ? '#3b0a0a' : '#1c1917',
      border: `1px solid ${allOk ? '#166534' : qzError ? '#7f1d1d' : '#44403c'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 22, flexShrink: 0,
      transition: 'all 0.3s',
    },
    title: { fontSize: 18, fontWeight: 800, letterSpacing: 0.3 },
    subtitle: { fontSize: 12, color: '#71717a', marginTop: 2 },
    statusBanner: {
      margin: '0 20px 20px',
      padding: '14px 18px',
      borderRadius: 12,
      background: allOk ? '#052e16' : qzError ? '#3b0a0a' : '#1c1917',
      border: `1px solid ${allOk ? '#16a34a' : qzError ? '#ef4444' : '#78716c'}`,
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 14,
      fontWeight: 600, transition: 'all 0.3s',
    },
    dot: {
      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
      background: allOk ? '#22c55e' : qzError ? '#ef4444' : '#f59e0b',
      boxShadow: `0 0 8px ${allOk ? '#22c55e' : qzError ? '#ef4444' : '#f59e0b'}`,
    },
    printerRow: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 28px', fontSize: 12, borderBottom: '1px solid #1a1a1a',
      color: '#71717a',
    },
    printerName: { color: '#a1a1aa', fontWeight: 600 },
    logHeader: {
      padding: '12px 20px',
      fontSize: 11, fontWeight: 700, color: '#52525b',
      textTransform: 'uppercase', letterSpacing: 1,
      borderBottom: '1px solid #1a1a1a',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    logEmpty: {
      padding: '40px 20px', textAlign: 'center',
      color: '#3f3f46', fontSize: 13,
    },
    logRow: {
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 20px', borderBottom: '1px solid #111', fontSize: 12,
    },
    retryBtn: {
      marginTop: 4, padding: '3px 10px', fontSize: 11, fontWeight: 700,
      background: 'transparent', border: '1px solid #7f1d1d', color: '#ef4444',
      borderRadius: 6, cursor: 'pointer',
    },
  };

  return (
    <div style={s.root}>
      {/* QZ disconnected banner — red, prominent */}
      {qzError && (
        <div style={{
          width: '100%', maxWidth: 520, marginBottom: 16,
          background: '#3b0a0a', border: '1px solid #ef4444',
          borderRadius: 12, padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          animation: 'pulse 2s infinite',
        }}>
          <span style={{ fontWeight: 700, color: '#ef4444', fontSize: 14 }}>
            ⚠️ QZ Tray Disconnected — Make sure QZ Tray is running, then retry
          </span>
          <button onClick={initQZ} style={s.retryBtn}>Retry</button>
        </div>
      )}

      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.iconWrap}>
            {allOk ? '🖨️' : qzError ? '⛔' : '⏳'}
          </div>
          <div>
            <div style={s.title}>Print Station</div>
            <div style={s.subtitle}>Cashier PC · All printers connected here</div>
          </div>
        </div>

        {/* Status banner */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={s.statusBanner}>
            <div style={s.dot} />
            <span>
              {allOk
                ? 'Print Station Active ✅ — Ready to receive jobs'
                : qzError
                  ? 'QZ Tray Disconnected ⚠️ — Retrying…'
                  : 'Connecting to QZ Tray…'}
            </span>
          </div>
        </div>

        {/* Printer map */}
        <div style={{ padding: '12px 0 4px' }}>
          {[
            { type: 'KOT',     label: 'Kitchen Printer', name: KITCHEN_PRINTER },
            { type: 'BAR_KOT', label: 'Bar Printer',     name: BAR_PRINTER },
            { type: 'BILL',    label: 'Billing Printer',  name: BILLING_PRINTER },
          ].map(({ type, label, name }) => (
            <div key={type} style={s.printerRow}>
              <span>{label} <span style={{ color: '#52525b' }}>({type})</span></span>
              <span style={s.printerName}>{name}</span>
            </div>
          ))}
        </div>

        {/* Print log */}
        <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 8 }}>
          <div style={s.logHeader}>
            <span>Print Log (last {MAX_LOG})</span>
            {log.length > 0 && (
              <button
                onClick={() => setLog([])}
                style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', fontSize: 11 }}
              >
                Clear
              </button>
            )}
          </div>

          {log.length === 0 ? (
            <div style={s.logEmpty}>Waiting for print jobs…</div>
          ) : log.map((entry, i) => (
            <div key={i} style={s.logRow}>
              <span style={{ color: '#3f3f46', flexShrink: 0, paddingTop: 1, minWidth: 60 }}>{entry.ts}</span>
              <span style={{ color: entry.ok ? '#a3e635' : '#f87171', lineHeight: 1.5 }}>{entry.msg}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #1a1a1a',
          fontSize: 11, color: '#3f3f46', textAlign: 'center',
        }}>
          Keep this tab open all day · QZ Tray must be running
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
