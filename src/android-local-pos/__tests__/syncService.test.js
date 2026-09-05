import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../../services/apiConfig', () => ({ apiFetch }));

import { createAndroidSyncAdapter } from '../syncService';

function makeDb(rowsByQuery = {}) {
  const execute = vi.fn(async () => ({ changes: 1 }));
  const query = vi.fn(async (sql) => {
    if (sql.includes('SELECT id FROM outlet')) return rowsByQuery.outlet || [{ id: 'restaurant-1' }];
    if (sql.includes('SELECT COUNT')) return rowsByQuery.count || [{ count: 1 }];
    if (sql.includes('SELECT * FROM sync_queue')) return rowsByQuery.queue || [{
      id: 1,
      table_name: 'order',
      record_id: 'order-1',
      operation: 'insert',
      payload: JSON.stringify({ id: 'order-1' }),
    }];
    return [];
  });
  return { query, execute };
}

function response(body) {
  return { json: async () => body };
}

describe('Android cloud sync adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pushes pending local records to the existing edge sync contract', async () => {
    apiFetch.mockResolvedValue(response({ accepted: [1], rejected: [] }));
    const database = makeDb();
    const sync = createAndroidSyncAdapter(database, { intervalMs: 100000 });

    const result = await sync.syncNow();

    expect(apiFetch).toHaveBeenCalledWith('/api/edge/sync', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ restaurantId: 'restaurant-1', batch: [{ queueId: 1, tableName: 'order' }] });
    expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('status = ?'), ['SYNCED', expect.any(Number), expect.any(Number), 1]);
    expect(result).toMatchObject({ pushed: 1, accepted: 1 });
  });

  it('marks retryable and permanent outcomes separately', async () => {
    apiFetch.mockResolvedValue(response({
      accepted: [],
      rejected: [
        { queueId: 1, outcome: 'error', error: 'temporary' },
        { queueId: 2, outcome: 'permanent', error: 'invalid' },
      ],
    }));
    const database = makeDb({ queue: [
      { id: 1, table_name: 'order', record_id: 'o1', operation: 'insert', payload: '{}' },
      { id: 2, table_name: 'order', record_id: 'o2', operation: 'insert', payload: '{}' },
    ] });
    const sync = createAndroidSyncAdapter(database);

    await sync.syncNow();

    expect(database.execute.mock.calls.some(([, values]) => values[0] === 'RETRY' && values[6] === 'temporary' && values[7] === 1)).toBe(true);
    expect(database.execute.mock.calls.some(([, values]) => values[0] === 'FAILED' && values[6] === 'invalid' && values[7] === 2)).toBe(true);
  });

  it('does not call the cloud when no local outlet is configured', async () => {
    const database = makeDb({ outlet: [] });
    const sync = createAndroidSyncAdapter(database);

    await expect(sync.syncNow()).resolves.toMatchObject({ skipped: true, reason: 'outlet-not-configured' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
