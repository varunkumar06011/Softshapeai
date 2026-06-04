/**
 * /print-station
 *
 * Keep this tab open on the CASHIER PC all day.
 * QZ Tray must be running on the same machine.
 *
 * Listens for `print_job` socket events and routes to the correct printer:
 *   KOT        → VITE_KITCHEN_PRINTER_NAME
 *   BAR_KOT    → VITE_BAR_PRINTER_NAME
 *   BILL       → VITE_BILLING_PRINTER_NAME
 *   FINAL_BILL → VITE_BAR_PRINTER_NAME (bar) or VITE_BILLING_PRINTER_NAME (restaurant)
 *
 * Captain's mobile never touches QZ Tray — only this page does.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { QZ_CERT } from '../services/certificate.js';
import { API_BASE } from '../services/apiConfig.js';

const KITCHEN_PRINTER = import.meta.env.VITE_KITCHEN_PRINTER_NAME || 'KITCHEN_PRINTER';
const BAR_PRINTER     = import.meta.env.VITE_BAR_PRINTER_NAME     || 'BAR_PRINTER';
const BILLING_PRINTER = import.meta.env.VITE_BILLING_PRINTER_NAME || 'BILLING_PRINTER';
const RESTAURANT_KITCHEN_PRINTER = import.meta.env.VITE_RESTAURANT_KITCHEN_PRINTER_NAME || KITCHEN_PRINTER;
const VITE_API_URL    = import.meta.env.VITE_API_URL || API_BASE;

// ── Restaurant printer routing ───────────────────────────────────────────────
const KOT_FAMILY_PRINTER   = import.meta.env.VITE_KOT_FAMILY_PRINTER_NAME   || 'KOT FAMILY';
const DINE_IN_BILL_PRINTER = import.meta.env.VITE_DINE_IN_BILL_PRINTER_NAME || 'Dine in Bill';
const KOT_PRINTER          = import.meta.env.VITE_KOT_PRINTER_NAME           || 'KOT PRINTER';

// ── ESC/POS constants ────────────────────────────────────────────────────────
const INIT = '\x1B\x40';
const CENTER = '\x1B\x61\x01';
const LEFT = '\x1B\x61\x00';
const BOLD_ON = '\x1B\x45\x01';
const BOLD_OFF = '\x1B\x45\x00';
const SIZE_2X = '\x1D\x21\x11';
const SIZE_NORMAL = '\x1D\x21\x00';
const SIZE_HEIGHT = '\x1D\x21\x01';
const SIZE_SMALL = '\x1D\x21\x20';
const CUT = '\x1D\x56\x42\x00';

const LINE_NORMAL = 42;

function separator(ch = "-") { return ch.repeat(LINE_NORMAL) + '\n'; }

// ── ESC/POS builders ─────────────────────────────────────────────────────────
function buildKOTCommands({ tableNumber, kotId, items, label = 'FOOD ORDER', sectionName, captainName, sectionTag }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const displayKotId = kotId || "N/A";
  const rawLabel = (tableNumber || 'N/A').toString();
  const tableDisplay = /^[BT]\d+$/i.test(rawLabel) ? rawLabel.slice(1) : rawLabel;

  // Determine venue label based on sectionTag
  const venueLabel = sectionTag === 'venue-family-restaurant'
    ? 'V GRAND FAMILY RESTAURANT'
    : (sectionTag === 'venue-restaurant-parcel'
        ? 'V GRAND FAMILY RESTAURANT'
        : label);

  const cmds = [
    INIT,
    CENTER,
    BOLD_ON,
    `${venueLabel}\n`,
    BOLD_OFF,
    LEFT,
    separator("-"),
    SIZE_HEIGHT,
    BOLD_ON,
    `KOT No : ${displayKotId}\n`,
    `Table  : ${tableDisplay}\n`,
    BOLD_OFF,
    SIZE_NORMAL,
    separator("-"),
    `Waiter : ${captainName && captainName !== 'N/A' ? captainName : 'Waiter'}\n`,
    `Ordered Date : ${dateStr}  Time : ${timeStr}\n`,
    separator("-"),
    BOLD_ON,
    "Qty  Item\n",
    BOLD_OFF,
    separator("-"),
  ];

  (items || []).forEach(item => {
    const itemLine = `${item.quantity}    ${item.name.toUpperCase()}`;
    cmds.push(
      BOLD_ON,
      itemLine + "\n",
      BOLD_OFF,
    );
    if (item.notes && item.notes.trim()) {
      cmds.push(
        `     * ${item.notes.trim()}\n`,
      );
    }
  });

  // Hall name based on sectionTag
  const hallName = sectionTag === 'venue-family-restaurant'
    ? 'DINE IN'
    : (sectionTag === 'venue-restaurant-parcel'
        ? 'PARCEL(FAMILY RESTAURANT)'
        : (sectionName ? sectionName.toUpperCase() : 'MAIN HALL'));
  cmds.push(
    separator("-"),
    `Hall Name : ${hallName}\n`,
    "\n\n\n",
    CUT
  );

  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];
}

function buildCancelKOTCommands({ tableNumber, cancelledBy, timestamp, item, sectionName, sectionTag }) {
  const timeStr = new Date(timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const itemType = item?.menuType === 'BAR' ? 'Bar Item' : 'Food Item';

  // Venue label for restaurant side cancels
  const venueLabel = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel'
    ? 'V GRAND FAMILY RESTAURANT'
    : 'CANCEL ITEM';

  const cmds = [
    INIT,
    CENTER,
    BOLD_ON,
    `${venueLabel}\n`,
    BOLD_OFF,
    separator("-"),
    LEFT,
    `Table : ${tableNumber}\n`,
    `Time  : ${timeStr}\n`,
    `By    : ${cancelledBy || 'Staff'}\n`,
    separator("-"),
  ];

  if (item) {
    const itemLine = `${item.quantity}x ${item.name.toUpperCase()}`;
    cmds.push(
      SIZE_HEIGHT,
      BOLD_ON,
      itemLine + "\n",
      BOLD_OFF,
      SIZE_NORMAL,
      `Type  : ${itemType}\n`
    );
  }

  const hallName = sectionTag === 'venue-family-restaurant'
    ? 'DINE IN'
    : (sectionTag === 'venue-restaurant-parcel'
        ? 'PARCEL(FAMILY RESTAURANT)'
        : (sectionName ? sectionName.toUpperCase() : 'N/A'));
  cmds.push(
    separator("-"),
    `Hall Name : ${hallName}\n`,
    separator("-"),
    CENTER,
    SIZE_HEIGHT,
    BOLD_ON,
    '** CANCELLED **\n',
    BOLD_OFF,
    SIZE_NORMAL,
    '\n\n\n',
    CUT
  );

  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];
}

function buildFullCancelCommands({ tableNumber, cancelledBy, timestamp, items, sectionName, sectionTag }) {
  const timeStr = new Date(timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const venueLabel = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel'
    ? 'V GRAND FAMILY RESTAURANT'
    : 'CANCEL ORDER';

  const cmds = [
    INIT,
    CENTER,
    BOLD_ON,
    `${venueLabel}\n`,
    BOLD_OFF,
    separator("-"),
    LEFT,
    `Table : ${tableNumber}\n`,
    `Time  : ${timeStr}\n`,
    `By    : ${cancelledBy || 'Staff'}\n`,
    separator("-"),
    BOLD_ON,
    "Qty  Item\n",
    BOLD_OFF,
    separator("-"),
  ];

  (items || []).forEach(item => {
    const itemLine = `${item.quantity}    ${item.name.toUpperCase()}`;
    cmds.push(
      BOLD_ON,
      itemLine + "\n",
      BOLD_OFF,
    );
  });

  const hallName = sectionTag === 'venue-family-restaurant'
    ? 'DINE IN'
    : (sectionTag === 'venue-restaurant-parcel'
        ? 'PARCEL(FAMILY RESTAURANT)'
        : (sectionName ? sectionName.toUpperCase() : 'N/A'));
  cmds.push(
    separator("-"),
    `Hall Name : ${hallName}\n`,
    separator("-"),
    CENTER,
    SIZE_HEIGHT,
    BOLD_ON,
    '** CANCELLED **\n',
    BOLD_OFF,
    SIZE_NORMAL,
    '\n\n\n',
    CUT
  );

  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];
}


function buildBillCommands({ tableNumber, items, totalAmount }) {
  const cmds = [
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    'BILL RECEIPT\n',
    CMD.BOLD_OFF,
    divider(),
    CMD.ALIGN_LEFT,
    `Table : ${tableNumber}\n`,
    `Date  : ${new Date().toLocaleString('en-IN')}\n`,
    divider(),
    CMD.BOLD_ON,
    pad('ITEM', 24) + pad('QTY', 6) + padRight('', 'AMT', 12) + '\n',
    CMD.BOLD_OFF,
    divider(),
  ];
  (items || []).forEach(item => {
    const name = String(item.name || item.n || '').slice(0, 24);
    const qty  = String(item.quantity || item.q || 1);
    const amt  = 'Rs.' + ((item.price || item.p || 0) * (item.quantity || item.q || 1)).toFixed(0);
    cmds.push(pad(name, 24) + pad(qty, 6) + padRight('', amt, 12) + '\n');
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
    '\n',
    'Powered by VTech - Softshape.ai\n',
    '\n\n\n',
    CMD.CUT,
  );
  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];
}

function buildTableSwapCommands({ fromTableNumber, toTableNumber, swappedBy, timestamp }) {
  const cmds = [
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    'TABLE MOVED\n',
    CMD.BOLD_OFF,
    divider(),
    CMD.ALIGN_LEFT,
    `From  : Table ${fromTableNumber}\n`,
    `To    : Table ${toTableNumber}\n`,
    `By    : ${swappedBy || 'Staff'}\n`,
    `Time  : ${new Date(timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}\n`,
    divider(),
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    'Session transferred\n',
    CMD.BOLD_OFF,
    '\n\n',
    CMD.CUT,
  ];
  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];
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
  // MUST match backend signing algorithm — SHA512 prevents Allow/Block popup
  qz.security.setSignatureAlgorithm('SHA512');
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
  const printedKotIds = useRef(new Set());

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
      socket = io(API_BASE, {
        path: '/socket.io',
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
      });
      socketRef.current = socket;

      let hasJoined = false;
      socket.on('connect', () => {
        setSockOk(true);
        if (!hasJoined) {
          // Join DEDICATED print rooms — these are isolated from the main
          // restaurant/bar rooms that captain and cashier sockets join.
          // This guarantees print_job events are only delivered to this
          // PrintStation socket, preventing double-printing.
          socket.emit('join:print', 'restaurant-001');
          socket.emit('join:print', 'bar-001');
          socket.emit('join:print', 'venue-001');
          hasJoined = true;
          pushLog('Socket connected ✓');
        } else {
          // On reconnect: re-join the print rooms because the server treats
          // the reconnected socket as a new connection (new socket ID) and
          // removes it from all rooms. We MUST re-emit join:print.
          socket.emit('join:print', 'restaurant-001');
          socket.emit('join:print', 'bar-001');
          socket.emit('join:print', 'venue-001');
          pushLog('Socket reconnected ✓');
        }
      });
      socket.on('disconnect', () => {
        setSockOk(false);
        pushLog('Socket disconnected', false);
      });

      socket.on('print_job', async ({ type, data }) => {
        pushLog(`Received print_job [${type}] — Table ${data?.tableNumber ?? '?'}`);
        try {
          let cmds, printer;
          // ── Deduplication for KOT / BAR_KOT ───────────────────────────────────
          if (type === 'KOT' || type === 'BAR_KOT') {
            const itemCount = data.items?.length || 0;
            const dedupKey = data.eventId
              ? String(data.eventId)
              : `${data.kotId}-${data.tableNumber}-${itemCount}`;
            if (printedKotIds.current.has(dedupKey)) {
              pushLog(`Duplicate KOT skipped [${type}] — Table ${data?.tableNumber ?? '?'}`);
              return;
            }
            printedKotIds.current.add(dedupKey);
            if (printedKotIds.current.size > 200) {
              const entries = [...printedKotIds.current];
              entries.splice(0, 100);
              printedKotIds.current = new Set(entries);
            }
          }

          // ── Routing ──────────────────────────────────────────────────────────
          const printTasks = []; // { printer, cmds }

          if (type === 'KOT') {
            if (data.restaurantId === 'venue-001') {
              // ── Restaurant KOT split uses printerTarget per item ───────────────
              //   BAR_PRINTER  → Dine in Bill (cashier counter printer)
              //   KOT_PRINTER / null / undefined → KOT FAMILY (kitchen printer)
              //   This is the source-of-truth routing for venue-001.
              //   Do NOT remove this logic — future devs: the backend already
              //   sends printerTarget on every item payload; no name-matching
              //   heuristics should ever be added here.
              // ───────────────────────────────────────────────────────────────────
              const kitchenItems = (data.items || []).filter(i => i.printerTarget !== 'BAR_PRINTER');
              const counterItems = (data.items || []).filter(i => i.printerTarget === 'BAR_PRINTER');
              if (kitchenItems.length > 0) {
                printTasks.push({
                  printer: KOT_FAMILY_PRINTER,
                  cmds: buildKOTCommands({ ...data, items: kitchenItems, label: 'FOOD ORDER', sectionTag: data.sectionTag }),
                });
              }
              if (counterItems.length > 0) {
                printTasks.push({
                  printer: DINE_IN_BILL_PRINTER,
                  cmds: buildKOTCommands({ ...data, items: counterItems, label: 'FOOD ORDER', sectionTag: data.sectionTag }),
                });
              }
            } else {
              // Non-venue-001: old restaurant or bar-venue
              cmds = buildKOTCommands({ ...data, label: 'FOOD ORDER', sectionTag: data.sectionTag });
              printer = data.restaurantId === 'restaurant-001'
                ? RESTAURANT_KITCHEN_PRINTER
                : KITCHEN_PRINTER;
              printTasks.push({ printer, cmds });
            }
          } else if (type === 'BAR_KOT') {
            cmds    = buildKOTCommands({ ...data, label: 'BAR ORDER', sectionTag: data.sectionTag });
            printer = BAR_PRINTER;
            printTasks.push({ printer, cmds });
          } else if (type === 'BILL') {
            cmds    = buildBillCommands(data);
            if (data.sectionTag === 'venue-family-restaurant') {
              printer = DINE_IN_BILL_PRINTER;
            } else if (data.sectionTag === 'venue-restaurant-parcel') {
              printer = KOT_PRINTER;
            } else {
              printer = data.restaurantId === 'bar-001' ? BAR_PRINTER : BILLING_PRINTER;
            }
            printTasks.push({ printer, cmds });
          } else if (type === 'FINAL_BILL') {
            // Fetch pre-built ESC/POS data from backend
            const response = await fetch(`${VITE_API_URL}/api/print/final-bill`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ billData: data })
            });
            const res = await response.json();
            if (!res || !res.data) {
              throw new Error('No ESC/POS data received from backend');
            }
            cmds = Array.isArray(res.data) ? res.data : [res.data];
            if (data.sectionTag === 'venue-family-restaurant') {
              printer = DINE_IN_BILL_PRINTER;
            } else if (data.sectionTag === 'venue-restaurant-parcel') {
              printer = KOT_PRINTER;
            } else {
              printer = data.restaurantId === 'bar-001' ? BAR_PRINTER : BILLING_PRINTER;
            }
            printTasks.push({ printer, cmds });
          } else if (type === 'CANCEL_KOT') {
            cmds = buildCancelKOTCommands(data);
            if (data.restaurantId === 'venue-001') {
              const pt = data.item?.printerTarget;
              if (pt === 'BAR_PRINTER') {
                printer = DINE_IN_BILL_PRINTER;
              } else {
                // Default to kitchen when printerTarget is missing / KOT_PRINTER / null
                printer = KOT_FAMILY_PRINTER;
              }
            } else if (data.sectionTag === 'venue-family-restaurant') {
              printer = KOT_FAMILY_PRINTER;
            } else if (data.sectionTag === 'venue-restaurant-parcel') {
              printer = KOT_PRINTER;
            } else {
              printer = data.item?.menuType === 'BAR' ? BAR_PRINTER : KITCHEN_PRINTER;
            }
            printTasks.push({ printer, cmds });
          } else if (type === 'CANCEL_ORDER') {
            cmds = buildFullCancelCommands(data);
            if (data.restaurantId === 'venue-001') {
              // Cashier needs to know the order is voided; kitchen sees it stop coming
              printer = DINE_IN_BILL_PRINTER;
            } else if (data.sectionTag === 'venue-family-restaurant') {
              printer = KOT_FAMILY_PRINTER;
            } else if (data.sectionTag === 'venue-restaurant-parcel') {
              printer = KOT_PRINTER;
            } else {
              printer = KITCHEN_PRINTER;
            }
            printTasks.push({ printer, cmds });
          } else if (type === 'TABLE_SWAP') {
            cmds    = buildTableSwapCommands(data);
            printer = KITCHEN_PRINTER;
            printTasks.push({ printer, cmds });
          } else {
            pushLog(`Unknown print_job type: ${type}`, false);
            return;
          }

          // Execute all print tasks simultaneously
          await Promise.all(printTasks.map(async (task) => {
            await sendToPrinter(task.printer, task.cmds);
            pushLog(`✓ Printed [${type}] → ${task.printer} (Table ${data?.tableNumber ?? '?'})`);
          }));
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
      fontFamily: "'Inter', 'Roboto', 'Helvetica', 'Arial', sans-serif",
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
            { type: 'KOT',     label: 'Kitchen Printer',    name: KITCHEN_PRINTER },
            { type: 'BAR_KOT', label: 'Bar Printer',        name: BAR_PRINTER },
            { type: 'BILL',    label: 'Billing Printer',     name: BILLING_PRINTER },
            { type: 'FAMILY',  label: 'KOT Family Printer',  name: KOT_FAMILY_PRINTER },
            { type: 'DINE',    label: 'Dine in Bill Printer', name: DINE_IN_BILL_PRINTER },
            { type: 'PARCEL',  label: 'KOT Printer (Parcel)', name: KOT_PRINTER },
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
