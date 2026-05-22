import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchMenuFromBackend,
  persistMenu,
  readStoredMenu,
  MENU_QUERY_KEY,
  MENU_STORAGE_KEY,
} from "../services/menuService";

const MENU_STALE_MS = 5 * 60 * 1000;

export function useMenuSync() {
  const queryClient = useQueryClient();
  const cachedMenu = readStoredMenu();

  const {
    data: menuItems = cachedMenu,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: MENU_QUERY_KEY,
    queryFn: async () => {
      const items = await fetchMenuFromBackend();
      persistMenu(items);
      return items;
    },
    placeholderData: cachedMenu.length > 0 ? cachedMenu : undefined,
    staleTime: MENU_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MENU_STORAGE_KEY && e.newValue) {
        queryClient.setQueryData(MENU_QUERY_KEY, JSON.parse(e.newValue));
      }
    };
    const onMenuUpdated = (e) => {
      if (Array.isArray(e.detail)) {
        queryClient.setQueryData(MENU_QUERY_KEY, e.detail);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("softshape_menu_updated", onMenuUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("softshape_menu_updated", onMenuUpdated);
    };
  }, [queryClient]);

  const applyMenu = useCallback(
    (items) => {
      queryClient.setQueryData(MENU_QUERY_KEY, items);
      persistMenu(items);
    },
    [queryClient]
  );

  const updateMenu = useCallback(
    (newMenu) => {
      applyMenu(newMenu);
    },
    [applyMenu]
  );

  const setMenuItems = useCallback(
    (updater) => {
      queryClient.setQueryData(MENU_QUERY_KEY, (prev) => {
        const current = prev ?? [];
        const next = typeof updater === "function" ? updater(current) : updater;
        persistMenu(next);
        return next;
      });
    },
    [queryClient]
  );

  const refreshMenu = useCallback(async () => {
    const result = await refetch({ throwOnError: true });
    return result.data;
  }, [refetch]);

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

  const loading = isLoading && menuItems.length === 0;
  const isRefreshing = isFetching && !loading;

  return {
    menuItems,
    updateMenu,
    setMenuItems,
    loading,
    isRefreshing,
    error: error?.message ?? null,
    refreshMenu,
    categories,
  };
}
