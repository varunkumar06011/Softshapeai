import { buildFoodKOT, buildLiquorKOT, buildFinalBill, buildCancelKOT } from '../../utils/escposFrontend';
import { calculateLocalBill, createLocalOrderDraft } from './billing';
import { encodeEscposBlocks } from '../printing/printer';
import { createPrintQueue, dispatchPrintJob } from '../printing/printQueue';

function makeId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function readPrinterConfig(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function getConnection(config, role) {
  const connection = config[role] || config[`${role}Printer`] || {};
  if (typeof connection === 'string') return { type: 'lan', ip: connection, port: 9100 };
  return connection;
}

function printerLabel(connection, role) {
  return connection.name || connection.deviceName || connection.ip || `unconfigured-${role}`;
}

export function createLocalOrderService({ database, printer, now = () => Date.now() }) {
  const queue = createPrintQueue(database, { now });
  let lock = Promise.resolve();

  async function serialized(operation) {
    const previous = lock;
    let release;
    lock = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  async function nextCounterValue(restaurantId, counterDate, column) {
    if (!['kot_count', 'bill_count', 'txn_count'].includes(column)) throw new Error('Unsupported counter');
    const rows = await database.query(
      `SELECT ${column} FROM daily_counter WHERE restaurant_id = ? AND counter_date = ? LIMIT 1`,
      [restaurantId, counterDate],
    );
    const current = Number(rows[0]?.[column] || 0) + 1;
    await database.transaction([{
      sql: `INSERT INTO daily_counter(id, restaurant_id, counter_date, ${column}) VALUES (?, ?, ?, ?)
            ON CONFLICT(restaurant_id, counter_date) DO UPDATE SET ${column} = excluded.${column}`,
      values: [makeId('counter'), restaurantId, counterDate, current],
    }]);
    return current;
  }

  async function getOutlet(restaurantId) {
    const rows = await database.query('SELECT * FROM outlet WHERE id = ? LIMIT 1', [restaurantId]);
    return rows[0] || { id: restaurantId, name: '' };
  }

  async function createOrder(payload = {}) {
    return serialized(async () => {
      const restaurantId = String(payload.restaurantId || '').trim();
      const tableId = String(payload.tableId || '').trim();
      if (!restaurantId || !tableId) throw new Error('restaurantId and tableId are required');

      const outlet = await getOutlet(restaurantId);
      const config = {
        gstCategory: outlet.gst_category,
        gstRegistered: Boolean(outlet.gst_registered),
        gstRate: outlet.gst_rate,
        serviceChargePercent: outlet.service_charge_percent,
      };
      const counterDate = String(payload.counterDate || new Date(now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
      const requestId = String(payload.requestId || makeId('request'));
      const orderId = String(payload.orderId || makeId('order'));
      const kotNumber = await nextCounterValue(restaurantId, counterDate, 'kot_count');
      const draft = createLocalOrderDraft({
        orderId, requestId, restaurantId, tableId, tableNumber: payload.tableNumber,
        items: payload.items, kotNumber, counterDate, captainId: payload.captainId,
        createdByUserId: payload.createdByUserId, platform: payload.platform,
        discountPercent: payload.discountPercent, config,
      });
      const localItems = draft.items.map((item) => ({ ...item, id: makeId('item') }));
      const kotOrderData = {
        tableNumber: payload.tableNumber ?? tableId,
        orderId,
        items: localItems.map((item) => ({ ...item, type: item.menuType === 'LIQUOR' ? 'liquor' : 'food' })),
        kotId: String(kotNumber),
        captainName: payload.captainName || 'Cashier',
        restaurantName: outlet.name,
      };
      const foodItems = localItems.filter((item) => item.menuType !== 'LIQUOR');
      const liquorItems = localItems.filter((item) => item.menuType === 'LIQUOR');
      const printerConfig = readPrinterConfig(outlet.printer_config);
      const printGroups = [];
      if (foodItems.length) printGroups.push({ type: 'KOT', items: foodItems, bytes: encodeEscposBlocks(buildFoodKOT({ ...kotOrderData, items: foodItems })), connection: getConnection(printerConfig, 'kitchen') });
      if (liquorItems.length) printGroups.push({ type: 'BAR_KOT', items: liquorItems, bytes: encodeEscposBlocks(buildLiquorKOT({ ...kotOrderData, items: liquorItems })), connection: getConnection(printerConfig, 'bar') });

      const kotItemRecords = [];
      const statements = [{
        sql: `INSERT INTO order_record
          (id, restaurant_id, table_id, status, platform, total_amount, discount_percent, discount_amount,
           service_charge_amount, cgst, sgst, round_off, captain_id, created_by_user_id, created_at,
           updated_at, revision, last_request_id, cloud_synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [draft.order.id, restaurantId, tableId, draft.order.status, draft.order.platform, draft.order.totalAmount, draft.order.discountPercent, draft.order.discountAmount, draft.order.serviceChargeAmount, draft.order.cgst, draft.order.sgst, draft.order.roundOff, draft.order.captainId, draft.order.createdByUserId, draft.order.createdAt, draft.order.updatedAt, draft.order.revision, requestId, 0],
      }];
      for (const item of localItems) statements.push({
        sql: `INSERT INTO order_item(id, order_id, menu_item_id, name, price, quantity, notes, menu_type, gst_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [item.id, orderId, item.menuItemId, item.name, item.price, item.quantity, item.notes, item.menuType, item.gstEnabled ? 1 : 0, draft.order.createdAt, draft.order.updatedAt],
      });
      statements.push({
        sql: `INSERT INTO kot(id, restaurant_id, order_id, table_id, kot_number, counter_date, captain_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [draft.kot.id, restaurantId, orderId, tableId, kotNumber, counterDate, draft.kot.captainId, draft.kot.createdAt],
      });
      for (const group of printGroups) for (const item of group.items) {
        const kotItem = { id: makeId('kot-item'), kotId: draft.kot.id, orderItemId: item.id, menuItemId: item.menuItemId, name: item.name, quantity: item.quantity, notes: item.notes, printerName: printerLabel(group.connection, group.type) };
        kotItemRecords.push(kotItem);
        statements.push({
          sql: `INSERT INTO kot_item(id, kot_id, order_item_id, menu_item_id, name, quantity, notes, printer_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [kotItem.id, kotItem.kotId, kotItem.orderItemId, kotItem.menuItemId, kotItem.name, kotItem.quantity, kotItem.notes, kotItem.printerName, draft.kot.createdAt],
        });
      }
      statements.push({ sql: 'UPDATE "table" SET status = ?, current_bill = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND restaurant_id = ?', values: ['OCCUPIED', draft.order.totalAmount, draft.order.updatedAt, tableId, restaurantId] });
      for (const group of printGroups) {
        const eventId = `${requestId}-${group.type.toLowerCase()}`;
        const printPayload = { connection: group.connection, bytes: group.bytes };
        statements.push({
          sql: `INSERT INTO print_job(event_id, restaurant_id, order_id, kot_id, type, target_printer, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [eventId, restaurantId, orderId, draft.kot.id, group.type, printerLabel(group.connection, group.type), JSON.stringify(printPayload), 'QUEUED', draft.order.createdAt],
        });
      }
      const syncEntry = (tableName, recordId, payload, suffix = tableName) => ({
        sql: `INSERT INTO sync_queue(restaurant_id, table_name, record_id, operation, request_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [restaurantId, tableName, recordId, 'insert', `${requestId}-${suffix}`, JSON.stringify(payload), 'PENDING', draft.order.createdAt],
      });
      statements.push(syncEntry('order', orderId, { ...draft.order, items: localItems }));
      for (const item of localItems) statements.push(syncEntry('order_item', item.id, { ...item, orderId }, item.id));
      statements.push(syncEntry('kot', draft.kot.id, { ...draft.kot, items: kotItemRecords }, 'kot'));
      for (const item of kotItemRecords) statements.push(syncEntry('kot_item', item.id, { ...item, orderId }, item.id));
      await database.transaction(statements);

      const printResults = [];
      for (const group of printGroups) {
        const eventId = `${requestId}-${group.type.toLowerCase()}`;
        printResults.push(await dispatchPrintJob({ queue, printer, job: { eventId, payload: { connection: group.connection, bytes: group.bytes } } }));
      }
      return { success: true, orderId, kotNumber, order: draft.order, totals: draft.totals, printResults };
    });
  }

  async function updateOrderItems(orderId, payload = {}) {
    return serialized(async () => {
      const { order, items: existingRows, outlet } = await getOrderBundle(orderId);
      if (order.status === 'PAID' || order.status === 'CANCELLED') throw new Error('Cannot update a closed order');
      const incoming = calculateLocalBill(payload.items || [], { config: { gstCategory: outlet.gst_category, gstRegistered: Boolean(outlet.gst_registered), gstRate: outlet.gst_rate, serviceChargePercent: 0 } }).items;
      if (!incoming.length) throw new Error('At least one order item is required');
      const existingItems = billItems(existingRows);
      const combinedBill = calculateLocalBill([...existingItems, ...incoming], { discountPercent: Number(order.discount_percent || 0), config: { gstCategory: outlet.gst_category, gstRegistered: Boolean(outlet.gst_registered), gstRate: outlet.gst_rate, serviceChargePercent: outlet.service_charge_percent } });
      const counterDate = String(payload.counterDate || new Date(now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
      const requestId = String(payload.requestId || makeId('request'));
      const kotNumber = await nextCounterValue(order.restaurant_id, counterDate, 'kot_count');
      const localItems = incoming.map((item) => ({ ...item, id: makeId('item') }));
      const kotId = `kot-${requestId}`;
      const kotOrderData = { tableNumber: payload.tableNumber || order.table_id, orderId, items: localItems.map((item) => ({ ...item, type: item.menuType === 'LIQUOR' ? 'liquor' : 'food' })), kotId: String(kotNumber), captainName: payload.captainName || 'Captain', restaurantName: outlet.name };
      const printerConfig = readPrinterConfig(outlet.printer_config);
      const groups = [];
      const foodItems = localItems.filter((item) => item.menuType !== 'LIQUOR');
      const liquorItems = localItems.filter((item) => item.menuType === 'LIQUOR');
      if (foodItems.length) groups.push({ type: 'KOT', items: foodItems, bytes: encodeEscposBlocks(buildFoodKOT({ ...kotOrderData, items: foodItems })), connection: getConnection(printerConfig, 'kitchen') });
      if (liquorItems.length) groups.push({ type: 'BAR_KOT', items: liquorItems, bytes: encodeEscposBlocks(buildLiquorKOT({ ...kotOrderData, items: liquorItems })), connection: getConnection(printerConfig, 'bar') });
      const timestamp = now();
      const kotItemRecords = [];
      const statements = [];
      for (const item of localItems) statements.push({ sql: `INSERT INTO order_item(id, order_id, menu_item_id, name, price, quantity, notes, menu_type, gst_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values: [item.id, orderId, item.menuItemId, item.name, item.price, item.quantity, item.notes, item.menuType, item.gstEnabled ? 1 : 0, timestamp, timestamp] });
      statements.push({ sql: `INSERT INTO kot(id, restaurant_id, order_id, table_id, kot_number, counter_date, captain_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values: [kotId, order.restaurant_id, orderId, order.table_id, kotNumber, counterDate, payload.captainId || null, timestamp] });
      for (const group of groups) for (const item of group.items) {
        const kotItem = { id: makeId('kot-item'), kotId, orderItemId: item.id, menuItemId: item.menuItemId, name: item.name, quantity: item.quantity, notes: item.notes, printerName: printerLabel(group.connection, group.type) };
        kotItemRecords.push(kotItem);
        statements.push({ sql: `INSERT INTO kot_item(id, kot_id, order_item_id, menu_item_id, name, quantity, notes, printer_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, values: [kotItem.id, kotItem.kotId, kotItem.orderItemId, kotItem.menuItemId, kotItem.name, kotItem.quantity, kotItem.notes, kotItem.printerName, timestamp] });
      }
      statements.push({ sql: `UPDATE order_record SET total_amount = ?, discount_amount = ?, service_charge_amount = ?, cgst = ?, sgst = ?, round_off = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`, values: [combinedBill.grandTotal, combinedBill.discountAmount, combinedBill.serviceChargeAmount, combinedBill.cgst, combinedBill.sgst, combinedBill.roundOff, timestamp, orderId] });
      for (const group of groups) {
        const eventId = `${requestId}-${group.type.toLowerCase()}`;
        statements.push({ sql: `INSERT INTO print_job(event_id, restaurant_id, order_id, kot_id, type, target_printer, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, values: [eventId, order.restaurant_id, orderId, kotId, group.type, printerLabel(group.connection, group.type), JSON.stringify({ connection: group.connection, bytes: group.bytes }), 'QUEUED', timestamp] });
      }
      const syncUpdate = (tableName, recordId, payload, suffix = tableName) => ({
        sql: `INSERT INTO sync_queue(restaurant_id, table_name, record_id, operation, request_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [order.restaurant_id, tableName, recordId, tableName === 'order' ? 'update' : 'insert', `${requestId}-${suffix}`, JSON.stringify(payload), 'PENDING', timestamp],
      });
      statements.push(syncUpdate('order', orderId, { id: orderId, totalAmount: combinedBill.grandTotal, items: localItems }));
      for (const item of localItems) statements.push(syncUpdate('order_item', item.id, { ...item, orderId }, item.id));
      statements.push(syncUpdate('kot', kotId, { id: kotId, orderId, restaurantId: order.restaurant_id, tableId: order.table_id, kotNumber, counterDate, items: kotItemRecords }, 'kot'));
      for (const item of kotItemRecords) statements.push(syncUpdate('kot_item', item.id, { ...item, orderId }, item.id));
      await database.transaction(statements);
      const printResults = [];
      for (const group of groups) {
        const eventId = `${requestId}-${group.type.toLowerCase()}`;
        printResults.push(await dispatchPrintJob({ queue, printer, job: { eventId, payload: { connection: group.connection, bytes: group.bytes } } }));
      }
      return { success: true, orderId, kotNumber, totals: combinedBill, printResults };
    });
  }

  async function getOrderBundle(orderId) {
    const orders = await database.query('SELECT * FROM order_record WHERE id = ? LIMIT 1', [orderId]);
    if (!orders[0]) throw new Error('Local order not found');
    const items = await database.query('SELECT * FROM order_item WHERE order_id = ? AND removed_from_bill = 0 AND quantity > cancelled_quantity ORDER BY created_at ASC', [orderId]);
    return { order: orders[0], items, outlet: await getOutlet(orders[0].restaurant_id) };
  }

  async function cancelOrderItem(orderId, orderItemId, payload = {}) {
    return serialized(async () => {
      const { order, outlet } = await getOrderBundle(orderId);
      if (order.status === 'PAID') throw new Error('Paid order item cannot be cancelled');
      const rows = await database.query('SELECT * FROM order_item WHERE id = ? AND order_id = ? LIMIT 1', [orderItemId, orderId]);
      const item = rows[0];
      if (!item) throw new Error('Local order item not found');
      const requested = Number(payload.cancelQuantity || payload.quantity || 1);
      const remaining = Math.max(0, Number(item.quantity) - Number(item.cancelled_quantity || 0));
      const quantity = Math.min(requested, remaining);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Invalid cancellation quantity');
      const eventId = String(payload.eventId || `${payload.requestId || makeId('cancel')}-cancel`);
      const connection = getConnection(readPrinterConfig(outlet.printer_config), item.menu_type === 'LIQUOR' ? 'bar' : 'kitchen');
      const printPayload = {
        connection,
        bytes: encodeEscposBlocks(buildCancelKOT({
          tableNumber: String(payload.tableNumber || order.table_id),
          cancelledBy: String(payload.cancelledBy || 'Cashier'),
          timestamp: new Date(now()).toISOString(),
          items: [{ name: item.name, quantity, menuType: item.menu_type }],
          sectionName: String(payload.sectionName || ''),
          restaurant: { name: outlet.name, receiptHeader: outlet.receipt_header },
        })),
      };
      const timestamp = now();
      await database.transaction([
        { sql: 'UPDATE order_item SET cancelled_quantity = cancelled_quantity + ?, removed_from_bill = CASE WHEN cancelled_quantity + ? >= quantity THEN 1 ELSE 0 END, updated_at = ? WHERE id = ? AND order_id = ?', values: [quantity, quantity, timestamp, orderItemId, orderId] },
        { sql: `INSERT INTO print_job(event_id, restaurant_id, order_id, type, target_printer, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values: [eventId, order.restaurant_id, orderId, 'CANCEL_KOT', printerLabel(connection, 'cancel'), JSON.stringify(printPayload), 'QUEUED', timestamp] },
        { sql: `INSERT INTO sync_queue(restaurant_id, table_name, record_id, operation, request_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values: [order.restaurant_id, 'order_item', orderItemId, 'update', payload.requestId || eventId, JSON.stringify({ id: orderItemId, orderId, menuItemId: item.menu_item_id, name: item.name, price: Number(item.price), quantity: Number(item.quantity), menuType: item.menu_type, notes: item.notes, cancelledQuantity: Number(item.cancelled_quantity || 0) + quantity, removedFromBill: Number(item.cancelled_quantity || 0) + quantity >= Number(item.quantity) }), 'PENDING', timestamp] },
      ]);
      const printResult = await dispatchPrintJob({ queue, printer, job: { eventId, payload: printPayload } });
      return { success: true, orderId, orderItemId, cancelledQuantity: quantity, printResult };
    });
  }

  async function reprintBill(orderId, options = {}) {
    return printBill(orderId, { ...options, reprint: true, requestId: options.requestId || makeId('reprint') });
  }

  function billItems(rows) {
    return rows.map((item) => ({ menuItemId: item.menu_item_id, name: item.name, price: Number(item.price), quantity: Number(item.quantity) - Number(item.cancelled_quantity || 0), menuType: item.menu_type, gstEnabled: item.gst_enabled !== 0, notes: item.notes || null })).filter((item) => item.quantity > 0);
  }

  async function printBill(orderId, { requestId = null, discountPercent = null, reprint = false } = {}) {
    return serialized(async () => {
      const { order, items, outlet } = await getOrderBundle(orderId);
      if (order.status === 'PAID' && !reprint) throw new Error('Order is already settled');
      const discount = discountPercent == null ? Number(order.discount_percent || 0) : Number(discountPercent);
      const bill = calculateLocalBill(billItems(items), { discountPercent: discount, config: { gstCategory: outlet.gst_category, gstRegistered: Boolean(outlet.gst_registered), gstRate: outlet.gst_rate, serviceChargePercent: outlet.service_charge_percent } });
      const date = new Date(now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const billNumber = order.bill_number || `BILL-${await nextCounterValue(order.restaurant_id, date, 'bill_count')}`;
      // For reprints of settled orders, use the original settlement date/time
      const billDate = (reprint && order.paid_at) ? new Date(order.paid_at) : new Date(now());
      const dateStr = billDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });
      const timeStr = billDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
      const billPayload = {
        billNumber, tableNumber: order.table_id,
        date: dateStr, time: timeStr,
        items: bill.items.map((item) => ({ ...item, amount: item.price * item.quantity })),
        subtotal: bill.rawSubtotal,
        discount: discount > 0 ? { percent: discount, amount: bill.discountAmount } : null,
        tax: { cgst: bill.cgst, sgst: bill.sgst, total: bill.taxes }, roundOff: bill.roundOff,
        grandTotal: bill.grandTotal, itemCount: bill.items.length,
        qtyCount: bill.items.reduce((sum, item) => sum + item.quantity, 0),
        isReprint: reprint,
        restaurant: { name: outlet.name, receiptHeader: outlet.receipt_header, address: outlet.address, phone: outlet.phone, gstin: outlet.gstin },
      };
      const connection = getConnection(readPrinterConfig(outlet.printer_config), 'bill');
      const eventId = requestId || `${orderId}-bill-${billNumber}${reprint ? `-${now()}` : ''}`;
      const payload = { connection, bytes: encodeEscposBlocks(buildFinalBill(billPayload)) };
      const timestamp = now();
      await database.transaction([
        { sql: `UPDATE order_record SET bill_number = ?, discount_percent = ?, total_amount = ?, discount_amount = ?, service_charge_amount = ?, cgst = ?, sgst = ?, round_off = ?, billing_requested = 1, updated_at = ?, revision = revision + 1 WHERE id = ?`, values: [billNumber, discount, bill.grandTotal, bill.discountAmount, bill.serviceChargeAmount, bill.cgst, bill.sgst, bill.roundOff, timestamp, orderId] },
        { sql: `INSERT INTO print_job(event_id, restaurant_id, order_id, type, target_printer, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values: [eventId, order.restaurant_id, orderId, 'FINAL_BILL', printerLabel(connection, 'bill'), JSON.stringify(payload), 'QUEUED', timestamp] },
        { sql: `INSERT INTO sync_queue(restaurant_id, table_name, record_id, operation, request_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values: [order.restaurant_id, 'order', orderId, 'update', eventId, JSON.stringify({ id: orderId, billNumber, totalAmount: bill.grandTotal, discountPercent: discount }), 'PENDING', timestamp] },
      ]);
      const printResult = await dispatchPrintJob({ queue, printer, job: { eventId, payload } });
      return { success: true, orderId, billNumber, totals: bill, printResult };
    });
  }

  async function settleOrder(orderId, payment = {}) {
    return serialized(async () => {
      const { order } = await getOrderBundle(orderId);
      if (order.status === 'PAID') throw new Error('Order is already settled');
      if (!order.bill_number) throw new Error('Print the bill before settlement');
      const paymentMethod = String(payment.paymentMethod || payment.method || 'CASH').toUpperCase();
      const total = Number(order.total_amount || 0);
      const cashAmount = Number(payment.cashAmount || (paymentMethod === 'CASH' ? total : 0));
      const cardAmount = Number(payment.cardAmount || (paymentMethod === 'CARD' ? total : 0));
      const upiAmount = Number(payment.upiAmount || (paymentMethod === 'UPI' ? total : 0));
      const otherAmount = Number(payment.otherAmount || (paymentMethod === 'OTHER' ? total : 0));
      const tipAmount = Number(payment.tipAmount || 0);
      const date = new Date(now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const transactionNumber = `TXN-${await nextCounterValue(order.restaurant_id, date, 'txn_count')}`;
      const requestId = String(payment.requestId || makeId('settle'));
      const timestamp = now();
      await database.transaction([
        { sql: `UPDATE order_record SET status = 'PAID', transaction_number = ?, payment_method = ?, cash_amount = ?, card_amount = ?, upi_amount = ?, other_amount = ?, tip_amount = ?, paid_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND status != 'PAID'`, values: [transactionNumber, paymentMethod, cashAmount, cardAmount, upiAmount, otherAmount, tipAmount, timestamp, timestamp, orderId] },
        { sql: 'UPDATE "table" SET status = ?, current_bill = 0, revision = revision + 1, updated_at = ? WHERE id = ?', values: ['AVAILABLE', timestamp, order.table_id] },
        { sql: `INSERT INTO sync_queue(restaurant_id, table_name, record_id, operation, request_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values: [order.restaurant_id, 'order', orderId, 'update', requestId, JSON.stringify({ id: orderId, status: 'PAID', transactionNumber, paymentMethod, tipAmount }), 'PENDING', timestamp] },
        { sql: `INSERT INTO sync_queue(restaurant_id, table_name, record_id, operation, request_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values: [order.restaurant_id, 'transaction', transactionNumber, 'insert', `${requestId}-transaction`, JSON.stringify({ orderId, localTxnId: transactionNumber, requestId, paymentMethod, cashAmount, cardAmount, upiAmount, otherAmount, tipAmount, grandTotal: total, settledAt: timestamp, billNumber: order.bill_number }), 'PENDING', timestamp] },
      ]);
      return { success: true, orderId, transactionNumber, paymentMethod, totalAmount: total, tipAmount };
    });
  }

  async function cancelOrder(orderId, requestId = null) {
    return serialized(async () => {
      const { order } = await getOrderBundle(orderId);
      if (order.status === 'PAID') throw new Error('Paid order cannot be cancelled');
      const timestamp = now();
      await database.transaction([
        { sql: `UPDATE order_record SET status = 'CANCELLED', updated_at = ?, revision = revision + 1 WHERE id = ?`, values: [timestamp, orderId] },
        { sql: 'UPDATE "table" SET status = ?, current_bill = 0, revision = revision + 1, updated_at = ? WHERE id = ?', values: ['AVAILABLE', timestamp, order.table_id] },
        { sql: `INSERT INTO sync_queue(restaurant_id, table_name, record_id, operation, request_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, values: [order.restaurant_id, 'order', orderId, 'update', requestId || makeId('cancel'), JSON.stringify({ id: orderId, status: 'CANCELLED' }), 'PENDING', timestamp] },
      ]);
      return { success: true, orderId, status: 'CANCELLED' };
    });
  }

  return { createOrder, updateOrderItems, getOutlet, nextKotNumber: (restaurantId, date) => nextCounterValue(restaurantId, date, 'kot_count'), printBill, reprintBill, settleOrder, cancelOrder, cancelOrderItem };
}
