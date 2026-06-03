import { apiUrl } from "./apiConfig";

const _cache = new Map();

export async function fetchUnifiedMenu(venue = "restaurant") {
  if (_cache.has(venue)) return _cache.get(venue);
  try {
    const res = await fetch(apiUrl(`/api/menu/unified?venue=${encodeURIComponent(venue)}`), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) {
      const empty = { success: false, venue, restaurantId: venue === 'bar' ? 'bar-001' : 'restaurant-001', categories: [] };
      return empty;
    }
    const data = await res.json();
    _cache.set(venue, data);
    // Expire cache after 60 seconds
    setTimeout(() => _cache.delete(venue), 60000);
    return data;
  } catch (error) {
    console.error("[unifiedMenuService] Failed to fetch unified menu:", error);
    return { success: false, venue, restaurantId: venue === 'bar' ? 'bar-001' : 'restaurant-001', categories: [] };
  }
}
