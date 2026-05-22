import { useState, useEffect, useCallback } from "react";
import { fetchMenuFromBackend } from "./menuService";

const STORAGE_KEY = "softshape_unified_menu";

let globalMenu = null;
let _isLoading = true;
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

  loadPromise = (async () => {
    _isLoading = true;
    _loadError = null;
    notifySubscribers();

    try {
      const apiItems = await fetchMenuFromBackend();
      const saved = localStorage.getItem(STORAGE_KEY);
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
      _loadError =
        err?.message ||
        "Could not reach backend. Check VITE_API_URL and backend deployment.";
      const saved = localStorage.getItem(STORAGE_KEY);
      globalMenu = saved ? JSON.parse(saved) : [];
    }

    _isLoading = false;
    if (globalMenu?.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(globalMenu));
    }
    notifySubscribers();
    dispatchMenuEvent(globalMenu ?? []);
  })();

  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export function useGlobalMenuSync() {
  const [menu, setMenu] = useState(() => {
    if (globalMenu) return globalMenu;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(_isLoading);
  const [error, setError] = useState(_loadError);

  useEffect(() => {
    const handleUpdate = ({ menu: newMenu, loading: isLoading, error: err }) => {
      setMenu(newMenu ?? []);
      setLoading(isLoading);
      setError(err);
    };

    subscribers.add(handleUpdate);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMenu));

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

      localStorage.setItem(STORAGE_KEY, JSON.stringify(globalMenu));
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

  return {
    globalMenu: menu || [],
    isLoadingMenu: loading,
    loadError: error,
    setGlobalMenu,
    refreshMenu,
  };
}
