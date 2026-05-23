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
