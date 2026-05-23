import { apiUrl } from "./apiConfig";
import { BAR_MENU_CACHE_KEY } from "./barApiConfig";

const DEFAULT_IMG = "https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop";

export function mapBarMenuItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: item.id,
    n: item.name,
    p: Math.round(item.price ?? 0),
    c: item.category,
    t: item.isVeg ? "veg" : "non",
    menuType: item.menuType || "FOOD",
    img: DEFAULT_IMG,
    variants: item.variants || [],
  }));
}

export async function fetchBarMenuFromBackend() {
  const res = await fetch(apiUrl("/api/bar/menu/items"), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) throw new Error(`Bar menu fetch failed (${res.status})`);
  const items = await res.json();
  return mapBarMenuItems(items);
}

export function readBarMenuCache() {
  try {
    const raw = localStorage.getItem(BAR_MENU_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function writeBarMenuCache(items) {
  try {
    localStorage.setItem(BAR_MENU_CACHE_KEY, JSON.stringify(items));
  } catch {}
}
