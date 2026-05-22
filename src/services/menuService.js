import { API_BASE, apiUrl } from "./apiConfig";

export const MENU_STORAGE_KEY = "softshape_menu";
export const MENU_QUERY_KEY = ["menu"];

const DEFAULT_MENU_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop";

const FETCH_TIMEOUT_MS = 10000; // 10-second timeout per request

const fetchOpts = {
  method: "GET",
  cache: "no-store",
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
};

/** Wrap fetch with a timeout so DNS failures fail fast */
async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

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
  const url = apiUrl("/api/menu/items");
  console.log("[MenuService] GET", url);
  const res = await fetchWithTimeout(url, fetchOpts);
  const items = await parseMenuResponse(res, "Menu items");
  return mapFlatMenuItems(items);
}

async function fetchPosViewMenu() {
  const url = apiUrl("/api/menu/pos-view");
  console.log("[MenuService] GET", url);
  const res = await fetchWithTimeout(url, fetchOpts);
  const categories = await parseMenuResponse(res, "Menu pos-view");
  return mapPosViewToMenuItems(categories);
}

/** Prefer lean /items endpoint; fall back to pos-view; final fallback to localStorage cache */
export async function fetchMenuFromBackend() {
  let lean = [];
  try {
    lean = await fetchLeanMenu();
  } catch (err) {
    console.warn("[MenuService] /api/menu/items failed:", err.message);
  }

  if (lean.length > 0) return lean;

  let posView = [];
  try {
    posView = await fetchPosViewMenu();
  } catch (err) {
    console.warn("[MenuService] /api/menu/pos-view failed:", err.message);
  }

  if (posView.length > 0) return posView;

  // Final fallback: return cached menu from localStorage
  const cached = readStoredMenu();
  if (cached.length > 0) {
    console.warn(
      "[MenuService] Backend unreachable — using cached menu from localStorage"
    );
    return cached;
  }

  throw new Error(
    `Cannot reach backend at ${API_BASE}. ` +
    "Check Railway deployment and ensure the service has a public domain. " +
    "Go to Railway → your service → Settings → Generate Domain."
  );
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
