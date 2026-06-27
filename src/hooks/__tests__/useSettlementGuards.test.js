import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettlementGuards } from '../useSettlementGuards';

const mockGetSettledOrderIds = vi.fn();
const mockSetSettledOrderIds = vi.fn();
const mockGetSettledTableIds = vi.fn();
const mockSetSettledTableIds = vi.fn();
const mockClearAll = vi.fn();

vi.mock('../../utils/offlineDB', () => ({
  getSettledOrderIds: () => mockGetSettledOrderIds(),
  setSettledOrderIds: (ids) => mockSetSettledOrderIds(ids),
  getSettledTableIds: () => mockGetSettledTableIds(),
  setSettledTableIds: (ids) => mockSetSettledTableIds(ids),
  clearAllSettlementGuards: () => mockClearAll(),
}));

beforeEach(() => {
  mockGetSettledOrderIds.mockResolvedValue(new Set());
  mockGetSettledTableIds.mockResolvedValue(new Set());
  mockSetSettledOrderIds.mockResolvedValue(undefined);
  mockSetSettledTableIds.mockResolvedValue(undefined);
  mockClearAll.mockResolvedValue(undefined);
});

function renderHookWithProps(initialProps) {
  return renderHook(({ hasPending, lastSyncAt }) => useSettlementGuards(hasPending, lastSyncAt), {
    initialProps,
  });
}

describe('useSettlementGuards', () => {
  it('loads persisted guards on mount', async () => {
    let resolveOrder, resolveTable;
    mockGetSettledOrderIds.mockImplementation(() => new Promise(resolve => { resolveOrder = resolve; }));
    mockGetSettledTableIds.mockImplementation(() => new Promise(resolve => { resolveTable = resolve; }));

    const { result, unmount } = renderHookWithProps({ hasPending: false, lastSyncAt: null });

    expect(result.current.settledOrderIds.size).toBe(0);

    await act(async () => {
      resolveOrder(new Set(['order-1']));
      resolveTable(new Set(['table-1']));
    });

    expect(result.current.settledOrderIds.has('order-1')).toBe(true);
    expect(result.current.settledTableIds.has('table-1')).toBe(true);
    unmount();
  });

  it('persists order IDs when setSettledOrderIds is called', async () => {
    const { result, unmount } = renderHookWithProps({ hasPending: false, lastSyncAt: null });

    act(() => {
      result.current.setSettledOrderIds(new Set(['order-a']));
    });

    await waitFor(() => expect(mockSetSettledOrderIds).toHaveBeenCalledWith(new Set(['order-a'])));
    expect(mockSetSettledOrderIds).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('persists table IDs when setSettledTableIds is called', async () => {
    const { result, unmount } = renderHookWithProps({ hasPending: false, lastSyncAt: null });

    act(() => {
      result.current.setSettledTableIds(new Set(['table-a']));
    });

    await waitFor(() => expect(mockSetSettledTableIds).toHaveBeenCalledWith(new Set(['table-a'])));
    expect(mockSetSettledTableIds).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('uses functional updater for setSettledOrderIds and persists the result', async () => {
    let resolveOrder;
    mockGetSettledOrderIds.mockImplementation(() => new Promise(resolve => { resolveOrder = resolve; }));
    const { result, unmount } = renderHookWithProps({ hasPending: false, lastSyncAt: null });

    await act(async () => {
      resolveOrder(new Set(['order-1']));
    });
    expect(result.current.settledOrderIds.has('order-1')).toBe(true);

    act(() => {
      result.current.setSettledOrderIds(prev => new Set([...prev, 'order-2']));
    });

    await waitFor(() =>
      expect(mockSetSettledOrderIds).toHaveBeenCalledWith(new Set(['order-1', 'order-2']))
    );
    unmount();
  });

  it('clears guards when all pending actions are synced', async () => {
    let resolveOrder, resolveTable;
    mockGetSettledOrderIds.mockImplementation(() => new Promise(resolve => { resolveOrder = resolve; }));
    mockGetSettledTableIds.mockImplementation(() => new Promise(resolve => { resolveTable = resolve; }));

    const { result, rerender, unmount } = renderHookWithProps({ hasPending: true, lastSyncAt: null });

    await act(async () => {
      resolveOrder(new Set(['order-1']));
      resolveTable(new Set(['table-1']));
    });
    expect(result.current.settledOrderIds.has('order-1')).toBe(true);

    act(() => {
      rerender({ hasPending: false, lastSyncAt: Date.now() });
    });

    await waitFor(() => expect(mockClearAll).toHaveBeenCalled());
    expect(result.current.settledOrderIds.size).toBe(0);
    expect(result.current.settledTableIds.size).toBe(0);
    unmount();
  });
});
