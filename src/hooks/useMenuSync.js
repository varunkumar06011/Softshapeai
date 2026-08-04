// ─────────────────────────────────────────────────────────────────────────────
// useMenuSync — Hook for syncing and filtering menu data from the backend
// ─────────────────────────────────────────────────────────────────────────────
// Wraps the useGlobalMenuSync service and provides filtered menu items
// suitable for POS displays (Cashier, Captain, Admin). Filters out:
//   - Inactive special items (isSpecial && !active)
//   - Expired special items (expiresAt < now)
//
// Returns:
//   menuItems — filtered array of menu items (excluding inactive/expired specials)
//   isLoadingMenu — true while initial load is in progress
//   loadError — error from the last load attempt (null if none)
//   setGlobalMenu — function to update the menu cache
//   refreshMenu — function to force-refresh from the backend
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { useGlobalMenuSync } from "../services/menuSyncService";

export function useMenuSync() {
  // isLoadingMenu replaces the old broken `globalMenu.length === 0` check
  const { globalMenu, isLoadingMenu, loadError, setGlobalMenu, refreshMenu, snapshot, syncProgress } =
    useGlobalMenuSync();

  const menuItems = useMemo(() => {
    // While loading and no menu data, return [] for backward compatibility
    // (many consumers call .map()/.filter() on this). Consumers that want
    // to distinguish "loading" from "empty" should check `loading` or `isSyncing`.
    if (isLoadingMenu && (!globalMenu || globalMenu.length === 0)) {
      return [];
    }
    const now = Date.now();
    // Filter out inactive or expired specials for standard menus (Cashier / Captain / Admin POS)
    return globalMenu.filter((item) => {
      if (!item.isSpecial) return true;
      if (!item.active) return false;
      if (item.expiresAt && now >= item.expiresAt) return false;
      return true;
    });
  }, [globalMenu, isLoadingMenu]);

  const isSyncing = isLoadingMenu && (!globalMenu || globalMenu.length === 0) && !!syncProgress;

  const categories = useMemo(() => {
    if (!globalMenu || globalMenu.length === 0) return ["All"];
    const ordered = [];
    const seen = new Set();
    for (const item of globalMenu) {
      const category = item.c;
      if (category && !seen.has(category)) {
        seen.add(category);
        ordered.push(category);
      }
    }
    return ["All", ...ordered];
  }, [globalMenu]);

  return {
    menuItems,           // Filtered list for Cashier, Captain, Admin POS ([] while loading)
    allMenuItems: globalMenu, // Full list from backend (expired specials now filtered server-side)
    updateMenu: setGlobalMenu,
    setMenuItems: setGlobalMenu,
    setGlobalMenu,
    loading: isLoadingMenu,  // Fixed: true only while genuinely loading, not when empty
    isSyncing,               // true when edge sync is actively in progress (shows progress UI)
    error: loadError,
    refreshMenu,
    categories,
    snapshot,           // MenuSnapshot state machine for UI display
    syncProgress,       // { stage, entity, percent } when edge sync is in progress
  };
}
