import { apiUrl } from "./apiConfig";

/**
 * Fetch unified menu from the shared endpoint
 * @param {string} venue - venue name: 'bar', 'restaurant', 'bar-ac-hall', 'bar-conference', 'bar-pdr', 'bar-rooms', 'bar-parcel', 'family-restaurant', 'restaurant-parcel'
 * @param {string} slug - Restaurant.slug for multi-tenancy resolution
 * @param {string} tableId - Table.id for cross-validation
 * @returns {Promise<{success: boolean, venue: string, restaurantId: string, categories: Array}>}
 */
export async function fetchUnifiedMenu(venue = "restaurant", slug, tableId) {
  const params = new URLSearchParams();
  params.set("venue", venue);
  if (slug) params.set("slug", slug);
  if (tableId) params.set("tableId", tableId);

  try {
    const res = await fetch(apiUrl(`/api/menu/unified?${params.toString()}`), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });

    if (!res.ok) {
      console.warn(`[unifiedMenuService] unified menu not available (${res.status}), returning empty menu`);
      return { success: false, venue, restaurantId: null, categories: [] };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error("[unifiedMenuService] Failed to fetch unified menu:", error);
    return { success: false, venue, restaurantId: null, categories: [] };
  }
}
