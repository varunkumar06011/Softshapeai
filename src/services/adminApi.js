// ─────────────────────────────────────────────────────────────────────────────
// adminApi.js — Admin API service with local-first / cloud-required split
// ─────────────────────────────────────────────────────────────────────────────
// Operational writes (menu, tables, staff, settings) go to the edge server's
// local SQLite first, then sync to cloud via sync_queue. Works offline.
//
// Analytical reads (reports, payroll, inventory, ledger) always hit the cloud
// backend directly — no local caching, since staleness is a correctness problem.
//
// Route source mapping is driven by adminRoutes.jsx's `source` field.
// ─────────────────────────────────────────────────────────────────────────────

import { isEdgeAvailable, edgeFetch, getEdgeUrl } from './edgeHealth.js';
import { apiUrl, getAuthHeaders } from './apiConfig';
import { generateRequestId } from '../utils/requestId.js';
import secureStorage from '../utils/secureStorage.js';

// ── Menu item operations (local-first) ───────────────────────────────────────

// Detect edge-local tokens (offline PIN login) so cloud fallback is skipped.
// A fake/local token must never reach the cloud API — it would be rejected
// as an invalid JWT and could leak the fact that the device is offline.
function isEdgeLocalSession() {
  const token = secureStorage.getItem('ss_token');
  return !!token && token.startsWith('edge-local-');
}

// Normalize the create payload for the edge server contract.
// The edge endpoint expects `basePrice` (not `price`) and `category` (name or id).
function normalizeEdgePayload(item) {
  return {
    ...item,
    basePrice: item.basePrice ?? item.price,
    category: item.category ?? item.categoryId,
    // Strip fields the edge server does not support or that cashiers must not set.
    imageUrl: undefined,
    isSpecial: undefined,
    specialChannel: undefined,
    specialActive: undefined,
    specialExpiresAt: undefined,
    syncToAllOutlets: undefined,
    targetOutletId: undefined,
    categoryPrinterTarget: undefined,
  };
}

export async function createMenuItem(item) {
  // Generate an idempotency key so retries return the same item instead of
  // creating duplicates. The edge server uses this as the item ID when provided.
  const idempotencyKey = item.idempotencyKey || generateRequestId();
  const payload = { ...item, idempotencyKey };

  if (await isEdgeAvailable()) {
    try {
      const edgePayload = normalizeEdgePayload(payload);
      const res = await edgeFetch('/api/edge/admin/menu-item', {
        method: 'POST',
        body: JSON.stringify(edgePayload),
      });
      // edgeFetch returns a parsed JSON response. Map to POS shape.
      if (res && res.success && res.item) {
        return res.item;
      }
      return res;
    } catch { /* fall through to cloud */ }
  }

  // Cloud fallback: skip for edge-local sessions (offline PIN login).
  // A fake/local token cannot authenticate against the cloud API.
  if (isEdgeLocalSession()) {
    throw new Error('Cannot create menu item: edge server is unavailable and cloud fallback is disabled for offline sessions.');
  }

  const res = await fetch(apiUrl('/api/menu/admin/items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateMenuItem(id, updates) {
  if (await isEdgeAvailable()) {
    try {
      // Normalize payload for the edge contract: edge uses `basePrice`, not `price`.
      const edgePayload = { ...updates };
      if (edgePayload.price !== undefined && edgePayload.basePrice === undefined) {
        edgePayload.basePrice = edgePayload.price;
        delete edgePayload.price;
      }
      // Strip fields cashiers must not set (the edge server also enforces this,
      // but stripping here avoids sending unsupported fields over the wire).
      delete edgePayload.imageUrl;
      delete edgePayload.categoryPrinterTarget;
      delete edgePayload.syncToAllOutlets;
      delete edgePayload.targetOutletId;
      const res = await edgeFetch(`/api/edge/admin/menu-item/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(edgePayload),
      });
      if (res && res.success && res.item) return res.item;
      return res;
    } catch { /* fall through to cloud */ }
  }
  // Cloud fallback: skip for edge-local sessions (offline PIN login).
  if (isEdgeLocalSession()) {
    throw new Error('Cannot update menu item: edge server is unavailable and cloud fallback is disabled for offline sessions.');
  }
  const res = await fetch(apiUrl(`/api/menu/admin/items/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteMenuItem(id) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/menu-item/${id}`, { method: 'DELETE' });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl(`/api/menu/admin/items/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.json();
}

// ── Table operations (local-first) ───────────────────────────────────────────

export async function createTable(table) {
  const requestId = table.requestId || generateRequestId();
  const tableWithId = { ...table, requestId };
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/admin/table', {
        method: 'POST',
        body: JSON.stringify(tableWithId),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl('/api/tables'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(tableWithId),
  });
  return res.json();
}

export async function updateTable(id, updates) {
  const requestId = updates.requestId || generateRequestId();
  const updatesWithId = { ...updates, requestId };
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/table/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updatesWithId),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl(`/api/tables/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updatesWithId),
  });
  return res.json();
}

export async function deleteTable(id) {
  const requestId = generateRequestId();
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/table/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl(`/api/tables/${id}`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ requestId }),
  });
  return res.json();
}

// ── Staff operations (local-first) ───────────────────────────────────────────

export async function createStaff(staff) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/admin/staff', {
        method: 'POST',
        body: JSON.stringify(staff),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl('/api/staff'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(staff),
  });
  return res.json();
}

export async function updateStaff(id, updates) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl(`/api/staff/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteStaff(id) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/staff/${id}`, { method: 'DELETE' });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl(`/api/staff/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.json();
}

// ── Category operations (local-first) ────────────────────────────────────────

export async function createCategory(category) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/admin/category', {
        method: 'POST',
        body: JSON.stringify(category),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl('/api/menu/admin/categories'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(category),
  });
  return res.json();
}

export async function updateCategory(id, updates) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/category/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl(`/api/menu/admin/categories/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteCategory(id) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/category/${id}`, { method: 'DELETE' });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl(`/api/menu/admin/categories/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.json();
}

// ── Outlet settings (local-first) ────────────────────────────────────────────

export async function updateOutletSettings(updates) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/admin/outlet', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl('/api/restaurant'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates),
  });
  return res.json();
}

// ── Cloud-only operations (no edge fallback) ─────────────────────────────────
// These always hit Postgres directly. No local caching — staleness is a
// correctness problem for payroll, inventory, ledger, reports.

export async function fetchReports(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(apiUrl(`/api/reports?${qs.toString()}`), {
    headers: getAuthHeaders(),
  });
  return res.json();
}

export async function fetchPayroll(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(apiUrl(`/api/payroll?${qs.toString()}`), {
    headers: getAuthHeaders(),
  });
  return res.json();
}

export async function fetchInventory(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(apiUrl(`/api/inventory?${qs.toString()}`), {
    headers: getAuthHeaders(),
  });
  return res.json();
}

export async function fetchLedger(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(apiUrl(`/api/ledger?${qs.toString()}`), {
    headers: getAuthHeaders(),
  });
  return res.json();
}

export async function fetchDashboardStats(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(apiUrl(`/api/stats?${qs.toString()}`), {
    headers: getAuthHeaders(),
  });
  return res.json();
}
