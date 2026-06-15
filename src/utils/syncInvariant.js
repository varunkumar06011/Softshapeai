/**
 * Runtime invariant checker: validates that sync services never drop items.
 * Import and call validateTableIntegrity() after any mapBackendTable operation.
 */

const VIOLATIONS = [];

export function recordItemLoss(source, tableId, beforeCount, afterCount, details = '') {
  const msg = `[INVARIANT VIOLATION] ${source} dropped items for table ${tableId}: ${beforeCount} → ${afterCount}. ${details}`;
  VIOLATIONS.push({ source, tableId, beforeCount, afterCount, details, time: new Date().toISOString() });
  console.error(msg);
  // Also flash a visible error so developers don't miss it during development
  if (import.meta.env?.DEV) {
    /* eslint-disable no-alert */
    alert(`CRITICAL BUG: ${source} dropped items for table ${tableId}!\nCheck console immediately.`);
  }
}

export function validateTableIntegrity(source, before, after) {
  if (!before || !after) return;
  const beforeItems = getItemCount(before);
  const afterItems = getItemCount(after);
  if (afterItems < beforeItems) {
    recordItemLoss(source, after.backendId || after.id, beforeItems, afterItems,
      `activeOrder.items: ${before.activeOrder?.items?.length ?? 0} → ${after.activeOrder?.items?.length ?? 0}`);
  }
  const beforeKots = before.kotHistory?.length ?? 0;
  const afterKots = after.kotHistory?.length ?? 0;
  if (afterKots < beforeKots && after.status !== 'Free' && after.status !== 'AVAILABLE') {
    recordItemLoss(source, after.backendId || after.id, beforeKots, afterKots, 'kotHistory shrunk on occupied table');
  }
}

function getItemCount(table) {
  if (!table) return 0;
  const orderItems = table.activeOrder?.items?.length ?? 0;
  const kotItems = (table.kotHistory || []).reduce((sum, k) => sum + (k.items?.length ?? 0), 0);
  return Math.max(orderItems, kotItems);
}

export function getViolations() {
  return [...VIOLATIONS];
}

export function clearViolations() {
  VIOLATIONS.length = 0;
}
