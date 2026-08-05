/**
 * Temporary V1 shadow comparison logic.
 *
 * Purpose: Compare V1 business state with V2 business state after
 * shadow execution. Compares business state, not HTTP response shapes.
 *
 * Remove after V1 cutover.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(value) {
  return Math.round(value * 100) / 100;
}

function compareNumbers(expected, actual, fieldName, mismatches) {
  if (round2(expected) !== round2(actual)) {
    mismatches.push(`${fieldName}: expected ${expected}, got ${actual}`);
  }
}

function compareStrings(expected, actual, fieldName, mismatches) {
  if (String(expected || '') !== String(actual || '')) {
    mismatches.push(`${fieldName}: expected "${expected}", got "${actual}"`);
  }
}

// ── Order state comparison ───────────────────────────────────────────────────

/**
 * Compare V1 order state (from V1 API response) with V2 order state
 * (from V2 query endpoints).
 *
 * @param {object} v1State - V1 order data from the V1 API response
 * @param {object} v2State - V2 order data from queryV2OrderState()
 * @returns {{ match: boolean, mismatches: string[] }}
 */
export function compareOrderState(v1State, v2State) {
  const mismatches = [];

  if (!v1State) {
    return { match: false, mismatches: ['V1 state is null'] };
  }
  if (!v2State || v2State.error) {
    return { match: false, mismatches: [`V2 state is null or error: ${v2State?.error || 'null'}`] };
  }

  const v1Order = v1State.order || v1State;
  const v2Order = v2State.order;

  if (!v2Order) {
    return { match: false, mismatches: ['V2 order not found in read model'] };
  }

  // Compare order fields
  compareStrings(v1Order.tableId || v1Order.table_id, v2Order.table_id, 'order.table_id', mismatches);
  compareStrings(v1Order.status, v2Order.status, 'order.status', mismatches);
  compareNumbers(v1Order.totalAmount || v1Order.total_amount || 0, v2Order.total_amount, 'order.total_amount', mismatches);
  compareStrings(v1Order.captainName || v1Order.captainId || v1Order.captain_id, v2Order.captain_id, 'order.captain_id', mismatches);
  compareStrings(v1Order.platform, v2Order.platform, 'order.platform', mismatches);

  // Compare item count
  const v1Items = v1State.items || v1Order.items || [];
  const v2Items = v2State.items || [];

  if (v1Items.length !== v2Items.length) {
    mismatches.push(`items: expected ${v1Items.length} items, got ${v2Items.length}`);
  } else {
    // Compare each item
    for (let i = 0; i < v1Items.length; i++) {
      const v1Item = v1Items[i];
      const v2Item = v2Items[i];
      compareStrings(v1Item.menuItemId || v1Item.menu_item_id, v2Item.menu_item_id, `item[${i}].menu_item_id`, mismatches);
      compareStrings(v1Item.name, v2Item.name, `item[${i}].name`, mismatches);
      compareNumbers(v1Item.price, v2Item.price, `item[${i}].price`, mismatches);
      compareNumbers(v1Item.quantity, v2Item.quantity, `item[${i}].quantity`, mismatches);
      compareStrings(v1Item.status || 'ACTIVE', v2Item.status, `item[${i}].status`, mismatches);
    }
  }

  // Compare KOT existence
  const v1HasKot = !!(v1State.kotId || v1State.kotNumber || (v1State.kots && v1State.kots.length > 0));
  const v2HasKot = (v2State.kots && v2State.kots.length > 0);

  if (v1HasKot !== v2HasKot) {
    mismatches.push(`kot: V1 has KOT=${v1HasKot}, V2 has KOT=${v2HasKot}`);
  }

  // Compare bill existence
  const v1HasBill = !!(v1State.billId || v1State.billNumber || v1State.bill);
  const v2HasBill = !!v2State.bill;

  if (v1HasBill !== v2HasBill) {
    mismatches.push(`bill: V1 has bill=${v1HasBill}, V2 has bill=${v2HasBill}`);
  }

  // Compare bill totals if both have bills
  if (v1HasBill && v2HasBill) {
    const v1Bill = v1State.bill || v1State;
    const v2Bill = v2State.bill;
    compareNumbers(v1Bill.subtotal || v1Bill.subTotal || 0, v2Bill.subtotal, 'bill.subtotal', mismatches);
    compareNumbers(v1Bill.taxAmount || v1Bill.tax_amount || 0, v2Bill.tax_amount, 'bill.tax_amount', mismatches);
    compareNumbers(v1Bill.totalAmount || v1Bill.total_amount || 0, v2Bill.total_amount, 'bill.total_amount', mismatches);
  }

  return {
    match: mismatches.length === 0,
    mismatches,
  };
}

// ── Simple operation comparison ──────────────────────────────────────────────

/**
 * For operations that don't produce a full order state (like standalone
 * addOrderItems or cancelOrderItem), compare just the operation result.
 */
export function compareOperationResult(operation, v1Result, v2Result) {
  const mismatches = [];

  if (!v1Result || !v1Result.ok) {
    // V1 failed — we can't compare if V1 didn't succeed
    return { match: true, mismatches: [] };
  }

  if (!v2Result || !v2Result.ok) {
    mismatches.push(`${operation}: V1 succeeded but V2 failed: ${v2Result?.error || 'unknown'}`);
    return { match: false, mismatches };
  }

  // Compare event presence
  if (v2Result.events && v2Result.events.length === 0) {
    mismatches.push(`${operation}: V2 produced no events`);
  }

  return {
    match: mismatches.length === 0,
    mismatches,
  };
}
