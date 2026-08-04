import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetSettledOrderIds = vi.fn();
const mockSetSettledOrderIds = vi.fn();
const mockGetSettledTableIds = vi.fn();
const mockSetSettledTableIds = vi.fn();
const mockGetTenantScopedKey = vi.fn((key) => `tenant:${key}`);

vi.mock('../offlineDB', () => ({
  getSettledOrderIds: () => mockGetSettledOrderIds(),
  setSettledOrderIds: (ids) => mockSetSettledOrderIds(ids),
  getSettledTableIds: () => mockGetSettledTableIds(),
  setSettledTableIds: (ids) => mockSetSettledTableIds(ids),
}));

vi.mock('../cacheKeys', () => ({
  getTenantScopedKey: (key) => mockGetTenantScopedKey(key),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettledOrderIds.mockResolvedValue(new Set());
  mockGetSettledTableIds.mockResolvedValue(new Set());
  mockSetSettledOrderIds.mockResolvedValue(undefined);
  mockSetSettledTableIds.mockResolvedValue(undefined);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

async function loadWriter() {
  // Re-import to reset module-level state after each test.
  vi.resetModules();
  const mod = await import('../settlementGuardWriter');
  return mod;
}

describe('settlementGuardWriter', () => {
  it('batches multiple order ids into a single IndexedDB write', async () => {
    const { markSettledOrder, flushSettlementGuards } = await loadWriter();

    markSettledOrder('order-1');
    markSettledOrder('order-2');
    markSettledOrder('order-3');

    await flushSettlementGuards();

    expect(mockSetSettledOrderIds).toHaveBeenCalledTimes(1);
    expect(mockSetSettledOrderIds).toHaveBeenCalledWith(new Set(['order-1', 'order-2', 'order-3']));
    expect(mockSetSettledTableIds).not.toHaveBeenCalled();
  });

  it('batches table ids separately from order ids', async () => {
    const { markSettledOrder, markSettledTable, flushSettlementGuards } = await loadWriter();

    markSettledOrder('order-a');
    markSettledTable('table-a');

    await flushSettlementGuards();

    expect(mockSetSettledOrderIds).toHaveBeenCalledWith(new Set(['order-a']));
    expect(mockSetSettledTableIds).toHaveBeenCalledWith(new Set(['table-a']));
  });

  it('debounces flushes to IndexedDB', async () => {
    const { markSettledOrder } = await loadWriter();

    markSettledOrder('order-1');
    vi.advanceTimersByTime(50);
    markSettledOrder('order-2');
    vi.advanceTimersByTime(50);
    markSettledOrder('order-3');

    // 300ms debounce should not have fired yet
    expect(mockSetSettledOrderIds).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(mockSetSettledOrderIds).toHaveBeenCalledTimes(1);
    expect(mockSetSettledOrderIds).toHaveBeenCalledWith(new Set(['order-1', 'order-2', 'order-3']));
  });

  it('writes a snapshot to localStorage so a crash can be recovered', async () => {
    const { markSettledOrder, markSettledTable } = await loadWriter();

    markSettledOrder('order-1');
    markSettledTable('table-1');

    vi.advanceTimersByTime(50);

    const snapshot = JSON.parse(localStorage.getItem('tenant:__settlement_guard_snapshot__') || '{}');
    expect(snapshot.orderIds).toContain('order-1');
    expect(snapshot.tableIds).toContain('table-1');
  });

  it('restores from snapshot when IndexedDB is empty', async () => {
    mockGetSettledOrderIds.mockResolvedValue(new Set());
    mockGetSettledTableIds.mockResolvedValue(new Set());
    localStorage.setItem('tenant:__settlement_guard_snapshot__', JSON.stringify({
      orderIds: ['order-snap'],
      tableIds: ['table-snap'],
      ts: Date.now(),
    }));

    const { loadSettlementGuards } = await loadWriter();
    const { orderIds, tableIds } = await loadSettlementGuards();

    expect(orderIds.has('order-snap')).toBe(true);
    expect(tableIds.has('table-snap')).toBe(true);
  });

  it('prefers IndexedDB over snapshot when both have data', async () => {
    mockGetSettledOrderIds.mockResolvedValue(new Set(['order-db']));
    mockGetSettledTableIds.mockResolvedValue(new Set(['table-db']));
    localStorage.setItem('tenant:__settlement_guard_snapshot__', JSON.stringify({
      orderIds: ['order-snap'],
      tableIds: ['table-snap'],
      ts: Date.now(),
    }));

    const { loadSettlementGuards } = await loadWriter();
    const { orderIds, tableIds } = await loadSettlementGuards();

    expect(orderIds.has('order-db')).toBe(true);
    expect(orderIds.has('order-snap')).toBe(false);
    expect(tableIds.has('table-db')).toBe(true);
    expect(tableIds.has('table-snap')).toBe(false);
  });

  it('clears pending guards, snapshot, and IndexedDB on clear', async () => {
    const { markSettledOrder, markSettledTable, clearSettlementGuards } = await loadWriter();

    markSettledOrder('order-1');
    markSettledTable('table-1');
    await clearSettlementGuards();

    expect(mockSetSettledOrderIds).toHaveBeenCalledWith(new Set());
    expect(mockSetSettledTableIds).toHaveBeenCalledWith(new Set());
    expect(localStorage.getItem('tenant:__settlement_guard_snapshot__')).toBeNull();
  });
});
