import { useState, useEffect } from "react";
import { fetchBarMenuFromBackend, readBarMenuCache, writeBarMenuCache } from "./barMenuService";

let barGlobalMenu = null;
let _isLoading = true;
let _loadError = null;
const subscribers = new Set();
let loadPromise = null;

function notifySubscribers() {
  subscribers.forEach((cb) => cb({ menu: barGlobalMenu ?? [], loading: _isLoading, error: _loadError }));
}

async function loadBarMenu() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    _isLoading = true;
    _loadError = null;
    notifySubscribers();
    try {
      barGlobalMenu = await fetchBarMenuFromBackend();
      writeBarMenuCache(barGlobalMenu);
      console.log(`[BarMenuSync] Loaded ${barGlobalMenu.length} items`);
    } catch (err) {
      console.error("[BarMenuSync] Failed:", err);
      _loadError = err?.message || "Could not reach backend.";
      barGlobalMenu = readBarMenuCache();
    }
    _isLoading = false;
    notifySubscribers();
  })();
  return loadPromise;
}

loadBarMenu();

export function useBarMenuSync() {
  const [state, setState] = useState({
    menuItems: barGlobalMenu ?? [],
    loading: _isLoading,
    error: _loadError,
  });

  useEffect(() => {
    const cb = ({ menu, loading, error }) =>
      setState({ menuItems: menu, loading, error });
    subscribers.add(cb);
    if (barGlobalMenu !== null) cb({ menu: barGlobalMenu, loading: _isLoading, error: _loadError });
    else loadBarMenu();
    return () => subscribers.delete(cb);
  }, []);

  const refreshMenu = () => {
    loadPromise = null;
    barGlobalMenu = null;
    loadBarMenu();
  };

  return { ...state, refreshMenu };
}

/**
 * Optimistically update a bar menu item in global state + cache,
 * then persist to the backend asynchronously.
 *
 * @param {string} itemId  - The item's DB id
 * @param {object} patch   - Fields to change: { n, t, p }
 *                           n → name, t → 'veg'|'non', p → price (single-variant)
 * @param {string} apiBase - API base URL (from apiConfig.API_BASE)
 */
export function updateBarMenuItem(itemId, patch, apiBase) {
  if (!barGlobalMenu) return;

  // 1. Apply optimistic update in-memory
  barGlobalMenu = barGlobalMenu.map((item) => {
    if (item.id !== itemId) return item;
    const updated = { ...item };
    if (patch.n !== undefined) updated.n = patch.n;
    if (patch.t !== undefined) updated.t = patch.t;
    if (patch.p !== undefined) {
      updated.p = Number(patch.p);
      if (updated.variants && updated.variants.length === 1) {
        updated.variants = [{ ...updated.variants[0], price: Number(patch.p) }];
      }
    }
    return updated;
  });

  // 2. Persist to cache immediately so a reload doesn't revert
  writeBarMenuCache(barGlobalMenu);
  notifySubscribers();

  // 3. Fire background API PATCH
  const body = {};
  if (patch.n !== undefined) body.name = patch.n;
  if (patch.t !== undefined) body.isVeg = patch.t === "veg";
  if (patch.p !== undefined) body.price = Number(patch.p);

  fetch(`${apiBase}/api/bar/menu/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        console.warn(`[BarMenuSync] PATCH ${itemId} failed (${res.status}):`, msg);
      } else {
        console.log(`[BarMenuSync] PATCH ${itemId} persisted`);
      }
    })
    .catch((err) => console.warn("[BarMenuSync] PATCH error:", err));
}
