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

export interface XReportData {
  restaurantName?: string;
  cashierName?: string;
  reportDate: string;
  totalSales: number;
  parcelCounterSale: number;
  cardAmount: number;
  voucherAmount: number;
  finalAmount: number;
  denominations: XReportDenomination[];
  cashFromNotes: number;
  cashAmount: number;
  cardPlusCash: number;
  balanced: boolean;
}

const XR_W = 32;

function xrRow(label: string, value: string): string {
  return `${label}${value.padStart(Math.max(1, XR_W - label.length))}`;
}

function xrCurrency(n: number): string {
  return "Rs " + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

export function buildXReportEscpos(data: XReportData): object[] {
  const dashed = "-".repeat(XR_W);

  const cmds: string[] = [INIT, LEFT];
  cmds.push(`${dashed}\n`);
  cmds.push(CENTER, BOLD_ON, "X REPORT\n", BOLD_OFF, LEFT);
  if (data.restaurantName) cmds.push(CENTER, `${data.restaurantName}\n`, LEFT);
  cmds.push(CENTER, `Date: ${data.reportDate}\n`, LEFT);
  if (data.cashierName) cmds.push(CENTER, `Cashier: ${data.cashierName}\n`, LEFT);
  cmds.push(`${dashed}\n`);

  cmds.push(`${xrRow("Total Sales", xrCurrency(data.totalSales))}\n`);
  cmds.push(`${xrRow("Parcel Counter", xrCurrency(data.parcelCounterSale))}\n`);
  cmds.push(`${xrRow("Card", xrCurrency(data.cardAmount))}\n`);
  cmds.push(`${xrRow("Voucher", xrCurrency(data.voucherAmount))}\n`);
  cmds.push(`${dashed}\n`);

  // Final Amount — bold + double size, centered
  cmds.push(
    CENTER,
    BOLD_ON,
    SIZE_2X,
    "FINAL AMOUNT\n",
    xrCurrency(data.finalAmount) + "\n",
    SIZE_NORMAL,
    BOLD_OFF,
    LEFT
  );
  cmds.push(`${dashed}\n`);

  cmds.push("Denomination breakdown:\n");
  data.denominations.forEach((d) => {
    if (d.qty > 0) {
      const left = `  ${d.label} x ${d.qty}`;
      const right = "Rs" + d.amount.toFixed(0);
      cmds.push(`${left}${right.padStart(Math.max(1, XR_W - left.length))}\n`);
    }
  });
  cmds.push(`${dashed}\n`);

  cmds.push(`${xrRow("Cash from Notes", xrCurrency(data.cashFromNotes))}\n`);
  cmds.push(`${xrRow("Cash Amount", xrCurrency(data.cashAmount))}\n`);
  cmds.push(
    `Card + Cash = ${xrCurrency(data.cardPlusCash)} (${data.balanced ? "Balanced" : "Mismatch"})\n`
  );
  cmds.push(`${dashed}\n`);

  cmds.push(CENTER, BOLD_ON, "*** End of Report ***\n", BOLD_OFF, LEFT);
  cmds.push("\n\n\n", CUT);

  return [{ type: "raw", format: "plain", data: cmds.join("") }];
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
