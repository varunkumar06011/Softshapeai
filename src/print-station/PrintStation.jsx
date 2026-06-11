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



let KITCHEN_PRINTER = import.meta.env.VITE_KITCHEN_PRINTER_NAME || 'KITCHEN_PRINTER';

let BAR_PRINTER     = import.meta.env.VITE_BAR_PRINTER_NAME     || 'BAR_PRINTER';

let BILLING_PRINTER = import.meta.env.VITE_BILLING_PRINTER_NAME || 'BILLING_PRINTER';

let RESTAURANT_KITCHEN_PRINTER = import.meta.env.VITE_RESTAURANT_KITCHEN_PRINTER_NAME || KITCHEN_PRINTER;



// ── Restaurant printer routing ───────────────────────────────────────────────

let KOT_FAMILY_PRINTER   = import.meta.env.VITE_KOT_FAMILY_PRINTER_NAME   || 'KOT FAMILY';

let DINE_IN_BILL_PRINTER = import.meta.env.VITE_DINE_IN_BILL_PRINTER_NAME || 'Dine in Bill';

let KOT_PRINTER          = import.meta.env.VITE_KOT_PRINTER_NAME           || 'KOT PRINTER';



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

function buildKOTCommands({ tableNumber, kotId, items, label = 'FOOD ORDER', sectionName, captainName, sectionTag, restaurantId }) {

  const now = new Date();

  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });



  const displayKotId = kotId || "N/A";

  const rawLabel = (tableNumber || 'N/A').toString();

  const stripped = /^[BTVF]\d+$/i.test(rawLabel) ? rawLabel.slice(1) : rawLabel;

  const isFamilyRestaurant = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel' || restaurantId === 'venue-001';

  const tableDisplay = isFamilyRestaurant

    ? `F${stripped}`

    : (/^[BT]\d+$/i.test(rawLabel) ? rawLabel.slice(1) : rawLabel);



  // Determine venue label based on sectionTag

  const venueLabel = sectionTag === 'venue-family-restaurant'

    ? 'V GRAND FAMILY RESTAURANT'

    : (sectionTag === 'venue-restaurant-parcel'

        ? 'V GRAND FAMILY RESTAURANT'

        : label);



  const kotLabel = `KOT No : ${displayKotId}`;

  const tableLabel = `Table : ${tableDisplay}`;

  const gap = Math.max(1, LINE_NORMAL - kotLabel.length - tableLabel.length);



  const cmds = [

    INIT,

    CENTER,

    SIZE_HEIGHT,

    BOLD_ON,

    `${venueLabel}\n`,

    BOLD_OFF,

    SIZE_NORMAL,

    LEFT,

    separator("-"),

    BOLD_ON,

    kotLabel + ' '.repeat(gap) + tableLabel + '\n',

    BOLD_OFF,

    separator("-"),

    `Waiter : ${captainName && captainName !== 'N/A' && captainName !== 'undefined' ? captainName : 'Captain'}\n`,

    `Ordered Date : ${dateStr}  Time : ${timeStr}\n`,

    separator("-"),

    BOLD_ON,

    "Qty  Item\n",

    BOLD_OFF,

    separator("-"),

  ];



  const SIZE_3X = '\x1D\x21\x22'; // triple height + double width (approx 150%+ bigger than SIZE_2X)



  (items || []).forEach(item => {

    cmds.push(

      SIZE_NORMAL,

      `${item.quantity}  `,  // Qty at normal size

      SIZE_2X,              // Switch to 2x size (double width + double height)

      BOLD_ON,              // Bold

      `${item.name.toUpperCase()}\n`,  // Name at 2x bold

      BOLD_OFF,             // Reset bold

      SIZE_NORMAL,          // Reset size

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

    ? 'V GRAND FAMILY RESTAURANT'

    : 'CANCEL ITEM';



  const rawTable = (tableNumber || 'N/A').toString();

  const cancelNumeric = rawTable.replace(/^[A-Z]/i, '') || rawTable;

  const isFamilyRestaurant = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel' || restaurantId === 'venue-001';

  const tableDisplay = isFamilyRestaurant

    ? `F${cancelNumeric}`

    : rawTable;



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

    const itemLine = `${item.quantity}x ${item.name.toUpperCase()}`;

    cmds.push(

      CENTER,

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

    CENTER,

    `Hall Name : ${hallName}\n`,

    separator("-"),

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



function buildFullCancelCommands({ tableNumber, cancelledBy, timestamp, items, sectionName, sectionTag, restaurantId }) {

  const timeStr = new Date(timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });



  const venueLabel = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel'

    ? 'V GRAND FAMILY RESTAURANT'

    : 'CANCEL ORDER';



  const rawTable = (tableNumber || 'N/A').toString();

  const cancelNumeric = rawTable.replace(/^[A-Z]/i, '') || rawTable;

  const isFamilyRestaurant = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel' || restaurantId === 'venue-001';

  const tableDisplay = isFamilyRestaurant

    ? `F${cancelNumeric}`

    : rawTable;



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

    BOLD_ON,

    "Qty  Item\n",

    BOLD_OFF,

    separator("-"),

  ];



  (items || []).forEach(item => {

    const itemLine = `${item.quantity}    ${item.name.toUpperCase()}`;

    cmds.push(

      CENTER,

      SIZE_HEIGHT,

      BOLD_ON,

      itemLine + "\n",

      BOLD_OFF,

      SIZE_NORMAL,

    );

  });



  const hallName = sectionTag === 'venue-family-restaurant'

    ? 'DINE IN'

    : (sectionTag === 'venue-restaurant-parcel'

        ? 'PARCEL(FAMILY RESTAURANT)'

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

    SIZE_NORMAL,

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



function buildBillCommands({ tableNumber, items, totalAmount }) {

  const cmds = [

    INIT,

    CENTER,

    BOLD_ON,

    'BILL RECEIPT\n',

    BOLD_OFF,

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

          socket.emit('join:print', 'restaurant-001');

          socket.emit('join:print', 'bar-001');

          socket.emit('join:print', 'venue-001');

          hasJoinedRef.current = true;

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

      socket.on('reconnect', () => {

        // Explicit reconnect handler - ensure rooms are rejoined on reconnect

        socket.emit('join:print', 'restaurant-001');

        socket.emit('join:print', 'bar-001');

        socket.emit('join:print', 'venue-001');

        pushLog('Socket reconnected — rejoined print rooms ✓', true);

      });

      socket.on('disconnect', () => {

        setSockOk(false);

        pushLog('Socket disconnected', false);

      });



      socket.on('print_job', async ({ type, data }) => {

        pushLog(`Received print_job [${type}] — Table ${data?.tableNumber ?? '?'}`);

        try {

          let cmds, printer;

          // ── Deduplication for ALL print types ───────────────────────────────────

          {

            const itemCount = data.items?.length || 0;

            const tsBucket = Math.floor(Date.now() / 10000);

            const dedupKey = data.eventId

              ? String(data.eventId)

              : `${type}-${data.kotId || data.orderId || ''}-${data.tableNumber}-${itemCount}-${tsBucket}`;

            if (printedKotIds.current.has(dedupKey)) {

              pushLog(`Duplicate print_job skipped [${type}] — Table ${data?.tableNumber ?? '?'}`);

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

              // Use pre-built ESC/POS from backend when available

              if (data.escposData && data.escposData.length > 0) {

                printTasks.push({
                  printer: data.sectionTag === 'venue-bar-parcel' ? KITCHEN_PRINTER : KOT_FAMILY_PRINTER,
                  cmds: data.escposData
                });

              }

              if (data.escposDataCounter && data.escposDataCounter.length > 0) {

                // Parcel counter items go to KOT_PRINTER (parcel printer), not billing printer

                const counterPrinter = (data.sectionTag === 'venue-restaurant-parcel' || data.sectionTag === 'venue-bar-parcel')

                  ? BAR_PRINTER

                  : DINE_IN_BILL_PRINTER;

                printTasks.push({ printer: counterPrinter, cmds: data.escposDataCounter });

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

                  printTasks.push({

                    printer: data.sectionTag === 'venue-bar-parcel' ? KITCHEN_PRINTER : KOT_FAMILY_PRINTER,

                    cmds: buildKOTCommands({ ...data, items: kitchenItems, label: 'FOOD ORDER', sectionTag: data.sectionTag }),

                  });

                }

                if (counterItems.length > 0) {

                  const fallbackCounterPrinter = (data.sectionTag === 'venue-restaurant-parcel' || data.sectionTag === 'venue-bar-parcel')

                    ? BAR_PRINTER

                    : DINE_IN_BILL_PRINTER;

                  printTasks.push({

                    printer: fallbackCounterPrinter,

                    cmds: buildKOTCommands({ ...data, items: counterItems, label: 'COUNTER ORDER', sectionTag: data.sectionTag }),

                  });

                }

              }

            } else {

              // Non-venue-001: old restaurant or bar-venue

              if (data.escposData && data.escposData.length > 0) {

                printTasks.push({

                  printer: data.restaurantId === 'restaurant-001' ? RESTAURANT_KITCHEN_PRINTER : KITCHEN_PRINTER,

                  cmds: data.escposData,

                });

              } else {

                cmds = buildKOTCommands({ ...data, label: 'FOOD ORDER', sectionTag: data.sectionTag });

                printer = data.restaurantId === 'restaurant-001'

                  ? RESTAURANT_KITCHEN_PRINTER

                  : KITCHEN_PRINTER;

                printTasks.push({ printer, cmds });

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

              printer = data.restaurantId === 'bar-001' ? BAR_PRINTER : BILLING_PRINTER;

            }

            printTasks.push({ printer, cmds });

          } else if (type === 'FINAL_BILL') {

            // Use pre-built ESC/POS embedded in the socket payload (no Render round-trip)

            if (!data.escposData || !data.escposData.length) {

              throw new Error('No ESC/POS data received in print_job payload');

            }

            cmds = Array.isArray(data.escposData) ? data.escposData : [data.escposData];

            if (data.sectionTag === 'venue-family-restaurant' || data.sectionTag === 'venue-restaurant-parcel') {

              printer = DINE_IN_BILL_PRINTER;

            } else if (data.sectionTag === 'venue-restaurant-parcel') {
              printer = KOT_PRINTER;           // Parcel final bill → same printer as Parcel KOTs
            } else {

              printer = data.restaurantId === 'bar-001' ? BAR_PRINTER : BILLING_PRINTER;

            }

            printTasks.push({ printer, cmds });

          } else if (type === 'CANCEL_KOT') {

            cmds = buildCancelKOTCommands(data);

            if (data.restaurantId === 'venue-001') {

              // Route based on printerTarget set in admin menu page

              if (data.printerTarget === 'BAR_PRINTER') {

                printer = data.sectionTag === 'venue-restaurant-parcel' ? KOT_PRINTER : DINE_IN_BILL_PRINTER;

              } else {

                printer = KOT_FAMILY_PRINTER;    // food items (KOT_PRINTER or null)

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

            // Guard against truly invalid printer names (empty or undefined only)
            if (!task.printer || task.printer.trim() === '') {
              pushLog(`✗ Skipped print — no printer configured for this job type`, false);
              return;
            }

            await sendToPrinter(task.printer, task.cmds);

            pushLog(`✓ Printed [${type}] → ${task.printer} (Table ${data?.tableNumber ?? '?'})`);

          }));



          // Notify backend so captain UI can stop loading

          if (data?.requestId && data?.restaurantId) {

            socket.emit('print:ack', {

              restaurantId: data.restaurantId,

              requestId: data.requestId,

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

