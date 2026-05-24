export const TAX_RATE = 0.18; // 18% GST

/**
 * Calculates the subtotal, taxes, and total for a given array of items.
 * Each item must have `p` (price) and `q` (quantity).
 */
export const calculateOrderTotal = (items) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { subtotal: 0, taxes: 0, total: 0 };
  }

  const subtotal = items.reduce((sum, item) => {
    const price = Number(item.p ?? item.price ?? 0);
    const qty = Number(item.q ?? item.quantity ?? 1);
    return sum + (price * qty);
  }, 0);
  const taxes = subtotal * TAX_RATE;
  const total = subtotal + taxes;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    taxes: Number(taxes.toFixed(2)),
    total: Number(total.toFixed(2))
  };
};

/**
 * Returns the canonical list of items for a table.
 * Priority: DB Order items (table.orders[0].items) → kotHistory flattened → table.items fallback.
 * DB Order items are normalized to the { n, p, q } shape used by billing/print utilities.
 */
export const getTableItems = (table) => {
  if (!table) return [];

  // 1. Prefer DB-backed Order items (set by useTableSync when orders relation is included)
  const activeOrder = table.activeOrder || (table.orders && table.orders[0]);
  if (activeOrder?.items && activeOrder.items.length > 0) {
    return activeOrder.items.map(item => ({
      n: item.name ?? item.n,
      p: Number(item.price ?? item.p ?? 0),
      q: Number(item.quantity ?? item.q ?? 1),
      notes: item.notes || null,
    }));
  }

  // 2. Fall back to kotHistory (legacy JSON blob — kept for KOT timeline display)
  if (table.kotHistory && table.kotHistory.length > 0) {
    return table.kotHistory.flatMap(kot => kot.items || []);
  }

  // 3. Last resort: flat items array (used by bar tables)
  return table.items || [];
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
