/**
 * Unit tests for conflictResolver.js — conflict resolution policies.
 * Run: npx vitest run src/utils/__tests__/conflictResolver.test.js
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  resolveConflict,
  resolveConflictsBatch,
  getConflicts,
  addConflict,
  clearConflict,
  clearAllConflicts,
  subscribeConflicts,
} from '../conflictResolver';

describe('conflictResolver — resolveConflict', () => {
  it('create-order: adopt_server on skipped/200', () => {
    const action = { actionType: 'create-order' };
    const result = { status: 'skipped', statusCode: 200 };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('adopt_server');
    expect(res.alertLevel).toBe('info');
  });

  it('create-order: adopt_server on 409', () => {
    const action = { actionType: 'create-order' };
    const result = { status: 'conflict', statusCode: 409, error: 'Table already has order' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('adopt_server');
    expect(res.alertLevel).toBe('warning');
  });

  it('create-order: manual on unknown error', () => {
    const action = { actionType: 'create-order' };
    const result = { status: 'error', error: 'Network failed' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('manual');
    expect(res.alertLevel).toBe('error');
  });

  it('update-items: skip on already applied', () => {
    const action = { actionType: 'update-items' };
    const result = { status: 'skipped' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('skip');
  });

  it('update-items: manual when item conflicts detected', () => {
    const action = { actionType: 'update-items' };
    const result = { status: 'conflict', statusCode: 409, error: 'Order modified' };
    const context = {
      serverOrder: { items: [{ menuItemId: 'm1', name: 'Biryani', quantity: 3 }] },
      localOrder: { items: [{ menuItemId: 'm1', name: 'Biryani', quantity: 2 }] },
    };
    const res = resolveConflict(action, result, context);
    expect(res.resolution).toBe('manual');
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].localQty).toBe(2);
    expect(res.conflicts[0].serverQty).toBe(3);
  });

  it('update-items: adopt_server on 409 without context', () => {
    const action = { actionType: 'update-items' };
    const result = { status: 'conflict', statusCode: 409, error: 'Modified' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('adopt_server');
  });

  it('print-bill: skip when already paid', () => {
    const action = { actionType: 'print-bill' };
    const result = { status: 'conflict', statusCode: 409, error: 'Order is already paid' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('skip');
    expect(res.alertLevel).toBe('warning');
  });

  it('print-bill: adopt_server when bill number available', () => {
    const action = { actionType: 'print-bill' };
    const result = { status: 'conflict', statusCode: 409, error: 'Already printed', data: { billNumber: 'BL001' } };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('adopt_server');
    expect(res.message).toContain('BL001');
  });

  it('settle: adopt_server when already paid by another device', () => {
    const action = { actionType: 'settle' };
    const result = { status: 'conflict', statusCode: 409, error: 'Order is already paid', data: { transaction: { txnNumber: 'TXN001' } } };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('adopt_server');
    expect(res.message).toContain('TXN001');
  });

  it('settle: manual on bill total mismatch', () => {
    const action = { actionType: 'settle' };
    const result = { status: 'conflict', statusCode: 409, error: 'Bill total mismatch' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('manual');
    expect(res.alertLevel).toBe('error');
  });

  it('settle: skip on already settled (skipped status)', () => {
    const action = { actionType: 'settle' };
    const result = { status: 'skipped', data: { transaction: { txnNumber: 'TXN999' } } };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('skip');
    expect(res.message).toContain('TXN999');
  });

  it('cancel-items: skip when order already paid', () => {
    const action = { actionType: 'cancel-items' };
    const result = { status: 'conflict', statusCode: 409, error: 'Order is already paid' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('skip');
  });

  it('cancel-items: adopt_server on generic 409', () => {
    const action = { actionType: 'cancel-items' };
    const result = { status: 'conflict', statusCode: 409, error: 'Order is not active' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('adopt_server');
  });

  it('transfer-items: manual on 409', () => {
    const action = { actionType: 'transfer-items' };
    const result = { status: 'conflict', statusCode: 409, error: 'Table modified' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('manual');
  });

  it('bill-edit: manual on 409', () => {
    const action = { actionType: 'bill-edit' };
    const result = { status: 'conflict', statusCode: 409, error: 'Order modified' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('manual');
  });

  it('unknown actionType: manual', () => {
    const action = { actionType: 'unknown-action' };
    const result = { status: 'error', error: 'Something' };
    const res = resolveConflict(action, result);
    expect(res.resolution).toBe('manual');
    expect(res.message).toContain('unknown-action');
  });
});

describe('conflictResolver — resolveConflictsBatch', () => {
  it('should skip successful actions and resolve conflicts', () => {
    const actions = [
      { id: 1, requestId: 'r1', actionType: 'create-order' },
      { id: 2, requestId: 'r2', actionType: 'settle' },
      { id: 3, requestId: 'r3', actionType: 'print-bill' },
    ];
    const results = [
      { status: 'success' },
      { status: 'conflict', statusCode: 409, error: 'Order is already paid', data: { transaction: { txnNumber: 'T1' } } },
      { status: 'success' },
    ];

    const resolutions = resolveConflictsBatch(actions, results);
    expect(resolutions).toHaveLength(1); // Only the conflict
    expect(resolutions[0].actionId).toBe(2);
    expect(resolutions[0].resolution).toBe('adopt_server');
  });
});

describe('conflictResolver — conflict store', () => {
  beforeEach(() => {
    clearAllConflicts();
  });

  it('should add and retrieve conflicts', () => {
    addConflict({ actionId: 1, requestId: 'r1', actionType: 'settle', resolution: 'manual', message: 'Test' });
    const conflicts = getConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].actionId).toBe(1);
  });

  it('should clear a specific conflict', () => {
    addConflict({ actionId: 1, requestId: 'r1', actionType: 'settle', resolution: 'manual', message: 'A' });
    addConflict({ actionId: 2, requestId: 'r2', actionType: 'settle', resolution: 'manual', message: 'B' });

    clearConflict(1);
    const conflicts = getConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].actionId).toBe(2);
  });

  it('should clear all conflicts', () => {
    addConflict({ actionId: 1, requestId: 'r1', actionType: 'a', resolution: 'manual', message: 'A' });
    addConflict({ actionId: 2, requestId: 'r2', actionType: 'b', resolution: 'manual', message: 'B' });

    clearAllConflicts();
    expect(getConflicts()).toHaveLength(0);
  });

  it('should notify subscribers on conflict changes', () => {
    let latest = null;
    const unsubscribe = subscribeConflicts(c => { latest = c; });

    addConflict({ actionId: 1, requestId: 'r1', actionType: 'a', resolution: 'manual', message: 'X' });
    expect(latest).toHaveLength(1);

    clearAllConflicts();
    expect(latest).toHaveLength(0);

    unsubscribe();
  });
});
