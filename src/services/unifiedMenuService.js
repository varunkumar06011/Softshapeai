import { apiUrl } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";

/**
 * Fetch unified menu from the shared endpoint
 * @param {string} venue - venue name: 'bar', 'restaurant', 'bar-ac-hall', 'bar-conference', 'bar-pdr', 'bar-rooms', 'bar-parcel', 'family-restaurant', 'restaurant-parcel'
 * @returns {Promise<{success: boolean, venue: string, restaurantId: string, categories: Array}>}
 */
export async function fetchUnifiedMenu(venue = "restaurant") {
  try {
    const res = await fetch(apiUrl(`/api/menu/unified?venue=${encodeURIComponent(venue)}`), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });

    if (!res.ok) {
      console.warn(`[unifiedMenuService] unified menu not available (${res.status}), returning empty menu`);
      return { success: false, venue, restaurantId: venue === 'bar' ? 'bar-001' : getCurrentRestaurantId(), categories: [] };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error("[unifiedMenuService] Failed to fetch unified menu:", error);
    return { success: false, venue, restaurantId: venue === 'bar' ? 'bar-001' : getCurrentRestaurantId(), categories: [] };
  }
}
