// ─────────────────────────────────────────────────────────────────────────────
// Bar Inventory API — Frontend API client for the redesigned bar inventory
// ─────────────────────────────────────────────────────────────────────────────
// All data comes from the single-stock-pool model:
//   BarInventoryItem (one per bottle SKU) + BarInventoryMovement (append-only
//   ledger) + BarDailyRecord (permanent daily snapshot).
//
// Endpoints used (mounted at /api/bar/inventory):
//   GET    /items, /items/unlinked, /items/:id
//   POST   /items            PATCH /items/:id      DELETE /items/:id
//   POST   /record-purchase  POST /adjust-stock    POST /non-ac-sale
//   PUT    /physical-count
//   GET    /movements        GET /daily-report     GET /stock-sheet
//   GET    /liquor-daily-report                    GET /reconciliation
//   GET    /low-stock        GET /dashboard
//   GET    /deduction-check  POST /retry-deduction/:orderId
//   POST   /manual-report-items  GET /manual-report-items
//   GET    /bottles-for-menu/:menuItemId           GET /opening-preview/:itemId
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl, getAuthHeaders } from './apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import secureStorage from '../utils/secureStorage';
import { getKolkataDateString } from '../shared/utils/dateFormat';

// Edge-local tokens (offline PIN login) are not cloud JWTs — the cloud backend
// rejects them with 401. Fall back to the preauth token so captain/cashier POS
// can still reach cloud-only endpoints (e.g. bottles-for-menu) when logged in
// via edge PIN. Mirrors the pattern in edgeHealth.js.
function getCloudAuthHeaders() {
  const headers = getAuthHeaders();
  const token = secureStorage.getItem('ss_token');
  if (token && token.startsWith('edge-local-')) {
    const preAuthToken = secureStorage.getItem('ss_preauth_token');
    if (preAuthToken) {
      headers['Authorization'] = `Bearer ${preAuthToken}`;
    }
  }
  return headers;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency helpers — generate and persist requestId across retries
// ─────────────────────────────────────────────────────────────────────────────

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
    return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function clearRequestId(actionKey) {
  try {
    sessionStorage.removeItem(`barInvReqId:${actionKey}`);
  } catch {}
}

// ── Items ────────────────────────────────────────────────────────────────────

// List all bar inventory items with their daily record for a date.
// Returns { date, items: [...] }
export async function fetchBarInventory(date = '') {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  let url = `/api/bar/inventory/items?restaurantId=${rId}`;
  if (date) url += `&date=${encodeURIComponent(date)}`;
  const res = await fetch(apiUrl(url), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...getAuthHeaders() },
  });
  return parseResponse(res);
}

// Backward-compat alias — the bar table previously fetched a "combined" AC+Non-AC
// view. Now one stock pool — same endpoint.
export async function fetchCombinedInventory(dateOrOpts = '') {
  let date = '';
  if (typeof dateOrOpts === 'object' && dateOrOpts !== null) {
    date = dateOrOpts.fromDate || '';
  } else if (dateOrOpts) {
    date = dateOrOpts;
  }
  const data = await fetchBarInventory(date);
  return { date: data.date, items: data.items || [], summary: null };
}

// LIQUOR menu items with no inventory link (for Add Item dropdown + diagnostics)
export async function fetchUnlinkedItems() {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  const res = await fetch(apiUrl(`/api/bar/inventory/items/unlinked?restaurantId=${rId}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Single item detail + movement history
export async function fetchBarItem(id) {
  const res = await fetch(apiUrl(`/api/bar/inventory/items/${id}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Get available bottle sizes for a liquor peg menu item (30/60/90ml)
// Used by the BottlePicker to show bottle choices at the POS.
// Returns { menuItemId, defaultItemId, deductionMl, bottles: [...] }
export async function getBottlesForMenuItem(menuItemId, menuItems = []) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(apiUrl(`/api/bar/inventory/bottles-for-menu/${menuItemId}`), {
      headers: { ...getCloudAuthHeaders() },
      signal: controller.signal,
    });
    const data = await parseResponse(res);
    if (data && data.bottles && data.bottles.length > 0) {
      // Shape for BottlePicker: { isPeg, menuName, bottles: [{ inventoryItemId, label, bottleSize }] }
      return {
        menuItemId,
        menuName: null,
        isPeg: true,
        bottles: data.bottles.map((b) => ({
          inventoryItemId: b.id,
          label: b.name,
          bottleSize: b.bottleSizeMl,
          currentStockMl: b.currentStockMl,
          stockDisplay: b.stockDisplay,
          isDefault: b.isDefault,
        })),
        defaultItemId: data.defaultItemId,
        deductionMl: data.deductionMl,
      };
    }
    // No bottles — fall through to menu-derived fallback
  } catch {
    // Network error / timeout — fall through to fallback
  } finally {
    clearTimeout(timeoutId);
  }

  // ── Fallback: derive from loaded menu items (offline) ────────────────
  const tapped = menuItems.find((i) => i.id === menuItemId);
  if (tapped) {
    const tapName = (tapped.n || tapped.name || '').toLowerCase();
    const tapMl = parseMlFromName(tapName);
    if (tapMl) {
      const tapBase = normalizeBaseName(tapName);
      const PICKER_SIZES = [30, 60, 90, 180, 375];
      if (PICKER_SIZES.includes(tapMl)) {
        // One option per physical bottle size. The menu can hold several rows
        // of the same size (and 'both' mode concatenates restaurant+bar lists),
        // so dedupe — preferring the row that carries a real inventory link.
        const bySize = new Map();
        for (const i of menuItems) {
          const name = (i.n || i.name || '').toLowerCase();
          const ml = parseMlFromName(name);
          if (!ml || ml < tapMl || normalizeBaseName(name) !== tapBase) continue;
          // These are MENU item ids, not BarInventoryItem ids — keep null so
          // callers never send them as pourFromInventoryItemId (the backend
          // would reject them). Backend resolution handles the fallback.
          const invId = i.barInventoryItemId || i.bar_inventory_item_id || null;
          const existing = bySize.get(ml);
          if (!existing || (!existing.inventoryItemId && invId)) {
            bySize.set(ml, { inventoryItemId: invId, label: `${ml}ml`, bottleSize: ml });
          }
        }
        const bottles = [...bySize.values()].sort((a, b) => b.bottleSize - a.bottleSize);
        return { menuItemId, menuName: tapped.n || tapped.name, isPeg: true, bottles };
      }
    }
  }

  return { menuItemId, menuName: null, isPeg: false, bottles: [] };
}

// ── Helpers for offline bottle derivation ──────────────────────────────
function parseMlFromName(name) {
  if (!name) return null;
  const m = name.match(/(\d+)\s*ml\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function normalizeBaseName(name) {
  return name.toLowerCase()
    .replace(/\s*\d+\s*ml\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Item CRUD ────────────────────────────────────────────────────────────────

// Create new bar inventory item (optionally links a menu item)
export async function createInventoryItem(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  return parseResponse(res);
}

// Update bar inventory item master fields
export async function updateInventoryItem(id, data) {
  const res = await fetch(apiUrl(`/api/bar/inventory/items/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

// Set physical closing count for an item on a date (physical count reconciliation)
export async function setItemStock(itemId, physicalMl, opts = {}) {
  // Backward compat: legacy callers pass the notes string as the third arg.
  if (typeof opts === 'string') opts = { notes: opts };
  const res = await fetch(apiUrl('/api/bar/inventory/physical-count'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      itemId,
      date: opts.date || getKolkataDateString(),
      physicalClosingMl: physicalMl,
      notes: opts.notes,
      requestId: opts.requestId,
      restaurantId: getCurrentRestaurantId(),
    }),
  });
  return parseResponse(res);
}

// Delete (soft) inventory item
export async function deleteInventoryItem(id) {
  const res = await fetch(apiUrl(`/api/bar/inventory/items/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Toggle hide/show in the PDF report
export async function toggleAcItemHide(id, isHidden) {
  return updateInventoryItem(id, { isHiddenFromReport: isHidden });
}
// Kept for backward compat — same table now
export async function toggleNonAcItemHide(id, isHidden) {
  return updateInventoryItem(id, { isHiddenFromReport: isHidden });
}

// ── Stock movements ─────────────────────────────────────────────────────────

// Manual stock adjustment (ADD / REMOVE / OPENING / WASTAGE)
export async function adjustStock(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/adjust-stock'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  return parseResponse(res);
}

// Get opening stock preview for a specific item
export async function getOpeningPreview(itemId, date) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  const qs = params.toString();
  const res = await fetch(apiUrl(`/api/bar/inventory/opening-preview/${itemId}${qs ? `?${qs}` : ''}`), {
    headers: { ...getAuthHeaders() },
  });
  return parseResponse(res);
}

// Record purchase (PURCHASE movement)
export async function recordPurchase(data) {
  const res = await fetch(apiUrl('/api/bar/inventory/record-purchase'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ ...data, restaurantId: getCurrentRestaurantId() }),
  });
  return parseResponse(res);
}

// Record / edit a Non-AC sale for a date (safe edit via CORRECTION movements)
export async function recordNonAcSale({ itemId, date, quantityMl, bottles, sellingPrice, sellingPricePerMl, notes, reason, requestId }) {
  const res = await fetch(apiUrl('/api/bar/inventory/non-ac-sale'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      itemId, date: date || getKolkataDateString(), quantityMl, bottles, sellingPrice, sellingPricePerMl, notes, reason, requestId,
      restaurantId: getCurrentRestaurantId(),
    }),
  });
  return parseResponse(res);
}

// ── DEPRECATED wrappers — dead code, scheduled for removal ──────────────────
// Only referenced by dead components (NonAcDeductionModal, CombinedBarTable).
// Do not use in new code — Non-AC sales are NON_AC_SALE movements on the
// single stock pool via recordNonAcSale().
export async function recordNonAcDeduction({ itemId, adminDeduction, date, reason }) {
  // adminDeduction was in bottles in the old model — caller should pass bottles
  return recordNonAcSale({ itemId, date, bottles: adminDeduction, reason });
}
export async function updateNonAcEntry({ itemId, date, saleBottles, reason }) {
  return recordNonAcSale({ itemId, date, bottles: saleBottles, reason });
}

// ── History & reports ────────────────────────────────────────────────────────

// Movement history (replaces /transactions)
export async function fetchMovements(filters = {}) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), ...filters });
  const res = await fetch(apiUrl(`/api/bar/inventory/movements?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}
// Backward-compat alias
export const fetchTransactions = fetchMovements;

// Daily report from BarDailyRecord
export async function fetchDailyReport(date) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), date });
  const res = await fetch(apiUrl(`/api/bar/inventory/daily-report?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Printable Daily Stock & Sales Summary (grouped by category)
export async function fetchBarStockSheet(date) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), date });
  const res = await fetch(apiUrl(`/api/bar/inventory/stock-sheet?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Full liquor daily report for PDF to Admin
export async function fetchLiquorDailyReport(date) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), date });
  const res = await fetch(apiUrl(`/api/bar/inventory/liquor-daily-report?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Reconciliation (system vs physical closing)
export async function fetchReconciliation(date = '') {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  let url = `/api/bar/inventory/reconciliation?restaurantId=${rId}`;
  if (date) url += `&date=${encodeURIComponent(date)}`;
  const res = await fetch(apiUrl(url), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Low stock items
export async function fetchLowStockItems() {
  const res = await fetch(apiUrl(`/api/bar/inventory/low-stock?restaurantId=${getCurrentRestaurantId()}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// Dashboard KPIs (replaces /non-ac/dashboard)
export async function fetchBarDashboard(date = '') {
  const rId = getCurrentRestaurantId();
  if (!rId) throw new Error('No restaurant context');
  let url = `/api/bar/inventory/dashboard?restaurantId=${rId}`;
  if (date) url += `&date=${encodeURIComponent(date)}`;
  const res = await fetch(apiUrl(url), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}
export const fetchNonAcDashboard = fetchBarDashboard;

// Top-selling — the dedicated endpoint was removed in the redesign.
// Returns an empty array; callers should derive top sellers from movements
// or daily-report data if needed.
export async function fetchBarTopSelling() {
  return [];
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

// Retry failed deduction for an order
export async function retryDeduction(orderId) {
  const res = await fetch(apiUrl(`/api/bar/inventory/retry-deduction/${orderId}`), {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// ── Manual report items (PDF-only rows) ──────────────────────────────────────

export async function fetchManualReportItems(date) {
  const params = new URLSearchParams({ restaurantId: getCurrentRestaurantId(), date });
  const res = await fetch(apiUrl(`/api/bar/inventory/manual-report-items?${params}`), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function saveManualReportItems({ date, items }) {
  const res = await fetch(apiUrl('/api/bar/inventory/manual-report-items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ date, items, restaurantId: getCurrentRestaurantId() }),
  });
  return parseResponse(res);
}

// ── DEPRECATED / removed endpoints — dead code, scheduled for removal ───────
// Only referenced by dead components (CombinedBarTable). Do not use in new
// code — these map to the closest new-model operation purely for compat.

// Old per-item Non-AC CRUD — Non-AC is now just a field on BarInventoryItem.
export async function fetchNonAcItems(date = '') {
  const data = await fetchBarInventory(date);
  return data.items || [];
}
export async function createNonAcItem(data) {
  return createInventoryItem(data);
}
export async function updateNonAcItem(id, data) {
  return updateInventoryItem(id, data);
}

// Old item-wise save (CombinedBarTable closing edits) → physical count.
// acAdjustments entries: { itemId, closingMl, date? }
export async function saveItemWiseEdits({ date, acAdjustments }) {
  const results = [];
  for (const adj of acAdjustments || []) {
    if (adj.closingMl == null) continue;
    const r = await setItemStock(adj.itemId, adj.closingMl, { date: adj.date || date, notes: adj.notes });
    results.push(r);
  }
  return { saved: results.length };
}
