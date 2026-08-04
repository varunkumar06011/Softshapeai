/**
 * Unit tests for offlineDB.js — IndexedDB wrapper for offline actions.
 * Run: npx vitest run src/utils/__tests__/offlineDB.test.js
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import {
  addPendingAction,
  getPendingActions,
  getPendingActionsByEntity,
  updatePendingAction,
  removePendingAction,
  getPendingActionByRequestId,
  getPendingCount,
  pruneOldPendingActions,
  cacheMenu,
  getCachedMenu,
  cacheTables,
  getCachedTables,
  addOfflineTransaction,
  getOfflineTransactions,
  markOfflineTransactionSynced,
  cacheOfflineTable,
  getOfflineTables,
  addOfflinePrintJob,
  getOfflinePrintJobs,
  updateOfflinePrintJob,
  cacheAuth,
  getCachedAuth,
  clearCachedAuth,
  getSyncMeta,
  setSyncMeta,
} from '../offlineDB';

describe('offlineDB — pendingActions', () => {
  beforeEach(async () => {
    // Clear all pending actions before each test
    const actions = await getPendingActions();
    for (const a of actions) {
      await removePendingAction(a.id);
    }
  });

  it('should add and retrieve a pending action', async () => {
    await addPendingAction({
      requestId: 'req-1',
      actionType: 'create-order',
      entityId: 'order-1',
      url: '/api/orders',
      method: 'POST',
      body: { tableId: 't1', items: [] },
    });

    const actions = await getPendingActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].requestId).toBe('req-1');
    expect(actions[0].status).toBe('pending');
    expect(actions[0].attempts).toBe(0);
    expect(actions[0].createdAt).toBeTypeOf('number');
  });

  it('should retrieve actions by entity, sorted by createdAt', async () => {
    await addPendingAction({ requestId: 'r1', actionType: 'create-order', entityId: 'e1', url: '/', method: 'POST', body: {} });
    await new Promise(r => setTimeout(r, 5));
    await addPendingAction({ requestId: 'r2', actionType: 'update-items', entityId: 'e1', url: '/', method: 'PATCH', body: {} });
    await new Promise(r => setTimeout(r, 5));
    await addPendingAction({ requestId: 'r3', actionType: 'create-order', entityId: 'e2', url: '/', method: 'POST', body: {} });

    const e1Actions = await getPendingActionsByEntity('e1');
    expect(e1Actions).toHaveLength(2);
    expect(e1Actions[0].requestId).toBe('r1');
    expect(e1Actions[1].requestId).toBe('r2');
  });

  it('should update a pending action', async () => {
    await addPendingAction({ requestId: 'r1', actionType: 'settle', entityId: 'e1', url: '/', method: 'POST', body: {} });
    const actions = await getPendingActions();
    const id = actions[0].id;

    await updatePendingAction(id, { status: 'error', lastError: 'Network failed', attempts: 3 });

    const updated = await getPendingActionByRequestId('r1');
    expect(updated.status).toBe('error');
    expect(updated.lastError).toBe('Network failed');
    expect(updated.attempts).toBe(3);
  });

  it('should remove a pending action', async () => {
    await addPendingAction({ requestId: 'r1', actionType: 'settle', entityId: 'e1', url: '/', method: 'POST', body: {} });
    const actions = await getPendingActions();
    const id = actions[0].id;

    await removePendingAction(id);
    const after = await getPendingActions();
    expect(after).toHaveLength(0);
  });

  it('should count pending actions', async () => {
    await addPendingAction({ requestId: 'r1', actionType: 'a', entityId: 'e1', url: '/', method: 'POST', body: {} });
    await addPendingAction({ requestId: 'r2', actionType: 'b', entityId: 'e2', url: '/', method: 'POST', body: {} });

    const count = await getPendingCount();
    expect(count).toBe(2);
  });

  it('should find action by requestId', async () => {
    await addPendingAction({ requestId: 'unique-req-123', actionType: 'settle', entityId: 'e1', url: '/', method: 'POST', body: {} });

    const found = await getPendingActionByRequestId('unique-req-123');
    expect(found).not.toBeNull();
    expect(found.requestId).toBe('unique-req-123');

    const notFound = await getPendingActionByRequestId('nonexistent');
    expect(notFound).toBeNull();
  });

  it('should prune old synced actions but keep pending ones', async () => {
    const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
    await addPendingAction({ requestId: 'old-synced', actionType: 'a', entityId: 'e1', url: '/', method: 'POST', body: {}, status: 'synced', createdAt: oldTime });
    await addPendingAction({ requestId: 'old-pending', actionType: 'b', entityId: 'e2', url: '/', method: 'POST', body: {}, status: 'pending', createdAt: oldTime });
    await addPendingAction({ requestId: 'fresh', actionType: 'c', entityId: 'e3', url: '/', method: 'POST', body: {} });

    await pruneOldPendingActions(7 * 24 * 60 * 60 * 1000);

    const remaining = await getPendingActions();
    const ids = remaining.map(a => a.requestId);
    expect(ids).not.toContain('old-synced');
    expect(ids).toContain('old-pending');
    expect(ids).toContain('fresh');
  });
});

describe('offlineDB — menuCache', () => {
  it('should cache and retrieve menu', async () => {
    const items = [{ id: 'm1', name: 'Biryani', price: 200 }];
    await cacheMenu('rest-1', items);

    const cached = await getCachedMenu('rest-1');
    expect(cached).toEqual(items);
  });

  it('should return null for uncached menu', async () => {
    const cached = await getCachedMenu('nonexistent');
    expect(cached).toBeNull();
  });
});

describe('offlineDB — tableCache', () => {
  it('should cache and retrieve tables', async () => {
    const tables = [{ id: 't1', number: 1, status: 'OCCUPIED' }];
    await cacheTables('rest-1', tables);

    const cached = await getCachedTables('rest-1');
    expect(cached).toEqual(tables);
  });
});

describe('offlineDB — offlineTransactions', () => {
  it('should add and retrieve offline transactions', async () => {
    await addOfflineTransaction({ localId: 'lt1', orderId: 'o1', amount: 500, method: 'CASH' });

    const txns = await getOfflineTransactions();
    expect(txns).toHaveLength(1);
    expect(txns[0].localId).toBe('lt1');
    expect(txns[0].synced).toBe(false);
  });

  it('should mark transaction as synced', async () => {
    await addOfflineTransaction({ localId: 'lt2', orderId: 'o2', amount: 300, method: 'UPI' });

    await markOfflineTransactionSynced('lt2', { txnNumber: 'TXN001' });

    const txns = await getOfflineTransactions();
    const synced = txns.find(t => t.localId === 'lt2');
    expect(synced.synced).toBe(true);
    expect(synced.serverData.txnNumber).toBe('TXN001');
    expect(synced.syncedAt).toBeTypeOf('number');
  });
});

describe('offlineDB — offlineTables', () => {
  it('should cache and retrieve offline tables', async () => {
    await cacheOfflineTable({ tableId: 't1', number: 5, status: 'OCCUPIED' });

    const tables = await getOfflineTables();
    expect(tables).toHaveLength(1);
    expect(tables[0].tableId).toBe('t1');
  });
});

describe('offlineDB — offlinePrintJobs', () => {
  it('should add and retrieve print jobs', async () => {
    await addOfflinePrintJob({ orderId: 'o1', jobType: 'KOT', text: 'KOT content' });

    const jobs = await getOfflinePrintJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('pending');
  });

  it('should update print job status', async () => {
    await addOfflinePrintJob({ orderId: 'o2', jobType: 'BILL', text: 'Bill content' });
    const jobs = await getOfflinePrintJobs();
    const id = jobs[0].id;

    await updateOfflinePrintJob(id, { status: 'printed', printedAt: Date.now() });

    const updated = await getOfflinePrintJobs();
    const job = updated.find(j => j.id === id);
    expect(job.status).toBe('printed');
  });
});

describe('offlineDB — authCache', () => {
  it('should cache and retrieve auth data', async () => {
    await cacheAuth('firebase-token', { token: 'abc123', uid: 'u1' });

    const data = await getCachedAuth('firebase-token');
    expect(data.token).toBe('abc123');
  });

  it('should clear auth cache', async () => {
    await cacheAuth('session', { user: 'test' });
    await clearCachedAuth('session');

    const data = await getCachedAuth('session');
    expect(data).toBeNull();
  });
});

describe('offlineDB — syncMeta', () => {
  it('should set and get sync metadata', async () => {
    await setSyncMeta('lastSyncAt', 1234567890);

    const value = await getSyncMeta('lastSyncAt');
    expect(value).toBe(1234567890);
  });

  it('should return null for unset metadata', async () => {
    const value = await getSyncMeta('nonexistent');
    expect(value).toBeNull();
  });
});
