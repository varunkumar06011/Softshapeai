import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettlementGuards } from '../useSettlementGuards';

const mockLoadSettlementGuards = vi.fn();
const mockMarkSettledOrder = vi.fn();
const mockMarkSettledTable = vi.fn();
const mockClearSettlementGuards = vi.fn();
const mockFlushSettlementGuards = vi.fn();

vi.mock('../../utils/settlementGuardWriter', () => ({
  loadSettlementGuards: () => mockLoadSettlementGuards(),
  markSettledOrder: (id) => mockMarkSettledOrder(id),
  markSettledTable: (id) => mockMarkSettledTable(id),
  clearSettlementGuards: () => mockClearSettlementGuards(),
  flushSettlementGuards: () => mockFlushSettlementGuards(),
}));

beforeEach(() => {
  mockLoadSettlementGuards.mockResolvedValue({ orderIds: new Set(), tableIds: new Set() });
  mockMarkSettledOrder.mockReturnValue(undefined);
  mockMarkSettledTable.mockReturnValue(undefined);
  mockClearSettlementGuards.mockResolvedValue(undefined);
  mockFlushSettlementGuards.mockResolvedValue(undefined);
});

function renderHookWithProps(initialProps) {
  return renderHook(({ hasPending, lastSyncAt }) => useSettlementGuards(hasPending, lastSyncAt), {
    initialProps,
  });
}

describe('useSettlementGuards', () => {
  it('loads persisted guards on mount', async () => {
    let resolveLoad;
    mockLoadSettlementGuards.mockImplementation(() => new Promise(resolve => { resolveLoad = resolve; }));

    const { result, unmount } = renderHookWithProps({ hasPending: false, lastSyncAt: null });

    expect(result.current.settledOrderIds.size).toBe(0);

    await act(async () => {
      resolveLoad({ orderIds: new Set(['order-1']), tableIds: new Set(['table-1']) });
    });

    expect(result.current.settledOrderIds.has('order-1')).toBe(true);
    expect(result.current.settledTableIds.has('table-1')).toBe(true);
    unmount();
  });

  it('queues order IDs via the batched writer when setSettledOrderIds is called', async () => {
    const { result, unmount } = renderHookWithProps({ hasPending: false, lastSyncAt: null });

    act(() => {
      result.current.setSettledOrderIds(new Set(['order-a']));
    });

    await waitFor(() => expect(mockMarkSettledOrder).toHaveBeenCalledWith('order-a'));
    expect(mockMarkSettledOrder).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('queues table IDs via the batched writer when setSettledTableIds is called', async () => {
    const { result, unmount } = renderHookWithProps({ hasPending: false, lastSyncAt: null });

    act(() => {
      result.current.setSettledTableIds(new Set(['table-a']));
    });

    await waitFor(() => expect(mockMarkSettledTable).toHaveBeenCalledWith('table-a'));
    expect(mockMarkSettledTable).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('uses functional updater and marks each order id in the writer', async () => {
    let resolveLoad;
    mockLoadSettlementGuards.mockImplementation(() => new Promise(resolve => { resolveLoad = resolve; }));
    const { result, unmount } = renderHookWithProps({ hasPending: false, lastSyncAt: null });

    await act(async () => {
      resolveLoad({ orderIds: new Set(['order-1']), tableIds: new Set() });
    });
    expect(result.current.settledOrderIds.has('order-1')).toBe(true);

    act(() => {
      result.current.setSettledOrderIds(prev => new Set([...prev, 'order-2']));
    });

    await waitFor(() => {
      expect(mockMarkSettledOrder).toHaveBeenCalledWith('order-1');
      expect(mockMarkSettledOrder).toHaveBeenCalledWith('order-2');
    });
    unmount();
  });

  it('clears guards via the writer when all pending actions are synced', async () => {
    let resolveLoad;
    mockLoadSettlementGuards.mockImplementation(() => new Promise(resolve => { resolveLoad = resolve; }));

    const { result, rerender, unmount } = renderHookWithProps({ hasPending: true, lastSyncAt: null });

    await act(async () => {
      resolveLoad({ orderIds: new Set(['order-1']), tableIds: new Set(['table-1']) });
    });
    expect(result.current.settledOrderIds.has('order-1')).toBe(true);

    act(() => {
      rerender({ hasPending: false, lastSyncAt: Date.now() });
    });

    await waitFor(() => expect(mockClearSettlementGuards).toHaveBeenCalled());
    await waitFor(() => expect(result.current.settledOrderIds.size).toBe(0));
    await waitFor(() => expect(result.current.settledTableIds.size).toBe(0));
    unmount();
  });
});
