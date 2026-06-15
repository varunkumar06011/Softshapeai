/**
 * Calculates the subtotal, taxes, and total for a given array of items.
 * Each item must have `p` (price) and `q` (quantity).
 */
export const calculateOrderTotal = (items, discountPercent = 0) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { subtotal: 0, taxes: 0, total: 0, grandTotal: 0, discountAmount: 0, foodSubtotal: 0, liquorSubtotal: 0, cgst: 0, sgst: 0 };
  }

  let foodSubtotal = 0;
  let liquorSubtotal = 0;

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
    }
  });

  // GST Calculation: 5% total on food only (2.5% CGST + 2.5% SGST), 0% on liquor
  const cgst = Math.round(foodSubtotal * 0.025 * 100) / 100;  // 2.5% CGST on food
  const sgst = Math.round(foodSubtotal * 0.025 * 100) / 100;  // 2.5% SGST on food
  const taxes = cgst + sgst;  // Total 5% GST on food
  const subtotal = foodSubtotal + liquorSubtotal;
  const total = subtotal + taxes;
  const discountAmount = discountPercent > 0
    ? Math.round(subtotal * (discountPercent / 100) * 100) / 100
    : 0;

  const discountedFood = foodSubtotal - (discountAmount > 0 && subtotal > 0
    ? discountAmount * (foodSubtotal / subtotal)
    : 0);
  const cgstFinal = Math.round(discountedFood * 0.025 * 100) / 100;
  const sgstFinal = Math.round(discountedFood * 0.025 * 100) / 100;
  const taxesFinal = cgstFinal + sgstFinal;
  const grandTotal = Number((subtotal - discountAmount + taxesFinal).toFixed(2));

  return {
    subtotal: Number(subtotal.toFixed(2)),
    taxes: Number(taxesFinal.toFixed(2)),
    total: Number(total.toFixed(2)),
    grandTotal,
    discountAmount: Number(discountAmount.toFixed(2)),
    foodSubtotal: Number(foodSubtotal.toFixed(2)),
    liquorSubtotal: Number(liquorSubtotal.toFixed(2)),
    cgst: Number(cgstFinal.toFixed(2)),
    sgst: Number(sgstFinal.toFixed(2))
  };
};

/**
 * Returns ALL items for a table (including cancelled/removed).
 * Priority: DB Order items (table.orders[0].items) → kotHistory flattened.
 * DB Order items are normalized to the { n, p, q } shape used by billing/print utilities.
 */
export const getAllOrderItems = (table) => {
  if (!table) return [];

  // 1. Prefer DB-backed Order items (set by useTableSync when orders relation is included)
  const activeOrder = table.activeOrder || (table.orders && table.orders[0]);

  // Flatten kotHistory items (all KOTs captain has sent — always complete)
  const kotItems = (table.kotHistory && table.kotHistory.length > 0)
    ? table.kotHistory.flatMap(kot => (kot.items || []).map(i => ({
        id: i.id ?? null,
        n: i.n ?? i.name ?? '',
        p: Number(i.p ?? i.price ?? 0),
        q: Number(i.q ?? i.quantity ?? 1),
        quantity: Number(i.q ?? i.quantity ?? 1),
        notes: i.notes || null,
        removedFromBill: i.removedFromBill ?? false,
        menuType: i.menuType || null,
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
    }));

    // DB activeOrder.items is the source of truth for quantities —
    // mapBackendTable additive merge already ensures all items from all KOTs are present.
    // kotHistory is only used here to recover items ENTIRELY absent from DB
    // (e.g. optimistic local KOT not yet confirmed by backend).
    // Do NOT use kotHistory to adjust quantities — retried/duplicate KOTs inflate the count.
    const dbItemNames = new Set(
      dbItems.map(i => (i.n || '').trim().toLowerCase()).filter(Boolean)
    );
    const kotOnlyItems = [];
    const seen = new Set();
    kotItems.forEach(i => {
      const name = (i.n || '').trim().toLowerCase();
      if (!dbItemNames.has(name) && !seen.has(name)) {
        seen.add(name);
        kotOnlyItems.push(i);
      }
    });

    return [...dbItems, ...kotOnlyItems];
  }

  // 2. Fall back to kotHistory (legacy JSON blob — kept for KOT timeline display)
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
