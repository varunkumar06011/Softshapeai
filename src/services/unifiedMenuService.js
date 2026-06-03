import { apiUrl } from "./apiConfig";

/**
 * Fetch unified menu from the shared endpoint
 * @param {string} venue - venue name: 'bar', 'restaurant', 'conference1', 'conference2', 'pdr', 'rooms', 'parcel'
 * @returns {Promise<{success: boolean, venue: string, restaurantId: string, categories: Array}>}
 */
export async function fetchUnifiedMenu(venue = "restaurant") {
  try {
    const res = await fetch(apiUrl(`/api/menu/unified?venue=${encodeURIComponent(venue)}`), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    
    if (!res.ok) {
      throw new Error(`Unified menu fetch failed: ${res.status}`);
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error("[unifiedMenuService] Failed to fetch unified menu:", error);
    throw error;
  }
}
