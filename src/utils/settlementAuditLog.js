import { addSettlementAuditLog, updateSettlementAuditLog } from './offlineDB';

/**
 * Record an offline settlement attempt in the IndexedDB audit log.
 * The log is append-only and is updated later when the sync engine reports
 * success or failure for the matching requestId.
 */
export async function recordSettlementAudit({
  requestId,
  orderId,
  tableId,
  method,
  amount,
  offline,
  status = 'pending',
  error = null,
}) {
  try {
    const localId = await addSettlementAuditLog({
      requestId,
      orderId,
      tableId,
      method,
      amount,
      offline,
      status,
      error,
    });
    return localId;
  } catch (err) {
    console.error('[SettlementAudit] Failed to record audit log:', err.message);
    return null;
  }
}

/**
 * Update an audit log entry once the sync engine reports the result.
 */
export async function finalizeSettlementAudit(requestId, { status, error = null, syncedAt = Date.now() }) {
  try {
    const { getSettlementAuditLogs } = await import('./offlineDB');
    const entries = await getSettlementAuditLogs({ requestId });
    for (const entry of entries) {
      await updateSettlementAuditLog(entry.localId, {
        status,
        error,
        syncedAt,
        synced: status === 'success' || status === 'skipped',
      });
    }
  } catch (err) {
    console.error('[SettlementAudit] Failed to finalize audit log:', err.message);
  }
}
