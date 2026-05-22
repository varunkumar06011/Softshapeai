import { API_BASE } from "./apiConfig";

export const MENU_STORAGE_KEY = "softshape_menu";
export const MENU_QUERY_KEY = ["menu"];

const DEFAULT_MENU_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop";

const fetchOpts = {
  method: "GET",
  cache: "no-store",
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
};

export function readStoredMenu() {
  try {
    const saved = localStorage.getItem(MENU_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/** Flat /api/menu/items payload → POS item shape */
export function mapFlatMenuItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: item.id,
    n: item.name,
    p: Math.round(item.price ?? 0),
    c: item.category,
    t: item.isVeg ? "veg" : "non",
    img: item.imageUrl || DEFAULT_MENU_IMAGE,
    desc: item.description || "",
  }));
}

/** Legacy /api/menu/pos-view nested categories → POS items */
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

async function parseMenuResponse(res, label) {
  if (!res.ok) {
    let message = `${label} failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

async function fetchLeanMenu() {
  const res = await fetch(`${API_BASE}/api/menu/items`, fetchOpts);
  const items = await parseMenuResponse(res, "Menu items");
  return mapFlatMenuItems(items);
}

async function fetchPosViewMenu() {
  const res = await fetch(`${API_BASE}/api/menu/pos-view`, fetchOpts);
  const categories = await parseMenuResponse(res, "Menu pos-view");
  return mapPosViewToMenuItems(categories);
}

/** Prefer lean /items endpoint; fall back to pos-view */
export async function fetchMenuFromBackend() {
  let lean = [];
  try {
    lean = await fetchLeanMenu();
  } catch (err) {
    console.warn("[MenuService] /api/menu/items failed:", err.message);
  }

  if (lean.length > 0) return lean;

  const posView = await fetchPosViewMenu();
  if (posView.length > 0) return posView;

  throw new Error("Backend returned an empty menu. Run prisma seed on Railway.");
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

export { API_BASE };
