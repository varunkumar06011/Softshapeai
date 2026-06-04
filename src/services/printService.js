import { QZ_CERT } from './certificate.js';

const KITCHEN_PRINTER = import.meta.env.VITE_KITCHEN_PRINTER_NAME || 'KITCHEN_PRINTER';
const BAR_PRINTER = import.meta.env.VITE_BAR_PRINTER_NAME || 'BAR_PRINTER';
const BILLING_PRINTER = import.meta.env.VITE_BILLING_PRINTER_NAME || 'BILLING_PRINTER';
const KOT_FAMILY_PRINTER = import.meta.env.VITE_KOT_FAMILY_PRINTER_NAME || 'KOT FAMILY';
const DINE_IN_BILL_PRINTER = import.meta.env.VITE_DINE_IN_BILL_PRINTER_NAME || 'Dine in Bill';
const KOT_PRINTER = import.meta.env.VITE_KOT_PRINTER_NAME || 'KOT PRINTER';

// ── ESC/POS Constants ──────────────────────────
const INIT = '\x1B\x40';
const CENTER = '\x1B\x61\x01';
const LEFT = '\x1B\x61\x00';
const BOLD_ON = '\x1B\x45\x01';
const BOLD_OFF = '\x1B\x45\x00';
const SIZE_2X = '\x1D\x21\x11';
const SIZE_NORMAL = '\x1D\x21\x00';
const SIZE_HEIGHT = '\x1D\x21\x01';
const CUT = '\x1D\x56\x42\x00';

const LINE_NORMAL = 42;
const LINE_2X = 21;

function separator(ch = "-") {
  return ch.repeat(LINE_NORMAL) + '\n';
}

// ── Bill receipt builder (Fallback) ──────────
export function buildBillCommands({ table, items, subtotal, taxes, total, method, kotNumbers, captainName, section, discount, billNumber, sectionTag }) {
  const lines = [];

  // Initialize printer
  lines.push(INIT);

  // Header - Restaurant Name (centered, 2x size with bold)
  const venueName = sectionTag === 'venue-family-restaurant' || sectionTag === 'venue-restaurant-parcel'
    ? 'V GRAND FAMILY RESTAURANT'
    : 'V GRAND LOUNGE';
  lines.push(CENTER);
  lines.push(SIZE_2X);
  lines.push(BOLD_ON);
  lines.push(`${venueName}\n`);
  lines.push(BOLD_OFF);
  lines.push(SIZE_NORMAL);

  // Address lines (centered, normal size)
  lines.push(CENTER);
  lines.push('Opp:TDP Office,Guntur Road,\n');
  lines.push('Ongole-523001,Cell:8074829846,9866011278\n');
  lines.push('GST IN:37AEXPT1195E1ZU\n');
  lines.push(LEFT);
  lines.push(separator("-"));

  // Extract numeric table number (remove B or T prefix)
  const tableNumeric = (table?.id || table?.number || 'N/A').toString().replace(/^[BT]/i, '');

  // Transaction info
  lines.push(BOLD_ON);
  lines.push(`Table: ${tableNumeric}\n`);
  lines.push(BOLD_OFF);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  lines.push(`Date: ${dateStr}    Time: ${timeStr}\n`);
  lines.push(`Bill No : ${billNumber || 'N/A'}\n`);
  if (kotNumbers && kotNumbers.length > 0) {
    lines.push(`KOT No : ${kotNumbers.join(', ')}\n`);
  }
  if (captainName && captainName !== 'N/A') {
    lines.push(`Captain: ${captainName}\n`);
  }
  lines.push(separator("-"));

  // Item header
  lines.push('Item            Qty    Price    Amount\n');
  lines.push(separator("-"));

  // Items
  if (!items || items.length === 0) {
    lines.push('NO ITEMS\n');
  } else {
    items.forEach(item => {
      lines.push(BOLD_ON);
      lines.push(`${(item.n || item.name || '').toUpperCase()}\n`);
      lines.push(BOLD_OFF);
      
      const qty = String(item.q || item.quantity || 1).padStart(4);
      const price = String(Number(item.p || item.price || 0).toFixed(2)).padStart(9);
      const amount = String((Number(item.p || item.price || 0) * Number(item.q || item.quantity || 1)).toFixed(2)).padStart(10);
      
      lines.push(BOLD_ON);
      // Pad left space to align under Qty (approx 14 spaces)
      lines.push(`              ${qty}  ${price}  ${amount}\n`);
      lines.push(BOLD_OFF);
    });
  }

  lines.push(separator("-"));

  // Subtotal
  lines.push(BOLD_ON);
  lines.push(`Sub Total :${String(Number(subtotal).toFixed(2)).padStart(LINE_NORMAL - 12)}\n`);
  lines.push(BOLD_OFF);

  // Discount (if applicable)
  if (discount && discount.percent > 0) {
    lines.push(BOLD_ON);
    lines.push(`(-) Discount ${Number(discount.percent).toFixed(2)}% :${String(Number(discount.amount).toFixed(2)).padStart(LINE_NORMAL - 22)}\n`);
    lines.push(BOLD_OFF);
    
    // Total after discount (before tax and rounding)
    const afterDiscount = subtotal - discount.amount;
    lines.push(BOLD_ON);
    lines.push(`Total :${String(afterDiscount.toFixed(2)).padStart(LINE_NORMAL - 8)}\n`);
    lines.push(BOLD_OFF);
  }

  // Tax breakdown (only if taxes > 0)
  if (Number(taxes) > 0) {
    const halfTax = (Number(taxes) / 2).toFixed(2);
    lines.push(BOLD_ON);
    lines.push(`CGST 2.5% :${String(halfTax).padStart(LINE_NORMAL - 12)}\n`);
    lines.push(`SGST 2.5% :${String(halfTax).padStart(LINE_NORMAL - 12)}\n`);
    lines.push(BOLD_OFF);
  }

  // Round off: difference between grandTotal and exact calculated total
  // Here, total parameter from CashierDashboard is the exact Total (subtotal - discount + taxes)
  const exactTotal = Number(total);
  const roundedTotal = Math.round(exactTotal);
  const roundOff = roundedTotal - exactTotal;
  if (Math.abs(roundOff) > 0.001) {
    lines.push(BOLD_ON);
    lines.push(`Round Off :${String((roundOff >= 0 ? '+' : '') + roundOff.toFixed(2)).padStart(LINE_NORMAL - 12)}\n`);
    lines.push(BOLD_OFF);
  }

  lines.push(separator("-"));

  // Grand Total (keep existing SIZE and BOLD)
  lines.push(BOLD_ON);
  lines.push(`Grand Total : ${roundedTotal.toFixed(2)}\n`);
  lines.push(BOLD_OFF);

  lines.push(separator("-"));
  const itemCount = items.length;
  const qtyCount = items.reduce((sum, item) => sum + (item.q || item.quantity || 1), 0);
  lines.push(`Items / Qty : ${itemCount} / ${qtyCount}\n`);
  lines.push(separator("-"));
  lines.push('(Rounded Off to NearestRupees)\n');
  lines.push(CENTER);
  lines.push('Thank You, Please Visit Again\n');
  lines.push('Powered by Softshape.ai\n');
  lines.push('\n\n\n');
  lines.push(CUT);

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
export async function printBillQZ({ table, items, subtotal, taxes, total, method, orderId, discount, kotNumbers, captainName, section, billNumber, sectionTag }) {
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
      // Route receipt to correct printer based on venue
      let printerName = BILLING_PRINTER;
      if (sectionTag === 'venue-family-restaurant') {
        printerName = DINE_IN_BILL_PRINTER;
      } else if (sectionTag === 'venue-restaurant-parcel') {
        printerName = KOT_PRINTER;
      }
      await sendToPrinter(printerName, printData);
      return { success: true };
    }

  }

  // Fallback if no orderId or data is null
  const commands = buildBillCommands({ table, items, subtotal, taxes, total, method, discount, kotNumbers, captainName, section, billNumber, sectionTag });
  const formattedData = [{ type: 'raw', format: 'plain', data: commands.join('') }];
  // Route fallback bill to correct printer based on venue
  let printerName = BILLING_PRINTER;
  if (sectionTag === 'venue-family-restaurant') {
    printerName = DINE_IN_BILL_PRINTER;
  } else if (sectionTag === 'venue-restaurant-parcel') {
    printerName = KOT_PRINTER;
  }
  await sendToPrinter(printerName, formattedData);
  return { success: true };
}

export async function printKOTQZ({ tableId, kotId, items, captainId, orderId, kotNumber, captainName }) {
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
      body: JSON.stringify({ tableId: tableId, orderId: orderId, kotId: kotId, items: foodItems, captainName: captainName || undefined })
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
      body: JSON.stringify({ tableId: tableId, orderId: orderId, kotId: kotId, items: liquorItems, captainName: captainName || undefined })
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
