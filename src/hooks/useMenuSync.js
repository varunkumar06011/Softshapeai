import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchMenuFromBackend,
  persistMenu,
  MENU_STORAGE_KEY,
} from "../services/menuService";

function readStoredMenu() {
  try {
    const saved = localStorage.getItem(MENU_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function useMenuSync() {
  const [menuItems, setMenuItemsState] = useState(readStoredMenu);
  const [loading, setLoading] = useState(() => readStoredMenu().length === 0);
  const [error, setError] = useState(null);

  const applyMenu = useCallback((items) => {
    setMenuItemsState(items);
    persistMenu(items);
  }, []);

  const refreshMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchMenuFromBackend();
      applyMenu(items);
      return items;
    } catch (err) {
      setError(err.message || "Failed to load menu");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [applyMenu]);

  useEffect(() => {
    refreshMenu().catch(() => {});
  }, [refreshMenu]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MENU_STORAGE_KEY && e.newValue) {
        setMenuItemsState(JSON.parse(e.newValue));
      }
    };
    const onMenuUpdated = (e) => {
      if (Array.isArray(e.detail)) setMenuItemsState(e.detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("softshape_menu_updated", onMenuUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("softshape_menu_updated", onMenuUpdated);
    };
  }, []);

  const updateMenu = useCallback(
    (newMenu) => {
      applyMenu(newMenu);
    },
    [applyMenu]
  );

  const setMenuItems = useCallback(
    (updater) => {
      setMenuItemsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        persistMenu(next);
        return next;
      });
    },
    []
  );

  const categories = useMemo(() => {
    const ordered = [];
    const seen = new Set();
    for (const item of menuItems) {
      if (!seen.has(item.c)) {
        seen.add(item.c);
        ordered.push(item.c);
      }
    }
    return ["All", ...ordered];
  }, [menuItems]);

  return {
    menuItems,
    updateMenu,
    setMenuItems,
    loading,
    error,
    refreshMenu,
    categories,
  };
}
