// ─────────────────────────────────────────────────────────────────────────────
// Billing — Order total calculation with GST, discounts, and service charges
// ─────────────────────────────────────────────────────────────────────────────
// Core billing calculation utilities used by POS, cashier, and admin:
//   - calculateOrderTotal(items, discountPercent, options) — computes subtotal,
//     GST (CGST/SGST split), discount amount, service charge, and final total
//   - GST always added on top of discounted subtotal (food + liquor combined)
//   - GST rate determined by restaurant config (AC=18%, Non-AC=5%, Takeaway=5%)
//   - CGST and SGST are NOT rounded — only grand total is rounded
//   - Handles unregistered restaurants (0% GST)
//   - Item shape: { p: price, q: quantity, ... }
//
// Returns: { subtotal, cgst, sgst, taxes, discountAmount, serviceCharge, grandTotal }
// ─────────────────────────────────────────────────────────────────────────────

import { getRestaurantConfig } from '../../utils/getRestaurantConfig';
import { getEffectiveGstRate, getGstBreakdownWithRate } from '../../utils/gstFrontend';

/**
 * Calculates the subtotal, taxes, and total for a given array of items.
 * Each item must have `p` (price) and `q` (quantity).
 * GST options default to the logged-in restaurant's configuration; pass `options` to override.
 */
export const calculateOrderTotal = (items, discountPercent = 0, options = {}) => {
  const needsConfig =
    options.gstCategory == null ||
    options.gstRegistered == null ||
    options.serviceChargePercent == null;
  const config = needsConfig ? getRestaurantConfig() : {};
  const gstCategory = options.gstCategory ?? config.gstCategory ?? 'NON_AC';
  const gstRegistered = options.gstRegistered ?? config.gstRegistered ?? true;
  const ratePercent = getEffectiveGstRate(
    options.gstRate ?? config.gstRate ?? null,
    gstCategory,
    gstRegistered,
  );

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { subtotal: 0, taxes: 0, total: 0, grandTotal: 0, discountAmount: 0, serviceCharge: undefined, serviceChargeAmount: 0, foodSubtotal: 0, liquorSubtotal: 0, cgst: 0, sgst: 0, roundOff: 0 };
  }

  let foodSubtotal = 0;
  let liquorSubtotal = 0;
  let gstExemptTotal = 0;

  items.forEach((item) => {
    if (item.removedFromBill) return;
    const price = Number(item.p ?? item.price ?? 0);
    const qty = Number(item.q ?? item.quantity ?? 1);

    const rawType = item.menuItem?.menuType || item.menuType || item.type || '';
    const typeUpper = rawType.toString().toUpperCase();
    const isLiquor = (typeUpper === 'LIQUOR' || typeUpper === 'BAR');

    if (isLiquor) {
      liquorSubtotal += price * qty;
      // Liquor defaults to gstEnabled=false (no GST) but admin can enable it per item
      if (item.gstEnabled === false) {
        gstExemptTotal += price * qty;
      }
    } else {
      foodSubtotal += price * qty;
      if (item.gstEnabled === false) {
        gstExemptTotal += price * qty;
      }
    }
  });

  // Flow: subtotal → discount on subtotal → GST on (discounted subtotal minus exempt) → grand total rounded
  // Matches cloud orderService.ts settleOrder and escpos.ts buildBill calculation.
  const subtotal = foodSubtotal + liquorSubtotal;
  const discountAmount = discountPercent > 0
    ? Math.round(subtotal * (discountPercent / 100) * 100) / 100
    : 0;

  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const gstExemptAfterDiscount = Math.max(0, gstExemptTotal - (discountAmount > 0 && subtotal > 0 ? discountAmount * (gstExemptTotal / subtotal) : 0));
  const taxableAmount = Math.max(0, discountedSubtotal - gstExemptAfterDiscount);

  // GST: CGST and SGST are NOT rounded — only grand total is rounded
  // Uses getGstBreakdownWithRate from gstFrontend.ts (single source of truth, mirrors backend gst.ts)
  const { cgst, sgst, tax: taxes } = getGstBreakdownWithRate(taxableAmount, ratePercent);

  const scPercent = Number(options.serviceChargePercent ?? config.serviceChargePercent ?? 0);
  const serviceChargeAmount = scPercent > 0
    ? (discountedSubtotal + taxes) * (scPercent / 100)
    : 0;

  const rawGrandTotal = Math.max(0, discountedSubtotal + taxes + serviceChargeAmount);
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;

  return {
    subtotal: Math.round(discountedSubtotal),
    rawSubtotal: Math.round(subtotal),
    taxes,
    total: grandTotal,
    grandTotal,
    discountAmount: Math.round(discountAmount),
    serviceCharge: scPercent > 0 ? { percent: scPercent, amount: serviceChargeAmount } : undefined,
    serviceChargeAmount,
    roundOff,
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
      menuType: item.menuItem?.menuType || item.menuType || null,
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
    const key = `${name}::${price}::${item.notes ?? ''}`;

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
export const calculateTableBill = (table, options = {}) => {
  if (!table) return { subtotal: 0, taxes: 0, total: 0 };
  return calculateOrderTotal(getBillableItems(table), 0, options);
};

/**
 * Calculates the total bill including the unsubmitted (draft) session items.
 */
export const calculateSessionBill = (table, draftItems = [], options = {}) => {
  const committed = getBillableItems(table);
  return calculateOrderTotal([...committed, ...draftItems], 0, options);
};
