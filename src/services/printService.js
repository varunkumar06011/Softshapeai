import { QZ_CERT } from './certificate.js';

const KITCHEN_PRINTER = import.meta.env.VITE_KITCHEN_PRINTER_NAME || 'KITCHEN_PRINTER';
const BAR_PRINTER = import.meta.env.VITE_BAR_PRINTER_NAME || 'BAR_PRINTER';
const BILLING_PRINTER = import.meta.env.VITE_BILLING_PRINTER_NAME || 'BILLING_PRINTER';

// ── ESC/POS helpers ──────────────────────────
const ESC = '\x1B';
const GS = '\x1D';

const CMD = {
  INIT: ESC + '@',
  ALIGN_CENTER: ESC + 'a\x01',
  ALIGN_LEFT: ESC + 'a\x00',
  BOLD_ON: ESC + 'E\x01',
  BOLD_OFF: ESC + 'E\x00',
  DOUBLE_HEIGHT: GS + '!\x01',
  NORMAL_SIZE: GS + '!\x00',
  CUT: GS + 'V\x41\x03',
  LINE: '\n',
};

function pad(str, width) {
  return String(str).slice(0, width).padEnd(width);
}

function padRight(left, right, width = 32) {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

function divider(char = '-', width = 32) {
  return char.repeat(width) + '\n';
}

// ── Bill receipt builder (Fallback) ──────────
export function buildBillCommands({ table, items, subtotal, taxes, total, method, restaurantName = 'SOFTSHAPE RESTAURANT' }) {
  const lines = [];

  lines.push(CMD.INIT);
  lines.push(CMD.ALIGN_CENTER);
  lines.push(CMD.BOLD_ON + CMD.DOUBLE_HEIGHT);
  lines.push(restaurantName + '\n');
  lines.push(CMD.NORMAL_SIZE + CMD.BOLD_OFF);
  lines.push('Jubilee Hills, Hyderabad\n');
  lines.push('Tel: +91 99999 99999\n');
  lines.push(divider());

  lines.push(CMD.ALIGN_LEFT);
  lines.push(`Table : ${table?.id || 'Walk-in'}\n`);
  lines.push(`Guests: ${table?.guests || 1}\n`);
  lines.push(`Date  : ${new Date().toLocaleString('en-IN')}\n`);
  lines.push(divider());

  lines.push(CMD.BOLD_ON);
  lines.push(pad('ITEM', 20) + pad('QTY', 4) + pad('AMT', 8) + '\n');
  lines.push(CMD.BOLD_OFF);
  lines.push(divider());

  items.forEach(item => {
    const name = String(item.n || item.name || '').slice(0, 20);
    const qty = String(item.q || item.quantity || 1);
    const amt = 'Rs.' + ((item.p || item.price || 0) * (item.q || item.quantity || 1)).toFixed(0);
    lines.push(pad(name, 20) + pad(qty, 4) + pad(amt, 8) + '\n');
  });

  lines.push(divider());
  lines.push(padRight('Subtotal', 'Rs.' + Number(subtotal).toFixed(0)) + '\n');
  lines.push(padRight('GST (5%)', 'Rs.' + Number(taxes).toFixed(0)) + '\n');
  lines.push(divider('='));
  lines.push(CMD.BOLD_ON);
  lines.push(padRight('TOTAL', 'Rs.' + Number(total).toFixed(0)) + '\n');
  lines.push(CMD.BOLD_OFF);
  lines.push(divider());

  lines.push(CMD.ALIGN_CENTER);
  lines.push(`Payment: ${method}\n`);
  lines.push('\n');
  lines.push('Thank you! Visit again.\n');
  lines.push('Powered by Softshape.ai\n');
  lines.push('\n\n\n');
  lines.push(CMD.CUT);

  return lines;
}

// ── QZ Tray Connection ────────────────────────
async function connectQZ() {
  const qz = (await import('qz-tray')).default;

  qz.security.setCertificatePromise(function(resolve, _reject) {
    resolve(QZ_CERT);
  });

  qz.security.setSignaturePromise(function(toSign) {
    return function(resolve, reject) {
      fetch(`${import.meta.env.VITE_API_URL}/api/print/qz-sign`, {
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
    try {
      await qz.websocket.connect();
    } catch (err) {
      throw new Error('QZ Tray is not running on this computer. Please start QZ Tray.');
    }
  }
  return qz;
}

async function sendToPrinter(printerName, data) {
  const qz = await connectQZ();
  const config = qz.configs.create(printerName);
  await qz.print(config, data);
}

// ── API Print functions ───────────────────────
export async function printBillQZ({ table, items, subtotal, taxes, total, method, orderId }) {
  if (orderId) {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/print/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    });
    const data = await response.json();
    if (data) {
      await sendToPrinter(BILLING_PRINTER, data);
      return { success: true };
    }
  }

  // Fallback if no orderId or data is null
  const commands = buildBillCommands({ table, items, subtotal, taxes, total, method });
  const formattedData = commands.map(c => ({ type: 'raw', format: 'plain', data: c }));
  await sendToPrinter(BILLING_PRINTER, formattedData);
  return { success: true };
}

export async function printKOTQZ({ tableId, kotId, items, captainId, orderId }) {
  const foodItems = items.filter(i => (i.menuType || 'FOOD') !== 'LIQUOR')
    .map(i => ({
      name: i.n || i.name, quantity: i.q || i.quantity,
      price: i.p || i.price, notes: i.notes || null, type: 'food'
    }));

  const liquorItems = items.filter(i => i.menuType === 'LIQUOR')
    .map(i => ({
      name: i.n || i.name, quantity: i.q || i.quantity,
      price: i.p || i.price, notes: i.notes || null, type: 'liquor'
    }));

  const printPromises = [];

  if (foodItems.length > 0) {
    const foodPrint = fetch(`${import.meta.env.VITE_API_URL}/api/print/food-kot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: tableId, orderId: kotId, items: foodItems })
    })
      .then(r => r.json())
      .then(data => data ? sendToPrinter(KITCHEN_PRINTER, data) : null)
      .catch(err => {
        err.message = `Kitchen Printer Failed: ${err.message}`;
        throw err;
      });
    printPromises.push(foodPrint);
  }

  if (liquorItems.length > 0) {
    const liquorPrint = fetch(`${import.meta.env.VITE_API_URL}/api/print/liquor-kot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: tableId, orderId: kotId, items: liquorItems })
    })
      .then(r => r.json())
      .then(data => data ? sendToPrinter(BAR_PRINTER, data) : null)
      .catch(err => {
        err.message = `Bar Printer Failed: ${err.message}`;
        throw err;
      });
    printPromises.push(liquorPrint);
  }

  const results = await Promise.allSettled(printPromises);

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    const errorMsgs = failures.map(f => f.reason.message).join(' | ');
    throw new Error(errorMsgs);
  }

  return { success: true };
}
