export const TAX_RATE = 0.18; // 18% GST

/**
 * Calculates the subtotal, taxes, and total for a given array of items.
 * Each item must have `p` (price) and `q` (quantity).
 */
export const calculateOrderTotal = (items) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { subtotal: 0, taxes: 0, total: 0 };
  }

  const subtotal = items.reduce((sum, item) => sum + (item.p * item.q), 0);
  const taxes = subtotal * TAX_RATE;
  const total = subtotal + taxes;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    taxes: Number(taxes.toFixed(2)),
    total: Number(total.toFixed(2))
  };
};

/**
 * Calculates the total bill dynamically from the table's KOT history.
 */
export const calculateTableBill = (table) => {
  if (!table || !table.kotHistory) {
    return { subtotal: 0, taxes: 0, total: 0 };
  }

  const allItems = table.kotHistory.flatMap(kot => kot.items || []);
  return calculateOrderTotal(allItems);
};

/**
 * Calculates the total bill including the unsubmitted (draft) session items.
 */
export const calculateSessionBill = (table, draftItems = []) => {
  const allItems = table?.kotHistory ? table.kotHistory.flatMap(kot => kot.items || []) : [];
  const combined = [...allItems, ...draftItems];
  return calculateOrderTotal(combined);
};
