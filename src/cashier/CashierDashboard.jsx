import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Table2, ClipboardList, ShoppingCart, Settings, LogOut, Bell, Search,
  ChevronDown, Clock, CheckCircle2, AlertCircle, User, MoreVertical, Plus, Minus,
  Trash2, CreditCard, Banknote, Smartphone, Split, History, ChefHat, Monitor,
  Printer, X, Check, Zap, ArrowRight, Filter, Layers, ArrowUpRight, Loader2, Timer,
  TrendingUp, Users, Package, Wallet, ArrowRightLeft, Activity, BarChart3, MessageSquare, Calendar
} from 'lucide-react';
import { useMenu } from '../context/MenuContext';
import { useTableSync } from '../services/tableSyncService';
import { saveTransaction, fetchTransactions, fetchTransactionsWithRetry, createOrder, updateOrderItems, updateOrderStatus, editBill, swapTable, transferItems, deleteTransaction, requestBilling, cancelOrderItem, cancelOrderItems } from '../services/orderApi';
// REMOVED: Direct QZ Tray calls deleted. Cashier now emits print jobs via backend socket.
import { calculateOrderTotal, calculateSessionBill, calculateTableBill, getTableItems, getAllOrderItems, getBillableItems, groupOrderItems } from '../shared/utils/billing';
import { filterMenuItems } from '../shared/utils/menuSearch';
import { useSocket } from '../hooks/useSocket';
import LiveTimer from '../shared/components/LiveTimer';
import { RESTAURANT_ID, updateTableSession } from '../services/tableApi';
import { useOutlet } from '../context/OutletContext';
import OutletToggle from '../shared/components/OutletToggle';
import BarMenuToggle from '../shared/components/BarMenuToggle';
import VariantPicker from '../shared/components/VariantPicker';
import { useBarTableSync } from '../services/barTableSyncService';
import { useBarMenuSync } from '../services/barMenuSyncService';
import { BAR_ID } from '../services/barApiConfig';
import { updateBarTableSession } from '../services/barTableApi';
import ItemAnalytics from './ItemAnalytics';
import VenueSectionView from '../shared/components/VenueSectionView';
import { API_BASE } from '../services/apiConfig';
import { isBeerItem } from '../utils/itemHelpers';
import { useVenuePrices } from '../hooks/useVenuePrices';
import { useVenueTableSync } from '../services/venueTableSyncService';
import DateInputButton from '../shared/components/DateInputButton';
import { getKolkataDateString, getKolkataMonthString, KOLKATA_TIME_ZONE, shiftKolkataDate, formatTxnDisplayId } from '../shared/utils/dateFormat';
import { getTableSectionLabel, getSectionBadgeColor } from '../utils/tableHelpers';
import { withOptimisticUpdate, logCriticalError, BackgroundQueue } from '../utils/resilience';

const BAR_UNIT_ML = 30;
const FULL_BOTTLE_ML = 750;
const TXN_PAGE_SIZE = 100;

// Background queue for final bill + inventory deduction
const settlementQueue = new BackgroundQueue('settlement');

const toFrontendTableStatus = (backendStatus) => {
  const map = {
    AVAILABLE: 'Free',
    OCCUPIED: 'Occupied',
    BILLING_REQUESTED: 'Waiting Bill',
    RESERVED: 'Reserved',
    CLEANING: 'Cleaning',
  };
  return map[backendStatus] || 'Free';
};

// INVARIANT: A table with dbStatus === 'AVAILABLE' or workflowStatus === 'Free' MUST ALWAYS have kotHistory = [], currentBill = 0, activeOrder = null. No exception.
const mapRealtimeTablePayload = (row, existing = null) => {
  if (!row) return existing;

  const dbStatus = row.status;
  const isFreeWorkflow = row.workflowStatus === 'Free' || row.status === 'Free' || dbStatus === 'AVAILABLE';

  return {
    backendId: row.id,
    id: Number(row.number) || row.number,
    number: row.number,
    dbStatus: row.status,
    status: isFreeWorkflow ? 'Free' : (row.workflowStatus || toFrontendTableStatus(row.status)),
    capacity: row.capacity,
    sectionId: row.sectionId,
    section: row.section,
    guests: isFreeWorkflow ? 0 : (row.guests ?? 0),
    time: (isFreeWorkflow || !row.sessionStartedAt) ? null : new Date(row.sessionStartedAt).toISOString(),
    captainId: isFreeWorkflow ? null : (row.captainId ?? null),
    kotHistory: isFreeWorkflow ? [] : (Array.isArray(row.kotHistory) ? row.kotHistory : []),
    currentBill: isFreeWorkflow ? 0 : Number(row.currentBill ?? 0),
    activeOrder: isFreeWorkflow ? null : (row.orders?.[0] || row.activeOrder || null),
    ...(existing ? { displayName: existing.displayName, name: existing.name } : {}),
  };
};

const CAPTAINS = [
  { id: 'C1', name: 'Ajay Kumar' },
  { id: 'C2', name: 'Raja Behera' },
  { id: 'C3', name: 'Sagar' },
];

const WALKIN_TABLES = Array.from({ length: 20 }, (_, i) => ({
  id: `W${i + 1}`,
  number: i + 1,
  backendId: null,
  isWalkIn: true,
  status: 'Free',
  sectionId: null,
  section: { restaurantId: 'restaurant-001', name: 'Walk-in' },
  kotHistory: [],
  currentBill: 0,
  activeOrder: null,
}));

// Source sets for outlet-level data isolation
const BAR_SOURCES = new Set(['bar', 'bar-ac-hall', 'bar-conference', 'bar-pdr', 'bar-rooms', 'bar-parcel']);
const RESTAURANT_SOURCES = new Set(['restaurant', 'family-restaurant', 'restaurant-parcel']);

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

  // Space and punctuation-stripped versions for space-insensitive and compact matching
  const nameCompact = name.replace(/[^a-z0-9]/g, '');
  const qCompact = q.replace(/[^a-z0-9]/g, '');

  // Rank 1: Product name starts with query (with spaces)
  if (name.startsWith(q)) return 1;

  // Rank 2: Product name starts with query (space/punctuation-stripped)
  if (qCompact && nameCompact.startsWith(qCompact)) return 2;

  // Rank 3: A word inside the product name starts with search query
  const words = name.split(/[\s()&,\-\/\d]+/).filter(Boolean);
  if (words.some(word => word.startsWith(q))) return 3;

  // Rank 4: Product name contains search query (substring, with spaces)
  if (name.includes(q)) return 4;

  // Rank 5: Product name contains search query (substring, space/punctuation-stripped)
  if (qCompact && nameCompact.includes(qCompact)) return 5;

  // Rank 6: Initials/Acronym match
  // e.g. "Veg Fried Rice" initials are "vfr". If query matches initials.
  const initials = words.map(w => w[0]).join('');
  if (qCompact && (initials.startsWith(qCompact) || isSubsequence(qCompact, initials))) return 6;

  // Rank 7: Category match (space/punctuation-insensitive)
  if (category.includes(q) || (qCompact && category.replace(/[^a-z0-9]/g, '').includes(qCompact))) return 7;

  // Rank 8: Subsequence match of name (space/punctuation-insensitive)
  if (qCompact && isSubsequence(qCompact, nameCompact)) return 8;

  // Rank 9: Description match
  if (desc.includes(q) || (qCompact && desc.replace(/[^a-z0-9]/g, '').includes(qCompact))) return 9;

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

  const q = highlight.toLowerCase().replace(/[^a-z0-9]/g, '');
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
  const { outlet } = useOutlet();
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('cashier_active_tab') || 'dashboard');
  const [tableSubCategory, setTableSubCategory] = useState(() => {
    const saved = localStorage.getItem('softshape_selected_subcategory');
    if (saved) return saved;
    return outlet === 'bar' ? 'bar-ac-hall' : 'family-restaurant';
  }); // bar: 'bar-ac-hall' | 'bar-conference' | 'bar-pdr' | 'bar-rooms' | 'bar-parcel', restaurant: 'family-restaurant' | 'parcel'
  const [selectedPDRRoom, setSelectedPDRRoom] = useState(() => {
    const saved = localStorage.getItem('cashier_selected_pdr_room');
    return saved ? Number(saved) : null;
  }); // 1-4
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedMenuType, setSelectedMenuType] = useState('ALL');
  const [activeDiet, setActiveDiet] = useState('All');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingTabSwitch, setPendingTabSwitch] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleTabSwitch = (tabId) => {
    // Check if switching between family-restaurant and parcel in restaurant outlet
    const isSwitchingProtected = outlet === 'restaurant' &&
      ((tableSubCategory === 'family-restaurant' && tabId === 'parcel') ||
       (tableSubCategory === 'parcel' && tabId === 'family-restaurant'));

    if (isSwitchingProtected) {
      setPendingTabSwitch(tabId);
      setPasswordInput('');
      setPasswordError('');
      setPasswordModalOpen(true);
    } else {
      setTableSubCategory(tabId);
      setSelectedPDRRoom(null);
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === '1001') {
      setPasswordModalOpen(false);
      setPasswordInput('');
      setPasswordError('');
      if (pendingTabSwitch) {
        setTableSubCategory(pendingTabSwitch);
        setSelectedPDRRoom(null);
        setPendingTabSwitch(null);
      }
    } else {
      setPasswordError('Incorrect password');
    }
  };

  const handlePasswordCancel = () => {
    setPasswordModalOpen(false);
    setPasswordInput('');
    setPasswordError('');
    setPendingTabSwitch(null);
  };

  useEffect(() => {
    setSelectedCategory('All');
  }, [selectedMenuType]);

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
  const [cart, setCart] = useState(() => {
    try {
      const savedTableStr = localStorage.getItem('cashier_selected_table');
      const savedTable = savedTableStr ? JSON.parse(savedTableStr) : null;
      if (!savedTable || savedTable.status === 'Free' || savedTable.status === 'AVAILABLE') {
        return [];
      }
      const key = getCartStorageKey(savedTable);
      const saved = localStorage.getItem(key) || localStorage.getItem('cashier_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [expandedNoteItemId, setExpandedNoteItemId] = useState(null);
  const [activeNoteItemId, setActiveNoteItemId] = useState(null);
  const [noteInputValue, setNoteInputValue] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedTable, setSelectedTable] = useState(() => {
    try {
      const saved = localStorage.getItem('cashier_selected_table');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [showTableModal, setShowTableModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSelected, setCancelSelected] = useState({});
  const [cancelBatchLoading, setCancelBatchLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState({});
  const [isKotSending, setIsKotSending] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const isSubmittingKotRef = useRef(false);
  const kotRequestIdRef = useRef(null);
  const lastConfirmedItemsRef = useRef([]);
  const [isKotSuccess, setIsKotSuccess] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('UPI');
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isPrintingBill, setIsPrintingBill] = useState(false);
  const isPrintingBillRef = useRef(false);
  const [lastPrintTime, setLastPrintTime] = useState(null);
  const [printCooldown, setPrintCooldown] = useState(false);
  const [isReprintingBill, setIsReprintingBill] = useState(false);
  // Set of orderIds that have already been settled this session — prevents double-settlement
  const [settledOrderIds, setSettledOrderIds] = useState(() => new Set());
  // Set of table backendIds settled this session — prevents socket/sync from reverting UI
  const [settledTableIds, setSettledTableIds] = useState(() => new Set());
  const settledTableIdsRef = useRef(settledTableIds);
  useEffect(() => { settledTableIdsRef.current = settledTableIds; }, [settledTableIds]);
  const terminatedTableIdsRef = useRef(new Set());
  const syncPauseUntilRef = useRef(0);
  // --- Bill-printed guard ---
  // Primary flag: table IDs where bill was printed but settlement not yet confirmed.
  // This is the single source of truth for the Settlement button and socket guards.
  const [billPrintedTableIds, setBillPrintedTableIds] = useState(() => {
    // Restore any bill_printed state from localStorage on mount
    try {
      const stored = localStorage.getItem('cashier_bill_printed_tables');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const billPrintedTableIdsRef = useRef(billPrintedTableIds);
  useEffect(() => { billPrintedTableIdsRef.current = billPrintedTableIds; }, [billPrintedTableIds]);
  // Per-table cooldown: tableBackendId -> timestamp until which socket updates are ignored
  const billPrintCooldownRef = useRef(new Map()); // Map<tableBackendId, number>
  const lastKnownBillRef = useRef(0); // monotonically increasing — never go backwards
  const lsWriteTimerRef = useRef(null);

  function shallowEqualSelectedTable(prev, next) {
    if (!prev || !next) return prev === next;
    return (
      prev.status === next.status &&
      prev.workflowStatus === next.workflowStatus &&
      prev.currentBill === next.currentBill &&
      prev.activeOrder?.id === next.activeOrder?.id &&
      prev.activeOrder?.totalAmount === next.activeOrder?.totalAmount &&
      (prev.kotHistory?.length ?? 0) === (next.kotHistory?.length ?? 0)
    );
  }

  // Helper: namespaced cart key so tables never bleed into each other
  const getCartStorageKey = (table) => {
    if (!table) return 'cashier_cart_none';
    if (table.isWalkIn || !table.backendId) return 'cashier_cart_walkin';
    return `cashier_cart_${table.backendId}`;
  };

  const clearCashierTableCache = (table) => {
    localStorage.removeItem('cashier_selected_table');
    if (table?.backendId) {
      localStorage.removeItem(`cashier_cart_${table.backendId}`);
    }
    localStorage.removeItem('cashier_cart_walkin');
    localStorage.removeItem('cashier_cart');
  };

  // ── Moved up: these must be declared before activeTablesRef / venueTablesRef ──
  const venuePrices = useVenuePrices();
  const { tables: venueTables, setTables: setVenueTables, isSyncing: venueTablesLoading, refetch: refetchVenueTables } = useVenueTableSync();

  const { menuItems, categories, loading: restaurantMenuLoading } = useMenu();
  const { tables, setTables, refetch: refetchRestaurantTables } = useTableSync();

  const { tables: barTables, setTables: setBarTables, refetch: refetchBarTables } = useBarTableSync();
  const { menuItems: barMenuItems, loading: barMenuLoading } = useBarMenuSync();
  const menuLoading = outlet === 'bar' ? barMenuLoading : restaurantMenuLoading;
  const [barMenuTab, setBarMenuTab] = useState('food');
  const [variantPickerItem, setVariantPickerItem] = useState(null);

  // Derived — restaurant or bar depending on outlet
  const activeTables = outlet === 'bar' ? barTables : tables;
  const setActiveTables = outlet === 'bar' ? setBarTables : setTables;
  const activeRestaurantId = outlet === 'bar' ? BAR_ID : outlet === 'venue' ? 'venue-001' : RESTAURANT_ID;

  const socket = useSocket(activeRestaurantId);
  // ── End moved block ──

  const activeTablesRef = useRef(activeTables);
  useEffect(() => { activeTablesRef.current = activeTables; }, [activeTables]);
  const venueTablesRef = useRef(venueTables);
  useEffect(() => { venueTablesRef.current = venueTables; }, [venueTables]);

  // Helper: determine if an incoming table update should be blocked
  const shouldBlockTableUpdate = (tableId, incomingStatus) => {
    // --- Bill-print cooldown: ignore all sync for 5s after printing ---
    const billCooldownUntil = billPrintCooldownRef.current.get(tableId) || 0;
    if (Date.now() < billCooldownUntil) return true;

    // --- Bill printed but not yet settled: block any status that would revert to non-Waiting-Bill ---
    if (billPrintedTableIdsRef.current.has(tableId)) {
      // Only allow the table to go Free/AVAILABLE (settlement done by another tab) or stay Waiting Bill
      const forward = new Set(['Free', 'AVAILABLE', 'TERMINATED', 'CLEANING', 'Cleaning', 'Waiting Bill', 'BILLING_REQUESTED']);
      const mapped = toFrontendTableStatus(incomingStatus);
      if (incomingStatus && !forward.has(incomingStatus) && !forward.has(mapped)) return true;
    }

    if (!settledTableIdsRef.current.has(tableId)) return false;
    // During 5s pause after settlement: block ALL updates
    if (Date.now() < syncPauseUntilRef.current) return true;
    // After pause: if table is already Free locally, a new session may have started — allow
    const localTable = [...(activeTablesRef.current || []), ...(venueTablesRef.current || [])]
      .find(t => t.backendId === tableId);
    if (!localTable || localTable.status === 'Free' || localTable.status === 'AVAILABLE') return false;
    // Otherwise only allow forward transitions (Free / AVAILABLE / TERMINATED / CLEANING)
    const forward = new Set(['Free', 'AVAILABLE', 'TERMINATED', 'CLEANING', 'Cleaning']);
    const mapped = toFrontendTableStatus(incomingStatus);
    return !forward.has(incomingStatus) && !forward.has(mapped);
  };

  const [discountMode, setDiscountMode] = useState('percent');
  const [rawDiscountInput, setRawDiscountInput] = useState('');
  const [walkinTableNumber, setWalkinTableNumber] = useState(null); // 1-20 when active
  const [isWalkinMode, setIsWalkinMode] = useState(false);
  
  const rawSubtotal = useMemo(() => {
    let items = [];
    if (activeTab === 'pos' && !selectedTable) {
      items = cart;
    } else if (selectedTable) {
      const committedItems = getTableItems(selectedTable);
      const itemsForTotal = committedItems.length > 0
        ? committedItems
        : lastConfirmedItemsRef.current;
      items = [...itemsForTotal, ...cart];
    }
    return items.filter(i => !i.removedFromBill).reduce((acc, item) => acc + (Number(item.p || 0) * Number(item.q || 1)), 0);
  }, [selectedTable, activeTab, cart]);

  const discountPercent = useMemo(() => {
    const val = parseFloat(rawDiscountInput);
    if (isNaN(val) || val <= 0) return 0;
    
    if (discountMode === 'percent') {
      return Math.min(100, val);
    } else {
      if (rawSubtotal <= 0) return 0;
      const effectivePct = (val / rawSubtotal) * 100;
      return Math.min(100, effectivePct);
    }
  }, [rawDiscountInput, discountMode, rawSubtotal]);

  const [isCartMinimized, setIsCartMinimized] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Persist selections to localStorage (debounced to avoid micro-stutters)
  useEffect(() => {
    if (lsWriteTimerRef.current) clearTimeout(lsWriteTimerRef.current);
    if (selectedTable) {
      lsWriteTimerRef.current = setTimeout(() => {
        localStorage.setItem('cashier_selected_table', JSON.stringify(selectedTable));
      }, 300);
    } else {
      localStorage.removeItem('cashier_selected_table');
    }
    return () => clearTimeout(lsWriteTimerRef.current);
  }, [selectedTable]);

  useEffect(() => {
    localStorage.setItem('softshape_selected_subcategory', tableSubCategory);
  }, [tableSubCategory]);

  // Cross-tab sync: update venue selection when changed in another tab (Captain / Cashier)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'softshape_selected_subcategory' && e.newValue && e.newValue !== tableSubCategory) {
        setTableSubCategory(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [tableSubCategory]);

  useEffect(() => {
    if (selectedPDRRoom) {
      localStorage.setItem('cashier_selected_pdr_room', String(selectedPDRRoom));
    } else {
      localStorage.removeItem('cashier_selected_pdr_room');
    }
  }, [selectedPDRRoom]);

  useEffect(() => {
    const key = getCartStorageKey(selectedTable);
    if (key && key !== 'cashier_cart_none') {
      localStorage.setItem(key, JSON.stringify(cart));
    }
    // Also clear legacy global key to prevent stale data from ever bleeding
    localStorage.removeItem('cashier_cart');
  }, [cart, selectedTable]);

  // Table-swap state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState(null);
  const [showItemSwapModal, setShowItemSwapModal] = useState(false);
  const [itemSwapSelectedIds, setItemSwapSelectedIds] = useState([]);
  const [itemSwapTargetId, setItemSwapTargetId] = useState(null);
  const [isSwappingItems, setIsSwappingItems] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);

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
  const [showBillEditor, setShowBillEditor] = useState(false);
  const [billRemovals, setBillRemovals] = useState([]); // orderItemIds to remove
  const [billEditQuantities, setBillEditQuantities] = useState({});
  const [billAdditions, setBillAdditions] = useState([]); // { menuItemId, name, price, quantity, menuType }
  const [billEditSearch, setBillEditSearch] = useState('');
  const [isSavingBillEdit, setIsSavingBillEdit] = useState(false);

  useEffect(() => {
    setRemovedItemIds([]);
    setBillRemovals([]);
    setBillEditQuantities({});
    setBillAdditions([]);
    setBillEditSearch('');
    setShowItemSwapModal(false);
    setItemSwapSelectedIds([]);
    setItemSwapTargetId(null);
    setIsSwappingItems(false);
  }, [selectedTable?.backendId]);

  const TX_CACHE_KEY = `softshape_transactions_${outlet}_${getKolkataDateString()}`;

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
  const [txnCustomDate, setTxnCustomDate] = useState('');
  const txnDateFilterRef = useRef('today'); // Keeps latest filter accessible inside closures without re-subscribing
  const [txnMethodFilter, setTxnMethodFilter] = useState('all'); // 'all' | 'CASH' | 'UPI' | 'CARD'
  const [txnSourceFilter, setTxnSourceFilter] = useState('all');
  const [txnSearch, setTxnSearch] = useState('');
  const [txnPage, setTxnPage] = useState(1);

  function formatBillNumber(txnDate, txnNumber) {
    return formatTxnDisplayId(txnDate, txnNumber);
  }

  const loadTransactions = useCallback(async (filter = 'today', dateOverride = null) => {
    setTxnsLoading(true);
    try {
      let dateParam = null;
      let monthParam = null;
      let limitParam = 3000; // Increased for safety

      if (dateOverride) {
        dateParam = dateOverride;
      } else if (filter === 'custom' && txnCustomDate) {
        dateParam = txnCustomDate;
      } else if (filter === 'today') {
        dateParam = getKolkataDateString();
      } else if (filter === 'yesterday') {
        dateParam = shiftKolkataDate(new Date(), -1);
      } else if (filter === 'month') {
        monthParam = getKolkataMonthString();
        limitParam = 3000;
      } else {
        // 'all' — no date filter, no limit (0 = unlimited)
        limitParam = 0;
      }

      const restaurantIds = ['bar-001', 'restaurant-001', 'venue-001'];

      const allResults = await Promise.all(
        restaurantIds.map(rid => fetchTransactions(rid, limitParam, dateParam, monthParam).catch(e => {
          console.warn(`[Transactions] Failed for ${rid}:`, e.message);
          return [];
        }))
      );

      let allTxns = allResults.flatMap((txns, idx) => {
        const rid = restaurantIds[idx];
        return txns.map(txn => ({ ...txn, _sourceRestaurantId: rid }));
      });

      // Better deduping by transaction ID (UUIDs are globally unique)
      const seen = new Set();
      const deduped = allTxns.filter(txn => {
        const key = txn.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      deduped.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

      const mapped = deduped.map(txn => {
        const subtotal = txn.subtotal != null ? Number(txn.subtotal) : null;
        const cgst = txn.cgst != null ? Number(txn.cgst) : 0;
        const sgst = txn.sgst != null ? Number(txn.sgst) : 0;
        const grandTotal = txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0);
        const storedDiscountAmount = txn.discountAmount != null ? Number(txn.discountAmount) : null;
        const discountAmount = storedDiscountAmount != null
          ? storedDiscountAmount
          : subtotal != null
            ? Math.max(0, Math.round((subtotal + cgst + sgst - grandTotal) * 100) / 100)
            : 0;
        const storedDiscountPercent = txn.discountPercent != null ? Number(txn.discountPercent) : null;
        const discountPercent = storedDiscountPercent != null
          ? storedDiscountPercent
          : subtotal && discountAmount > 0
            ? Math.round((discountAmount / subtotal) * 10000) / 100
            : 0;
        const source = txn._sourceRestaurantId === 'venue-001'
          ? (
            txn.sectionTag === 'venue-family-restaurant' || String(txn.sectionName || '').toLowerCase().includes('family restaurant')
              ? 'family-restaurant'
              : txn.sectionTag === 'venue-restaurant-parcel'
                ? 'restaurant-parcel'
                : txn.sectionTag === 'venue-bar-parcel'
                  ? 'bar-parcel'
                  : txn.sectionTag === 'venue-bar-conference'
                    ? 'bar-conference'
                    : txn.sectionTag === 'venue-bar-pdr'
                      ? 'bar-pdr'
                      : txn.sectionTag === 'venue-bar-rooms'
                        ? 'bar-rooms'
                        : txn.sectionTag === 'venue-bar-ac-hall'
                          ? 'bar-ac-hall'
                          : 'venue'
          )
          : txn._sourceRestaurantId === 'restaurant-001'
            ? 'restaurant'
            : 'bar';

        return {
          id: txn.id,
          orderId: txn.orderId || null,
          txnNumber: txn.txnNumber || null,
          displayId: formatBillNumber(txn.txnDate, txn.txnNumber),
          kot: txn.orderId ? `ORD-${txn.orderId.slice(-6).toUpperCase()}` : '—',
          amount: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
          grandTotal: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
          subtotal,
          discountPercent,
          discountAmount,
          cgst,
          sgst,
          time: new Date(txn.paidAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: KOLKATA_TIME_ZONE }),
          date: new Date(txn.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: KOLKATA_TIME_ZONE }),
          timestamp: new Date(txn.paidAt).getTime(),
          items: txn.itemCount || 0,
          itemsList: txn.items || [],
          captainId: txn.captainId || 'CASHIER',
          captainName: CAPTAINS.find(c => c.id === txn.captainId)?.name || (txn.captainId && txn.captainId !== 'CASHIER' ? txn.captainId : 'Head Cashier'),
          method: txn.method || 'UPI',
          tableNumber: txn.tableNumber || null,
          source,
          restaurantId: txn._sourceRestaurantId,
        };
      });

      // Isolate: bar outlet sees only bar/bar-venue sources; restaurant outlet sees only restaurant/restaurant-venue sources
      const isolated = mapped.filter(txn => {
        if (outlet === 'bar') {
          // Bar sees ONLY bar-sourced transactions — never any restaurant source
          return BAR_SOURCES.has(txn.source);
        }
        // Restaurant sees ONLY restaurant-sourced transactions — never bar or unknown venue
        return RESTAURANT_SOURCES.has(txn.source);
      });

      setPastTransactions(isolated);
      
      // Only cache today's data + add version stamp
      if (filter === 'today') {
        localStorage.setItem(TX_CACHE_KEY, JSON.stringify(isolated));
        localStorage.setItem(`${TX_CACHE_KEY}_version`, Date.now().toString());
      }
    } catch (err) {
      console.error('[Transactions] Critical fetch failure:', err);
      // Fallback to cache
      const cached = localStorage.getItem(TX_CACHE_KEY);
      if (cached) setPastTransactions(JSON.parse(cached));
    } finally {
      setTxnsLoading(false);
    }
  }, [outlet, txnCustomDate]);

  // FIX 2: Filtered transactions based on method and search
  const filteredTransactions = useMemo(() => {
    let list = pastTransactions;

    if (txnSourceFilter !== 'all') {
      list = list.filter(txn => txn.source === txnSourceFilter);
    }

    // Method filter
    if (txnMethodFilter !== 'all') {
      list = list.filter(txn => txn.method === txnMethodFilter);
    }

    // Search by bill number — matches partial string on displayId
    if (txnSearch.trim()) {
      const q = txnSearch.trim().toLowerCase();
      list = list.filter(txn =>
        (txn.displayId || '').toLowerCase().includes(q) ||
        (txn.captainName || '').toLowerCase().includes(q) ||
        String(txn.tableNumber || '').toLowerCase().includes(q) ||
        String(txn.grandTotal ?? txn.amount ?? '').includes(q)
      );
    }

    return list;
  }, [pastTransactions, txnMethodFilter, txnSearch, txnSourceFilter]);

  const txnTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / TXN_PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (txnPage - 1) * TXN_PAGE_SIZE;
    return filteredTransactions.slice(start, start + TXN_PAGE_SIZE);
  }, [filteredTransactions, txnPage]);

  // Reset page whenever txn filters change
  useEffect(() => {
    setTxnPage(1);
  }, [txnDateFilter, txnMethodFilter, txnSourceFilter, txnSearch, txnCustomDate]);

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
    if (!socket) return;

    // useSocket(activeRestaurantId) handles room joins; we only need to refetch on reconnect
    const onConnect = () => {
      if (outlet === 'bar') {
        refetchBarTables();
      } else if (outlet === 'venue') {
        refetchVenueTables();
      } else {
        refetchRestaurantTables();
      }
    };

    socket.on('connect', onConnect);

    const onBillingRequested = (payload) => {
      const { table, order } = payload;
      if (!table) return;
      if (shouldBlockTableUpdate(table.id, table.status)) return;

      // Route table status update to the correct array
      const isVenue = payload?.restaurantId === 'venue-001' || table?.restaurantId === 'venue-001';
      const updateTableStatus = (prev) => prev.map(t =>
        t.backendId === table.id ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : t
      );
      if (isVenue) {
        if (setVenueTables) setVenueTables(updateTableStatus, { skipPersist: true });
      } else {
        setActiveTables(updateTableStatus, { skipPersist: true });
      }

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
      const order = payload?.order || payload;
      if (!order?.tableId) return;
      console.log('[CashierDashboard] Received order:created for table:', order.tableId);
      if (shouldBlockTableUpdate(order.tableId, null)) return;
      if (terminatedTableIdsRef.current.has(order.tableId)) return;
      if (selectedTable?.backendId === order.tableId) {
        setSelectedTable(prev => prev ? {
          ...prev,
          activeOrder: order,
          status: prev.status === 'Free' ? 'Occupied' : prev.status,
          workflowStatus: prev.workflowStatus === 'Free' ? 'Occupied' : prev.workflowStatus,
          currentBill: Math.max(Number(prev.currentBill ?? 0), Number(order.totalAmount ?? 0)),
        } : prev);
      }
      const isVenue = payload?.restaurantId === 'venue-001' || order?.restaurantId === 'venue-001';
      const updateTables = (prev) => prev.map(t =>
        t.backendId === order.tableId
          ? {
              ...t,
              activeOrder: order,
              status: t.status === 'Free' ? 'Occupied' : t.status,
              workflowStatus: t.workflowStatus === 'Free' ? 'Occupied' : t.workflowStatus,
              currentBill: Math.max(Number(t.currentBill ?? 0), Number(order.totalAmount ?? 0)),
            }
          : t
      );
      if (isVenue) {
        if (setVenueTables) setVenueTables(updateTables, { skipPersist: true });
      } else {
        setActiveTables(updateTables, { skipPersist: true });
      }
    };

    const mergeOrder = (incoming, existing) => {
      if (!existing) return incoming;
      // FIX: Additive item merging - union incoming with existing, never replace
      // An item already present in existing should never be removed unless removedFromBill === true
      const incomingItems = incoming?.items || [];
      const existingItems = existing?.items || [];
      const existingMap = new Map(existingItems.map(i => [i.id, i]));

      const mergedItems = incomingItems.map(incomingItem => {
        const existingItem = existingMap.get(incomingItem.id);
        if (existingItem?.removedFromBill && !incomingItem.removedFromBill) {
          return { ...incomingItem, removedFromBill: true, quantity: 0 };
        }
        return incomingItem;
      });

      const incomingIds = new Set(incomingItems.map(i => i.id));
      // Add existing items that are NOT in incoming (additive merge)
      const localOnlyItems = existingItems.filter(i => !incomingIds.has(i.id));
      // Also preserve items marked as removedFromBill locally even if they're in incoming
      const localOnlyRemoved = existingItems.filter(i => i.removedFromBill && !incomingIds.has(i.id));

      const merged = {
        ...incoming,
        items: [...mergedItems, ...localOnlyItems, ...localOnlyRemoved],
      };

      // FIX #4: Always use the version with MORE items to prevent data loss
      const incomingItemCount = merged.items.length;
      const existingItemCount = existingItems.length;
      if (incomingItemCount > existingItemCount) return merged;
      if (existingItemCount > incomingItemCount) return existing;
      // Equal items — fall back to timestamp
      const incomingTime = incoming?.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
      const existingTime = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      return incomingTime >= existingTime ? merged : existing;
    };

    const onOrderUpdated = (payload) => {
      const order = payload?.order || payload;
      if (!order?.tableId) return;
      if (shouldBlockTableUpdate(order.tableId, null)) return;
      if (terminatedTableIdsRef.current.has(order.tableId)) return;
      if (selectedTable?.backendId === order.tableId) {
        setSelectedTable(prev => prev ? { ...prev, activeOrder: mergeOrder(order, prev.activeOrder) } : prev);
      }
      const isVenue = payload?.restaurantId === 'venue-001' || order?.restaurantId === 'venue-001';
      const updateTables = (prev) => prev.map(t =>
        t.backendId === order.tableId
          ? {
              ...t,
              activeOrder: mergeOrder(order, t.activeOrder),
              currentBill: Math.max(Number(t.currentBill ?? 0), Number(order.totalAmount ?? 0)),
            }
          : t
      );
      if (isVenue) {
        if (setVenueTables) setVenueTables(updateTables, { skipPersist: true });
      } else {
        setActiveTables(updateTables, { skipPersist: true });
      }
    };

    const onTableUpdated = ({ table } = {}) => {
      if (!table?.id) return;
      if (shouldBlockTableUpdate(table.id, table.status)) return;
      if (terminatedTableIdsRef.current.has(table.id)) return;
      const applyTableUpdate = (prev) => prev.map(t => {
        if (t.backendId !== table.id) return t;

        const incomingStatus = table.workflowStatus || (table.status !== undefined ? toFrontendTableStatus(table.status) : t.status);
        const incomingIsAvailable = incomingStatus === 'Free' || incomingStatus === 'AVAILABLE' || table.status === 'AVAILABLE';
        if (incomingIsAvailable && t.activeOrder) {
          // Only clear if table is actually settled by this cashier tab
          if (!settledTableIdsRef.current.has(t.backendId)) {
            console.warn('[CashierDashboard] Skipping stale AVAILABLE event for occupied table (not settled)', t.number);
            return t;
          }
        }

        // FIX #4: Merge kotHistory — never lose KOTs already in local state
        const mergedKotHistory = (() => {
          const existing = t.kotHistory || [];
          const incoming = Array.isArray(table.kotHistory) ? table.kotHistory : [];
          if (incoming.length >= existing.length) return incoming;
          return existing;
        })();
        // When merging an occupied table:updated event, preserve existing activeOrder.items
        // if the incoming payload has no orders array (partial update)
        const incomingHasOrders = Array.isArray(table.orders) && table.orders.length > 0;
        const incomingOrder = incomingHasOrders
          ? (table.orders[0] || null)
          : (t.activeOrder || null);  // keep existing if socket didn't send orders
        // Never downgrade a table that is locally in 'Waiting Bill' state back to a lesser state
        const protectedStatus = (t.status === 'Waiting Bill' || t.workflowStatus === 'Waiting Bill')
          && incomingStatus !== 'Free' && incomingStatus !== 'AVAILABLE'
          ? 'Waiting Bill'
          : incomingStatus;
        const incomingBillAmt = table.currentBill ?? table.orders?.[0]?.totalAmount ?? t.currentBill;
        return {
          ...t,
          kotHistory: mergedKotHistory,
          currentBill: Math.max(Number(t.currentBill ?? 0), Number(incomingBillAmt ?? 0)),
          status: protectedStatus,
          workflowStatus: protectedStatus,
          activeOrder: incomingOrder ? mergeOrder(incomingOrder, t.activeOrder) : t.activeOrder,
        };
      });
      const isVenue = table.restaurantId === 'venue-001';
      if (isVenue) {
        if (setVenueTables) setVenueTables(applyTableUpdate, { skipPersist: true });
      } else {
        setActiveTables(applyTableUpdate, { skipPersist: true });
      }
      if (selectedTable?.backendId === table.id) {
        setSelectedTable(prev => {
          if (!prev) return prev;

          const incomingStatusSel = table.workflowStatus || (table.status !== undefined ? toFrontendTableStatus(table.status) : prev.status);
          const incomingIsAvailableSel = incomingStatusSel === 'Free' || incomingStatusSel === 'AVAILABLE' || table.status === 'AVAILABLE';
          if (incomingIsAvailableSel && prev.activeOrder) {
            console.warn('[CashierDashboard] Skipping stale AVAILABLE event for selected occupied table', prev.number);
            return prev;
          }

          const mergedKotHistory = (() => {
            const existing = prev.kotHistory || [];
            const incoming = Array.isArray(table.kotHistory) ? table.kotHistory : [];
            return incoming.length >= existing.length ? incoming : existing;
          })();
          const isTableFree = (table.workflowStatus || table.status) === 'Free';
          const isTableSettled = settledTableIdsRef.current.has(prev.backendId);
          // Only clear kotHistory if table is actually settled by this cashier tab
          const shouldClearKotHistory = isTableFree && isTableSettled;
          const incomingHasOrdersSel = Array.isArray(table.orders) && table.orders.length > 0;
          // Never flicker bill to 0 unless table is actually free
          const incomingBill = isTableFree ? 0 : (table.currentBill ?? prev.currentBill);
          const stableBill = isTableFree ? 0 : Math.max(Number(prev.currentBill ?? 0), Number(incomingBill ?? 0));
          const protectedStatusSel = (prev.status === 'Waiting Bill' || prev.workflowStatus === 'Waiting Bill')
            && incomingStatusSel !== 'Free' && incomingStatusSel !== 'AVAILABLE'
            ? 'Waiting Bill'
            : incomingStatusSel;
          const nextVal = {
            ...prev,
            kotHistory: shouldClearKotHistory ? [] : mergedKotHistory,
            currentBill: stableBill,
            status: isTableFree && isTableSettled ? 'Free' : protectedStatusSel,
            workflowStatus: isTableFree && isTableSettled ? 'Free' : protectedStatusSel,
            activeOrder: (isTableFree && isTableSettled)
              ? null
              : (incomingHasOrdersSel ? table.orders[0] : prev.activeOrder),  // preserve if no incoming orders
          };
          if (shallowEqualSelectedTable(prev, nextVal)) return prev; // bail out if nothing changed
          return nextVal;
        });
      }
    };

    const onOrderPaid = (payload) => {
      const { tableId } = payload;
      if (shouldBlockTableUpdate(tableId, 'AVAILABLE')) return;

      // Clear table status to Free in activeTables and venueTables
      const clearTable = (prev) => prev.map(t =>
        t.backendId === tableId
          ? { ...t, status: 'Free', workflowStatus: 'Free', activeOrder: null, orders: [], kotHistory: [], currentBill: 0, captainId: null, guests: 0, time: null }
          : t
      );
      setActiveTables(clearTable, { skipPersist: true });
      if (setVenueTables) setVenueTables(clearTable, { skipPersist: true });

      // Remove from billing alerts
      setBillingAlerts(prev => prev.filter(a => a.tableBackendId !== tableId));
      // Clear selectedTable if it was the paid one
      if (selectedTable?.backendId === tableId) {
        setSelectedTable(null);
        setSelectedOrder(null);
        setCart([]);
        lastConfirmedItemsRef.current = [];
        clearCashierTableCache(selectedTable);
        setExpandedNoteItemId(null);
        setRemovedItemIds([]);
        setShowPaymentModal(false);
      }
      // Refresh using the user's current date filter (not always 'today')
      loadTransactions(txnDateFilterRef.current);
    };

    const onTableSwapped = (payload) => {
      const { sourceTableId, targetTableId, sourceTable: rawSource, targetTable: rawTarget } = payload;

      // Map raw DB payloads to frontend shape using existing mapper
      const isVenue = payload?.restaurantId === 'venue-001' || rawSource?.restaurantId === 'venue-001' || rawTarget?.restaurantId === 'venue-001';
      const allTables = isVenue ? venueTables : activeTables;
      const existingSource = allTables?.find(t => t.backendId === sourceTableId) || null;
      const existingTarget = allTables?.find(t => t.backendId === targetTableId) || null;
      const mappedSource = mapRealtimeTablePayload(rawSource, existingSource);
      const mappedTarget = mapRealtimeTablePayload(rawTarget, existingTarget);

      // Update the tables array for both source and target
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId === sourceTableId) return mappedSource || t;
        if (t.backendId === targetTableId) return mappedTarget || t;
        return t;
      });
      if (isVenue) {
        if (setVenueTables) setVenueTables(updateTables);
      } else {
        setActiveTables(updateTables);
      }

      // If cashier had the source table open, switch selection to the new table
      if (selectedTable?.backendId === sourceTableId && mappedTarget) {
        // Clear stale localStorage for the source table before switching
        localStorage.removeItem('cashier_selected_table');
        localStorage.removeItem(`cashier_cart_${sourceTableId}`);
        setSelectedTable(mappedTarget);
        setShowTableModal(false);
        setShowSwapModal(false);
        addNotification('Table Moved', `Session moved to Table ${rawTarget?.number ?? ''}`, 'success');
      }
    };

    const onTableItemsTransferred = (payload) => {
      const { sourceTableId, targetTableId, sourceTable, targetTable } = payload;
      if (shouldBlockTableUpdate(sourceTableId, null) || shouldBlockTableUpdate(targetTableId, null)) return;
      const isVenue = payload?.restaurantId === 'venue-001' || sourceTable?.restaurantId === 'venue-001' || targetTable?.restaurantId === 'venue-001';
      const allTables = isVenue ? venueTables : activeTables;
      const mappedSource = mapRealtimeTablePayload(
        sourceTable,
        allTables.find((table) => table.backendId === sourceTableId) || null,
      );
      const mappedTarget = mapRealtimeTablePayload(
        targetTable,
        allTables.find((table) => table.backendId === targetTableId) || null,
      );

      const updateTables = (prev) => prev.map((table) => {
        if (table.backendId === sourceTableId) return mappedSource || table;
        if (table.backendId === targetTableId) return mappedTarget || table;
        return table;
      });
      if (isVenue) {
        if (setVenueTables) setVenueTables(updateTables);
      } else {
        setActiveTables(updateTables);
      }

      if (selectedTable?.backendId === sourceTableId && mappedSource) {
        setSelectedTable(mappedSource);
      }

      if (selectedTable?.backendId === targetTableId && mappedTarget) {
        setSelectedTable(mappedTarget);
      }
    };

    socket.on('billing:requested', onBillingRequested);
    socket.on('order:created', onOrderCreated);
    socket.on('order:updated', onOrderUpdated);
    socket.on('order:paid', onOrderPaid);
    socket.on('table:swapped', onTableSwapped);
    socket.on('table:items-transferred', onTableItemsTransferred);
    socket.on('table:updated', onTableUpdated);

    // Listen for menu update events from admin panel
    const onMenuItemUpdated = (payload) => {
      // Dispatch window event for menuSyncService to pick up
      window.dispatchEvent(new CustomEvent('menu-item-updated', { detail: payload }));
    };
    socket.on('menu-item-updated', onMenuItemUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('billing:requested', onBillingRequested);
      socket.off('order:created', onOrderCreated);
      socket.off('order:updated', onOrderUpdated);
      socket.off('order:paid', onOrderPaid);
      socket.off('table:swapped', onTableSwapped);
      socket.off('table:items-transferred', onTableItemsTransferred);
      socket.off('menu-item-updated', onMenuItemUpdated);
      socket.off('table:updated', onTableUpdated);
    };
  }, [socket, activeRestaurantId, activeTables, selectedTable?.backendId, loadTransactions, outlet, refetchBarTables, refetchVenueTables, refetchRestaurantTables]);

  // Keep ref in sync so socket handlers and payment callbacks can read latest filter
  useEffect(() => {
    txnDateFilterRef.current = txnDateFilter;
  }, [txnDateFilter]);

  // ── Fetch fresh order data from backend ───
  // Uses GET /api/orders/table/:tableId which returns the active order directly.
  const fetchFreshOrderData = async (tableBackendId) => {
    try {
      const response = await fetch(`${API_BASE}/api/orders/table/${tableBackendId}`);
      if (response.ok) {
        const freshOrder = await response.json();
        return freshOrder || null;
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

    // FIX: once a table is marked settled, ignore sync updates that try to revert it
    if (settledTableIdsRef.current.has(selectedTable.backendId)) return;

    // BILL-PRINT GUARD: if bill was printed, do not let sync downgrade selectedTable back
    // to a non-Waiting-Bill status. The button must stay as "Settlement".
    if (billPrintedTableIdsRef.current.has(selectedTable.backendId)) {
      // Only let sync through if it brings a Free/AVAILABLE (settlement confirmed elsewhere)
      const liveTable = activeTables.find((t) => t.backendId === selectedTable.backendId) ||
        venueTables.find((t) => t.backendId === selectedTable.backendId);
      if (liveTable) {
        const isNowFree = liveTable.status === 'Free' || liveTable.status === 'AVAILABLE' || liveTable.workflowStatus === 'Free';
        if (isNowFree) {
          // Settlement was confirmed — clear the print flag then let normal logic run
          setBillPrintedTableIds(prev => { const next = new Set(prev); next.delete(selectedTable.backendId); return next; });
          billPrintCooldownRef.current.delete(selectedTable.backendId);
          // Persist removal
          try {
            const stored = JSON.parse(localStorage.getItem('cashier_bill_printed_tables') || '[]');
            localStorage.setItem('cashier_bill_printed_tables', JSON.stringify(stored.filter(id => id !== selectedTable.backendId)));
          } catch {}
          setSelectedTable(null); setSelectedOrder(null); setCart([]);
          lastConfirmedItemsRef.current = [];
          clearCashierTableCache(selectedTable);
          setExpandedNoteItemId(null); setRemovedItemIds([]);
        }
        // else: keep selectedTable as-is — ignore the sync update
      }
      return;
    }

    const isSelectedFree = !selectedTable.status || selectedTable.status === 'Free' || selectedTable.status === 'AVAILABLE' || selectedTable.workflowStatus === 'Free';
    const hasStaleGhostData = isSelectedFree && ((selectedTable.kotHistory?.length > 0) || (selectedTable.currentBill > 0));
    
    if (hasStaleGhostData) {
      setSelectedTable(null);
      setCart([]);
      lastConfirmedItemsRef.current = [];
      clearCashierTableCache(selectedTable);
      return;
    }

    const liveTable = activeTables.find((table) => table.backendId === selectedTable.backendId) ||
      venueTables.find((table) => table.backendId === selectedTable.backendId);

    if (liveTable) {
      if (liveTable.status === 'Free' || liveTable.status === 'AVAILABLE' || liveTable.workflowStatus === 'Free') {
        const wasFree = !selectedTable.status || selectedTable.status === 'Free' || selectedTable.status === 'AVAILABLE' || selectedTable.workflowStatus === 'Free';
        if (wasFree) {
            // It was already free, and the user is just building an order on it. Don't clear it.
            return;
        }

        // Guard: if liveTable still has order data, it's clearly still occupied — preserve status and skip clear
        const hasOrderData = liveTable.activeOrder || (liveTable.orders?.length > 0) || (liveTable.kotHistory?.length > 0) || (liveTable.currentBill > 0);
        if (hasOrderData) {
          // Preserve current status/workflowStatus from selectedTable to prevent deselection during sync gap
          setSelectedTable(prev => prev ? { ...liveTable, status: prev.status, workflowStatus: prev.workflowStatus } : null);
          return;
        }

        setSelectedTable(null);
        setSelectedOrder(null);
        setCart([]);
        lastConfirmedItemsRef.current = [];
        clearCashierTableCache(selectedTable);
        setExpandedNoteItemId(null);
        setRemovedItemIds([]);
        return;
      }
      
      // Prevent infinite loops by checking deep equality or just relying on reference updates if needed
      // Actually, since we use `liveTable` object directly, let's only update if something changed
      // to avoid infinite re-renders. A simple stringify comparison works for our needs here.
      if (JSON.stringify(selectedTable) !== JSON.stringify(liveTable)) {
        setSelectedTable(liveTable);
      }
    }
  }, [activeTables, venueTables, selectedTable, billPrintedTableIds]);

  useEffect(() => {
    if (selectedTable?.discount && Number(selectedTable.discount) > 0) {
      // Only auto-fill if cashier hasn't already typed something
      setRawDiscountInput(prev => {
        if (!prev || prev === '0' || prev === '') {
          setDiscountMode('percent');
          return String(Number(selectedTable.discount));
        }
        return prev;
      });
    }
  }, [selectedTable?.discount]);

  useEffect(() => {
    setSelectedCategory('All');
    setSelectedMenuType('ALL');
    setSearchQuery('');
    setIsWalkinMode(false);
    setWalkinTableNumber(null);
  }, [outlet]);

  // Reset selectedMenuType to ALL when switching from bar to restaurant (if it was set to LIQUOR)
  useEffect(() => {
    if (outlet !== 'bar' && selectedMenuType === 'LIQUOR') {
      setSelectedMenuType('ALL');
    }
  }, [outlet]);

  const activeTableOrders = useMemo(() => {
    return activeTables
      .filter((table) => table.status && table.status !== 'Free')
      .map((table) => {
        const items = getBillableItems(table);
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

  const itemSwapItems = useMemo(() => {
    return (selectedTable?.activeOrder?.items || []).filter(item => !item.removedFromBill && item.id);
  }, [selectedTable?.activeOrder?.items]);

  const itemSwapDestinationTables = useMemo(() => {
    return activeTables
      .filter(table => table.backendId !== selectedTable?.backendId)
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [activeTables, selectedTable?.backendId]);

  const selectedItemSwapTarget = useMemo(() => {
    return activeTables.find(table => table.backendId === itemSwapTargetId) || null;
  }, [activeTables, itemSwapTargetId]);

  const handleTransferItems = async () => {
    if (!selectedTable?.backendId || !itemSwapTargetId || itemSwapSelectedIds.length === 0 || isSwappingItems) return;

    setIsSwappingItems(true);
    try {
      await transferItems(
        selectedTable.backendId,
        itemSwapTargetId,
        itemSwapSelectedIds,
        'Cashier',
        selectedTable.section?.restaurantId || activeRestaurantId,
      );
      setShowItemSwapModal(false);
      setItemSwapSelectedIds([]);
      setItemSwapTargetId(null);
      addNotification(
        'Items Transferred',
        `${itemSwapSelectedIds.length} items moved to ${outlet === 'bar'
          ? `B${selectedItemSwapTarget?.number ?? selectedItemSwapTarget?.id}`
          : `T${selectedItemSwapTarget?.id}`}`,
        'success',
      );
    } catch (err) {
      addNotification('Transfer Failed', err.message, 'error');
    } finally {
      setIsSwappingItems(false);
    }
  };

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
    return pastTransactions.reduce((sum, txn) => sum + Number(txn.grandTotal ?? txn.amount ?? 0), 0);
  }, [pastTransactions]);

  const todaysDiscount = useMemo(() => {
    return pastTransactions.reduce((sum, txn) => sum + Number(txn.discountAmount ?? 0), 0);
  }, [pastTransactions]);

  const [dashboardDate, setDashboardDate] = useState(null);

  // Bill Finder state
  const [billFinderDate, setBillFinderDate] = useState(getKolkataDateString());
  const [billFinderBillNo, setBillFinderBillNo] = useState('');
  const [billFinderTableNo, setBillFinderTableNo] = useState('');
  const [billFinderResults, setBillFinderResults] = useState([]);
  const [billFinderLoading, setBillFinderLoading] = useState(false);
  const [isReprintingFoundBill, setIsReprintingFoundBill] = useState(false);

  const handleDashboardDateChange = (date) => {
    if (date) {
      setDashboardDate(date);
      setTxnDateFilter('custom');
      setTxnCustomDate(date);
      loadTransactions('custom', date);
    } else {
      setDashboardDate(null);
      setTxnDateFilter('today');
      loadTransactions('today');
    }
  };

  const handleBillSearch = async () => {
    setBillFinderLoading(true);
    setBillFinderResults([]);
    try {
      const restaurantIds = outlet === 'bar'
        ? ['bar-001', 'venue-001']
        : ['restaurant-001', 'venue-001'];
      
      const allResults = await Promise.all(
        restaurantIds.map(rid => fetchTransactionsWithRetry(rid, 500, billFinderDate).catch((err) => {
          console.error(`[Bill Finder] Fetch failed for ${rid}:`, err);
          return [];
        }))
      );

      const allTxns = allResults.flatMap((txns, idx) => {
        const rid = restaurantIds[idx];
        return txns.map(txn => ({ ...txn, _sourceRestaurantId: rid }));
      });

      const filtered = allTxns.filter(txn => {
        let matches = true;
        if (billFinderBillNo.trim()) {
          const search = billFinderBillNo.trim().toLowerCase();
          matches = matches && (
            String(txn.displayId || '').toLowerCase().includes(search) ||
            String(txn.txnNumber || '').toLowerCase().includes(search)
          );
        }
        if (billFinderTableNo.trim()) {
          matches = matches && String(txn.tableNumber) === billFinderTableNo.trim();
        }
        return matches;
      });

      // Apply outlet-level isolation filter using sectionTag
      const isolated = filtered.filter(txn => {
        // If sectionTag is null/undefined, include the transaction (fallback for older data)
        if (!txn.sectionTag) {
          return true;
        }
        
        if (outlet === 'bar') {
          // Bar sees ONLY bar-sourced transactions — never any restaurant source
          const matches = BAR_SOURCES.has(txn.sectionTag);
          return matches;
        }
        // Restaurant sees ONLY restaurant-sourced transactions — never bar or unknown venue
        const matches = RESTAURANT_SOURCES.has(txn.sectionTag);
        return matches;
      });

      setBillFinderResults(isolated);
    } catch (error) {
      console.error('[Bill Finder] Search error:', error);
      addNotification('Search Failed', 'Failed to search for bills', 'error');
    } finally {
      setBillFinderLoading(false);
    }
  };

  const handleReprintFoundBill = async (txn) => {
    setIsReprintingFoundBill(true);
    try {
      const response = await fetch(`${API_BASE}/api/print/reprint-by-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: txn.orderId,
          restaurantId: txn._sourceRestaurantId
        }),
      });
      if (!response.ok) throw new Error('Print request failed');
      addNotification('Re-print Sent', `Bill #${txn.displayId} sent to printer.`, 'success');
    } catch (error) {
      console.error('[Bill Finder] Re-print error:', error);
      addNotification('Re-print Failed', error.message || 'Failed to re-print bill', 'error');
    } finally {
      setIsReprintingFoundBill(false);
    }
  };

  const { subtotal, taxes, total, grandTotal: cartGrandTotal, cgst: cartCgst, sgst: cartSgst } = calculateOrderTotal(cart);
  const activeOrderCalc = useMemo(() => {
    if (!selectedTable) return calculateOrderTotal(cart, discountPercent);
    const committedItems = getBillableItems(selectedTable);
    const itemsForTotal = committedItems.length > 0
      ? committedItems
      : lastConfirmedItemsRef.current;
    const items = itemsForTotal.map(i =>
      removedItemIds.includes(i.id) ? { ...i, removedFromBill: true } : i
    );
    return calculateOrderTotal([...items, ...cart], discountPercent);
  }, [selectedTable, cart, discountPercent, removedItemIds]);
  const activeSubtotal = activeOrderCalc.subtotal;
  const activeTaxes = activeOrderCalc.taxes;
  const activeTotal = activeOrderCalc.total;
  const activeGrandTotal = useMemo(() => {
    const backendTotal = Number(selectedTable?.activeOrder?.totalAmount ?? 0);
    const calcTotal = activeOrderCalc.grandTotal ?? activeOrderCalc.total ?? 0;
    // When discount is active, always trust the recalculated value — never use the stale max
    const candidate = discountPercent > 0
      ? (calcTotal > 0 ? calcTotal : backendTotal)
      : (backendTotal > 0 ? backendTotal : calcTotal);
    if (candidate > 0) {
      lastKnownBillRef.current = candidate; // update but don't clamp to max
    }
    return lastKnownBillRef.current > 0 ? lastKnownBillRef.current : candidate;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable?.activeOrder?.id, selectedTable?.activeOrder?.totalAmount, activeOrderCalc.grandTotal, activeOrderCalc.total, discountPercent]);
  const activeDiscountAmount = activeOrderCalc.discountAmount ?? 0;
  const activeCgst = activeOrderCalc.cgst ?? 0;
  const activeSgst = activeOrderCalc.sgst ?? 0;
  // fallbackTotal must include GST — currentBill and totalAmount are both raw subtotals
  const fallbackTotal = (() => {
    const rawFallback = Number(selectedTable?.currentBill || selectedTable?.activeOrder?.totalAmount || 0);
    if (rawFallback <= 0) return 0;
    const calcTotal = activeOrderCalc.grandTotal ?? 0;
    return calcTotal > 0 ? calcTotal : rawFallback + (activeOrderCalc.taxes ?? 0);
  })();

  const handleFinalBill = async () => {
    if (!selectedTable || !selectedTable.backendId) {
      addNotification('Error', 'Invalid table selected.', 'error');
      return;
    }

    // Ref guard - synchronous check to prevent race condition
    if (isPrintingBillRef.current) return;
    isPrintingBillRef.current = true;

    // Check if order is already paid
    if (selectedTable?.activeOrder?.status === 'PAID') {
      addNotification('Error', 'This order has already been settled.', 'error');
      isPrintingBillRef.current = false;
      return;
    }

    // Validate that the order has items (use proper getTableItems function)
    const orderItems = getBillableItems(selectedTable);
    if (orderItems.length === 0) {
      addNotification('Error', 'Cannot print bill with no items. Please add items to the order first.', 'error');
      isPrintingBillRef.current = false;
      return;
    }

    try {
      setIsPrintingBill(true);
      lastKnownBillRef.current = 0; // Reset bill ref before print to allow recalculation

      // ── BILL-PRINT GUARD: arm BEFORE the async call so the button locks immediately ──
      const tableBackendId = selectedTable.backendId;
      setBillPrintedTableIds(prev => {
        const next = new Set(prev);
        next.add(tableBackendId);
        // Persist so the flag survives component remount
        try {
          localStorage.setItem('cashier_bill_printed_tables', JSON.stringify([...next]));
        } catch {}
        return next;
      });
      // Update selectedTable status optimistically right now
      setSelectedTable(prev => prev ? { ...prev, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : prev);
      // Start 5-second per-table socket cooldown
      billPrintCooldownRef.current.set(tableBackendId, Date.now() + 5000);
      // Update the table list cache immediately to 'Waiting Bill'
      const isVenueTable = selectedTable?.section?.restaurantId === 'venue-001' || selectedTable?.restaurantId === 'venue-001';
      const updateBillStatus = (prev) =>
        prev.map((t) =>
          t.backendId === tableBackendId ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : t
        );
      if (isVenueTable) {
        if (setVenueTables) setVenueTables(updateBillStatus);
      } else {
        setActiveTables(updateBillStatus);
      }
      // Also persist 'bill_printed' in the table localStorage cache
      try {
        const cacheKey = isVenueTable ? 'softshape_venue_tables_cache_v1' : outlet === 'bar' ? 'softshape_bar_tables_cache_v4' : 'softshape_tables_cache_v6';
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        const updatedCache = cached.map(t =>
          t.backendId === tableBackendId ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : t
        );
        localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
      } catch {}
      // ── END GUARD SETUP ──

      // Step 1: Update table discount if entered
      if (discountPercent > 0) {
        await fetch(`${API_BASE}/api/tables/${selectedTable.backendId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discount: discountPercent })
        });
        // Persist discount so it survives modal close/reopen until settlement
        localStorage.setItem(`cashier_table_discount_${selectedTable.backendId}`, JSON.stringify({
          value: String(discountPercent),
          mode: 'percent'
        }));
      }

      // Step 2: Call backend print-bill endpoint - emits FINAL_BILL socket event to PrintStation
      const orderId = selectedTable?.activeOrder?.id;
      if (orderId) {
        const response = await fetch(`${API_BASE}/api/orders/${orderId}/print-bill?restaurantId=${selectedTable.section?.restaurantId || activeRestaurantId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Server returned ${response.status}`);
        }
      }

      addNotification('Success', 'Bill printed successfully.', 'success');

      window.dispatchEvent(new Event('softshape_order_updated'));

      // Cooldown so cashier can't double-print immediately
      setLastPrintTime(Date.now());
      setPrintCooldown(true);
      setTimeout(() => setPrintCooldown(false), 10000);

    } catch (error) {
      console.error('Final bill error:', error);
      addNotification('Error', error.message || 'Failed to print bill.', 'error');
      // On error, roll back the bill-printed flag
      const tableBackendId = selectedTable?.backendId;
      if (tableBackendId) {
        setBillPrintedTableIds(prev => {
          const next = new Set(prev);
          next.delete(tableBackendId);
          try { localStorage.setItem('cashier_bill_printed_tables', JSON.stringify([...next])); } catch {}
          return next;
        });
        billPrintCooldownRef.current.delete(tableBackendId);
        setSelectedTable(prev => prev ? { ...prev, status: 'Occupied', workflowStatus: 'Occupied' } : prev);
      }
    } finally {
      setIsPrintingBill(false);
      isPrintingBillRef.current = false;
    }
  };

  const handleWalkinFinalBill = async () => {
    if (cart.length === 0) return;

    // Ref guard - synchronous check to prevent race condition
    if (isPrintingBillRef.current) return;
    isPrintingBillRef.current = true;

    const tableLabel = selectedTable?.id || 'Walk-in';
    const subtotalAmt = cart.reduce((s, i) => s + Number(i.p) * Number(i.q), 0);
    const discountAmt = discountPercent > 0 ? Math.round(subtotalAmt * (discountPercent / 100) * 100) / 100 : 0;
    const grandTotalAmt = Math.round((subtotalAmt - discountAmt) * 100) / 100;

    try {
      setIsPrintingBill(true);

      const response = await fetch(`${API_BASE}/api/print/final-bill-emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: activeRestaurantId,
          billData: {
            tableNumber: tableLabel,
            items: cart.map(i => ({
              name: i.n || i.name,
              quantity: i.q,
              price: Number(i.p),
              menuType: i.menuType || 'FOOD'
            })),
            subtotal: subtotalAmt,
            grandTotal: grandTotalAmt,
            discount: discountPercent > 0 ? { percent: discountPercent, amount: discountAmt } : null,
            captain: 'Walk-in',
            sectionTag: 'venue-restaurant-parcel'
          }
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Server returned ${response.status}`);
      }

      addNotification('Walk-in Bill Printed', `${tableLabel} — ₹${grandTotalAmt.toFixed(0)}`, 'success');
      setShowMethodPicker(true);
    } catch (err) {
      console.error('Walk-in bill print error:', err);
      addNotification('Print Failed', err.message || 'Could not print walk-in bill', 'error');
    } finally {
      setIsPrintingBill(false);
      isPrintingBillRef.current = false;
    }
  };

  const handleReprintBill = async () => {
    if (!selectedTable || !selectedTable.backendId) {
      addNotification('Error', 'Invalid table selected.', 'error');
      return;
    }

    const orderId = selectedTable?.activeOrder?.id;
    if (!orderId) {
      addNotification('Error', 'No active order found for this table.', 'error');
      return;
    }

    const orderItems = getBillableItems(selectedTable);
    if (orderItems.length === 0) {
      addNotification('Error', 'No items on this order to reprint.', 'error');
      return;
    }

    addNotification('Re-print Sent', 'Bill sent to printer again.', 'success');

    // Reset loading state immediately after optimistic UI update
    setIsReprintingBill(false);

    // Run reprint in background without blocking UI
    (async () => {
      try {
        // Apply discount update if one is entered before reprinting
        if (discountPercent > 0) {
          await fetch(`${API_BASE}/api/tables/${selectedTable.backendId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discount: discountPercent }),
          });
        }

        // Call the same print-bill endpoint — backend recalculates and re-emits to printer
        const response = await fetch(
          `${API_BASE}/api/orders/${orderId}/print-bill?restaurantId=${selectedTable.section?.restaurantId || activeRestaurantId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        // Backend returns 409 if PAID — handle gracefully
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          // If 409 PAID, still allow re-emit since settlement already happened
          if (response.status !== 409) {
            throw new Error(errBody.error || `Server returned ${response.status}`);
          }
        }
      } catch (error) {
        console.error('[Reprint] Failed:', error.message);
        addNotification('Re-print Failed', error.message || 'Could not send bill to printer.', 'error');
      }
    })();
  };

  const handlePayment = async (method) => {
    if (!selectedTable || !method) return;

    // Validate transaction amount
    const txnAmount = Number(activeGrandTotal > 0 ? activeGrandTotal : fallbackTotal);
    if (txnAmount <= 0) {
      addNotification(
        'Cannot Settle',
        'Bill amount is ₹0. Ensure KOT was sent before settling.',
        'error'
      );
      setShowMethodPicker(false);
      return;
    }

    // Guard: prevent double-settlement — use same broad resolution as handleFinalBill
    const orderId = selectedTable?.activeOrder?.id ||
      selectedTable?.orders?.[0]?.id ||
      selectedTable?.orderId;
    if (orderId && settledOrderIds.has(orderId)) {
      addNotification('Already Settled', 'This order has already been settled.', 'error');
      setShowMethodPicker(false);
      setShowPaymentModal(false);
      return;
    }

    // Store previous table state for rollback
    const previousTableState = selectedTable;
    const isVenueTable = selectedTable?.section?.restaurantId === 'venue-001' || selectedTable?.restaurantId === 'venue-001';
    const setTargetTables = isVenueTable && setVenueTables ? setVenueTables : setActiveTables;

    // Optimistic update: table becomes free
    const optimisticFn = () => {
      setTargetTables((prev) =>
        prev.map((t) =>
          t.backendId === selectedTable.backendId
            ? {
                ...t,
                status: 'Free',
                workflowStatus: 'Free',
                activeOrder: null,
                orders: [],
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

      // ── Release bill-printed lock on settlement ──
      const settledId = selectedTable.backendId;
      if (settledId) {
        setBillPrintedTableIds(prev => {
          const next = new Set(prev);
          next.delete(settledId);
          try { localStorage.setItem('cashier_bill_printed_tables', JSON.stringify([...next])); } catch {}
          return next;
        });
        billPrintCooldownRef.current.delete(settledId);
      }

      // Close modals and clear state
      setShowMethodPicker(false);
      setShowTableModal(false);
      setShowPaymentModal(false);
      setSelectedTable(null);
      lastKnownBillRef.current = 0;
      setSelectedOrder(null);
      setCart([]);
      lastConfirmedItemsRef.current = [];
      clearCashierTableCache(selectedTable);
      // Clean up persisted discount now that table is settled
      if (selectedTable?.backendId) {
        localStorage.removeItem(`cashier_table_discount_${selectedTable.backendId}`);
      }
      setRawDiscountInput('');
      setExpandedNoteItemId(null);
      setRemovedItemIds([]);

      // Show success notification
      addNotification('Payment Success', `${method} • ₹${txnAmount.toFixed(0)} collected`, 'success');

      // Clear walk-in mode after settlement
      if (isWalkinMode) {
        setIsWalkinMode(false);
        setSelectedTable(null);
        setCart([]);
      }

      // FIX 1 & 3: mark table as settled and update cache immediately
      if (selectedTable?.backendId) {
        setSettledTableIds(prev => new Set([...prev, selectedTable.backendId]));
        syncPauseUntilRef.current = Date.now() + 5000;
        const cacheKey = outlet === 'bar' ? 'softshape_bar_tables_cache_v4' : outlet === 'venue' ? 'softshape_venue_tables_cache_v1' : 'softshape_tables_cache_v6';
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
          const updated = cached.map(t =>
            t.backendId === selectedTable.backendId
              ? { ...t, status: 'Free', workflowStatus: 'Free', activeOrder: null, orders: [], kotHistory: [], currentBill: 0, captainId: null, guests: 0, time: null }
              : t
          );
          localStorage.setItem(cacheKey, JSON.stringify(updated));
        } catch {}
      }

      // Reset loading state immediately after optimistic UI update
      setIsPrintingBill(false);
    };

    // Rollback function: restore previous table state
    const rollbackFn = () => {
      setTargetTables((prev) =>
        prev.map((t) =>
          t.backendId === previousTableState.backendId ? previousTableState : t
        )
      );
      setSelectedTable(previousTableState);
      addNotification('Settlement Failed', 'Please try again', 'error');
    };

    // Commit function: call backend settle endpoint
    const commitFn = async () => {
      // Add to background queue for final bill + inventory deduction
      await settlementQueue.add(async () => {
        // Call backend settle endpoint (creates transaction, marks paid, resets table)
        // NO PRINTING - that already happened in handleFinalBill
        if (orderId) {
          const response = await fetch(
            `${import.meta.env.VITE_API_URL}/api/orders/${orderId}/settle?restaurantId=${selectedTable.section?.restaurantId || activeRestaurantId}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentMethod: method, discountPercent })
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Settlement failed on server');
          }

          // Mark as settled locally to prevent retries
          setSettledOrderIds(prev => new Set([...prev, orderId]));

          // FIX 1 & 5: mark table backendId as settled and pause sync for 5s
          if (selectedTable?.backendId) {
            setSettledTableIds(prev => new Set([...prev, selectedTable.backendId]));
            syncPauseUntilRef.current = Date.now() + 5000;
          }
        }

        // Refresh transactions list to show the new transaction
        loadTransactions(txnDateFilterRef.current);
      });
    };

    // Use optimistic update with rollback
    await withOptimisticUpdate({
      optimisticFn,
      rollbackFn,
      commitFn,
      onError: (error) => {
        logCriticalError('handlePayment', error, { orderId, method, txnAmount });
      }
    });
  };

  const terminateTableSession = async () => {
    if (!selectedTable) return;
    if (isTerminating) return; // guard against double-click

    const tableSnap = { ...selectedTable }; // snapshot before any state mutation
    // Guard against socket events reviving the just-terminated table
    if (tableSnap.backendId) {
      terminatedTableIdsRef.current.add(tableSnap.backendId);
      setTimeout(() => terminatedTableIdsRef.current.delete(tableSnap.backendId), 6000);
    }
    setIsTerminating(true);

    try {
      // Step 1: Call backend FIRST — do not touch UI until we know it succeeded
      if (tableSnap?.backendId) {
        const isVenueTable = tableSnap.section?.restaurantId === 'venue-001' || tableSnap.restaurantId === 'venue-001';
        const resId = tableSnap.section?.restaurantId || activeRestaurantId;
        const terminateUrl = (outlet === 'bar' && !isVenueTable)
          ? `${import.meta.env.VITE_API_URL}/api/bar/tables/terminate-table/${tableSnap.backendId}?restaurantId=${resId}` 
          : `${import.meta.env.VITE_API_URL}/api/orders/terminate-table/${tableSnap.backendId}?restaurantId=${resId}`;

        const response = await fetch(terminateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Server returned ${response.status}`);
        }

        // Step 2: Backend confirmed success — now safe to clear local state
        const resetSessionPayload = {
          status: 'Free',
          kotHistory: [],
          currentBill: 0,
          captainId: null,
          guests: 0,
        };

        if (outlet === 'bar' && !isVenueTable) {
          updateBarTableSession(tableSnap.backendId, resetSessionPayload)
            .catch(err => console.warn('[Terminate] resetBarSession failed:', err.message));
        } else {
          updateTableSession(tableSnap.backendId, resetSessionPayload)
            .catch(err => console.warn('[Terminate] resetTableSession failed:', err.message));
        }
      }

      // Step 3: Update local state (only runs if backend succeeded or no backendId)
      const isVenueTable = tableSnap.section?.restaurantId === 'venue-001' || tableSnap.restaurantId === 'venue-001';
      const setTargetTables = isVenueTable && setVenueTables ? setVenueTables : setActiveTables;
      setTargetTables(prev => prev.map(t =>
        t.id === tableSnap.id || t.backendId === tableSnap.backendId
          ? {
              ...t,
              status: 'Free',
              workflowStatus: 'Free',
              activeOrder: null,
              orders: [],
              items: [],
              captainId: null,
              kotHistory: [],
              currentBill: 0,
              guests: 0,
              time: null,
            }
          : t
      ));

      // Step 4: Clear UI selections
      setSelectedTable(null);
      setSelectedOrder(null);
      setCart([]);
      lastConfirmedItemsRef.current = [];
      clearCashierTableCache(selectedTable);
      setExpandedNoteItemId(null);
      setRemovedItemIds([]);
      setShowTableModal(false);
      // Clean up persisted discount on terminate
      if (tableSnap?.backendId) {
        localStorage.removeItem(`cashier_table_discount_${tableSnap.backendId}`);
      }

      addNotification('Session Terminated', `Table ${tableSnap.displayName ?? tableSnap.number ?? tableSnap.id} freed`, 'info');

    } catch (err) {
      console.warn('[Terminate] failed:', err.message);
      // No rollback needed — we never changed local state
      addNotification(
        'Terminate Failed',
        err.message.includes('timeout') || err.message.includes('fetch')
          ? 'Could not reach server. Please check connection and try again.'
          : `Termination failed: ${err.message}`,
        'error'
      );
    } finally {
      setIsTerminating(false);
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
      const editQuantities = billRemovals.reduce((acc, itemId) => {
        acc[itemId] = Math.max(1, Math.round(Number(billEditQuantities[itemId] ?? 1)));
        return acc;
      }, {});
      const updatedOrder = await editBill(selectedTable.activeOrder.id, {
        removedItemIds: billRemovals,
        editQuantities,
        addedItems: billAdditions,
        editedBy: 'Cashier',
      });
      // Update local table state so bill total reflects immediately
      const isVenueTable = selectedTable?.section?.restaurantId === 'venue-001' || selectedTable?.restaurantId === 'venue-001';
      const setTargetTables = isVenueTable && setVenueTables ? setVenueTables : setActiveTables;
      setTargetTables(prev => prev.map(t => {
        if (t.backendId !== selectedTable.backendId) return t;
        return {
          ...t,
          currentBill: updatedOrder.totalAmount,
          activeOrder: { ...t.activeOrder, ...updatedOrder },
        };
      }));
      setBillRemovals([]);
      setBillEditQuantities({});
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

  const menuTypeSubcategories = useMemo(() => {
    if (selectedMenuType === 'ALL') return [];
    const items = outlet === 'restaurant'
      ? menuItems.filter(i => i.isAvailable !== false)
      : barMenuItems.filter(i => i.isAvailable !== false);
    const filtered = selectedMenuType === 'FOOD'
      ? items.filter(i => i.menuType !== 'LIQUOR')
      : items.filter(i => i.menuType === 'LIQUOR');
    const cats = filtered.map(i => i.category || i.c).filter(Boolean);
    return ['All', ...new Set(cats)];
  }, [selectedMenuType, outlet, menuItems, barMenuItems]);

  const activeMenuItems = useMemo(() => {
    let itemsToFilter = [];
    const isVenueContext = ['parcel', 'bar-conference', 'bar-pdr', 'bar-rooms', 'bar-parcel'].includes(tableSubCategory) || Boolean(selectedTable?.restaurantId === 'venue-001');

    if (outlet === 'restaurant') {
      itemsToFilter = menuItems.filter(item => item.isAvailable !== false);
    } else {
      itemsToFilter = barMenuItems.filter(i => i.isAvailable !== false);
    }

    // Determine current venue ID from selected table or sub-category
    let currentVenueId = null;
    if (selectedTable) {
      const sectionName = (selectedTable.sectionName || selectedTable.section?.name || '').toLowerCase();
      if (sectionName.includes('family restaurant')) {
        currentVenueId = 'venue-family-restaurant';
      } else if (sectionName.includes('parcel')) {
        currentVenueId = outlet === 'bar' ? 'venue-bar-parcel' : 'venue-restaurant-parcel';
      } else if (outlet === 'bar') {
        currentVenueId = 'venue-bar-ac-hall';
      }
    } else {
      if (outlet === 'bar') {
        if (tableSubCategory === 'bar-ac-hall') currentVenueId = 'venue-bar-ac-hall';
        else if (tableSubCategory === 'bar-conference') currentVenueId = 'venue-bar-conference';
        else if (tableSubCategory === 'bar-pdr') currentVenueId = 'venue-bar-pdr';
        else if (tableSubCategory === 'bar-rooms') currentVenueId = 'venue-bar-rooms';
        else if (tableSubCategory === 'bar-parcel') currentVenueId = 'venue-bar-parcel';
      } else {
        if (tableSubCategory === 'family-restaurant') currentVenueId = 'venue-family-restaurant';
        else if (tableSubCategory === 'parcel') currentVenueId = 'venue-restaurant-parcel';
      }
    }

    const venueSpecificPrices = currentVenueId ? (venuePrices?.[currentVenueId] || {}) : {};

    const isBarVenueContext = outlet === 'bar' && Boolean(currentVenueId);

    const mapped = itemsToFilter.map(item => {
      const overridePrice = venueSpecificPrices[item.id];

      let finalPrice;
      if (isBarVenueContext) {
        // Bar venue: only show items with an explicit venue price > 0 (no base-price fallback)
        finalPrice = overridePrice !== undefined ? Number(overridePrice) : 0;
      } else {
        // Restaurant / main floor: venue override if set and > 0, else base price
        finalPrice = (overridePrice != null && Number(overridePrice) > 0)
          ? Number(overridePrice)
          : Number(item.p || item.price || 0);
      }

      const remappedVariants = item.variants?.map(v => {
        const variantOverride = venueSpecificPrices[`${item.id}_variant_${v.id}`];
        return variantOverride !== undefined
          ? { ...v, price: Number(variantOverride) }
          : v;
      }) ?? item.variants;

      return {
        ...item,
        p: finalPrice,
        variants: remappedVariants,
      };
    }).filter((item) => {
      if (isBarVenueContext) {
        return Number(item.p) > 0;
      }
      if (selectedTable?.section?.restaurantId === 'venue-001') {
        return Number(item.p || 0) > 0;
      }
      return true;
    });

    const q = searchQuery.trim().toLowerCase();

    const filtered = mapped.filter((item) => {
      // 0. Menu type filter (FOOD / LIQUOR / DESSERTS / ALL)
      if (selectedMenuType === 'FOOD' && item.menuType === 'LIQUOR') return false;
      if (selectedMenuType === 'LIQUOR' && item.menuType !== 'LIQUOR') return false;
      if (selectedMenuType === 'DESSERTS') {
        const cat = (item.c || item.category || '').toLowerCase();
        return cat.includes('dessert');
      }

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
  }, [outlet, menuItems, barMenuItems, searchQuery, selectedCategory, selectedMenuType, activeDiet, selectedTable, venuePrices, tableSubCategory]);

  const handleTableSelect = (table) => {
    // Defensive: clear any previous table's cart from localStorage before switching
    clearCashierTableCache(selectedTable);
    lastKnownBillRef.current = 0; // Reset bill ref when selecting a new table
    setSelectedTable(table);
    setCart([]);
    setSelectedOrder(null);
    lastConfirmedItemsRef.current = [];
    setExpandedNoteItemId(null);

    if (!table.status || table.status === 'Free') {
      setActiveTab('pos');
      localStorage.setItem('cashier_active_tab', 'pos');
    } else {
      // Open modal immediately — don't block on network
      setShowTableModal(true);
      // Restore saved discount for this table if one exists
      const savedDiscount = localStorage.getItem(`cashier_table_discount_${table.backendId}`);
      if (savedDiscount) {
        try {
          const parsed = JSON.parse(savedDiscount);
          setDiscountMode(parsed.mode || 'percent');
          setRawDiscountInput(parsed.value || '');
        } catch {
          // ignore malformed entry
        }
      }
    }

    // Background refresh: silently patch in fresh order data if table is in billing state
    // Does NOT block the modal from opening
    if (table.backendId && (
      table.status === 'Waiting Bill' ||
      table.status === 'BILLING_REQUESTED' ||
      table.workflowStatus === 'billing_requested' ||
      table.workflowStatus === 'Waiting Bill'
    )) {
      fetchFreshOrderData(table.backendId).then(freshOrder => {
        if (freshOrder) {
          setSelectedTable(prev => {
            if (!prev || prev.backendId !== table.backendId) return prev; // user moved on
            return { ...prev, activeOrder: freshOrder };
          });
        }
      }).catch(() => {
        // Silent — stale cached data is still better than nothing
      });
    }
  };

  const handleAddItem = (item) => {
    // Beer items should be added directly
    if (outlet === 'bar' && isBeerItem(item)) {
      addToCart(item);
      setSearchQuery('');
      setSelectedCategory('All');
      setActiveDiet('All');
      return;
    }

    // Other liquor items (spirits) should show variant picker
    if (outlet === 'bar' && item.menuType === 'LIQUOR' && !item.isBottleItem) {
      setVariantPickerItem(item);
    } else {
      addToCart(item);
      setSearchQuery('');
      setSelectedCategory('All');
      setActiveDiet('All');
    }
  };

  const handleVariantSelect = (item, variant) => {
    addToCart({
      ...item,
      n: item.n,
      p: Number(variant.price),
      notes: item.notes || null
    });
    setVariantPickerItem(null);
    setSearchQuery('');
    setSelectedCategory('All');
    setActiveDiet('All');
  };



  const updateKotStatus = (tableId, kotId, newStatus) => {
    const isVenueTable = selectedTable?.section?.restaurantId === 'venue-001' || selectedTable?.restaurantId === 'venue-001';
    const setTargetTables = isVenueTable && setVenueTables ? setVenueTables : setActiveTables;
    setTargetTables(prev => prev.map(t => {
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
      return [...prev, { ...item, q: 1 }];
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

  const updateItemNote = (itemId, note) => {
    setCart(prev =>
      prev.map(i => i.id === itemId ? { ...i, notes: note.trim() || null } : i)
    );
  };

  const onlineOrders = [
    { id: 'SW-9812', platform: 'Swiggy', items: ['Chicken Biryani x2', 'Coke x2'], amount: 960, status: 'Preparing', time: '4m ago' },
    { id: 'ZM-4521', platform: 'Zomato', items: ['Paneer Tikka x1', 'Butter Naan x3'], amount: 540, status: 'Ready', time: '12m ago' },
    { id: 'SW-9815', platform: 'Swiggy', items: ['Veg Noodles x2'], amount: 480, status: 'Incoming', time: 'Just now' },
  ];



  const handleSmartKOT = async () => {
    if (isKotSending || isSubmittingKotRef.current) return;
    if (cart.length === 0) return;
    isSubmittingKotRef.current = true;
    setIsKotSending(true);
    setIsKotSuccess(false);

    // Generate requestId BEFORE optimistic UI update for deduplication
    const requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36));
    kotRequestIdRef.current = requestId;

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

    const apiItems = cart
      .map(i => ({
        menuItemId: String(i.id || i.menuItemId || ''),
        name: i.n || i.name,
        price: Number(i.p ?? i.price ?? 0),
        quantity: Number(i.q ?? i.quantity ?? 1),
        notes: i.notes || null,
        // Preserve menuType so the backend can correctly classify food vs liquor for GST
        menuType: (i.menuType || 'FOOD').toUpperCase() === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
      }))
      .filter(i => !!i.menuItemId);

    if (selectedTable) {
      const newTotalBill = calculateSessionBill(selectedTable, cart).subtotal;
      const updater = prev => prev.map(t => {
        if (t.id === selectedTable.id || t.backendId === selectedTable.backendId) {
          return {
            ...t,
            status: t.status === 'Free' ? 'Occupied' : t.status,
            kotHistory: [...(t.kotHistory || []), ...kotsToCreate],
            currentBill: newTotalBill,
          };
        }
        return t;
      });

      if (selectedTable.section?.restaurantId === 'venue-001' || selectedTable.restaurantId === 'venue-001') {
        setVenueTables(updater);
      } else {
        setActiveTables(updater);
      }
    }

    // Snapshot items before clearing cart to prevent UI flicker
    if (selectedTable) {
      const committedSoFar = getBillableItems(selectedTable);
      lastConfirmedItemsRef.current = [...committedSoFar, ...cart];
    }

    setCart([]);
    setExpandedNoteItemId(null);
    setIsKotSuccess(true);
    addNotification('KOT Pushed', `Sent ${kotsToCreate.length} KOT(s) for Table ${selectedTable?.id || 'Walk-in'}.`, 'success');
    setTimeout(() => setIsKotSuccess(false), 2000);

    // Run API call in background without blocking UI
    (async () => {
      try {
        if (selectedTable?.backendId) {
          if (selectedTable.activeOrder?.id) {
            // Subsequent KOT — append new items to existing order
            await updateOrderItems(selectedTable.activeOrder.id, apiItems, requestId, 'Cashier');
          } else {
            // First KOT — create a brand-new order row
            await createOrder({
              tableId: selectedTable.backendId,
              tableNumber: selectedTable.number || selectedTable.id,
              restaurantId: selectedTable.section?.restaurantId || activeRestaurantId,
              items: apiItems,
              requestId,
              captainName: 'Cashier',
            });
          }
        }
      } catch (err) {
        console.warn('[BG] order write failed:', err.message);
      } finally {
        isSubmittingKotRef.current = false;
        setIsKotSending(false);
      }
    })();
  };

  const stats = [
    { label: "Revenue", value: `₹${Number(todaysSales).toFixed(0)}`, change: `${pastTransactions.length} txns ${dashboardDate ? `(${dashboardDate})` : '(Today)'}`, icon: Wallet, color: "text-green-600", bg: "bg-green-50" },
    { label: "Discount", value: `₹${Number(todaysDiscount).toFixed(0)}`, change: `${pastTransactions.filter(t => t.discountAmount > 0).length} discounted`, icon: TrendingUp, color: "text-red-600", bg: "bg-red-50" },
    { label: "Net", value: `₹${Number(todaysSales - todaysDiscount).toFixed(0)}`, change: "After discounts", icon: Activity, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Active Tables", value: `${activeTableOrders.length}/${activeTables.length}`, change: "Live floor", icon: Table2, color: "text-blue-600", bg: "bg-blue-50" },
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
            { id: 'billfinder', label: 'Bill Finder', icon: Search },
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
            <OutletToggle className="flex" requireAuth={true} />
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
          {/* ── MAIN CONTENT ── */}
          <>
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
                          setCart([]);
                          lastConfirmedItemsRef.current = [];
                          clearCashierTableCache(selectedTable);
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

              {activeTab === 'dashboard' && (
                <div className="flex flex-col lg:flex-row flex-grow overflow-hidden w-full">
                  <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar bg-gray-50">
                    {/* Calendar Bar */}
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                      <Calendar size={18} className="text-gray-500" />
                      <span className="text-sm font-bold text-gray-700">
                        {dashboardDate ? dashboardDate : "Today's Overview"}
                      </span>
                      <input
                        type="date"
                        value={dashboardDate || ''}
                        onChange={(e) => handleDashboardDateChange(e.target.value)}
                        className="ml-auto text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500"
                      />
                      {dashboardDate && (
                        <button
                          onClick={() => handleDashboardDateChange(null)}
                          className="text-sm font-bold text-blue-600 hover:text-blue-700"
                        >
                          Today
                        </button>
                      )}
                    </div>
                    {/* Stats Row */}
                    <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto scrollbar-hide snap-x pb-1 sm:pb-0">
                      {stats.map((stat, i) => (
                        <div key={i} className="min-w-[75vw] sm:min-w-0 snap-start shrink-0 bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                          <div className={`w-9 h-9 ${stat.bg} ${stat.color} rounded-lg flex items-center justify-center shrink-0`}>
                            <stat.icon size={18} />
                          </div>
                          <div>
                            <p className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                            <p className={`text-lg sm:text-xl font-black ${stat.color} leading-none mt-0.5`}>{stat.value}</p>
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
                              const billAmt = bill?.subtotal > 0
                                ? bill.subtotal
                                : Math.max(
                                    Number(table.currentBill || 0),
                                    Number(table.activeOrder?.totalAmount || 0),
                                    Number(table.orders?.[0]?.totalAmount || 0)
                                  );

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
                                  className={`border-2 rounded-2xl p-4 flex flex-col gap-3 transition-all shadow-sm select-none ${cardBg} ${pulseClass}`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <span className={`text-4xl font-black leading-none ${textColor}`}>
                                      {outlet === 'bar' ? `B${table.number ?? table.id}` : (table.number ?? table.id)}
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


                </div>
              )}
              {activeTab !== 'dashboard' && activeTab !== 'pos' && (
                <div className="flex-grow p-3 overflow-y-auto custom-scrollbar bg-gray-50/50">
                  <div className="max-w-6xl mx-auto space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                        {activeTab === 'tables'
                          ? (outlet === 'bar'
                            ? (tableSubCategory === 'bar-ac-hall' ? 'Bar AC Hall' : tableSubCategory === 'bar-conference' ? 'Conference Hall' : tableSubCategory === 'bar-pdr' ? 'PDR' : tableSubCategory === 'bar-rooms' ? 'Rooms' : 'Parcel')
                            : (tableSubCategory === 'family-restaurant' ? 'Family Restaurant' : 'Parcel'))
                          : activeTab.replace('-', ' ') + ' Feed'}
                      </h2>
                    </div>

                    {activeTab === 'tables' && (
                      <div className="space-y-4">
                        {/* ── SUBCATEGORY PILLS — sit inside Tables screen, not a separate toggle ── */}
                        <div className="flex gap-2 flex-wrap">
                          {[
                            ...(outlet === 'bar'
                              ? [
                                  { id: 'bar-ac-hall', label: 'Bar AC Hall', emoji: '' },
                                  { id: 'bar-conference', label: 'Conference Hall', emoji: '' },
                                  { id: 'bar-pdr', label: 'PDR', emoji: '' },
                                  { id: 'bar-rooms', label: 'Rooms', emoji: '' },
                                  { id: 'bar-parcel', label: 'Parcel', emoji: '' },
                                ]
                              : [
                                  { id: 'family-restaurant', label: 'Family Restaurant', emoji: '' },
                                  { id: 'parcel', label: 'Parcel', emoji: '' },
                                ]),
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => handleTabSwitch(tab.id)}
                              className={`px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-black border-2 transition-all shadow-sm ${tableSubCategory === tab.id
                                  ? 'bg-[#E53935] text-white border-[#E53935]'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                                }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        {/* Debug status */}
                        {venueTablesLoading && (
                          <div className="text-xs text-gray-400 font-mono">Loading venue tables…</div>
                        )}
                        {!venueTablesLoading && venueTables.length > 0 && (
                          <div className="text-xs text-gray-400 font-mono">
                            Venue tables loaded: {venueTables.length} &nbsp;|&nbsp; Family Restaurant: {venueTables.filter(t => (t.sectionName || t.section?.name || '').toLowerCase().includes('family restaurant')).length}
                          </div>
                        )}
                        {!venueTablesLoading && venueTables.length === 0 && (
                          <div className="text-xs text-red-500 font-mono">No venue tables loaded — check console (F12) for errors</div>
                        )}

                        {/* ── MAIN TABLES ── */}
                        {/* Bar AC Hall - uses activeTables from restaurant-001 */}
                        {outlet === 'bar' && tableSubCategory === 'bar-ac-hall' && (
                          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-3.5">
                            {activeTables
                              .filter((table) => {
                                const sectionName = (table.sectionName || table.section?.name || '').toLowerCase();
                                return sectionName.includes('bar');
                              })
                              .sort((a, b) => (Number(a.number || a.id) - Number(b.number || b.id)))
                              .map((table) => {
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
                                    key={table.backendId || table.id}
                                    onClick={() => handleTableSelect(table)}
                                    className={`aspect-square border rounded-2xl flex flex-col items-center justify-center text-center p-2.5 cursor-pointer transition-all hover:scale-105 active:scale-95 relative ${containerClass}`}
                                  >
                                    {/* Captain Name Badge - Top Right */}
                                    {table.captainName && (
                                      <div className="absolute top-1 right-1 bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-[6px] text-[8px] md:text-[9px] font-black uppercase tracking-widest max-w-[80%] truncate shadow-sm">
                                        {table.captainName.split(' ')[0]}
                                      </div>
                                    )}
                                    <span className="text-2xl font-black">{outlet === 'bar' ? `B${table.number ?? table.id}` : (table.number ?? table.id)}</span>
                                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider leading-tight mt-1">{statusText}</span>
                                  </div>
                                );
                              })}
                          </div>
                        )}


                        {/* ── BAR VENUE VIEWS ── */}
                        {outlet === 'bar' && tableSubCategory === 'bar-conference' && (
                          <VenueSectionView
                            venueId="venue-bar-conference"
                            sectionName="Conference Hall"
                            restaurantId="venue-001"
                            roomMode="single"
                            onTableSelect={handleTableSelect}
                            onOrderPlaced={() => { }}
                            venueTables={venueTables}
                            isSyncing={venueTablesLoading}
                          />
                        )}
                        {outlet === 'bar' && tableSubCategory === 'bar-pdr' && (
                          <VenueSectionView
                            venueId="venue-bar-pdr"
                            sectionName="PDR"
                            restaurantId="venue-001"
                            roomMode="single"
                            onTableSelect={handleTableSelect}
                            onOrderPlaced={() => { }}
                            venueTables={venueTables}
                            isSyncing={venueTablesLoading}
                          />
                        )}
                        {outlet === 'bar' && tableSubCategory === 'bar-rooms' && (
                          <VenueSectionView
                            venueId="venue-bar-rooms"
                            sectionName="Rooms"
                            restaurantId="venue-001"
                            roomMode="single"
                            onTableSelect={handleTableSelect}
                            onOrderPlaced={() => { }}
                            venueTables={venueTables}
                            isSyncing={venueTablesLoading}
                          />
                        )}
                        {outlet === 'bar' && tableSubCategory === 'bar-parcel' && (
                          <VenueSectionView
                            venueId="venue-bar-parcel"
                            sectionName="Bar Parcel"
                            restaurantId="venue-001"
                            roomMode="single"
                            onTableSelect={handleTableSelect}
                            onOrderPlaced={() => { }}
                            venueTables={venueTables}
                            isSyncing={venueTablesLoading}
                          />
                        )}

                        {/* ── RESTAURANT VENUE VIEWS ── */}
                        {outlet === 'restaurant' && tableSubCategory === 'family-restaurant' && (
                          <VenueSectionView
                            venueId="venue-family-restaurant"
                            sectionName="Family Restaurant"
                            restaurantId="venue-001"
                            roomMode="single"
                            onTableSelect={handleTableSelect}
                            onOrderPlaced={() => { }}
                            venueTables={venueTables}
                            isSyncing={venueTablesLoading}
                          />
                        )}
                        {outlet === 'restaurant' && tableSubCategory === 'parcel' && (
                          <div className="mt-4">
                            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Walk-in (Direct Bill — No KOT)</p>
                            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                              {WALKIN_TABLES.map((wt) => (
                                <div
                                  key={wt.id}
                                  onClick={() => {
                                    clearCashierTableCache(selectedTable);
                                    setIsWalkinMode(true);
                                    setSelectedTable(wt);
                                    setCart([]);
                                    setActiveTab('pos');
                                    localStorage.setItem('cashier_active_tab', 'pos');
                                  }}
                                  className="aspect-square border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50 hover:scale-105 active:scale-95"
                                >
                                  <span className="text-lg font-black text-gray-600">{wt.id}</span>
                                  <span className="text-[9px] font-black uppercase text-gray-400 mt-0.5">Walk-in</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'history' && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        {/* Total Amount Summary */}
                        <div className="m-3 mb-2">
                          <div className="bg-gradient-to-br from-[#E53935] to-[#B71C1C] border border-red-200 rounded-xl p-4 flex flex-col gap-1 shadow-lg">
                            <span className="text-[10px] font-black uppercase tracking-widest text-red-100">Total Amount</span>
                            <span className="text-3xl font-black text-white">
                              ₹{filteredTransactions.reduce((sum, t) => sum + Number(t.grandTotal ?? 0), 0).toFixed(0)}
                            </span>
                            <span className="text-[10px] font-bold text-red-100">{filteredTransactions.length} transactions</span>
                          </div>
                        </div>

                        {/* Cash / UPI / Card summary */}
                        <div className="grid grid-cols-3 gap-2 m-3 mt-0 mb-0">
                          {[
                            { label: 'Cash', method: 'CASH', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
                            { label: 'UPI', method: 'UPI', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                            { label: 'Card', method: 'CARD', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
                          ].map(({ label, method, color, bg, border }) => {
                            const total = filteredTransactions
                              .filter(t => t.method === method)
                              .reduce((sum, t) => sum + Number(t.grandTotal ?? 0), 0);
                            const count = filteredTransactions.filter(t => t.method === method).length;
                            return (
                              <div key={method} className={`${bg} border ${border} rounded-xl p-3 flex flex-col gap-0.5`}>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${color}`}>{label}</span>
                                <span className="text-sm font-black text-gray-900">₹{total.toFixed(0)}</span>
                                <span className="text-[9px] font-bold text-gray-400">{count} txns</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Source filter */}
                        <div className="flex items-center gap-1.5 px-3 pt-3 pb-0 flex-wrap">
                          {[
                            ...(outlet === 'bar'
                              ? [
                                  { key: 'all', label: 'All' },
                                  { key: 'bar', label: 'Bar AC Hall' },
                                  { key: 'bar-conference', label: 'Conference' },
                                  { key: 'bar-pdr', label: 'PDR' },
                                  { key: 'bar-rooms', label: 'Rooms' },
                                  { key: 'bar-parcel', label: 'Parcel' },
                                ]
                              : [
                                  { key: 'all', label: 'All' },
                                  { key: 'restaurant', label: 'Restaurant' },
                                  { key: 'family-restaurant', label: 'Family Restaurant' },
                                  { key: 'restaurant-parcel', label: 'Parcel' },
                                ]
                            ),
                          ].map(f => (
                            <button
                              key={f.key}
                              onClick={() => setTxnSourceFilter(f.key)}
                              className={`px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${txnSourceFilter === f.key
                                ? 'bg-[#E53935] text-white shadow-sm'
                                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                            >
                              {f.label}
                            </button>
                          ))}
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
                              onClick={() => { setTxnDateFilter(f.key); setTxnSourceFilter('all'); setTxnMethodFilter('all'); setTxnSearch(''); setTxnCustomDate(''); }}
                              className={`px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${txnDateFilter === f.key
                                ? 'bg-[#E53935] text-white shadow-sm'
                                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                            >
                              {f.label}
                            </button>
                          ))}
                          <button
                            onClick={() => { loadTransactions(txnDateFilter); setTxnSourceFilter('all'); setTxnMethodFilter('all'); setTxnSearch(''); setTxnCustomDate(''); }}
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
                              className={`px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${txnMethodFilter === f.key
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
                                <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">Bill No</th>
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
                                  <td colSpan={7} className="p-12 text-center">
                                    <div className="flex flex-col items-center justify-center gap-2 py-8">
                                      <div className="w-7 h-7 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />
                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading...</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                paginatedTransactions.map(txn => (
                                  <React.Fragment key={txn.id}>
                                    <tr
                                      onClick={() => setExpandedTxnId(expandedTxnId === txn.id ? null : txn.id)}
                                      className="hover:bg-gray-50 transition-colors cursor-pointer select-none"
                                    >
                                      <td className="p-4">
                                        <span className="text-xs md:text-sm font-black text-[#E53935]">{txn.displayId || '—'}</span>
                                      </td>
                                      <td className="p-4">
                                        <span className="text-xs md:text-sm font-black text-gray-900">{txn.id}</span>
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
                                          {txn.captainName || 'Head Cashier'}
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
                                            <span className="text-sm md:text-base font-black text-gray-900">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(0)}</span>
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
                                            <>
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
                                                  <span className="text-sm font-black text-[#E53935]">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(0)}</span>
                                                </div>
                                              </div>
                                              <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 mt-2 space-y-2">
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>Subtotal</span>
                                                  <span className="text-gray-800">₹{Number(txn.subtotal ?? txn.itemsList.reduce((sum, item) => sum + Number(item.price || item.p || 0) * Number(item.quantity || item.q || 1), 0)).toFixed(0)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>Discount {Number(txn.discountPercent ?? 0) > 0 ? `(${Number(txn.discountPercent).toFixed(0)}%)` : '(0%)'}</span>
                                                  <span className="text-red-600">-₹{Number(txn.discountAmount ?? 0).toFixed(0)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>CGST</span>
                                                  <span className="text-gray-800">₹{Number(txn.cgst ?? 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>SGST</span>
                                                  <span className="text-gray-800">₹{Number(txn.sgst ?? 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                                  <span className="text-xs font-black uppercase text-gray-500">Grand Total</span>
                                                  <span className="text-sm font-black text-[#E53935]">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(0)}</span>
                                                </div>
                                              </div>
                                            </>
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

                        {/* Pagination */}
                        {filteredTransactions.length > 0 && (
                          <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100 bg-gray-50/50">
                            <span className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-wider">
                              {filteredTransactions.length} transactions
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setTxnPage(p => Math.max(1, p - 1))}
                                disabled={txnPage <= 1}
                                className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all ${txnPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 hover:scale-[1.02] active:scale-95'}`}
                              >
                                ← Prev
                              </button>
                              <span className="text-[10px] sm:text-xs font-black text-gray-600 tabular-nums">
                                Page {txnPage} / {txnTotalPages}
                              </span>
                              <button
                                onClick={() => setTxnPage(p => Math.min(txnTotalPages, p + 1))}
                                disabled={txnPage >= txnTotalPages}
                                className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all ${txnPage >= txnTotalPages ? 'text-gray-300 cursor-not-allowed' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 hover:scale-[1.02] active:scale-95'}`}
                              >
                                Next →
                              </button>
                            </div>
                          </div>
                        )}

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

                    {activeTab === 'billfinder' && (
                      <div className="flex flex-col gap-4 h-full">
                        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                          <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider mb-4">Bill Finder</h2>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                            <div>
                              <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Date</label>
                              <input
                                type="date"
                                value={billFinderDate}
                                onChange={(e) => setBillFinderDate(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Bill Number</label>
                              <input
                                type="text"
                                placeholder="Enter bill number..."
                                value={billFinderBillNo}
                                onChange={(e) => setBillFinderBillNo(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Table Number</label>
                              <input
                                type="text"
                                placeholder="Enter table number..."
                                value={billFinderTableNo}
                                onChange={(e) => setBillFinderTableNo(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleBillSearch}
                            disabled={billFinderLoading}
                            className="w-full bg-[#E53935] text-white rounded-xl px-4 py-3 text-sm font-black uppercase hover:bg-[#B71C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {billFinderLoading ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Searching...
                              </>
                            ) : (
                              <>
                                <Search size={16} />
                                Search Bills
                              </>
                            )}
                          </button>
                        </div>

                        {billFinderResults.length === 0 && !billFinderLoading && (
                          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
                            <Search size={32} className="text-gray-300 mx-auto mb-2" />
                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No bills found</p>
                          </div>
                        )}

                        {billFinderResults.length > 0 && (
                          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Bill #</th>
                                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Date/Time</th>
                                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Table</th>
                                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Method</th>
                                    <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Total</th>
                                    <th className="px-4 py-3 text-center text-xs font-black uppercase text-gray-600">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {billFinderResults.map((txn) => (
                                    <tr key={txn.id} className="hover:bg-gray-50">
                                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{txn.displayId || '—'}</td>
                                      <td className="px-4 py-3 text-xs font-bold text-gray-600">
                                        {new Date(txn.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                        {' '}
                                        {new Date(txn.paidAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                      </td>
                                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{txn.tableNumber || '—'}</td>
                                      <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                                          txn.method === 'CASH' ? 'bg-green-100 text-green-700' :
                                          txn.method === 'UPI' ? 'bg-blue-100 text-blue-700' :
                                          txn.method === 'CARD' ? 'bg-purple-100 text-purple-700' :
                                          'bg-gray-100 text-gray-700'
                                        }`}>
                                          {txn.method || '—'}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right text-sm font-black text-[#E53935]">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(2)}</td>
                                      <td className="px-4 py-3 text-center">
                                        <button
                                          onClick={() => handleReprintFoundBill(txn)}
                                          disabled={isReprintingFoundBill}
                                          className="bg-blue-500 text-white rounded-lg px-3 py-1.5 text-xs font-bold uppercase hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 mx-auto"
                                        >
                                          <Printer size={12} />
                                          Reprint
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
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
              {activeTab === 'pos' && (
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
                          className={`w-full bg-white border-2 rounded-2xl pl-14 pr-12 h-16 text-base md:text-lg font-black text-gray-900 outline-none transition-all duration-200 shadow-md placeholder:text-gray-400 ${isSearchFocused
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
                      <div className="flex flex-col gap-2 py-1">
                        {/* Row 1 — Large Menu Type Tabs + Diet Filter */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-grow">
                            {[
                              ...(outlet === 'bar'
                                ? [
                                    { value: 'ALL', label: 'ALL' },
                                    { value: 'FOOD', label: 'FOOD 🍽️' },
                                    { value: 'LIQUOR', label: 'LIQUOR 🥃' },
                                  ]
                                : [
                                    { value: 'ALL', label: 'ALL' },
                                    { value: 'FOOD', label: 'FOOD 🍽️' },
                                    { value: 'DESSERTS', label: 'DESSERTS 🍮' },
                                  ]
                              ),
                            ].map(tab => (
                              <button
                                key={tab.value}
                                onClick={() => {
                                  setSelectedMenuType(tab.value);
                                  setSelectedCategory('All');
                                }}
                                className={`px-8 min-h-[56px] rounded-xl font-black text-lg uppercase tracking-widest transition-all duration-200 border-2 shrink-0 hover:scale-[1.03] active:scale-95 flex-1 ${selectedMenuType === tab.value
                                  ? 'bg-[#E53935] border-[#E53935] text-white shadow-lg shadow-red-500/35'
                                  : 'bg-white border-gray-200 text-gray-700 hover:bg-[#FFF5F5] hover:border-[#E53935] hover:text-[#E53935]'
                                  }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shrink-0 shadow-sm">
                            {['All', 'veg', 'non'].map(diet => (
                              <button
                                key={diet}
                                onClick={() => setActiveDiet(diet)}
                                className={`px-5 py-3 rounded-xl text-xs md:text-sm font-black uppercase transition-all duration-200 hover:scale-[1.02] active:scale-95 ${activeDiet === diet
                                  ? (diet === 'All' ? 'bg-gray-800 text-white shadow-sm' : diet === 'veg' ? 'bg-green-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm')
                                  : 'text-gray-500 hover:text-gray-850 bg-transparent'
                                  }`}
                              >
                                {diet === 'All' ? 'All' : diet === 'veg' ? 'Veg' : 'Non'}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Row 2 — Subcategory Pills (only shown when a menu type is selected) */}
                        {selectedMenuType !== 'ALL' && menuTypeSubcategories.length > 1 && (
                          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide scroll-smooth py-1 flex-grow">
                            {menuTypeSubcategories.map(cat => (
                              <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-6 py-4 rounded-xl text-base font-black uppercase transition-all duration-200 border shrink-0 hover:scale-[1.03] active:scale-95 ${selectedCategory === cat
                                  ? 'bg-[#E53935] border-[#E53935] text-white shadow-lg shadow-red-500/35 scale-[1.04] z-10'
                                  : 'bg-white border-gray-200 text-gray-700 hover:bg-[#FFF5F5] hover:border-[#FFCDD2] hover:text-[#E53935]'
                                  }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-grow overflow-y-auto p-4 bg-gray-50/30 custom-scrollbar">
                      {menuLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 flex gap-4 items-center">
                              <div className="w-16 h-16 bg-gray-200 animate-pulse rounded-lg shrink-0" />
                              <div className="flex-grow">
                                <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded mb-2" />
                                <div className="h-3 w-1/2 bg-gray-200 animate-pulse rounded mb-2" />
                                <div className="h-4 w-1/4 bg-gray-200 animate-pulse rounded" />
                              </div>
                            </div>
                          ))}
                        </div>
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
                          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
                        >
                          {activeMenuItems.map((item) => (
                            <div
                              key={item.id || item.n}
                              className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden hover:border-[#E53935] hover:shadow-xl transition-all duration-200 cursor-default flex flex-col group hover:scale-[1.02] active:scale-[0.99] shadow-md min-h-[120px] p-4 gap-2 justify-between"
                            >
                              {/* Top row: veg/non dot + menuType badge */}
                              <div className="flex items-center justify-between">
                                <div className={`w-4 h-4 rounded-[3px] border flex items-center justify-center ${item.t === 'veg' ? 'border-green-600' : 'border-red-600'}`}>
                                  <div className={`w-2 h-2 rounded-full ${item.t === 'veg' ? 'bg-green-600' : 'bg-red-600'}`} />
                                </div>
                                {outlet === 'bar' && item.menuType && (
                                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
                                    {item.menuType === 'FOOD' ? '🍽️ Food' : '🥃 Liquor'}
                                  </span>
                                )}
                              </div>

                              {/* Item name — large and readable */}
                              <h4 className="text-sm md:text-base font-black text-gray-900 leading-snug line-clamp-3">
                                <HighlightedText text={item.n} highlight={searchQuery} />
                              </h4>

                              {/* Price + Add button */}
                              <div className="flex items-center justify-between mt-auto">
                                <p className="text-lg md:text-xl font-black text-[#E53935]">₹{item.p}</p>
                                <div onClick={(e) => { e.stopPropagation(); handleAddItem(item); }} className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-150 flex items-center justify-center text-gray-500 group-hover:bg-[#E53935] group-hover:text-white transition-colors duration-150 shadow-sm active:scale-90 shrink-0 cursor-pointer">
                                  <Plus className="w-5 h-5" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* COMPACT CART */}
                  <div className={`w-full lg:w-[440px] flex flex-col bg-white shadow-xl z-20 shrink-0 transition-all duration-300 ${isCartMinimized ? 'h-14 lg:h-auto overflow-hidden' : 'h-[55vh] lg:h-auto'}`}>
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
                              {selectedTable ? (selectedTable.displayName || selectedTable.name || (outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`)) : 'POS'}
                            </div>
                            <div className="flex-grow min-w-0">
                              <p className="text-sm md:text-base font-black text-gray-900 truncate">{selectedTable ? `Table ${selectedTable.displayName || selectedTable.name || selectedTable.id}` : 'Walk-in Order'}</p>
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
                          ? (selectedTable.kotHistory || []).flatMap(k => k.items.map(i => ({ ...i, isKotSent: true, kotId: k.id })))
                          : [];
                        const pendingItems = cart.map(i => ({ ...i, isKotSent: false }));
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
                                <div>
                                  <p className="text-sm md:text-base font-black text-gray-900 truncate flex items-center gap-1.5">
                                    {item.n}
                                    {item.isKotSent && <span className="text-xs font-black uppercase tracking-widest bg-green-50 text-green-600 px-2 py-1 rounded-lg border border-green-150 ml-2">KOT Sent</span>}
                                  </p>
                                </div>
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
                              {/* Instruction Note */}
                              {item.isKotSent ? (
                                item.notes && (
                                  <div className="flex items-center gap-1 mt-1.5">
                                    <MessageSquare size={11} className="text-amber-500 shrink-0" />
                                    <span className="text-xs text-amber-700 font-semibold italic truncate">{item.notes}</span>
                                  </div>
                                )
                              ) : (
                                <div className="mt-1.5">
                                  {activeNoteItemId === item.id ? (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        autoFocus
                                        type="text"
                                        placeholder="e.g. Spicy, No onion, Deep fry…"
                                        value={noteInputValue}
                                        onChange={e => setNoteInputValue(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            updateItemNote(item.id, noteInputValue);
                                            setActiveNoteItemId(null);
                                          }
                                          if (e.key === 'Escape') {
                                            setActiveNoteItemId(null);
                                          }
                                        }}
                                        className="flex-1 text-xs border border-amber-300 rounded-lg px-2 py-1 bg-amber-50 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300"
                                        maxLength={60}
                                      />
                                      <button
                                        onClick={() => {
                                          updateItemNote(item.id, noteInputValue);
                                          setActiveNoteItemId(null);
                                        }}
                                        className="text-xs font-black text-white bg-amber-500 hover:bg-amber-600 px-2 py-1 rounded-lg transition-colors"
                                      >✓</button>
                                      <button
                                        onClick={() => setActiveNoteItemId(null)}
                                        className="text-xs text-gray-400 hover:text-red-500 px-1 py-1 rounded transition-colors"
                                      >✕</button>
                                    </div>
                                  ) : item.notes ? (
                                    <div className="flex items-center gap-1">
                                      <MessageSquare size={11} className="text-amber-500 shrink-0" />
                                      <span className="text-xs text-amber-700 font-semibold italic truncate flex-1">{item.notes}</span>
                                      <button
                                        onClick={() => {
                                          setActiveNoteItemId(item.id);
                                          setNoteInputValue(item.notes || '');
                                        }}
                                        className="text-xs text-gray-400 hover:text-amber-600 ml-1 shrink-0 transition-colors"
                                      >Edit</button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setActiveNoteItemId(item.id);
                                        setNoteInputValue('');
                                      }}
                                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 transition-colors"
                                    >
                                      <Plus size={11} />
                                      <span>Note</span>
                                    </button>
                                  )}
                                </div>
                              )}
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
                          <span className="text-2xl md:text-3xl lg:text-4xl font-black text-[#E53935] tracking-tight">₹{Number(selectedTable ? activeGrandTotal : cartGrandTotal).toFixed(0)}</span>
                        </div>
                      </div>

                      <div className="pt-0.5">
                        {(isWalkinMode || (outlet === 'restaurant' && tableSubCategory === 'parcel')) ? (
                          <button
                            onClick={handleWalkinFinalBill}
                            disabled={cart.length === 0 || isPrintingBill}
                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${cart.length === 0 || isPrintingBill ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700 shadow-md'}`}
                          >
                            {isPrintingBill ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                            <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                              {isPrintingBill ? 'Printing...' : 'Final Bill (Direct)'}
                            </span>
                          </button>
                        ) : (
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
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}


            </>
        </main>
      </div>

      {/* TABLE DETAILS MODAL */}
      {showTableModal && selectedTable && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => {
            setShowTableModal(false);
            setExpandedNoteItemId(null);
            // Only clear discount if no saved discount persisted for this table
            const hasSavedDiscount = selectedTable?.backendId &&
              localStorage.getItem(`cashier_table_discount_${selectedTable.backendId}`);
            if (!hasSavedDiscount) {
              setRawDiscountInput('');
            }
          }}
        >
          <div
            className="w-full max-w-lg h-auto max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 sm:p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#E53935] text-white flex items-center justify-center font-black text-xl sm:text-2xl border-2 border-red-700 shadow-sm transform hover:rotate-1 transition-transform">
                  {outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.number ?? selectedTable.id}`}
                </div>
                <div>
                  <h2 className="text-[10px] sm:text-xs font-black uppercase text-gray-400 leading-none tracking-widest">Active Session</h2>
                  <p className="text-base sm:text-lg font-black text-gray-900 mt-0.5 sm:mt-1">
                    {selectedTable.time ? new Date(selectedTable.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Just now'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTableModal(false);
                  setExpandedNoteItemId(null);
                  // Only clear discount if no saved discount persisted for this table
                  const hasSavedDiscount = selectedTable?.backendId &&
                    localStorage.getItem(`cashier_table_discount_${selectedTable.backendId}`);
                  if (!hasSavedDiscount) {
                    setRawDiscountInput('');
                  }
                }}
                className="p-2 sm:p-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-150 active:scale-95"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3 sm:p-4 bg-white flex flex-col flex-1 min-h-[100px] overflow-hidden">
              {/* ── Order Summary (read-only view) ─────────────────── */}
              <div className="flex flex-col min-h-0 flex-1 mb-3 overflow-hidden">
                <h3 className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-[#E53935] border-b border-red-100 pb-1 shrink-0">
                  Order Summary
                </h3>
                <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-0.5 mt-2">
                  {groupOrderItems(getAllOrderItems(selectedTable))
                    .map((item, idx) => {
                      const isCancelled = item.quantity === 0;
                      return (
                        <div key={`${item.n}-${idx}`} className={`flex justify-between items-center py-2 border-b border-gray-100 last:border-0 ${isCancelled ? 'opacity-50' : ''}`}>
                          <div className="flex items-start gap-3">
                            <span className={`min-w-[32px] h-7 rounded-lg border shadow-sm flex items-center justify-center text-sm font-black px-1.5 shrink-0 mt-0.5 ${isCancelled ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-red-50 text-red-600 border-red-100'}`}>
                              {isCancelled ? <span className="line-through">{item.q}×</span> : <span>{item.q}×</span>}
                            </span>
                            <span className={`text-sm font-bold leading-snug ${isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>{item.n}</span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <span className={`text-sm font-black whitespace-nowrap ${isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                              ₹{Number(item.p * item.q).toFixed(0)}
                            </span>
                            {isCancelled ? (
                              <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Cancelled</span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCancelModal(true);
                                  if (item.originalIds.length === 1) {
                                    setCancelSelected({ [item.originalIds[0]]: 1 });
                                  } else {
                                    const selection = {};
                                    item.originalIds.forEach((id) => { selection[id] = { item, quantity: 1 }; });
                                    setCancelSelected(selection);
                                  }
                                }}
                                className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors shadow-sm border border-red-100 mt-0.5"
                                title="Cancel Item"
                              >
                                <X size={16} strokeWidth={3} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* ── Fixed Bottom Area ─────────────────────────────── */}
              <div className="shrink-0 pt-2 border-t border-gray-100">

                {/* ── Discount & Totals (Ultra Compact) ──────────────── */}
                <div className="flex gap-2 sm:gap-3 mb-2">
                  {(() => {
                    const isBillFinalised = selectedTable?.status === 'Waiting Bill' || selectedTable?.status === 'BILLING_REQUESTED';
                    return (
                      <>
                  {/* Discount */}
                  <div className="w-32 sm:w-36 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] sm:text-xs font-black uppercase text-gray-400 tracking-wider">
                        Discount
                      </label>
                      <div className={`flex bg-gray-100 rounded-lg p-1 ml-2 ${isBillFinalised ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}>
                        <button 
                          onClick={() => { setDiscountMode('percent'); setRawDiscountInput(''); }}
                          className={`px-3 py-1 text-sm sm:text-base font-black rounded-md transition-all ${discountMode === 'percent' ? 'bg-white shadow-sm border border-gray-200/50 text-[#E53935]' : 'text-gray-400 hover:text-gray-600'}`}
                        >%</button>
                        <button 
                          onClick={() => { setDiscountMode('fixed'); setRawDiscountInput(''); }}
                          className={`px-3 py-1 text-sm sm:text-base font-black rounded-md transition-all ${discountMode === 'fixed' ? 'bg-white shadow-sm border border-gray-200/50 text-[#E53935]' : 'text-gray-400 hover:text-gray-600'}`}
                        >₹</button>
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step={discountMode === 'percent' ? "0.01" : "1"}
                      value={rawDiscountInput}
                      onChange={(e) => setRawDiscountInput(e.target.value)}
                      disabled={isBillFinalised}
                      className="w-full px-3 py-2 bg-[#FFF5F5] border focus:border-[#E53935] rounded-lg outline-none text-sm font-bold text-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-100"
                      placeholder="0"
                    />
                    {isBillFinalised && (
                      <p className="text-[9px] text-gray-400 text-center mt-1 flex items-center justify-center gap-1">
                        🔒 Bill printed — discount locked
                      </p>
                    )}
                  </div>

                  {/* Totals */}
                  <div className="flex-1 bg-gray-50 rounded-xl p-2.5 border border-gray-200 shadow-sm flex flex-col justify-center gap-1">
                    <div className="flex justify-between text-xs font-black text-gray-500 uppercase">
                      <span>Subtotal</span>
                      <span className="font-black text-gray-800">₹{Number(activeSubtotal || 0).toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-black text-gray-500 uppercase">
                      <span>GST</span>
                      <span className="font-black text-gray-800">₹{Number(activeTaxes || 0).toFixed(0)}</span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex justify-between text-xs font-black text-[#E53935] uppercase">
                        <span>Discount {discountMode === 'percent' ? `(${discountPercent}%)` : ''}</span>
                        <span>-₹{activeDiscountAmount.toFixed(0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-0.5">
                      <span className="text-xs font-black text-gray-900 uppercase tracking-widest">
                        {discountPercent > 0 ? 'Final' : 'Total'}
                      </span>
                      <span className="text-xl sm:text-2xl font-black text-[#E53935] tracking-tight leading-none">
                        ₹{Number(activeGrandTotal > 0 ? activeGrandTotal : fallbackTotal).toFixed(0)}
                      </span>
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </div>

                {/* ── Action buttons ──────────────────────────────────── */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setActiveTab('pos');
                      localStorage.setItem('cashier_active_tab', 'pos');
                      setShowTableModal(false);
                      setExpandedNoteItemId(null);
                      const hasSavedDiscount = selectedTable?.backendId &&
                        localStorage.getItem(`cashier_table_discount_${selectedTable.backendId}`);
                      if (!hasSavedDiscount) {
                        setRawDiscountInput('');
                      }
                    }}
                    className="py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs sm:text-sm font-black uppercase tracking-wider hover:bg-gray-50 transition-all duration-150 shadow-sm cursor-pointer"
                  >
                    Add Items
                  </button>
                  <button
                    onClick={() => setShowBillEditor(true)}
                    className="py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs sm:text-sm font-black uppercase tracking-wider hover:bg-amber-100/70 transition-all duration-150 shadow-sm cursor-pointer"
                  >
                    Edit Bill
                  </button>
                  {/* Primary source of truth: billPrintedTableIds then socket status */}
                  {(() => {
                    // If bill was printed and not yet settled → always show Settlement (ignore stale sync)
                    if (billPrintedTableIds.has(selectedTable.backendId)) return true;
                    // Settled this session → treat as done
                    if (settledTableIds.has(selectedTable.backendId)) return false;
                    // Fall back to socket-driven status
                    const s = selectedTable.status;
                    return s === 'Waiting Bill' || s === 'BILLING_REQUESTED';
                  })() ? (
                    <button
                      onClick={() => setShowMethodPicker(true)}
                      className="py-2.5 rounded-lg bg-[#E53935] border border-red-750 text-white text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 hover:bg-[#c62828] shadow-md cursor-pointer"
                    >
                      Settlement
                    </button>
                  ) : (
                    getBillableItems(selectedTable).length > 0 ? (
                      <button
                        onClick={handleFinalBill}
                        disabled={isPrintingBill || printCooldown}
                        className={`py-2.5 rounded-lg border text-white text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 shadow-md flex items-center justify-center gap-1.5 ${isPrintingBill || printCooldown
                          ? 'bg-gray-400 border-gray-500 cursor-not-allowed shadow-gray-400/20'
                          : 'bg-blue-600 border-blue-700 hover:bg-blue-700 cursor-pointer'
                          }`}
                      >
                        {isPrintingBill ? <Loader2 size={12} className="animate-spin" /> : null}
                        {isPrintingBill ? 'Fetching…' : printCooldown ? 'Printed ✓' : 'Final Bill'}
                      </button>
                    ) : (
                      <div className="py-2.5 rounded-lg border border-gray-300 bg-gray-200 text-gray-500 text-xs sm:text-sm font-black uppercase tracking-wider text-center cursor-not-allowed shadow-sm">
                        No Items
                      </div>
                    )
                  )}
                </div>

                {/* Re-print row — always visible when table has an active order with items */}
                {selectedTable?.activeOrder?.id && getBillableItems(selectedTable).length > 0 && (
                  <button
                    onClick={handleReprintBill}
                    disabled={isReprintingBill}
                    className={`mt-1.5 w-full py-2 rounded-lg border text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-1.5 ${isReprintingBill
                      ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                      : printCooldown
                        ? 'bg-blue-50 border-blue-300 text-blue-700 cursor-pointer shadow-sm'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 cursor-pointer shadow-sm'
                    }`}
                  >
                    {isReprintingBill
                      ? <><Loader2 size={10} className="animate-spin" /> Sending…</>
                      : <>🖨️ RE-PRINT SAME BILL #</>
                    }
                  </button>
                )}

                {/* Swap Table & Terminate Session buttons */}
                {selectedTable.status && selectedTable.status !== 'Free' && (
                  <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setSwapTargetId(null); setShowSwapModal(true); }}
                      className="py-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs font-black uppercase tracking-wider transition-all duration-150 hover:bg-blue-100/60 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ArrowRightLeft size={10} />
                      Swap Table
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setItemSwapSelectedIds([]);
                        setItemSwapTargetId(null);
                        setShowItemSwapModal(true);
                      }}
                      className="py-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-black uppercase tracking-wider transition-all duration-150 hover:bg-indigo-100/60 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ArrowRightLeft size={10} />
                      Swap Items
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTerminateModal(true)}
                      disabled={isTerminating}
                      className={`py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-1 ${isTerminating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-100/60 cursor-pointer'}`}
                    >
                      {isTerminating ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                      {isTerminating ? 'Ending...' : 'Terminate'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BILL EDITOR MODAL */}
      {showBillEditor && selectedTable && (() => {
        const committedItems = getBillableItems(selectedTable);
        const allMenuItems = outlet === 'bar' ? barMenuItems : menuItems;
        const searchResults = billEditSearch.trim().length > 1
          ? allMenuItems.filter(m =>
            m.isAvailable !== false &&
            (m.name || m.n || '').toLowerCase().includes(billEditSearch.toLowerCase())
          ).slice(0, 12)
          : [];

        // Live total: committed items minus removals + additions
        const removedQtyTotal = billRemovals.reduce((sum, itemId) => {
          return sum + Math.max(1, Math.round(Number(billEditQuantities[itemId] ?? 1)));
        }, 0);
        const liveTotalItems = [
          ...committedItems.map(i => {
            const removedQty = billRemovals.includes(i.id)
              ? Math.max(1, Math.min(Number(i.q ?? 0), Math.round(Number(billEditQuantities[i.id] ?? 1))))
              : 0;
            return { p: i.p, q: Math.max(0, Number(i.q ?? 0) - removedQty) };
          }),
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
                    onClick={() => { setShowBillEditor(false); setBillRemovals([]); setBillEditQuantities({}); setBillAdditions([]); setBillEditSearch(''); }}
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
                      const removalQty = isMarked
                        ? Math.max(1, Math.min(Number(item.q ?? 0), Math.round(Number(billEditQuantities[item.id] ?? 1))))
                        : 0;
                      const remainingQty = Math.max(0, Number(item.q ?? 0) - removalQty);
                      return (
                        <div
                          key={item.id || idx}
                          onClick={() => {
                            if (!item.id) return;
                            setBillRemovals(prev => {
                              const next = isMarked ? prev.filter(x => x !== item.id) : [...prev, item.id];
                              return next;
                            });
                            setBillEditQuantities(prev => {
                              if (isMarked) {
                                const next = { ...prev };
                                delete next[item.id];
                                return next;
                              }
                              return { ...prev, [item.id]: prev[item.id] ?? 1 };
                            });
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
                            <span className={`text-sm sm:text-base font-bold ${isMarked ? 'text-gray-400' : 'text-gray-800'}`}>
                              {isMarked && removalQty < Number(item.q ?? 0) ? (
                                <>
                                  <span className="line-through">{removalQty}×</span>
                                  <span className="ml-2 text-red-600">{remainingQty}× {item.n}</span>
                                </>
                              ) : (
                                <>{item.q}× {item.n}</>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {isMarked && (
                              <div className="flex items-center gap-1 rounded-xl border border-red-200 bg-white px-2 py-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBillEditQuantities(prev => ({
                                      ...prev,
                                      [item.id]: Math.max(1, Number(prev[item.id] ?? 1) - 1),
                                    }));
                                  }}
                                  className="w-6 h-6 rounded-lg bg-red-50 text-red-600 font-black"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.q}
                                  value={removalQty}
                                  onChange={(e) => {
                                    const nextValue = Math.max(1, Math.min(Number(item.q ?? 1), Math.round(Number(e.target.value || 1))));
                                    setBillEditQuantities(prev => ({
                                      ...prev,
                                      [item.id]: nextValue,
                                    }));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-12 text-center bg-transparent text-xs font-black text-red-700 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBillEditQuantities(prev => ({
                                      ...prev,
                                      [item.id]: Math.min(Number(item.q ?? 1), Number(prev[item.id] ?? 1) + 1),
                                    }));
                                  }}
                                  className="w-6 h-6 rounded-lg bg-red-50 text-red-600 font-black"
                                >
                                  +
                                </button>
                              </div>
                            )}
                            <span className={`text-sm sm:text-base font-black ${isMarked ? 'text-red-550' : 'text-gray-900'}`}>
                              {isMarked ? '−' : ''}₹{Number(item.p * item.q).toFixed(0)}
                            </span>
                          </div>
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
                    {billRemovals.length > 0 && <span className="text-red-550">{removedQtyTotal} qty removed</span>}
                    {billRemovals.length > 0 && billAdditions.length > 0 && <span>·</span>}
                    {billAdditions.length > 0 && <span className="text-amber-500">{billAdditions.reduce((s, i) => s + i.quantity, 0)} item(s) added</span>}
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
                <p className="text-3xl font-black text-gray-900 mt-1">₹{Number(activeGrandTotal > 0 ? activeGrandTotal : fallbackTotal).toFixed(0)}</p>
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
              <p className="text-4xl font-black text-gray-900 mb-6 tabular-nums">₹{Number(activeGrandTotal > 0 ? activeGrandTotal : fallbackTotal).toFixed(0)}</p>
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
                      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center text-xs font-black transition-all hover:scale-105 active:scale-95 ${swapTargetId === t.backendId
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
                    await swapTable(selectedTable.backendId, swapTargetId, 'Cashier', selectedTable.section?.restaurantId || activeRestaurantId);
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
                className={`mt-4 w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 ${swapTargetId && !isSwapping
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

      {showItemSwapModal && selectedTable && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Swap Selected Items</p>
                <p className="text-base font-black text-gray-900 mt-0.5">
                  {outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`} → Choose Items & Destination
                </p>
              </div>
              <button
                onClick={() => {
                  setShowItemSwapModal(false);
                  setItemSwapSelectedIds([]);
                  setItemSwapTargetId(null);
                }}
                className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Select Items to Transfer</p>
                  <button
                    onClick={() => {
                      if (itemSwapItems.length > 0 && itemSwapSelectedIds.length === itemSwapItems.length) {
                        setItemSwapSelectedIds([]);
                        return;
                      }
                      setItemSwapSelectedIds(itemSwapItems.map(item => item.id));
                    }}
                    className="text-xs font-black uppercase tracking-wider text-indigo-700 hover:text-indigo-900 cursor-pointer"
                  >
                    {itemSwapItems.length > 0 && itemSwapSelectedIds.length === itemSwapItems.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="space-y-2">
                  {itemSwapItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-semibold text-gray-400">
                      No active items available to transfer
                    </div>
                  ) : (
                    itemSwapItems.map((item) => {
                      const isSelected = itemSwapSelectedIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setItemSwapSelectedIds(prev =>
                              isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id]
                            );
                          }}
                          className={`w-full rounded-2xl border-2 px-4 py-3.5 text-left transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${isSelected
                            ? 'border-indigo-300 bg-indigo-50/80'
                            : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                            }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-5 w-5 items-center justify-center rounded border ${isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300 bg-white text-transparent'}`}>
                                <Check size={12} />
                              </div>
                              <div>
                                <p className="text-sm sm:text-base font-bold text-gray-900">{item.name ?? item.n}</p>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Qty {Number(item.quantity ?? item.q ?? 1)}</p>
                              </div>
                            </div>
                            <p className="text-sm sm:text-base font-black text-indigo-800">
                              ₹{(Number(item.price ?? item.p ?? 0) * Number(item.quantity ?? item.q ?? 1)).toFixed(2)}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider mb-3">Select Destination Table</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {itemSwapDestinationTables.map((table) => {
                    const isFree = !table.status || table.status === 'Free';
                    const isSelected = itemSwapTargetId === table.backendId;
                    return (
                      <button
                        key={table.backendId || table.id}
                        onClick={() => setItemSwapTargetId(table.backendId)}
                        className={`rounded-2xl border-2 p-4 text-left transition-all duration-150 hover:scale-[1.02] active:scale-95 ${isSelected
                          ? 'border-indigo-300 bg-indigo-50 shadow-md shadow-indigo-100/60'
                          : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-black text-gray-900">
                              {outlet === 'bar' ? `B${table.number ?? table.id}` : `T${table.id}`}
                            </p>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mt-1">
                              {table.section?.name || 'Table'}
                            </p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${isFree
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                            }`}>
                            {isFree ? 'Free' : `₹${Number(table.currentBill || 0).toFixed(0)}`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 shrink-0">
              <button
                onClick={handleTransferItems}
                disabled={itemSwapSelectedIds.length === 0 || !itemSwapTargetId || isSwappingItems}
                className={`w-full py-4 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95 ${itemSwapSelectedIds.length > 0 && itemSwapTargetId && !isSwappingItems
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
              >
                {isSwappingItems
                  ? 'Transferring...'
                  : itemSwapSelectedIds.length > 0 && itemSwapTargetId
                    ? `Transfer ${itemSwapSelectedIds.length} items to ${outlet === 'bar'
                      ? `B${selectedItemSwapTarget?.number ?? selectedItemSwapTarget?.id}`
                      : `T${selectedItemSwapTarget?.id}`}`
                    : 'Select items and table'}
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

      {/* CANCEL ITEMS MODAL */}
      {showCancelModal && selectedTable && (() => {
        const cancellableItems = getBillableItems(selectedTable);
        const selectedCount = Object.keys(cancelSelected).length;
        const selectedQuantityTotal = Object.values(cancelSelected).reduce(
          (sum, entry) => sum + Math.max(1, Math.round(Number(entry.quantity ?? 1))),
          0
        );

        const handleCancelSelected = async () => {
          if (selectedCount === 0) return;

          setCancelBatchLoading(true);

          const cancelTimeout = setTimeout(() => {
            setCancelBatchLoading(false);
            setShowCancelModal(false);
            setCancelSelected({});
            addNotification('Cancel timed out — please try again', 'error');
          }, 15000);

          try {
            // Always fetch fresh order data first so we use the correct live orderId and item IDs
            const freshOrder = await fetchFreshOrderData(selectedTable.backendId);
            const liveOrder = freshOrder || selectedTable.activeOrder;

            if (!liveOrder?.id) {
              addNotification('No active order found.', 'error');
              return;
            }

            // Build a map of item name → fresh orderItem so we match by name if IDs are stale
            const freshItemMap = {};
            if (freshOrder?.items) {
              for (const fi of freshOrder.items) {
                if (!fi.removedFromBill) {
                  freshItemMap[fi.id] = fi;              // by DB id
                  freshItemMap[fi.name ?? fi.n] = fi;   // by name as fallback
                }
              }
            }

            // Also build from current selectedTable as secondary fallback
            const localItems = getBillableItems(selectedTable);
            for (const li of localItems) {
              if (!freshItemMap[li.id]) freshItemMap[li.id] = li;
            }

            // Build batch items list, resolving fresh IDs
            const batchItems = [];
            const resolvedIds = [];

            for (const [itemId, { quantity, item: cachedItem }] of Object.entries(cancelSelected)) {
              const freshItem = freshItemMap[itemId]
                || (cachedItem && freshItemMap[cachedItem.n ?? cachedItem.name])
                || (cachedItem && freshItemMap[cachedItem.name ?? cachedItem.n]);
              if (!freshItem) continue;

              const cancelQuantity = Math.max(1, Math.min(
                Number(freshItem.quantity ?? freshItem.q ?? 1),
                Math.round(Number(quantity ?? 1))
              ));
              batchItems.push({ orderItemId: freshItem.id ?? itemId, cancelQuantity });
              resolvedIds.push(freshItem.id ?? itemId);
            }

            if (batchItems.length === 0) {
              setCancelSelected({});
              setShowCancelModal(false);
              return;
            }

            const loadingPatch = {};
            resolvedIds.forEach(id => { loadingPatch[id] = true; });
            setCancelLoading(prev => ({ ...prev, ...loadingPatch }));

            const batchRequestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2) + Date.now().toString(36));

            try {
              // ONE API call → ONE CANCEL_KOT socket event → ONE printed slip
              await cancelOrderItems(
                liveOrder.id,
                batchItems,
                'Cashier',
                selectedTable.number || selectedTable.id,
                batchRequestId
              );

              const cancelledIdSet = new Set(resolvedIds);
              setSelectedTable(prev => {
                if (!prev?.activeOrder?.items) return prev;
                return {
                  ...prev,
                  activeOrder: {
                    ...prev.activeOrder,
                    items: prev.activeOrder.items.map(i =>
                      cancelledIdSet.has(i.id) ? { ...i, removedFromBill: true, quantity: 0 } : i
                    ),
                  },
                };
              });

              const isVenueTable = selectedTable?.section?.restaurantId === 'venue-001' || selectedTable?.restaurantId === 'venue-001';
              const setTargetTables = isVenueTable && setVenueTables ? setVenueTables : setActiveTables;
              setTargetTables(prev => prev.map(t => {
                if (t.backendId !== selectedTable.backendId) return t;
                const updatedOrder = t.activeOrder
                  ? { ...t.activeOrder, items: (t.activeOrder.items || []).map(i => cancelledIdSet.has(i.id) ? { ...i, removedFromBill: true, quantity: 0 } : i) }
                  : t.activeOrder;
                return { ...t, activeOrder: updatedOrder };
              }));

              const entries = Object.values(cancelSelected);
              const firstName = entries[0]?.item ? (entries[0].item.n ?? entries[0].item.name ?? 'Item') : 'Item';
              addNotification(
                selectedCount === 1 ? `${firstName} x${selectedQuantityTotal} cancelled` : `${selectedQuantityTotal} items cancelled`,
                'success'
              );
            } catch (err) {
              console.error('[CancelBatch]', err.message);
              addNotification(err.message?.toLowerCase().includes('already') ? 'Items already cancelled' : `Cancel failed: ${err.message}`, 'error');
            } finally {
              const clearLoading = {};
              resolvedIds.forEach(id => { clearLoading[id] = false; });
              setCancelLoading(prev => ({ ...prev, ...clearLoading }));
            }

            setCancelSelected({});
            setShowCancelModal(false);
          } finally {
            clearTimeout(cancelTimeout);
            setCancelBatchLoading(false);
          }
        };

        return (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowCancelModal(false); setCancelSelected({}); }}>
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm mx-0 sm:mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setShowCancelModal(false); setCancelSelected({}); }} className="p-2 bg-red-50 hover:bg-red-100 rounded-xl transition-colors cursor-pointer active:scale-95">
                    <X size={18} className="text-red-500" />
                  </button>
                  <div>
                    <h3 className="font-black text-sm text-gray-900">Cancel Items</h3>
                    <p className="text-[10px] text-gray-400 font-semibold">Table {selectedTable?.number || selectedTable?.id} — select items to remove</p>
                  </div>
                </div>
              </div>

              {/* Body: List items */}
              <div className="p-5 max-h-[40vh] overflow-y-auto custom-scrollbar bg-gray-50/50 space-y-2">
                {cancellableItems.length === 0 ? (
                  <p className="text-xs text-gray-400 font-bold text-center py-4">No cancellable items.</p>
                ) : (
                  cancellableItems.map((item, idx) => {
                    const isSelected = !!cancelSelected[item.id];
                    const isLoading = cancelLoading[item.id];
                    const cancelQuantity = Math.max(
                      1,
                      Math.min(
                        Number(item.q ?? 1),
                        Math.round(Number(cancelSelected[item.id]?.quantity ?? 1))
                      )
                    );
                    const remainingQuantity = Math.max(0, Number(item.q ?? 0) - cancelQuantity);
                    return (
                      <button
                        key={item.id || idx}
                        disabled={isLoading}
                        onClick={() => {
                          setCancelSelected(prev => {
                            const next = { ...prev };
                            if (next[item.id]) delete next[item.id];
                            else next[item.id] = { item, quantity: 1 };
                            return next;
                          });
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${isSelected
                          ? 'border-red-500 bg-red-50'
                          : 'border-transparent bg-white hover:border-gray-200'
                          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {/* Custom Checkbox */}
                        <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${isSelected
                          ? 'bg-red-500 border-red-500'
                          : 'border-gray-300'
                          }`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>

                        <div className="flex-1">
                          <p className={`text-xs font-black ${isSelected ? 'text-red-900' : 'text-gray-700'}`}>
                            {item.n}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                            {isSelected && cancelQuantity < Number(item.q ?? 0) ? (
                              <>
                                <span className="line-through">{cancelQuantity}</span>
                                <span className="ml-2 text-red-500">{remainingQuantity} remain</span>
                              </>
                            ) : (
                              <>Qty: {item.q}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isSelected && (
                            <div className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelSelected(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      quantity: Math.max(1, Number(prev[item.id]?.quantity ?? 1) - 1),
                                    },
                                  }));
                                }}
                                className="w-6 h-6 rounded-md bg-red-50 text-red-600 font-black"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={item.q}
                                value={cancelQuantity}
                                onChange={(e) => {
                                  const nextValue = Math.max(1, Math.min(Number(item.q ?? 1), Math.round(Number(e.target.value || 1))));
                                  setCancelSelected(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      quantity: nextValue,
                                    },
                                  }));
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-12 text-center bg-transparent text-xs font-black text-red-700 outline-none"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelSelected(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      quantity: Math.min(Number(item.q ?? 1), Number(prev[item.id]?.quantity ?? 1) + 1),
                                    },
                                  }));
                                }}
                                className="w-6 h-6 rounded-md bg-red-50 text-red-600 font-black"
                              >
                                +
                              </button>
                            </div>
                          )}
                          {isLoading && <Loader2 size={14} className="text-red-500 animate-spin" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-5 bg-white border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => { setShowCancelModal(false); setCancelSelected({}); }}
                  className="flex-1 py-3.5 rounded-xl text-xs font-black text-gray-500 hover:bg-gray-100 transition-colors uppercase tracking-widest"
                >
                  Back
                </button>
                <button
                  onClick={handleCancelSelected}
                  disabled={selectedCount === 0 || cancelBatchLoading}
                  className={`flex-[2] py-3.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${selectedCount > 0
                    ? 'bg-[#E53935] text-white hover:bg-red-700 shadow-lg shadow-red-500/30'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                >
                  {cancelBatchLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> Cancelling...</>
                  ) : (
                    <>Confirm Cancel ({selectedQuantityTotal})</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Password Modal for Tab Switch */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handlePasswordCancel}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="font-black text-lg text-gray-900 mb-2">Enter Password</h3>
              <p className="text-sm text-gray-500 mb-4">Password required to switch between Family Restaurant and Parcel</p>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePasswordSubmit();
                  if (e.key === 'Escape') handlePasswordCancel();
                }}
                placeholder="Enter password"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#E53935] focus:outline-none text-lg font-black tracking-widest text-center"
                autoFocus
              />
              {passwordError && (
                <p className="text-red-500 text-sm font-bold mt-2">{passwordError}</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                onClick={handlePasswordCancel}
                className="flex-1 py-3 rounded-xl text-sm font-black text-gray-500 hover:bg-gray-200 transition-colors uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 py-3 rounded-xl text-sm font-black bg-[#E53935] text-white hover:bg-red-700 transition-colors uppercase tracking-widest"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TERMINATE CONFIRMATION MODAL */}
      {showTerminateModal && selectedTable && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase text-red-500 tracking-wider">Terminate Session</p>
                <p className="text-base font-black text-gray-900 mt-0.5">
                  Table {outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : (selectedTable.displayName ?? selectedTable.number ?? selectedTable.id)}
                </p>
              </div>
              <button
                onClick={() => setShowTerminateModal(false)}
                className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-700 font-semibold">
                This will remove all items and free the table. Are you sure?
              </p>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                type="button"
                onClick={() => setShowTerminateModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-black text-gray-500 hover:bg-gray-200 transition-colors uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTerminateModal(false);
                  terminateTableSession();
                }}
                disabled={isTerminating}
                className={`flex-1 py-3 rounded-xl text-sm font-black bg-red-600 text-white hover:bg-red-700 transition-colors uppercase tracking-widest ${isTerminating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isTerminating ? 'Ending...' : 'Terminate'}
              </button>
            </div>
          </div>
        </div>
      )}

      <VariantPicker
        item={variantPickerItem}
        onSelect={handleVariantSelect}
        onClose={() => setVariantPickerItem(null)}
      />

    </div>
  );
};

export default CashierDashboard;

