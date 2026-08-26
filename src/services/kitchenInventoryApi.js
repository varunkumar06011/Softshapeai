// ─────────────────────────────────────────────────────────────────────────────
// Kitchen Inventory API — Frontend API client for kitchen inventory management
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors barInventoryApi.js pattern. All requests include auth headers and
// restaurantId from current session.
//
// Endpoints:
//   - fetchKitchenInventory(date?) — list all kitchen items with today's entries
//   - createKitchenItem(data) — create a new kitchen inventory item
//   - updateKitchenItem(id, data) — update item metadata
//   - archiveKitchenItem(id) — archive (soft-delete) an item
//   - createKitchenEntry(data) — create/update a daily entry (opening/add/consumed)
//   - fetchKitchenLedger(filters) — get stock ledger with movement history
//   - fetchKitchenTopSelling(filters) — top-selling items report
//   - fetchKitchenCombined(date) — combined kitchen+bar inventory view
//   - fetchKitchenDeductionCheck(orderId) — deduction status for an order
//   - retryKitchenDeduction(orderId) — retry failed kitchen deduction
//   - retryBarDeduction(orderId) — retry failed bar deduction
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl, getAuthHeaders } from './apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

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
function normalizeKitchenItem(item) {
  if (!item) return item;
  const normalized = { ...item };
  if (item.currentStock != null) normalized.currentStock = parseFloat(item.currentStock) || 0;
  if (item.reorderLevel != null) normalized.reorderLevel = parseFloat(item.reorderLevel) || 0;
  if (item.price != null) normalized.price = parseFloat(item.price) || 0;
  // Today's entry fields
  if (item.todayEntry) {
    normalized.todayEntry = {
      ...item.todayEntry,
      openingStock: parseFloat(item.todayEntry.openingStock) || 0,
      addedStock: parseFloat(item.todayEntry.addedStock) || 0,
      consumedStock: parseFloat(item.todayEntry.consumedStock) || 0,
      closingStock: parseFloat(item.todayEntry.closingStock) || 0,
    };
  }
  return normalized;
}

function normalizeKitchenArray(items) {
  if (!Array.isArray(items)) return items;
  return items.map(normalizeKitchenItem);
}

// Get all kitchen inventory items (with today's daily entries)
export async function fetchKitchenInventory(date = '') {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  let url = `/api/inventory/kitchen?restaurantId=${rId}`;
  if (date) url += `&date=${encodeURIComponent(date)}`;
  const res = await fetch(apiUrl(url), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...getAuthHeaders() },
  });
  const data = await parseResponse(res);
  return normalizeKitchenArray(data);
}

// Create a new kitchen inventory item
export async function createKitchenItem(data) {
  const res = await fetch(apiUrl('/api/inventory/kitchen/items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  const item = await parseResponse(res);
  return normalizeKitchenItem(item);
}

// Update kitchen item metadata (name, unit, category, price, reorderLevel, image)
export async function updateKitchenItem(id, data) {
  const res = await fetch(apiUrl(`/api/inventory/kitchen/items/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  const item = await parseResponse(res);
  return normalizeKitchenItem(item);
}

// Archive (soft-delete) a kitchen inventory item
export async function archiveKitchenItem(id) {
  const res = await fetch(apiUrl(`/api/inventory/kitchen/items/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Create/update a daily entry (opening stock, add stock, consumed stock)
export async function createKitchenEntry(data) {
  const res = await fetch(apiUrl('/api/inventory/kitchen/entries'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  return parseResponse(res);
}

// Get kitchen ledger (movement history) with optional filters
export async function fetchKitchenLedger(filters = {}) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), ...filters });
  const res = await fetch(apiUrl(`/api/inventory/kitchen/ledger?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Get printable Daily Stock & Sales Summary for a specific date.
// Returns only kitchen items with relevant activity on that date, grouped by
// category, with reconciliation flags. See backend /api/inventory/kitchen/stock-sheet.
export async function fetchKitchenStockSheet(date) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), date });
  const res = await fetch(apiUrl(`/api/inventory/kitchen/stock-sheet?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Get top-selling kitchen items
export async function fetchKitchenTopSelling(filters = {}) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), ...filters });
  const res = await fetch(apiUrl(`/api/inventory/kitchen/top-selling?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Get combined kitchen + bar inventory view
export async function fetchKitchenCombined(date = '') {
  const rId = getCurrentRestaurantId();
  let url = `/api/inventory/kitchen/combined?restaurantId=${rId}`;
  if (date) url += `&date=${encodeURIComponent(date)}`;
  const res = await fetch(apiUrl(url), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Get deduction check for an order
export async function fetchKitchenDeductionCheck(orderId) {
  const res = await fetch(apiUrl(`/api/inventory/kitchen/deduction-check?orderId=${encodeURIComponent(orderId)}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Retry failed kitchen deduction for an order
export async function retryKitchenDeduction(orderId) {
  const res = await fetch(apiUrl(`/api/inventory/kitchen/retry-deduction/${encodeURIComponent(orderId)}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ restaurantId: getCurrentRestaurantId() }),
  });
  return parseResponse(res);
}

// Retry failed bar deduction for an order (via kitchen router proxy)
export async function retryBarDeduction(orderId) {
  const res = await fetch(apiUrl(`/api/inventory/kitchen/bar/retry-deduction/${encodeURIComponent(orderId)}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ restaurantId: getCurrentRestaurantId() }),
  });
  return parseResponse(res);
}
