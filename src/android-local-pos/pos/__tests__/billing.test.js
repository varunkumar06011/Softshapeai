import { describe, expect, it } from 'vitest';
import { calculateLocalBill, createLocalOrderDraft, normalizeLocalItems } from '../billing';

describe('Android Local POS billing', () => {
  it('matches the existing billing rules for GST, discount, service charge, and rounding', () => {
    const result = calculateLocalBill([
      { menuItemId: 'food-1', name: 'Food', price: 100, quantity: 2, menuType: 'FOOD' },
      { menuItemId: 'drink-1', name: 'Drink', price: 50, quantity: 1, menuType: 'LIQUOR', gstEnabled: false },
    ], {
      discountPercent: 10,
      config: {
        gstCategory: 'NON_AC',
        gstRegistered: true,
        gstRate: 5,
        serviceChargePercent: 5,
      },
    });

    expect(result.rawSubtotal).toBe(250);
    expect(result.discountAmount).toBe(25);
    expect(result.cgst).toBeCloseTo(4.5);
    expect(result.sgst).toBeCloseTo(4.5);
    expect(result.serviceChargeAmount).toBeCloseTo(11.7);
    expect(result.grandTotal).toBe(246);
    expect(result.roundOff).toBeCloseTo(0.3);
  });

  it('rejects malformed items before any local write can occur', () => {
    expect(() => normalizeLocalItems([{ name: 'Missing ID', price: 10, quantity: 1 }]))
      .toThrow('missing menuItemId');
    expect(() => normalizeLocalItems([{ menuItemId: 'm1', name: 'Bad quantity', price: 10, quantity: 0 }]))
      .toThrow('invalid quantity');
    expect(() => calculateLocalBill([], { discountPercent: 101 }))
      .toThrow('between 0 and 100');
  });

  it('creates an idempotent-ready local order draft with local KOT identity', () => {
    const draft = createLocalOrderDraft({
      orderId: 'order-1',
      requestId: 'request-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      tableNumber: 4,
      items: [{ menuItemId: 'm1', name: 'Biryani', price: 200, quantity: 2 }],
      kotNumber: 17,
      counterDate: '2026-08-24',
      config: { gstCategory: 'NON_AC', gstRegistered: false },
    });

    expect(draft.order).toMatchObject({
      id: 'order-1',
      status: 'PREPARING',
      requestId: 'request-1',
      totalAmount: 400,
      cloudSynced: false,
    });
    expect(draft.kot).toMatchObject({ id: 'kot-request-1', kotNumber: 17, counterDate: '2026-08-24' });
  });
});
