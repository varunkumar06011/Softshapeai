import { describe, expect, it, vi } from 'vitest';
import { createLocalOrderService } from '../localOrderService';

function makeDb() {
  return {
    query: vi.fn(async () => []),
    execute: vi.fn(async () => ({ changes: 1 })),
    transaction: vi.fn(async () => undefined),
  };
}

describe('Android local order service', () => {
  it('persists an order, KOT, print job, and sync item before printing', async () => {
    const database = makeDb();
    const printer = { print: vi.fn(async () => ({ success: true })) };
    const service = createLocalOrderService({ database, printer, now: () => 1000 });

    const result = await service.createOrder({
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      tableNumber: 4,
      requestId: 'request-1',
      orderId: 'order-1',
      items: [{ menuItemId: 'menu-1', name: 'Biryani', price: 200, quantity: 2 }],
    });

    expect(result).toMatchObject({ success: true, orderId: 'order-1', kotNumber: 1 });
    expect(result.printResults).toHaveLength(1);
    expect(result.printResults[0].printed).toBe(true);
    expect(printer.print).toHaveBeenCalledOnce();
    expect(database.transaction).toHaveBeenCalledTimes(2);

    const persistedStatements = database.transaction.mock.calls[1][0];
    expect(persistedStatements.some(({ sql }) => sql.includes('INSERT INTO order_record'))).toBe(true);
    expect(persistedStatements.some(({ sql }) => sql.includes('INSERT INTO kot'))).toBe(true);
    expect(persistedStatements.some(({ sql }) => sql.includes('INSERT INTO print_job'))).toBe(true);
    expect(persistedStatements.some(({ sql }) => sql.includes('INSERT INTO sync_queue'))).toBe(true);
  });

  it('serializes concurrent order creation so local KOT numbers remain unique', async () => {
    const database = makeDb();
    let counter = 0;
    database.query.mockImplementation(async (sql) => {
      if (sql.includes('kot_count')) return [{ kot_count: counter }];
      return [];
    });
    database.transaction.mockImplementation(async (statements) => {
      const counterStatement = statements.find(({ sql }) => sql.includes('daily_counter'));
      if (counterStatement) counter = counterStatement.values[3];
    });
    const service = createLocalOrderService({
      database,
      printer: { print: vi.fn(async () => ({ success: true })) },
    });

    const [first, second] = await Promise.all([
      service.createOrder({ restaurantId: 'r1', tableId: 't1', requestId: 'r1', items: [{ menuItemId: 'm1', name: 'A', price: 10, quantity: 1 }] }),
      service.createOrder({ restaurantId: 'r1', tableId: 't2', requestId: 'r2', items: [{ menuItemId: 'm1', name: 'A', price: 10, quantity: 1 }] }),
    ]);

    expect([first.kotNumber, second.kotNumber]).toEqual([1, 2]);
  });
});
