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
import { isEdgeAvailable, edgeFetch, isEdgeLocalAuth, EDGE_READ_TIMEOUT_MS, triggerEdgeConfigResync } from "./edgeHealth.js";
import { generateRequestId } from "../utils/requestId.js";

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
      const { signal: _removed, ...retryOptions } = options;
      return fetchWithRetry(url, retryOptions, { retries: retries - 1, timeoutMs });
    }
    throw err;
  }
}

export async function fetchTables(restaurantId = getCurrentRestaurantId(), signal) {
  if (!restaurantId) {
    throw new Error('No restaurant ID available');
  }
  // ── Edge server first (local SQLite) ────────────────────────────────────────
  // For edge-local (PIN) auth, go straight to edgeFetch bypassing the
  // isEdgeAvailable() health check — the cache may be stale during page
  // reload, but the edge sidecar is a separate process that's still running.
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const edgeData = await edgeFetch('/api/edge/tables', { timeoutMs: EDGE_READ_TIMEOUT_MS });
      if (edgeData && edgeData.length > 0) {
        return edgeData;
      }
      if (useEdgeDirect) {
        const synced = await triggerEdgeConfigResync();
        if (synced) {
          const retryData = await edgeFetch('/api/edge/tables', { timeoutMs: EDGE_READ_TIMEOUT_MS });
          if (retryData && retryData.length > 0) return retryData;
        }
        return edgeData || [];
      }
      console.debug('[tableApi] edge returned empty tables, falling through to cloud');
    } catch (e) {
      if (useEdgeDirect) throw e;
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
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const edgeData = await edgeFetch('/api/edge/sections', { timeoutMs: EDGE_READ_TIMEOUT_MS });
      if (edgeData && edgeData.length > 0) {
        return edgeData;
      }
      if (useEdgeDirect) {
        const synced = await triggerEdgeConfigResync();
        if (synced) {
          const retryData = await edgeFetch('/api/edge/sections', { timeoutMs: EDGE_READ_TIMEOUT_MS });
          if (retryData && retryData.length > 0) return retryData;
        }
        return edgeData || [];
      }
      console.debug('[tableApi] edge returned empty sections, falling through to cloud');
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[tableApi] edge fetch sections failed, falling through to cloud:', e);
    }
  }
  const res = await fetchWithRetry(apiUrl(`/api/sections?restaurantId=${encodeURIComponent(restaurantId)}`), {
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export async function fetchVenues(restaurantId = getCurrentRestaurantId()) {
  // ── Edge server first (local SQLite) ────────────────────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      const edgeData = await edgeFetch('/api/edge/venues', { timeoutMs: EDGE_READ_TIMEOUT_MS });
      if (edgeData && edgeData.length > 0) {
        return edgeData;
      }
      if (useEdgeDirect) {
        const synced = await triggerEdgeConfigResync();
        if (synced) {
          const retryData = await edgeFetch('/api/edge/venues', { timeoutMs: EDGE_READ_TIMEOUT_MS });
          if (retryData && retryData.length > 0) return retryData;
        }
        return edgeData || [];
      }
      console.debug('[tableApi] edge returned empty venues, falling through to cloud');
    } catch (e) {
      if (useEdgeDirect) throw e;
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

export async function updateTableStatus(tableId, status, requestId = null) {
  const reqId = requestId || generateRequestId();
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/table/${tableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, requestId: reqId }),
      });
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[tableApi] edge status update failed, falling through to cloud:', e);
    }
  }

  const res = await fetchWithRetry(apiUrl(`/api/tables/${tableId}/status`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ status, requestId: reqId }),
  });
  return parseResponse(res);
}

export async function updateTableSession(tableId, session) {
  const reqId = session.requestId || generateRequestId();
  const sessionWithId = { ...session, requestId: reqId };
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/table/${tableId}/session`, {
        method: 'PATCH',
        body: JSON.stringify(sessionWithId),
      });
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[tableApi] edge session update failed, falling through to cloud:', e);
    }
  }

  const res = await fetchWithRetry(apiUrl(`/api/tables/${tableId}/session`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(sessionWithId),
  });
  return parseResponse(res);
}

export async function createTable({ number, capacity, sectionId, restaurantId, requestId = null }) {
  const reqId = requestId || generateRequestId();
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/admin/table', {
        method: 'POST',
        body: JSON.stringify({ number, capacity, sectionId, requestId: reqId }),
      });
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[tableApi] edge create table failed, falling through to cloud:', e);
    }
  }

  // POST create is non-idempotent — disable retries (requestId handles dedup on retry)
  const res = await fetchWithRetry(apiUrl("/api/tables"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ number, capacity, sectionId, restaurantId, requestId: reqId }),
  }, { retries: 0 });
  return parseResponse(res);
}

export async function bulkCreateTables({ sectionId, count, capacity, startNumber, requestId = null }) {
  const reqId = requestId || generateRequestId();
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/admin/tables/bulk', {
        method: 'POST',
        body: JSON.stringify({ sectionId, count, capacity, startNumber, requestId: reqId }),
      });
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[tableApi] edge bulk create failed, falling through to cloud:', e);
    }
  }

  // POST create is non-idempotent — disable retries
  const res = await fetchWithRetry(apiUrl("/api/tables/bulk"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ sectionId, count, capacity, startNumber, requestId: reqId }),
  }, { retries: 0 });
  return parseResponse(res);
}

export async function deleteTable(tableId, requestId = null) {
  const reqId = requestId || generateRequestId();
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/table/${tableId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: reqId }),
      });
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[tableApi] edge delete table failed, falling through to cloud:', e);
    }
  }

  const res = await fetchWithRetry(apiUrl(`/api/tables/${tableId}`), {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ requestId: reqId }),
  });
  return parseResponse(res);
}

export async function deleteAllTables(requestId = null) {
  const reqId = requestId || generateRequestId();
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      return await edgeFetch('/api/edge/admin/tables/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: reqId }),
      });
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[tableApi] edge delete all failed, falling through to cloud:', e);
    }
  }

  const res = await fetchWithRetry(apiUrl("/api/tables/all"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ requestId: reqId }),
  });
  return parseResponse(res);
}

// ── Venue CRUD ──────────────────────────────────────────────────────────────

export async function createVenue({ name, venueType, kotEnabled, sortOrder }) {
  const res = await fetchWithRetry(apiUrl("/api/venues"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name, venueType, kotEnabled, sortOrder }),
  });
  return parseResponse(res);
}

export async function updateVenue(id, { name, venueType, kotEnabled, sortOrder, isActive }) {
  const res = await fetchWithRetry(apiUrl(`/api/venues/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name, venueType, kotEnabled, sortOrder, isActive }),
  });
  return parseResponse(res);
}

export async function deleteVenue(id) {
  const res = await fetchWithRetry(apiUrl(`/api/venues/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// ── Section CRUD ────────────────────────────────────────────────────────────

export async function createSection({ name, venueId }) {
  const res = await fetchWithRetry(apiUrl("/api/sections"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name, venueId }),
  });
  return parseResponse(res);
}

export async function updateSection(id, { name, venueId, sortOrder }) {
  const res = await fetchWithRetry(apiUrl(`/api/sections/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name, venueId, sortOrder }),
  });
  return parseResponse(res);
}

export async function deleteSection(id) {
  const res = await fetchWithRetry(apiUrl(`/api/sections/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

// ── Table update (layout fields) ────────────────────────────────────────────

export async function updateTable(id, { number, capacity, sectionId, requestId = null }) {
  const reqId = requestId || generateRequestId();
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/admin/table/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ number, capacity, sectionId, requestId: reqId }),
      });
    } catch (e) {
      if (useEdgeDirect) throw e;
      console.debug('[tableApi] edge update table failed, falling through to cloud:', e);
    }
  }

  const res = await fetchWithRetry(apiUrl(`/api/tables/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ number, capacity, sectionId, requestId: reqId }),
  });
  return parseResponse(res);
}

export { API_BASE };
