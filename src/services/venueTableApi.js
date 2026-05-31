import { apiUrl } from "./apiConfig";
import { VENUE_ID } from "./venueApiConfig";

export { VENUE_ID };

async function parseResponse(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const b = await res.json();
      if (b?.error) message = b.error;
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

/**
 * Fetch venue menu items with venue-specific price overrides.
 * @param {string} venueId - e.g. "venue-conference1", "venue-pdr", etc.
 */
export async function fetchVenueMenu(venueId = "venue-conference1") {
  const res = await fetch(apiUrl(`/api/venue/menu?venueId=${encodeURIComponent(venueId)}`), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  return parseResponse(res);
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
