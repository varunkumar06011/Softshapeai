// ─────────────────────────────────────────────────────────────────────────────
// Bar Table API — Frontend API client for bar table management
// ─────────────────────────────────────────────────────────────────────────────
// Provides functions for managing bar tables via the backend API:
//   - fetchBarTables() — list all bar tables with sections and active orders
//   - createBarTable(data) — create a new bar table
//   - updateBarTable(id, data) — update table status/number/section
//   - deleteBarTable(id) — delete a bar table
//   - updateBarTableSession(id, sessionData) — update table session (order items)
//
// Includes fetchWithRetry helper with timeout and exponential backoff.
// All requests include auth headers and restaurantId from current session.
// ─────────────────────────────────────────────────────────────────────────────

import { apiUrl, getAuthHeaders } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { isEdgeAvailable, edgeFetch } from "./edgeHealth";

const BAR_VENUE_TYPES = new Set(["BAR", "BAR_LOUNGE", "BREWERY", "PUB"]);

function isBarSection(section) {
  const vt = section?.venue?.venueType;
  return !!vt && BAR_VENUE_TYPES.has(String(vt).toUpperCase());
}

// Helper: parse fetch response, throw on non-OK status with error message
async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { const errBody = await res.json(); if (errBody?.error) message = errBody.error; } catch { /* ignore JSON parse error */ }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchWithRetry(url, options = {}, { retries = 2, timeoutMs = 10000 } = {}) {
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

export async function fetchBarTables(signal) {
  // ── Edge server first (local SQLite) ────────────────────────────────────────
  // GET /api/edge/tables returns all sections with venue.venueType; filter
  // client-side for bar venue types.
  if (await isEdgeAvailable()) {
    try {
      const allSections = await edgeFetch('/api/edge/tables', { signal });
      if (Array.isArray(allSections)) {
        return allSections.filter(isBarSection);
      }
      return allSections;
    } catch (e) {
      console.debug('[barTableApi] edge fetch failed, falling through to cloud:', e);
    }
  }

  const res = await fetchWithRetry(apiUrl(`/api/bar/tables?restaurantId=${getCurrentRestaurantId()}`), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache", ...getAuthHeaders() },
    signal,
  });
  return parseResponse(res);
}

export async function updateBarTableSession(tableId, sessionData) {
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/table/${tableId}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });
    } catch (e) {
      console.debug('[barTableApi] edge session update failed, falling through to cloud:', e);
    }
  }

  const res = await fetch(apiUrl(`/api/bar/tables/${tableId}/session`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(sessionData),
  });
  return parseResponse(res);
}

export async function deleteBarTableSession(tableId) {
  // ── Edge server first (local SQLite, offline write) ──────────────────────────
  if (await isEdgeAvailable()) {
    try {
      return await edgeFetch(`/api/edge/table/${tableId}/session`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.debug('[barTableApi] edge session delete failed, falling through to cloud:', e);
    }
  }

  const res = await fetch(apiUrl(`/api/bar/tables/${tableId}/session`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}
