import { describe, expect, it, vi } from 'vitest';
import { createLocalApiHandler } from '../localApi';

function makeDb() {
  return { query: vi.fn(async (sql) => sql.includes('category') ? [{ id: 'c1' }] : [{ id: 'm1' }]) };
}

describe('Android local LAN API handler', () => {
  it('keeps runtime status available for local diagnostics', async () => {
    const handler = createLocalApiHandler({
      database: makeDb(),
      getStatus: () => ({ state: 'ready' }),
    });

    await expect(handler({ method: 'GET', path: '/api/local/status' })).resolves.toMatchObject({
      status: 200,
      body: { success: true, runtime: { state: 'ready' }, isOperational: true },
    });
  });

  it('requires the local pairing token for business data', async () => {
    const db = makeDb();
    const handler = createLocalApiHandler({ database: db, getStatus: () => ({}), token: 'secret-token' });

    await expect(handler({ method: 'GET', path: '/api/local/menu', headers: {} })).resolves.toMatchObject({ status: 401 });
    expect(db.query).not.toHaveBeenCalled();

    const response = await handler({
      method: 'GET',
      path: '/api/local/menu',
      headers: { 'X-Local-Token': 'secret-token' },
    });
    expect(response).toMatchObject({ status: 200, body: { success: true } });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('returns tables only through the authenticated LAN path', async () => {
    const handler = createLocalApiHandler({ database: makeDb(), getStatus: () => ({}), token: 'token' });
    const response = await handler({ method: 'GET', path: '/api/local/tables', headers: { Authorization: 'Bearer token' } });

    expect(response.status).toBe(200);
    expect(response.body.tables).toEqual([{ id: 'm1' }]);
  });

  it('passes authenticated order payloads to the local order service', async () => {
    const onOrder = vi.fn(async (payload) => ({ success: true, orderId: payload.orderId }));
    const handler = createLocalApiHandler({ database: makeDb(), getStatus: () => ({}), token: 'token', onOrder });
    const response = await handler({
      method: 'POST',
      path: '/api/local/order',
      headers: { 'X-Local-Token': 'token' },
      body: JSON.stringify({ orderId: 'order-1' }),
    });

    expect(response).toEqual({ status: 201, body: { success: true, orderId: 'order-1' } });
    expect(onOrder).toHaveBeenCalledWith({ orderId: 'order-1' });
  });

  it('routes bill, settlement, and cancellation commands through authenticated handlers', async () => {
    const callbacks = {
      onPrintBill: vi.fn(async () => ({ success: true, billNumber: 'BILL-1' })),
      onSettle: vi.fn(async () => ({ success: true, transactionNumber: 'TXN-1' })),
      onCancel: vi.fn(async () => ({ success: true, status: 'CANCELLED' })),
    };
    const handler = createLocalApiHandler({ database: makeDb(), getStatus: () => ({}), token: 'token', ...callbacks });
    const headers = { 'X-Local-Token': 'token' };

    await expect(handler({ method: 'POST', path: '/api/local/order/print-bill', headers, body: JSON.stringify({ orderId: 'o1' }) })).resolves.toMatchObject({ status: 200 });
    await expect(handler({ method: 'POST', path: '/api/local/order/settle', headers, body: JSON.stringify({ orderId: 'o1', method: 'CASH' }) })).resolves.toMatchObject({ status: 200 });
    await expect(handler({ method: 'POST', path: '/api/local/order/cancel', headers, body: JSON.stringify({ orderId: 'o1', requestId: 'cancel-1' }) })).resolves.toMatchObject({ status: 200 });
    expect(callbacks.onPrintBill).toHaveBeenCalledWith('o1', { orderId: 'o1' });
    expect(callbacks.onSettle).toHaveBeenCalledWith('o1', { orderId: 'o1', method: 'CASH' });
    expect(callbacks.onCancel).toHaveBeenCalledWith('o1', 'cancel-1');
  });
});
