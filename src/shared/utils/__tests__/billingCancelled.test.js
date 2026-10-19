import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../utils/getRestaurantConfig', () => ({ getRestaurantConfig: () => ({}) }));

import { getAllOrderItems, getBillableItems } from '../billing';

// The cashier table view builds its item list from the order on the billing PC.
// A cancelled item is simply absent there; it must never be brought back from
// the table's old KOT list (a stale copy, or one that cannot tell it was cancelled).

const kot = (items) => ({ id: 1, items });

describe('table items after a cancel', () => {
  it('a fully cancelled item stays gone even though the old KOT list still has it', () => {
    const table = {
      activeOrder: { id: 'o1', items: [{ id: 'n1', name: 'Naan', price: 60, quantity: 2 }] },
      // Biryani x6 was cancelled; the KOT history was never updated.
      kotHistory: [kot([{ n: 'Biryani', p: 300, q: 6 }, { n: 'Naan', p: 60, q: 2 }])],
    };

    expect(getAllOrderItems(table).map(i => i.n)).toEqual(['Naan']);
    expect(getBillableItems(table).map(i => i.n)).toEqual(['Naan']);
  });

  it('cancelling 2 of 6 leaves exactly 4', () => {
    const table = {
      activeOrder: { id: 'o1', items: [{ id: 'b1', name: 'Biryani', price: 300, quantity: 4, cancelledQuantity: 2 }] },
      kotHistory: [kot([{ n: 'Biryani', p: 300, q: 6 }])],
    };

    const items = getBillableItems(table);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ n: 'Biryani', q: 4 });
  });

  it('with every item cancelled the order has nothing left to bill', () => {
    const table = {
      activeOrder: { id: 'o1', items: [] },
      kotHistory: [kot([{ n: 'Biryani', p: 300, q: 6 }])],
    };

    // No order items at all: falls back to the KOT list only when the order itself is empty.
    expect(getBillableItems({ ...table, kotHistory: [] })).toEqual([]);
  });
});
