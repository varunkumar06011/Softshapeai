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
    
    // Detect liquor by checking all possible field shapes from captain cart,
    // DB order items, and legacy kotHistory items.
    const rawType = item.menuType || item.menuItem?.menuType || item.type || '';
    const type = rawType.toString().toUpperCase() === 'LIQUOR' ? 'liquor' : 'food';
    
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
 * Returns the canonical list of items for a table.
 * Priority: DB Order items (table.orders[0].items) → kotHistory flattened.
 * DB Order items are normalized to the { n, p, q } shape used by billing/print utilities.
 */
export const getTableItems = (table) => {
  if (!table) return [];

  // 1. Prefer DB-backed Order items (set by useTableSync when orders relation is included)
  const activeOrder = table.activeOrder || (table.orders && table.orders[0]);
  if (activeOrder && activeOrder.items && activeOrder.items.length > 0) {
    return activeOrder.items
      .filter(item => !item.removedFromBill)
      .map(item => ({
        id: item.id,
        n: item.name ?? item.n,
        p: Number(item.price ?? item.p ?? 0),
        q: Number(item.quantity ?? item.q ?? 1),
        quantity: Number(item.quantity ?? item.q ?? 1),
        notes: item.notes || null,
        removedFromBill: false,
        originalQuantity: item.originalQuantity ?? null,
        cancelledQuantity: Number(item.cancelledQuantity ?? 0),
        editedQuantity: Number(item.editedQuantity ?? 0),
        // Preserve menuType so calculateOrderTotal can correctly apply 0% GST for liquor
        menuType: item.menuType || item.menuItem?.menuType || null,
      }));
  }

  // 2. Fall back to kotHistory (legacy JSON blob — kept for KOT timeline display)
  if (table.kotHistory && table.kotHistory.length > 0) {
    return table.kotHistory.flatMap(kot => (kot.items || []).filter(item => !item.removedFromBill));
  }

  return [];
};

/**
 * Calculates the total bill dynamically from the table's order data.
 * Prefers DB Order items over kotHistory via getTableItems().
 */
export const calculateTableBill = (table) => {
  if (!table) return { subtotal: 0, taxes: 0, total: 0 };
  return calculateOrderTotal(getTableItems(table));
};

/**
 * Calculates the total bill including the unsubmitted (draft) session items.
 */
export const calculateSessionBill = (table, draftItems = []) => {
  const committed = getTableItems(table);
  return calculateOrderTotal([...committed, ...draftItems]);
};
