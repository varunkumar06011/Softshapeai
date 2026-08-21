// ─────────────────────────────────────────────────────────────────────────────
// useInventoryData — shared hook for fetching, filtering, paginating inventory
// ─────────────────────────────────────────────────────────────────────────────
// Fetches bar or kitchen inventory from the backend, applies search/category/
// low-stock filters, paginates, and listens to socket events for live updates.
//
// Props:
//   tab: 'bar' | 'kitchen'
//   restaurant: the active restaurant object from useAuth()
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSocket } from '../../hooks/useSocket';
import {
  fetchBarInventory,
  fetchBarTopSelling,
} from '../../services/barInventoryApi';
import {
  fetchKitchenInventory,
  fetchKitchenTopSelling,
} from '../../services/kitchenInventoryApi';
import { getKolkataDateString } from '../../shared/utils/dateFormat';
import { SEARCH_DEBOUNCE_MS, PAGE_SIZE } from './inventoryConstants';

export function useInventoryData(tab, restaurant) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'low'
  const [page, setPage] = useState(0);
  const [topSelling, setTopSelling] = useState([]);
  // Date range for viewing historical inventory snapshots.
  // fromDate = the date whose opening stock is shown in the "Opening" column.
  // toDate = the date whose closing stock is shown as "Current Stock".
  // Defaults to today (live view).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Track the latest AbortController so socket-triggered refetches can be
  // aborted when a tab switch starts a new fetch. Without this, a socket event
  // firing during a tab switch could overwrite the new tab's data with the old
  // tab's data.
  const latestControllerRef = useRef(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch inventory data — uses fromDate for the daily entry lookup so the
  // "Opening" column reflects the selected date range start.
  const fetchData = useCallback(async (signal) => {
    if (!restaurant?.id) return;
    setLoading(true);
    setError(null);
    try {
      let data;
      // The backend accepts a single `date` param for the snapshot to display.
      // We use fromDate if set (that's the opening stock date); otherwise today.
      const snapshotDate = fromDate || getKolkataDateString();
      if (tab === 'bar') {
        data = await fetchBarInventory(snapshotDate);
      } else {
        data = await fetchKitchenInventory(snapshotDate);
      }
      // Ignore result if a newer fetch was triggered (tab switch, etc.)
      if (signal?.aborted) return;
      setItems(data || []);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err.message || 'Failed to load inventory');
      setItems([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tab, restaurant?.id, fromDate]);

  // Initial fetch + refetch on tab/restaurant change
  useEffect(() => {
    const controller = new AbortController();
    latestControllerRef.current = controller;
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Socket-triggered refetch — abort any in-flight fetch first, then start a
  // fresh one. This prevents a stale socket event from overwriting the current
  // tab's data if a tab switch happened between the event firing and the fetch
  // completing.
  const refetchForSocket = useCallback(() => {
    if (latestControllerRef.current) {
      latestControllerRef.current.abort();
    }
    const controller = new AbortController();
    latestControllerRef.current = controller;
    fetchData(controller.signal);
  }, [fetchData]);

  // Fetch top-selling data (for usage card) — uses the selected date range
  useEffect(() => {
    if (!restaurant?.id) return;
    const fetchTopSelling = async () => {
      try {
        const today = getKolkataDateString();
        const startDate = fromDate || today;
        const endDate = toDate || today;
        if (tab === 'bar') {
          const data = await fetchBarTopSelling({ startDate, endDate });
          setTopSelling(data || []);
        } else {
          const data = await fetchKitchenTopSelling({ startDate, endDate });
          setTopSelling(data || []);
        }
      } catch {
        setTopSelling([]);
      }
    };
    fetchTopSelling();
  }, [tab, restaurant?.id, fromDate, toDate]);

  // Socket listeners for live updates — refetch on inventory changes
  useSocket({
    'inventory:updated': useCallback(() => {
      refetchForSocket();
    }, [refetchForSocket]),
    'inventory:low_stock': useCallback(() => {
      refetchForSocket();
    }, [refetchForSocket]),
  });

  // Derive categories from loaded data (not hardcoded)
  const categories = useMemo(() => {
    const set = new Set();
    for (const item of items) {
      const cat = tab === 'bar' ? item.menuItem?.category?.name : item.category;
      if (cat) set.add(cat);
    }
    return ['all', ...Array.from(set).sort()];
  }, [items, tab]);

  // Filter items
  const filteredItems = useMemo(() => {
    let result = items;

    // Search filter
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      result = result.filter((item) => {
        const name = tab === 'bar' ? item.menuItem?.name : item.name;
        return name?.toLowerCase().includes(q);
      });
    }

    // Category filter
    if (category !== 'all') {
      result = result.filter((item) => {
        const cat = tab === 'bar' ? item.menuItem?.category?.name : item.category;
        return cat === category;
      });
    }

    // Low-stock filter
    if (filterStatus === 'low') {
      result = result.filter((item) => {
        const stock = Number(item.currentStock) || 0;
        const reorder = Number(item.reorderLevel) || 0;
        return reorder > 0 && stock <= reorder;
      });
    }

    return result;
  }, [items, debouncedSearch, category, filterStatus, tab]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const pagedItems = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  // Summary cards
  const summary = useMemo(() => {
    const totalItems = items.length;
    const lowStock = items.filter((item) => {
      const stock = Number(item.currentStock) || 0;
      const reorder = Number(item.reorderLevel) || 0;
      return reorder > 0 && stock <= reorder;
    }).length;
    const stockValue = items.reduce((sum, item) => {
      const stock = Number(item.currentStock) || 0;
      const rate = tab === 'bar'
        ? (Number(item.costPerBottle) || 0) * (stock / (Number(item.bottleSize) || 750))
        : Number(item.price) || 0;
      return sum + stock * rate;
    }, 0);
    const todayUsage = topSelling.reduce((sum, item) => {
      const qty = Number(item.totalQuantity || item.quantity || 0);
      const rate = Number(item.price || item.costPerBottle || 0);
      return sum + qty * rate;
    }, 0);
    return { totalItems, lowStock, stockValue, todayUsage };
  }, [items, topSelling, tab]);

  const refresh = useCallback(() => {
    refetchForSocket();
  }, [refetchForSocket]);

  return {
    items,
    filteredItems,
    pagedItems,
    loading,
    error,
    search,
    setSearch,
    debouncedSearch,
    category,
    setCategory,
    categories,
    filterStatus,
    setFilterStatus,
    page,
    setPage,
    totalPages,
    summary,
    refresh,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
  };
}
