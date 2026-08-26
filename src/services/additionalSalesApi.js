// ─────────────────────────────────────────────────────────────────────────────
// Additional / Offline Sales API — Frontend API client
// ─────────────────────────────────────────────────────────────────────────────
// Manually entered reference figures for outlets without a PC/system.
// NOT included in Total Sales, AOV, POS revenue, billing, or inventory.
//
// Functions:
//   - fetchAdditionalSales(date, category?) — list offline sales for a date
//   - createAdditionalSale(data) — create a new offline sale record
//   - updateAdditionalSale(id, data) — update an existing record
//   - deleteAdditionalSale(id) — delete a record
//   - fetchCategoryOutletSales(category, date) — system outlet-wise revenue
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl, getAuthHeaders } from './apiConfig';

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

/**
 * Fetch additional/offline sales with flexible filtering.
 * @param {Object} opts
 * @param {string} [opts.date] — single date YYYY-MM-DD (legacy)
 * @param {string} [opts.fromDate] — range start YYYY-MM-DD
 * @param {string} [opts.toDate] — range end YYYY-MM-DD
 * @param {string} [opts.category] — 'Food' | 'Liquor' | 'Beverages' | 'All' (default: All)
 * @param {string} [opts.search] — search by outlet name or notes
 */
export async function fetchAdditionalSales({ date, fromDate, toDate, category, search } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  const res = await fetch(apiUrl(`/api/additional-sales?${params.toString()}`), {
    headers: { ...getAuthHeaders() },
  });
  return parseResponse(res);
}

/**
 * Create a new additional/offline sale record.
 * @param {{ saleDate: string, category: string, outletName: string, revenue: number, notes?: string }} data
 */
export async function createAdditionalSale(data) {
  const res = await fetch(apiUrl('/api/additional-sales'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

/**
 * Update an existing additional/offline sale record.
 * @param {string} id
 * @param {{ saleDate?: string, category?: string, outletName?: string, revenue?: number, notes?: string }} data
 */
export async function updateAdditionalSale(id, data) {
  const res = await fetch(apiUrl(`/api/additional-sales/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

/**
 * Delete an additional/offline sale record.
 * @param {string} id
 */
export async function deleteAdditionalSale(id) {
  const res = await fetch(apiUrl(`/api/additional-sales/${id}`), {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  return parseResponse(res);
}

/**
 * Fetch system outlet-wise revenue for a specific category and date.
 * @param {string} category — 'Food' | 'Liquor' | 'Beverages'
 * @param {string} date — YYYY-MM-DD (used as both startDate and endDate)
 */
export async function fetchCategoryOutletSales(category, date) {
  const params = new URLSearchParams({
    startDate: date,
    endDate: date,
    category,
  });
  const res = await fetch(apiUrl(`/api/reports/category-outlet-sales?${params.toString()}`), {
    headers: { ...getAuthHeaders() },
  });
  return parseResponse(res);
}
