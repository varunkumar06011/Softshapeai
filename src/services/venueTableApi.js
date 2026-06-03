import { apiUrl } from "./apiConfig";
import { VENUE_ID } from "./venueApiConfig";

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
 * Fetch all venue sections with their tables.
 * Returns the same shape as GET /api/tables?restaurantId=venue-001
 */
export async function fetchVenueSections() {
  const res = await fetch(apiUrl(`/api/venue/sections`), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  return parseResponse(res);
}

export async function fetchVenueMenu(venueId = "venue-family-restaurant", restaurantId = "restaurant-001") {
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
