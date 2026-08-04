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

// ── Menu item operations (local-first) ───────────────────────────────────────

export async function createMenuItem(item) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/admin/menu-item', {
        method: 'POST',
        body: JSON.stringify(item),
      });
    } catch { /* fall through to cloud */ }
  }
  const res = await fetch(apiUrl('/api/menu/admin/items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(item),
  });
  return res.json();
}

export async function updateMenuItem(id, updates) {
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/menu-item/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    } catch { /* fall through to cloud */ }
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
