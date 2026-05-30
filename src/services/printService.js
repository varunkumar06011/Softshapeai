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
  SIZE_2X: GS + '!\x11',      // Double width AND double height (2x size)
  NORMAL_SIZE: GS + '!\x00',
  CUT: GS + 'V\x41\x03',
  LINE: '\n',
};

function pad(str, width) {
  return String(str).slice(0, width).padEnd(width);
}

function padRight(left, right, width = 21) {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

function divider(char = '-', width = 21) {
  return char.repeat(width) + '\n';
}

// ── Bill receipt builder (Fallback) ──────────
export function buildBillCommands({ table, items, subtotal, taxes, total, method, restaurantName = 'V GRAND LOUNGE' }) {
  const lines = [];

  lines.push(CMD.INIT);
  lines.push(CMD.SIZE_2X);           // 2x size
  lines.push(CMD.ALIGN_CENTER);
  lines.push(CMD.BOLD_ON);
  lines.push(restaurantName + '\n');
  lines.push(CMD.BOLD_OFF);
  lines.push(CMD.NORMAL_SIZE);       // Back to normal size
  lines.push('Jubilee Hills, Hyderabad\n');
  lines.push('Tel: +91 99999 99999\n');
  lines.push(divider());

  lines.push(CMD.ALIGN_LEFT);
  lines.push(`Table : ${table?.id || 'Walk-in'}\n`);
  lines.push(`Guests: ${table?.guests || 1}\n`);
  lines.push(`Date  : ${new Date().toLocaleString('en-IN')}\n`);
  lines.push(divider());

  lines.push(CMD.BOLD_ON);
  lines.push(pad('ITEM', 10) + pad('QTY', 3) + pad('AMT', 3) + '\n');
  lines.push(CMD.BOLD_OFF);
  lines.push(divider());

  items.forEach(item => {
    const name = String(item.n || item.name || '').slice(0, 11);
    const qty = String(item.q || item.quantity || 1);
    const amt = 'Rs.' + ((item.p || item.price || 0) * (item.q || item.quantity || 1)).toFixed(0);
    // Item name in 2x size + bold on its own line
    lines.push(CMD.SIZE_2X);
    lines.push(CMD.BOLD_ON);
    lines.push(name + '\n');
    lines.push(CMD.BOLD_OFF);
    lines.push(CMD.NORMAL_SIZE);
    // Qty and amount on next line in normal size
    lines.push('  ' + qty.padStart(3) + '  ' + amt + '\n');
  });

  lines.push(divider());
  lines.push(CMD.BOLD_ON);
  lines.push(padRight('Subtotal', 'Rs.' + Number(subtotal).toFixed(0)) + '\n');
  lines.push(CMD.BOLD_OFF);
  // Show CGST + SGST only when taxes > 0 (liquor-only orders are 0% GST)
  if (Number(taxes) > 0) {
    const halfTax = (Number(taxes) / 2).toFixed(0);
    lines.push(CMD.BOLD_ON);
    lines.push(padRight('CGST (2.5%)', 'Rs.' + halfTax) + '\n');
    lines.push(padRight('SGST (2.5%)', 'Rs.' + halfTax) + '\n');
    lines.push(CMD.BOLD_OFF);
  }
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

  qz.security.setSignatureAlgorithm('SHA512');

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
    const res = await response.json();
    // Backend returns { data: [...], breakdown: {...} } — extract .data
    if (res && res.data) {
      const printData = Array.isArray(res.data) ? res.data : [res.data];
      await sendToPrinter(BILLING_PRINTER, printData);
      return { success: true };
    }

  }

  // Fallback if no orderId or data is null
  const commands = buildBillCommands({ table, items, subtotal, taxes, total, method });
  const formattedData = [{ type: 'raw', format: 'plain', data: commands.join('') }];
  await sendToPrinter(BILLING_PRINTER, formattedData);
  return { success: true };
}

export async function printKOTQZ({ tableId, kotId, items, captainId, orderId, kotNumber }) {
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
      body: JSON.stringify({ tableNumber: tableId, orderId: kotId, items: foodItems, kotNumber })
    })
      .then(r => r.json())
      .then(res => {
        if (!res || !res.data) return null;
        const printData = Array.isArray(res.data) ? res.data : [res.data];
        return sendToPrinter(KITCHEN_PRINTER, printData);
      })
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
      body: JSON.stringify({ tableNumber: tableId, orderId: kotId, items: liquorItems, kotNumber })
    })
      .then(r => r.json())
      .then(res => {
        if (!res || !res.data) return null;
        const printData = Array.isArray(res.data) ? res.data : [res.data];
        return sendToPrinter(BAR_PRINTER, printData);
      })
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
