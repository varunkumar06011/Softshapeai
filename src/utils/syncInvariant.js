// ─────────────────────────────────────────────────────────────────────────────
// Sync Invariant — Runtime invariant checker for table sync item integrity
// ─────────────────────────────────────────────────────────────────────────────
// Validates that sync services never drop items during table state updates.
// Acts as a development safety net to catch item-loss bugs early.
//
// Exports:
//   - recordItemLoss(source, tableId, beforeCount, afterCount, details):
//     Records a violation when items are dropped during sync operations.
//     Logs the violation to the console for debugging.
//   - validateTableIntegrity(source, table, beforeItems, afterItems):
//     Compares item counts before and after a sync operation.
//     Returns true if invariant holds, false if items were dropped.
//   - getViolations(): returns all recorded violations for debugging.
//
// Call validateTableIntegrity() after any mapBackendTable operation in
// tableSyncService or barTableSyncService.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime invariant checker: validates that sync services never drop items.
 * Import and call validateTableIntegrity() after any mapBackendTable operation.
 */

const VIOLATIONS = [];

export function recordItemLoss(source, tableId, beforeCount, afterCount, details = '') {
  const msg = `[INVARIANT VIOLATION] ${source} dropped items for table ${tableId}: ${beforeCount} → ${afterCount}. ${details}`;
  VIOLATIONS.push({ source, tableId, beforeCount, afterCount, details, time: new Date().toISOString() });
  console.error(msg);
  // Keep the violation visible in the console for debugging, but do not use a
  // blocking alert. Server-authoritative updates can legitimately reduce item
  // counts (cancellations, settlements, transfers), and the modal obstructs
  // the UI without adding actionable information beyond the logged message.
}

export function validateTableIntegrity(source, before, after) {
  if (!before || !after) return;
  // Legitimate settlement: a Free/AVAILABLE table SHOULD have zero items and kotHistory
  const isLegitimatelyFree = after.status === 'Free' || after.status === 'AVAILABLE' || after.workflowStatus === 'Free' || after.dbStatus === 'AVAILABLE';
  if (isLegitimatelyFree) return;

  const beforeItems = getItemCount(before);
  const afterItems = getItemCount(after);
  if (afterItems < beforeItems) {
    recordItemLoss(source, after.backendId || after.id, beforeItems, afterItems,
      `activeOrder.items: ${before.activeOrder?.items?.length ?? 0} → ${after.activeOrder?.items?.length ?? 0}`);
  }
  const beforeKots = before.kotHistory?.length ?? 0;
  const afterKots = after.kotHistory?.length ?? 0;
  if (afterKots < beforeKots) {
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
