// ─────────────────────────────────────────────────────────────────────────────
// Menu Sync Service — Global menu state with pub/sub, caching, and React hook
// ─────────────────────────────────────────────────────────────────────────────
// Provides a singleton menu store with React hook integration:
//   - Fetches menu from backend on first access (lazy load)
//   - Caches to localStorage (per-restaurant scope with timestamp)
//   - Pub/sub pattern: components subscribe to menu updates
//   - useGlobalMenuSync() — React hook that re-renders on menu changes
//   - refreshMenu() — force re-fetch from backend
//   - setGlobalMenu() — update menu cache (used after mutations)
//
// Cache strategy: localStorage with timestamp, refreshed if older than 5 minutes.
// This is the regular restaurant equivalent of barMenuSyncService.js (for bar menus).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { fetchMenuFromBackend } from "./menuService";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { getScopedCacheKey, LEGACY_UNSCOPED_KEYS } from "../utils/cacheKeys";

// Base localStorage key for the unified menu cache
const BASE_STORAGE_KEY = "softshape_unified_menu";

// Returns the scoped cache key for a specific restaurant's menu
function getStorageKey(restaurantId = getCurrentRestaurantId()) {
  return getScopedCacheKey(BASE_STORAGE_KEY, restaurantId);
}

// Returns the timestamp key for cache freshness checking
function getTimestampKey(restaurantId = getCurrentRestaurantId()) {
  return `${getStorageKey(restaurantId)}:ts`;
}

function recordMenuCacheTimestamp(restaurantId = getCurrentRestaurantId()) {
  try {
    localStorage.setItem(getTimestampKey(restaurantId), String(Date.now()));
  } catch (e) {
    console.warn('[MenuSync] Failed to write cache timestamp', e);
  }
}

export function getMenuCacheAgeMs(restaurantId = getCurrentRestaurantId()) {
  try {
    const ts = localStorage.getItem(getTimestampKey(restaurantId));
    if (!ts) return Infinity;
    return Date.now() - Number(ts);
  } catch {
    return Infinity;
  }
}

// Initialize global menu from localStorage to allow instant rendering
let globalMenu = null;
try {
  const saved = localStorage.getItem(getStorageKey());
  if (saved) {
    globalMenu = JSON.parse(saved);
  }
  // Evict stale un-scoped unified menu cache
  LEGACY_UNSCOPED_KEYS.forEach(k => {
    if (k === BASE_STORAGE_KEY) localStorage.removeItem(k);
  });
} catch (e) {
  console.error("Failed to parse initial menu from local storage", e);
}

// If we already have a menu, we don't need to block UI with a loading screen
let _isLoading = !globalMenu || globalMenu.length === 0;
let _loadError = null;
const subscribers = new Set();
let loadPromise = null;

function dispatchMenuEvent(menu) {
  try {
    window.dispatchEvent(
      new CustomEvent("softshape_menu_updated", { detail: menu })
    );
  } catch (_) {}
}

function notifySubscribers() {
  subscribers.forEach((callback) =>
    callback({
      menu: globalMenu ?? [],
      loading: _isLoading,
      error: _loadError,
    })
  );
}

async function loadInitialMenu() {
  if (loadPromise) return loadPromise;

  const currentPromise = (async () => {
    // Only show loading if we have no cached menu
    _isLoading = !globalMenu || globalMenu.length === 0;
    _loadError = null;
    notifySubscribers();

    try {
      const apiItems = await fetchMenuFromBackend();
      const saved = localStorage.getItem(getStorageKey());
      const localItems = saved ? JSON.parse(saved) : [];

      const localSpecials = localItems.filter((i) => i.isSpecial);
      const specialNames = new Set(localSpecials.map((s) => s.n.toLowerCase()));
      const filteredBase = apiItems.filter(
        (m) => !specialNames.has(m.n.toLowerCase())
      );

      globalMenu = [...localSpecials, ...filteredBase];
      console.log(`[MenuSync] Loaded ${globalMenu.length} items from backend`);
    } catch (err) {
      console.error("[MenuSync] Failed to load initial menu", err);
      // Only surface error if we have absolutely nothing to show
      if (!globalMenu || globalMenu.length === 0) {
        _loadError =
          err?.message ||
          "Could not reach backend. Check VITE_API_URL and backend deployment.";
      }
      // Propagate error to callers instead of swallowing
      throw err;
    } finally {
      _isLoading = false;
      if (globalMenu?.length) {
        localStorage.setItem(getStorageKey(), JSON.stringify(globalMenu));
      }
      notifySubscribers();
      dispatchMenuEvent(globalMenu ?? []);
    }
  })();

  loadPromise = currentPromise;

  try {
    await currentPromise;
  } catch {
    // Error already handled inside the promise; clear loadPromise below
  } finally {
    // Only clear if this promise is still the current one (prevents race)
    if (loadPromise === currentPromise) {
      loadPromise = null;
    }
  }
}

export function useGlobalMenuSync() {
  const [menu, setMenu] = useState(() => {
    if (globalMenu) return globalMenu;
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    // Determine initial loading state
    if (globalMenu && globalMenu.length > 0) return false;
    return _isLoading;
  });
  const [error, setError] = useState(_loadError);

  useEffect(() => {
    const handleUpdate = ({ menu: newMenu, loading: isLoading, error: err }) => {
      setMenu(newMenu ?? []);
      setLoading(isLoading);
      setError(err);
    };

    subscribers.add(handleUpdate);
    // Notify immediately on mount in case it changed
    handleUpdate({
      menu: globalMenu,
      loading: _isLoading,
      error: _loadError,
    });

    loadInitialMenu();

    return () => {
      subscribers.delete(handleUpdate);
    };
  }, []);

  const setGlobalMenu = useCallback((updater) => {
    const nextMenu =
      typeof updater === "function"
        ? updater(globalMenu || menu || [])
        : updater;

    globalMenu = nextMenu;
    _isLoading = false;
    _loadError = null;
    localStorage.setItem(getStorageKey(), JSON.stringify(nextMenu));
    recordMenuCacheTimestamp();

    setMenu(nextMenu);
    notifySubscribers();
    dispatchMenuEvent(nextMenu);
  }, [menu]);

  const refreshMenu = useCallback(async () => {
    _isLoading = true;
    _loadError = null;
    notifySubscribers();

    try {
      const apiItems = await fetchMenuFromBackend();

      const activeSpecials = (globalMenu || menu || []).filter(
        (i) =>
          i.isSpecial &&
          i.active &&
          (!i.expiresAt || Date.now() < i.expiresAt)
      );
      const specialNames = new Set(
        activeSpecials.map((s) => s.n.toLowerCase())
      );
      const filteredBase = apiItems.filter(
        (m) => !specialNames.has(m.n.toLowerCase())
      );
      globalMenu = [...activeSpecials, ...filteredBase];
      _loadError = null;

      localStorage.setItem(getStorageKey(), JSON.stringify(globalMenu));
      recordMenuCacheTimestamp();
      setMenu(globalMenu);
      notifySubscribers();
      dispatchMenuEvent(globalMenu);

      return apiItems;
    } catch (err) {
      _loadError = err?.message || "Menu refresh failed";
      notifySubscribers();
      throw err;
    } finally {
      _isLoading = false;
      notifySubscribers();
    }
  }, [menu]);

  // Sync menu changes across different browser tabs
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === getStorageKey() && e.newValue) {
        try {
          const newMenu = JSON.parse(e.newValue);
          globalMenu = newMenu;
          setMenu(newMenu);
          notifySubscribers();
        } catch (err) {
          console.error("Failed to parse menu from storage", err);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Listen for socket menu update events from admin panel
  useEffect(() => {
    let debounceTimer = null;
    const handleMenuUpdate = (event) => {
      console.log("[MenuSync] Received menu-item-updated event:", event);
      const payload = event.detail;
      // Optimistic update: if payload has itemId + updatedItem, patch in memory immediately
      if (payload && payload.itemId && payload.updatedItem && globalMenu) {
        const updated = payload.updatedItem;
        const patched = globalMenu.map(item =>
          item.id === payload.itemId
            ? {
                ...item,
                n: updated.name ?? item.n,
                p: updated.price ?? item.p,
                t: updated.isVeg != null ? (updated.isVeg ? 'veg' : 'non') : item.t,
                c: updated.category != null ? String(updated.category) : item.c,
                imageUrl: updated.imageUrl ?? item.imageUrl,
                available: updated.isAvailable ?? item.available,
                menuType: updated.menuType ?? item.menuType,
              }
            : item
        );
        globalMenu = patched;
        localStorage.setItem(getStorageKey(), JSON.stringify(patched));
        recordMenuCacheTimestamp();
        notifySubscribers();
        dispatchMenuEvent(patched);
      }
      // Then debounced full refresh for correctness
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshMenu().catch(err => {
          console.error("[MenuSync] Failed to refresh menu after socket event:", err);
        });
      }, 800);
    };

    // Listen for custom event from socket wrapper
    window.addEventListener("menu-item-updated", handleMenuUpdate);

    return () => {
      window.removeEventListener("menu-item-updated", handleMenuUpdate);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [refreshMenu]);

  return {
    globalMenu: menu || [],
    isLoadingMenu: loading,
    loadError: error,
    setGlobalMenu,
    refreshMenu,
  };
}

