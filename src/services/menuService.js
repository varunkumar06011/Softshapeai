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
import { isEdgeAvailable, getEdgeUrl, isEdgeLocalAuth, edgeFetch, EDGE_READ_TIMEOUT_MS, waitForEdgeReady, triggerEdgeConfigResync } from "./edgeHealth.js";
import { getCachedMenu, cacheMenu } from "../utils/offlineDB";

async function edgeFetchMenuItems() {
  const items = await edgeFetch('/api/edge/menu/items', { timeoutMs: EDGE_READ_TIMEOUT_MS });
  return mapFlatMenuItems(items);
}

async function edgeFetchHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${getEdgeUrl()}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) return await res.json();
  } catch { /* edge unreachable */ }
  return null;
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
      await new Promise(r => setTimeout(r, 1000));
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
      venueAvailabilities: item.venueAvailabilities || {},
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

/** Offline-first menu fetch: load from IndexedDB first, then sync in background.
 *  Pass { bypassCache: true } to skip the IndexedDB fast-path — used when a
 *  config-change notification arrives so the refresh returns fresh edge/cloud
 *  data instead of stale cached items (e.g. newly added today specials). */
export async function fetchMenuFromBackend(restaurantId = getCurrentRestaurantId(), options = {}) {
  const { bypassCache = false } = options;
  if (!restaurantId || restaurantId === 'null' || restaurantId === 'undefined') {
    console.warn("[MenuService] No valid restaurantId provided, skipping backend fetch.");
    return readStoredMenu();
  }

  // ── Path 0: IndexedDB cache (instant render) ───────────────────────────────
  // Skipped when bypassCache is set (e.g. after a config.changed event) so we
  // always read fresh data from the edge server / cloud.
  if (!bypassCache) {
    try {
      const cachedMenu = await getCachedMenu(restaurantId);
      if (cachedMenu && cachedMenu.length > 0) {
        console.log(`[MenuService] Loaded ${cachedMenu.length} items from IndexedDB cache`);
        // Trigger background sync without blocking UI
        syncMenuInBackground(restaurantId);
        return cachedMenu;
      }
    } catch (err) {
      console.warn("[MenuService] IndexedDB cache read failed:", err.message);
    }
  }

  // ── Path 1: Edge server (local SQLite) — primary path ──────────────────────
  const useEdgeDirect = isEdgeLocalAuth();
  if (useEdgeDirect || await isEdgeAvailable()) {
    // When using edge-local auth (offline PIN login), cloud fallback is
    // impossible. If the edge server is still initializing (config sync
    // in progress), wait for it to become ready before reading the menu.
    // Without this, the menu fetch hits a half-synced SQLite DB and returns
    // an empty array, rendering a blank menu.
    if (useEdgeDirect) {
      await waitForEdgeReady(15_000);
    }
    try {
      const edgeItems = await edgeFetchMenuItems();
      if (edgeItems.length > 0) {
        console.log(`[MenuService] Loaded ${edgeItems.length} items from edge server`);
        // Cache to IndexedDB for offline use
        cacheMenu(restaurantId, edgeItems).catch(err => console.warn("[MenuService] Failed to cache menu:", err.message));
        return edgeItems;
      }
      // Edge returned empty menu. When using edge-local auth, cloud fallback
      // is impossible (fake token). Check verification status from /health
      // to surface a specific error, then trigger a config re-sync and retry.
      if (useEdgeDirect) {
        const health = await edgeFetchHealth();
        if (health && health.configSyncVerified === false) {
          const mismatches = health.configCountMismatches;
          if (mismatches && mismatches.length > 0) {
            console.warn('[MenuService] Edge sync verification failed — count mismatch:', mismatches);
          } else {
            console.warn('[MenuService] Edge sync verification failed — checksum/integrity mismatch');
          }
        }

        console.warn('[MenuService] Edge returned empty menu — triggering config re-sync');
        const synced = await triggerEdgeConfigResync();
        if (synced) {
          const retryItems = await edgeFetchMenuItems();
          if (retryItems.length > 0) {
            console.log(`[MenuService] Loaded ${retryItems.length} items after re-sync`);
            cacheMenu(restaurantId, retryItems).catch(() => {});
            return retryItems;
          }
        }
        // Return localStorage cache as last resort
        const cached = readStoredMenu(restaurantId);
        if (cached.length > 0) {
          console.warn('[MenuService] Using localStorage cache after empty edge menu');
          return cached;
        }
        return [];
      }
    } catch (err) {
      if (useEdgeDirect) {
        // Edge fetch failed entirely. Try localStorage cache before throwing.
        const cached = readStoredMenu(restaurantId);
        if (cached.length > 0) {
          console.warn('[MenuService] Edge fetch failed — using localStorage cache:', err.message);
          return cached;
        }
        throw err;
      }
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

  if (lean.length > 0) {
    cacheMenu(restaurantId, lean).catch(err => console.warn("[MenuService] Failed to cache menu:", err.message));
    return lean;
  }

  let posView = [];
  try {
    posView = await fetchPosViewMenu(restaurantId);
  } catch (err) {
    console.warn("[MenuService] /api/menu/pos-view failed:", err.message);
  }

  if (posView.length > 0) {
    cacheMenu(restaurantId, posView).catch(err => console.warn("[MenuService] Failed to cache menu:", err.message));
    return posView;
  }

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

/** Background sync: fetch from edge/cloud and update IndexedDB cache without blocking UI */
async function syncMenuInBackground(restaurantId) {
  try {
    const useEdgeDirect = isEdgeLocalAuth();
    let freshItems = null;

    if (useEdgeDirect || await isEdgeAvailable()) {
      try {
        freshItems = await edgeFetchMenuItems();
      } catch (err) {
        if (useEdgeDirect) return;
        console.warn("[MenuService] Background edge sync failed:", err.message);
      }
    }

    if (!freshItems || freshItems.length === 0) {
      try {
        freshItems = await fetchLeanMenu(restaurantId);
      } catch (err) {
        console.warn("[MenuService] Background cloud sync failed:", err.message);
      }
    }

    if (freshItems && freshItems.length > 0) {
      await cacheMenu(restaurantId, freshItems);
      console.log(`[MenuService] Background sync cached ${freshItems.length} items`);
      // Dispatch event to notify UI components to refresh
      window.dispatchEvent(new CustomEvent('menu-synced', { detail: { restaurantId, items: freshItems } }));
    }
  } catch (err) {
    console.warn("[MenuService] Background sync error:", err.message);
  }
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

// ── Edge-aware menu CRUD (cashier/captain local-first writes) ────────────────
// These wrappers try the edge server first (local SQLite + instant LAN push to
// captains + background cloud sync). If the edge is unavailable, they fall back
// to the direct cloud endpoints above. Auth is handled by the edge server's
// middleware (edge API key + runtime token headers, sent automatically by
// edgeFetch). isEdgeAvailable, edgeFetch, and getAuthHeaders are already
// imported at the top of this file.

function getEdgeAuthPayload() {
  // Include userId if available — the edge server may use it for audit logging.
  // No PIN required (auth is via edge API key + runtime token headers).
  try {
    const userStr = localStorage.getItem('ss_user') || localStorage.getItem('user');
    if (userStr) {
      const u = JSON.parse(userStr);
      return { userId: u.id };
    }
  } catch { /* ignore */ }
  return {};
}

export async function updateMenuItemEdge(id, data) {
  if (await isEdgeAvailable()) {
    try {
      const body = { ...data, ...getEdgeAuthPayload() };
      const res = await edgeFetch(`/api/edge/menu/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        timeoutMs: 10_000,
      });
      if (res && res.success) return res;
      // Edge returned an error response — fall through to cloud
      console.warn('[menuService] Edge update failed, falling back to cloud:', res?.error);
    } catch (err) {
      console.warn('[menuService] Edge update error, falling back to cloud:', err.message);
    }
  }
  return updateMenuItem(id, data);
}

export async function createMenuItemEdge(data) {
  if (await isEdgeAvailable()) {
    try {
      const body = { ...data, ...getEdgeAuthPayload() };
      const res = await edgeFetch(`/api/edge/menu/items`, {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: 10_000,
      });
      if (res && res.success) return res;
      console.warn('[menuService] Edge create failed, falling back to cloud:', res?.error);
    } catch (err) {
      console.warn('[menuService] Edge create error, falling back to cloud:', err.message);
    }
  }
  return createMenuItem(data);
}

export async function deleteMenuItemEdge(id) {
  if (await isEdgeAvailable()) {
    try {
      const body = { ...getEdgeAuthPayload() };
      const res = await edgeFetch(`/api/edge/menu/items/${id}`, {
        method: 'DELETE',
        body: JSON.stringify(body),
        timeoutMs: 10_000,
      });
      if (res && res.success) return res;
      console.warn('[menuService] Edge delete failed, falling back to cloud:', res?.error);
    } catch (err) {
      console.warn('[menuService] Edge delete error, falling back to cloud:', err.message);
    }
  }
  return deleteMenuItem(id);
}

export async function toggleAvailabilityEdge(id) {
  if (await isEdgeAvailable()) {
    try {
      const body = { ...getEdgeAuthPayload() };
      const res = await edgeFetch(`/api/edge/menu/items/${id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        timeoutMs: 10_000,
      });
      if (res && res.success) return res;
      console.warn('[menuService] Edge availability toggle failed, falling back to cloud:', res?.error);
    } catch (err) {
      console.warn('[menuService] Edge availability toggle error, falling back to cloud:', err.message);
    }
  }
  // Cloud fallback
  const res = await fetch(apiUrl(`/api/menu/admin/items/${id}/availability`), {
    method: 'PATCH',
    headers: { ...getAuthHeaders() },
  });
  return parseMenuResponse(res, 'Toggle availability');
}

export async function toggleMenuTypeEdge(id, printerTarget) {
  if (await isEdgeAvailable()) {
    try {
      const body = { ...getEdgeAuthPayload(), ...(printerTarget ? { printerTarget } : {}) };
      const res = await edgeFetch(`/api/edge/menu/items/${id}/menu-type`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        timeoutMs: 10_000,
      });
      if (res && res.success) return res;
      console.warn('[menuService] Edge menu-type toggle failed, falling back to cloud:', res?.error);
    } catch (err) {
      console.warn('[menuService] Edge menu-type toggle error, falling back to cloud:', err.message);
    }
  }
  // Cloud fallback — the cloud /menu-type endpoint toggles FOOD↔LIQUOR based on
  // the existing row's current menuType (it ignores any menuType in the body),
  // so we only forward printerTarget. Sending a hardcoded menuType here would
  // be misleading and would not influence the cloud behavior.
  const res = await fetch(apiUrl(`/api/menu/admin/items/${id}/menu-type`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(printerTarget ? { printerTarget } : {}),
  });
  return parseMenuResponse(res, 'Toggle menu type');
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
