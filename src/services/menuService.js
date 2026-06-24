import { API_BASE, apiUrl, getAuthHeaders } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { getScopedCacheKey, LEGACY_UNSCOPED_KEYS } from "../utils/cacheKeys";

export const MENU_STORAGE_KEY = "softshape_menu";
export const MENU_QUERY_KEY = ["menu"];

export function getMenuStorageKey(restaurantId) {
  return getScopedCacheKey(MENU_STORAGE_KEY, restaurantId);
}

const DEFAULT_MENU_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop";

const FETCH_TIMEOUT_MS = 60000; // 60-second timeout per request

const fetchOpts = {
  method: "GET",
  cache: "no-store",
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...getAuthHeaders(),
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

/** Fetch with timeout AND retry for resilient menu loading */
async function fetchWithRetry(url, options, { retries = 3, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  try {
    return await fetchWithTimeout(url, options, timeoutMs);
  } catch (err) {
    // Only retry on network errors, not on abort errors
    if (retries > 0 && err.name !== 'AbortError' && !err.message?.includes('aborted')) {
      console.warn(`[MenuService] Retrying ${url} after error:`, err.message);
      await new Promise(r => setTimeout(r, 5000));
      return fetchWithRetry(url, options, { retries: retries - 1, timeoutMs });
    }
    throw err;
  }
}

export function readStoredMenu(restaurantId = getCurrentRestaurantId()) {
  try {
    // Evict stale un-scoped menu cache
    LEGACY_UNSCOPED_KEYS.forEach(k => {
      if (k === MENU_STORAGE_KEY) localStorage.removeItem(k);
    });
    const saved = localStorage.getItem(getMenuStorageKey(restaurantId));
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/** Flat /api/menu/items payload → POS item shape */
export function mapFlatMenuItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const menuType = (item.menuType || "FOOD").toUpperCase();
    const isLiquor = menuType === "LIQUOR";
    return {
      id: item.id,
      n: item.name,
      p: Math.round(item.price ?? 0),
      c: item.category,
      t: item.isVeg ? "veg" : "non",
      img: item.imageUrl || DEFAULT_MENU_IMAGE,
      desc: item.description || "",
      menuType,
      // isAvailable is only present on admin endpoint items;
      // POS /items filters to available=true so field is absent there — default true
      isAvailable: item.isAvailable !== false,
      variants: item.variants || [],
      unit: item.unit ?? (isLiquor ? "ml" : null),
      mlPerUnit: isLiquor ? 30 : null,
      printerTarget: isLiquor ? "BAR_PRINTER" : "KOT_PRINTER",
    };
  });
}

/** Legacy /api/menu/pos-view nested categories → POS items */
export function mapPosViewToMenuItems(categories) {
  if (!Array.isArray(categories)) return [];

  const items = [];
  for (const category of categories) {
    for (const item of category.items || []) {
      const defaultVariant =
        item.variants?.find((v) => v.isDefault) || item.variants?.[0];
      const menuType = (item.menuType || "FOOD").toUpperCase();
      const isLiquor = menuType === "LIQUOR";
      items.push({
        id: item.id,
        n: item.name,
        p: Math.round(defaultVariant?.price ?? 0),
        c: category.name,
        t: item.isVeg ? "veg" : "non",
        img: item.imageUrl || DEFAULT_MENU_IMAGE,
        desc: item.description || "",
        menuType,
        isAvailable: true,
        variants: item.variants || [],
        unit: item.unit ?? (isLiquor ? "ml" : null),
        mlPerUnit: isLiquor ? 30 : null,
        printerTarget: isLiquor ? "BAR_PRINTER" : "KOT_PRINTER",
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

async function fetchLeanMenu(restaurantId = getCurrentRestaurantId()) {
  const url = apiUrl(`/api/menu/items?restaurantId=${encodeURIComponent(restaurantId)}`);
  console.log("[MenuService] GET", url);
  const res = await fetchWithRetry(url, fetchOpts, { retries: 3, timeoutMs: 60000 });
  const items = await parseMenuResponse(res, "Menu items");
  return mapFlatMenuItems(items);
}

async function fetchPosViewMenu(restaurantId = getCurrentRestaurantId()) {
  const url = apiUrl(`/api/menu/pos-view?restaurantId=${encodeURIComponent(restaurantId)}`);
  console.log("[MenuService] GET", url);
  const res = await fetchWithRetry(url, fetchOpts, { retries: 3, timeoutMs: 60000 });
  const categories = await parseMenuResponse(res, "Menu pos-view");
  return mapPosViewToMenuItems(categories);
}

/** Prefer lean /items endpoint; fall back to pos-view; final fallback to localStorage cache */
export async function fetchMenuFromBackend(restaurantId = getCurrentRestaurantId()) {
  let lean = [];
  try {
    lean = await fetchLeanMenu(restaurantId);
  } catch (err) {
    console.warn("[MenuService] /api/menu/items failed:", err.message);
  }

  if (lean.length > 0) return lean;

  let posView = [];
  try {
    posView = await fetchPosViewMenu(restaurantId);
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
    "Check backend deployment status and ensure the service is active."
  );
}

export function persistMenu(menuItems, restaurantId = getCurrentRestaurantId()) {
  localStorage.setItem(getMenuStorageKey(restaurantId), JSON.stringify(menuItems));
  window.dispatchEvent(
    new CustomEvent("softshape_menu_updated", { detail: menuItems })
  );
}

export function clearStoredMenu(restaurantId = getCurrentRestaurantId()) {
  localStorage.removeItem(getMenuStorageKey(restaurantId));
}

export { API_BASE };
