const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  "https://softshape-backend.up.railway.app";

export const MENU_STORAGE_KEY = "softshape_menu";

const DEFAULT_MENU_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop";

/** Backend /api/menu/pos-view → POS item shape { id, n, p, c, t, img, desc } */
export function mapPosViewToMenuItems(categories) {
  if (!Array.isArray(categories)) return [];

  const items = [];
  for (const category of categories) {
    for (const item of category.items || []) {
      const defaultVariant =
        item.variants?.find((v) => v.isDefault) || item.variants?.[0];
      items.push({
        id: item.id,
        n: item.name,
        p: Math.round(defaultVariant?.price ?? 0),
        c: category.name,
        t: item.isVeg ? "veg" : "non",
        img: item.imageUrl || DEFAULT_MENU_IMAGE,
        desc: item.description || "",
      });
    }
  }
  return items;
}

export async function fetchMenuFromBackend() {
  const res = await fetch(`${API_BASE}/api/menu/pos-view`);
  if (!res.ok) {
    throw new Error(`Menu fetch failed (${res.status})`);
  }
  const categories = await res.json();
  return mapPosViewToMenuItems(categories);
}

export function persistMenu(menuItems) {
  localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(menuItems));
  window.dispatchEvent(
    new CustomEvent("softshape_menu_updated", { detail: menuItems })
  );
}

export function clearStoredMenu() {
  localStorage.removeItem(MENU_STORAGE_KEY);
}
