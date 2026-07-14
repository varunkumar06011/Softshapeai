// ─────────────────────────────────────────────────────────────────────────────
// Menu Service — Restaurant menu data fetching, caching, and management
// ─────────────────────────────────────────────────────────────────────────────
// Core menu service for regular (non-bar) restaurants:
//   - fetchMenuFromBackend() — fetch menu from API with 60s timeout
//   - readMenuCache() / writeMenuCache() — localStorage cache (per-restaurant)
//   - fetchMenuCategories() — list categories
//   - createMenuItem() / updateMenuItem() / deleteMenuItem() — CRUD
//   - createCategory() / updateCategory() / deleteCategory() — category CRUD
//   - importMenuFromExcel() — bulk import from Excel file
//   - aiParseMenu() — AI parse menu from image (via Groq)
//
// Cache is scoped per restaurantId to prevent cross-tenant data leakage.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE, apiUrl, getAuthHeaders } from "./apiConfig";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { getScopedCacheKey, LEGACY_UNSCOPED_KEYS } from "../utils/cacheKeys";
import { isEdgeAvailable, getEdgeUrl } from "./edgeHealth.js";

async function edgeFetchMenuItems() {
  const res = await fetch(`${getEdgeUrl()}/api/edge/menu/items`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Edge menu fetch failed (${res.status})`);
  const items = await res.json();
  return mapFlatMenuItems(items);
}

// localStorage key prefix for menu cache
export const MENU_STORAGE_KEY = "softshape_menu";
// React Query key for menu queries
export const MENU_QUERY_KEY = ["menu"];

// Returns the scoped cache key for a specific restaurant's menu
export function getMenuStorageKey(restaurantId) {
  return getScopedCacheKey(MENU_STORAGE_KEY, restaurantId);
}

// Default placeholder image for items without uploaded images
const DEFAULT_MENU_IMAGE = "/placeholder.svg";

/** Normalize backend boolean values (true/false/1/0/"true"/"false") to boolean */
function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return Boolean(value);
}

// 60-second timeout for menu fetch requests (large menus may take time)
const FETCH_TIMEOUT_MS = 60000;

function buildFetchOpts() {
  return {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...getAuthHeaders(),
    },
  };
}

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
      isAvailable: item.isAvailable === undefined ? true : toBool(item.isAvailable),
      variants: item.variants || [],
      unit: item.unit ?? (isLiquor ? "ml" : null),
      mlPerUnit: isLiquor ? 30 : null,
      printerTarget: item.printerTarget || item.categoryPrinterTarget || null,
      printerName: item.printerName || null,
      venuePrices: item.venuePrices || {},
      // Liquor/bar items never carry GST; food uses stored flag (default true when unset)
      gstEnabled: isLiquor ? false : (item.gstEnabled === undefined || item.gstEnabled === null ? true : toBool(item.gstEnabled)),
      isSpecial: toBool(item.isSpecial),
      specialChannel: item.specialChannel || "BOTH",
      active: toBool(item.specialActive),
      expiresAt: item.specialExpiresAt ? new Date(item.specialExpiresAt).getTime() : null,
      outletId: item.outletId || null,
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
        printerTarget: item.printerTarget || item.categoryPrinterTarget || null,
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
  const res = await fetchWithRetry(url, buildFetchOpts(), { retries: 3, timeoutMs: 60000 });
  const items = await parseMenuResponse(res, "Menu items");
  return mapFlatMenuItems(items);
}

async function fetchPosViewMenu(restaurantId = getCurrentRestaurantId()) {
  const url = apiUrl(`/api/menu/pos-view?restaurantId=${encodeURIComponent(restaurantId)}`);
  console.log("[MenuService] GET", url);
  const res = await fetchWithRetry(url, buildFetchOpts(), { retries: 3, timeoutMs: 60000 });
  const categories = await parseMenuResponse(res, "Menu pos-view");
  return mapPosViewToMenuItems(categories);
}

/** Prefer edge server (local SQLite); then lean /items endpoint; fall back to pos-view; final fallback to localStorage cache */
export async function fetchMenuFromBackend(restaurantId = getCurrentRestaurantId()) {
  if (!restaurantId || restaurantId === 'null' || restaurantId === 'undefined') {
    console.warn("[MenuService] No valid restaurantId provided, skipping backend fetch.");
    return readStoredMenu();
  }

  // ── Path 1: Edge server (local SQLite) — primary path ──────────────────────
  if (await isEdgeAvailable()) {
    try {
      const edgeItems = await edgeFetchMenuItems();
      if (edgeItems.length > 0) {
        console.log(`[MenuService] Loaded ${edgeItems.length} items from edge server`);
        return edgeItems;
      }
    } catch (err) {
      console.warn("[MenuService] Edge server menu fetch failed:", err.message);
    }
  }

  // ── Path 2: Cloud backend — secondary path ─────────────────────────────────
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

export async function createMenuItem(data) {
  const res = await fetch(apiUrl('/api/menu/admin/items'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return parseMenuResponse(res, 'Create menu item');
}

export async function bulkImportSpecials(items, syncToAllOutlets = true) {
  const res = await fetch(apiUrl('/api/menu/admin/items/bulk-specials'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ items, syncToAllOutlets }),
  });
  return parseMenuResponse(res, 'Bulk import specials');
}

export async function updateMenuItem(id, data) {
  const res = await fetch(apiUrl(`/api/menu/admin/items/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return parseMenuResponse(res, 'Update menu item');
}

export async function deleteMenuItem(id) {
  const res = await fetch(apiUrl(`/api/menu/admin/items/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return parseMenuResponse(res, 'Delete menu item');
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
