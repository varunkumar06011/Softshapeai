// ─────────────────────────────────────────────────────────────────────────────
// Table API — Frontend API client for restaurant table management
// ─────────────────────────────────────────────────────────────────────────────
// Provides functions for managing restaurant tables via the backend API:
//   - fetchTables() — list all tables with sections and active orders
//   - createTable(data) — create a new table
//   - updateTable(id, data) — update table status/number/section
//   - deleteTable(id) — delete a table
//   - updateTableSession(id, sessionData) — update table session (order items)
//   - fetchVenues() — list all venues with floors, sections, and tables
//   - generateTableQR(id) — generate QR code URL for a table
//   - swapTables(data) — swap items between two tables
//
// All requests include auth headers and restaurantId from current session.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, apiUrl, getAuthHeaders } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { isEdgeAvailable, edgeFetch } from "./edgeHealth.js";

// Helper: parse fetch response, throw on non-OK status with error message
async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch (e) {
      console.debug('[tableApi] parseResponse json error:', e);
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchWithRetry(url, options = {}, { retries = 2, timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal if provided so unmounting components can abort the fetch
  const externalSignal = options?.signal;
  const onExternalAbort = externalSignal ? () => controller.abort() : null;
  if (externalSignal && !externalSignal.aborted) {
    externalSignal.addEventListener('abort', onExternalAbort);
  } else if (externalSignal?.aborted) {
    controller.abort();
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (onExternalAbort) externalSignal.removeEventListener('abort', onExternalAbort);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (onExternalAbort) externalSignal.removeEventListener('abort', onExternalAbort);
    if (retries > 0 && err.name !== 'AbortError' && !err.message?.includes('aborted')) {
      console.warn(`[fetchWithRetry] Retrying ${url} after error:`, err.message);
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(url, options, { retries: retries - 1, timeoutMs });
    }
    throw err;
  }
}

export async function fetchTables(restaurantId = getCurrentRestaurantId(), signal) {
  if (!restaurantId) {
    throw new Error('No restaurant ID available');
  }
  // ── Edge server first (local SQLite) ────────────────────────────────────────
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/tables');
    } catch (e) {
      console.debug('[tableApi] edge fetch tables failed, falling through to cloud:', e);
    }
  }
  const res = await fetchWithRetry(apiUrl(`/api/tables?restaurantId=${encodeURIComponent(restaurantId)}`), {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...getAuthHeaders(),
    },
    signal,
  });
  return parseResponse(res);
}

export async function fetchSections(restaurantId = getCurrentRestaurantId()) {
  // ── Edge server first (local SQLite) ────────────────────────────────────────
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/sections');
    } catch (e) {
      console.debug('[tableApi] edge fetch sections failed, falling through to cloud:', e);
    }
  }
  const res = await fetch(apiUrl(`/api/sections?restaurantId=${encodeURIComponent(restaurantId)}`), {
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function fetchVenues(restaurantId = getCurrentRestaurantId()) {
  // ── Edge server first (local SQLite) ────────────────────────────────────────
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/venues');
    } catch (e) {
      console.debug('[tableApi] edge fetch venues failed, falling through to cloud:', e);
    }
  }
  const res = await fetchWithRetry(apiUrl(`/api/venues?restaurantId=${encodeURIComponent(restaurantId)}`), {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...getAuthHeaders(),
    },
  });
  return parseResponse(res);
}

export async function fetchVenuesForOutlet(outletId, signal) {
  const qs = outletId ? `?outletId=${encodeURIComponent(outletId)}` : '';
  const res = await fetchWithRetry(apiUrl(`/api/venues${qs}`), {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...getAuthHeaders(),
    },
    signal,
  });
  return parseResponse(res);
}

export async function fetchTablesForOutlet(outletId, signal) {
  if (!outletId) throw new Error('No outlet scope provided');
  const res = await fetchWithRetry(apiUrl(`/api/tables/flat?outletId=${encodeURIComponent(outletId)}`), {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...getAuthHeaders(),
    },
    signal,
  });
  return parseResponse(res);
}

export async function updateTableStatus(tableId, status) {
  const res = await fetch(apiUrl(`/api/tables/${tableId}/status`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ status }),
  });
  return parseResponse(res);
}

export async function updateTableSession(tableId, session) {
  const res = await fetch(apiUrl(`/api/tables/${tableId}/session`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(session),
  });
  return parseResponse(res);
}

export async function createTable({ number, capacity, sectionId, restaurantId }) {
  const res = await fetch(apiUrl("/api/tables"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ number, capacity, sectionId, restaurantId }),
  });
  return parseResponse(res);
}

export async function bulkCreateTables({ sectionId, count, capacity, startNumber }) {
  const res = await fetch(apiUrl("/api/tables/bulk"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ sectionId, count, capacity, startNumber }),
  });
  return parseResponse(res);
}

export async function deleteTable(tableId) {
  const res = await fetch(apiUrl(`/api/tables/${tableId}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function deleteAllTables() {
  const res = await fetch(apiUrl("/api/tables/all"), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// ── Venue CRUD ──────────────────────────────────────────────────────────────

export async function createVenue({ name, venueType, kotEnabled, sortOrder }) {
  const res = await fetch(apiUrl("/api/venues"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name, venueType, kotEnabled, sortOrder }),
  });
  return parseResponse(res);
}

export async function updateVenue(id, { name, venueType, kotEnabled, sortOrder, isActive }) {
  const res = await fetch(apiUrl(`/api/venues/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name, venueType, kotEnabled, sortOrder, isActive }),
  });
  return parseResponse(res);
}

export async function deleteVenue(id) {
  const res = await fetch(apiUrl(`/api/venues/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// ── Section CRUD ────────────────────────────────────────────────────────────

export async function createSection({ name, venueId }) {
  const res = await fetch(apiUrl("/api/sections"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name, venueId }),
  });
  return parseResponse(res);
}

export async function updateSection(id, { name, venueId, sortOrder }) {
  const res = await fetch(apiUrl(`/api/sections/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name, venueId, sortOrder }),
  });
  return parseResponse(res);
}

export async function deleteSection(id) {
  const res = await fetch(apiUrl(`/api/sections/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// ── Table update (layout fields) ────────────────────────────────────────────

export async function updateTable(id, { number, capacity, sectionId }) {
  const res = await fetch(apiUrl(`/api/tables/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ number, capacity, sectionId }),
  });
  return parseResponse(res);
}

export { API_BASE };
