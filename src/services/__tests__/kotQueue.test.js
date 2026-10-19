import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// kotQueue persists entries to localStorage as JSON, so closures are lost on
// every _loadQueue(). These tests pin down that retries still reach sendFn.

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return store;
}

describe('kotQueue', () => {
  let kotQueue;

  beforeEach(async () => {
    vi.useFakeTimers();
    installLocalStorage();
    vi.resetModules();
    kotQueue = await import('../kotQueue.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseEntry = (over = {}) => ({
    requestId: 'req-1',
    tableId: 't1',
    items: [{ menuItemId: 'm1', quantity: 1 }],
    apiItems: [{ menuItemId: 'm1', quantity: 1 }],
    ...over,
  });

  it('delivers via the per-request sendFn even though entries are re-read from storage', async () => {
    const sendFn = vi.fn().mockResolvedValue({ id: 'o1' });
    const onSuccess = vi.fn();
    kotQueue.enqueueKot(baseEntry({ sendFn, onSuccess }));

    await vi.advanceTimersByTimeAsync(200);

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ id: 'o1' });
    expect(kotQueue.hasQueuedKots()).toBe(false);
  });

  it('never persists functions', () => {
    kotQueue.enqueueKot(baseEntry({ sendFn: () => {}, onSuccess: () => {} }));
    const raw = JSON.parse(localStorage.getItem('captain_kot_queue'));
    expect(raw[0].sendFn).toBeUndefined();
    expect(raw[0].onSuccess).toBeUndefined();
  });

  it('delivers an entry restored after reload through the default sendFn', async () => {
    localStorage.setItem('captain_kot_queue', JSON.stringify([{ ...baseEntry(), retryCount: 0, queuedAt: Date.now() }]));
    // Simulate app reload: fresh module, same localStorage.
    vi.resetModules();
    const fresh = await import('../kotQueue.js');
    const sendFn = vi.fn().mockResolvedValue({ id: 'o2' });
    fresh.setQueueCallbacks({ onStatusChange: () => {}, onDuplicateDetected: () => {}, sendFn });

    await vi.advanceTimersByTimeAsync(200);

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0][0].requestId).toBe('req-1');
    expect(fresh.hasQueuedKots()).toBe(false);
  });

  it('does not burn retries while no handler is registered yet', async () => {
    localStorage.setItem('captain_kot_queue', JSON.stringify([{ ...baseEntry(), retryCount: 0, queuedAt: Date.now() }]));
    const fresh = await import('../kotQueue.js');
    await vi.advanceTimersByTimeAsync(6000);
    const [entry] = fresh.getQueuedKots();
    expect(entry.retryCount || 0).toBeLessThanOrEqual(1);
  });

  it('keeps retrying on failure and increments retryCount', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('offline'));
    kotQueue.enqueueKot(baseEntry({ sendFn }));
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sendFn.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(kotQueue.getQueuedKots()[0].retryCount).toBeGreaterThanOrEqual(2);
  });

  it('pauses on a differing active order and asks once, not every tick', async () => {
    const onDuplicateDetected = vi.fn();
    kotQueue.setQueueCallbacks({ onStatusChange: () => {}, onDuplicateDetected });
    kotQueue.enqueueKot(baseEntry({
      checkDuplicate: true,
      sendFn: vi.fn(),
      fetchActiveOrder: async () => ({ id: 'o9', items: [{ menuItemId: 'other', quantity: 1 }] }),
    }));
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(11000);
    expect(onDuplicateDetected).toHaveBeenCalledTimes(1);
  });

  it('holds a KOT queued at another outlet until the captain is back there', async () => {
    const sendFn = vi.fn().mockResolvedValue({ id: 'o3' });
    localStorage.setItem('ss_user', JSON.stringify({ id: 'cap-1', restaurantId: 'outlet-lounge' }));
    kotQueue.enqueueKot(baseEntry({ restaurantId: 'outlet-lounge', sendFn }));
    // Captain logs out and logs in at the restaurant before it was sent.
    localStorage.setItem('ss_user', JSON.stringify({ id: 'cap-1', restaurantId: 'outlet-resto' }));
    await vi.advanceTimersByTimeAsync(11000);
    expect(sendFn).not.toHaveBeenCalled();
    expect(kotQueue.hasQueuedKots()).toBe(true);

    localStorage.setItem('ss_user', JSON.stringify({ id: 'cap-1', restaurantId: 'outlet-lounge' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(kotQueue.hasQueuedKots()).toBe(false);
  });
});
