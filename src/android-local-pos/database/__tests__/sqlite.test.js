import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  execScript: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(async () => ({ rows: [{ id: 'order-1' }] })),
  transaction: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => plugin),
}));

import { createAndroidSqliteAdapter, DATABASE_NAME, DATABASE_VERSION } from '../sqlite';

describe('Android SQLite adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the database and applies the versioned local schema', async () => {
    const adapter = createAndroidSqliteAdapter();

    await adapter.open();

    expect(plugin.open).toHaveBeenCalledWith({ name: DATABASE_NAME, version: DATABASE_VERSION });
    expect(plugin.execScript).toHaveBeenCalledTimes(3);
    expect(plugin.execScript.mock.calls[0][0].sql).toContain('CREATE TABLE IF NOT EXISTS order_record');
    expect(plugin.execScript.mock.calls[1][0].sql).toContain('ALTER TABLE order_record ADD COLUMN discount_percent');
    expect(plugin.execScript.mock.calls[2][0].sql).toContain('ALTER TABLE sync_queue ADD COLUMN last_attempt_at');
    expect(adapter.health()).toMatchObject({ opened: true, version: DATABASE_VERSION });
  });

  it('does not query or execute after close', async () => {
    const adapter = createAndroidSqliteAdapter();
    await adapter.open();
    await adapter.close();

    await expect(adapter.query('SELECT 1')).rejects.toThrow('database is not open');
    await expect(adapter.execute('SELECT 1')).rejects.toThrow('database is not open');
    expect(plugin.close).toHaveBeenCalledWith({ name: DATABASE_NAME });
  });

  it('passes parameterized queries and transactions to the native plugin', async () => {
    const adapter = createAndroidSqliteAdapter();
    await adapter.open();

    await adapter.execute('UPDATE order_record SET status = ? WHERE id = ?', ['PAID', 'order-1']);
    const rows = await adapter.query('SELECT * FROM order_record WHERE id = ?', ['order-1']);
    await adapter.transaction([
      { sql: 'INSERT INTO sync_meta(key, value, updated_at) VALUES (?, ?, ?)', values: ['k', 'v', 1] },
    ]);

    expect(plugin.execute).toHaveBeenCalledWith({
      sql: 'UPDATE order_record SET status = ? WHERE id = ?',
      values: ['PAID', 'order-1'],
    });
    expect(rows).toEqual([{ id: 'order-1' }]);
    expect(plugin.transaction).toHaveBeenCalledWith({
      statements: [
        { sql: 'INSERT INTO sync_meta(key, value, updated_at) VALUES (?, ?, ?)', values: ['k', 'v', 1] },
      ],
    });
  });
});
