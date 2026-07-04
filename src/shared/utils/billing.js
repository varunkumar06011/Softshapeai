// ─────────────────────────────────────────────────────────────────────────────
// Billing — Order total calculation with GST, discounts, and service charges
// ─────────────────────────────────────────────────────────────────────────────
// Core billing calculation utilities used by POS, cashier, and admin:
//   - calculateOrderTotal(items, discountPercent, options) — computes subtotal,
//     GST (CGST/SGST split), discount amount, service charge, and final total
//   - Supports pricesIncludeGst mode (GST included in item price vs added on top)
//   - GST rate determined by restaurant config (AC=18%, Non-AC=5%, Takeaway=5%)
//   - Handles unregistered restaurants (0% GST)
//   - Item shape: { p: price, q: quantity, ... }
//
// Returns: { subtotal, cgst, sgst, totalGst, discountAmount, serviceCharge, total }
// ─────────────────────────────────────────────────────────────────────────────

import { getRestaurantConfig } from '../../utils/getRestaurantConfig';

/**
 * Calculates the subtotal, taxes, and total for a given array of items.
 * Each item must have `p` (price) and `q` (quantity).
 * GST options default to the logged-in restaurant's configuration; pass `options` to override.
 */
export const calculateOrderTotal = (items, discountPercent = 0, options = {}) => {
  const config = getRestaurantConfig();
  const gstCategory = options.gstCategory ?? config.gstCategory ?? 'NON_AC';
  const pricesIncludeGst = options.pricesIncludeGst ?? config.pricesIncludeGst ?? false;
  const gstRegistered = options.gstRegistered ?? config.gstRegistered ?? true;
  const isAc = String(gstCategory).toUpperCase() === 'AC';
  const ratePercent = gstRegistered === false ? 0 : (options.gstRate ?? config.gstRate ?? (isAc ? 18 : 5));
  const totalGstRate = ratePercent / 100;
  const cgstRate = totalGstRate / 2;
  const sgstRate = totalGstRate / 2;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { subtotal: 0, taxes: 0, total: 0, grandTotal: 0, discountAmount: 0, foodSubtotal: 0, liquorSubtotal: 0, cgst: 0, sgst: 0 };
  }

  let foodSubtotal = 0;
  let liquorSubtotal = 0;
  let gstExemptFood = 0;

  items.forEach((item) => {
    if (item.removedFromBill) return;
    const price = Number(item.p ?? item.price ?? 0);
    const qty = Number(item.q ?? item.quantity ?? 1);

    // Detect liquor/bar items by checking all possible field shapes from captain cart,
    // DB order items, and legacy kotHistory items.
    // BAR items (water bottles, packaged drinks, beer) are treated same as LIQUOR — no food GST.
    const rawType = item.menuType || item.menuItem?.menuType || item.type || '';
    const typeUpper = rawType.toString().toUpperCase();
    const type = (typeUpper === 'LIQUOR' || typeUpper === 'BAR') ? 'liquor' : 'food';

    if (type === 'liquor') {
      liquorSubtotal += price * qty;
    } else {
      foodSubtotal += price * qty;
      // Items with gstEnabled=false are exempt from GST calculation
      if (item.gstEnabled === false) {
        gstExemptFood += price * qty;
      }
    }
  });

  // GST Calculation: GST on food only (5%), liquor has 0% food GST.
  // Discount is applied to raw subtotal FIRST (proportionally), then GST on discounted food.
  // This matches the backend settleOrderService calculation exactly.
  const subtotal = foodSubtotal + liquorSubtotal;
  const discountAmount = discountPercent > 0
    ? Math.round(subtotal * (discountPercent / 100) * 100) / 100
    : 0;

  const discountedFood = foodSubtotal - (discountAmount > 0 && subtotal > 0 ? discountAmount * (foodSubtotal / subtotal) : 0);
  const gstExemptAfterDiscount = Math.max(0, gstExemptFood - (discountAmount > 0 && subtotal > 0 ? discountAmount * (gstExemptFood / subtotal) : 0));
  const taxableFood = Math.max(0, discountedFood - gstExemptAfterDiscount);

  let baseAmount, cgst, sgst, taxes;
  if (pricesIncludeGst) {
    baseAmount = Math.round((taxableFood / (1 + totalGstRate)) * 100) / 100;
    cgst = Math.round(baseAmount * cgstRate * 100) / 100;
    sgst = Math.round(baseAmount * sgstRate * 100) / 100;
    taxes = cgst + sgst;
  } else {
    baseAmount = taxableFood;
    cgst = Math.round(taxableFood * cgstRate * 100) / 100;
    sgst = Math.round(taxableFood * sgstRate * 100) / 100;
    taxes = cgst + sgst;
  }

  const liquorAfterDiscount = liquorSubtotal - (discountAmount > 0 && subtotal > 0 ? discountAmount * (liquorSubtotal / subtotal) : 0);
  const displayedSubtotal = Math.round((baseAmount + gstExemptAfterDiscount + liquorAfterDiscount) * 100) / 100;
  const grandTotal = Math.max(0, Math.round((displayedSubtotal + taxes) * 100) / 100);

  return {
    subtotal: displayedSubtotal,
    rawSubtotal: Number(subtotal.toFixed(2)),
    taxes,
    total: grandTotal,
    grandTotal,
    discountAmount: Number(discountAmount.toFixed(2)),
    foodSubtotal: Number(foodSubtotal.toFixed(2)),
    liquorSubtotal: Number(liquorSubtotal.toFixed(2)),
    cgst,
    sgst
  };
};

/**
 * Returns ALL items for a table (including cancelled/removed).
 * Priority: DB Order items (table.orders[0].items) → kots relation flattened.
 * DB Order items are normalized to the { n, p, q } shape used by billing/print utilities.
 */
export const getAllOrderItems = (table) => {
  if (!table) return [];

  // 1. Prefer DB-backed Order items (set by useTableSync when orders relation is included)
  const activeOrder = table.activeOrder || (table.orders && table.orders[0]);

  // Flatten kots relation items (relational Kot/KotItem tables — always complete)
  // Fall back to legacy kotHistory JSON blob for backward compat
  const kotSource = (Array.isArray(table.kots) && table.kots.length > 0) ? table.kots : (Array.isArray(table.kotHistory) ? table.kotHistory : []);
  const kotItems = kotSource.length > 0
    ? kotSource.flatMap(kot => (kot.items || []).map(i => ({
        id: i.id ?? null,
        n: i.n ?? i.name ?? '',
        p: Number(i.p ?? i.price ?? 0),
        q: Number(i.q ?? i.quantity ?? 1),
        quantity: Number(i.q ?? i.quantity ?? 1),
        notes: i.notes || null,
        removedFromBill: i.removedFromBill || i.s === 'Cancelled' || i.status === 'CANCELLED' || false,
        menuType: i.menuType || null,
        gstEnabled: i.gstEnabled ?? null,
        _fromKot: true,
      })))
    : [];

  if (activeOrder && activeOrder.items && activeOrder.items.length > 0) {
    const dbItems = activeOrder.items.map(item => ({
      id: item.id,
      n: item.name ?? item.n,
      p: Number(item.price ?? item.p ?? 0),
      q: Number(item.quantity ?? item.q ?? 1),
      quantity: Number(item.quantity ?? item.q ?? 1),
      notes: item.notes || null,
      removedFromBill: item.removedFromBill ?? false,
      originalQuantity: item.originalQuantity ?? null,
      cancelledQuantity: Number(item.cancelledQuantity ?? 0),
      editedQuantity: Number(item.editedQuantity ?? 0),
      menuType: item.menuType || item.menuItem?.menuType || null,
      gstEnabled: item.gstEnabled ?? item.menuItem?.gstEnabled ?? null,
    }));

    // DB activeOrder.items is the source of truth — server now filters removedFromBill
    // and quantity <= 0 in tableInclude, so dbItems is clean and authoritative.
    // kotItems is only used to recover items ENTIRELY absent from DB (edge case).
    const dbItemNames = new Set(
      dbItems.map(i => (i.n || '').trim().toLowerCase()).filter(Boolean)
    );
    const kotOnlyItems = [];
    const seen = new Set();
    kotItems.forEach(i => {
      const name = (i.n || '').trim().toLowerCase();
      if (!dbItemNames.has(name) && !seen.has(name) && !i.removedFromBill) {
        seen.add(name);
        kotOnlyItems.push(i);
      }
    });

    return [...dbItems, ...kotOnlyItems];
  }

  // 2. Fall back to kots relation / kotHistory
  if (kotItems.length > 0) {
    return kotItems;
  }

  return [];
};

/**
 * Returns only billable (non-cancelled) items.
 */
export const getBillableItems = (table) => {
  return getAllOrderItems(table).filter(item => !item.removedFromBill);
};

// Backward-compat alias — now returns ALL items (unfiltered)
export const getTableItems = getAllOrderItems;

/**
 * Groups items by normalized name, summing quantities and prices.
 * Preserves original IDs for cancellation workflows.
 * Items with removedFromBill=true are skipped.
 */
export const groupOrderItems = (items) => {
  if (!items || !Array.isArray(items)) return [];

  const map = {};
  items.forEach((item) => {
    if (item.removedFromBill) return;
    const name = (item.n ?? item.name ?? '').trim();
    const price = Number(item.p ?? item.price ?? 0);
    const qty = Number(item.q ?? item.quantity ?? 1);
    const key = `${name}::${price}`;

    if (!map[key]) {
      map[key] = {
        id: item.id,
        n: name,
        p: price,
        q: 0,
        quantity: 0,
        notes: item.notes || null,
        menuType: item.menuType || null,
        gstEnabled: item.gstEnabled ?? null,
        originalIds: [],
      };
    }
    map[key].q += qty;
    map[key].quantity += qty;
    if (item.id) map[key].originalIds.push(item.id);
  });

  return Object.values(map);
};

/**
 * Calculates the total bill dynamically from the table's order data.
 * Prefers DB Order items over kotHistory via getBillableItems().
 */
export const calculateTableBill = (table) => {
  if (!table) return { subtotal: 0, taxes: 0, total: 0 };
  return calculateOrderTotal(getBillableItems(table));
};

/**
 * Calculates the total bill including the unsubmitted (draft) session items.
 */
export const calculateSessionBill = (table, draftItems = []) => {
  const committed = getBillableItems(table);
  return calculateOrderTotal([...committed, ...draftItems]);
};
