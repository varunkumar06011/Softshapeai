import { calculateOrderTotal } from '../../shared/utils/billing';

const DEFAULT_CONFIG = Object.freeze({
  gstCategory: 'NON_AC',
  gstRegistered: true,
  gstRate: null,
  serviceChargePercent: 0,
});

function normalizeConfig(config = {}) {
  return {
    gstCategory: config.gstCategory ?? DEFAULT_CONFIG.gstCategory,
    gstRegistered: config.gstRegistered ?? DEFAULT_CONFIG.gstRegistered,
    gstRate: config.gstRate ?? DEFAULT_CONFIG.gstRate,
    serviceChargePercent: Number(config.serviceChargePercent ?? DEFAULT_CONFIG.serviceChargePercent),
  };
}

export function normalizeLocalItems(items = []) {
  if (!Array.isArray(items)) throw new TypeError('Order items must be an array');

  return items.map((item, index) => {
    const menuItemId = String(item.menuItemId ?? item.id ?? '').trim();
    const name = String(item.name ?? item.n ?? '').trim();
    const price = Number(item.price ?? item.p ?? 0);
    const quantity = Number(item.quantity ?? item.q ?? 0);

    if (!menuItemId) throw new Error(`Order item ${index + 1} is missing menuItemId`);
    if (!name) throw new Error(`Order item ${index + 1} is missing name`);
    if (!Number.isFinite(price) || price < 0) throw new Error(`Order item ${index + 1} has an invalid price`);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Order item ${index + 1} has an invalid quantity`);

    return {
      menuItemId,
      name,
      price,
      quantity,
      q: quantity,
      p: price,
      notes: item.notes ? String(item.notes) : null,
      menuType: String(item.menuType ?? item.type ?? 'FOOD').toUpperCase() === 'BAR' ? 'LIQUOR' : String(item.menuType ?? item.type ?? 'FOOD').toUpperCase(),
      gstEnabled: item.gstEnabled !== false,
    };
  });
}

export function calculateLocalBill(items, { discountPercent = 0, config = {} } = {}) {
  const normalizedItems = normalizeLocalItems(items);
  const discount = Number(discountPercent);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    throw new Error('Discount must be between 0 and 100 percent');
  }

  const totals = calculateOrderTotal(normalizedItems, discount, normalizeConfig(config));
  return {
    ...totals,
    discountPercent: discount,
    serviceChargePercent: normalizeConfig(config).serviceChargePercent,
    items: normalizedItems,
  };
}

export function createLocalOrderDraft({
  orderId,
  requestId,
  restaurantId,
  tableId,
  tableNumber,
  items,
  kotNumber,
  counterDate,
  captainId = null,
  createdByUserId = null,
  platform = 'DINE_IN',
  discountPercent = 0,
  config = {},
} = {}) {
  for (const [name, value] of Object.entries({ orderId, requestId, restaurantId, tableId, counterDate })) {
    if (!String(value ?? '').trim()) throw new Error(`${name} is required`);
  }
  if (!Number.isInteger(kotNumber) || kotNumber <= 0) throw new Error('kotNumber must be a positive integer');

  const bill = calculateLocalBill(items, { discountPercent, config });
  const now = Date.now();

  return {
    order: {
      id: String(orderId),
      restaurantId: String(restaurantId),
      tableId: String(tableId),
      tableNumber: tableNumber == null ? null : String(tableNumber),
      status: 'PREPARING',
      platform,
      totalAmount: bill.grandTotal,
      discountPercent: bill.discountPercent,
      discountAmount: bill.discountAmount,
      serviceChargeAmount: bill.serviceChargeAmount,
      cgst: bill.cgst,
      sgst: bill.sgst,
      roundOff: bill.roundOff,
      captainId,
      createdByUserId,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      requestId: String(requestId),
      cloudSynced: false,
    },
    kot: {
      id: `kot-${String(requestId)}`,
      orderId: String(orderId),
      restaurantId: String(restaurantId),
      tableId: String(tableId),
      kotNumber,
      counterDate: String(counterDate),
      captainId,
      createdAt: now,
      cloudSynced: false,
    },
    items: bill.items,
    totals: bill,
  };
}
