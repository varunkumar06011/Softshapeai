import { describe, expect, it, vi } from 'vitest';
import { createCashierHubClient } from '../captainClient';

describe('Cashier hub client', () => {
  it('sends authenticated local requests to the Android Cashier hub', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    const client = createCashierHubClient({ baseUrl: 'http://192.168.1.20:3101', token: 'captain-token', fetchImpl });

    await client.createOrder({ tableId: 'table-1', items: [] });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://192.168.1.20:3101/api/local/order',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Local-Token': 'captain-token' }),
        body: JSON.stringify({ tableId: 'table-1', items: [] }),
      }),
    );
  });

  it('exposes status codes and server errors to the caller', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Pairing required' }) }));
    const client = createCashierHubClient({ baseUrl: 'http://192.168.1.20:3101', fetchImpl });

    await expect(client.menu()).rejects.toMatchObject({ status: 401, message: 'Pairing required' });
  });

  it('rejects an empty hub address before making a request', () => {
    expect(() => createCashierHubClient({ baseUrl: '' })).toThrow('Cashier hub address is required');
  });
});
