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
  qty: number;
  amount: number;
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
  tipsAmount: number;
  expenditureAmount: number;
  finalAmount: number;
  expenditures: XReportExpenditureRow[];
  denominations: XReportDenomination[];
  cashFromNotes: number;
}

const XR_W = 42;

function shortExpenditureType(categoryOrType?: string | null): string {
  const t = (categoryOrType || '').toUpperCase();
  if (t === 'STAFF') return 'STAFF';
  if (t === 'KITCHEN') return 'KTCH';
  if (t === 'MISCELLANEOUS' || t === 'OTHER') return 'MISC';
  return t.slice(0, 6);
}

function xrRow(label: string, value: string): string {
  return `${label}${value.padStart(Math.max(1, XR_W - label.length))}`;
}

function xrCurrency(n: number): string {
  return "Rs." + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
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

  // Total Sale + indented Cash/Card/Tips breakdown
  cmds.push(LEFT, BOLD_ON, xrRow('Total Sale', xrCurrency(data.totalSales)), BOLD_OFF);
  cmds.push('\n');
  cmds.push(xrRow('  Cash', xrCurrency(data.cashAmount)));
  cmds.push('\n');
  cmds.push(xrRow('  Card', xrCurrency(data.cardAmount)));
  cmds.push('\n');
  cmds.push(xrRow('  Tips', xrCurrency(data.tipsAmount || 0)));
  cmds.push('\n');
  cmds.push(separator('-'));

  // Expenditure total + itemized expenditure rows (two lines per entry: Paid
  // To/Type/Amount, then Narration — Approved By)
  cmds.push(BOLD_ON, xrRow('Expenditure (Total)', xrCurrency(data.expenditureAmount)), BOLD_OFF);
  cmds.push('\n');
  if (data.expenditures.length > 0) {
    cmds.push(`  ${'Paid To'.padEnd(18)}${'Type'.padEnd(6)}Amt\n`);
    cmds.push(`  ${'-'.repeat(XR_W - 2)}\n`);
    data.expenditures.forEach((v) => {
      const name = (v.paidToName || '').slice(0, 18).padEnd(18);
      const type = shortExpenditureType(v.category || v.paidToType).slice(0, 6).padEnd(6);
      const amt = ('Rs.' + Number(v.amount).toFixed(2)).padStart(XR_W - 2 - 18 - 6);
      cmds.push(`  ${name}${type}${amt}\n`);
      const approver = v.approvedByName ? `Appvd: ${v.approvedByName}` : '';
      const narration = v.narration ? v.narration : '';
      if (narration || approver) {
        const line2 = [narration, approver].filter(Boolean).join(' - ');
        const line2Max = 38;
        const line2Text = line2.length > line2Max ? line2.slice(0, line2Max - 3) + '...' : line2;
        cmds.push(`    ${line2Text}\n`);
      }
    });
  }
  cmds.push(separator('-'));

  // BALANCE (bold, double-size, centered)
  cmds.push(
    CENTER, BOLD_ON, SIZE_2X,
    'BALANCE\n',
    `Rs ${Number(data.finalAmount).toFixed(2)}\n`,
    SIZE_NORMAL, BOLD_OFF,
    '(Total Sale - Expenditure)\n',
    LEFT
  );
  cmds.push(separator('-'));

  // Denominations
  cmds.push('Denomination breakdown:\n');
  data.denominations.forEach((d) => {
    if (d.qty > 0) {
      cmds.push(
        LEFT,
        `  ${d.label} x ${d.qty}${String('Rs.' + d.amount.toFixed(0)).padStart(XR_W - d.label.length - String(d.qty).length - 5)}\n`
      );
    }
  });
  cmds.push(separator('-'));

  cmds.push(LEFT, xrRow('Cash from Notes', xrCurrency(data.cashFromNotes)));
  cmds.push('\n');
  cmds.push(separator('-'));

  cmds.push(CENTER, '*** End of Report ***\n');
  cmds.push('\n\n\n');
  cmds.push(CUT);
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
