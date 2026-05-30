import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Table2, ClipboardList, ShoppingCart, Settings, LogOut, Bell, Search,
  ChevronDown, Clock, CheckCircle2, AlertCircle, User, MoreVertical, Plus, Minus,
  Trash2, CreditCard, Banknote, Smartphone, Split, History, ChefHat, Monitor,
  Printer, X, Check, Zap, ArrowRight, Filter, Layers, ArrowUpRight, Loader2, Timer,
  TrendingUp, Users, Package, Wallet, ArrowRightLeft, Activity, BarChart3
} from 'lucide-react';
import { useMenu } from '../context/MenuContext';
import { useTableSync } from '../services/tableSyncService';
import { saveTransaction, fetchTransactions, createOrder, updateOrderItems, updateOrderStatus, editBill, swapTable, requestBilling } from '../services/orderApi';
import { printBillQZ, printKOTQZ } from '../services/printService';
import { calculateOrderTotal, calculateSessionBill, calculateTableBill, getTableItems } from '../shared/utils/billing';
import { filterMenuItems } from '../shared/utils/menuSearch';
import { useSocket } from '../hooks/useSocket';
import LiveTimer from '../shared/components/LiveTimer';
import { RESTAURANT_ID } from '../services/tableApi';
import { useOutlet } from '../context/OutletContext';
import OutletToggle from '../shared/components/OutletToggle';
import BarMenuToggle from '../shared/components/BarMenuToggle';
import VariantPicker from '../shared/components/VariantPicker';
import { useBarTableSync } from '../services/barTableSyncService';
import { useBarMenuSync } from '../services/barMenuSyncService';
import { BAR_ID } from '../services/barApiConfig';
import ItemAnalytics from './ItemAnalytics';
import { API_BASE } from '../services/apiConfig';

const isSubsequence = (q, text) => {
  let i = 0;
  for (let j = 0; j < text.length; j++) {
    if (text[j] === q[i]) {
      i++;
      if (i === q.length) return true;
    }
  }
  return false;
};

const getSearchRank = (item, query) => {
  const name = (item.n || item.name || '').toLowerCase();
  const category = (item.c || item.category || '').toLowerCase();
  const desc = (item.desc || item.description || '').toLowerCase();

  const q = query.trim().toLowerCase();
  if (!q) return 0;

  // Space-stripped versions for space-insensitive and compact matching
  const nameCompact = name.replace(/\s+/g, '');
  const qCompact = q.replace(/\s+/g, '');

  // Rank 1: Product name starts with query (with spaces)
  if (name.startsWith(q)) return 1;

  // Rank 2: Product name starts with query (space-stripped)
  if (qCompact && nameCompact.startsWith(qCompact)) return 2;

  // Rank 3: A word inside the product name starts with search query
  const words = name.split(/\s+/).filter(Boolean);
  if (words.some(word => word.startsWith(q))) return 3;

  // Rank 4: Product name contains search query (substring, with spaces)
  if (name.includes(q)) return 4;

  // Rank 5: Product name contains search query (substring, space-stripped)
  if (qCompact && nameCompact.includes(qCompact)) return 5;

  // Rank 6: Initials/Acronym match
  // e.g. "Veg Fried Rice" initials are "vfr". If query matches initials.
  const initials = words.map(w => w[0]).join('');
  if (qCompact && (initials.startsWith(qCompact) || isSubsequence(qCompact, initials))) return 6;

  // Rank 7: Category match (space-insensitive)
  if (category.includes(q) || (qCompact && category.replace(/\s+/g, '').includes(qCompact))) return 7;

  // Rank 8: Subsequence match of name (space-insensitive)
  if (qCompact && isSubsequence(qCompact, nameCompact)) return 8;

  // Rank 9: Description match
  if (desc.includes(q) || (qCompact && desc.replace(/\s+/g, '').includes(qCompact))) return 9;

  return 10;
};

const itemMatchesQuery = (item, q) => {
  if (!q) return true;
  const rank = getSearchRank(item, q);
  if (q.trim().length === 1) {
    // For single-letter queries, be strict to avoid matching every card containing the letter.
    // Allow name starts with, word starts with, or category match.
    return rank <= 3 || rank === 7;
  }
  return rank < 10;
};

const HighlightedText = ({ text, highlight }) => {
  if (!highlight || !highlight.trim()) return <span>{text}</span>;
  
  const q = highlight.toLowerCase().replace(/\s+/g, '');
  if (!q) return <span>{text}</span>;

  const parts = [];
  let qIdx = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (qIdx < q.length && char.toLowerCase() === q[qIdx]) {
      parts.push(
        <mark key={i} className="bg-yellow-100 text-[#E53935] font-black rounded-sm px-0.5">
          {char}
        </mark>
      );
      qIdx++;
    } else {
      parts.push(char);
    }
  }

  return <span>{parts}</span>;
};

const CashierDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('cashier_active_tab') || 'dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeDiet, setActiveDiet] = useState('All');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);
  const [cart, setCart] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showTableModal, setShowTableModal] = useState(false);
  const [isKotSending, setIsKotSending] = useState(false);
  const [isKotSuccess, setIsKotSuccess] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('UPI');
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isPrintingBill, setIsPrintingBill] = useState(false);
  const [lastPrintTime, setLastPrintTime] = useState(null);
  const [printCooldown, setPrintCooldown] = useState(false);
  // Set of orderIds that have already been settled this session — prevents double-settlement
  const [settledOrderIds, setSettledOrderIds] = useState(() => new Set());
  const [discountPercent, setDiscountPercent] = useState(0);
  const [isCartMinimized, setIsCartMinimized] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Table-swap state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    let cooldownTimer = null;
    return () => {
      if (cooldownTimer) clearTimeout(cooldownTimer);
    };
  }, []);

  const [removedItemIds, setRemovedItemIds] = useState([]);
  const [showBillEditor, setShowBillEditor]     = useState(false);
  const [billRemovals, setBillRemovals]         = useState([]); // orderItemIds to remove
  const [billAdditions, setBillAdditions]       = useState([]); // { menuItemId, name, price, quantity, menuType }
  const [billEditSearch, setBillEditSearch]     = useState('');
  const [isSavingBillEdit, setIsSavingBillEdit] = useState(false);

  useEffect(() => {
    setRemovedItemIds([]);
    setBillRemovals([]);
    setBillAdditions([]);
    setBillEditSearch('');
  }, [selectedTable?.backendId]);

  const { outlet } = useOutlet();
  const TX_CACHE_KEY = `softshape_transactions_${outlet}_${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}`;

  const [pastTransactions, setPastTransactions] = useState(() => {
    // Start with localStorage cache for instant display
    try {
      const saved = localStorage.getItem(TX_CACHE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [expandedTxnId, setExpandedTxnId] = useState(null);
  const [txnDateFilter, setTxnDateFilter] = useState('today'); // 'today' | 'yesterday' | 'month' | 'all'
  const txnDateFilterRef = useRef('today'); // Keeps latest filter accessible inside closures without re-subscribing
  const [txnMethodFilter, setTxnMethodFilter] = useState('all'); // 'all' | 'CASH' | 'UPI' | 'CARD'
  const [txnSearch, setTxnSearch] = useState('');

  const { menuItems, categories, loading: menuLoading } = useMenu();
  const { tables, setTables } = useTableSync();

  const { tables: barTables, setTables: setBarTables } = useBarTableSync();
  const { menuItems: barMenuItems } = useBarMenuSync();
  const [barMenuTab, setBarMenuTab] = useState('food');
  const [variantPickerItem, setVariantPickerItem] = useState(null);

  // Derived — restaurant or bar depending on outlet
  const activeTables = outlet === 'bar' ? barTables : tables;
  const setActiveTables = outlet === 'bar' ? setBarTables : setTables;
  const activeRestaurantId = outlet === 'bar' ? BAR_ID : RESTAURANT_ID;

  const socket = useSocket(activeRestaurantId);

  function formatBillNumber(txnDate, txnNumber) {
    if (!txnDate || !txnNumber) return 'Bill #—';
    const datePart = String(txnDate || '').replace(/-/g, '').slice(2); // "YYYY-MM-DD" → "YYMMDD"
    const seqPart = String(txnNumber).padStart(3, '0');   // 7 → "007"
    return `${datePart}-${seqPart}`;
  }

  const loadTransactions = useCallback(async (filter = 'today') => {
    setTxnsLoading(true);
    setPastTransactions([]);
    try {
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const nowIST = new Date(Date.now() + IST_OFFSET_MS);

      let dateParam = null;
      let monthParam = null;
      let limitParam = 200;

      if (filter === 'today') {
        dateParam = nowIST.toISOString().slice(0, 10);
      } else if (filter === 'yesterday') {
        const yest = new Date(nowIST);
        yest.setDate(yest.getDate() - 1);
        dateParam = yest.toISOString().slice(0, 10);
      } else if (filter === 'month') {
        monthParam = nowIST.toISOString().slice(0, 7); // 'YYYY-MM'
        limitParam = 500;
      } else {
        // 'all' — no date filter
        limitParam = 500;
      }

      const dbTxns = await fetchTransactions(activeRestaurantId, limitParam, dateParam, monthParam);
      const mapped = dbTxns.map(txn => ({
        id: txn.id,
        txnNumber: txn.txnNumber || null,
        displayId: formatBillNumber(txn.txnDate, txn.txnNumber),
        kot: txn.orderId ? `ORD-${txn.orderId.slice(-6).toUpperCase()}` : '—',
        amount: Number(txn.amount || 0),
        time: new Date(txn.paidAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
        date: new Date(txn.paidAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }),
        timestamp: new Date(txn.paidAt).getTime(),
        items: txn.itemCount || 0,
        itemsList: txn.items || [],
        captainId: txn.captainId || 'CASHIER',
        method: txn.method || 'UPI',
        tableNumber: txn.tableNumber || null,
      }));
      setPastTransactions(mapped);
      if (filter === 'today') {
        localStorage.setItem(TX_CACHE_KEY, JSON.stringify(mapped));
      }
    } catch (err) {
      console.warn('[Transactions] DB fetch failed, using cache:', err.message);
    } finally {
      setTxnsLoading(false);
    }
  }, [TX_CACHE_KEY, activeRestaurantId]);

  // FIX 2: Filtered transactions based on method and search
  const filteredTransactions = useMemo(() => {
    let list = pastTransactions;

    // Method filter
    if (txnMethodFilter !== 'all') {
      list = list.filter(txn => txn.method === txnMethodFilter);
    }

    // Search by bill number — matches partial string on displayId
    if (txnSearch.trim()) {
      const q = txnSearch.trim().toLowerCase();
      list = list.filter(txn =>
        (txn.displayId || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [pastTransactions, txnMethodFilter, txnSearch]);

  // Real-time billing alert state
  const [billingAlerts, setBillingAlerts] = useState([]);

  const addNotification = (title, desc, type = 'success') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, title, desc, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };


  useEffect(() => {
    const onBillingRequested = (payload) => {
      const { table, order } = payload;
      if (!table) return;

      // Add to billing alerts queue for cashier attention
      setBillingAlerts(prev => {
        const exists = prev.find(a => a.tableBackendId === table.id);
        if (exists) return prev;
        return [...prev, {
          tableBackendId: table.id,
          tableNumber: table.number,
          orderId: order?.id,
          totalAmount: Number(order?.totalAmount ?? 0),
          requestedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
        }];
      });

      addNotification(
        "Bill Requested",
        `Table ${table.number} is requesting the bill`,
        'warning'
      );
    };

    const onOrderCreated = (payload) => {
      const { order } = payload;
      if (!order?.tableId) return;
      // useTableSync already updates table state via table:updated event.
      // Here we just ensure the activeOrder reference on selectedTable stays fresh.
      if (selectedTable?.backendId === order.tableId) {
        setSelectedTable(prev => prev ? { ...prev, activeOrder: order } : prev);
      }
    };

    const onOrderUpdated = (payload) => {
      const { order } = payload;
      if (!order?.tableId) return;
      if (selectedTable?.backendId === order.tableId) {
        setSelectedTable(prev => prev ? { ...prev, activeOrder: order } : prev);
      }
    };

    const onOrderPaid = (payload) => {
      const { tableId } = payload;
      // Remove from billing alerts
      setBillingAlerts(prev => prev.filter(a => a.tableBackendId !== tableId));
      // Clear selectedTable if it was the paid one
      if (selectedTable?.backendId === tableId) {
        setSelectedTable(null);
        setCart([]);
        setShowPaymentModal(false);
      }
      // Refresh using the user's current date filter (not always 'today')
      loadTransactions(txnDateFilterRef.current);
    };

    const onTableSwapped = (payload) => {
      const { sourceTableId, targetTableId, targetTable } = payload;
      // If cashier had the source table selected, switch to the new location
      if (selectedTable?.backendId === sourceTableId) {
        setSelectedTable(prev => prev ? { ...prev, backendId: targetTableId, ...targetTable } : prev);
        setShowTableModal(false);
        setShowSwapModal(false);
        addNotification('Table Moved', `Session moved to Table ${targetTable?.number ?? ''}`, 'success');
      }
    };

    socket.on('billing:requested', onBillingRequested);
    socket.on('order:created', onOrderCreated);
    socket.on('order:updated', onOrderUpdated);
    socket.on('order:paid', onOrderPaid);
    socket.on('table:swapped', onTableSwapped);

    return () => {
      socket.off('billing:requested', onBillingRequested);
      socket.off('order:created', onOrderCreated);
      socket.off('order:updated', onOrderUpdated);
      socket.off('order:paid', onOrderPaid);
      socket.off('table:swapped', onTableSwapped);
    };
  }, [socket, selectedTable?.backendId, loadTransactions]);

  // Keep ref in sync so socket handlers and payment callbacks can read latest filter
  useEffect(() => {
    txnDateFilterRef.current = txnDateFilter;
  }, [txnDateFilter]);

  // ── Fetch fresh order data from backend ───
  const fetchFreshOrderData = async (tableBackendId) => {
    try {
      const response = await fetch(`${API_BASE}/api/tables/${tableBackendId}?include=orders`);
      if (response.ok) {
        const freshTable = await response.json();
        // Return the most recent order (backend may filter PAID orders, but we want all orders)
        return freshTable.orders?.[0] || null;
      }
    } catch (error) {
      console.warn('Failed to fetch fresh order data:', error);
    }
    return null;
  };

  // ── Load transactions from DB — re-fires when filter or tab changes ───
  useEffect(() => {
    if (activeTab === 'history') {
      loadTransactions(txnDateFilter);
    }
  }, [txnDateFilter, activeTab, loadTransactions, outlet]);

  useEffect(() => {
    if (!selectedTable?.backendId) return;
    const liveTable = activeTables.find((table) => table.backendId === selectedTable.backendId);

    // Only update if we found a fresher version of the table.
    // NEVER wipe the selected table automatically to prevent race conditions.
    if (liveTable) {
      setSelectedTable(liveTable);
    }
  }, [activeTables, selectedTable?.backendId]);

  useEffect(() => {
    setSelectedCategory('All');
    setSearchQuery('');
  }, [outlet]);

  const activeTableOrders = useMemo(() => {
    return activeTables
      .filter((table) => table.status && table.status !== 'Free')
      .map((table) => {
        const items = getTableItems(table);
        const bill = calculateTableBill(table);
        return {
          id: `T${table.id}`,
          type: 'Dine-In',
          customer: `Table ${table.id}`,
          amount: table.currentBill || bill.subtotal,
          status: table.status,
          time: table.time || 'Live',
          items: items.length,
          kotCount: (table.kotHistory || []).length,
          table,
        };
      })
      .sort((a, b) => {
        if (a.status === 'Waiting Bill' && b.status !== 'Waiting Bill') return -1;
        if (a.status !== 'Waiting Bill' && b.status === 'Waiting Bill') return 1;
        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      });
  }, [activeTables]);

  const liveKotQueue = useMemo(() => {
    return activeTableOrders.flatMap((order) =>
      (order.table.kotHistory || []).map((kot) => ({
        id: kot.id,
        type: kot.type || 'FOOD',
        table: order.table,
        tableLabel: order.id,
        time: kot.time || order.time,
        status: kot.status || 'Incoming',
        createdAt: kot.createdAt || Date.now(),
        itemsReady: kot.itemsReady || 0,
        items: kot.items || [],
      }))
    );
  }, [activeTableOrders]);

  const todaysSales = useMemo(() => {
    return pastTransactions.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
  }, [pastTransactions]);

  const { subtotal, taxes, total, cgst: cartCgst, sgst: cartSgst } = calculateOrderTotal(cart);
  const activeOrderCalc = useMemo(() => {
    if (!selectedTable) return { subtotal, taxes, total, cgst: cartCgst, sgst: cartSgst };
    const items = getTableItems(selectedTable).map(i => 
      removedItemIds.includes(i.id) ? { ...i, removedFromBill: true } : i
    );
    return calculateOrderTotal([...items, ...cart]);
  }, [selectedTable, cart, subtotal, taxes, total, cartCgst, cartSgst, removedItemIds]);
  const activeSubtotal = activeOrderCalc.subtotal;
  const activeTaxes = activeOrderCalc.taxes;
  const activeTotal = activeOrderCalc.total;
  const activeCgst = activeOrderCalc.cgst ?? 0;
  const activeSgst = activeOrderCalc.sgst ?? 0;
  const fallbackTotal = Number(selectedTable?.currentBill || selectedTable?.activeOrder?.totalAmount || 0);

  const printBill = async (table, total, subtotal, taxes, method) => {
    const orderId = table?.activeOrder?.id || table?.orderId || null;

    // Extract items from active order for fallback printing
    const items = table?.activeOrder?.items || table?.items || [];

    // Pass all parameters for fallback printing when backend fails or orderId is missing
    await printBillQZ({
      orderId,           // For backend fetch
      table: {           // For fallback local print
        id: table?.id || table?.number || 'N/A',
        guests: table?.guestCount || table?.guests || 0
      },
      items,             // Items array from order
      subtotal,          // Subtotal amount
      taxes,             // Tax amount
      total,             // Total amount
      method             // Payment method (can be null for final bill)
    });
  };

  const handleFinalBill = async () => {
    if (!selectedTable || !selectedTable.backendId) {
      addNotification('Error', 'Invalid table selected.', 'error');
      return;
    }

    // Improved order ID resolution with better fallbacks
    const orderId = selectedTable?.activeOrder?.id ||
                    selectedTable?.orders?.[0]?.id ||
                    selectedTable?.orderId;

    if (!orderId) {
      // Determine specific error reason
      let errorMsg = 'No active order found.';

      if (selectedTable?.status === 'Available' || selectedTable?.status === 'Free') {
        errorMsg = 'This table has no active orders.';
      } else if (settledOrderIds.has(selectedTable?.backendId)) {
        errorMsg = 'Order already settled. Please refresh the table list.';
      } else if (selectedTable?.activeOrder?.status === 'PAID') {
        errorMsg = 'Order already paid. Cannot generate bill again.';
      }

      addNotification('Error', errorMsg, 'error');
      return;
    }

    // Check if order is already paid
    if (selectedTable?.activeOrder?.status === 'PAID') {
      addNotification('Error', 'This order has already been settled.', 'error');
      return;
    }

    // Check if order has items
    const orderItems = selectedTable?.activeOrder?.items || selectedTable?.orders?.[0]?.items || [];
    if (!orderItems || orderItems.length === 0) {
      addNotification('Error', 'Order has no items. Cannot generate bill.', 'error');
      return;
    }

    try {
      setIsPrintingBill(true);

      // Step 1: Update table discount if entered
      if (discountPercent > 0) {
        await fetch(`${API_BASE}/api/tables/${selectedTable.backendId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discount: discountPercent })
        });
      }

      // Step 2: Call print-bill endpoint (handles both status update AND printing via socket)
      const printResponse = await fetch(
        `${API_BASE}/api/orders/${orderId}/print-bill?restaurantId=${activeRestaurantId}`,
        { method: 'POST' }
      );

      if (!printResponse.ok) {
        const errorData = await printResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to print bill');
      }

      const result = await printResponse.json();

      addNotification('Success', 'Bill printed successfully.', 'success');
      setDiscountPercent(0); // Reset discount input

      // Optimistically update local table status so the UI shows "Waiting Bill" and "Settlement" button
      setActiveTables((prev) =>
        prev.map((t) =>
          t.backendId === selectedTable.backendId ? { ...t, status: 'Waiting Bill' } : t
        )
      );

      window.dispatchEvent(new Event('softshape_order_updated'));

      // Set cooldown timer
      setLastPrintTime(Date.now());
      setPrintCooldown(true);
      setTimeout(() => {
        setPrintCooldown(false);
      }, 10000);

    } catch (error) {
      console.error('Final bill error:', error);
      addNotification('Error', error.message || 'Failed to print bill.', 'error');
    } finally {
      setIsPrintingBill(false);
    }
  };

  const handlePayment = async (method) => {
    if (!selectedTable || !method) return;

    // Validate transaction amount
    const txnAmount = Number(activeTotal > 0 ? activeTotal : fallbackTotal);
    if (txnAmount <= 0) {
      addNotification(
        'Cannot Settle',
        'Bill amount is ₹0. Ensure KOT was sent before settling.',
        'error'
      );
      setShowMethodPicker(false);
      return;
    }

    // Guard: prevent double-settlement
    const orderId = selectedTable?.activeOrder?.id;
    if (orderId && settledOrderIds.has(orderId)) {
      addNotification('Already Settled', 'This order has already been settled.', 'error');
      setShowMethodPicker(false);
      setShowPaymentModal(false);
      return;
    }

    try {
      setIsPrintingBill(true);

      // Call backend settle endpoint (creates transaction, marks paid, resets table)
      // NO PRINTING - that already happened in handleFinalBill
      if (orderId) {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/orders/${orderId}/settle?restaurantId=${activeRestaurantId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentMethod: method })
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Settlement failed on server');
        }

        // Mark as settled locally to prevent retries
        setSettledOrderIds(prev => new Set([...prev, orderId]));
      }

      // Update local state - table becomes free
      setActiveTables((prev) =>
        prev.map((t) =>
          t.backendId === selectedTable.backendId
            ? {
                ...t,
                status: 'Free',
                workflowStatus: 'Free',
                activeOrder: null,
                items: [],
                captainId: null,
                kotHistory: [],
                currentBill: 0,
                guests: 0,
                time: null
              }
            : t
        )
      );

      // Clear billing alerts for this table
      setBillingAlerts(prev => prev.filter(a => a.tableBackendId !== selectedTable.backendId));

      // Close modals and clear state
      setShowMethodPicker(false);
      setShowTableModal(false);
      setShowPaymentModal(false);
      setSelectedTable(null);
      setCart([]);
      setRemovedItemIds([]);

      // Show success notification
      addNotification('Payment Success', `${method} • ₹${txnAmount.toFixed(0)} collected`, 'success');

      // Refresh transactions list to show the new transaction
      loadTransactions(txnDateFilterRef.current);

    } catch (err) {
      console.error('[Settlement] Failed:', err.message);
      addNotification('Error', 'Settlement failed: ' + err.message, 'error');
    } finally {
      setIsPrintingBill(false);
    }
  };

  const terminateTableSession = () => {
    if (!selectedTable) return;

    const tableSnap = selectedTable;

    // Step 1: Update local state - free the table immediately
    setActiveTables(prev => prev.map(t =>
      t.id === tableSnap.id
        ? { ...t, status: 'Free', captainId: null, kotHistory: [], currentBill: 0, guests: 0, time: null }
        : t
    ));

    // Step 2: Clear UI selections
    setSelectedTable(null);
    setCart([]);
    setRemovedItemIds([]);

    // Step 3: Show notification
    addNotification('Session Terminated', `Table ${tableSnap.id} freed`, 'info');

    // Step 4: Reset table session in backend (background, non-blocking)
    const resetSessionPayload = {
      status: 'Free',
      kotHistory: [],
      currentBill: 0,
      captainId: null,
      guests: 0,
    };

    if (tableSnap?.backendId) {
      if (outlet === 'bar') {
        import('../services/barTableApi').then(({ updateBarTableSession }) => {
          updateBarTableSession(tableSnap.backendId, resetSessionPayload)
            .catch(err => console.warn('[Terminate] resetBarSession failed:', err.message));
        });
      } else {
        import('../services/tableApi').then(({ updateTableSession }) => {
          updateTableSession(tableSnap.backendId, resetSessionPayload)
            .catch(err => console.warn('[Terminate] resetTableSession failed:', err.message));
        });
      }
    }
  };

  const handleBillEditSave = async () => {
    if (!selectedTable?.activeOrder?.id) return;
    if (billRemovals.length === 0 && billAdditions.length === 0) {
      setShowBillEditor(false);
      return;
    }
    setIsSavingBillEdit(true);
    try {
      const updatedOrder = await editBill(selectedTable.activeOrder.id, {
        removedItemIds: billRemovals,
        addedItems: billAdditions,
        editedBy: 'Cashier',
      });
      // Update local table state so bill total reflects immediately
      setActiveTables(prev => prev.map(t => {
        if (t.backendId !== selectedTable.backendId) return t;
        return {
          ...t,
          currentBill: updatedOrder.totalAmount,
          activeOrder: { ...t.activeOrder, ...updatedOrder },
        };
      }));
      setBillRemovals([]);
      setBillAdditions([]);
      setBillEditSearch('');
      setShowBillEditor(false);
      addNotification('Bill Updated', 'Changes saved successfully.', 'success');
    } catch (err) {
      addNotification('Edit Failed', err.message, 'error');
    } finally {
      setIsSavingBillEdit(false);
    }
  };

  const activeCategories = useMemo(() => {
    if (outlet === 'restaurant') return categories;
    const items = barMenuItems.filter(i => i.isAvailable !== false);
    const cats = items.map(i => i.category || i.c).filter(Boolean);
    return ['All', ...new Set(cats)];
  }, [outlet, categories, barMenuItems]);

  const activeMenuItems = useMemo(() => {
    let itemsToFilter = [];
    if (outlet === 'restaurant') {
      itemsToFilter = menuItems.filter(item => item.menuType === 'FOOD');
    } else {
      itemsToFilter = barMenuItems.filter(i => i.isAvailable !== false);
    }

    const q = searchQuery.trim().toLowerCase();

    const filtered = itemsToFilter.filter((item) => {
      // 1. Diet filter
      if (activeDiet !== 'All' && item.t !== activeDiet) return false;
      
      // 2. Search query filter
      if (q.length > 0) {
        if (!itemMatchesQuery(item, q)) return false;
      } else {
        // 3. Category filter (only active if no search query)
        if (selectedCategory !== 'All' && (item.c || item.category) !== selectedCategory) return false;
      }
      
      return true;
    });

    // Sort by relevance rank if search is active
    if (q.length > 0) {
      return filtered.sort((a, b) => {
        const rankA = getSearchRank(a, q);
        const rankB = getSearchRank(b, q);
        if (rankA !== rankB) return rankA - rankB;
        return (a.n || a.name || '').localeCompare(b.n || b.name || '');
      });
    }

    return filtered;
  }, [outlet, menuItems, barMenuItems, searchQuery, selectedCategory, activeDiet]);

  const handleTableSelect = async (table) => {
    setSelectedTable(table);

    // Fetch fresh order data if table is in billing/settlement state
    if (table.status === 'Waiting Bill' || table.workflowStatus === 'billing_requested') {
      const freshOrder = await fetchFreshOrderData(table.backendId);
      if (freshOrder) {
        setSelectedTable(prev => ({
          ...prev,
          activeOrder: freshOrder,
          orders: [freshOrder]
        }));
      }
    }

    if (!table.status || table.status === 'Free') {
      setActiveTab('pos');
      localStorage.setItem('cashier_active_tab', 'pos');
    } else {
      setShowTableModal(true);
    }
  };

  const handleAddItem = (item) => {
    if (outlet === 'bar' && item.variants && item.variants.length > 1) {
      setVariantPickerItem(item);
    } else {
      addToCart(item);
      setSearchQuery('');
      setSelectedCategory('All');
      setActiveDiet('All');
    }
  };

  const handleVariantSelect = (item, variant) => {
    // Detect custom ML variant and set notes field
    const isCustomMl = variant?.id === 'custom';
    const notes = isCustomMl ? variant.name : (item.notes ?? null);

    addToCart({
      ...item,
      n: `${item.n} (${variant.name})`,
      p: variant.price,
      notes
    });
    setVariantPickerItem(null);
    setSearchQuery('');
    setSelectedCategory('All');
    setActiveDiet('All');
  };



  const updateKotStatus = (tableId, kotId, newStatus) => {
    setActiveTables(prev => prev.map(t => {
      if (t.id === tableId || t.backendId === tableId) {
        let allReady = true;
        const updatedKotHistory = (t.kotHistory || []).map(kot => {
          if (kot.id === kotId) {
            const updated = { ...kot, status: newStatus };
            if (newStatus !== 'Ready') allReady = false;
            return updated;
          }
          if (kot.status !== 'Ready') allReady = false;
          return kot;
        });

        let newTableStatus = t.status;
        if (newStatus === 'Ready' && allReady && updatedKotHistory.length > 0) {
          newTableStatus = 'Waiting Bill';
          addNotification("Order Ready", `All items ready for Table ${t.id}`, "success");
        } else if (newStatus === 'Preparing') {
          newTableStatus = 'Preparing';
        } else if (newStatus === 'Incoming' && t.status !== 'Waiting Bill') {
          newTableStatus = 'Occupied';
        }

        return { ...t, status: newTableStatus, kotHistory: updatedKotHistory };
      }
      return t;
    }));

    // Find the active orderId for this table from current state
    const targetTable = activeTables.find(t => t.id === tableId || t.backendId === tableId);
    const orderId = targetTable?.activeOrder?.id || targetTable?.orderId;
    const statusMap = { Incoming: 'PENDING', Preparing: 'PREPARING', Ready: 'READY' };
    const backendStatus = statusMap[newStatus];
    if (orderId && backendStatus) {
      updateOrderStatus(orderId, backendStatus).catch(err =>
        console.warn('[KOT Status] sync failed:', err.message)
      );
    }
  };

  const addToCart = (item) => {
    if (!selectedTable) {
      addNotification('Select Table', 'Please assign a table before adding items.', 'warning');
      setActiveTab('tables');
      localStorage.setItem('cashier_active_tab', 'tables');
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.n === item.n);
      if (existing) return prev.map(i => i.n === item.n ? { ...i, q: i.q + 1 } : i);
      return [...prev, { ...item, q: 1, id: Date.now() }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          return { ...item, q: item.q + delta };
        }
        return item;
      });
      return updated.filter(item => item.q > 0);
    });
  };

  const onlineOrders = [
    { id: 'SW-9812', platform: 'Swiggy', items: ['Chicken Biryani x2', 'Coke x2'], amount: 960, status: 'Preparing', time: '4m ago' },
    { id: 'ZM-4521', platform: 'Zomato', items: ['Paneer Tikka x1', 'Butter Naan x3'], amount: 540, status: 'Ready', time: '12m ago' },
    { id: 'SW-9815', platform: 'Swiggy', items: ['Veg Noodles x2'], amount: 480, status: 'Incoming', time: 'Just now' },
  ];



  const handleSmartKOT = () => {
    if (cart.length === 0) return;
    setIsKotSending(true);
    setIsKotSuccess(false);

    const foodItems = cart.filter(i => i.menuType === 'FOOD' || !i.menuType);
    const barItems = cart.filter(i => i.menuType === 'LIQUOR');

    const kotsToCreate = [];
    const timestamp = Date.now();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

    if (foodItems.length > 0) {
      kotsToCreate.push({
        id: Math.floor(1000 + Math.random() * 9000).toString(),
        type: 'FOOD',
        time: timeStr,
        items: foodItems.map(i => ({ ...i, s: 'KOT Sent' })),
        status: 'Incoming',
        createdAt: timestamp,
        itemsReady: 0,
      });
    }

    if (barItems.length > 0) {
      kotsToCreate.push({
        id: Math.floor(1000 + Math.random() * 9000).toString(),
        type: 'LIQUOR',
        time: timeStr,
        items: barItems.map(i => ({ ...i, s: 'KOT Sent' })),
        status: 'Incoming',
        createdAt: timestamp + 1,
        itemsReady: 0,
      });
    }

    const apiItems = cart.map(i => ({
      menuItemId: String(i.id || i.menuItemId || i.n || i.name),
      name: i.n || i.name,
      price: Number(i.p ?? i.price ?? 0),
      quantity: Number(i.q ?? i.quantity ?? 1),
      notes: i.notes || null,
      // Preserve menuType so the backend can correctly classify food vs liquor for GST
      menuType: (i.menuType || 'FOOD').toUpperCase() === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
    }));

    if (selectedTable) {
      const newTotalBill = calculateSessionBill(selectedTable, cart).subtotal;
      setActiveTables(prev => prev.map(t => {
        if (t.id === selectedTable.id || t.backendId === selectedTable.backendId) {
          return {
            ...t,
            status: t.status === 'Free' ? 'Occupied' : t.status,
            kotHistory: [...(t.kotHistory || []), ...kotsToCreate],
            currentBill: newTotalBill,
          };
        }
        return t;
      }));
    }

    setCart([]);
    setIsKotSending(false);
    setIsKotSuccess(true);
    addNotification('KOT Pushed', `Sent ${kotsToCreate.length} KOT(s) for Table ${selectedTable?.id || 'Walk-in'}.`, 'success');
    setTimeout(() => setIsKotSuccess(false), 2000);

    // Fire-and-forget — print failure must not block order save
    if (selectedTable?.backendId) {
      printKOTQZ({
        tableId: selectedTable.backendId,
        kotId: kotsToCreate[0]?.id ?? String(Date.now()),
        orderId: selectedTable.activeOrder?.id ?? kotsToCreate[0]?.id ?? String(Date.now()),
        kotNumber: kotsToCreate[0]?.id ?? String(Date.now()),
        items: cart,
      }).catch(err => {
        console.warn('[KOT] Print failed (non-blocking):', err.message);
        addNotification('Print failed — check QZ Tray on cashier PC', 'warning');
      });
    }

    if (selectedTable?.backendId) {
      if (selectedTable.activeOrder?.id) {
        const existingItems = (selectedTable.activeOrder.items || []).map(i => ({
          menuItemId: String(i.menuItemId || i.id || i.name),
          name: i.name || i.n,
          price: Number(i.price || i.p || 0),
          quantity: Number(i.quantity || i.q || 1),
          notes: i.notes || null,
        }));
        
        // Merge previous KOT items with new cart items to prevent backend overwrite
        const mergedApiItems = [...existingItems, ...apiItems];
        
        updateOrderItems(selectedTable.activeOrder.id, mergedApiItems)
          .catch(err => console.warn('[BG] updateOrderItems failed:', err.message));
      } else {
        createOrder({
          tableId: selectedTable.backendId,
          restaurantId: activeRestaurantId,
          items: apiItems,
        }).catch(err => console.warn('[BG] createOrder failed:', err.message));
      }
    }
  };

  const stats = [
    { label: "Today's Sale", value: `₹${Number(todaysSales).toFixed(0)}`, change: `${pastTransactions.length} txns`, icon: Wallet, color: "text-green-600", bg: "bg-green-50" },
    { label: "Active Tables", value: `${activeTableOrders.length}/${activeTables.length}`, change: "Live floor", icon: Table2, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Pending KOTs", value: String(liveKotQueue.length).padStart(2, '0'), change: `${activeTableOrders.filter(o => o.status === 'Waiting Bill').length} billing`, icon: ChefHat, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Online Orders", value: "26", change: "12 Swiggy, 14 Zomato", icon: Monitor, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="flex flex-col-reverse sm:flex-row h-[100dvh] bg-[#FFF5F5] font-sans overflow-hidden text-[#1A1A1A]">
      {/* SIDEBAR / BOTTOM BAR */}
      <aside className="w-full sm:w-20 lg:w-72 h-16 sm:h-auto bg-white border-t sm:border-t-0 sm:border-r border-[#FFCDD2] flex sm:flex-col z-30 transition-all shrink-0">
        <div className="hidden sm:flex p-3 lg:p-8 border-b border-[#FFCDD2] items-center justify-center shrink-0 bg-white">
          <div className="bg-white p-1.5 lg:p-4 rounded-2xl lg:rounded-[32px] shadow-lg lg:shadow-xl border border-gray-50 aspect-square w-14 lg:w-44 flex items-center justify-center">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape.ai"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <nav className="flex-1 sm:flex-grow flex sm:flex-col items-center sm:items-stretch overflow-x-auto sm:overflow-visible p-3 sm:space-y-1.5 sm:mt-4 gap-3 sm:gap-0 scrollbar-hide px-3">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'pos', label: 'POS Billing', icon: ShoppingCart },
            { id: 'tables', label: 'Tables', icon: Table2 },
            { id: 'history', label: 'Past Transactions', icon: History },
            { id: 'analytics', label: 'Item Analytics', icon: BarChart3 },
            { id: 'online', label: 'Online Orders', icon: Monitor },

          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); localStorage.setItem('cashier_active_tab', item.id); }}
              className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1.5 sm:gap-4 px-5 sm:px-4 py-2.5 sm:py-3.5 rounded-xl transition-all duration-150 group relative shrink-0 min-w-[80px] sm:min-w-0 hover:scale-[1.02] active:scale-98 ${activeTab === item.id
                  ? 'bg-[#E53935] text-white font-black shadow-lg shadow-red-500/15 scale-[1.01]'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <item.icon size={22} className={activeTab === item.id ? 'text-white' : 'group-hover:scale-110 transition-transform'} />
              <span className="text-[10px] sm:hidden font-bold leading-none mt-1">{item.label.split(' ')[0]}</span>
              <span className="hidden lg:block text-xs md:text-sm font-black uppercase tracking-wider">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="hidden sm:block p-3.5 border-t border-gray-100 mt-auto pb-8">
          <button onClick={onLogout} className="flex items-center gap-4 w-full p-3.5 rounded-xl text-gray-450 hover:text-red-650 hover:bg-red-50 transition-all hover:scale-[1.02] active:scale-98">
            <LogOut size={22} className="text-gray-405 group-hover:text-red-600" />
            <span className="hidden lg:block text-xs md:text-sm font-black uppercase tracking-wider text-gray-500 group-hover:text-red-600">Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN VIEW */}
      <div className="flex-grow flex flex-col min-w-0 overflow-hidden">
        {/* COMPACT TOP BAR */}
        <header className="h-18 bg-white border-b border-gray-200 px-6 flex items-center justify-between z-20 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">

            <div className="flex items-center gap-2.5 text-gray-500">
              <Clock size={18} />
              <span className="text-xs md:text-sm font-black tabular-nums">{currentTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <OutletToggle className="flex" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs md:text-sm font-black leading-none text-gray-900">Kiran Kumar</p>
                <p className="text-[10px] text-gray-400 font-black uppercase mt-1">Head Cashier</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-base shadow-inner border border-gray-200">🤵</div>
              <button onClick={onLogout} className="sm:hidden ml-2 p-2 rounded-lg bg-gray-50 text-gray-500 hover:text-red-600 hover:bg-red-50"><LogOut size={20} /></button>
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="flex-grow overflow-hidden flex flex-col">
          {/* Billing Alert Banner */}
          {billingAlerts.length > 0 && (
            <div className="mx-4 mt-3 flex flex-col gap-2">
              {billingAlerts.map(alert => (
                <div
                  key={alert.tableBackendId}
                  className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:bg-amber-100 transition-all"
                  onClick={() => {
                    // Find and select the table so cashier can process payment
                    const t = activeTables.find(tbl => tbl.backendId === alert.tableBackendId);
                    if (t) {
                      setSelectedTable(t);
                      setShowPaymentModal(true);
                      setActiveTab('tables');
                      localStorage.setItem('cashier_active_tab', 'tables');
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 bg-amber-500 rounded-full animate-pulse" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">
                        Table {alert.tableNumber} — Billing Requested
                      </p>
                      <p className="text-xs text-amber-700">
                        ₹{Number(alert.totalAmount || 0).toFixed(2)} • {alert.requestedAt}
                      </p>
                    </div>
                  </div>
                  <button className="text-xs font-bold text-amber-700 bg-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-300 transition">
                    Collect →
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'dashboard' ? (
            <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar bg-gray-50">
              {/* Stats Row */}
              <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto scrollbar-hide snap-x pb-1 sm:pb-0">
                {stats.map((stat, i) => (
                  <div key={i} className="min-w-[75vw] sm:min-w-0 snap-start shrink-0 bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className={`w-9 h-9 ${stat.bg} ${stat.color} rounded-lg flex items-center justify-center shrink-0`}>
                      <stat.icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate">{stat.label}</p>
                      <p className="text-lg font-black text-gray-900 leading-none mt-1">{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Floor Status — Full Width, Only Running Tables */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
                    <Table2 size={18} className="text-[#E53935]" />
                    Live Floor Status
                    <span className="bg-[#E53935] text-white text-[10px] font-black px-2.5 py-1 rounded-full">
                      {activeTables.filter(t => t.status && t.status !== 'Free').length} Running
                    </span>
                  </h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#E53935]" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Busy</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bill</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-orange-400" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Preparing</span></div>
                  </div>
                </div>

                {activeTables.filter(t => t.status && t.status !== 'Free').length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <Table2 size={52} className="text-gray-200 mb-4" />
                    <p className="text-base font-black uppercase tracking-widest text-gray-300">All Tables Free</p>
                    <p className="text-xs text-gray-300 font-bold mt-1.5">No active sessions on the floor</p>
                  </div>
                ) : (
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {activeTables
                      .filter(t => t.status && t.status !== 'Free')
                      .sort((a, b) => {
                        if (a.status === 'Waiting Bill' && b.status !== 'Waiting Bill') return -1;
                        if (a.status !== 'Waiting Bill' && b.status === 'Waiting Bill') return 1;
                        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
                      })
                      .map((table, i) => {
                        const isWaitingBill = table.status === 'Waiting Bill';
                        const isPreparing = table.status === 'Preparing';
                        const bill = calculateTableBill(table);
                        const billAmt = Number(table.currentBill || bill?.subtotal || 0);

                        let cardBg = 'bg-red-50 border-[#E53935]';
                        let textColor = 'text-[#E53935]';
                        let badgeCls = 'bg-red-100 text-red-700';
                        let statusLabel = 'Occupied';
                        let pulseClass = '';

                        if (isWaitingBill) {
                          cardBg = 'bg-amber-50 border-amber-400';
                          textColor = 'text-amber-700';
                          badgeCls = 'bg-amber-100 text-amber-800';
                          statusLabel = 'Bill Requested';
                          pulseClass = 'animate-pulse';
                        } else if (isPreparing) {
                          cardBg = 'bg-orange-50 border-orange-400';
                          textColor = 'text-orange-700';
                          badgeCls = 'bg-orange-100 text-orange-700';
                          statusLabel = 'Preparing';
                        }

                        return (
                          <div
                            key={i}
                            onClick={() => {
                              setSelectedTable(table);
                              setShowTableModal(true);
                            }}
                            className={`border-2 rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all hover:scale-[1.04] active:scale-[0.97] shadow-sm hover:shadow-lg select-none ${cardBg} ${pulseClass}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className={`text-4xl font-black leading-none ${textColor}`}>
                                {outlet === 'bar' ? `B${table.number ?? table.id}` : table.id}
                              </span>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg shrink-0 ${badgeCls}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <div className="mt-auto">
                              {table.captainName && (
                                <p className={`text-[10px] font-black uppercase tracking-wider truncate mb-1 opacity-60 ${textColor}`}>
                                  {table.captainName}
                                </p>
                              )}
                              <p className="text-xl font-black text-gray-900">
                                ₹{billAmt > 0 ? billAmt.toFixed(0) : '—'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'pos' ? (
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">
              {/* COMPACT MENU */}
              <div className={`flex-grow flex flex-col bg-white border-b lg:border-b-0 lg:border-r border-gray-200 min-w-0 ${isCartMinimized ? 'h-full lg:h-auto' : 'h-1/2 lg:h-auto'} transition-all duration-300`}>
                <div className="px-4 py-3.5 border-b border-gray-100 flex flex-col gap-3.5 bg-white">

                  <div className="relative w-full">
                    {/* Animated Search Icon */}
                    <motion.div
                      animate={{ 
                        scale: isSearchFocused ? 1.15 : 1,
                        x: isSearchFocused ? 2 : 0 
                      }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-[#E53935] pointer-events-none z-10"
                    >
                      <Search size={24} />
                    </motion.div>

                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search by name, category, price, or ID... (Press '/' to focus)"
                      className={`w-full bg-white border-2 rounded-2xl pl-14 pr-12 h-16 text-base md:text-lg font-black text-gray-900 outline-none transition-all duration-200 shadow-md placeholder:text-gray-400 ${
                        isSearchFocused 
                          ? 'border-[#E53935] ring-4 ring-red-100/80 shadow-red-100/20 scale-[1.002]' 
                          : 'border-gray-300 hover:border-[#E53935]/50 hover:shadow-md'
                      }`}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setIsSearchFocused(true);
                      }}
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => setIsSearchFocused(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          setIsSearchFocused(false);
                          e.target.blur();
                        }
                      }}
                      autoComplete="off"
                    />

                    {/* Clear Button (X) with slide/scale animation */}
                    <AnimatePresence>
                      {searchQuery && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8, y: '-50%' }}
                          animate={{ opacity: 1, scale: 1, y: '-50%' }}
                          exit={{ opacity: 0, scale: 0.8, y: '-50%' }}
                          transition={{ duration: 0.15 }}
                          onClick={() => {
                            setSearchQuery('');
                            searchInputRef.current?.focus();
                          }}
                          className="absolute right-5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-100 hover:bg-red-50 text-gray-405 hover:text-[#E53935] flex items-center justify-center transition-colors shadow-inner cursor-pointer"
                        >
                          <X size={16} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide scroll-smooth py-1 flex-grow">
                      {activeCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-7 py-3.5 rounded-xl text-sm md:text-base font-black uppercase transition-all duration-200 border shrink-0 hover:scale-[1.03] active:scale-95 ${
                            selectedCategory === cat 
                              ? 'bg-[#E53935] border-[#E53935] text-white shadow-lg shadow-red-500/35 scale-[1.04] z-10' 
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-[#FFF5F5] hover:border-[#FFCDD2] hover:text-[#E53935]'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shrink-0 shadow-sm">
                      {['All', 'veg', 'non'].map(diet => (
                        <button
                          key={diet}
                          onClick={() => setActiveDiet(diet)}
                          className={`px-5 py-3 rounded-xl text-xs md:text-sm font-black uppercase transition-all duration-200 hover:scale-[1.02] active:scale-95 ${
                            activeDiet === diet 
                              ? (diet === 'All' ? 'bg-gray-800 text-white shadow-sm' : diet === 'veg' ? 'bg-green-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm')
                              : 'text-gray-500 hover:text-gray-850 bg-transparent'
                          }`}
                        >
                          {diet === 'All' ? 'All' : diet === 'veg' ? 'Veg' : 'Non'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex-grow overflow-y-auto p-4 bg-gray-50/30 custom-scrollbar">
                  {menuLoading ? (
                    <p className="text-center text-sm text-gray-400 py-12 font-bold uppercase tracking-widest animate-pulse">Syncing menu…</p>
                  ) : activeMenuItems.length === 0 ? (
                    <div
                      className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200 shadow-sm mt-4 w-full"
                    >
                      <AlertCircle size={44} className="text-[#E53935] mb-4" />
                      <h3 className="text-lg font-black text-gray-900 mb-1">No matching items found</h3>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest max-w-xs text-center">
                        {searchQuery.trim()
                          ? `We couldn't find anything matching "${searchQuery.trim()}".`
                          : "No items found in this category."}
                      </p>
                      {searchQuery.trim() && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="mt-6 px-6 py-2.5 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-red-100 cursor-pointer"
                        >
                          Clear Search
                        </button>
                      )}
                    </div>
                  ) : (
                    <div 
                      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6"
                    >
                      {activeMenuItems.map((item) => (
                        <div
                          key={item.id || item.n}
                          onClick={() => handleAddItem(item)}
                          className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden hover:border-[#E53935] hover:shadow-xl transition-all duration-250 cursor-pointer flex flex-col group hover:scale-[1.02] active:scale-[0.99] shadow-md"
                        >
                          <div className="h-32 sm:h-36 lg:h-40 w-full overflow-hidden relative shrink-0">
                            <img src={item.img} alt={item.n} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            {outlet === 'bar' && item.menuType && (
                              <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md backdrop-blur-md shadow-sm bg-white/80 border border-white/50 text-[9px] font-black uppercase tracking-wider text-gray-700 select-none">
                                {item.menuType === 'FOOD' ? '🍽️ Food' : '🥃 Liquor'}
                              </div>
                            )}
                            <div className="absolute top-2.5 right-2.5 p-1 rounded-md backdrop-blur-md shadow-sm bg-white/80 border border-white/50">
                              <div className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center ${item.t === 'veg' ? 'border-green-600' : 'border-red-600'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${item.t === 'veg' ? 'bg-green-600' : 'bg-red-600'}`} />
                              </div>
                            </div>
                          </div>
                          <div className="p-4 sm:p-5 flex flex-col flex-grow gap-2 sm:gap-3">
                            <h4 className="text-sm md:text-base lg:text-lg font-black text-gray-900 leading-snug line-clamp-3 h-[4.5rem] md:h-[5rem] flex items-center tracking-tight">
                              <HighlightedText text={item.n} highlight={searchQuery} />
                            </h4>
                            <div className="flex items-center justify-between mt-auto">
                              <p className="text-base md:text-lg lg:text-xl font-black text-[#E53935]">₹{item.p}</p>
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gray-100 border border-gray-150 flex items-center justify-center text-gray-500 group-hover:bg-[#E53935] group-hover:text-white transition-colors duration-150 shadow-sm active:scale-90 shrink-0">
                                <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* COMPACT CART */}
              <div className={`w-full lg:w-[440px] flex flex-col bg-white shadow-xl z-20 shrink-0 transition-all duration-300 ${isCartMinimized ? 'h-14 lg:h-auto overflow-hidden' : 'h-1/2 lg:h-auto'}`}>
                <div
                  className="p-4.5 border-b border-gray-100 bg-gray-50/50 cursor-pointer lg:cursor-default shrink-0 flex items-center justify-between"
                  onClick={() => setIsCartMinimized(!isCartMinimized)}
                >
                  <div className="flex flex-col w-full">
                    <div className="flex justify-between items-center mb-3">
                      <h2 className="font-black text-base md:text-lg uppercase tracking-widest text-gray-900 flex items-center gap-2.5">
                        <ShoppingCart size={22} className="text-[#E53935]" />
                        Cart Log
                      </h2>
                      <button onClick={(e) => { e.stopPropagation(); setCart([]); }} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={22} /></button>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4.5 flex items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center text-[#E53935] font-black text-lg shadow-sm border border-red-100">
                          {selectedTable ? (outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`) : 'POS'}
                        </div>
                        <div className="flex-grow min-w-0">
                          <p className="text-sm md:text-base font-black text-gray-900 truncate">{selectedTable ? `Table ${selectedTable.id}` : 'Walk-in Order'}</p>
                          <p className="text-xs text-gray-405 font-black uppercase tracking-widest leading-none mt-1">{selectedTable ? selectedTable.status : 'POS Draft'}</p>
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setActiveTab('tables'); localStorage.setItem('cashier_active_tab', 'tables'); }} className="px-4.5 py-2.5 bg-gray-105 text-gray-600 rounded-xl text-xs md:text-sm font-black hover:bg-gray-200 uppercase whitespace-nowrap border border-gray-200 transition-colors">
                        {selectedTable ? 'Change' : '+ Table'}
                      </button>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex lg:hidden items-center justify-center text-gray-400 shrink-0 ml-4 shadow-sm">
                    <ChevronDown size={18} className={`transition-transform duration-300 ${isCartMinimized ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                <div className="flex-grow overflow-y-auto p-4.5 space-y-4 custom-scrollbar bg-white">
                  {(() => {
                    const sessionItems = selectedTable 
                      ? (selectedTable.kotHistory || []).flatMap(k => k.items.map(i => ({...i, isKotSent: true, kotId: k.id}))) 
                      : [];
                    const pendingItems = cart.map(i => ({...i, isKotSent: false}));
                    const displayCart = [...sessionItems, ...pendingItems];

                    if (displayCart.length === 0) {
                      return (
                        <div className="h-full flex flex-col items-center justify-center opacity-40 py-16">
                          <Package size={44} className="mb-2 text-gray-405" />
                          <p className="text-sm font-black uppercase text-gray-500 tracking-wider">Pending Items</p>
                        </div>
                      );
                    }

                    return displayCart.map((item, idx) => (
                      <div key={item.id || idx} className={`flex gap-3 pb-4 border-b border-gray-100 ${item.isKotSent ? 'opacity-60' : ''}`}>
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-start mb-1.5">
                            <p className="text-sm md:text-base font-black text-gray-900 truncate flex items-center gap-1.5">
                              {item.n}
                              {item.isKotSent && <span className="text-xs font-black uppercase tracking-widest bg-green-50 text-green-600 px-2 py-1 rounded-lg border border-green-150 ml-2">KOT Sent</span>}
                            </p>
                            <p className="text-sm md:text-base font-black text-gray-900">₹{item.p * item.q}</p>
                          </div>
                          <div className="flex items-center justify-between gap-2.5">
                            {item.isKotSent ? (
                              <div className="flex items-center gap-1.5 text-sm font-black text-gray-500">
                                <span>QTY: {item.q}</span>
                                <span>•</span>
                                <span>KOT-{item.kotId}</span>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center bg-gray-100 rounded-lg p-1.5 gap-2">
                                  <button onClick={() => updateQty(item.id, -1)} className="p-1.5 text-gray-600 hover:text-red-650 hover:bg-gray-200 rounded-lg transition-colors"><Minus size={14} /></button>
                                  <span className="w-9 text-center text-sm md:text-base font-black text-gray-805">{item.q}</span>
                                  <button onClick={() => updateQty(item.id, 1)} className="p-1.5 text-gray-600 hover:text-red-655 hover:bg-gray-200 rounded-lg transition-colors"><Plus size={14} /></button>
                                </div>
                                <button className="text-xs md:text-sm font-black text-[#E53935] hover:underline px-2.5 py-1.5 hover:bg-red-50 rounded-lg">Edit</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                <div className="p-4 sm:p-4.5 border-t border-gray-100 bg-gray-50/50 space-y-3 shrink-0">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest">
                      <span>Subtotal</span>
                      <span className="font-black text-gray-855 text-sm">₹{Number(selectedTable ? activeSubtotal : subtotal).toFixed(0)}</span>
                    </div>
                    {/* CGST + SGST — shown only when food items are present (taxes > 0) */}
                    {(selectedTable ? activeCgst : cartCgst) > 0 && (
                      <>
                        <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                          <span>CGST (2.5%)</span>
                          <span>₹{(selectedTable ? activeCgst : cartCgst).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest">
                          <span>SGST (2.5%)</span>
                          <span>₹{(selectedTable ? activeSgst : cartSgst).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between items-center pt-1.5 border-t border-gray-200">
                      <span className="text-xs md:text-sm font-black text-gray-900 uppercase tracking-wider">NET TOTAL</span>
                      <span className="text-2xl md:text-3xl lg:text-4xl font-black text-[#E53935] tracking-tight">₹{Number(selectedTable ? activeTotal : total).toFixed(0)}</span>
                    </div>
                  </div>

                  <div className="pt-0.5">
                    <button
                      onClick={handleSmartKOT}
                      disabled={isKotSending || cart.length === 0}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border transition-all duration-150 hover:scale-[1.01] active:scale-95 ${isKotSuccess ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-100' :
                          isKotSending ? 'bg-amber-50 border-amber-200 text-amber-600' :
                            'bg-white border-gray-200 text-gray-700 hover:border-[#E53935] hover:text-[#E53935] hover:shadow-sm'
                        }`}
                    >
                      {isKotSuccess ? <Check size={18} /> : isKotSending ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wider">{isKotSuccess ? 'Pushed' : isKotSending ? 'Pushing' : 'KOT (Auto-Split)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-grow p-3 overflow-y-auto custom-scrollbar bg-gray-50/50">
              <div className="max-w-6xl mx-auto space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">{activeTab.replace('-', ' ')} Feed</h2>
                </div>

                {activeTab === 'tables' && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-3.5">
                    {activeTables.map((table, i) => {
                      const isFree = table.status === 'Free' || !table.status;
                      const isWaitingBill = table.status === 'Waiting Bill';
                      const isBusy = !isFree && !isWaitingBill;

                      let containerClass = 'bg-white border-gray-150 text-gray-500 hover:border-gray-300 shadow-sm';
                      let statusText = 'Open';

                      if (isWaitingBill) {
                        containerClass = 'bg-amber-50 border-amber-400 text-amber-600 shadow-md shadow-amber-50 animate-pulse';
                        statusText = 'Billing Requested';
                      } else if (isBusy) {
                        containerClass = 'bg-red-50 border-[#E53935] text-[#E53935] shadow-md shadow-red-55';
                        statusText = 'Busy';
                      }

                      return (
                        <div
                          key={i}
                          onClick={() => handleTableSelect(table)}
                          className={`aspect-square border rounded-2xl flex flex-col items-center justify-center text-center p-2.5 cursor-pointer transition-all hover:scale-105 active:scale-95 relative ${containerClass}`}
                        >
                          {table.captainName && (
                            <div className="absolute top-1 right-1 bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-[6px] text-[8px] md:text-[9px] font-black uppercase tracking-widest max-w-[80%] truncate shadow-sm">
                              {table.captainName.split(' ')[0]}
                            </div>
                          )}
                          <span className="text-2xl font-black">{outlet === 'bar' ? `B${table.number ?? table.id}` : table.id}</span>
                          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider leading-tight mt-1">{statusText}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    {/* Total Amount Summary */}
                    <div className="m-3 mb-2">
                      <div className="bg-gradient-to-br from-[#E53935] to-[#B71C1C] border border-red-200 rounded-xl p-4 flex flex-col gap-1 shadow-lg">
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-100">Total Amount</span>
                        <span className="text-3xl font-black text-white">
                          ₹{pastTransactions.reduce((sum, t) => sum + (t.amount || 0), 0).toFixed(0)}
                        </span>
                        <span className="text-[10px] font-bold text-red-100">{pastTransactions.length} transactions</span>
                      </div>
                    </div>

                    {/* Cash / UPI / Card summary */}
                    <div className="grid grid-cols-3 gap-2 m-3 mt-0 mb-0">
                      {[
                        { label: 'Cash', method: 'CASH', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
                        { label: 'UPI', method: 'UPI', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                        { label: 'Card', method: 'CARD', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
                      ].map(({ label, method, color, bg, border }) => {
                        const total = pastTransactions
                          .filter(t => t.method === method)
                          .reduce((sum, t) => sum + (t.amount || 0), 0);
                        const count = pastTransactions.filter(t => t.method === method).length;
                        return (
                          <div key={method} className={`${bg} border ${border} rounded-xl p-3 flex flex-col gap-0.5`}>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${color}`}>{label}</span>
                            <span className="text-sm font-black text-gray-900">₹{total.toFixed(0)}</span>
                            <span className="text-[9px] font-bold text-gray-400">{count} txns</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Date filter tabs */}
                    <div className="flex items-center gap-1.5 p-3 border-b border-gray-100 bg-gray-50 flex-wrap">
                      {[
                        { key: 'today', label: 'Today' },
                        { key: 'yesterday', label: 'Yesterday' },
                        { key: 'month', label: 'This Month' },
                        { key: 'all', label: 'All Time' },
                      ].map(f => (
                        <button
                          key={f.key}
                          onClick={() => { setTxnDateFilter(f.key); setTxnMethodFilter('all'); setTxnSearch(''); }}
                          className={`px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${
                            txnDateFilter === f.key
                              ? 'bg-[#E53935] text-white shadow-sm'
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                      <button
                        onClick={() => { loadTransactions(txnDateFilter); setTxnMethodFilter('all'); setTxnSearch(''); }}
                        className="ml-auto px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-850 hover:scale-[1.01] active:scale-[0.99] transition-all shadow-sm"
                      >
                        ↻ Sync
                      </button>
                    </div>
                    {/* FIX 4: Method filter + Search row */}
                    <div className="flex items-center gap-2 flex-wrap px-3 py-3 border-b border-gray-50">
                      {[
                        { key: 'all', label: 'All' },
                        { key: 'CASH', label: 'Cash' },
                        { key: 'UPI', label: 'UPI' },
                        { key: 'CARD', label: 'Card' },
                      ].map(f => (
                        <button
                          key={f.key}
                          onClick={() => setTxnMethodFilter(f.key)}
                          className={`px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${
                            txnMethodFilter === f.key
                              ? 'bg-gray-900 text-white shadow-sm'
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                      <input
                        type="text"
                        value={txnSearch}
                        onChange={e => setTxnSearch(e.target.value)}
                        placeholder="Search bill number..."
                        className="ml-auto text-xs font-bold px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 placeholder-gray-400 outline-none focus:border-gray-450 w-44 sm:w-52 shadow-inner transition-colors"
                      />
                    </div>
                    <div className="overflow-x-auto scrollbar-hide relative">
                      {txnsLoading && filteredTransactions.length > 0 && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-xl">
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-7 h-7 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading...</p>
                          </div>
                        </div>
                      )}
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">TXN ID</th>
                            <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">Table</th>
                            <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">Captain</th>
                            <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">Date/Time</th>
                            <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">Method</th>
                            <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {txnsLoading && filteredTransactions.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-12 text-center">
                                <div className="flex flex-col items-center justify-center gap-2 py-8">
                                  <div className="w-7 h-7 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />
                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading...</p>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredTransactions.map(txn => (
                            <React.Fragment key={txn.id}>
                              <tr
                                onClick={() => setExpandedTxnId(expandedTxnId === txn.id ? null : txn.id)}
                                className="hover:bg-gray-50 transition-colors cursor-pointer select-none"
                              >
                                <td className="p-4">
                                  <span className="text-xs md:text-sm font-black text-gray-900">{txn.displayId || txn.id}</span>
                                </td>
                                {/* FIX 6: Table Number */}
                                <td className="p-4">
                                  <span className="text-xs md:text-sm font-black text-gray-700">
                                    {txn.tableNumber ? `T-${txn.tableNumber}` : '—'}
                                  </span>
                                </td>
                                {/* FIX 6: Captain */}
                                <td className="p-4">
                                  <span className="text-xs font-bold text-gray-500 uppercase">
                                    {txn.captainId && txn.captainId !== 'CASHIER' ? txn.captainId : 'Head Cashier'}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <div className="flex flex-col">
                                    <span className="text-xs md:text-sm font-black text-gray-700">{txn.date}</span>
                                    <span className="text-xs text-gray-400 font-bold mt-0.5">{txn.time}</span>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${txn.method === 'CASH' ? 'bg-green-100 text-green-700' :
                                      txn.method === 'UPI' ? 'bg-blue-100 text-blue-700' :
                                        'bg-purple-100 text-purple-700'
                                    }`}>{txn.method}</span>
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <div className="flex flex-col items-end">
                                      <span className="text-sm md:text-base font-black text-gray-900">₹{txn.amount}</span>
                                      <span className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">{txn.items} Items</span>
                                    </div>
                                    <span className={`text-gray-400 transition-transform duration-200 ${expandedTxnId === txn.id ? 'rotate-180' : ''}`}>
                                      <ChevronDown size={14} />
                                    </span>
                                  </div>
                                </td>
                              </tr>
                              {expandedTxnId === txn.id && (
                                <tr key={`${txn.id}-detail`} className="bg-gray-50">
                                  <td colSpan={6} className="px-6 pb-4 pt-2">
                                    {txn.itemsList && txn.itemsList.length > 0 ? (
                                      <div className="flex flex-col gap-2">
                                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Order Items</p>
                                        {txn.itemsList.map((item, idx) => (
                                          <div key={idx} className="flex justify-between items-center bg-white rounded-xl px-4 py-2.5 border border-gray-100">
                                            <span className="text-xs md:text-sm font-bold text-gray-700">{item.name || item.n} × {item.quantity || item.q}</span>
                                            <span className="text-xs md:text-sm font-black text-gray-900">₹{Number((item.price || item.p || 0) * (item.quantity || item.q || 1)).toFixed(0)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between items-center px-4 pt-2 border-t border-gray-200 mt-2">
                                          <span className="text-xs font-black uppercase text-gray-500">Total</span>
                                          <span className="text-sm font-black text-[#E53935]">₹{txn.amount}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400 py-3">No item details available.</p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )))}
                        </tbody>
                      </table>
                    </div>

                    {!txnsLoading && filteredTransactions.length === 0 && (
                      <div className="p-12 text-center flex flex-col items-center">
                        <History size={32} className="text-gray-250 mb-2" />
                        <p className="text-xs md:text-sm font-black text-gray-400 uppercase tracking-widest">No Recent Transactions</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'analytics' && (
                  <ItemAnalytics outlet={outlet} />
                )}

                {false && (
                  <div className="flex flex-col gap-4 h-full">
                    {/* Smart Summary Header */}
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 bg-white p-3 rounded-xl border border-gray-100 shadow-sm shrink-0">
                      <div className="text-center">
                        <p className="text-[9px] font-black uppercase text-gray-400">Incoming</p>
                        <p className="text-lg font-black text-gray-900">{liveKotQueue.filter(k => k.type === 'FOOD' && (k.status === 'Incoming' || (!['Preparing', 'Ready'].includes(k.status)))).length}</p>
                      </div>
                      <div className="text-center border-l border-gray-100">
                        <p className="text-[9px] font-black uppercase text-gray-400">Preparing</p>
                        <p className="text-lg font-black text-amber-600">{liveKotQueue.filter(k => k.type === 'FOOD' && k.status === 'Preparing').length}</p>
                      </div>
                      <div className="text-center border-l border-gray-100">
                        <p className="text-[9px] font-black uppercase text-gray-400">Ready</p>
                        <p className="text-lg font-black text-green-600">{liveKotQueue.filter(k => k.type === 'FOOD' && k.status === 'Ready').length}</p>
                      </div>
                      <div className="text-center border-l border-gray-100 hidden md:block">
                        <p className="text-[9px] font-black uppercase text-gray-400">Delayed</p>
                        <p className="text-lg font-black text-[#E53935]">
                          {liveKotQueue.filter(k => k.type === 'FOOD' && k.status !== 'Ready' && Date.now() - k.createdAt > 600000).length}
                        </p>
                      </div>
                      <div className="text-center border-l border-gray-100 hidden md:block">
                        <p className="text-[9px] font-black uppercase text-gray-400">Avg Time</p>
                        <p className="text-lg font-black text-gray-900">8m</p>
                      </div>
                      <div className="text-center border-l border-gray-100 hidden md:block">
                        <p className="text-[9px] font-black uppercase text-gray-400">Active Tables</p>
                        <p className="text-lg font-black text-gray-900">{activeTableOrders.length}</p>
                      </div>
                    </div>

                    {/* Kanban Board */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow min-h-0 overflow-y-auto pb-6">
                      {['Incoming', 'Preparing', 'Ready'].map((status) => (
                        <div key={status} className="flex flex-col gap-3 bg-gray-50/50 rounded-xl p-2 h-full border border-gray-100">
                          <div className="flex justify-between items-center px-1">
                            <h3 className="font-black text-[10px] uppercase tracking-widest text-gray-900">{status}</h3>
                            <span className="bg-white text-[9px] font-black px-2 py-0.5 rounded-md border border-gray-200">
                              {liveKotQueue.filter(k => k.type === 'FOOD' && (k.status === status || (status === 'Incoming' && !['Preparing', 'Ready'].includes(k.status)))).length}
                            </span>
                          </div>
                          <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-grow">
                            {liveKotQueue
                              .filter((kot) => {
                                if (kot.type !== 'FOOD') return false;
                                if (status === 'Incoming') return kot.status === 'Incoming' || (!['Preparing', 'Ready'].includes(kot.status));
                                return kot.status === status;
                              })
                              .map((kot) => (
                                <div key={`${status}-${kot.id}`} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 group relative overflow-hidden transition-all hover:shadow-md">
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">{kot.tableLabel}</span>
                                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">KOT-{kot.id}</span>
                                    </div>
                                    <LiveTimer startTime={kot.createdAt} status={kot.status} />
                                  </div>

                                  <div className="mb-3">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">Capt. {kot.table.captainName?.split(' ')[0] || 'Walk-in'}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[9px] font-black text-[#E53935] uppercase">{kot.items.length} Items</span>
                                      <div className="w-1 h-1 rounded-full bg-gray-300" />
                                      <span className="text-[9px] font-black text-gray-500">{kot.itemsReady || 0}/{kot.items.length} Ready</span>
                                    </div>
                                  </div>

                                  <div className="space-y-1 text-[9px] text-gray-600 font-bold border-t border-gray-50 pt-2 mb-3">
                                    {kot.items.map((item, idx) => (
                                      <div key={`${kot.id}-${idx}`} className="flex justify-between items-center">
                                        <div className="flex items-center gap-1.5">
                                          <div className={`w-1.5 h-1.5 rounded-full ${item.t === 'veg' ? 'bg-green-500' : 'bg-red-500'}`} />
                                          <span className="truncate max-w-[120px]">{item.n}</span>
                                        </div>
                                        <span>x{item.q}</span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Actions */}
                                  <div className="flex gap-2 mt-2">
                                    {status === 'Incoming' && (
                                      <button onClick={() => updateKotStatus(kot.table.id, kot.id, 'Preparing')} className="flex-1 bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors">Start Prep</button>
                                    )}
                                    {status === 'Preparing' && (
                                      <button onClick={() => updateKotStatus(kot.table.id, kot.id, 'Ready')} className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors">Mark Ready</button>
                                    )}
                                    {status === 'Ready' && (
                                      <div className="flex-1 bg-gray-50 text-gray-400 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-center border border-gray-100">Waiting Pickup</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'online' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {onlineOrders.map(order => (
                      <div key={order.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:border-[#E53935] transition-all">
                        <div className="flex justify-between items-start mb-3">
                          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${order.platform === 'Swiggy' ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'
                            }`}>{order.platform}</span>
                          <span className="text-[9px] font-black text-gray-400">{order.time}</span>
                        </div>
                        <h3 className="text-[11px] font-black text-gray-900 mb-1">{order.id}</h3>
                        <div className="space-y-0.5 mb-4">
                          {order.items.map(item => <p key={item} className="text-[9px] text-gray-500 font-bold">{item}</p>)}
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                          <span className="text-[10px] font-black text-gray-900">₹{order.amount}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${order.status === 'Ready' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>{order.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

         {/* TABLE DETAILS MODAL */}
      {showTableModal && selectedTable && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-[#E53935] text-white flex items-center justify-center font-black text-2xl border-2 border-red-700 shadow-md transform hover:rotate-1 transition-transform">
                  {outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`}
                </div>
                <div>
                  <h2 className="text-[11px] sm:text-xs font-black uppercase text-gray-400 leading-none tracking-widest">Active Session</h2>
                  <p className="text-lg sm:text-xl font-black text-gray-900 mt-1">
                    {selectedTable.time ? new Date(selectedTable.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Just now'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowTableModal(false); setDiscountPercent(0); }}
                className="p-3 text-gray-500 hover:text-gray-900 hover:bg-gray-50 bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-150 active:scale-95"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-5 bg-white">
              {/* ── Order Summary (read-only view) ─────────────────── */}
              <div className="space-y-3.5 mb-5">
                <h3 className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#E53935] border-b border-red-100 pb-1.5">
                  Order Summary
                </h3>
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                  {getTableItems(selectedTable)
                    .filter(i => !i.removedFromBill)
                    .map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between items-center py-0.5">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-xs font-black text-gray-600">{item.q}x</span>
                          <span className="text-xs sm:text-sm font-bold text-gray-850">{item.n}</span>
                        </div>
                        <span className="text-xs sm:text-sm font-black text-gray-900">₹{Number(item.p * item.q).toFixed(0)}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* ── Discount Input ──────────────────────────────────── */}
              <div className="mb-4">
                <label className="block text-xs sm:text-sm font-black uppercase text-gray-400 tracking-wider mb-2">
                  Discount %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                  className="w-full px-4 py-3 bg-[#FFF5F5] border-2 focus:border-[#E53935] rounded-xl outline-none text-sm font-bold"
                  placeholder="Enter discount percentage"
                />
              </div>

              {/* ── Totals ──────────────────────────────────────────── */}
              <div className="bg-gray-50/90 rounded-2xl p-5 space-y-2.5 mb-6 border border-gray-200 shadow-sm">
                <div className="flex justify-between text-xs sm:text-sm font-black text-gray-500 uppercase tracking-wider"><span>Subtotal</span><span className="font-black text-gray-800">₹{Number(activeSubtotal || 0).toFixed(0)}</span></div>
                <div className="flex justify-between text-xs sm:text-sm font-black text-gray-500 uppercase tracking-wider"><span>GST (5% on food only)</span><span className="font-black text-gray-800">₹{Number(activeTaxes || 0).toFixed(0)}</span></div>
                {discountPercent > 0 && (
                  <div className="flex justify-between text-xs sm:text-sm font-black text-[#E53935] uppercase tracking-wider">
                    <span>Discount ({discountPercent}%)</span>
                    <span>-₹{((activeSubtotal || 0) * discountPercent / 100).toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-2.5">
                  <span className="text-xs sm:text-sm font-black text-gray-900 uppercase tracking-widest">
                    {discountPercent > 0 ? 'Final Total' : 'Running Total'}
                  </span>
                  <span className="text-3xl sm:text-4xl font-black text-[#E53935] tracking-tight">
                    ₹{discountPercent > 0
                      ? ((activeTotal || fallbackTotal || 0) - ((activeSubtotal || 0) * discountPercent / 100)).toFixed(0)
                      : Number(activeTotal || fallbackTotal || 0).toFixed(0)
                    }
                  </span>
                </div>
              </div>

              {/* ── Action buttons ──────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => { setActiveTab('pos'); localStorage.setItem('cashier_active_tab', 'pos'); setShowTableModal(false); setDiscountPercent(0); }}
                  className="py-3.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-xs sm:text-sm font-black uppercase tracking-wider hover:bg-gray-50 hover:border-gray-450 transition-all duration-150 hover:scale-[1.02] active:scale-95 shadow-sm hover:shadow cursor-pointer"
                >
                  Add Items
                </button>
                <button
                  onClick={() => setShowBillEditor(true)}
                  className="py-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs sm:text-sm font-black uppercase tracking-wider hover:bg-amber-100/70 transition-all duration-150 hover:scale-[1.02] active:scale-95 shadow-sm hover:shadow-amber-100/50 cursor-pointer"
                >
                  Edit Bill
                </button>
                {selectedTable.status === 'Waiting Bill' || selectedTable.status === 'BILLING_REQUESTED' ? (
                  <button
                    onClick={() => setShowMethodPicker(true)}
                    className="py-3.5 rounded-xl bg-[#E53935] border border-red-750 text-white text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 hover:bg-[#c62828] hover:scale-[1.02] active:scale-95 shadow-lg shadow-red-500/20 cursor-pointer"
                  >
                    Settlement
                  </button>
                ) : (
                  // Only show Final Bill button if there's a valid active order
                  (selectedTable.activeOrder?.id || selectedTable.orders?.[0]?.id || selectedTable.orderId) ? (
                    <button
                      onClick={handleFinalBill}
                      disabled={isPrintingBill || printCooldown}
                      className={`py-3.5 rounded-xl border text-white text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 shadow-lg flex items-center justify-center gap-2 ${
                        isPrintingBill || printCooldown
                          ? 'bg-gray-400 border-gray-500 cursor-not-allowed shadow-gray-400/20'
                          : 'bg-blue-600 border-blue-700 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 shadow-blue-500/20 cursor-pointer'
                      }`}
                    >
                      {isPrintingBill ? <Loader2 size={16} className="animate-spin" /> : null}
                      {printCooldown ? 'Reprint Available in...' : 'Final Bill'}
                    </button>
                  ) : (
                    <div className="py-3.5 rounded-xl border border-gray-300 bg-gray-200 text-gray-500 text-xs sm:text-sm font-black uppercase tracking-wider text-center cursor-not-allowed shadow-sm">
                      No Active Order
                    </div>
                  )
                )}
              </div>

              {/* Swap Table & Terminate Session buttons */}
              {selectedTable.status && selectedTable.status !== 'Free' && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  <button
                    onClick={() => { setSwapTargetId(null); setShowSwapModal(true); }}
                    className="w-full py-3.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 hover:bg-blue-100/60 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowRightLeft size={14} />
                    Swap Table
                  </button>
                  <button
                    onClick={terminateTableSession}
                    className="w-full py-3.5 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 hover:bg-red-100/60 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <X size={14} />
                    Terminate Session
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BILL EDITOR MODAL */}
      {showBillEditor && selectedTable && (() => {
        const committedItems = getTableItems(selectedTable).filter(i => !i.removedFromBill);
        const allMenuItems = outlet === 'bar' ? barMenuItems : menuItems;
        const searchResults = billEditSearch.trim().length > 1
          ? allMenuItems.filter(m =>
              m.isAvailable !== false &&
              (m.name || m.n || '').toLowerCase().includes(billEditSearch.toLowerCase())
            ).slice(0, 12)
          : [];

        // Live total: committed items minus removals + additions
        const liveTotalItems = [
          ...committedItems
            .filter(i => !billRemovals.includes(i.id))
            .map(i => ({ p: i.p, q: i.q })),
          ...billAdditions.map(i => ({ p: i.price, q: i.quantity })),
        ];
        const liveTotal = liveTotalItems.reduce((sum, i) => sum + i.p * i.q, 0);

        return (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                <div>
                  <p className="text-xs sm:text-sm font-black uppercase text-gray-400 tracking-wider">Edit Bill</p>
                  <p className="text-lg sm:text-xl font-black text-gray-900 mt-1">
                    Table {outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] sm:text-xs font-black uppercase text-gray-400 tracking-wider">New Total</p>
                    <p className="text-2xl sm:text-3xl font-black text-[#E53935] tracking-tight">₹{Number(liveTotal).toFixed(0)}</p>
                  </div>
                  <button
                    onClick={() => { setShowBillEditor(false); setBillRemovals([]); setBillAdditions([]); setBillEditSearch(''); }}
                    className="p-3 text-gray-500 hover:text-gray-900 hover:bg-gray-50 bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-150 active:scale-95"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-6">

                {/* ── Remove Section ── */}
                <div>
                  <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-gray-400 mb-3 pb-1 border-b border-gray-100">
                    Current Items — tap to remove
                  </p>
                  <div className="space-y-2.5">
                    {committedItems.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-5">No items on this order</p>
                    )}
                    {committedItems.map((item, idx) => {
                      const isMarked = billRemovals.includes(item.id);
                      return (
                        <div
                          key={item.id || idx}
                          onClick={() => {
                            if (!item.id) return;
                            setBillRemovals(prev =>
                              isMarked ? prev.filter(x => x !== item.id) : [...prev, item.id]
                            );
                          }}
                          className={`flex justify-between items-center p-3.5 sm:p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 select-none hover:scale-[1.01] active:scale-[0.99]
                            ${isMarked
                              ? 'border-red-200 bg-red-50 opacity-60'
                              : 'border-gray-100 bg-gray-50 hover:border-red-250 hover:bg-red-50/30'}`}
                        >
                          <div className="flex items-center gap-3.5">
                            {isMarked
                              ? <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow-sm"><X size={12} className="text-white" /></div>
                              : <div className="w-6 h-6 rounded-full border-2 border-gray-300 bg-white shadow-inner" />
                            }
                            <span className={`text-sm sm:text-base font-bold ${isMarked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {item.q}× {item.n}
                            </span>
                          </div>
                          <span className={`text-sm sm:text-base font-black ${isMarked ? 'text-red-550' : 'text-gray-900'}`}>
                            {isMarked ? '−' : ''}₹{Number(item.p * item.q).toFixed(0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Add Section ── */}
                <div>
                  <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-gray-400 mb-3 pb-1 border-b border-gray-100">
                    Add Items to Bill
                  </p>

                  {/* Search */}
                  <div className="relative mb-3.5">
                    <input
                      type="text"
                      value={billEditSearch}
                      onChange={e => setBillEditSearch(e.target.value)}
                      placeholder="Search menu item..."
                      className="w-full pl-5 pr-5 py-3.5 rounded-2xl border border-gray-200 text-sm sm:text-base font-semibold text-gray-850 focus:outline-none focus:border-amber-400 focus:bg-white bg-gray-50 transition-all shadow-inner"
                    />
                  </div>

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-1.5 mb-3.5 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                      {searchResults.map(m => (
                        <div
                          key={m.id}
                          onClick={() => {
                            setBillAdditions(prev => {
                              const exists = prev.findIndex(x => x.menuItemId === String(m.id));
                              if (exists !== -1) {
                                  return prev.map((x, i) => i === exists ? { ...x, quantity: x.quantity + 1 } : x);
                              }
                              return [...prev, {
                                menuItemId: String(m.id),
                                name: m.name || m.n,
                                price: Number(m.basePrice ?? m.p ?? 0),
                                quantity: 1,
                                menuType: m.menuType || 'FOOD',
                              }];
                            });
                            setBillEditSearch('');
                          }}
                          className="flex justify-between items-center p-3.5 rounded-xl border border-gray-200 bg-gray-50 hover:border-amber-300 hover:bg-amber-50 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                        >
                          <span className="text-sm sm:text-base font-bold text-gray-850">{m.name || m.n}</span>
                          <span className="text-sm sm:text-base font-black text-amber-600">+ ₹{Number(m.basePrice ?? m.p ?? 0).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Added items list */}
                  {billAdditions.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-500 mb-1">Added</p>
                      {billAdditions.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3.5 sm:p-4 rounded-2xl border-2 border-amber-250 bg-amber-50/70 shadow-sm animate-fade-in">
                          <div className="flex items-center gap-3.5">
                            <div className="flex items-center gap-2 bg-amber-100/50 p-1.5 rounded-xl border border-amber-200">
                              <button
                                onClick={() => setBillAdditions(prev =>
                                  prev[idx].quantity <= 1
                                    ? prev.filter((_, i) => i !== idx)
                                    : prev.map((x, i) => i === idx ? { ...x, quantity: x.quantity - 1 } : x)
                                )}
                                className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-amber-800 font-black text-sm hover:bg-amber-200 border border-amber-200 transition-all duration-100 active:scale-90 cursor-pointer"
                              >−</button>
                              <span className="text-sm font-black text-amber-800 w-5 text-center">{item.quantity}</span>
                              <button
                                onClick={() => setBillAdditions(prev =>
                                  prev.map((x, i) => i === idx ? { ...x, quantity: x.quantity + 1 } : x)
                                )}
                                className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-amber-800 font-black text-sm hover:bg-amber-200 border border-amber-200 transition-all duration-100 active:scale-90 cursor-pointer"
                              >+</button>
                            </div>
                            <span className="text-sm sm:text-base font-bold text-amber-800">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm sm:text-base font-black text-amber-700">+₹{Number(item.price * item.quantity).toFixed(0)}</span>
                            <button
                              onClick={() => setBillAdditions(prev => prev.filter((_, i) => i !== idx))}
                              className="text-amber-450 hover:text-red-500 transition-colors cursor-pointer"
                            ><X size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-gray-100 shrink-0 space-y-3">
                {(billRemovals.length > 0 || billAdditions.length > 0) && (
                  <div className="flex gap-2 text-xs sm:text-sm font-black uppercase text-gray-500">
                    {billRemovals.length > 0 && <span className="text-red-550">{billRemovals.length} item(s) removed</span>}
                    {billRemovals.length > 0 && billAdditions.length > 0 && <span>·</span>}
                    {billAdditions.length > 0 && <span className="text-amber-500">{billAdditions.reduce((s,i) => s + i.quantity, 0)} item(s) added</span>}
                  </div>
                )}
                <button
                  onClick={handleBillEditSave}
                  disabled={isSavingBillEdit || (billRemovals.length === 0 && billAdditions.length === 0)}
                  className={`w-full py-4.5 sm:py-5 rounded-2xl text-sm sm:text-base font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-95
                    ${!isSavingBillEdit && (billRemovals.length > 0 || billAdditions.length > 0)
                      ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-500/10 cursor-pointer'
                      : 'bg-gray-100 text-gray-300 cursor-not-allowed border border-gray-200'}`}
                >
                  {isSavingBillEdit ? 'Saving...' : 'Save Bill Changes'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PAYMENT METHOD PICKER */}
      {showMethodPicker && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200">

            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Settle Table {outlet === 'bar' ? `B${selectedTable?.number ?? selectedTable?.id}` : `T${selectedTable?.id}`}</p>
                <p className="text-3xl font-black text-gray-900 mt-1">₹{Number(activeTotal > 0 ? activeTotal : fallbackTotal).toFixed(0)}</p>
              </div>
              <button
                onClick={() => { setShowMethodPicker(false); setSelectedMethod(null); }}
                className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors duration-150"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-xs font-black uppercase text-gray-405 tracking-wider mb-3.5">Select Payment Method</p>
              <div className="grid grid-cols-2 gap-4.5 mb-6">
                {[
                  { id: 'UPI', label: 'UPI', sub: 'GPay / PhonePe / Paytm' },
                  { id: 'CARD', label: 'Card', sub: 'Debit / Credit' },
                  { id: 'CASH', label: 'Cash', sub: 'Physical currency' },
                  { id: 'OTHER', label: 'Other', sub: 'Voucher / Mixed' },
                ].map(({ id, label, sub }) => (
                  <button
                    key={id}
                    onClick={() => setSelectedMethod(id)}
                    className={`p-5 rounded-2xl border-2 text-left transition-all duration-150 hover:scale-[1.02] active:scale-95 ${selectedMethod === id
                        ? 'border-[#E53935] bg-red-50 shadow-md shadow-red-500/10'
                        : 'border-gray-150 bg-gray-50 hover:border-gray-300'
                      }`}
                  >
                    <p className={`text-base font-black ${selectedMethod === id ? 'text-[#E53935]' : 'text-gray-700'}`}>{label}</p>
                    <p className="text-[11px] text-gray-450 font-bold mt-1 leading-snug">{sub}</p>
                  </button>
                ))}
              </div>

              <button
                onClick={() => selectedMethod && !isPrintingBill && handlePayment(selectedMethod)}
                disabled={!selectedMethod || isPrintingBill}
                className={`w-full py-4.5 rounded-2xl text-xs md:text-sm font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-95 ${selectedMethod && !isPrintingBill
                    ? 'bg-[#E53935] text-white shadow-lg shadow-red-150 hover:bg-[#c62828] border border-red-750'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed border border-gray-200'
                  }`}
              >
                {isPrintingBill
                  ? 'Printing Bill...'
                  : selectedMethod
                    ? `Confirm ${selectedMethod} Payment`
                    : 'Select a Method'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* COMPACT SETTLEMENT */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-slide-in">
            <div className="md:w-1/3 p-6 bg-gray-50 border-r border-gray-100">
              <button onClick={() => { setShowPaymentModal(false); setSelectedTable(null); setSelectedPaymentMethod('UPI'); }} className="text-gray-400 hover:text-gray-900 mb-6"><X size={18} /></button>
              <h2 className="text-[9px] font-black uppercase text-gray-400 mb-1">Bill Amount</h2>
              <p className="text-4xl font-black text-gray-900 mb-6 tabular-nums">₹{Number(activeTotal > 0 ? activeTotal : fallbackTotal).toFixed(0)}</p>
              <div className="space-y-3">
                <div className="flex justify-between border-b border-gray-200 pb-1">
                  <span className="text-[8px] font-black text-gray-400 uppercase">Order ID</span>
                  <span className="text-[8px] font-black text-gray-900">#POS-45920</span>
                </div>
              </div>
            </div>
            <div className="md:w-2/3 p-8 flex flex-col gap-4">
              <h3 className="text-[10px] font-black uppercase text-center tracking-widest">Settle Transaction</h3>
              <div className="grid grid-cols-2 gap-3">
                {['UPI', 'CARD', 'CASH', 'SPLIT'].map(method => (
                  <div
                    key={method}
                    onClick={() => setSelectedPaymentMethod(method)}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 cursor-pointer transition-all ${selectedPaymentMethod === method
                        ? 'border-[#E53935] bg-red-50 text-[#E53935]'
                        : 'border-gray-50 bg-gray-50 text-gray-400'
                      }`}
                  >
                    <CreditCard size={20} />
                    <span className="text-[8px] font-black uppercase">{method}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => handlePayment(selectedPaymentMethod)}
                className="mt-2 py-3 bg-[#10B981] text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#059669]"
              >
                Authorize Settlement
              </button>
            </div>
          </div>
        </div>
      )}
      {/* TABLE SWAP MODAL */}
      {showSwapModal && selectedTable && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Swap Table Session</p>
                <p className="text-base font-black text-gray-900 mt-0.5">
                  {outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`} → Select Destination
                </p>
              </div>
              <button
                onClick={() => { setShowSwapModal(false); setSwapTargetId(null); }}
                className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5">
              <p className="text-[11px] font-black uppercase text-gray-400 tracking-wider mb-3">Free Tables</p>
              <div className="grid grid-cols-4 gap-2.5 max-h-52 overflow-y-auto pr-1">
                {activeTables
                  .filter(t => (!t.status || t.status === 'Free') && t.backendId !== selectedTable.backendId)
                  .sort((a, b) => Number(a.id) - Number(b.id))
                  .map(t => (
                    <button
                      key={t.backendId || t.id}
                      onClick={() => setSwapTargetId(t.backendId)}
                      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center text-xs font-black transition-all hover:scale-105 active:scale-95 ${
                        swapTargetId === t.backendId
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300'
                      }`}
                    >
                      <span className="text-lg font-black">{outlet === 'bar' ? `B${t.number ?? t.id}` : `T${t.id}`}</span>
                      <span className="text-[9px] font-bold text-green-600 mt-0.5">Free</span>
                    </button>
                  ))}
                {activeTables.filter(t => (!t.status || t.status === 'Free') && t.backendId !== selectedTable.backendId).length === 0 && (
                  <div className="col-span-4 py-8 text-center text-gray-400 text-xs font-bold">No free tables available</div>
                )}
              </div>

              <button
                onClick={async () => {
                  if (!swapTargetId || !selectedTable?.backendId || isSwapping) return;
                  setIsSwapping(true);
                  try {
                    await swapTable(selectedTable.backendId, swapTargetId, 'Cashier', activeRestaurantId);
                    setShowSwapModal(false);
                    setShowTableModal(false);
                    setSwapTargetId(null);
                    setSelectedTable(null);
                    addNotification('Table Moved', 'Session transferred successfully', 'success');
                  } catch (err) {
                    addNotification('Move Failed', err.message || 'Could not move table', 'error');
                  } finally {
                    setIsSwapping(false);
                  }
                }}
                disabled={!swapTargetId || isSwapping}
                className={`mt-4 w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 ${
                  swapTargetId && !isSwapping
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                {isSwapping ? 'Moving...' : swapTargetId ? 'Confirm Move' : 'Select a Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS OVERLAY */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="pointer-events-auto flex items-center gap-3 bg-white border-l-4 border-l-[#E53935] p-3 rounded-lg shadow-2xl animate-slide-in min-w-[240px]">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-[#E53935]">
              {n.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-900 uppercase tracking-tight">{n.title}</p>
              <p className="text-[9px] text-gray-500 font-medium leading-none mt-0.5">{n.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <VariantPicker
        item={variantPickerItem}
        onSelect={handleVariantSelect}
        onClose={() => setVariantPickerItem(null)}
      />
    </div>
  );
};

export default CashierDashboard;
