import { apiUrl } from './apiConfig';

const BAR_ID = 'bar-001';

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Normalize numeric fields from API response (handles string -> number conversion)
function normalizeInventoryItem(item) {
  if (!item) return item;
  return {
    ...item,
    currentStock: parseFloat(item.currentStock) || 0,
    bottleSize: parseInt(item.bottleSize) || 750,
    reorderLevel: parseFloat(item.reorderLevel) || 0,
    maxStock: parseFloat(item.maxStock) || 0,
    costPerBottle: parseFloat(item.costPerBottle) || 0,
  };
}

function normalizeInventoryArray(items) {
  if (!Array.isArray(items)) return items;
  return items.map(normalizeInventoryItem);
}

// Get all inventory items
export async function fetchBarInventory() {
  const res = await fetch(apiUrl(`/api/bar/inventory/items?restaurantId=${BAR_ID}`), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  const data = await parseResponse(res);
  return normalizeInventoryArray(data);
}

// Create new inventory item
export async function createInventoryItem(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, restaurantId: BAR_ID }),
  });
  const item = await parseResponse(res);
  return normalizeInventoryItem(item);
}

// Update inventory item
export async function updateInventoryItem(id, data) {
  const res = await fetch(apiUrl(`/api/bar/inventory/items/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const item = await parseResponse(res);
  return normalizeInventoryItem(item);
}

// Delete inventory item
export async function deleteInventoryItem(id) {
  const res = await fetch(apiUrl(`/api/bar/inventory/items/${id}`), {
    method: 'DELETE',
  });
  return parseResponse(res);
}

// Adjust stock (manual adjustment)
export async function adjustStock(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/adjust-stock'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, restaurantId: BAR_ID }),
  });
  const item = await parseResponse(res);
  return normalizeInventoryItem(item);
}

// Record purchase
export async function recordPurchase(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/record-purchase'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, restaurantId: BAR_ID }),
  });
  const item = await parseResponse(res);
  return normalizeInventoryItem(item);
}

// Get transaction history
export async function fetchTransactions(filters = {}) {
  const params = new URLSearchParams({ restaurantId: BAR_ID, ...filters });
  const res = await fetch(apiUrl(`/api/bar/inventory/transactions?${params}`), {
    cache: 'no-store',
  });
  return parseResponse(res);
}

// Get daily report
export async function fetchDailyReport(date) {
  const params = new URLSearchParams({ restaurantId: BAR_ID, date });
  const res = await fetch(apiUrl(`/api/bar/inventory/daily-report?${params}`), {
    cache: 'no-store',
  });
  return parseResponse(res);
}

// Get low stock items
export async function fetchLowStockItems() {
  const res = await fetch(apiUrl(`/api/bar/inventory/low-stock?restaurantId=${BAR_ID}`), {
    cache: 'no-store',
  });
  const data = await parseResponse(res);
  return normalizeInventoryArray(data);
}
