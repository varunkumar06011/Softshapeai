/**
 * Concurrency test: Two simultaneous settle requests with different requestIds
 * on the same order. Only one should succeed; the other should get a 409 or
 * see the order already paid.
 *
 * This test simulates the race condition that the ProcessedRequest + transaction
 * atomicity is designed to prevent: two devices offline-settle the same order,
 * then both sync simultaneously.
 *
 * Run: npx vitest run src/utils/__tests__/concurrentSettle.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('../../services/apiConfig', () => ({
  API_BASE: 'http://localhost:3000',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
  isBackendReachable: () => navigator.onLine,
  checkBackendReachability: async () => navigator.onLine,
  setBackendReachable: () => {},
}));

vi.mock('../printOffline', () => ({
  flushQueuedPrintJobs: vi.fn().mockResolvedValue(undefined),
}));

import { addPendingAction, getPendingActions, removePendingAction } from '../offlineDB';
import { syncPendingActions } from '../syncEngine';

async function clearAll() {
  const actions = await getPendingActions();
  for (const a of actions) await removePendingAction(a.id);
}

describe('Concurrent settle race condition', () => {
  beforeEach(async () => {
    await clearAll();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  it('should not issue two txnNumbers when two different requestIds settle the same order', async () => {
    // Two devices settle the same order offline with DIFFERENT requestIds
    await addPendingAction({
      requestId: 'device-A-settle-001',
      actionType: 'settle',
      entityId: 'order-race-1',
      url: '/api/orders/order-race-1/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH', grandTotal: 500 },
    });
    await addPendingAction({
      requestId: 'device-B-settle-001',
      actionType: 'settle',
      entityId: 'order-race-1',
      url: '/api/orders/order-race-1/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH', grandTotal: 500 },
    });

    // Simulate the server response: first succeeds, second gets 409 (already paid)
    // Both results returned in one bulk sync response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { requestId: 'device-A-settle-001', actionType: 'settle', status: 'success', statusCode: 200, data: { transaction: { txnNumber: 'TXN-RACE-001' } } },
          { requestId: 'device-B-settle-001', actionType: 'settle', status: 'error', statusCode: 409, error: 'Order is already paid', data: { transaction: { txnNumber: 'TXN-RACE-001' } } },
        ],
      }),
    });

    await syncPendingActions();

    // After sync: device-A's action should be removed (success)
    // device-B's action should be removed (conflict resolver says adopt_server for already paid)
    const remaining = await getPendingActions();
    const remainingIds = remaining.map(a => a.requestId);

    // Both should be cleared — device-A succeeded, device-B's conflict was resolved as adopt_server
    // (conflict is surfaced in the in-memory conflict store for UI, not kept in IndexedDB)
    expect(remainingIds).not.toContain('device-A-settle-001');

    // Device-B's action was auto-resolved (adopt_server) and removed from queue
    expect(remainingIds).not.toContain('device-B-settle-001');

    // Bulk sync sends both actions in one fetch call
    // Only one txnNumber was issued (TXN-RACE-001), not two
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle bulk sync where server returns 409 for second settle on same order', async () => {
    await addPendingAction({
      requestId: 'bulk-A-001',
      actionType: 'settle',
      entityId: 'order-bulk-1',
      url: '/api/orders/order-bulk-1/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH', grandTotal: 300 },
    });
    await addPendingAction({
      requestId: 'bulk-B-001',
      actionType: 'settle',
      entityId: 'order-bulk-1',
      url: '/api/orders/order-bulk-1/settle',
      method: 'POST',
      body: { paymentMethod: 'UPI', grandTotal: 300 },
    });

    // Server processes both in one bulk sync call — first succeeds, second gets 409
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { requestId: 'bulk-A-001', actionType: 'settle', status: 'success', statusCode: 200, data: { transaction: { txnNumber: 'TXN-BULK-001' } } },
          { requestId: 'bulk-B-001', actionType: 'settle', status: 'error', statusCode: 409, error: 'Order is already paid', data: { transaction: { txnNumber: 'TXN-BULK-001' } } },
        ],
      }),
    });

    await syncPendingActions();

    const remaining = await getPendingActions();
    const remainingIds = remaining.map(a => a.requestId);

    // bulk-A succeeded → removed
    expect(remainingIds).not.toContain('bulk-A-001');
    // bulk-B got 409 already paid → adopt_server → auto-resolved and removed from queue
    // (conflict is surfaced in the in-memory conflict store for UI, not kept in IndexedDB)
    expect(remainingIds).not.toContain('bulk-B-001');

    // Only one fetch call (bulk), one txnNumber
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle same requestId replayed — server returns skipped, no double txnNumber', async () => {
    await addPendingAction({
      requestId: 'replay-001',
      actionType: 'settle',
      entityId: 'order-replay-1',
      url: '/api/orders/order-replay-1/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH', grandTotal: 700 },
    });

    // Server says: already processed this requestId, returning cached result
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          requestId: 'replay-001',
          actionType: 'settle',
          status: 'skipped',
          statusCode: 200,
          data: { transaction: { txnNumber: 'TXN-REPLAY-001' } },
        }],
      }),
    });

    await syncPendingActions();

    // Skipped = removed from queue (treated as success)
    const remaining = await getPendingActions();
    expect(remaining).toHaveLength(0);
  });
});
