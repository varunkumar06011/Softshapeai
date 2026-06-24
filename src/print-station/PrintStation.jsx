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

import { API_BASE } from '../services/apiConfig.js';

import { connectQZ, sendToPrinter, warmSignature, startKeepAlive, getQZ } from '../utils/qzTray.js';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { getBarId } from '../services/barApiConfig';
import { getVenueId } from '../services/venueApiConfig';
import { getRestaurantConfig } from '../utils/getRestaurantConfig.js';

// ── Configurable print rooms (for running separate PrintStations per outlet) ──
// Usage: /print-station?rooms=bar-001,venue-001   (only bar + venue)
//        /print-station?rooms=<restaurant-id>      (only current restaurant)
// Default: current restaurant + bar + venue
const urlRooms = new URLSearchParams(window.location.search).get('rooms');
function getPrintRooms() {
  if (urlRooms) return urlRooms.split(',').map(s => s.trim()).filter(Boolean);
  const rid = getCurrentRestaurantId();
  const barId = getBarId();
  const venueId = getVenueId();
  return [...new Set(rid ? [rid, barId, venueId] : [barId, venueId])];
}

// ── Per-printer sequential queue ─────────────────────────────────────────────
// Prevents printer overload when many orders fire simultaneously.
// Each printer processes jobs one at a time in FIFO order.
const printerQueues = new Map(); // printerName -> { queue: Array, processing: boolean }

async function enqueuePrint(printerName, cmds) {
  if (!printerQueues.has(printerName)) {
    printerQueues.set(printerName, { queue: [], processing: false });
  }
  const pq = printerQueues.get(printerName);
  pq.queue.push(cmds);

  if (pq.processing) return; // already processing, job is queued

  pq.processing = true;
  while (pq.queue.length > 0) {
    const task = pq.queue.shift();
    try {
      await sendToPrinter(printerName, task);
    } catch (err) {
      console.error(`[PrintQueue] Failed on ${printerName}:`, err.message);
      // Don't rethrow — log and continue to next job so one bad job doesn't block the queue
    }
  }
  pq.processing = false;
}



let KITCHEN_PRINTER = import.meta.env.VITE_KITCHEN_PRINTER_NAME || 'KITCHEN_PRINTER';

let BAR_PRINTER     = import.meta.env.VITE_BAR_PRINTER_NAME     || 'BAR_PRINTER';

let BILLING_PRINTER = import.meta.env.VITE_BILLING_PRINTER_NAME || 'BILLING_PRINTER';

let RESTAURANT_KITCHEN_PRINTER = import.meta.env.VITE_RESTAURANT_KITCHEN_PRINTER_NAME || KITCHEN_PRINTER;



// ── Restaurant printer routing ───────────────────────────────────────────────

let KOT_FAMILY_PRINTER   = import.meta.env.VITE_KOT_FAMILY_PRINTER_NAME   || 'KOT FAMILY';

let DINE_IN_BILL_PRINTER = import.meta.env.VITE_DINE_IN_BILL_PRINTER_NAME || 'Dine in Bill';

let KOT_PRINTER          = import.meta.env.VITE_KOT_PRINTER_NAME           || 'KOT PRINTER';

// Helper: resolve food KOT printer by sectionTag
function resolveFoodKotPrinter(sectionTag, restaurantId) {
  if (sectionTag === 'venue-bar-pdr' || sectionTag === 'venue-bar-rooms') return KITCHEN_PRINTER;
  if (sectionTag === 'venue-restaurant-parcel')                           return KOT_PRINTER;
  if (sectionTag === 'venue-bar-parcel' || sectionTag === 'venue-bar-gobox') return KITCHEN_PRINTER;
  if (restaurantId === getVenueId())                                       return KOT_FAMILY_PRINTER;
  // TODO Phase 3: replace with per-restaurant printer config once Restaurant model has a printer field — currently all restaurants share one generic printer mapping.
  if (restaurantId === getCurrentRestaurantId())                          return RESTAURANT_KITCHEN_PRINTER;
  return KITCHEN_PRINTER;
}
// Helper: resolve counter/liquor KOT printer by sectionTag (escposDataCounter path)
function resolveCounterKotPrinter(sectionTag) {
  if (sectionTag === 'venue-bar-pdr' || sectionTag === 'venue-bar-rooms')      return BAR_PRINTER;
  if (sectionTag === 'venue-restaurant-parcel' || sectionTag === 'venue-bar-parcel' || sectionTag === 'venue-bar-gobox') return BAR_PRINTER;
  return DINE_IN_BILL_PRINTER;
}



// ── localStorage printer overrides (admin settings) ──────────────────────────

try {

  const stored = localStorage.getItem('softshape_printer_config');

  if (stored) {

    const config = JSON.parse(stored);

    if (config.kitchenPrinter)           KITCHEN_PRINTER = config.kitchenPrinter;

    if (config.barPrinter)               BAR_PRINTER = config.barPrinter;

    if (config.billingPrinter)           BILLING_PRINTER = config.billingPrinter;

    if (config.restaurantKitchenPrinter) RESTAURANT_KITCHEN_PRINTER = config.restaurantKitchenPrinter;

    if (config.kotFamilyPrinter)         KOT_FAMILY_PRINTER = config.kotFamilyPrinter;

    if (config.dineInBillPrinter)        DINE_IN_BILL_PRINTER = config.dineInBillPrinter;

    if (config.kotPrinter)               KOT_PRINTER = config.kotPrinter;

  }

} catch {

  // ignore parse errors — fall back to env defaults

}




// ── Backend printer config override ──────────────────────────────────────────

try {
  const config = getRestaurantConfig();
  if (config.printerConfig && typeof config.printerConfig === 'object') {
    const pc = config.printerConfig;
    if (pc.kitchen)           KITCHEN_PRINTER           = pc.kitchen;
    if (pc.bar)               BAR_PRINTER               = pc.bar;
    if (pc.billing)           BILLING_PRINTER           = pc.billing;
    if (pc.restaurantKitchen) RESTAURANT_KITCHEN_PRINTER = pc.restaurantKitchen;
    if (pc.kotFamily)         KOT_FAMILY_PRINTER        = pc.kotFamily;
    if (pc.billing)           DINE_IN_BILL_PRINTER      = pc.billing;
    if (pc.kotPrinter)        KOT_PRINTER               = pc.kotPrinter;
  }
} catch {
  // ignore — fall back to env/localStorage values
}

// ── Receipt header from backend config ─────────────────────────────────────

const RECEIPT_HEADER = getRestaurantConfig().receiptHeader || 'RESTAURANT';
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

const SIZE_3X = '\x1D\x21\x22'; // triple height + double width

const SIZE_4X = '\x1D\x21\x33'; // quad height + quad width — maximum ESC/POS size (~75% bigger than SIZE_3X)

const SIZE_8X = '\x1D\x21\x77'; // 8x height + 8x width — MAXIMUM ESC/POS size for largest readable text

const SIZE_5X = '\x1D\x21\x52'; // 5x height + 2x width — massive readable text

const SIZE_TALL = '\x1D\x21\x30'; // 4x height, 1x width — tall readable text that fits on 58mm paper without wrapping

const FONT_A = '\x1B\x4D\x00'; // default 12x24 font (chunky)
const FONT_B = '\x1B\x4D\x01'; // 9x17 font (cleaner, sharper, more modern look)

const CUT = '\x1D\x56\x42\x00';



const LINE_NORMAL = 42;



function separator(ch = "-") { return ch.repeat(LINE_NORMAL) + '\n'; }



// ── ESC/POS builders ─────────────────────────────────────────────────────────

function buildKOTCommands({ tableNumber, kotId, items, label = 'FOOD ORDER', sectionName, captainName, sectionTag, restaurantId }) {

  const now = new Date();

  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });



  const displayKotId = kotId || "N/A";

  const rawLabel = (tableNumber || 'N/A').toString();

  const stripped = /^[BTVF]\d+$/i.test(rawLabel) ? rawLabel.slice(1) : rawLabel;

  const isFamilyRestaurant = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel' || restaurantId === getVenueId();

  const tableDisplay = isFamilyRestaurant

    ? `F${stripped}`

    : (/^[BT]\d+$/i.test(rawLabel) ? rawLabel.slice(1) : rawLabel);



  // Determine venue label based on sectionTag

  const venueLabel = sectionTag === 'venue-family-restaurant'

    ? RECEIPT_HEADER

    : (sectionTag === 'venue-restaurant-parcel'

        ? RECEIPT_HEADER

        : label);



  const kotLabel = `KOT No : ${displayKotId}`;

  const tableLabel = `Table : ${tableDisplay}`;

  const gap = Math.max(1, LINE_NORMAL - kotLabel.length - tableLabel.length);



  const cmds = [

    INIT,

    CENTER,

    SIZE_2X,

    BOLD_ON,

    `${venueLabel}\n`,

    BOLD_OFF,

    SIZE_2X,

    LEFT,

    separator("-"),

    BOLD_ON,

    kotLabel + ' '.repeat(gap) + tableLabel + '\n',

    BOLD_OFF,

    separator("-"),

    `Waiter : ${captainName && captainName !== 'N/A' && captainName !== 'undefined' ? captainName : 'Captain'}\n`,

    `Ordered Date : ${dateStr}  Time : ${timeStr}\n`,

    separator("-"),

    SIZE_2X,
    BOLD_ON,
    "Qty  Item\n",
    BOLD_OFF,
    SIZE_NORMAL,
    separator("-"),

  ];



  (items || []).forEach(item => {
    const line = `${item.quantity}    ${item.name.toUpperCase()}`;
    cmds.push(
      FONT_A,
      SIZE_8X,
      BOLD_ON,
      line + '\n',
      BOLD_OFF,
      SIZE_NORMAL,
    );
    if (item.notes && item.notes.trim()) {
      cmds.push(`     * ${item.notes.trim()}\n`);
    }
  });



  // Hall name based on sectionTag

  const hallName = sectionTag === 'venue-family-restaurant'

    ? 'DINE IN'

    : (sectionTag === 'venue-restaurant-parcel'

        ? 'OWNER(FAMILY RESTAURANT)'

        : (sectionName ? sectionName.toUpperCase() : 'MAIN HALL'));

  cmds.push(

    separator("-"),

    BOLD_ON,

    `Hall Name : ${hallName}\n`,

    BOLD_OFF,

    "\n\n\n",

    CUT

  );



  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];

}



function buildCancelKOTCommands({ tableNumber, cancelledBy, timestamp, item, sectionName, sectionTag, restaurantId }) {

  const timeStr = new Date(timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const itemType = item?.menuType === 'BAR' ? 'Bar Item' : 'Food Item';



  // Venue label for restaurant side cancels

  const venueLabel = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel'

    ? RECEIPT_HEADER

    : 'CANCEL ITEM';



  // For venue tables, use the already-formatted label as-is
  // For bar/restaurant, strip the B/T prefix to show just the number
  const rawTable = (tableNumber || 'N/A').toString();
  const tableDisplay = (sectionTag && sectionTag.startsWith('venue-'))
    ? rawTable
    : (/^[BT]\d+$/i.test(rawTable) ? rawTable.slice(1) : rawTable);

  const cmds = [

    INIT,

    CENTER,

    BOLD_ON,

    `${venueLabel}\n`,

    BOLD_OFF,

    CENTER,

    separator("-"),

    `Table : ${tableDisplay}\n`,

    `Time  : ${timeStr}\n`,

    `By    : ${cancelledBy || 'Staff'}\n`,

    separator("-"),

  ];



  if (item) {
    const itemLine = `${item.quantity}    ${item.name.toUpperCase()}`;
    cmds.push(
      LEFT,
      FONT_A,
      SIZE_2X,
      BOLD_ON,
      itemLine + '\n',
      BOLD_OFF,
      SIZE_NORMAL,
      `Type  : ${itemType}\n`
    );
  }



  const hallName = sectionTag === 'venue-family-restaurant'

    ? 'DINE IN'

    : (sectionTag === 'venue-restaurant-parcel'

        ? 'OWNER(FAMILY RESTAURANT)'

        : (sectionName ? sectionName.toUpperCase() : 'N/A'));

  cmds.push(

    separator("-"),

    CENTER,

    `Hall Name : ${hallName}\n`,

    separator("-"),

    SIZE_HEIGHT,
    BOLD_ON,
    '** CANCELLED **\n',
    BOLD_OFF,
    SIZE_2X,

    '\n\n\n',

    CUT

  );



  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];

}



function buildFullCancelCommands({ tableNumber, cancelledBy, timestamp, items, sectionName, sectionTag, restaurantId }) {

  const timeStr = new Date(timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });



  const venueLabel = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel'

    ? RECEIPT_HEADER

    : 'CANCEL ORDER';



  // For venue tables, use the already-formatted label as-is
  // For bar/restaurant, strip the B/T prefix to show just the number
  const rawTable = (tableNumber || 'N/A').toString();
  const tableDisplay = (sectionTag && sectionTag.startsWith('venue-'))
    ? rawTable
    : (/^[BT]\d+$/i.test(rawTable) ? rawTable.slice(1) : rawTable);



  const cmds = [

    INIT,

    CENTER,

    BOLD_ON,

    `${venueLabel}\n`,

    BOLD_OFF,

    CENTER,

    separator("-"),

    `Table : ${tableDisplay}\n`,

    `Time  : ${timeStr}\n`,

    `By    : ${cancelledBy || 'Staff'}\n`,

    separator("-"),

    SIZE_2X,
    BOLD_ON,
    "Qty  Item\n",
    BOLD_OFF,
    SIZE_NORMAL,
    separator("-"),

  ];



  (items || []).forEach(item => {
    const itemLine = `${item.quantity}    ${item.name.toUpperCase()}`;
    cmds.push(
      LEFT,
      FONT_A,
      SIZE_8X,
      BOLD_ON,
      itemLine + '\n',
      BOLD_OFF,
      SIZE_NORMAL,
    );
  });



  const hallName = sectionTag === 'venue-family-restaurant'

    ? 'DINE IN'

    : (sectionTag === 'venue-restaurant-parcel'

        ? 'OWNER(FAMILY RESTAURANT)'

        : (sectionName ? sectionName.toUpperCase() : 'N/A'));

  cmds.push(

    separator("-"),

    CENTER,

    `Hall Name : ${hallName}\n`,

    separator("-"),

    SIZE_4X,
    BOLD_ON,
    '** CANCELLED **\n',
    BOLD_OFF,
    SIZE_2X,

    '\n\n\n',

    CUT

  );



  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];

}





function pad(str, len) { return String(str).padEnd(len); }

function padRight(left, right, width = LINE_NORMAL) {

  const leftStr = String(left).slice(0, width - String(right).length - 1);

  return leftStr.padEnd(width - String(right).length) + right;

}



function buildBillCommands({ tableNumber, items, totalAmount, restaurantId, sectionTag }) {

  const venueLabel = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel'
    ? RECEIPT_HEADER
    : (restaurantId === getBarId() ? 'BAR ORDER'
      : (restaurantId === getVenueId() ? RECEIPT_HEADER
        : RECEIPT_HEADER));

  const cmds = [

    INIT,

    CENTER,

    BOLD_ON,

    `${venueLabel}\n`,

    BOLD_OFF,

    SIZE_2X,

    BOLD_ON,

    'BILL RECEIPT\n',

    BOLD_OFF,

    SIZE_NORMAL,

    separator(),

    LEFT,

    `Table : ${tableNumber}\n`,

    `Date  : ${new Date().toLocaleString('en-IN')}\n`,

    separator(),

    BOLD_ON,

    pad('ITEM', 24) + pad('QTY', 6) + 'AMT'.padStart(12) + '\n',

    BOLD_OFF,

    separator(),

  ];

  (items || []).forEach(item => {

    const name = String(item.name || item.n || '').slice(0, 24);

    const qty  = String(item.quantity || item.q || 1);

    const amt  = 'Rs.' + ((item.price || item.p || 0) * (item.quantity || item.q || 1)).toFixed(0);

    cmds.push(pad(name, 24) + pad(qty, 6) + amt.padStart(12) + '\n');

  });

  const subtotal = Number(totalAmount) || 0;

  const tax = subtotal * 0.05;

  const total = subtotal + tax;

  cmds.push(

    separator(),

    padRight('Subtotal', 'Rs.' + subtotal.toFixed(0)) + '\n',

    padRight('GST (5%)', 'Rs.' + tax.toFixed(0)) + '\n',

    separator('='),

    BOLD_ON,

    padRight('TOTAL', 'Rs.' + total.toFixed(0)) + '\n',

    BOLD_OFF,

    separator(),

    CENTER,

    'Thank you! Visit again.\n',

    '\n',

    'Powered by VTech - Softshape.ai\n',

    '\n\n\n',

    CUT,

  );

  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];

}



function buildTableSwapCommands({ fromTableNumber, toTableNumber, swappedBy, timestamp }) {

  const cmds = [

    INIT,

    SIZE_2X,

    CENTER,

    BOLD_ON,

    'TABLE MOVED\n',

    BOLD_OFF,

    separator(),

    LEFT,

    `From  : Table ${fromTableNumber}\n`,

    `To    : Table ${toTableNumber}\n`,

    `By    : ${swappedBy || 'Staff'}\n`,

    `Time  : ${new Date(timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}\n`,

    separator(),

    CENTER,

    BOLD_ON,

    'Session transferred\n',

    BOLD_OFF,

    '\n\n',

    CUT,

  ];

  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];

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

  const hasJoinedRef = useRef(false);


  const restaurantConfig = getRestaurantConfig();
  const RECEIPT_HEADER = restaurantConfig.receiptHeader || 'RESTAURANT';
  // ── Load printedKotIds from sessionStorage on mount ───────────────────────
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('ps_printed_ids');
      if (stored) {
        const ids = JSON.parse(stored);
        printedKotIds.current = new Set(ids);
      }
    } catch (err) {
      console.warn('[PrintStation] Failed to load printedKotIds from sessionStorage:', err);
    }
  }, []);



  const pushLog = useCallback((msg, ok = true) => {

    setLog(prev => [

      { msg, ok, ts: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },

      ...prev,

    ].slice(0, MAX_LOG));

  }, []);



  // ── QZ Tray init + retry ─────────────────────────────────────────────────

  const stopKeepAliveRef = useRef(null);



  const initQZ = useCallback(async () => {

    setQzStatus('connecting');

    try {

      await connectQZ();

      await warmSignature();

      if (stopKeepAliveRef.current) stopKeepAliveRef.current();

      stopKeepAliveRef.current = startKeepAlive();

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

    return () => {

      clearTimeout(retryTimer.current);

      if (stopKeepAliveRef.current) stopKeepAliveRef.current();

    };

  }, [initQZ]);



  // ── Socket.io ────────────────────────────────────────────────────────────

  useEffect(() => {

    let socket;

    (async () => {

      // If a live socket already exists, reuse it and skip recreation

      if (socketRef.current?.connected) {

        pushLog('Socket already connected — skipping recreation');

        return;

      }

      socket = io(API_BASE, {

        path: '/socket.io',

        transports: ['websocket', 'polling'],

        reconnection: true,

        reconnectionAttempts: Infinity,

        reconnectionDelay: 2000,

        reconnectionDelayMax: 10000,   // cap backoff at 10s — don't let it stretch too long

        timeout: 20000,                // connection timeout

      });

      socketRef.current = socket;



      socket.on('connect', () => {

        setSockOk(true);

        if (!hasJoinedRef.current) {

          // Join DEDICATED print rooms — these are isolated from the main

          // restaurant/bar rooms that captain and cashier sockets join.

          // This guarantees print_job events are only delivered to this

          // PrintStation socket, preventing double-printing.

          // Small delay ensures server-side socket state is ready before we join

          setTimeout(() => {

            getPrintRooms().forEach(room => socket.emit('join:print', room));

            hasJoinedRef.current = true;

            pushLog(`Socket connected — joined print rooms: ${getPrintRooms().join(', ')} ✓`);

          }, 500);

        } else {

          // On reconnect: re-join the print rooms because the server treats

          // the reconnected socket as a new connection (new socket ID) and

          // removes it from all rooms. We MUST re-emit join:print.

          setTimeout(() => {

            getPrintRooms().forEach(room => socket.emit('join:print', room));

            pushLog(`Socket reconnected — rejoined print rooms: ${getPrintRooms().join(', ')} ✓`);

          }, 500);

        }

      });

      socket.on('reconnect', () => {

        pushLog('Socket reconnected — rejoining print rooms…', true);

        // Small delay ensures server-side socket state is ready before we join

        setTimeout(() => {

          getPrintRooms().forEach(room => socket.emit('join:print', room));

          pushLog(`Socket reconnected — rejoined print rooms: ${getPrintRooms().join(', ')} ✓`, true);

        }, 500);

      });

      socket.on('disconnect', () => {

        setSockOk(false);

        pushLog('Socket disconnected', false);

      });



      socket.on('print_job', async (envelope) => {

        const { type, data, eventId: envelopeEventId } = envelope;

        const stableEventId = envelopeEventId || data?.eventId; // declared outside try so catch can reference it
        pushLog(`Received print_job [${type}] — Table ${data?.tableNumber ?? '?'}`);

        try {

          let cmds, printer;

          // ── Deduplication for ALL print types ───────────────────────────────────

          {

            const itemCount = data.items?.length || 0;

            const dedupKey = stableEventId

              ? String(stableEventId)

              : `${type}-${data.kotId || data.orderId || ''}-${data.tableNumber}-${itemCount}`;

            // NOTE: removed tsBucket — it caused duplicate prints at 10s boundaries.

            // orderId+kotId+tableNumber+itemCount is stable and unique enough.

            if (printedKotIds.current.has(dedupKey)) {

              pushLog(`Duplicate print_job skipped [${type}] — Table ${data?.tableNumber ?? '?'}`);

              return;

            }

            printedKotIds.current.add(dedupKey);

            // Save to sessionStorage for persistence across refreshes
            try {
              sessionStorage.setItem('ps_printed_ids', JSON.stringify([...printedKotIds.current]));
            } catch (err) {
              console.warn('[PrintStation] Failed to save printedKotIds to sessionStorage:', err);
            }

            if (printedKotIds.current.size > 200) {

              const entries = [...printedKotIds.current];

              entries.splice(0, 100);

              printedKotIds.current = new Set(entries);

              // Update sessionStorage after truncation
              try {
                sessionStorage.setItem('ps_printed_ids', JSON.stringify([...printedKotIds.current]));
              } catch (err) {
                console.warn('[PrintStation] Failed to save truncated printedKotIds to sessionStorage:', err);
              }

            }

          }



          // ── Routing ──────────────────────────────────────────────────────────

          const printTasks = []; // { printer, cmds }



          if (type === 'KOT') {

            if (data.restaurantId === getVenueId()) {

              // Use pre-built ESC/POS from backend when available

              if (data.escposData && data.escposData.length > 0) {

                printTasks.push({ printer: resolveFoodKotPrinter(data.sectionTag, data.restaurantId), cmds: data.escposData });

              }

              if (data.escposDataCounter && data.escposDataCounter.length > 0) {

                // Owner counter items go to KOT_PRINTER (owner printer), not billing printer

                printTasks.push({ printer: resolveCounterKotPrinter(data.sectionTag), cmds: data.escposDataCounter });

              }

              // Fallback to local builder if backend didn't send escposData

              const COUNTER_CATEGORIES = ['beverages', 'cold drinks', 'soft drinks', 'ice cream',

                                           'ice creams', 'mocktails', 'juices', 'water', 'drinks'];

              const isCounterItem = (item) => {

                const cat = (item.category || '').toLowerCase();

                return COUNTER_CATEGORIES.some(c => cat.includes(c)) || item.menuType === 'LIQUOR';

              };

              if (printTasks.length === 0) {

                const kitchenItems = (data.items || []).filter(i => !isCounterItem(i));

                const counterItems = (data.items || []).filter(i => isCounterItem(i));

                if (kitchenItems.length > 0) {
                  const fallbackFoodPrinter = resolveFoodKotPrinter(data.sectionTag, data.restaurantId);
                  printTasks.push({
                    printer: fallbackFoodPrinter,
                    cmds: buildKOTCommands({ ...data, items: kitchenItems, label: 'FOOD ORDER', sectionTag: data.sectionTag }),
                  });
                }

                if (counterItems.length > 0) {

                  const fallbackCounterPrinter = resolveCounterKotPrinter(data.sectionTag);

                  printTasks.push({

                    printer: fallbackCounterPrinter,

                    cmds: buildKOTCommands({ ...data, items: counterItems, label: 'COUNTER ORDER', sectionTag: data.sectionTag }),

                  });

                }

              }

            } else {

              // Non-venue-001: check sectionTag first so parcel/PDR/Rooms still route correctly
              const nonVenuePrinter = resolveFoodKotPrinter(data.sectionTag, data.restaurantId);

              if (data.escposData && data.escposData.length > 0) {

                printTasks.push({ printer: nonVenuePrinter, cmds: data.escposData });

              } else {

                cmds = buildKOTCommands({ ...data, label: 'FOOD ORDER', sectionTag: data.sectionTag });

                printTasks.push({ printer: nonVenuePrinter, cmds });

              }

            }

          } else if (type === 'BAR_KOT') {

            if (data.escposData && data.escposData.length > 0) {

              printTasks.push({ printer: BAR_PRINTER, cmds: data.escposData });

            } else {

              cmds = buildKOTCommands({ ...data, label: 'BAR ORDER', sectionTag: data.sectionTag });

              printer = BAR_PRINTER;

              printTasks.push({ printer, cmds });

            }

          } else if (type === 'BILL') {

            cmds = buildBillCommands(data);

            if (data.sectionTag === 'venue-family-restaurant') {

              printer = KOT_FAMILY_PRINTER;

            } else if (data.sectionTag === 'venue-restaurant-parcel') {

              printer = KOT_PRINTER;

            } else {

              printer = data.restaurantId === getBarId() ? BAR_PRINTER : BILLING_PRINTER;

            }

            printTasks.push({ printer, cmds });

          } else if (type === 'FINAL_BILL') {

            // Use pre-built ESC/POS embedded in the socket payload (no Render round-trip)

            if (!data.escposData || !data.escposData.length) {

              throw new Error('No ESC/POS data received in print_job payload');

            }

            cmds = Array.isArray(data.escposData) ? data.escposData : [data.escposData];

            if (data.sectionTag === 'venue-family-restaurant') {

              printer = DINE_IN_BILL_PRINTER;

            } else if (data.sectionTag === 'venue-restaurant-parcel') {

              printer = KOT_PRINTER;           // Parcel direct bill → kitchen printer in final bill format

            } else {

              printer = data.restaurantId === getBarId() ? BAR_PRINTER : BILLING_PRINTER;

            }

            printTasks.push({ printer, cmds });

          } else if (type === 'CANCEL_KOT') {
            // Separate food vs bar items
            const allCancelItems = data.items && data.items.length > 0 ? data.items : [data.item].filter(Boolean);
            const foodItems = allCancelItems.filter(i => i.menuType !== 'BAR');
            const barItems  = allCancelItems.filter(i => i.menuType === 'BAR');

            const buildSlip = (items) => {
              const payload = { ...data, items, item: items[0] };
              return items.length > 1 ? buildFullCancelCommands(payload) : buildCancelKOTCommands(payload);
            };

            const resolveCancelPrinter = (menuType) => {
              const isLiquor = menuType === 'BAR' || menuType === 'LIQUOR';
              // PDR / Rooms: liquor → BAR_PRINTER, food → KITCHEN_PRINTER
              if (data.sectionTag === 'venue-bar-pdr' || data.sectionTag === 'venue-bar-rooms')
                return isLiquor ? BAR_PRINTER : KITCHEN_PRINTER;
              // Parcel / Owner: liquor → BAR_PRINTER, food → KOT_PRINTER
              if (data.sectionTag === 'venue-restaurant-parcel')
                return isLiquor ? BAR_PRINTER : KOT_PRINTER;
              // Bar parcel / GoBox
              if (data.sectionTag === 'venue-bar-parcel' || data.sectionTag === 'venue-bar-gobox')
                return isLiquor ? BAR_PRINTER : KITCHEN_PRINTER;
              // Family restaurant
              if (data.sectionTag === 'venue-family-restaurant') return KOT_FAMILY_PRINTER;
              // venue-001 generic
              if (data.restaurantId === getVenueId()) return isLiquor ? BAR_PRINTER : KOT_FAMILY_PRINTER;
              // Non-venue: bar items → bar, food → kitchen
              return isLiquor ? BAR_PRINTER : KITCHEN_PRINTER;
            };

            if (foodItems.length > 0) printTasks.push({ printer: resolveCancelPrinter('FOOD'), cmds: buildSlip(foodItems) });
            if (barItems.length  > 0) printTasks.push({ printer: resolveCancelPrinter('BAR'),  cmds: buildSlip(barItems)  });

          } else if (type === 'CANCEL_ORDER') {

            cmds = buildFullCancelCommands(data);

            if (data.restaurantId === getVenueId()) {

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



          // Execute print tasks through per-printer queues (sequential per printer,
          // parallel across different printers). Prevents one printer from being
          // flooded by many simultaneous orders.
          for (const task of printTasks) {
            if (!task.printer || task.printer.trim() === '') {
              pushLog(`✗ Skipped print — no printer configured for this job type`, false);
              continue;
            }
            // Fire into queue asynchronously — don't await so multiple printers run in parallel
            enqueuePrint(task.printer, task.cmds).then(() => {
              pushLog(`✓ Printed [${type}] → ${task.printer} (Table ${data?.tableNumber ?? '?'})`);
            }).catch(err => {
              pushLog(`✗ Print failed [${type}] → ${task.printer}: ${err.message}`, false);
            });
          }



          // Notify backend so captain UI can stop loading
          // Also send eventId for server-side deduplication

          if (data?.requestId && data?.restaurantId) {

            socket.emit('print:ack', {

              restaurantId: data.restaurantId,

              requestId: data.requestId,

              eventId: stableEventId || null,

              status: 'success',

            });

          }

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

    return () => {

      hasJoinedRef.current = false;

      socket?.disconnect();

    };

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

            { type: 'PARCEL',  label: 'KOT Printer (Owner)', name: KOT_PRINTER },

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


