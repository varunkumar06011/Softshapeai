// ─────────────────────────────────────────────────────────────────────────────
// Bar Inventory API — Frontend API client for bar liquor inventory management
// ─────────────────────────────────────────────────────────────────────────────
// Provides functions for managing bar inventory items and daily stock entries:
//   - fetchBarInventory() — list all inventory items with current stock levels
//   - createBarInventoryItem(data) — create or update an inventory item
//   - deleteBarInventoryItem(id) — delete an inventory item
//   - createBarInventoryEntry(data) — create or update a daily stock entry
//   - fetchBarInventoryLedger() — get stock ledger with consumption history
//
// All requests include auth headers and restaurantId from current session.
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl, getAuthHeaders } from './apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

export function isOfflineError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err.message;
  const name = typeof err === 'string' ? '' : err.name;
  if (name === 'AbortError') return true;
  if (name === 'TypeError' && /Failed to fetch|NetworkError|Load failed/i.test(msg)) return true;
  if (/Failed to fetch|NetworkError|Load failed|timed out/i.test(msg)) return true;
  return false;
}

// Helper: parse fetch response, throw on non-OK status with error message
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
export async function fetchBarInventory(date = '') {
  try {
    const rId = getCurrentRestaurantId();
    if (!rId) throw new Error('No restaurant context');
    let url = `/api/bar/inventory/items?restaurantId=${rId}`;
    if (date) url += `&date=${encodeURIComponent(date)}`;
    
    const res = await fetch(apiUrl(url), {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...getAuthHeaders() }
    });
    const data = await parseResponse(res);
    return normalizeInventoryArray(data);
  } catch (error) {
    throw error;
  }
}

// Create new inventory item
export async function createInventoryItem(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  const item = await parseResponse(res);
  return normalizeInventoryItem(item);
}

// Update inventory item
export async function updateInventoryItem(id, data) {
  const res = await fetch(apiUrl(`/api/bar/inventory/items/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  const item = await parseResponse(res);
  return normalizeInventoryItem(item);
}

// Delete inventory item
export async function deleteInventoryItem(id) {
  const res = await fetch(apiUrl(`/api/bar/inventory/items/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Adjust stock (manual adjustment)
export async function adjustStock(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/adjust-stock'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  const item = await parseResponse(res);
  return normalizeInventoryItem(item);
}

// Record purchase
export async function recordPurchase(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/record-purchase'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  const item = await parseResponse(res);
  return normalizeInventoryItem(item);
}

// Get transaction history
export async function fetchTransactions(filters = {}) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), ...filters });
  const res = await fetch(apiUrl(`/api/bar/inventory/transactions?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Get daily report
export async function fetchDailyReport(date) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), date });
  const res = await fetch(apiUrl(`/api/bar/inventory/daily-report?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Get low stock items
export async function fetchLowStockItems() {
  const res = await fetch(apiUrl(`/api/bar/inventory/low-stock?restaurantId=${getCurrentRestaurantId()}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  const data = await parseResponse(res);
  return normalizeInventoryArray(data);
}

// Get top 3 selling liquor items
export async function fetchBarTopSelling(filters = {}) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), ...filters });
  const res = await fetch(apiUrl(`/api/bar/inventory/top-selling?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Check deduction for a specific order
export async function fetchBarDeductionCheck(orderId) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), orderId });
  const res = await fetch(apiUrl(`/api/bar/inventory/deduction-check?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}
