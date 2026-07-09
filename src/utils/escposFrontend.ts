// ─────────────────────────────────────────────────────────────────────────────
// ESC/POS Builders — Frontend port for local printing
// ─────────────────────────────────────────────────────────────────────────────
// Ported from softshape-backend/src/utils/escpos.ts.
// Generates raw ESC/POS thermal printer commands for:
//   - Food KOT (Kitchen Order Ticket) — kitchen printer
//   - Liquor KOT — bar printer
//
// All builders return a single-element array: [{ type: 'raw', format: 'plain', data: '...' }]
// This matches the shape that agentSocket.js handlePrintJob expects (lines 483-489)
// and that the Rust HTTP server in http_server.rs parses.
//
// ESC/POS commands used:
//   ESC @ — initialize printer
//   ESC ! — character style (bold, double width/height)
//   ESC a — alignment (left/center/right)
//   ESC d — cut paper
//   GS V — partial/full cut
//   LF — line feed
// ─────────────────────────────────────────────────────────────────────────────

// ─── ESC/POS Constants ───────────────────────────────────────────────────────

const INIT = '\x1B\x40';
const CENTER = '\x1B\x61\x01';
const LEFT = '\x1B\x61\x00';
const BOLD_ON = '\x1B\x45\x01';
const BOLD_OFF = '\x1B\x45\x00';
const SIZE_2X = '\x1D\x21\x11';
const SIZE_2X_TALL = '\x1D\x21\x12';
const SIZE_NORMAL = '\x1D\x21\x00';
const SIZE_HEIGHT = '\x1D\x21\x01';
const SIZE_ITEM_LARGE = '\x1D\x21\x02';
const SIZE_4X = '\x1D\x21\x33';
const SIZE_8X = '\x1D\x21\x77';
const CUT = '\x1D\x56\x42\x00';
const FONT_A = '\x1B\x4D\x00';
const FONT_B = '\x1B\x4D\x01';

const LINE_NORMAL = 42;
const LINE_2X = 21;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PrintItem {
  name: string;
  price?: number;
  quantity: number;
  notes?: string | null;
  type?: "food" | "liquor";
}

export interface OrderData {
  tableNumber: number | string;
  orderId: string;
  items: PrintItem[];
  restaurantName?: string;
  kotNumber?: number | string;
  kotId?: string;
  txnNumber?: number;
  txnDate?: string;
  captainId?: string;
  captainName?: string;
  orderByRole?: string;
  sectionName?: string;
  sectionTag?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function separator(ch = "-"): string {
  return ch.repeat(LINE_NORMAL) + "\n";
}

// ─── Food KOT ────────────────────────────────────────────────────────────────

export function buildFoodKOT(orderData: OrderData): object[] {
  const { tableNumber, orderId, items, kotId, sectionName, captainName, orderByRole, sectionTag } = orderData;

  const foodItems = items.filter((i) => i.type === "food");

  const roleLabel = orderByRole === 'CASHIER' ? 'Cashier' : orderByRole === 'ADMIN' ? 'Admin' : orderByRole === 'OWNER' ? 'Owner' : 'Captain';

  if (foodItems.length === 0) return [];

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

  const displayKotId = kotId || "N/A";

  const rawTableLabel = (tableNumber || 'N/A').toString();
  const tableDisplay = (sectionTag && sectionTag.startsWith('venue-'))
    ? rawTableLabel
    : (/^[BT]\d+$/i.test(rawTableLabel) ? rawTableLabel.slice(1) : rawTableLabel);

  const headerName = (orderData.restaurantName && orderData.restaurantName.trim())
    ? orderData.restaurantName.toUpperCase()
    : 'RESTAURANT';

  const cmds: string[] = [
    INIT,
    CENTER,
    BOLD_ON,
    `${headerName}\n`,
    BOLD_OFF,
  ];

  if (sectionName) {
    cmds.push(`${sectionName}\n`);
  }

  cmds.push(LEFT, separator("-"), BOLD_ON, SIZE_2X);

  const kotLabel = `KOT No : ${displayKotId}`;
  const tableLabel = `Table : ${tableDisplay}`;
  const kotTableGap = Math.max(1, LINE_2X - kotLabel.length - tableLabel.length);
  cmds.push(`${kotLabel}${' '.repeat(kotTableGap)}${tableLabel}\n`);
  cmds.push(SIZE_NORMAL, BOLD_OFF);

  cmds.push(
    `${roleLabel} : ${captainName && captainName !== 'N/A' ? captainName : roleLabel}\n`,
    `Date : ${dateStr}  Time : ${timeStr}\n`,
    separator("-"),
    BOLD_ON,
    "Qty  Item\n",
    BOLD_OFF,
    separator("-"),
  );

  for (const item of foodItems) {
    cmds.push(
      SIZE_2X_TALL,
      BOLD_ON,
      `${item.quantity}  ${item.name.toUpperCase()}\n`,
      BOLD_OFF,
      SIZE_NORMAL
    );
    if (item.notes) {
      cmds.push(`     * ${item.notes}\n`);
    }
  }

  cmds.push(
    separator("-"),
    BOLD_ON,
    SIZE_2X,
    `Hall Name : ${sectionName || 'Family Restaurant'}\n`,
    SIZE_NORMAL,
    BOLD_OFF,
    CENTER,
    "--- Kitchen Order Ticket ---\n",
    LEFT,
    "\n\n\n",
    CUT
  );

  return [{ type: "raw", format: "plain", data: cmds.join("") }];
}

// ─── X Report ────────────────────────────────────────────────────────────────

export interface XReportDenomination {
  label: string;
  value: number;
  count: number;
}

export interface XReportExpenditureRow {
  paidToName: string;
  paidToType: string;
  category?: string | null;
  narration?: string | null;
  approvedByName?: string | null;
  amount: number;
}

export interface XReportData {
  restaurantName?: string;
  cashierName?: string;
  reportDate: string;
  totalSales: number;
  cardAmount: number;
  cashAmount: number;
  upiAmount?: number;
  otherAmount?: number;
  tipsAmount: number;
  expenditureAmount: number;
  finalAmount: number;
  expenditures: XReportExpenditureRow[];
  denominations: XReportDenomination[];
  cashFromNotes: number;
}

function shortExpenditureType(categoryOrType?: string | null): string {
  const t = (categoryOrType || '').toUpperCase();
  if (t === 'STAFF') return 'STAFF';
  if (t === 'KITCHEN') return 'KTCH';
  if (t === 'MISCELLANEOUS' || t === 'OTHER') return 'MISC';
  return t.slice(0, 6);
}

export function buildXReportEscpos(data: XReportData): object[] {
  const cmds: string[] = [INIT, LEFT];
  cmds.push(CENTER, BOLD_ON, SIZE_2X, 'X REPORT\n', BOLD_OFF, SIZE_NORMAL);
  if (data.restaurantName) {
    cmds.push(CENTER, BOLD_ON, `${data.restaurantName.toUpperCase()}\n`, BOLD_OFF);
  }
  cmds.push(CENTER, `Date: ${data.reportDate}\n`);
  if (data.cashierName) {
    cmds.push(CENTER, `Cashier: ${data.cashierName}\n`);
  }
  cmds.push(separator('-'));
  cmds.push(LEFT);

  const XR_W = 40;
  const xrBorder = () => '+' + '-'.repeat(XR_W) + '+';
  const xrTitle = (title: string) => '|' + title.padEnd(XR_W) + '|';
  const padRightLocal = (left: string | number, right: string | number, width: number) => {
    const leftStr = String(left).slice(0, width - String(right).length - 1);
    return leftStr.padEnd(width - String(right).length) + right;
  };
  const xrRow = (label: string, value: string) => '|' + padRightLocal(label, value, XR_W) + '|';
  const xrLine = (text: string) => '|' + text.padEnd(XR_W) + '|';
  const xrCurrency = (n: number) => 'Rs.' + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);

  // Total Sale + indented Cash/Card/Tips breakdown
  cmds.push(LEFT, BOLD_ON, xrRow('Total Sale', xrCurrency(data.totalSales)), BOLD_OFF);
  cmds.push('\n');
  cmds.push(xrRow('  Cash ', xrCurrency(data.cashAmount)));
  cmds.push('\n');
  cmds.push(xrRow('  Card ', xrCurrency(data.cardAmount)));
  cmds.push('\n');
  cmds.push(xrRow('  UPI  ', xrCurrency(data.upiAmount || 0)));
  cmds.push('\n');
  cmds.push(xrRow('  Other', xrCurrency(data.otherAmount || 0)));
  cmds.push('\n');
  cmds.push(xrRow('  Tips ', xrCurrency(data.tipsAmount || 0)));
  cmds.push('\n');
  cmds.push(separator('-'));

  // Section 1: Sales Summary
  cmds.push(xrBorder(), '\n', BOLD_ON, xrTitle('1. SALES SUMMARY'), BOLD_OFF, '\n', xrBorder(), '\n');
  cmds.push(xrRow('Cash Sales ', xrCurrency(data.cashAmount)), '\n');
  cmds.push(xrRow('Card Sales ', xrCurrency(data.cardAmount)), '\n');
  cmds.push(xrRow('UPI Sales  ', xrCurrency(data.upiAmount || 0)), '\n');
  cmds.push(xrRow('Other Sales', xrCurrency(data.otherAmount || 0)), '\n');
  cmds.push(xrRow('Tips Received', xrCurrency(data.tipsAmount || 0)), '\n');
  cmds.push(xrBorder(), '\n');
  cmds.push(BOLD_ON, xrRow('TOTAL SALES', xrCurrency(data.totalSales)), BOLD_OFF, '\n');
  cmds.push(xrBorder(), '\n');

  // Section 2: Expenditure Breakdown
  cmds.push(xrBorder(), '\n', BOLD_ON, xrTitle('2. EXPENDITURE BREAKDOWN'), BOLD_OFF, '\n', xrBorder(), '\n');
  if (data.expenditures.length > 0) {
    data.expenditures.forEach((v) => {
      const name = (v.paidToName || '').slice(0, 14).padEnd(14);
      const type = shortExpenditureType(v.category || v.paidToType).padEnd(6);
      const amt = ('Rs.' + Number(v.amount).toFixed(2)).padStart(XR_W - 14 - 6);
      cmds.push('|' + name + type + amt + '|', '\n');
      const parts = [];
      if (v.narration) parts.push(v.narration);
      if (v.approvedByName) parts.push('Appvd: ' + v.approvedByName);
      if (parts.length > 0) {
        const joined = parts.join(' - ');
        const maxContent = 39;
        const text = joined.length > maxContent ? joined.slice(0, maxContent - 3) + '...' : joined;
        cmds.push(xrLine(' ' + text), '\n');
      }
      cmds.push(xrBorder(), '\n');
    });
  }
  cmds.push(BOLD_ON, xrRow('TOTAL EXPENDITURE', xrCurrency(data.expenditureAmount)), BOLD_OFF, '\n');
  cmds.push(xrBorder(), '\n');

  // Section 3: Net Balance Calcul       ation
  cmds.push(xrBorder(), '\n', BOLD_ON, xrTitle('3. NET BALANCE CALCULATION'), BOLD_OFF, '\n', xrBorder(), '\n');
  cmds.push(xrRow('Total Sales (A)', xrCurrency(data.totalSales)), '\n');
  const paymentTotal = (data.cardAmount || 0) + (data.cashAmount || 0) + (data.upiAmount || 0) + (data.otherAmount || 0);
  cmds.push(xrRow('Payments - Cash/Card/UPI/Other (B)', xrCurrency(paymentTotal)), '\n');
  cmds.push(xrRow('Total Expenditure (C)', xrCurrency(data.expenditureAmount)), '\n');
  cmds.push(xrBorder(), '\n');
  cmds.push(BOLD_ON, xrRow('NET BALANCE (A-B-C)', xrCurrency(data.finalAmount)), BOLD_OFF, '\n');
  cmds.push(xrBorder(), '\n');

  // Section 4: Cash Denomination Breakdown
  cmds.push(xrBorder(), '\n', BOLD_ON, xrTitle('4. CASH DENOMINATION BREAKDOWN'), BOLD_OFF, '\n', xrBorder(), '\n');
  data.denominations.forEach((d) => {
    if (d.count > 0) {
      const amount = d.value * d.count;
      cmds.push(xrRow(`${d.label} x ${d.count}`, 'Rs.' + amount.toFixed(2)), '\n');
    }
  });
  cmds.push(xrBorder(), '\n');
  cmds.push(BOLD_ON, xrRow('TOTAL CASH COUNTED', xrCurrency(data.cashFromNotes)), BOLD_OFF, '\n');
  cmds.push(xrBorder(), '\n');

  cmds.push(CENTER, '*** End of Report ***\n');
  cmds.push('\n\n\n');
  cmds.push(CUT);
  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];
}

// ─── Final Bill ──────────────────────────────────────────────────────────────

export interface BillItem {
  name: string;
  quantity: number;
  price: number;
  amount?: number;
  menuType?: string;
  notes?: string | null;
}

export interface BillEscposData {
  billNumber: string;
  tableNumber: string | number;
  sectionTag?: string | null;
  date?: string;
  time?: string;
  kotNumbers?: string[];
  captain?: string;
  items: BillItem[];
  subtotal: number;
  discount?: { percent: number; amount: number } | null;
  tax?: { cgst: number; sgst: number; total: number } | null;
  roundOff?: number;
  grandTotal: number;
  itemCount?: number;
  qtyCount?: number;
  section?: string;
  gstIn?: string;
  restaurant?: {
    name?: string;
    receiptHeader?: string | null;
    receiptSubHeader?: string | null;
    address?: string | null;
    phone?: string | null;
  };
}

export function buildBillEscpos(data: BillEscposData): object[] {
  const cmds: string[] = [];

  cmds.push(INIT);

  const venueName = (data.restaurant?.receiptHeader?.trim() || data.restaurant?.name?.trim() || 'RESTAURANT').toUpperCase();
  cmds.push(CENTER, BOLD_ON, SIZE_HEIGHT, `${venueName}\n`, BOLD_OFF, SIZE_NORMAL);

  cmds.push(CENTER);
  if (data.restaurant?.receiptSubHeader) cmds.push(`${data.restaurant.receiptSubHeader}\n`);
  if (data.restaurant?.address) cmds.push(`${data.restaurant.address}\n`);
  if (data.restaurant?.phone) cmds.push(`Phone: ${data.restaurant.phone}\n`);
  if (data.gstIn) cmds.push(`GST IN: ${data.gstIn}\n`);

  cmds.push(separator("-"));

  const rawTable = (data.tableNumber || 'N/A').toString();
  const tableNumeric = (data.sectionTag && data.sectionTag.startsWith('venue-'))
    ? rawTable
    : rawTable.replace(/^[BT]/i, '');

  cmds.push(SIZE_HEIGHT, BOLD_ON);
  const billNo = data.billNumber || 'N/A';
  const billTableGap = Math.max(1, LINE_NORMAL - `Bill No : ${billNo}`.length - `Table: ${tableNumeric}`.length);
  cmds.push(`Bill No : ${billNo}${' '.repeat(billTableGap)}Table: ${tableNumeric}\n`);
  cmds.push(BOLD_OFF, SIZE_NORMAL);

  cmds.push(`Date: ${data.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' })}\n`);

  if (data.kotNumbers && data.kotNumbers.length > 0) {
    cmds.push(`KOT No : ${data.kotNumbers.join(', ')}\n`);
  }

  cmds.push(`Time: ${data.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}\n`);

  if (data.captain && data.captain !== 'N/A') {
    const captainGap = Math.max(1, LINE_NORMAL - `Captain: ${data.captain}`.length - `Waiter: Waiter`.length);
    cmds.push(`Captain: ${data.captain}${' '.repeat(captainGap)}Waiter: Waiter\n`);
  }

  cmds.push(separator("-"));

  cmds.push(LEFT, 'Item            Qty    Price    Amount\n', separator("-"));

  if (!data.items || data.items.length === 0) {
    cmds.push('NO ITEMS\n');
  } else {
    data.items.forEach(item => {
      const itemName = (item.name || '').toUpperCase().substring(0, 24);
      cmds.push(BOLD_ON, `${itemName}\n`, BOLD_OFF);
      const qty = String(item.quantity).padStart(4);
      const price = String(Math.round(item.price).toFixed(0)).padStart(9);
      const amount = String(Math.round((item.amount || item.price * item.quantity)).toFixed(0)).padStart(10);
      cmds.push(BOLD_ON, `              ${qty}  ${price}  ${amount}\n`, BOLD_OFF);
      if (item.notes) cmds.push(`   * ${item.notes}\n`);
    });
  }

  cmds.push(separator("-"));

  cmds.push(BOLD_ON, `Sub Total :${String(Math.round(data.subtotal).toFixed(0)).padStart(LINE_NORMAL - 12)}\n`, BOLD_OFF);

  if (data.tax && data.tax.total > 0) {
    cmds.push(BOLD_ON);
    cmds.push(`CGST :${String(Math.round(data.tax.cgst).toFixed(0)).padStart(LINE_NORMAL - 7)}\n`);
    cmds.push(`SGST :${String(Math.round(data.tax.sgst).toFixed(0)).padStart(LINE_NORMAL - 7)}\n`);
    cmds.push(BOLD_OFF);
  }

  if (data.discount && data.discount.percent > 0) {
    cmds.push(BOLD_ON, `(-) Discount ${Math.round(data.discount.percent).toFixed(0)}% :${String(Math.round(data.discount.amount).toFixed(0)).padStart(LINE_NORMAL - 22)}\n`, BOLD_OFF);
  }

  cmds.push(separator("-"));

  if (data.roundOff && data.roundOff !== 0) {
    cmds.push(BOLD_ON);
    const roValue = (data.roundOff > 0 ? '+' : '') + data.roundOff.toFixed(2);
    cmds.push(`Round Off :${String(roValue).padStart(LINE_NORMAL - 11)}\n`);
    cmds.push(BOLD_OFF);
  }

  cmds.push(SIZE_HEIGHT, BOLD_ON);
  const gtValue = Math.round(data.grandTotal).toFixed(0);
  const gtGap = Math.max(1, LINE_NORMAL - 'Grand Total'.length - gtValue.length);
  cmds.push('Grand Total' + ' '.repeat(gtGap) + gtValue + '\n');
  cmds.push(BOLD_OFF, SIZE_NORMAL);

  cmds.push(BOLD_ON, `Items / Qty : ${data.itemCount || 0}/${data.qtyCount || 0}\n`, BOLD_OFF);

  const secTag = (data.sectionTag || '').toLowerCase();
  const secName = (data.section || '').toLowerCase();
  const hallName = (secTag === 'venue-family-restaurant' || secName.includes('family restaurant') || secName.includes('main hall'))
    ? 'DINE IN'
    : (secTag === 'venue-restaurant-parcel' || secName.includes('parcel'))
      ? 'PARCEL(FAMILY RESTAURANT)'
      : (data.section ? data.section.toUpperCase() : 'DINE IN');

  cmds.push(separator("-"), `Hall : ${hallName}\n`, '* *\n', '\n', BOLD_ON, hallName, BOLD_OFF, '\n');

  cmds.push(CENTER, 'Thank You, Please Visit again\n', '\n\n\n', CUT);

  return [{ type: 'raw', format: 'plain', data: cmds.join('') }];
}

// ─── Liquor / Bar KOT ─────────────────────────────────────────────────────────

export function buildLiquorKOT(orderData: OrderData): object[] {
  const { tableNumber, orderId, items, kotId, sectionName, captainName, orderByRole, sectionTag } = orderData;

  const liquorItems = items.filter((i) => i.type === "liquor");

  const roleLabel = orderByRole === 'CASHIER' ? 'Cashier' : orderByRole === 'ADMIN' ? 'Admin' : orderByRole === 'OWNER' ? 'Owner' : 'Captain';

  if (liquorItems.length === 0) return [];

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

  const displayKotId = kotId || "N/A";

  const rawTableLabel = (tableNumber || 'N/A').toString();
  const tableDisplay = (sectionTag && sectionTag.startsWith('venue-'))
    ? rawTableLabel
    : (/^[BT]\d+$/i.test(rawTableLabel) ? rawTableLabel.slice(1) : rawTableLabel);

  const headerName = (orderData.restaurantName && orderData.restaurantName.trim())
    ? orderData.restaurantName.toUpperCase()
    : 'RESTAURANT';

  const sectionLabel = sectionName || 'ORDER';

  const cmds: string[] = [
    INIT,
    CENTER,
    BOLD_ON,
    `${headerName}\n`,
    BOLD_OFF,
  ];

  if (sectionLabel) {
    cmds.push(`${sectionLabel}\n`);
  }

  cmds.push(LEFT, separator("-"), BOLD_ON, SIZE_2X);

  const kotLabel = `KOT No : ${displayKotId}`;
  const tableLabel = `Table : ${tableDisplay}`;
  const kotTableGap = Math.max(1, LINE_2X - kotLabel.length - tableLabel.length);
  cmds.push(`${kotLabel}${' '.repeat(kotTableGap)}${tableLabel}\n`);
  cmds.push(SIZE_NORMAL, BOLD_OFF);

  cmds.push(
    separator("-"),
    `${roleLabel} : ${captainName && captainName !== 'N/A' ? captainName : roleLabel}\n`,
    `Date : ${dateStr}  Time : ${timeStr}\n`,
    separator("-"),
    BOLD_ON,
    "Qty  Item\n",
    BOLD_OFF,
    separator("-"),
  );

  for (const item of liquorItems) {
    cmds.push(
      SIZE_2X_TALL,
      BOLD_ON,
      `${item.quantity}  ${item.name.toUpperCase()}\n`,
      BOLD_OFF,
      SIZE_NORMAL
    );
    if (item.notes) {
      cmds.push(`     * ${item.notes}\n`);
    }
  }

  cmds.push(
    separator("-"),
    BOLD_ON,
    SIZE_2X,
    `Hall Name : ${sectionName || 'N/A'}\n`,
    SIZE_NORMAL,
    BOLD_OFF,
    CENTER,
    "--- Bar Order Ticket ---\n",
    LEFT,
    "\n\n\n",
    CUT
  );

  return [{ type: "raw", format: "plain", data: cmds.join("") }];
}
