/**
 * Unit tests for syncEngine.js — offline sync orchestration.
 * Run: npx vitest run src/utils/__tests__/syncEngine.test.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Mock apiConfig before importing syncEngine
vi.mock('../../services/apiConfig', () => ({
  API_BASE: 'http://localhost:3000',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

// Mock printOffline dynamic import
vi.mock('../printOffline', () => ({
  flushQueuedPrintJobs: vi.fn().mockResolvedValue(undefined),
}));

import {
  getSyncStatus,
  subscribeSyncStatus,
  syncPendingActions,
  initSyncEngine,
  stopSyncEngine,
  isDuplicateRequest,
} from '../syncEngine';

import {
  addPendingAction,
  getPendingActions,
  removePendingAction,
  getPendingCount,
} from '../offlineDB';

describe('syncEngine — status tracking', () => {
  it('should return initial sync status', () => {
    const status = getSyncStatus();
    expect(status).toHaveProperty('syncStatus');
    expect(status).toHaveProperty('pendingCount');
    expect(status).toHaveProperty('lastSyncAt');
    expect(status).toHaveProperty('lastError');
  });

  it('should notify subscribers on status change', () => {
    let receivedStatus = null;
    const unsubscribe = subscribeSyncStatus(s => { receivedStatus = s; });
    expect(receivedStatus).not.toBeNull();

    unsubscribe();
  });
});

describe('syncEngine — isDuplicateRequest', () => {
  beforeEach(async () => {
    const actions = await getPendingActions();
    for (const a of actions) {
      await removePendingAction(a.id);
    }
  });

  it('should return false for non-duplicate request', async () => {
    const dup = await isDuplicateRequest('unique-req-999');
    expect(dup).toBe(false);
  });

  it('should return true for duplicate request', async () => {
    await addPendingAction({
      requestId: 'dup-req-1',
      actionType: 'settle',
      entityId: 'e1',
      url: '/api/orders/e1/settle',
      method: 'POST',
      body: {},
    });

    const dup = await isDuplicateRequest('dup-req-1');
    expect(dup).toBe(true);
  });

  it('should return false for empty requestId', async () => {
    const dup = await isDuplicateRequest('');
    expect(dup).toBe(false);
  });
});

describe('syncEngine — syncPendingActions', () => {
  beforeEach(async () => {
    const actions = await getPendingActions();
    for (const a of actions) {
      await removePendingAction(a.id);
    }
    // Ensure navigator.onLine is true
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  });

  it('should do nothing when no pending actions', async () => {
    const count = await getPendingCount();
    expect(count).toBe(0);

    await syncPendingActions();
    const status = getSyncStatus();
    expect(status.syncStatus).toBe('idle');
  });

  it('should not sync when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });

    await addPendingAction({
      requestId: 'r-offline',
      actionType: 'settle',
      entityId: 'e1',
      url: '/api/orders/e1/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH' },
    });

    await syncPendingActions();

    // Action should still be pending
    const count = await getPendingCount();
    expect(count).toBe(1);
  });

  it('should sync actions via bulk sync and remove succeeded ones', async () => {
    // Mock fetch for bulk sync
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { requestId: 'r1', actionType: 'settle', status: 'success', statusCode: 200, data: { ok: true } },
        ],
      }),
    });
    global.fetch = mockFetch;

    await addPendingAction({
      requestId: 'r1',
      actionType: 'settle',
      entityId: 'e1',
      url: '/api/orders/e1/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH' },
    });

    await syncPendingActions();

    const count = await getPendingCount();
    expect(count).toBe(0); // Action removed after success

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('/api/orders/offline-sync');
  });

  it('should handle 409 conflict and keep action in conflict state', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { requestId: 'r2', actionType: 'settle', status: 'error', statusCode: 409, error: 'Bill total mismatch — please refresh and retry' },
        ],
      }),
    });
    global.fetch = mockFetch;

    await addPendingAction({
      requestId: 'r2',
      actionType: 'settle',
      entityId: 'e2',
      url: '/api/orders/e2/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH' },
    });

    await syncPendingActions();

    // Action should still be in DB (conflict, not removed)
    const count = await getPendingCount();
    expect(count).toBe(1);
  });

  it('should handle bulk sync failure and fall back to individual sync', async () => {
    // First call (bulk) fails, second call (individual) succeeds
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    global.fetch = mockFetch;

    await addPendingAction({
      requestId: 'r3',
      actionType: 'settle',
      entityId: 'e3',
      url: '/api/orders/e3/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH' },
    });

    await syncPendingActions();

    // Should have been synced via individual fallback
    const count = await getPendingCount();
    expect(count).toBe(0);
  });

  it('should match out-of-order bulk-sync results by requestId (regression)', async () => {
    // Backend processes entity groups concurrently and can return results in any order.
    // This test simulates a reversed result order and asserts that the frontend still
    // applies each result to the correct pending action.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          // Results returned in reverse order relative to the actions queued below
          { requestId: 'settle-B', actionType: 'settle', status: 'error', statusCode: 500, error: 'Settle failed' },
          { requestId: 'create-A', actionType: 'create-order', status: 'success', statusCode: 200, data: { id: 'order-A' } },
        ],
      }),
    });
    global.fetch = mockFetch;

    await addPendingAction({
      requestId: 'create-A',
      actionType: 'create-order',
      entityId: 'table-A',
      url: '/api/orders',
      method: 'POST',
      body: { tableId: 'table-A', items: [] },
    });

    await addPendingAction({
      requestId: 'settle-B',
      actionType: 'settle',
      entityId: 'table-B',
      url: '/api/orders/table-B/settle',
      method: 'POST',
      body: { paymentMethod: 'CASH' },
    });

    await syncPendingActions();

    // create-A succeeded (matched by requestId), settle-B errored (matched by requestId)
    const remaining = await getPendingActions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].requestId).toBe('settle-B');
    expect(remaining[0].actionType).toBe('settle');
  });
});

describe('syncEngine — init/stop', () => {
  beforeEach(() => {
    // Provide minimal window mock if not available (vitest default env)
    if (typeof global.window === 'undefined') {
      global.window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }
    global.setInterval = vi.fn(() => 12345);
    global.clearInterval = vi.fn();
  });

  it('should initialize and stop without errors', () => {
    initSyncEngine();
    stopSyncEngine();
  });

  it('should not double-initialize', () => {
    initSyncEngine();
    initSyncEngine(); // Should be no-op
    stopSyncEngine();
  });
});
