// ─────────────────────────────────────────────
// printService.js
// QZ Tray print service — MOCK MODE
// To enable real printing later:
//   1. npm install qz-tray
//   2. Set MOCK_MODE = false
//   3. Fill in PRINTER_NAME with actual printer name
//   4. Add certificate + signing logic
// ─────────────────────────────────────────────

const MOCK_MODE = true;//keep false in real mode
const PRINTER_NAME = 'POS_PRINTER'; // replace with real printer name later

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

// ── Bill receipt builder ─────────────────────
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
  lines.push(padRight('GST (18%)', 'Rs.' + Number(taxes).toFixed(0)) + '\n');
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

// ── KOT builder ──────────────────────────────
export function buildKOTCommands({ tableId, kotId, items, captainId }) {
  const lines = [];

  lines.push(CMD.INIT);
  lines.push(CMD.ALIGN_CENTER);
  lines.push(CMD.BOLD_ON + CMD.DOUBLE_HEIGHT);
  lines.push('*** KOT ***\n');
  lines.push(CMD.NORMAL_SIZE + CMD.BOLD_OFF);
  lines.push(divider());

  lines.push(CMD.ALIGN_LEFT);
  lines.push(`Table  : ${tableId}\n`);
  lines.push(`KOT ID : ${kotId}\n`);
  lines.push(`Captain: ${captainId || 'N/A'}\n`);
  lines.push(`Time   : ${new Date().toLocaleTimeString('en-IN')}\n`);
  lines.push(divider());

  lines.push(CMD.BOLD_ON);
  lines.push('ITEMS\n');
  lines.push(CMD.BOLD_OFF);
  lines.push(divider());

  items.forEach(item => {
    const name = String(item.n || item.name || '');
    const qty = String(item.q || item.quantity || 1);
    lines.push(CMD.BOLD_ON + `${qty}x ${name}\n` + CMD.BOLD_OFF);
    if (item.notes) lines.push(`   Note: ${item.notes}\n`);
  });

  lines.push(divider());
  lines.push(CMD.ALIGN_CENTER);
  lines.push('\n\n\n');
  lines.push(CMD.CUT);

  return lines;
}

// ── Main print function ───────────────────────
export async function printReceipt(commands) {
  if (MOCK_MODE) {
    // MOCK: log to console, show no errors
    console.log('[PrintService MOCK] Would send to printer:', PRINTER_NAME);
    console.log('[PrintService MOCK] Commands:', commands.join(''));
    return { success: true, mock: true };
  }

  // REAL: uncomment when QZ Tray is installed + configured
  // const qz = (await import('qz-tray')).default;
  // await qz.api.setCertificatePromise(...);
  // await qz.api.setSignaturePromise(...);
  // if (!qz.websocket.isActive()) await qz.websocket.connect();
  // const config = qz.configs.create(PRINTER_NAME);
  // const data = commands.map(c => ({ type: 'raw', format: 'plain', data: c }));
  // await qz.print(config, data);
  // return { success: true, mock: false };
}

// ── Convenience wrappers ──────────────────────
export async function printBillQZ({ table, items, subtotal, taxes, total, method }) {
  const commands = buildBillCommands({ table, items, subtotal, taxes, total, method });
  return printReceipt(commands);
}

export async function printKOTQZ({ tableId, kotId, items, captainId }) {
  const commands = buildKOTCommands({ tableId, kotId, items, captainId });
  return printReceipt(commands);
}
