import { describe, expect, it, vi } from 'vitest';
import { createPrintQueue, dispatchPrintJob, PRINT_JOB_STATUS } from '../printQueue';

function makeDb({ changes = 1 } = {}) {
  return {
    execute: vi.fn(async () => ({ changes })),
    query: vi.fn(async () => []),
    transaction: vi.fn(async () => undefined),
  };
}

describe('Android durable print queue', () => {
  it('enqueues a print job transactionally before dispatch', async () => {
    const db = makeDb();
    const queue = createPrintQueue(db, { now: () => 123 });

    const result = await queue.enqueue({
      eventId: 'kot-event-1',
      restaurantId: 'rest-1',
      orderId: 'order-1',
      type: 'KOT',
      targetPrinter: 'kitchen',
      payload: { connection: { type: 'lan', ip: '192.168.1.50' }, bytes: [27, 64] },
    });

    expect(result).toEqual({ eventId: 'kot-event-1', status: PRINT_JOB_STATUS.QUEUED, createdAt: 123 });
    expect(db.transaction).toHaveBeenCalledWith([expect.objectContaining({
      values: ['kot-event-1', 'rest-1', 'order-1', null, 'KOT', 'kitchen', JSON.stringify({ connection: { type: 'lan', ip: '192.168.1.50' }, bytes: [27, 64] }), 'QUEUED', 123],
    })]);
  });

  it('does not dispatch a job that another worker already claimed', async () => {
    const db = makeDb({ changes: 0 });
    const queue = createPrintQueue(db);
    const printer = { print: vi.fn() };

    const result = await dispatchPrintJob({
      queue,
      printer,
      job: { eventId: 'kot-event-1', payload: { connection: {}, bytes: [1] } },
    });

    expect(result).toMatchObject({ printed: false, skipped: true });
    expect(printer.print).not.toHaveBeenCalled();
  });

  it('marks successful jobs printed and failed jobs failed without hiding errors', async () => {
    const db = makeDb();
    const queue = createPrintQueue(db);
    const printer = { print: vi.fn(async () => ({ success: true })) };

    const success = await dispatchPrintJob({
      queue,
      printer,
      job: { eventId: 'kot-event-1', payload: { connection: { type: 'lan' }, bytes: [1] } },
    });
    expect(success.printed).toBe(true);
    expect(db.execute).toHaveBeenCalledWith('UPDATE print_job SET status = ?, printed_at = ?, last_error = NULL WHERE event_id = ? AND status = ?', expect.any(Array));

    printer.print.mockRejectedValueOnce(new Error('paper out'));
    const failure = await dispatchPrintJob({
      queue,
      printer,
      job: { eventId: 'kot-event-2', payload: { connection: { type: 'lan' }, bytes: [1] } },
    });
    expect(failure.printed).toBe(false);
    expect(failure.error.message).toBe('paper out');
    expect(db.execute).toHaveBeenCalledWith('UPDATE print_job SET status = ?, last_error = ? WHERE event_id = ? AND status = ?', expect.any(Array));
  });

  it('requires explicit retry for KOT jobs but permits automatic retry policy for bills', () => {
    const queue = createPrintQueue(makeDb());
    expect(queue.shouldAutoRetry('KOT')).toBe(false);
    expect(queue.shouldAutoRetry('BAR_KOT')).toBe(false);
    expect(queue.shouldAutoRetry('FINAL_BILL')).toBe(true);
  });
});
