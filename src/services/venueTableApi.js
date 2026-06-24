import { apiUrl } from "./apiConfig";
import { VENUE_ID } from "./venueApiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";

export { VENUE_ID };

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error) message = errBody.error;
    } catch {}
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Fetch with timeout and retry logic for resilient API calls.
 * Timeout is 45000ms (well above the 8000ms minimum) to avoid premature AbortErrors.
 * If an external signal is provided via options.signal, it is linked to the internal
 * timeout controller so callers can cancel the request on unmount.
 */
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
    // Only retry on network errors, not on abort errors
    if (retries > 0 && err.name !== 'AbortError' && !err.message?.includes('aborted')) {
      console.warn(`[fetchWithRetry] Retrying ${url} after error:`, err.message);
      await new Promise(r => setTimeout(r, 1000)); // 1s backoff
      return fetchWithRetry(url, options, { retries: retries - 1, timeoutMs });
    }
    throw err;
  }
}

/**
 * Fetch all venue sections with their tables.
 * Returns the same shape as GET /api/tables?restaurantId=venue-001
 */
export async function fetchVenueSections(signal) {
  const res = await fetchWithRetry(apiUrl(`/api/venue/sections`), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    signal,
  }, { retries: 2, timeoutMs: 45000 });
  return parseResponse(res);
}

export async function fetchVenueMenu(venueId = "venue-family-restaurant", restaurantId = getCurrentRestaurantId()) {
  const cacheKey = `softshape_venue_menu_${venueId}`;

  // Try to load from localStorage first for instant return
  let cachedData = null;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      cachedData = JSON.parse(cached);
    }
  } catch (e) {
    console.error("Error reading venue menu from cache:", e);
  }

  const networkFetch = async () => {
    const res = await fetch(apiUrl(`/api/venue/menu?venueId=${encodeURIComponent(venueId)}`), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    const data = await parseResponse(res);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      console.error("Error saving venue menu to cache:", e);
    }
    return data;
  };

  if (cachedData) {
    // Silently refresh in the background so next load has the latest items
    networkFetch().catch(err => console.error("Background venue menu sync failed:", err));
    return cachedData;
  }

  return networkFetch();
}

/**
 * Update a table's session data (reuses existing /api/tables/:id/session endpoint).
 */
export async function updateVenueTableSession(tableId, sessionData) {
  const res = await fetch(apiUrl(`/api/tables/${tableId}/session`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sessionData),
  });
  return parseResponse(res);
}

/**
 * Bulk update venue prices.
 * @param {string} venueId - e.g. "venue-conference1"
 * @param {Array<{menuItemId: string, price: number}>} prices
 */
export async function updateVenuePrices(venueId, prices) {
  const res = await fetch(apiUrl(`/api/venue/prices`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ venueId, prices }),
  });
  return parseResponse(res);
}
