import { API_BASE, apiUrl, getAuthHeaders } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
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
  const res = await fetch(apiUrl(`/api/sections?restaurantId=${encodeURIComponent(restaurantId)}`), {
    headers: getAuthHeaders(),
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

export async function deleteTable(tableId) {
  const res = await fetch(apiUrl(`/api/tables/${tableId}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return parseResponse(res);
}

export { API_BASE };
