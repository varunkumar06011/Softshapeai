export const PRINT_JOB_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  PRINTING: 'PRINTING',
  PRINTED: 'PRINTED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const KOT_JOB_TYPES = new Set(['KOT', 'BAR_KOT', 'CANCEL_KOT']);

function requireDb(db) {
  if (!db || typeof db.execute !== 'function' || typeof db.query !== 'function' || typeof db.transaction !== 'function') {
    throw new TypeError('Print queue requires a transactional local database adapter');
  }
}

function parseRow(row) {
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  };
}

export function createPrintQueue(db, { now = () => Date.now() } = {}) {
  requireDb(db);

  return {
    async enqueue({ eventId, restaurantId, orderId, kotId = null, type, targetPrinter, payload }) {
      if (!eventId || !restaurantId || !orderId || !type || !targetPrinter) {
        throw new Error('eventId, restaurantId, orderId, type, and targetPrinter are required');
      }
      if (!payload || !Array.isArray(payload.bytes)) throw new Error('Print payload must contain bytes');

      const timestamp = now();
      await db.transaction([{
        sql: `INSERT INTO print_job
          (event_id, restaurant_id, order_id, kot_id, type, target_printer, payload, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          eventId,
          restaurantId,
          orderId,
          kotId,
          type,
          targetPrinter,
          JSON.stringify(payload),
          PRINT_JOB_STATUS.QUEUED,
          timestamp,
        ],
      }]);

      return { eventId, status: PRINT_JOB_STATUS.QUEUED, createdAt: timestamp };
    },

    async getPending({ limit = 50 } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
      const rows = await db.query(
        `SELECT * FROM print_job WHERE status = ? ORDER BY id ASC LIMIT ${safeLimit}`,
        [PRINT_JOB_STATUS.QUEUED],
      );
      return rows.map(parseRow);
    },

    async claim(eventId) {
      const result = await db.execute(
        'UPDATE print_job SET status = ?, attempts = attempts + 1 WHERE event_id = ? AND status = ?',
        [PRINT_JOB_STATUS.PRINTING, eventId, PRINT_JOB_STATUS.QUEUED],
      );
      return Number(result?.changes || 0) === 1;
    },

    async markPrinted(eventId) {
      await db.execute(
        'UPDATE print_job SET status = ?, printed_at = ?, last_error = NULL WHERE event_id = ? AND status = ?',
        [PRINT_JOB_STATUS.PRINTED, now(), eventId, PRINT_JOB_STATUS.PRINTING],
      );
    },

    async markFailed(eventId, error) {
      await db.execute(
        'UPDATE print_job SET status = ?, last_error = ? WHERE event_id = ? AND status = ?',
        [PRINT_JOB_STATUS.FAILED, String(error?.message || error || 'Print failed'), eventId, PRINT_JOB_STATUS.PRINTING],
      );
    },

    async retry(eventId) {
      await db.execute(
        'UPDATE print_job SET status = ?, last_error = NULL WHERE event_id = ? AND status = ?',
        [PRINT_JOB_STATUS.QUEUED, eventId, PRINT_JOB_STATUS.FAILED],
      );
    },

    shouldAutoRetry(type) {
      return !KOT_JOB_TYPES.has(String(type || '').toUpperCase());
    },
  };
}

export async function dispatchPrintJob({ queue, printer, job }) {
  if (!queue || !printer || !job) throw new TypeError('queue, printer, and job are required');
  const claimed = await queue.claim(job.event_id || job.eventId);
  if (!claimed) return { printed: false, skipped: true, eventId: job.event_id || job.eventId };

  const eventId = job.event_id || job.eventId;
  try {
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    const result = await printer.print({
      connection: payload.connection,
      bytes: payload.bytes,
    });
    await queue.markPrinted(eventId);
    return { printed: true, skipped: false, eventId, result };
  } catch (error) {
    await queue.markFailed(eventId, error);
    return { printed: false, skipped: false, eventId, error };
  }
}
