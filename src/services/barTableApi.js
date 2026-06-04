import { apiUrl } from "./apiConfig";
import { BAR_ID } from "./barApiConfig";

export { BAR_ID };

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { const errBody = await res.json(); if (errBody?.error) message = errBody.error; } catch {}
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchWithRetry(url, options = {}, { retries = 2, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (retries > 0 && (err.name === 'AbortError' || err.message?.includes('fetch'))) {
      console.warn(`[fetchWithRetry] Retrying ${url} after error:`, err.message);
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(url, options, { retries: retries - 1, timeoutMs });
    }
    throw err;
  }
}

export async function fetchBarTables() {
  const res = await fetchWithRetry(apiUrl(`/api/bar/tables?restaurantId=${BAR_ID}`), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  return parseResponse(res);
}

export async function updateBarTableSession(tableId, sessionData) {
  const res = await fetch(apiUrl(`/api/bar/tables/${tableId}/session`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sessionData),
  });
  return parseResponse(res);
}

export async function deleteBarTableSession(tableId) {
  const res = await fetch(apiUrl(`/api/bar/tables/${tableId}/session`), {
    method: "DELETE",
  });
  return parseResponse(res);
}
