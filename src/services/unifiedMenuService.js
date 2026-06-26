import { apiUrl, getAuthHeaders, API_BASE } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";

/**
 * Fetch public menu by restaurant slug (no auth required).
 * @param {string} slug - Restaurant slug
 * @param {string} venue - venue name
 * @param {string} [tableId] - Optional tableId for HMAC verification
 * @param {string} [sig] - Optional HMAC signature
 * @returns {Promise<{success: boolean, venue: string, restaurantId: string, restaurantName: string, tableNumber: number, categories: Array}>}
 */
export async function fetchPublicMenu(slug, venue = "restaurant", tableId, sig) {
  try {
    let url = apiUrl(`/api/menu/public/${encodeURIComponent(slug)}?venue=${encodeURIComponent(venue)}`);
    if (tableId && sig) {
      url += `&tableId=${encodeURIComponent(tableId)}&sig=${encodeURIComponent(sig)}`;
    }
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });

    if (!res.ok) {
      console.warn(`[unifiedMenuService] public menu not available (${res.status})`);
      return { success: false, venue, restaurantId: null, categories: [] };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error("[unifiedMenuService] Failed to fetch public menu:", error);
    return { success: false, venue, restaurantId: null, categories: [] };
  }
}

/**
 * Fetch unified menu from the shared endpoint
 * @param {string} venue - venue name: 'bar', 'restaurant', 'bar-ac-hall', 'bar-conference', 'bar-pdr', 'bar-rooms', 'bar-parcel', 'family-restaurant', 'restaurant-parcel'
 * @returns {Promise<{success: boolean, venue: string, restaurantId: string, categories: Array}>}
 */
export async function fetchUnifiedMenu(venue = "restaurant") {
  try {
    const res = await fetch(apiUrl(`/api/menu/unified?venue=${encodeURIComponent(venue)}`), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache", ...getAuthHeaders() },
    });

    if (!res.ok) {
      console.warn(`[unifiedMenuService] unified menu not available (${res.status}), returning empty menu`);
      return { success: false, venue, restaurantId: getCurrentRestaurantId(), categories: [] };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error("[unifiedMenuService] Failed to fetch unified menu:", error);
    return { success: false, venue, restaurantId: getCurrentRestaurantId(), categories: [] };
  }
}
