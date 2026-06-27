/**
 * Integration tests: offline KOT → sync, offline final bill → sync,
 * offline settlement → sync, duplicate requestId handling.
 * Run: npx vitest run src/utils/__tests__/offlineFlows.test.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Mock apiConfig
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

import {
  addPendingAction,
  getPendingActions,
  getPendingActionByRequestId,
  removePendingAction,
  getPendingCount,
} from '../offlineDB';

import { syncPendingActions, isDuplicateRequest } from '../syncEngine';

function makeAction(requestId, actionType, entityId, url, method, body) {
  return { requestId, actionType, entityId, url, method, body };
}

async function clearAll() {
  const actions = await getPendingActions();
  for (const a of actions) await removePendingAction(a.id);
}

describe('Integration: Offline KOT → Sync', () => {
  beforeEach(async () => {
    await clearAll();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  it('should queue KOT (create-order) offline and sync when online', async () => {
    // Step 1: Queue create-order action (simulating offline KOT)
    const requestId = 'kot-req-001';
    await addPendingAction(makeAction(
      requestId,
      'create-order',
      'table-1',
      '/api/orders',
      'POST',
      { tableId: 'table-1', items: [{ menuItemId: 'm1', name: 'Biryani', quantity: 2, price: 200 }] },
    ));

    // Verify it's queued
    expect(await getPendingCount()).toBe(1);

    // Step 2: Simulate going online — bulk sync returns success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ requestId, actionType: 'create-order', status: 'success', statusCode: 200, data: { id: 'order-123', tableId: 'table-1' } }],
      }),
    });

    await syncPendingActions();

    // Step 3: Verify action was removed from queue
    expect(await getPendingCount()).toBe(0);
  });

  it('should handle duplicate KOT requestId — server returns skipped', async () => {
    const requestId = 'kot-dup-001';
    await addPendingAction(makeAction(
      requestId, 'create-order', 'table-2', '/api/orders', 'POST',
      { tableId: 'table-2', items: [] },
    ));

    // Server says: already processed (idempotent replay)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ requestId, actionType: 'create-order', status: 'skipped', statusCode: 200, data: { id: 'order-existing' } }],
      }),
    });

    await syncPendingActions();

    // Skipped actions should be removed from queue (treated as success)
    expect(await getPendingCount()).toBe(0);
  });
});

describe('Integration: Offline Final Bill → Sync', () => {
  beforeEach(async () => {
    await clearAll();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  it('should queue print-bill offline and sync when online', async () => {
    const requestId = 'bill-req-001';
    await addPendingAction(makeAction(
      requestId, 'print-bill', 'order-1', '/api/orders/order-1/print-bill', 'POST',
      { tableNumber: 'T1', discountPercent: 0 },
    ));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ requestId, actionType: 'print-bill', status: 'success', statusCode: 200, data: { billNumber: 'BL-001', grandTotal: 500 } }],
      }),
    });

    await syncPendingActions();
    expect(await getPendingCount()).toBe(0);
  });

  it('should handle bill already printed (409 conflict → skip)', async () => {
    const requestId = 'bill-req-002';
    await addPendingAction(makeAction(
      requestId, 'print-bill', 'order-2', '/api/orders/order-2/print-bill', 'POST',
      { tableNumber: 'T2' },
    ));

    // Server returns 409: already printed
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ requestId, actionType: 'print-bill', status: 'error', statusCode: 409, error: 'Order is already paid. Cannot print bill.' }],
      }),
    });

    await syncPendingActions();

    // Conflict resolver says 'skip' for already paid → action removed
    expect(await getPendingCount()).toBe(0);
  });
});

describe('Integration: Offline Settlement → Sync', () => {
  beforeEach(async () => {
    await clearAll();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  it('should queue settle offline and sync when online', async () => {
    const requestId = 'settle-req-001';
    await addPendingAction(makeAction(
      requestId, 'settle', 'order-1', '/api/orders/order-1/settle', 'POST',
      { paymentMethod: 'CASH', grandTotal: 500 },
    ));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ requestId, actionType: 'settle', status: 'success', statusCode: 200, data: { transaction: { txnNumber: 'TXN-001' } } }],
      }),
    });

    await syncPendingActions();
    expect(await getPendingCount()).toBe(0);
  });

  it('should handle settle when order already paid by another device', async () => {
    const requestId = 'settle-req-002';
    await addPendingAction(makeAction(
      requestId, 'settle', 'order-2', '/api/orders/order-2/settle', 'POST',
      { paymentMethod: 'UPI', grandTotal: 300 },
    ));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ requestId, actionType: 'settle', status: 'error', statusCode: 409, error: 'Order is already paid', data: { transaction: { txnNumber: 'TXN-OTHER' } } }],
      }),
    });

    await syncPendingActions();

    // Conflict resolver says 'adopt_server' for already paid → action kept as conflict
    // (adopt_server doesn't remove, it stays for UI surfacing)
    const count = await getPendingCount();
    expect(count).toBe(1);
  });

  it('should handle bill total mismatch (409 → manual resolution)', async () => {
    const requestId = 'settle-req-003';
    await addPendingAction(makeAction(
      requestId, 'settle', 'order-3', '/api/orders/order-3/settle', 'POST',
      { paymentMethod: 'CASH', grandTotal: 999 },
    ));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ requestId, actionType: 'settle', status: 'error', statusCode: 409, error: 'Bill total mismatch — please refresh and retry' }],
      }),
    });

    await syncPendingActions();

    // Manual resolution → action stays in queue as conflict
    expect(await getPendingCount()).toBe(1);
  });
});

describe('Integration: Duplicate requestId handling', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('should detect duplicate requestId before queuing', async () => {
    const requestId = 'dup-test-001';
    await addPendingAction(makeAction(
      requestId, 'settle', 'order-x', '/api/orders/order-x/settle', 'POST', {},
    ));

    const isDup = await isDuplicateRequest(requestId);
    expect(isDup).toBe(true);
  });

  it('should not detect unique requestId as duplicate', async () => {
    const isDup = await isDuplicateRequest('unique-' + Date.now());
    expect(isDup).toBe(false);
  });

  it('should find action by requestId after queuing', async () => {
    const requestId = 'find-test-001';
    await addPendingAction(makeAction(
      requestId, 'create-order', 'table-z', '/api/orders', 'POST', { tableId: 'table-z' },
    ));

    const found = await getPendingActionByRequestId(requestId);
    expect(found).not.toBeNull();
    expect(found.requestId).toBe(requestId);
    expect(found.actionType).toBe('create-order');
  });
});

describe('Integration: Multi-action entity ordering', () => {
  beforeEach(async () => {
    await clearAll();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  it('should sync multiple actions for same entity in order', async () => {
    // Queue: create-order → update-items → print-bill → settle (all for same table)
    await addPendingAction(makeAction('multi-1', 'create-order', 'table-multi', '/api/orders', 'POST', { tableId: 'table-multi' }));
    await new Promise(r => setTimeout(r, 5));
    await addPendingAction(makeAction('multi-2', 'update-items', 'table-multi', '/api/orders/order-multi/items', 'PATCH', { items: [{ menuItemId: 'm1', quantity: 3 }] }));
    await new Promise(r => setTimeout(r, 5));
    await addPendingAction(makeAction('multi-3', 'print-bill', 'order-multi', '/api/orders/order-multi/print-bill', 'POST', {}));
    await new Promise(r => setTimeout(r, 5));
    await addPendingAction(makeAction('multi-4', 'settle', 'order-multi', '/api/orders/order-multi/settle', 'POST', { paymentMethod: 'CASH' }));

    expect(await getPendingCount()).toBe(4);

    // Bulk sync returns success for all
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { requestId: 'multi-1', actionType: 'create-order', status: 'success', statusCode: 200, data: { id: 'order-multi' } },
          { requestId: 'multi-2', actionType: 'update-items', status: 'success', statusCode: 200, data: {} },
          { requestId: 'multi-3', actionType: 'print-bill', status: 'success', statusCode: 200, data: { billNumber: 'BL-M' } },
          { requestId: 'multi-4', actionType: 'settle', status: 'success', statusCode: 200, data: { transaction: { txnNumber: 'TXN-M' } } },
        ],
      }),
    });

    await syncPendingActions();

    // All 4 actions should be removed
    expect(await getPendingCount()).toBe(0);
  });
});
