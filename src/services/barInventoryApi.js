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

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency helpers — generate and persist requestId across retries
// so the server can deduplicate double-clicks and network-retry submissions.
// Uses sessionStorage (survives modal unmount/remount within the same browser
// session) keyed by `item+action`. Callers must clear the key on success/error.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create a requestId for a bar inventory mutation.
 * The same key returns the same UUID across calls within a browser session,
 * so retries (double-click, timeout-then-retry) reuse the same ID.
 * @param {string} actionKey — e.g. `bar-purchase:${itemId}` or `bar-adjust:${itemId}`
 * @returns {string} UUID
 */
export function getOrCreateRequestId(actionKey) {
  const storageKey = `barInvReqId:${actionKey}`;
  try {
    let id = sessionStorage.getItem(storageKey);
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      sessionStorage.setItem(storageKey, id);
    }
    return id;
  } catch {
    // sessionStorage may be unavailable (private mode) — generate ephemeral UUID
    return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Clear the persisted requestId after a confirmed success or terminal error.
 * @param {string} actionKey — same key passed to getOrCreateRequestId
 */
export function clearRequestId(actionKey) {
  try {
    sessionStorage.removeItem(`barInvReqId:${actionKey}`);
  } catch {}
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

// Get available bottle sizes for a liquor peg menu item (30/60/90ml)
// Used by the BottlePicker to show bottle choices at the POS.
// Returns { menuItemId, menuName, isPeg, bottles: [{ inventoryItemId, label, bottleSize }] }
// No stock quantities returned — captain should not see stock levels.
export async function getBottlesForMenuItem(menuItemId) {
  const res = await fetch(apiUrl(`/api/bar/inventory/bottles-for-menu/${menuItemId}`), {
    headers: { ...getAuthHeaders() },
  });
  return parseResponse(res);
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

// Set absolute stock for a specific inventory item (per-size editing)
// Body: { stockMl: number, notes?: string }
export async function setItemStock(itemId, stockMl, notes) {
  const res = await fetch(apiUrl(`/api/bar/inventory/${itemId}/stock`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ stockMl, notes }),
  });
  return parseResponse(res);
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
// data.requestId (optional) — UUID for idempotency; if provided, server deduplicates
// retries with the same requestId via ProcessedRequest.
export async function adjustStock(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/adjust-stock'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  const result = await parseResponse(res);
  // Backend returns { item, transaction } — normalize the item for callers
  const item = result?.item ?? result;
  return normalizeInventoryItem(item);
}

// Get opening stock preview for a specific item
// Returns today's sold/purchased/wastage/adjusted so the frontend can show
// a live preview of the resulting closing stock before saving.
export async function getOpeningPreview(itemId, date) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  const qs = params.toString();
  const res = await fetch(apiUrl(`/api/bar/inventory/opening-preview/${itemId}${qs ? `?${qs}` : ''}`), {
    headers: { ...getAuthHeaders() },
  });
  return parseResponse(res);
}

// Record purchase
// data.requestId (optional) — UUID for idempotency; if provided, server deduplicates
// retries with the same requestId via ProcessedRequest.
export async function recordPurchase(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/record-purchase'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  const result = await parseResponse(res);
  // Backend returns { item, transaction } — normalize the item for callers
  const item = result?.item ?? result;
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

// Get printable Daily Stock & Sales Summary for a specific date.
// Returns only items with relevant activity on that date, grouped by category,
// with reconciliation flags. See backend /api/bar/inventory/stock-sheet.
export async function fetchBarStockSheet(date) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), date });
  const res = await fetch(apiUrl(`/api/bar/inventory/stock-sheet?${params}`), {
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

// ─── Non-AC Bar Inventory (separate stock pool) ───────────────────────────

// Fetch combined AC + Non-AC inventory view
// Supports date-range queries via fromDate/toDate, or single date for backward compat.
export async function fetchCombinedInventory(dateOrOpts = '') {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  let url = `/api/bar/inventory/non-ac/combined?restaurantId=${rId}`;
  if (typeof dateOrOpts === 'object' && dateOrOpts !== null) {
    if (dateOrOpts.fromDate) url += `&fromDate=${encodeURIComponent(dateOrOpts.fromDate)}`;
    if (dateOrOpts.toDate) url += `&toDate=${encodeURIComponent(dateOrOpts.toDate)}`;
  } else if (dateOrOpts) {
    url += `&date=${encodeURIComponent(dateOrOpts)}`;
  }
  const res = await fetch(apiUrl(url), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...getAuthHeaders() },
  });
  const data = await parseResponse(res);
  return data;
}

// Fetch Non-AC items only
export async function fetchNonAcItems(date = '') {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  let url = `/api/bar/inventory/non-ac/items?restaurantId=${rId}`;
  if (date) url += `&date=${encodeURIComponent(date)}`;
  const res = await fetch(apiUrl(url), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...getAuthHeaders() },
  });
  return parseResponse(res);
}

// Record Non-AC deduction (admin manual entry)
export async function recordNonAcDeduction({ itemId, adminDeduction, receivedBottles, date, reason }) {
  const res = await fetch(apiUrl('/api/bar/inventory/non-ac/deduct'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      itemId,
      adminDeduction,
      receivedBottles: receivedBottles || 0,
      date,
      reason,
      restaurantId: getCurrentRestaurantId(),
    }),
  });
  return parseResponse(res);
}

// Edit Non-AC daily entry (opening, sale, closing) — persists to database
export async function updateNonAcEntry({ itemId, date, openingBottles, saleBottles, closingBottles, receivedBottles, reason }) {
  const res = await fetch(apiUrl('/api/bar/inventory/non-ac/entry'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      itemId,
      date,
      openingBottles,
      saleBottles,
      closingBottles,
      receivedBottles: receivedBottles || 0,
      reason,
      restaurantId: getCurrentRestaurantId(),
    }),
  });
  return parseResponse(res);
}

// Fetch Non-AC audit trail
export async function fetchNonAcAuditTrail({ itemId, date, startDate, endDate } = {}) {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  const params = new URLSearchParams({ restaurantId: rId });
  if (itemId) params.set('itemId', itemId);
  if (date) params.set('date', date);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const res = await fetch(apiUrl(`/api/bar/inventory/non-ac/audit-trail?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Create Non-AC inventory item
export async function createNonAcItem(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/non-ac/items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  return parseResponse(res);
}

// Update Non-AC inventory item (e.g., set selling price, confirm flagged item)
export async function updateNonAcItem(id, data) {
  const res = await fetch(apiUrl(`/api/bar/inventory/non-ac/items/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

// Save item-wise edits (same endpoint as PDF preview — ensures bidirectional sync)
// Used by CombinedBarTable when admin edits closing stock on the Inventory page.
// This updates both DailyInventorySnapshot (sold + closing) and AcReportAdjustment,
// so the PDF preview and Inventory page always show the same values.
export async function saveItemWiseEdits({ date, nonAcItems, acAdjustments }) {
  const res = await fetch(apiUrl('/api/bar/inventory/liquor-report-item-wise'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ date, nonAcItems, acAdjustments }),
  });
  return parseResponse(res);
}

// Fetch Non-AC dashboard metrics
export async function fetchNonAcDashboard() {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  const res = await fetch(apiUrl(`/api/bar/inventory/non-ac/dashboard?restaurantId=${rId}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}
