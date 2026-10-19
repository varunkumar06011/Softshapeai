import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// pendingKots remembers a captain KOT that failed to send, per table, so the
// next send from that table carries the first-attempt time (the billing PC then
// refuses food added since). It must be per outlet + captain and must expire.

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('pendingKots', () => {
  let pk;

  beforeEach(async () => {
    vi.useFakeTimers();
    installLocalStorage();
    localStorage.setItem('ss_user', JSON.stringify({ id: 'cap-1', restaurantId: 'outlet-lounge' }));
    vi.resetModules();
    pk = await import('../pendingKots.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const entry = (over = {}) => ({ requestId: 'r1', firstAttemptAt: Date.now(), itemsKey: 'k', tableLabel: '5', itemCount: 2, ...over });

  it('same items in any order give the same key; changed quantity or notes do not', () => {
    const a = [{ menuItemId: 'm1', quantity: 1 }, { menuItemId: 'm2', quantity: 2, notes: 'less spicy' }];
    const b = [{ menuItemId: 'm2', quantity: 2, notes: 'less spicy' }, { menuItemId: 'm1', quantity: 1 }];
    expect(pk.kotItemsKey(a)).toBe(pk.kotItemsKey(b));
    expect(pk.kotItemsKey(a)).not.toBe(pk.kotItemsKey([{ menuItemId: 'm1', quantity: 2 }, a[1]]));
    expect(pk.kotItemsKey(a)).not.toBe(pk.kotItemsKey([a[0], { ...a[1], notes: null }]));
  });

  it('is kept per table, per captain and per outlet', () => {
    pk.savePendingKot('cap-1', 't5', entry());
    expect(pk.getPendingKot('cap-1', 't5')).toMatchObject({ requestId: 'r1' });
    expect(pk.getPendingKot('cap-1', 't6')).toBeNull();
    expect(pk.getPendingKot('cap-2', 't5')).toBeNull();

    // Same captain logged in at the other outlet does not see it.
    localStorage.setItem('ss_user', JSON.stringify({ id: 'cap-1', restaurantId: 'outlet-resto' }));
    expect(pk.getPendingKot('cap-1', 't5')).toBeNull();
  });

  it('is forgotten after 30 minutes so it never blocks the next customer', () => {
    pk.savePendingKot('cap-1', 't5', entry());
    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(pk.getPendingKot('cap-1', 't5')).not.toBeNull();
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(pk.getPendingKot('cap-1', 't5')).toBeNull();
    expect(pk.getPendingKots('cap-1')).toEqual([]);
  });

  it('clears one table or everything (logout)', () => {
    pk.savePendingKot('cap-1', 't5', entry());
    pk.savePendingKot('cap-1', 't6', entry({ requestId: 'r2' }));
    pk.clearPendingKot('cap-1', 't5');
    expect(pk.getPendingKots('cap-1').map(p => p.tableId)).toEqual(['t6']);
    pk.clearAllPendingKots('cap-1');
    expect(pk.getPendingKots('cap-1')).toEqual([]);
  });
});
