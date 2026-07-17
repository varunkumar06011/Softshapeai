// ─────────────────────────────────────────────────────────────────────────────
// CashierDashboard — Full cashier POS with billing, settlement, and table management
// ─────────────────────────────────────────────────────────────────────────────
// The largest frontend component (~6500 lines) — complete cashier POS:
//   - Table grid with real-time status sync (Free/Occupied/Billing/Settled)
//   - Order management (create, add items, modify, cancel, transfer)
//   - KOT printing (kitchen/bar) via backend socket or offline print
//   - Bill generation with GST, discounts, service charges
//   - Settlement (Cash, Card, UPI, Split payment)
//   - Transaction history with date filtering
//   - Table swap and item transfer between tables
//   - Bill edit (modify settled bills with audit trail)
//   - Live order tracking with preparation timers
//   - Waiter call notifications
//   - Offline support with action queueing and sync
//   - Revenue dashboard with daily/hourly charts
//   - Item analytics integration
//   - Fullscreen mode for kiosk deployment
//
// Print jobs are emitted via backend socket (not direct QZ Tray) for
// centralized print management and offline reliability.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Table2, ClipboardList, ShoppingCart, Settings, LogOut, Bell, Search,
  ChevronDown, Clock, CheckCircle2, AlertCircle, User, MoreVertical, Plus, Minus,
  Trash2, CreditCard, Banknote, Smartphone, Split, History, ChefHat,
  Printer, X, Check, Zap, ArrowRight, Filter, Layers, ArrowUpRight, Loader2, Timer,
  TrendingUp, Users, Package, Wallet, ArrowRightLeft, Activity, BarChart3, MessageSquare, Calendar,
  Maximize2, Minimize2, Eye, Receipt, FileText, Tag, Sparkles, Flame
} from 'lucide-react';
import { StarIcon } from '../shared/icons/StarIcon';
import { useMenu } from '../context/MenuContext';
import { bulkImportSpecials } from '../services/menuService';
import { useTableSync, clearTerminatedTable } from '../services/tableSyncService';
import { saveTransaction, fetchTransactions, fetchTransactionsWithRetry, createOrder, updateOrderItems, updateOrderStatus, editBill, swapTable, transferItems, deleteTransaction, requestBilling, cancelOrderItem, cancelOrderItems, printBill, settleOrder, generateRequestId, reserveKotNumber, releaseKotNumber, confirmPayment } from '../services/orderApi';
import { buildFoodKOT, buildLiquorKOT, buildBillEscpos } from '../utils/escposFrontend';
import { printLocal, flushQueuedPrintJobs } from '../utils/printOffline';
import { isEdgeAvailable, edgeFetch, isEdgeLocalAuth } from '../services/edgeHealth';
import { recordSettlementAudit } from '../utils/settlementAuditLog';
import { getOfflineTransactions, markOfflineTransactionSynced, getOfflinePrintJobs } from '../utils/offlineDB';
// REMOVED: Direct QZ Tray calls deleted. Cashier now emits print jobs via backend socket.
import { calculateOrderTotal, calculateSessionBill, calculateTableBill, getTableItems, getAllOrderItems, getBillableItems, groupOrderItems } from '../shared/utils/billing';
import { validateTableIntegrity } from '../utils/syncInvariant';
import { filterMenuItems } from '../shared/utils/menuSearch';
import { useSocket } from '../hooks/useSocket';
import LiveTimer from '../shared/components/LiveTimer';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { getRestaurantConfig, refreshOutletConfigFromEdge } from '../utils/getRestaurantConfig';
import { getTenantScopedKey, getTablesCacheKey, getBarTablesCacheKey } from '../utils/cacheKeys';
import { safeGetJSON } from '../utils/safeParseJSON';
import { useAuth } from '../context/AuthContext';
import { useSyncStatus } from '../context/SyncStatusContext';
import OfflineStatusBar from '../shared/components/OfflineStatusBar';
import PendingActionsModal from '../shared/components/PendingActionsModal';
import { useBarTableSync, clearTerminatedTable as clearBarTerminatedTable } from '../services/barTableSyncService';
import { useBarMenuSync } from '../services/barMenuSyncService';
import { authService } from '../services/authService';
import ItemAnalytics from './ItemAnalytics';
import ExpenditureModule from './ExpenditureModule';
import XReportSection from './XReportSection';
import VenueSectionView from '../shared/components/VenueSectionView';
import { API_BASE, getAuthHeaders, apiFetch, isBackendReachable } from '../services/apiConfig';
import { httpFetch } from '../utils/httpClient';
import { getItemCategory } from '../utils/itemHelpers';
import QuantityPicker from '../shared/components/LiquorQtyPicker';
import DateInputButton from '../shared/components/DateInputButton';
import { getKolkataDateString, getKolkataMonthString, KOLKATA_TIME_ZONE, shiftKolkataDate, formatTxnDisplayId } from '../shared/utils/dateFormat';
import { getTableSectionLabel, getSectionBadgeColor } from '../utils/tableHelpers';
import { withOptimisticUpdate, logCriticalError, BackgroundQueue } from '../utils/resilience';
import { useSettlementGuards } from '../hooks/useSettlementGuards';
import { DeadLetterBanner } from '../components/DeadLetterBanner';

// Track KOT numbers that have been locally printed in this session to prevent
// double-printing the same KOT number (e.g. from rapid double-clicks or retries
// where the reservation returned the same number).
const _printedKotNumbers = new Set();

function getVenueTableLabel(sectionTag, tableNumber) {
  return String(tableNumber);
}

const TXN_PAGE_SIZE = 100;

const toFrontendTableStatus = (backendStatus) => {
  const map = {
    AVAILABLE: 'Free',
    OCCUPIED: 'Occupied',
    PREPARING: 'Preparing',
    READY: 'Ready',
    BILLING_REQUESTED: 'Waiting Bill',
    BILLING: 'Waiting Bill',
    RESERVED: 'Reserved',
    CLEANING: 'Cleaning',
  };
  return map[backendStatus] || 'Free';
};

// Convert DB kots relation (from tableInclude) to frontend kotHistory format
const normalizeKots = (kots) => {
  if (!Array.isArray(kots)) return [];
  return kots.map(kot => ({
    id: String(kot.kotNumber ?? kot.id ?? ''),
    time: kot.createdAt ? new Date(kot.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : null,
    items: (kot.items || []).map(ki => ({
      id: ki.menuItemId || ki.id,
      n: ki.name ?? ki.n,
      p: Number(ki.price ?? ki.p ?? 0),
      q: Number(ki.quantity ?? ki.q ?? 0),
      s: ki.status === 'CANCELLED' ? 'Cancelled' : (ki.s ?? 'KOT Sent'),
      orderItemId: ki.orderItemId,
      notes: ki.notes,
    })),
  }));
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
    kotHistory: isFreeWorkflow ? [] : ((Array.isArray(row.kots) && row.kots.length > 0) ? normalizeKots(row.kots) : (Array.isArray(row.kotHistory) ? row.kotHistory : [])),
    currentBill: isFreeWorkflow ? 0 : Number(row.currentBill ?? 0),
    activeOrder: isFreeWorkflow ? null : ((row.orders?.[0] && row.orders[0].tableId === row.id) ? row.orders[0] : (row.activeOrder || null)),
    billNumber: isFreeWorkflow ? null : (row.orders?.[0]?.billNumber ?? row.activeOrder?.billNumber ?? null),
    ...(existing ? { displayName: existing.displayName, name: existing.name } : {}),
  };
};

const buildWalkInTables = () => Array.from({ length: 20 }, (_, i) => ({
  id: `W${i + 1}`,
  number: i + 1,
  backendId: null,
  isWalkIn: true,
  status: 'Free',
  sectionId: null,
  section: { restaurantId: getCurrentRestaurantId(), name: 'Walk-in' },
  kotHistory: [],
  currentBill: 0,
  activeOrder: null,
}));

// Source sets and sectionTag→source mapping are now built dynamically from fetchedSections
// (see sectionTagToSource, barSources, restaurantSources memos inside the component)

// Bar-like venue types — expanded to include all bar-related venue types
const BAR_LIKE_VENUE_TYPES = ['BAR', 'PDR', 'CONFERENCE', 'BANQUET', 'ROOM_SERVICE', 'BAR_LOUNGE', 'BREWERY', 'PUB', 'LOUNGE', 'NIGHTCLUB', 'WINE_BAR', 'COCKTAIL_BAR'];
function isBarLikeVenue(venueType) {
  if (!venueType) return false;
  return BAR_LIKE_VENUE_TYPES.includes(venueType.toUpperCase());
}

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
  const name = String(item.n || item.name || '').toLowerCase();
  const category = String(item.c || item.category || '').toLowerCase();
  const desc = String(item.desc || item.description || '').toLowerCase();

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
        <mark key={i} className="bg-yellow-100 text-[#1E3A8A] font-black rounded-sm px-0.5">
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
  const { user, restaurant, setRestaurant } = useAuth();
  const { isOffline, hasPending, pendingCount, lastSyncAt, triggerSync } = useSyncStatus();
  const isEdgeLocal = isEdgeLocalAuth();
  const settlementQueueRef = useRef(null);
  if (!settlementQueueRef.current) settlementQueueRef.current = new BackgroundQueue('settlement');
  const enabledModules = restaurant?.enabledModules || {};
  const defaultOutlet = enabledModules.bar && enabledModules.food ? 'both'
    : enabledModules.bar && !enabledModules.food ? 'bar'
    : 'restaurant';
  const [activeOutlet, setActiveOutlet] = useState(() => {
    const saved = localStorage.getItem(getTenantScopedKey('cashier_active_outlet'));
    return saved || defaultOutlet;
  });
  useEffect(() => {
    localStorage.setItem(getTenantScopedKey('cashier_active_outlet'), activeOutlet);
  }, [activeOutlet]);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem(getTenantScopedKey('cashier_active_tab')) || 'dashboard');
  const [tableSubCategory, setTableSubCategory] = useState(() => {
    const saved = localStorage.getItem(getTenantScopedKey('softshape_selected_subcategory'));
    if (saved) return saved;
    return '';
  });
  const [selectedPDRRoom, setSelectedPDRRoom] = useState(() => {
    const saved = localStorage.getItem(getTenantScopedKey('cashier_selected_pdr_room'));
    return saved ? Number(saved) : null;
  }); // 1-4
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedMenuType, setSelectedMenuType] = useState('ALL');
  const [activeDiet, setActiveDiet] = useState('All');
  const [selectedOrderPlatform, setSelectedOrderPlatform] = useState('DINE_IN');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingTabSwitch, setPendingTabSwitch] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleTabSwitch = (tabId) => {
    setTableSubCategory(tabId);
    setSelectedPDRRoom(null);
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

  // Fallback: refresh restaurantType/enabledModules and live permissions for existing sessions
  const [userPermissions, setUserPermissions] = useState({});
  useEffect(() => {
    if (isEdgeLocal) return; // Skip cloud auth call for PIN users — cloud rejects fake token
    httpFetch(`${API_BASE}/api/auth/me`, { credentials: 'include', headers: getAuthHeaders() }, { retries: 1 })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.permissions) setUserPermissions(data.permissions);
        if (!restaurant?.enabledModules && data?.restaurant?.enabledModules) {
          // Merge enabledModules into AuthContext so all subscribed components re-render.
          setRestaurant({ ...restaurant, ...data.restaurant });
        }
      })
      .catch(() => {});
  }, []);

  // Fetch sections dynamically for tab labels — cached locally for instant load
  const SECTIONS_CACHE_KEY = getTenantScopedKey('cashier_sections_cache');
  const [fetchedSections, setFetchedSections] = useState(() => {
    try {
      const cached = localStorage.getItem(SECTIONS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [sectionsFetchKey, setSectionsFetchKey] = useState(0);
  const [sectionsLoading, setSectionsLoading] = useState(() => {
    try {
      const cached = localStorage.getItem(SECTIONS_CACHE_KEY);
      return !cached || JSON.parse(cached).length === 0;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    const fetchSections = async () => {
      // Edge-first: try edge server first, fall back to cloud
      const useEdgeDirect = isEdgeLocal;
      if (useEdgeDirect || await isEdgeAvailable()) {
        try {
          const data = await edgeFetch('/api/edge/sections');
          const rawSections = Array.isArray(data) ? data : data?.sections || [];
          const sections = rawSections.map(s => ({
            ...s,
            sectionTag: s.sectionTag || s.tables?.[0]?.sectionTag || null,
          }));
          setFetchedSections(sections);
          try {
            localStorage.setItem(SECTIONS_CACHE_KEY, JSON.stringify(sections));
          } catch (e) {
            console.warn('[fetchedSections] failed to cache sections:', e);
          }
        } catch (err) {
          console.warn('[fetchedSections] edge fetch failed, trying cloud:', err.message);
          // Fall back to cloud if edge fails
          try {
            const r = await httpFetch(`${API_BASE}/api/venue/sections`, {
              credentials: 'include',
              headers: getAuthHeaders(),
            }, { retries: 1 });
            if (!r.ok) {
              console.error('[fetchedSections] cloud API error:', r.status, r.statusText);
              setFetchedSections([]);
              return;
            }
            const data = await r.json();
            const rawSections = Array.isArray(data) ? data : data?.sections || [];
            const sections = rawSections.map(s => ({
              ...s,
              sectionTag: s.sectionTag || s.tables?.[0]?.sectionTag || null,
            }));
            setFetchedSections(sections);
            try {
              localStorage.setItem(SECTIONS_CACHE_KEY, JSON.stringify(sections));
            } catch (e) {
              console.warn('[fetchedSections] failed to cache sections:', e);
            }
          } catch (err) {
            console.error('[fetchedSections] cloud fetch failed:', err);
          }
        } finally {
          setSectionsLoading(false);
        }
        return;
      }
      // Edge unavailable: use cloud directly
      try {
        const r = await httpFetch(`${API_BASE}/api/venue/sections`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        }, { retries: 1 });
        if (!r.ok) {
          console.error('[fetchedSections] API error:', r.status, r.statusText);
          setFetchedSections([]);
          return;
        }
        const data = await r.json();
        const rawSections = Array.isArray(data) ? data : data?.sections || [];
        const sections = rawSections.map(s => ({
          ...s,
          sectionTag: s.sectionTag || s.tables?.[0]?.sectionTag || null,
        }));
        setFetchedSections(sections);
        try {
          localStorage.setItem(SECTIONS_CACHE_KEY, JSON.stringify(sections));
        } catch (e) {
          console.warn('[fetchedSections] failed to cache sections:', e);
        }
      } catch (err) {
        console.error('[fetchedSections] fetch failed:', err);
      } finally {
        setSectionsLoading(false);
      }
    };
    fetchSections();
  }, [SECTIONS_CACHE_KEY, sectionsFetchKey]);

  // Build dynamic source maps from fetchedSections (replaces hardcoded constants)
  const sectionTagToSource = useMemo(() => {
    const map = {};
    for (const section of fetchedSections) {
      if (section.sectionTag) {
        const sourceKey = section.sectionTag.startsWith('venue-')
          ? section.sectionTag.slice(6)
          : section.sectionTag;
        map[section.sectionTag] = sourceKey;
      }
    }
    return map;
  }, [fetchedSections]);

  const barSources = useMemo(() => {
    const set = new Set();
    for (const section of fetchedSections) {
      if (isBarLikeVenue(section.venue?.venueType)) {
        set.add(sectionTagToSource[section.sectionTag] || section.name);
      }
    }
    return set;
  }, [fetchedSections, sectionTagToSource]);

  const restaurantSources = useMemo(() => {
    const set = new Set();
    for (const section of fetchedSections) {
      if (!isBarLikeVenue(section.venue?.venueType)) {
        set.add(sectionTagToSource[section.sectionTag] || section.name);
      }
    }
    return set;
  }, [fetchedSections, sectionTagToSource]);

  // Refs to keep section mappings current inside loadTransactions (stale closure fix)
  const sectionTagToSourceRef = useRef(sectionTagToSource);
  const fetchedSectionsRef = useRef(fetchedSections);
  const barSourcesRef = useRef(barSources);
  const restaurantSourcesRef = useRef(restaurantSources);

  useEffect(() => { sectionTagToSourceRef.current = sectionTagToSource; }, [sectionTagToSource]);
  useEffect(() => { fetchedSectionsRef.current = fetchedSections; }, [fetchedSections]);
  useEffect(() => { barSourcesRef.current = barSources; }, [barSources]);
  useEffect(() => { restaurantSourcesRef.current = restaurantSources; }, [restaurantSources]);

  // Set initial tableSubCategory from first fetched section once loaded
  useEffect(() => {
    if (!tableSubCategory && fetchedSections.length > 0) {
      const firstSection = fetchedSections.find(s => {
        const sectionOutlet = isBarLikeVenue(s.venue?.venueType) ? 'bar' : 'restaurant';
        if (activeOutlet === 'both') return true;
        return sectionOutlet === activeOutlet;
      }) || fetchedSections[0];
      setTableSubCategory(sectionTagToSource[firstSection.sectionTag] || firstSection.name);
    }
  }, [fetchedSections, tableSubCategory, activeOutlet, sectionTagToSource]);

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
  const [expandedNoteItemId, setExpandedNoteItemId] = useState(null);
  const [activeNoteItemId, setActiveNoteItemId] = useState(null);
  const [noteInputValue, setNoteInputValue] = useState('');
  const [editQtyItemId, setEditQtyItemId] = useState(null);
  const [editQtyValue, setEditQtyValue] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showTableModal, setShowTableModal] = useState(false);
  const [isModalDataLoading, setIsModalDataLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSelected, setCancelSelected] = useState({});
  const [cancelBatchLoading, setCancelBatchLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState({});
  const [isKotSending, setIsKotSending] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const isSubmittingKotRef = useRef(false);
  const addItemCooldownRef = useRef({}); // key: item.id or item.n → last add timestamp
  const kotRequestIdRef = useRef(null);
  const lastKotCartSignatureRef = useRef(null);
  const lastConfirmedItemsRef = useRef([]);
  const fetchGenerationRef = useRef(0);
  const loadTxnsGenerationRef = useRef(0);
  const [isKotSuccess, setIsKotSuccess] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showLiquorQtyPicker, setShowLiquorQtyPicker] = useState(false);
  const [liquorQtyItem, setLiquorQtyItem] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('CASH');
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);
  const [showConfirmPaymentModal, setShowConfirmPaymentModal] = useState(false);
  const [confirmPaymentTxn, setConfirmPaymentTxn] = useState(null);
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState(null);
  const [confirmCashInput, setConfirmCashInput] = useState('');
  const [confirmCardInput, setConfirmCardInput] = useState('');
  const [confirmTipInput, setConfirmTipInput] = useState('');
  const [showSpecialsModal, setShowSpecialsModal] = useState(false);
  const [specialsRows, setSpecialsRows] = useState([{ name: '', price: '', category: 'Main Course', isVeg: true }]);
  const [specialsSaving, setSpecialsSaving] = useState(false);
  const [specialsError, setSpecialsError] = useState(null);
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false);
  const [bulkConfirmProgress, setBulkConfirmProgress] = useState({ current: 0, total: 0 });
  const [bulkConfirmResults, setBulkConfirmResults] = useState(null);
  const [bulkConfirmSaving, setBulkConfirmSaving] = useState(false);
  const [tipInput, setTipInput] = useState('');
  const [otherCashInput, setOtherCashInput] = useState('');
  const [otherCardInput, setOtherCardInput] = useState('');
  const [selectedSettleMethod, setSelectedSettleMethod] = useState(null);
  const [isPrintingBill, setIsPrintingBill] = useState(false);
  const isPrintingBillRef = useRef(false);
  const isSubmittingPaymentRef = useRef(false);
  const [isSettling, setIsSettling] = useState(false);
  const [isReprintingBill, setIsReprintingBill] = useState(false);
  const [pendingPrintCount, setPendingPrintCount] = useState(0);
  const [isRetryingPrint, setIsRetryingPrint] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  // Settlement guards: persisted order/table IDs that have already been settled.
  const {
    settledOrderIds,
    settledTableIds,
    settledTableIdsRef,
    setSettledOrderIds,
    setSettledTableIds,
  } = useSettlementGuards(hasPending, lastSyncAt);

  const recentlyTerminatedRef = useRef((() => {
    try {
      const raw = localStorage.getItem(getTenantScopedKey('cashier_recently_terminated'));
      const map = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      // 30-second TTL: keeps terminated tables hidden briefly to prevent flicker
      Object.keys(map).forEach(k => { if (now - map[k] > 30000) delete map[k]; });
      return map;
    } catch { return {}; }
  })());
  const terminatedTableIdsRef = useRef(new Set());
  const syncPauseUntilRef = useRef(0);
  // --- Socket request dedup: prevents feedback loop when our own KOT emit comes back ---
  const processedSocketRequestIds = useRef(new Set());
  // --- Table click cooldown: prevents socket echo from flickering table right after click ---
  const tableClickCooldownRef = useRef(new Map());
  // --- Concurrent fetch guard for transactions ---
  const txnFetchingRef = useRef(false);
  // --- Bill-printed guard ---
  // Primary flag: table IDs where bill was printed but settlement not yet confirmed.
  // This is the single source of truth for the Settlement button and socket guards.
  const [billPrintedTableIds, setBillPrintedTableIds] = useState(() => {
    // Restore any bill_printed state from localStorage on mount
    try {
      const stored = localStorage.getItem(getTenantScopedKey('cashier_bill_printed_tables'));
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const billPrintedTableIdsRef = useRef(billPrintedTableIds);
  useEffect(() => { billPrintedTableIdsRef.current = billPrintedTableIds; }, [billPrintedTableIds]);
  // Per-table cooldown: tableBackendId -> timestamp until which socket updates are ignored
  const billPrintCooldownRef = useRef(new Map()); // Map<tableBackendId, number>
  const lastKnownBillRef = useRef(0); // monotonically increasing — never go backwards
  const billItemsSnapshotRef = useRef([]); // snapshot of billable items before print-bill
  const cancelInProgressRef = useRef(false); // blocks print-bill while cancel API is in flight
  const lastAnyItemAddedRef = useRef(0); // global 900ms cooldown across all item adds
  const lsWriteTimerRef = useRef(null);
  const lastFetchUpdateRef = useRef({ backendId: null, ts: 0 }); // guards selectedTable against stale activeTables sync

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
    if (table.isWalkIn || !table.backendId) return getTenantScopedKey('cashier_cart_walkin');
    if (table.isExtra) return getTenantScopedKey(`cashier_cart_extra_${table.id}`);
    return getTenantScopedKey(`cashier_cart_${table.backendId}`);
  };

  const clearCashierTableCache = (table) => {
    localStorage.removeItem(getTenantScopedKey('cashier_selected_table'));
    if (table?.backendId) {
      localStorage.removeItem(getTenantScopedKey(`cashier_cart_${table.backendId}`));
    }
    if (table?.isExtra) {
      localStorage.removeItem(getTenantScopedKey(`cashier_cart_extra_${table.id}`));
    }
    localStorage.removeItem(getTenantScopedKey('cashier_cart_walkin'));
    localStorage.removeItem('cashier_cart');
  };

  // ── Moved up: these must be declared before activeTablesRef ──
  const { menuItems, categories, loading: restaurantMenuLoading, refreshMenu } = useMenu();

  // FREEZE: skip table updates when bill is printed (not yet settled) or during KOT submission
  const shouldSkipSyncUpdate = useCallback((t) => {
    if (!t?.backendId) return false;
    if (isSubmittingKotRef.current) return true;
    if (billPrintedTableIdsRef.current.has(t.backendId) && !settledTableIdsRef.current.has(t.backendId)) return true;
    return false;
  }, []);

  const { tables, setTables, refetch: refetchRestaurantTables } = useTableSync({ shouldSkipTableUpdate: shouldSkipSyncUpdate });

  const { tables: barTables, setTables: setBarTables, refetch: refetchBarTables } = useBarTableSync({ shouldSkipTableUpdate: shouldSkipSyncUpdate });
  const { menuItems: barMenuItems, loading: barMenuLoading } = useBarMenuSync();
  const menuLoading = activeOutlet === 'bar' || activeOutlet === 'both' ? barMenuLoading : restaurantMenuLoading;
  const [barMenuTab, setBarMenuTab] = useState('food');
  const [extraTables, setExtraTables] = useState(() => {
    return safeGetJSON(getTenantScopedKey('cashier_extra_tables'), []);
  });

  // Derived — based on enabledModules
  // Deduplicate on backendId ?? id: /api/bar/tables and /api/tables return the same
  // unfiltered dataset, so a naive spread duplicates every table when outlet is 'both'.
  const activeTables = activeOutlet === 'bar' ? barTables
    : activeOutlet === 'both'
      ? Array.from(new Map([...barTables, ...tables].map(t => [t.backendId ?? t.id, t])).values())
      : tables;
  const setActiveTables = activeOutlet === 'bar' ? setBarTables
    : activeOutlet === 'both'
      ? (updater, options) => {
          setTables(updater, options);
          setBarTables(updater, options);
        }
      : setTables;
  const activeRestaurantId = getCurrentRestaurantId();
  const [configVersion, setConfigVersion] = useState(0);
  useEffect(() => {
    const handler = () => setConfigVersion(v => v + 1);
    window.addEventListener('ss_restaurant_config_changed', handler);
    return () => window.removeEventListener('ss_restaurant_config_changed', handler);
  }, []);
  const restaurantConfig = useMemo(() => getRestaurantConfig(), [configVersion]);

  // Periodically refresh outlet config from edge server so billing.js
  // always uses current GST rates, printer config, etc.
  useEffect(() => {
    refreshOutletConfigFromEdge();
    const interval = setInterval(refreshOutletConfigFromEdge, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Refetch sections when the active restaurant/outlet changes
  useEffect(() => {
    setSectionsFetchKey(k => k + 1);
  }, [activeRestaurantId]);

  const socket = useSocket(activeRestaurantId);
  // ── End moved block ──

  const activeTablesRef = useRef(activeTables);
  useEffect(() => { activeTablesRef.current = activeTables; }, [activeTables]);

  // Persist extraTables to localStorage so they survive page refresh
  useEffect(() => {
    try { localStorage.setItem(getTenantScopedKey('cashier_extra_tables'), JSON.stringify(extraTables)); } catch {}
  }, [extraTables]);

  // On mount: purge any extra tables that were recently terminated but survived in localStorage
  useEffect(() => {
    setExtraTables(prev => {
      const filtered = prev.filter(et => {
        const termTs = recentlyTerminatedRef.current[et.id];
        return !(termTs && Date.now() - termTs < 5000);
      });
      return filtered;
    });
    // Also clean up stale entries in localStorage itself so they don't grow forever
    try {
      const raw = localStorage.getItem(getTenantScopedKey('cashier_recently_terminated'));
      const map = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      let changed = false;
      Object.keys(map).forEach(k => { if (now - map[k] > 30000) { delete map[k]; changed = true; } });
      if (changed) localStorage.setItem(getTenantScopedKey('cashier_recently_terminated'), JSON.stringify(map));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selectedTable in sync with extraTables — extra table state (activeOrder.id, items, status)
  // is updated via setExtraTables (e.g. after createOrder resolves), but selectedTable is a separate
  // snapshot. Without this sync, handleFinalBill can't find the real orderId and modal shows stale data.
  useEffect(() => {
    if (!selectedTable?.isExtra) return;
    // Guard: skip during KOT submission to prevent duplicate items in display cart
    if (isSubmittingKotRef.current) return;
    const fresh = extraTables.find(et => et.id === selectedTable.id);
    if (!fresh) return;
    // Only update if something meaningful changed to avoid infinite loops
    if (
      fresh.activeOrder?.id !== selectedTable.activeOrder?.id ||
      fresh.status !== selectedTable.status ||
      fresh.currentBill !== selectedTable.currentBill ||
      (fresh.activeOrder?.items?.length ?? 0) !== (selectedTable.activeOrder?.items?.length ?? 0)
    ) {
      setSelectedTable(fresh);
    }
  }, [extraTables]); // eslint-disable-line react-hooks/exhaustive-deps

  // DEBUG: trace modal render state for extra tables
  useEffect(() => {
    if (!showTableModal || !selectedTable?.isExtra) return;
    const items = getAllOrderItems(selectedTable);
    console.log('[DebugModal] selectedTable.id:', selectedTable.id, 'activeOrder?.id:', selectedTable.activeOrder?.id, 'items.length:', items.length, 'firstItem:', items[0] || null, 'currentBill:', selectedTable.currentBill);
  }, [showTableModal, selectedTable?.activeOrder?.id, selectedTable?.activeOrder?.items?.length, selectedTable?.currentBill]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: determine if an incoming table update should be blocked
  const shouldBlockTableUpdate = (tableId, incomingStatus) => {
    // --- Recently terminated: block non-Free events for 5s, but always allow Free/AVAILABLE ---
    const termTs = recentlyTerminatedRef.current[tableId];
    if (termTs && Date.now() - termTs < 5000) {
      const freeStatuses = new Set(['Free', 'AVAILABLE', 'TERMINATED', 'CLEANING', 'Cleaning']);
      const mapped = toFrontendTableStatus(incomingStatus);
      if (!freeStatuses.has(incomingStatus) && !freeStatuses.has(mapped)) return true;
    }

    // --- Bill printed but not yet settled: block any status that would revert to non-Waiting-Bill ---
    if (billPrintedTableIdsRef.current.has(tableId)) {
      // Only allow the table to go Free/AVAILABLE (settlement done by another tab) or stay Waiting Bill
      const forward = new Set(['Free', 'AVAILABLE', 'TERMINATED', 'CLEANING', 'Cleaning', 'Waiting Bill', 'BILLING_REQUESTED']);
      const mapped = toFrontendTableStatus(incomingStatus);
      if (incomingStatus && !forward.has(incomingStatus) && !forward.has(mapped)) return true;
    }

    if (!settledTableIdsRef.current.has(tableId)) return false;
    // During 5s pause after settlement: block non-Free updates, allow Free/AVAILABLE through
    if (Date.now() < syncPauseUntilRef.current) {
      const freeStatuses = new Set(['Free', 'AVAILABLE', 'TERMINATED', 'CLEANING', 'Cleaning']);
      const mapped = toFrontendTableStatus(incomingStatus);
      return !freeStatuses.has(incomingStatus) && !freeStatuses.has(mapped);
    }
    // After pause: if table is already Free locally, a new session may have started — allow
    const localTable = [...(activeTablesRef.current || [])]
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

  const [isCartMinimized, setIsCartMinimized] = useState(true);
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Persist selections to localStorage (debounced to avoid micro-stutters)
  // NEVER save activeOrder/items — prevents stale/wrong items from leaking on refresh
  useEffect(() => {
    if (lsWriteTimerRef.current) clearTimeout(lsWriteTimerRef.current);
    if (selectedTable) {
      lsWriteTimerRef.current = setTimeout(() => {
        const { activeOrder, items, kotHistory, ...identityOnly } = selectedTable;
        const toSave = {
          ...identityOnly,
          activeOrder: activeOrder ? { id: activeOrder.id, totalAmount: activeOrder.totalAmount } : null,
          kotHistory: [],
          currentBill: 0,
        };
        localStorage.setItem(getTenantScopedKey('cashier_selected_table'), JSON.stringify(toSave));
      }, 300);
    } else {
      localStorage.removeItem(getTenantScopedKey('cashier_selected_table'));
    }
    return () => clearTimeout(lsWriteTimerRef.current);
  }, [selectedTable]);

  useEffect(() => {
    localStorage.setItem(getTenantScopedKey('softshape_selected_subcategory'), tableSubCategory);
  }, [tableSubCategory]);

  // Cross-tab sync: update venue selection when changed in another tab (Captain / Cashier)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === getTenantScopedKey('softshape_selected_subcategory') && e.newValue && e.newValue !== tableSubCategory) {
        setTableSubCategory(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [tableSubCategory]);

  useEffect(() => {
    if (selectedPDRRoom) {
      localStorage.setItem(getTenantScopedKey('cashier_selected_pdr_room'), String(selectedPDRRoom));
    } else {
      localStorage.removeItem(getTenantScopedKey('cashier_selected_pdr_room'));
    }
  }, [selectedPDRRoom]);

  // Cart is ephemeral — not persisted to localStorage. Clear any legacy keys.
  useEffect(() => {
    localStorage.removeItem('cashier_cart');
  }, []);

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

  // Poll pending offline print jobs so the Retry Print button appears when needed
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const jobs = await getOfflinePrintJobs();
        const pending = (jobs || []).filter(j => j.status === 'pending').length;
        if (mounted) setPendingPrintCount(pending);
      } catch { /* IndexedDB may not be available */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const handleRetryPrint = async () => {
    setIsRetryingPrint(true);
    try {
      const result = await flushQueuedPrintJobs();
      if (result.flushed > 0) {
        addNotification('Print Retry', `${result.flushed} print job(s) sent to printer.`, 'success');
      } else if (result.failed > 0) {
        addNotification('Print Retry', `${result.failed} job(s) still queued — no printer available.`, 'warning');
      } else {
        addNotification('Print Retry', 'No pending print jobs found.', 'info');
      }
      setPendingPrintCount(0);
    } catch (err) {
      addNotification('Print Retry Failed', err.message || 'Could not retry print jobs.', 'error');
    } finally {
      setIsRetryingPrint(false);
    }
  };

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

  const rawSubtotal = useMemo(() => {
    let items = [];
    if (activeTab === 'pos' && !selectedTable) {
      items = cart;
    } else if (selectedTable) {
      const committedItems = getTableItems(selectedTable);
      items = [...committedItems, ...cart];
    }
    return items
      .filter(i => !i.removedFromBill && !removedItemIds.includes(i.id))
      .reduce((acc, item) => acc + (Number(item.p || 0) * Number(item.q || 1)), 0);
  }, [selectedTable, activeTab, cart, removedItemIds]);

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

  const TX_CACHE_KEY = `softshape_transactions_${activeRestaurantId}_${activeOutlet}_${getKolkataDateString()}`;

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
  const txnCustomDateRef = useRef('');
  const lastReconnectRefetchRef = useRef(0); // Debounce reconnect-triggered refetches
  const [txnMethodFilter, setTxnMethodFilter] = useState('all'); // 'all' | 'CASH' | 'UPI' | 'CARD'
  const [txnSourceFilter, setTxnSourceFilter] = useState('all');
  const [txnStatusFilter, setTxnStatusFilter] = useState('all');
  const [txnSearch, setTxnSearch] = useState('');
  const [txnPage, setTxnPage] = useState(1);
  const [activeVenueFilter, setActiveVenueFilter] = useState('all');

  // Expenditure summary for the currently selected dashboard date (used for Expenditures + Final Amount tiles)
  const [expenditureSummary, setExpenditureSummary] = useState({ totalAmount: 0, count: 0 });

  function formatBillNumber(txn) {
    // Bill No column: prefer billNumber ("1", "2"...), fall back to plain txnNumber (no TXN- prefix)
    if (txn?.billNumber) return txn.billNumber;
    if (txn?.txnNumber) return String(txn.txnNumber);
    return '—';
  }

  const [txnInitialLoaded, setTxnInitialLoaded] = useState(false);

  // Load expenditure total for the same date so the dashboard can show Expenditures + Final Amount tiles
  const loadExpenditureSummary = useCallback(async (dateParam) => {
    if (!dateParam) {
      setExpenditureSummary({ totalAmount: 0, count: 0 });
      return;
    }
    // Expenditures are cloud-only — skip for edge-local (PIN) users
    if (isEdgeLocalAuth()) {
      setExpenditureSummary({ totalAmount: 0, count: 0 });
      return;
    }
    try {
      const summary = await apiFetch(`/api/expenditures/today-summary?date=${dateParam}`);
      setExpenditureSummary(summary || { totalAmount: 0, count: 0 });
    } catch (err) {
      console.error('[ExpenditureSummary] Failed to load:', err);
      setExpenditureSummary({ totalAmount: 0, count: 0 });
    }
  }, []);

  const loadTransactions = useCallback(async (filter = 'today', dateOverride = null, opts = {}) => {
    const { silent = false, force = false } = opts;
    if (txnFetchingRef.current && !force) return;
    txnFetchingRef.current = true;
    const myGeneration = ++loadTxnsGenerationRef.current; // increment BEFORE any await
    if (!silent) setTxnsLoading(true);
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

      const restaurantIds = [getCurrentRestaurantId()];

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
        const sectionById = fetchedSectionsRef.current.find(s => s.id === txn.sectionId);
        const source = sectionTagToSourceRef.current[txn.sectionTag]
          || (sectionById && (sectionTagToSourceRef.current[sectionById.sectionTag] || sectionById.name))
          || (txn.sectionTag && txn.sectionTag.startsWith('venue-bar') ? 'bar'
            : txn.sectionTag && txn.sectionTag.startsWith('venue-restaurant') ? 'restaurant'
            : txn.sectionTag || activeOutlet);

        return {
          id: txn.id,
          orderId: txn.orderId || null,
          txnNumber: txn.txnNumber || null,
          billNumber: txn.billNumber || null,
          displayId: formatBillNumber(txn),
          kot: txn.orderId ? `ORD-${txn.orderId.slice(-6).toUpperCase()}` : '—',
          status: txn.status || 'COMPLETED',
          rawStatus: txn.status || 'COMPLETED',
          amount: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
          grandTotal: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
          subtotal,
          discountPercent,
          discountAmount,
          cgst,
          sgst,
          roundOff: Number(txn.roundOff ?? 0),
          tipAmount: Number(txn.tipAmount ?? 0),
          time: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
          date: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
          timestamp: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? 0 : d.getTime(); } catch { return 0; } })(),
          items: txn.itemCount > 0
            ? txn.itemCount
            : Array.isArray(txn.items) && txn.items.length > 0
              ? txn.items.length
              : 0,
          itemsList: txn.items || [],
          captainId: txn.captainId || 'CASHIER',
          // Prefer backend captainName, then captainId, then fallback
          captainName: txn.captainName
            || (txn.captainId && txn.captainId !== 'CASHIER' ? txn.captainId : 'Head Cashier'),
          method: txn.method || 'OTHER',
          tableNumber: txn.tableNumber || null,
          // Derive display label: B=bar, C=conference, R=rooms, PDR=pdr, P=GoBox, BP=bar-parcel, F=family, T=restaurant
          tableDisplayName: (() => {
            if (txn.tableLabel) return txn.tableLabel;
            const num = txn.tableNumber;
            if (!num) return '—';
            // Look up section from fetchedSections to determine venue type
            const section = fetchedSectionsRef.current.find(s => s.sectionTag === txn.sectionTag);
            const venueType = section?.venue?.venueType;
            if (isBarLikeVenue(venueType)) return `B${num}`;
            return `T${num}`;
          })(),
          source,
          sectionTag: txn.sectionTag || null,
          restaurantId: txn._sourceRestaurantId,
        };
      });

      // Filter by active outlet: bar sees bar sources, restaurant sees restaurant sources, both sees all
      // Transactions without a sectionTag or with an orphaned sectionTag are always included —
      // the backend already filters by restaurantId.
      const isolated = mapped.filter(txn => {
        if (!txn.sectionTag) return true;
        if (activeOutlet === 'bar') return barSourcesRef.current.has(txn.source) || !restaurantSourcesRef.current.has(txn.source);
        if (activeOutlet === 'restaurant') return restaurantSourcesRef.current.has(txn.source) || !barSourcesRef.current.has(txn.source);
        return true; // 'both' sees everything
      });

      // Sort by billNumber numerically (ascending) when viewing a specific date; fall back to paidAt for legacy records
      const sorted = [...isolated].sort((a, b) => {
        const aBill = a.billNumber != null ? parseInt(a.billNumber, 10) : null;
        const bBill = b.billNumber != null ? parseInt(b.billNumber, 10) : null;
        if (aBill != null && bBill != null) return aBill - bBill;
        if (aBill != null) return -1;
        if (bBill != null) return 1;
        const aTxn = a.txnNumber != null ? Number(a.txnNumber) : null;
        const bTxn = b.txnNumber != null ? Number(b.txnNumber) : null;
        if (aTxn != null && bTxn != null) return aTxn - bTxn;
        if (aTxn != null) return -1;
        if (bTxn != null) return 1;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
      // Merge unsynced offline settlements so they appear in history without internet
      const serverOrderIds = new Set(sorted.map(t => t.orderId).filter(Boolean));
      let offlineTxns = [];
      try {
        const allOffline = await getOfflineTransactions();
        offlineTxns = allOffline
          .filter(t => !t.synced && isTxnInDateFilter(t.createdAt))
          .map(mapOfflineTransaction)
          .filter(t => {
            if (!t.sectionTag) return true;
            if (activeOutlet === 'bar') return barSourcesRef.current.has(t.source);
            if (activeOutlet === 'restaurant') return restaurantSourcesRef.current.has(t.source);
            return true;
          })
          // Drop offline entries whose order already has a server transaction
          .filter(t => !serverOrderIds.has(t.orderId));
      } catch (e) {
        console.warn('[Transactions] Failed to load offline transactions:', e);
      }

      const merged = [...offlineTxns, ...sorted].sort((a, b) => {
        const aBill = a.billNumber != null ? parseInt(a.billNumber, 10) : null;
        const bBill = b.billNumber != null ? parseInt(b.billNumber, 10) : null;
        if (aBill != null && bBill != null) return aBill - bBill;
        if (aBill != null) return -1;
        if (bBill != null) return 1;
        const aTxn = a.txnNumber != null ? Number(a.txnNumber) : null;
        const bTxn = b.txnNumber != null ? Number(b.txnNumber) : null;
        if (aTxn != null && bTxn != null) return aTxn - bTxn;
        if (aTxn != null) return -1;
        if (bTxn != null) return 1;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

      // ONLY apply result if this is still the latest call
      if (myGeneration !== loadTxnsGenerationRef.current) {
        console.log(`[Transactions] Discarding stale gen=${myGeneration}, current=${loadTxnsGenerationRef.current}`);
        return;
      }
      console.log(`[Transactions] Applying gen=${myGeneration}, total=${merged.length} (${offlineTxns.length} offline)`);
      // Replace entirely — only preserve optimistic (socket-added / offline, not yet server-confirmed) txns
      setPastTransactions(prev => {
        const newIds = new Set(merged.map(t => t.id));
        const preserved = prev.filter(t => !newIds.has(t.id) && t._optimistic === true);
        return [...merged, ...preserved];
      });
      if (!txnInitialLoaded) setTxnInitialLoaded(true);

      // Load expenditure total for the same date so the dashboard can show Expenditures + Final Amount tiles
      loadExpenditureSummary(dateParam);

      // Only cache today's data + add version stamp
      if (filter === 'today') {
        localStorage.setItem(TX_CACHE_KEY, JSON.stringify(merged));
        localStorage.setItem(`${TX_CACHE_KEY}_version`, Date.now().toString());
      }
    } catch (err) {
      if (myGeneration !== loadTxnsGenerationRef.current) return; // stale error, discard
      console.error('[Transactions] Critical fetch failure:', err);
      // Fallback to cache, but still overlay unsynced offline settlements
      const cachedRaw = localStorage.getItem(TX_CACHE_KEY);
      const cached = cachedRaw ? JSON.parse(cachedRaw) : [];
      try {
        const allOffline = await getOfflineTransactions();
        const cachedOrderIds = new Set(cached.map(t => t.orderId).filter(Boolean));
        const offlineTxns = allOffline
          .filter(t => !t.synced && isTxnInDateFilter(t.createdAt))
          .map(mapOfflineTransaction)
          .filter(t => !cachedOrderIds.has(t.orderId))
          .filter(t => {
            if (!t.sectionTag) return true;
            if (activeOutlet === 'bar') return barSourcesRef.current.has(t.source);
            if (activeOutlet === 'restaurant') return restaurantSourcesRef.current.has(t.source);
            return true;
          });
        setPastTransactions([...offlineTxns, ...cached].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      } catch {
        setPastTransactions(cached);
      }
    } finally {
      txnFetchingRef.current = false;
      if (!silent && myGeneration === loadTxnsGenerationRef.current) {
        setTxnsLoading(false);
      }
    }
  }, [activeOutlet, txnCustomDate, txnInitialLoaded, loadExpenditureSummary]);

  // Venue filter sections — show all sections from backend (onboarding/admin)
  const venueFilterSections = useMemo(() => {
    return fetchedSections;
  }, [fetchedSections]);

  // Reset venue filter when outlet changes
  useEffect(() => {
    setActiveVenueFilter('all');
  }, [activeOutlet]);

  // FIX 2: Filtered transactions based on method, search, and venue filter
  const filteredTransactions = useMemo(() => {
    let list = pastTransactions;

    // Venue filter — takes precedence over source filter
    if (activeVenueFilter !== 'all') {
      list = list.filter(txn => txn.source === activeVenueFilter);
    } else if (txnSourceFilter !== 'all') {
      list = list.filter(txn => txn.source === txnSourceFilter);
    }

    // Status filter
    if (txnStatusFilter !== 'all') {
      list = list.filter(txn => (txn.status || 'COMPLETED') === txnStatusFilter);
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
        String(txn.tableDisplayName || txn.tableNumber || '').toLowerCase().includes(q) ||
        String(txn.grandTotal ?? txn.amount ?? '').includes(q) ||
        String(txn.billNumber || '').toLowerCase().includes(q) ||
        String(txn.txnNumber || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [pastTransactions, txnMethodFilter, txnSearch, txnSourceFilter, txnStatusFilter, activeVenueFilter]);

  // Completed-only transactions for sales/revenue calculations.
  // CANCELLED and PENDING transactions are excluded so terminated bills
  // don't inflate totals until confirmed via Past Transactions.
  const completedTransactions = useMemo(() => {
    return filteredTransactions.filter(txn => txn.status === 'COMPLETED');
  }, [filteredTransactions]);

  const txnTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / TXN_PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (txnPage - 1) * TXN_PAGE_SIZE;
    return filteredTransactions.slice(start, start + TXN_PAGE_SIZE);
  }, [filteredTransactions, txnPage]);

  // Reset page whenever txn filters change
  useEffect(() => {
    setTxnPage(1);
  }, [txnDateFilter, txnMethodFilter, txnSourceFilter, txnStatusFilter, txnSearch, txnCustomDate, activeVenueFilter]);

  // Real-time billing alert state
  const [billingAlerts, setBillingAlerts] = useState([]);

  const addNotification = (title, desc, type = 'success') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, title, desc, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  const handleConfirmPayment = useCallback(async (txn) => {
    setConfirmPaymentTxn(txn);
    setConfirmPaymentMethod(null);
    setConfirmCashInput('');
    setConfirmCardInput('');
    setConfirmTipInput('');
    setShowConfirmPaymentModal(true);
  }, []);

  const handleConfirmPaymentSubmit = useCallback(async () => {
    if (!confirmPaymentTxn || !confirmPaymentMethod) return;
    try {
      const cashAmt = Number(confirmCashInput) || 0;
      const cardAmt = Number(confirmCardInput) || 0;
      const tipAmt = Number(confirmTipInput) || 0;
      const isMixed = confirmPaymentMethod === 'OTHER' && (cashAmt > 0 || cardAmt > 0);
      const effectiveMethod = isMixed ? 'MIXED' : confirmPaymentMethod;

      const result = await confirmPayment(confirmPaymentTxn.id, {
        paymentMethod: effectiveMethod,
        cashAmount: cashAmt,
        cardAmount: cardAmt,
        tipAmount: tipAmt,
        cashTipAmount: effectiveMethod === 'CASH' ? tipAmt : 0,
        cardTipAmount: effectiveMethod === 'CARD' ? tipAmt : 0,
      });
      if (result?.offline) {
        addNotification('Confirm Queued', `Bill ${confirmPaymentTxn.displayId || confirmPaymentTxn.id} — will sync when online.`, 'warning');
      } else {
        addNotification('Payment Confirmed', `Bill ${confirmPaymentTxn.displayId || confirmPaymentTxn.id} marked as completed.`, 'success');
        // Optimistically update status so UI + final sale totals reflect the change immediately
        setPastTransactions(prev => prev.map(t =>
          t.id === confirmPaymentTxn.id
            ? { ...t, status: 'COMPLETED', rawStatus: 'COMPLETED' }
            : t
        ));
        // Reset status filter so the confirmed txn is visible and included in final sale
        setTxnStatusFilter('all');
      }
      setShowConfirmPaymentModal(false);
      setConfirmPaymentTxn(null);
      setConfirmPaymentMethod(null);
      setConfirmCashInput('');
      setConfirmCardInput('');
      setConfirmTipInput('');
      loadTransactions(txnDateFilterRef.current, null, { silent: true, force: true });
    } catch (err) {
      console.error('[ConfirmPayment] error:', err);
      addNotification('Confirm Failed', err.message || 'Could not confirm payment.', 'error');
    }
  }, [confirmPaymentTxn, confirmPaymentMethod, confirmCashInput, confirmCardInput, confirmTipInput, loadTransactions]);

  const handleConfirmPaymentCancel = useCallback(() => {
    setShowConfirmPaymentModal(false);
    setConfirmPaymentTxn(null);
    setConfirmPaymentMethod(null);
    setConfirmCashInput('');
    setConfirmCardInput('');
    setConfirmTipInput('');
  }, []);

  const handleOpenSpecialsModal = useCallback(() => {
    setShowSpecialsModal(true);
    setSpecialsError(null);
    setSpecialsRows([{ name: '', price: '', category: 'Main Course', isVeg: true }]);
  }, []);

  const handleCloseSpecialsModal = useCallback(() => {
    setShowSpecialsModal(false);
    setSpecialsError(null);
    setSpecialsRows([{ name: '', price: '', category: 'Main Course', isVeg: true }]);
  }, []);

  const handleSpecialRowChange = useCallback((index, field, value) => {
    setSpecialsRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }, []);

  const handleAddSpecialRow = useCallback(() => {
    setSpecialsRows(prev => [...prev, { name: '', price: '', category: 'Main Course', isVeg: true }]);
  }, []);

  const handleRemoveSpecialRow = useCallback((index) => {
    setSpecialsRows(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveSpecials = useCallback(async () => {
    const validRows = specialsRows.filter(row => row.name.trim() && Number(row.price) > 0);
    if (validRows.length === 0) {
      setSpecialsError('Please add at least one valid special with name and price.');
      return;
    }

    const names = validRows.map(row => row.name.trim().toLowerCase());
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
    if (duplicates.length > 0) {
      setSpecialsError(`Duplicate names found: ${[...new Set(duplicates)].join(', ')}`);
      return;
    }

    setSpecialsSaving(true);
    setSpecialsError(null);

    try {
      const payload = validRows.map(row => ({
        name: row.name.trim(),
        category: row.category.trim() || 'Main Course',
        price: Number(row.price),
        isVeg: row.isVeg,
        menuType: 'FOOD',
        specialChannel: 'BOTH',
      }));

      await bulkImportSpecials(payload, true);
      addNotification('Today Specials Saved', `${payload.length} item(s) added and synced to all outlets.`, 'success');
      handleCloseSpecialsModal();
      if (refreshMenu) await refreshMenu();
    } catch (err) {
      console.error('[SaveSpecials] error:', err);
      setSpecialsError(err.message || 'Failed to save Today Specials.');
      addNotification('Save Failed', err.message || 'Could not save Today Specials.', 'error');
    } finally {
      setSpecialsSaving(false);
    }
  }, [specialsRows, refreshMenu, addNotification, handleCloseSpecialsModal]);

  const bulkConfirmAbortRef = useRef(false);

  const handleBulkConfirmPayment = useCallback(async () => {
    if (bulkConfirmSaving) return; // prevent double-click / concurrent runs
    const pendingTxns = pastTransactions.filter(
      t => (t.status || 'COMPLETED') === 'PENDING' && t.id
    );
    if (pendingTxns.length === 0) {
      addNotification('No Pending Bills', 'There are no pending bills to confirm.', 'warning');
      return;
    }

    bulkConfirmAbortRef.current = false;
    setBulkConfirmSaving(true);
    setBulkConfirmProgress({ current: 0, total: pendingTxns.length });
    setBulkConfirmResults(null);
    setShowBulkConfirmModal(true);

    const results = { success: [], failed: [], offline: [] };
    const chunkSize = 5;

    try {
      for (let i = 0; i < pendingTxns.length; i += chunkSize) {
        if (bulkConfirmAbortRef.current) break;
        const chunk = pendingTxns.slice(i, i + chunkSize);
        const chunkResults = await Promise.allSettled(
          chunk.map(async (txn) => {
            try {
              const res = await confirmPayment(txn.id, {
                paymentMethod: 'CASH',
                cashAmount: Number(txn.grandTotal || txn.amount || 0),
              });
              if (res?.offline) {
                return { type: 'offline', txn };
              }
              return { type: 'success', txn };
            } catch (err) {
              return { type: 'failed', txn, error: err.message || 'Payment confirmation failed' };
            }
          })
        );

        if (bulkConfirmAbortRef.current) break;

        for (const r of chunkResults) {
          if (r.status === 'fulfilled') {
            const value = r.value;
            if (value.type === 'offline') results.offline.push(value.txn);
            else if (value.type === 'success') results.success.push(value.txn);
            else results.failed.push({ txn: value.txn, error: value.error });
          } else {
            results.failed.push({ txn: r.reason?.txn, error: r.reason?.error || 'Unknown error' });
          }
        }

        setBulkConfirmProgress({ current: Math.min(i + chunkSize, pendingTxns.length), total: pendingTxns.length });
      }

      setBulkConfirmResults(results);

      const successCount = results.success.length;
      const failedCount = results.failed.length;
      const offlineCount = results.offline.length;

      if (failedCount === 0 && offlineCount === 0) {
        addNotification('Bulk Confirm Complete', `${successCount} bill${successCount !== 1 ? 's' : ''} confirmed as cash.`, 'success');
        setShowBulkConfirmModal(false);
      } else if (failedCount > 0) {
        addNotification('Bulk Confirm Partial', `${successCount} confirmed, ${failedCount} failed, ${offlineCount} queued.`, 'error');
      } else {
        addNotification('Bulk Confirm Queued', `${successCount} confirmed, ${offlineCount} queued for sync.`, 'warning');
        setShowBulkConfirmModal(false);
      }
    } finally {
      setBulkConfirmSaving(false);
      loadTransactions(txnDateFilterRef.current, null, { silent: true, force: true });
    }
  }, [pastTransactions, bulkConfirmSaving, confirmPayment, addNotification, loadTransactions]);

  const handleCloseBulkConfirmModal = useCallback(() => {
    if (bulkConfirmSaving) {
      bulkConfirmAbortRef.current = true;
    }
    setShowBulkConfirmModal(false);
    setBulkConfirmResults(null);
    setBulkConfirmProgress({ current: 0, total: 0 });
  }, [bulkConfirmSaving]);

  useEffect(() => {
    if (!socket) return;

    setSocketConnected(socket.connected);

    // useSocket(activeRestaurantId) handles room joins; we only need to refetch on reconnect
    const onConnect = () => {
      setSocketConnected(true);
      const now = Date.now();
      if (now - lastReconnectRefetchRef.current < 10_000) return; // skip if refetched <10s ago
      lastReconnectRefetchRef.current = now;
      if (activeOutlet === 'bar' || activeOutlet === 'both') {
        refetchBarTables();
      }
      refetchRestaurantTables();
      // Refresh transactions so history stays current after a disconnect gap
      loadTransactions(txnDateFilterRef.current, null, { silent: true });
    };

    const onDisconnect = () => {
      setSocketConnected(false);
    };

    // If socket is already connected when the component mounts, refetch immediately
    if (socket.connected) {
      onConnect();
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const onBillingRequested = (payload) => {
      const { table, order, billNumber } = payload;
      if (!table) return;
      if (shouldBlockTableUpdate(table.id, table.status)) return;

      // Route table status update to the correct array — include billNumber if provided
      const updateTableStatus = (prev) => prev.map(t =>
        t.backendId === table.id ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill', billNumber: billNumber ?? t.billNumber } : t
      );
      setActiveTables(updateTableStatus, { skipPersist: true });

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
      // Dedup: skip if this is our own KOT submission echo
      if (payload?.requestId && processedSocketRequestIds.current.has(payload.requestId)) return;
      console.log('[CashierDashboard] Received order:created for table:', order.tableId, 'isExtra:', payload?.isExtraTable);
      // NOTE: no shouldBlockTableUpdate here — item additions must never be suppressed by the bill-print cooldown
      if (terminatedTableIdsRef.current.has(order.tableId)) return;
      const termTs1 = recentlyTerminatedRef.current[order.tableId];
      if (termTs1 && Date.now() - termTs1 < 5000) return;
      // FREEZE: once bill is printed, hold items steady until settlement
      if (billPrintedTableIdsRef.current.has(order.tableId) && !settledTableIdsRef.current.has(order.tableId)) return;
      // Skip updating selectedTable if it's an extra table OR if the incoming order belongs to an extra table.
      // Extra tables share backendId with parent, so we must not merge an extra-table order into the parent table view.
      if (selectedTable?.backendId === order.tableId && !selectedTable?.isExtra && !payload?.isExtraTable) {
        // Guard: skip during KOT submission to prevent duplicate items in display cart
        // (socket event would add items to sessionItems while they're still in pendingItems)
        if (!isSubmittingKotRef.current) {
          setSelectedTable(prev => {
            if (!prev) return prev;
            const before = prev;
            const incomingKotHistory = Array.isArray(order.kotHistory) ? order.kotHistory : ((Array.isArray(order.kots) && order.kots.length > 0) ? normalizeKots(order.kots) : []);
            const nextVal = {
              ...prev,
              activeOrder: mergeOrder(order, prev.activeOrder),
              status: prev.status === 'Free' ? 'Occupied' : prev.status,
              workflowStatus: prev.workflowStatus === 'Free' ? 'Occupied' : prev.workflowStatus,
              currentBill: Number(order.totalAmount ?? prev.currentBill ?? 0),
              kotHistory: incomingKotHistory,
            };
            validateTableIntegrity('CashierDashboard.onOrderCreated', before, nextVal);
            return nextVal;
          });
        }
      }
      // Skip updating main grid if this order belongs to an extra table — would overwrite parent table's state
      if (payload?.isExtraTable) return;
      const incomingGridKotHistory = Array.isArray(order.kotHistory) ? order.kotHistory : ((Array.isArray(order.kots) && order.kots.length > 0) ? normalizeKots(order.kots) : []);
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId !== order.tableId) return t;
        // Guard: skip stale order:created for settled/Free tables to prevent ghost items
        if (t.status === 'Free' || t.workflowStatus === 'Free' || t.dbStatus === 'AVAILABLE') {
          console.warn('[CashierDashboard] Ignoring stale order:created for settled table', t.number);
          return t;
        }
        return {
          ...t,
          activeOrder: mergeOrder(order, t.activeOrder),
          status: t.status === 'Free' ? 'Occupied' : t.status,
          workflowStatus: t.workflowStatus === 'Free' ? 'Occupied' : t.workflowStatus,
          currentBill: Number(order.totalAmount ?? t.currentBill ?? 0),
          kotHistory: incomingGridKotHistory,
        };
      });
      setActiveTables(updateTables, { skipPersist: true });
    };

    const dedupKotHistory = (existing = [], incoming = []) => {
      // Server is authoritative — use incoming directly
      return incoming;
    };

    const mergeOrder = (incoming, existing) => {
      // Server is authoritative — directly use incoming items (no merge)
      return incoming;
    };

    const onOrderUpdated = (payload) => {
      const order = payload?.order || payload;
      if (!order?.tableId) return;
      // Dedup: skip if this is our own KOT submission echo
      if (payload?.requestId && processedSocketRequestIds.current.has(payload.requestId)) return;
      // NOTE: no shouldBlockTableUpdate here — item updates (captain adding items) must always be visible
      if (terminatedTableIdsRef.current.has(order.tableId)) return;
      const termTs2 = recentlyTerminatedRef.current[order.tableId];
      if (termTs2 && Date.now() - termTs2 < 5000) return;
      // FREEZE: once bill is printed, hold items steady until settlement
      if (billPrintedTableIdsRef.current.has(order.tableId) && !settledTableIdsRef.current.has(order.tableId)) return;
      // ── DIAGNOSTIC: trace socket order:updated ──
      console.log('[DIAG order:updated] incoming items:', (order.items || []).map(i => ({ id: i.id, name: i.name ?? i.n, qty: i.quantity ?? i.q, removedFromBill: i.removedFromBill })));
      // ── END DIAGNOSTIC ──
      // Extra tables share backendId with parent — skip selectedTable update if incoming order is from an extra table
      // to prevent overwriting the parent table's activeOrder with the extra table's order.
      if (selectedTable?.backendId === order.tableId && !selectedTable?.isExtra && !payload?.isExtraTable) {
        // Guard: skip during KOT submission to prevent duplicate items in display cart
        if (!isSubmittingKotRef.current) {
          setSelectedTable(prev => {
            if (!prev) return prev;
            const before = prev;
            const incomingKotArr = Array.isArray(order.kotHistory) ? order.kotHistory : ((Array.isArray(order.kots) && order.kots.length > 0) ? normalizeKots(order.kots) : []);
            const nextVal = { ...prev, activeOrder: mergeOrder(order, prev.activeOrder), kotHistory: incomingKotArr };
            validateTableIntegrity('CashierDashboard.onOrderUpdated', before, nextVal);
            return nextVal;
          });
        }
      }
      // Skip updating main grid if this order belongs to an extra table — would overwrite parent table's activeOrder
      if (payload?.isExtraTable) return;
      // No click cooldown — real-time updates from captain must always be visible
      const incomingGridKotArr = Array.isArray(order.kotHistory) ? order.kotHistory : ((Array.isArray(order.kots) && order.kots.length > 0) ? normalizeKots(order.kots) : []);
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId !== order.tableId) return t;
        // Guard: skip stale order:updated for settled/Free tables to prevent ghost items
        if (t.status === 'Free' || t.workflowStatus === 'Free' || t.dbStatus === 'AVAILABLE') {
          console.warn('[CashierDashboard] Ignoring stale order:updated for settled table', t.number);
          return t;
        }
        return {
          ...t,
          activeOrder: mergeOrder(order, t.activeOrder),
          currentBill: Number(order.totalAmount ?? t.currentBill ?? 0),
          kotHistory: incomingGridKotArr,
        };
      });
      setActiveTables(updateTables, { skipPersist: true });
    };

    const onTableUpdated = ({ table, requestId } = {}) => {
      if (!table?.id) return;
      // Skip our own KOT submission echo — handleSmartKOT already updated the UI from the API response
      if (requestId && processedSocketRequestIds.current.has(requestId)) return;
      // No click cooldown — real-time updates must always be processed
      if (shouldBlockTableUpdate(table.id, table.status)) return;
      if (terminatedTableIdsRef.current.has(table.id)) {
        const incomingFree = table.status === 'AVAILABLE' || table.status === 'Free' || table.workflowStatus === 'Free';
        if (!incomingFree) return;
      }
      // ── DIAGNOSTIC: trace socket table:updated ──
      const _tblOrdersItems = (table.orders?.[0]?.items || []).map(i => ({ id: i.id, name: i.name ?? i.n, qty: i.quantity ?? i.q, removedFromBill: i.removedFromBill }));
      console.log('[DIAG table:updated] table.id:', table.id, 'orders[0].items:', _tblOrdersItems, 'workflowStatus:', table.workflowStatus);
      // ── END DIAGNOSTIC ──
      const applyTableUpdate = (prev) => prev.map(t => {
        if (t.backendId !== table.id) return t;

        const incomingStatus = table.workflowStatus || (table.status !== undefined ? toFrontendTableStatus(table.status) : t.status);
        const incomingIsAvailable = incomingStatus === 'Free' || incomingStatus === 'AVAILABLE' || table.status === 'AVAILABLE';
        if (incomingIsAvailable && t.activeOrder) {
          // Distinguish legitimate auto-free (all items cancelled) from stale/race event
          const incomingHasLiveData = Array.isArray(table.orders) && table.orders.length > 0 && table.orders[0]?.items?.length > 0;
          const incomingHasBill = (table.currentBill ?? 0) > 0;
          if (incomingHasLiveData || incomingHasBill) {
            console.warn('[CashierDashboard] Skipping stale AVAILABLE event — table still has data', t.number);
            return t;
          }
          // Otherwise it's a legitimate free (all items cancelled or settled) — allow it
        }

        const mergedKotHistory = incomingIsAvailable
          ? []
          : (Array.isArray(table.kots) ? normalizeKots(table.kots) : (Array.isArray(table.kotHistory) ? table.kotHistory : []));
        // When merging an occupied table:updated event, preserve existing activeOrder.items
        // if the incoming payload has no orders array (partial update)
        const incomingHasOrders = Array.isArray(table.orders) && table.orders.length > 0;
        const incomingOrder = incomingHasOrders
          ? (table.orders[0] || null)
          : (incomingIsAvailable ? null : t.activeOrder);  // clear on Free, keep existing for occupied partial updates
        // Never downgrade a table that is locally in 'Waiting Bill' state back to a lesser state
        // Also protect tables where bill was printed but not yet settled
        const isBillPrintedGrid = billPrintedTableIdsRef.current.has(t.backendId);
        const isSettledGrid = settledTableIdsRef.current.has(t.backendId);
        const protectedStatus = (t.status === 'Waiting Bill' || t.workflowStatus === 'Waiting Bill' || (isBillPrintedGrid && !isSettledGrid))
          && incomingStatus !== 'Free' && incomingStatus !== 'AVAILABLE'
          ? 'Waiting Bill'
          : ((isBillPrintedGrid && !isSettledGrid && (incomingStatus === 'Free' || incomingStatus === 'AVAILABLE')) ? 'Waiting Bill' : incomingStatus);
        const incomingBillAmt = table.currentBill ?? table.orders?.[0]?.totalAmount ?? t.currentBill;
        const isIncomingFree = (table.workflowStatus === 'Free' || table.status === 'AVAILABLE' || table.status === 'Free');
        const resolvedBill = isIncomingFree ? 0 : Number(incomingBillAmt ?? t.currentBill ?? 0);
        // FREEZE: once bill is printed, hold items steady until settlement
        const isFrozenGrid = isBillPrintedGrid && !isSettledGrid;
        // Preserve billNumber: prefer incoming order's billNumber, fall back to existing
        const incomingBillNumber = incomingOrder?.billNumber ?? t.billNumber ?? null;
        return {
          ...t,
          kotHistory: mergedKotHistory,
          currentBill: resolvedBill,
          status: protectedStatus,
          workflowStatus: protectedStatus,
          billNumber: incomingBillNumber,
          activeOrder: isFrozenGrid ? t.activeOrder : (incomingIsAvailable ? null : (incomingOrder ? mergeOrder(incomingOrder, t.activeOrder) : t.activeOrder)),
        };
      });
      setActiveTables(applyTableUpdate, { skipPersist: true });
      if (selectedTable?.backendId === table.id && !selectedTable?.isExtra) {
        // Guard: skip during KOT submission to prevent duplicate items in display cart
        if (isSubmittingKotRef.current) return;
        setSelectedTable(prev => {
          if (!prev) return prev;

          const incomingStatusSel = table.workflowStatus || (table.status !== undefined ? toFrontendTableStatus(table.status) : prev.status);
          const incomingIsAvailableSel = incomingStatusSel === 'Free' || incomingStatusSel === 'AVAILABLE' || table.status === 'AVAILABLE';
          if (incomingIsAvailableSel && prev.activeOrder) {
            const incomingHasLiveDataSel = Array.isArray(table.orders) && table.orders.length > 0 && table.orders[0]?.items?.length > 0;
            const incomingHasBillSel = (table.currentBill ?? 0) > 0;
            if (incomingHasLiveDataSel || incomingHasBillSel) {
              console.warn('[CashierDashboard] Skipping stale AVAILABLE event for selected occupied table', prev.number);
              return prev;
            }
          }

          const isTableFree = (table.workflowStatus || table.status) === 'Free';
          const isTableSettled = settledTableIdsRef.current.has(prev.backendId);
          const isBillPrinted = billPrintedTableIdsRef.current.has(prev.backendId);
          // If bill was printed but not settled, do NOT let socket set table to Free
          // (that would clear the bill-printed flag and revert button to "Final Bill")
          const effectiveIsTableFree = isTableFree && (!isBillPrinted || isTableSettled);
          // Always clear kotHistory when table becomes Free — a Free table must have zero KOT history
          const shouldClearKotHistory = effectiveIsTableFree;
          const incomingHasOrdersSel = Array.isArray(table.orders) && table.orders.length > 0;
          const mergedKotHistory = effectiveIsTableFree
            ? []
            : ((Array.isArray(table.kots) && table.kots.length > 0) ? normalizeKots(table.kots) : (Array.isArray(table.kotHistory) ? table.kotHistory : []));
          // Never flicker bill to 0 unless table is actually free
          const incomingBill = effectiveIsTableFree ? 0 : (table.currentBill ?? prev.currentBill);
          const stableBill = effectiveIsTableFree ? 0 : Number(incomingBill ?? prev.currentBill ?? 0);
          const protectedStatusSel = (prev.status === 'Waiting Bill' || prev.workflowStatus === 'Waiting Bill')
            && incomingStatusSel !== 'Free' && incomingStatusSel !== 'AVAILABLE'
            ? 'Waiting Bill'
            : incomingStatusSel;
          // FREEZE: once bill is printed, hold items steady until settlement
          const isFrozenSel = isBillPrinted && !isTableSettled;
          // Preserve billNumber: prefer incoming order's billNumber, fall back to existing
          const incomingOrderSel = incomingHasOrdersSel ? table.orders[0] : null;
          const selBillNumber = incomingOrderSel?.billNumber ?? prev.billNumber ?? null;
          const nextVal = {
            ...prev,
            kotHistory: shouldClearKotHistory ? [] : mergedKotHistory,
            currentBill: stableBill,
            status: effectiveIsTableFree && isTableSettled ? 'Free' : (isBillPrinted && !isTableSettled ? 'Waiting Bill' : protectedStatusSel),
            workflowStatus: effectiveIsTableFree && isTableSettled ? 'Free' : (isBillPrinted && !isTableSettled ? 'Waiting Bill' : protectedStatusSel),
            billNumber: effectiveIsTableFree && isTableSettled ? null : selBillNumber,
            activeOrder: effectiveIsTableFree
              ? null
              : (isFrozenSel ? prev.activeOrder : (incomingHasOrdersSel ? mergeOrder(table.orders[0], prev.activeOrder) : prev.activeOrder)),
          };
          validateTableIntegrity('CashierDashboard.onTableUpdated', prev, nextVal);
          if (shallowEqualSelectedTable(prev, nextVal)) return prev; // bail out if nothing changed
          return nextVal;
        });
      }
    };

    const onOrderPaid = (payload) => {
      const { tableId, isExtraTable, orderId: paidOrderId, transaction: socketTxn } = payload;
      console.log(`[Socket] order:paid received tableId=${tableId} orderId=${paidOrderId}`);
      // Terminal event — must always clear table, never blocked by cooldown.

      // Merge transaction from socket into pastTransactions if present (fixes fast-settlement disappearing bills)
      if (socketTxn) {
        const mappedTxn = {
          id: socketTxn.id,
          orderId: socketTxn.orderId || null,
          txnNumber: socketTxn.txnNumber || null,
          billNumber: socketTxn.billNumber || null,
          displayId: socketTxn.billNumber ? `B${socketTxn.billNumber}` : (socketTxn.txnNumber ? `T${socketTxn.txnNumber}` : '—'),
          kot: socketTxn.orderId ? `ORD-${socketTxn.orderId.slice(-6).toUpperCase()}` : '—',
          amount: socketTxn.grandTotal != null ? Number(socketTxn.grandTotal) : Number(socketTxn.amount ?? 0),
          grandTotal: socketTxn.grandTotal != null ? Number(socketTxn.grandTotal) : Number(socketTxn.amount ?? 0),
          subtotal: Number(socketTxn.subtotal ?? 0),
          discountPercent: Number(socketTxn.discountPercent ?? 0),
          discountAmount: Number(socketTxn.discountAmount ?? 0),
          cgst: Number(socketTxn.cgst ?? 0),
          sgst: Number(socketTxn.sgst ?? 0),
          roundOff: Number(socketTxn.roundOff ?? 0),
          time: (() => { try { const d = new Date(socketTxn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
          date: (() => { try { const d = new Date(socketTxn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
          timestamp: (() => { try { const d = new Date(socketTxn.paidAt); return isNaN(d.getTime()) ? 0 : d.getTime(); } catch { return 0; } })(),
          items: socketTxn.itemCount || (Array.isArray(socketTxn.items) ? socketTxn.items.length : 0),
          itemsList: socketTxn.items || [],
          captainId: socketTxn.captainId || 'CASHIER',
          captainName: socketTxn.captainName || (socketTxn.captainId && socketTxn.captainId !== 'CASHIER' ? socketTxn.captainId : 'Head Cashier'),
          method: socketTxn.method || 'OTHER',
          tableNumber: socketTxn.tableNumber || null,
          tableDisplayName: socketTxn.tableLabel || (socketTxn.tableNumber ? `T${socketTxn.tableNumber}` : '—'),
          source: sectionTagToSourceRef.current[socketTxn.sectionTag] || activeOutlet,
          restaurantId: activeRestaurantId,
          _optimistic: true,
        };
        if (isTxnInDateFilter(socketTxn.paidAt)) {
          setPastTransactions(prev => {
            if (prev.some(t => t.id === mappedTxn.id)) return prev;
            return [mappedTxn, ...prev];
          });
        }
      }

      // Guard: mark table as recently terminated so stale socket events (order:updated,
      // table:updated from before settlement) cannot revive it and cause flicker.
      // Reduced to 5 seconds to match tableSyncService behavior and prevent table disappearance.
      if (tableId) {
        terminatedTableIdsRef.current.add(tableId);
        recentlyTerminatedRef.current[tableId] = Date.now();
        try {
          localStorage.setItem(getTenantScopedKey('cashier_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
        } catch {}
        setTimeout(() => terminatedTableIdsRef.current.delete(tableId), 5000);
      }

      // For extra tables: do NOT reset the parent table in the main grid — it's still occupied with its own session
      if (!isExtraTable) {
        const clearTable = (prev) => prev.map(t =>
          t.backendId === tableId
            ? { ...t, status: 'Free', workflowStatus: 'Free', activeOrder: null, orders: [], kotHistory: [], currentBill: 0, captainId: null, guests: 0, time: null, billNumber: null }
            : t
        );
        setActiveTables(clearTable, { skipPersist: true });

        // Remove from billing alerts
        setBillingAlerts(prev => prev.filter(a => a.tableBackendId !== tableId));
      }
      // Clear selectedTable only if it's the actual paid table (not an extra table that shares backendId)
      if (selectedTable?.backendId === tableId && !selectedTable?.isExtra && !isExtraTable) {
        setSelectedTable(null);
        setSelectedOrder(null);
        setCart([]);
        lastConfirmedItemsRef.current = [];
        clearCashierTableCache(selectedTable);
        setExpandedNoteItemId(null);
        setRemovedItemIds([]);
        setShowPaymentModal(false);
      }
      // NOTE: Do NOT call loadTransactions here — the settlement flow already triggers
      // a reload after commitFn succeeds. Calling it here creates a race where the socket
      // event fires BEFORE the backend has invalidated its cache, causing stale data.
    };

    const onTableSwapped = (payload) => {
      const { sourceTableId, targetTableId, sourceTable: rawSource, targetTable: rawTarget } = payload;

      // Map raw DB payloads to frontend shape using existing mapper
      const allTablesRef = activeTablesRef.current;
      const existingSource = allTablesRef?.find(t => t.backendId === sourceTableId) || null;
      const existingTarget = allTablesRef?.find(t => t.backendId === targetTableId) || null;
      const mappedSource = mapRealtimeTablePayload(rawSource, existingSource);
      const mappedTarget = mapRealtimeTablePayload(rawTarget, existingTarget);

      // Update the tables array for both source and target
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId === sourceTableId) return mappedSource || t;
        if (t.backendId === targetTableId) return mappedTarget || t;
        return t;
      });
      setActiveTables(updateTables, { skipPersist: true });

      if (sourceTableId) {
        recentlyTerminatedRef.current[sourceTableId] = Date.now();
        try {
          localStorage.setItem(getTenantScopedKey('cashier_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
        } catch {}
        setTimeout(() => {
          delete recentlyTerminatedRef.current[sourceTableId];
        }, 3000);
      }

      // If cashier had the source table open, switch selection to the new table
      if (selectedTable?.backendId === sourceTableId && mappedTarget) {
        // Clear stale localStorage for the source table before switching
        localStorage.removeItem(getTenantScopedKey('cashier_selected_table'));
        localStorage.removeItem(getTenantScopedKey(`cashier_cart_${sourceTableId}`));
        // Only re-open to target if it has live data (session fully transferred)
        if ((mappedTarget.kotHistory?.length > 0) || mappedTarget.activeOrder || (mappedTarget.currentBill > 0)) {
          setSelectedTable(mappedTarget);
          setShowTableModal(true);
        } else {
          setSelectedTable(null);
          setShowTableModal(false);
        }
        setShowSwapModal(false);
        addNotification('Table Moved', `Session moved to Table ${rawTarget?.number ?? ''}`, 'success');
      }

      // Cooldown on both tables to prevent socket echo flickering on all devices
      if (payload?.sourceTableId) tableClickCooldownRef.current.set(payload.sourceTableId, Date.now() + 1500);
      if (payload?.targetTableId) tableClickCooldownRef.current.set(payload.targetTableId, Date.now() + 1500);
      syncPauseUntilRef.current = Date.now() + 1500;
    };

    const onTableItemsTransferred = (payload) => {
      const { sourceTableId, targetTableId, sourceTable, targetTable } = payload;
      // No cooldown blocking — item transfers must always be processed for real-time sync
      const allTables = activeTablesRef.current;
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
      setActiveTables(updateTables, { skipPersist: true });

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
      socket.off('disconnect', onDisconnect);
      socket.off('billing:requested', onBillingRequested);
      socket.off('order:created', onOrderCreated);
      socket.off('order:updated', onOrderUpdated);
      socket.off('order:paid', onOrderPaid);
      socket.off('table:swapped', onTableSwapped);
      socket.off('table:items-transferred', onTableItemsTransferred);
      socket.off('menu-item-updated', onMenuItemUpdated);
      socket.off('table:updated', onTableUpdated);
    };
  }, [socket, activeRestaurantId, selectedTable?.backendId, loadTransactions, activeOutlet, refetchBarTables, refetchRestaurantTables, setBarTables]);

  // ── Periodic re-sync poll: safety net for missed socket events ────────────
  useEffect(() => {
    const pollInterval = socket?.connected ? 60_000 : 30_000;
    const interval = setInterval(() => {
      if (!isBackendReachable()) return;
      if (activeOutlet === 'bar' || activeOutlet === 'both') refetchBarTables();
      refetchRestaurantTables();
    }, pollInterval);
    return () => clearInterval(interval);
  }, [activeOutlet, refetchBarTables, refetchRestaurantTables, socket?.connected]);

  // Keep refs in sync so socket handlers and payment callbacks can read latest filter
  useEffect(() => {
    txnDateFilterRef.current = txnDateFilter;
    txnCustomDateRef.current = txnCustomDate;
  }, [txnDateFilter, txnCustomDate]);

  // Check if a transaction's paidAt falls within the current date filter
  // Prevents out-of-date transactions from being injected by socket/settlement handlers
  const isTxnInDateFilter = useCallback((paidAt) => {
    const filter = txnDateFilterRef.current;
    if (filter === 'all') return true;
    const d = new Date(paidAt);
    if (isNaN(d.getTime())) return true; // keep if we can't parse the date
    const txnDateStr = getKolkataDateString(d);
    if (filter === 'today') return txnDateStr === getKolkataDateString();
    if (filter === 'yesterday') return txnDateStr === shiftKolkataDate(new Date(), -1);
    if (filter === 'month') return txnDateStr.slice(0, 7) === getKolkataMonthString();
    if (filter === 'custom') return txnDateStr === txnCustomDateRef.current;
    return true;
  }, []);

  // ── Map offline IndexedDB settlement record into history-list shape ───
  const mapOfflineTransaction = useCallback((txn) => {
    const sectionById = fetchedSectionsRef.current.find(s => s.id === txn.sectionId);
    const source = sectionTagToSourceRef.current[txn.sectionTag]
      || (sectionById && (sectionTagToSourceRef.current[sectionById.sectionTag] || sectionById.name))
      || (txn.sectionTag && txn.sectionTag.startsWith('venue-bar') ? 'bar'
        : txn.sectionTag && txn.sectionTag.startsWith('venue-restaurant') ? 'restaurant'
        : txn.sectionTag || activeOutlet);
    const num = txn.tableNumber || null;
    const tableDisplayName = (() => {
      if (!num) return '—';
      const section = fetchedSectionsRef.current.find(s => s.sectionTag === txn.sectionTag);
      const venueType = section?.venue?.venueType;
      if (isBarLikeVenue(venueType)) return `B${num}`;
      return `T${num}`;
    })();
    const paidAt = txn.createdAt || Date.now();
    return {
      id: txn.localId,
      orderId: txn.orderId || null,
      txnNumber: null,
      billNumber: null,
      displayId: 'OFFLINE',
      kot: txn.orderId ? `ORD-${txn.orderId.slice(-6).toUpperCase()}` : '—',
      amount: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
      grandTotal: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
      subtotal: txn.subtotal != null ? Number(txn.subtotal) : 0,
      discountPercent: txn.discountPercent != null ? Number(txn.discountPercent) : 0,
      discountAmount: txn.discountAmount != null ? Number(txn.discountAmount) : 0,
      cgst: txn.cgst != null ? Number(txn.cgst) : 0,
      sgst: txn.sgst != null ? Number(txn.sgst) : 0,
      tipAmount: Number(txn.tipAmount ?? 0),
      time: (() => { try { const d = new Date(paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
      date: (() => { try { const d = new Date(paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
      timestamp: (() => { try { const d = new Date(paidAt); return isNaN(d.getTime()) ? 0 : d.getTime(); } catch { return 0; } })(),
      items: txn.itemCount || (Array.isArray(txn.items) ? txn.items.length : 0),
      itemsList: txn.items || [],
      captainId: 'CASHIER',
      captainName: 'Head Cashier',
      method: txn.paymentMethod || txn.method || 'OTHER',
      tableNumber: num,
      tableDisplayName,
      source,
      sectionTag: txn.sectionTag || null,
      restaurantId: activeRestaurantId,
      _optimistic: true,
      _offline: true,
    };
  }, [activeOutlet, activeRestaurantId]);

  // ── Fetch fresh order data from backend ───
  // Uses GET /api/orders/table/:tableId which returns the active order directly.
  const fetchFreshOrderData = async (tableBackendId) => {
    try {
      // For edge-local (PIN) auth, use edge server — cloud will reject the fake token
      if (isEdgeLocalAuth()) {
        try {
          const allTables = await edgeFetch('/api/edge/tables');
          if (Array.isArray(allTables)) {
            for (const section of allTables) {
              const table = (section.tables || []).find(t => t.id === tableBackendId || t.backendId === tableBackendId);
              if (table?.activeOrder) return table.activeOrder;
              if (table?.orders && table.orders.length > 0) return table.orders[0];
            }
          }
          return null;
        } catch (e) {
          console.warn('[fetchFreshOrderData] Edge fetch failed:', e.message);
          return null;
        }
      }
      const response = await httpFetch(`${API_BASE}/api/orders/table/${tableBackendId}`, { headers: getAuthHeaders() }, { retries: 1 });
      if (response.ok) {
        const freshOrder = await response.json();
        return freshOrder || null;
      }
      console.warn(`[fetchFreshOrderData] Server returned ${response.status} for table ${tableBackendId}`);
    } catch (error) {
      console.warn('Failed to fetch fresh order data:', error);
    }
    return null;
  };

  // ── Load transactions from DB — re-fires when filter or tab changes ───
  const loadTxnsRef = useRef(loadTransactions);
  useEffect(() => { loadTxnsRef.current = loadTransactions; }, [loadTransactions]);
  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'dashboard' || activeTab === 'analytics') {
      loadTxnsRef.current(txnDateFilter);
    }
  }, [txnDateFilter, activeTab]);

  // Reload transactions once after fetchedSections first loads so source mapping is correct
  const sectionsLoadedForTxnsRef = useRef(false);
  useEffect(() => {
    if (fetchedSections.length > 0 && !sectionsLoadedForTxnsRef.current) {
      sectionsLoadedForTxnsRef.current = true;
      loadTxnsRef.current(txnDateFilterRef.current);
    }
  }, [fetchedSections]);

  useEffect(() => {
    // Guard: skip during KOT submission — handleSmartKOT updates selectedTable + cart synchronously
    // after the API resolves. Letting this effect run mid-submission would merge stale activeTables
    // data and cause duplicate items in the display cart.
    if (isSubmittingKotRef.current) return;
    if (!selectedTable?.backendId) return;
    // Extra tables share backendId with their parent table. The parent may be AVAILABLE
    // (already settled), which would cause this effect to null out the extra table's
    // selectedTable state and close the modal. Skip sync entirely for extra tables —
    // their state is managed exclusively via extraTables / setExtraTables.
    if (selectedTable?.isExtra) return;

    // FIX: once a table is marked settled, ignore sync updates that try to revert it
    if (settledTableIdsRef.current.has(selectedTable.backendId)) return;

    // BILL-PRINT GUARD: if bill was printed, do not let sync downgrade selectedTable back
    // to a non-Waiting-Bill status. The button must stay as "Settlement".
    if (billPrintedTableIdsRef.current.has(selectedTable.backendId)) {
      // Only let sync through if it brings a Free/AVAILABLE (settlement confirmed elsewhere)
      const liveTable = activeTablesRef.current.find((t) => t.backendId === selectedTable.backendId);
      if (liveTable) {
        const isNowFree = liveTable.status === 'Free' || liveTable.status === 'AVAILABLE' || liveTable.workflowStatus === 'Free';
        if (isNowFree) {
          // Settlement was confirmed — clear the print flag then let normal logic run
          setBillPrintedTableIds(prev => { const next = new Set(prev); next.delete(selectedTable.backendId); return next; });
          billPrintCooldownRef.current.delete(selectedTable.backendId);
          // Persist removal
          try {
            const stored = safeGetJSON(getTenantScopedKey('cashier_bill_printed_tables'), []);
            localStorage.setItem(getTenantScopedKey('cashier_bill_printed_tables'), JSON.stringify(stored.filter(id => id !== selectedTable.backendId)));
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

    // Only clear stale ghost data when we can verify against the backend. During an outage,
    // a locally Free-looking table with cached items is more likely to be a sync gap than a bug.
    if (hasStaleGhostData && !isOffline) {
      setSelectedTable(null);
      setCart([]);
      lastConfirmedItemsRef.current = [];
      clearCashierTableCache(selectedTable);
      return;
    }

    const liveTable = activeTablesRef.current.find((table) => table.backendId === selectedTable.backendId);

    // Guard: if fetchFreshOrderData just updated this selectedTable, skip the activeTables-driven
    // merge for a few seconds to avoid a stale activeTables snapshot overwriting a fresh order.
    const fetchGuard = lastFetchUpdateRef.current.backendId === selectedTable.backendId &&
      Date.now() - lastFetchUpdateRef.current.ts < 3000;
    if (liveTable && fetchGuard) {
      return;
    }

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
        // Merge live table but never lose items that are in selectedTable but not in liveTable
        setSelectedTable(prev => {
          if (!prev) return liveTable;
          const prevItems = prev.activeOrder?.items || [];
          const liveItems = liveTable.activeOrder?.items || [];
          const liveItemIds = new Set(liveItems.map(i => i.id).filter(Boolean));
          const localOnlyItems = prevItems.filter(i => i.id && !liveItemIds.has(i.id));
          if (localOnlyItems.length === 0) return liveTable;
          return {
            ...liveTable,
            activeOrder: liveTable.activeOrder
              ? { ...liveTable.activeOrder, items: [...liveItems, ...localOnlyItems] }
              : prev.activeOrder,
          };
        });
      }
    }
  }, [selectedTable, billPrintedTableIds]);

  useEffect(() => {
    if (!selectedTable?.backendId) return;
    if (selectedTable?.discount && Number(selectedTable.discount) > 0) {
      // Only auto-fill if cashier hasn't already typed something
      setRawDiscountInput(prev => {
        if (!prev || prev === '0' || prev === '') {
          setDiscountMode('percent');
          return String(Number(selectedTable.discount));
        }
        return prev;
      });
      return;
    }
    // Fallback: restore from localStorage if server discount is missing
    try {
      const stored = localStorage.getItem(getTenantScopedKey(`cashier_table_discount_${selectedTable.backendId}`));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.value) setRawDiscountInput(parsed.value);
      }
    } catch { /* ignore */ }
  }, [selectedTable?.backendId, selectedTable?.discount]);

  useEffect(() => {
    setSelectedCategory('All');
    setSelectedMenuType('ALL');
    setSearchQuery('');
    setIsWalkinMode(false);
    setWalkinTableNumber(null);
  }, [activeOutlet]);

  // Reset selectedMenuType to ALL when not in bar mode (if it was set to LIQUOR)
  useEffect(() => {
    if (activeOutlet !== 'bar' && activeOutlet !== 'both' && selectedMenuType === 'LIQUOR') {
      setSelectedMenuType('ALL');
    }
  }, [activeOutlet]);

  const activeTableOrders = useMemo(() => {
    return activeTables
      .filter((table) => table.status && table.status !== 'Free')
      .map((table) => {
        const items = getBillableItems(table);
        const bill = calculateTableBill(table, restaurantConfig);
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

  // ── Dashboard floor tables ──
  const dashboardFloorTables = useMemo(() => {
    return activeTables;
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
      const transferResult = await transferItems(
        selectedTable.backendId,
        itemSwapTargetId,
        itemSwapSelectedIds,
        'Cashier',
        selectedTable.section?.restaurantId || activeRestaurantId,
      );

      // Optimistic update: remove transferred items from source, let socket sync handle the rest
      const sourceId = selectedTable.backendId;
      const targetId = itemSwapTargetId;
      const transferredIds = new Set(itemSwapSelectedIds);

      setActiveTables(prev => prev.map(t => {
        if (t.backendId === sourceId) {
          const updatedItems = (t.activeOrder?.items || [])
            .map(i => transferredIds.has(i.id) ? { ...i, removedFromBill: true, quantity: 0 } : i);
          const newBill = updatedItems
            .filter(i => !i.removedFromBill && i.quantity > 0)
            .reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
          const allCancelled = updatedItems.every(i => i.removedFromBill || i.quantity === 0);
          const updatedKotHistory = (t.kotHistory || [])
            .map(kot => ({
              ...kot,
              items: (kot.items || []).filter(i => !transferredIds.has(i.orderItemId)),
            }))
            .filter(kot => (kot.items || []).length > 0);
          return {
            ...t,
            activeOrder: t.activeOrder ? { ...t.activeOrder, items: updatedItems } : t.activeOrder,
            currentBill: allCancelled ? 0 : newBill,
            status: allCancelled ? 'Free' : t.status,
            workflowStatus: allCancelled ? 'Free' : t.workflowStatus,
            kotHistory: allCancelled ? [] : updatedKotHistory,
          };
        }
        return t;
      }));

      // Update selectedTable if it's the source
      if (selectedTable?.backendId === sourceId) {
        setSelectedTable(prev => {
          if (!prev) return prev;
          const updatedItems = (prev.activeOrder?.items || [])
            .map(i => transferredIds.has(i.id) ? { ...i, removedFromBill: true, quantity: 0 } : i);
          const allCancelled = updatedItems.every(i => i.removedFromBill || i.quantity === 0);
          const updatedKotHistory = (prev.kotHistory || [])
            .map(kot => ({
              ...kot,
              items: (kot.items || []).filter(i => !transferredIds.has(i.orderItemId)),
            }))
            .filter(kot => (kot.items || []).length > 0);
          return {
            ...prev,
            activeOrder: prev.activeOrder ? { ...prev.activeOrder, items: updatedItems } : prev.activeOrder,
            kotHistory: allCancelled ? [] : updatedKotHistory,
          };
        });
      }

      setShowItemSwapModal(false);
      setItemSwapSelectedIds([]);
      setItemSwapTargetId(null);
      addNotification(
        transferResult?.offline ? 'Items Transferred (Sync Pending)' : 'Items Transferred',
        `${itemSwapSelectedIds.length} items moved to ${activeOutlet === 'bar'
          ? `B${selectedItemSwapTarget?.number ?? selectedItemSwapTarget?.id}`
          : `T${selectedItemSwapTarget?.id}`}`,
        transferResult?.offline ? 'warning' : 'success',
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

  // Net total for a transaction (excl. GST, after discount): use subtotal - discount if valid,
  // otherwise back out tax from grandTotal (grandTotal is already post-discount, post-tax)
  const netTotal = (t) => {
    const sub = Number(t.subtotal);
    const disc = Number(t.discountAmount ?? 0);
    if (sub > 0) return sub - disc;
    // Fallback: grandTotal is post-discount, post-tax. Just remove tax.
    return Number(t.grandTotal ?? t.amount ?? 0) - Number(t.cgst ?? 0) - Number(t.sgst ?? 0);
  };

  // Total Sales = sum of grandTotal (with GST, after discount — the final bill amount)
  // Expenditure Amount = total non-voided expenditures for the selected dashboard date
  // Final Amount = Total Sales − Expenditure Amount (cashier-only "X Report")
  // These use completedTransactions so CANCELLED/PENDING bills are excluded from totals
  const dashboardTotalSales = useMemo(() => {
    return completedTransactions
      .reduce((sum, txn) => sum + Number(txn.grandTotal ?? txn.amount ?? 0), 0);
  }, [completedTransactions]);

  // Expenditure + final amount shown only on the cashier dashboard
  const dashboardExpenditureAmount = useMemo(() => {
    return Number(expenditureSummary?.totalAmount || 0);
  }, [expenditureSummary]);

  const dashboardFinalAmount = useMemo(() => {
    return dashboardTotalSales - dashboardExpenditureAmount;
  }, [dashboardTotalSales, dashboardExpenditureAmount]);

  // Total discounts given for the selected dashboard date (sum of discountAmount across completed transactions)
  const dashboardTotalDiscounts = useMemo(() => {
    return completedTransactions.reduce((sum, txn) => sum + Number(txn.discountAmount ?? 0), 0);
  }, [completedTransactions]);

  const [dashboardDate, setDashboardDate] = useState(null);

  // Bill Finder state
  const [billFinderDate, setBillFinderDate] = useState(getKolkataDateString());
  const [billFinderBillNo, setBillFinderBillNo] = useState('');
  const [billFinderTableNo, setBillFinderTableNo] = useState('');
  const [billFinderResults, setBillFinderResults] = useState([]);
  const [billFinderLoading, setBillFinderLoading] = useState(false);
  const [billFinderSearched, setBillFinderSearched] = useState(false);
  const [isReprintingFoundBill, setIsReprintingFoundBill] = useState(false);
  const [expandedBillRow, setExpandedBillRow] = useState(null);
  const [billPreviewTxn, setBillPreviewTxn] = useState(null);
  const [showReprintPinModal, setShowReprintPinModal] = useState(false);
  const [reprintPinTarget, setReprintPinTarget] = useState(null);
  const [reprintPinInput, setReprintPinInput] = useState('');
  const [reprintPinError, setReprintPinError] = useState('');
  const [isVerifyingReprintPin, setIsVerifyingReprintPin] = useState(false);

  // Reset bill finder state when switching outlets to prevent stale empty state
  useEffect(() => {
    setBillFinderResults([]);
    setBillFinderSearched(false);
  }, [activeOutlet]);

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
    setBillFinderSearched(false);
    setBillFinderLoading(true);
    setBillFinderResults([]);
    try {
      const rid = getCurrentRestaurantId();

      // For edge-local (PIN) auth, cloud will reject the fake token.
      // Fetch all transactions from edge server and filter client-side.
      if (isEdgeLocalAuth()) {
        const allTxns = await fetchTransactions(rid, 0, billFinderDate);
        const filtered = (Array.isArray(allTxns) ? allTxns : []).filter(txn => {
          let matches = true;
          if (billFinderBillNo.trim()) {
            const search = billFinderBillNo.trim().toLowerCase();
            matches = matches && (
              String(txn.billNumber || '').toLowerCase() === search ||
              String(txn.displayId || '').toLowerCase() === search ||
              String(txn.txnNumber || '').toLowerCase() === search
            );
          }
          const tableNum = parseInt(billFinderTableNo.trim(), 10);
          if (!isNaN(tableNum)) {
            matches = matches && String(txn.tableNumber) === String(tableNum);
          }
          return matches;
        });

        const enriched = filtered.map(txn => {
          const num = txn.tableNumber;
          const secName = (txn.sectionTag || '').toLowerCase();
          const tableDisplayName = num ? getVenueTableLabel(secName, num) : '—';
          return { ...txn, tableDisplayName, itemsList: txn.items || [] };
        });

        setBillFinderSearched(true);
        setBillFinderResults(enriched);
        return;
      }

      // Use backend filters (billNumber + tableNumber) instead of fetching all txns and filtering client-side
      const params = new URLSearchParams();
      params.set('date', billFinderDate);
      if (billFinderBillNo.trim()) {
        params.set('billNumber', billFinderBillNo.trim());
      }
      const tableNum = parseInt(billFinderTableNo.trim(), 10);
      if (!isNaN(tableNum)) {
        params.set('tableNumber', String(tableNum));
      }
      params.set('limit', '500');

      const res = await httpFetch(`${API_BASE}/api/transactions?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      }, { retries: 1 });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      const allTxns = await res.json();

      const filtered = allTxns.filter(txn => {
        let matches = true;
        if (billFinderBillNo.trim()) {
          const search = billFinderBillNo.trim().toLowerCase();
          matches = matches && (
            String(txn.billNumber || '').toLowerCase() === search ||
            String(txn.displayId || '').toLowerCase() === search ||
            String(txn.txnNumber || '').toLowerCase() === search
          );
        }
        if (billFinderTableNo.trim()) {
          const searchNo = billFinderTableNo.trim();
          const num = txn.tableNumber;
          const secName = (txn.sectionTag || '').toLowerCase();
          const displayName = num ? getVenueTableLabel(secName, num) : '—';
          matches = matches && (
            String(txn.tableNumber) === searchNo ||
            String(displayName) === searchNo
          );
        }
        return matches;
      });

      // Apply outlet-level isolation filter using sectionTag
      const isolated = filtered.filter(txn => {
        if (!txn.sectionTag) return true; // no sectionTag = include (backend already filtered by restaurantId)
        const mappedSource = sectionTagToSource[txn.sectionTag] || txn.sectionTag;
        if (activeOutlet === 'bar') return barSources.has(mappedSource);
        if (activeOutlet === 'restaurant') return restaurantSources.has(mappedSource);
        return true;
      });

      // Enrich results with tableDisplayName and itemsList for rendering
      const enriched = isolated.map(txn => {
        const num = txn.tableNumber;
        const secName = (txn.sectionTag || '').toLowerCase();
        const tableDisplayName = num ? getVenueTableLabel(secName, num) : '—';
        return { ...txn, tableDisplayName, itemsList: txn.items || [] };
      });

      setBillFinderSearched(true);
      setBillFinderResults(enriched);
    } catch (error) {
      console.error('[Bill Finder] Search error:', error);
      addNotification('Search Failed', 'Failed to search for bills', 'error');
    } finally {
      setBillFinderLoading(false);
    }
  };

  const handleReprintFoundBill = (txn) => {
    setReprintPinTarget(txn);
    setReprintPinInput('');
    setReprintPinError('');
    setShowReprintPinModal(true);
  };

  const verifyReprintPin = async () => {
    if (isVerifyingReprintPin) return;
    if (!reprintPinInput || reprintPinInput.length < 4) {
      setReprintPinError('Please enter a valid PIN.');
      return;
    }
    setIsVerifyingReprintPin(true);
    try {
      // For edge-local (PIN) auth, cloud will reject the fake token.
      // The user already authenticated via edge PIN login — skip cloud verification.
      if (isEdgeLocalAuth()) {
        setShowReprintPinModal(false);
        setReprintPinError('');
        doReprintFoundBill(reprintPinTarget);
        return;
      }
      const res = await httpFetch(`${API_BASE}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ pin: reprintPinInput }),
      }, { retries: 0 });
      if (res.ok) {
        setShowReprintPinModal(false);
        setReprintPinError('');
        doReprintFoundBill(reprintPinTarget);
      } else {
        setReprintPinError('Incorrect PIN. Please try again.');
      }
    } catch (error) {
      setReprintPinError('Failed to verify PIN. Please try again.');
    } finally {
      setIsVerifyingReprintPin(false);
    }
  };

  const doReprintFoundBill = async (txn) => {
    if (!txn) return;
    setIsReprintingFoundBill(true);
    try {
      // For edge-local (PIN) auth, use edge server — cloud will reject the fake token
      if (isEdgeLocalAuth()) {
        try {
          const edgeResult = await edgeFetch('/api/edge/order/print-bill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: txn.orderId }),
          });
          if (edgeResult && edgeResult.success) {
            addNotification('Re-print Sent', `Bill #${txn.billNumber || txn.displayId} sent to printer.`, 'success');
            return;
          }
        } catch (edgeErr) {
          throw new Error(edgeErr.message || 'Edge reprint failed');
        }
        return;
      }
      const response = await httpFetch(`${API_BASE}/api/print/reprint-by-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          orderId: txn.orderId,
          restaurantId: txn._sourceRestaurantId || txn.restaurantId || activeRestaurantId
        }),
      }, { retries: 1 });
      if (!response.ok) throw new Error('Print request failed');
      addNotification('Re-print Sent', `Bill #${txn.billNumber || txn.displayId} sent to printer.`, 'success');
    } catch (error) {
      console.error('[Bill Finder] Re-print error:', error);
      addNotification('Re-print Failed', error.message || 'Failed to re-print bill', 'error');
    } finally {
      setIsReprintingFoundBill(false);
      setReprintPinTarget(null);
    }
  };

  const { subtotal, taxes, total, grandTotal: cartGrandTotal, cgst: cartCgst, sgst: cartSgst } = calculateOrderTotal(cart, 0, restaurantConfig);
  const activeOrderCalc = useMemo(() => {
    if (!selectedTable) return calculateOrderTotal(cart, discountPercent, restaurantConfig);
    const committedItems = getBillableItems(selectedTable);
    const items = committedItems.map(i =>
      removedItemIds.includes(i.id) ? { ...i, removedFromBill: true } : i
    );
    return calculateOrderTotal([...items, ...cart], discountPercent, restaurantConfig);
  }, [selectedTable, cart, discountPercent, removedItemIds]);
  const activeSubtotal = activeOrderCalc.rawSubtotal ?? activeOrderCalc.subtotal;
  const activeTaxes = activeOrderCalc.taxes;
  const activeTotal = activeOrderCalc.total;
  const activeGrandTotal = useMemo(() => {
    // IMPORTANT: selectedTable?.activeOrder?.totalAmount is a RAW subtotal (no GST, no discount).
    // It must NEVER be used as the displayed grand total.
    // The correct grand total is always activeOrderCalc.grandTotal, which applies
    // discount + GST on food (5% = 2.5% CGST + 2.5% SGST) correctly via calculateOrderTotal().
    const calcTotal = activeOrderCalc.grandTotal ?? activeOrderCalc.total ?? 0;

    // Only use calcTotal as the candidate — never backendTotal (which is raw subtotal only)
    const candidate = calcTotal;

    // If no items remain, total must be 0 — clear stale ref so it doesn't show old value
    const hasCommittedItems = selectedTable ? getBillableItems(selectedTable).length > 0 : false;
    const hasCartItems = cart.length > 0;
    if (!hasCommittedItems && !hasCartItems) {
      lastKnownBillRef.current = 0;
      return 0;
    }
    // Prevent flash-to-zero: only update ref when we have a real value
    if (candidate > 0) {
      lastKnownBillRef.current = candidate; // do NOT use Math.max — allow discounts to reduce the value
    }
    // Do NOT reset to 0 when candidate === 0 but items exist — this is a transient calc state
    return lastKnownBillRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable?.activeOrder?.id, activeOrderCalc.grandTotal, activeOrderCalc.total, discountPercent, cart.length]);
  const activeDiscountAmount = activeOrderCalc.discountAmount ?? 0;
  const activeCgst = activeOrderCalc.cgst ?? 0;
  const activeSgst = activeOrderCalc.sgst ?? 0;
  // Always use the calculated value; never fall back to stale backend field
  const fallbackTotal = activeOrderCalc.grandTotal;

  const handleFinalBill = async () => {
    if (!selectedTable || (!selectedTable.backendId && !selectedTable.isExtra)) {
      addNotification('Error', 'Invalid table selected.', 'error');
      return;
    }
    if (isModalDataLoading) {
      addNotification('Loading', 'Table data is refreshing — please wait a moment.', 'warning');
      return;
    }

    // ── DIAGNOSTIC: trace cancelled-item display bug ──
    const _allItems = getAllOrderItems(selectedTable);
    const _billable = getBillableItems(selectedTable);
    const _activeItems = selectedTable?.activeOrder?.items || [];
    console.log('[DIAG finalBill] selectedTable.activeOrder.items (raw):', _activeItems.map(i => ({ id: i.id, name: i.name ?? i.n, qty: i.quantity ?? i.q, removedFromBill: i.removedFromBill })));
    console.log('[DIAG finalBill] getAllOrderItems:', _allItems.map(i => ({ id: i.id, name: i.n ?? i.name, qty: i.q ?? i.quantity, removedFromBill: i.removedFromBill })));
    console.log('[DIAG finalBill] getBillableItems:', _billable.map(i => ({ id: i.id, name: i.n ?? i.name, qty: i.q ?? i.quantity, removedFromBill: i.removedFromBill })));
    console.log('[DIAG finalBill] kotHistory items:', (selectedTable?.kotHistory || []).flatMap(k => (k.items || []).map(i => ({ kotId: k.id, name: i.n, q: i.q, s: i.s, removedFromBill: i.removedFromBill }))));
    // ── END DIAGNOSTIC ──

    // Ref guard - synchronous check to prevent race condition
    if (isPrintingBillRef.current) return;
    isPrintingBillRef.current = true;

    // Guard: block print if a cancel is in progress (prevents race where bill includes item being cancelled)
    if (cancelInProgressRef.current) {
      isPrintingBillRef.current = false;
      addNotification('Cancel in progress', 'Please wait for cancel to complete before printing.', 'warning');
      return;
    }

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

    // Declare outside try so it's accessible in the catch block.
    // If the local print succeeded but the backend API call fails, we must NOT
    // roll back the bill-printed flag — the physical bill was already printed.
    let localPrinted = false;

    try {
      setIsPrintingBill(true);
      lastKnownBillRef.current = 0; // Reset bill ref before print to allow recalculation

      // ── BILL-PRINT GUARD: arm BEFORE the print API call to prevent socket race ──
      const tableId = selectedTable.isExtra ? selectedTable.id : selectedTable.backendId;
      setBillPrintedTableIds(prev => {
        const next = new Set(prev);
        next.add(tableId);
        try {
          localStorage.setItem(getTenantScopedKey('cashier_bill_printed_tables'), JSON.stringify([...next]));
        } catch {}
        return next;
      });
      // Immediately update status to 'Waiting Bill' so button changes instantly
      setSelectedTable(prev => prev ? { ...prev, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : prev);
      if (selectedTable.isExtra) {
        setExtraTables(prev => prev.map(et =>
          et.id === tableId ? { ...et, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : et
        ));
      } else {
        const updateBillStatus = (prev) =>
          prev.map((t) =>
            t.backendId === tableId ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : t
          );
        setActiveTables(updateBillStatus);
      }

      // Step 1: Update table discount if entered (only when online; otherwise
      // the discount is still applied to the local bill and the queued print/settle
      // actions carry the discountPercent).
      if (discountPercent > 0) {
        if (!selectedTable.isExtra) {
          // Persist discount locally so it survives modal close/reopen until settlement
          localStorage.setItem(getTenantScopedKey(`cashier_table_discount_${selectedTable.backendId}`), JSON.stringify({
            value: String(discountPercent),
            mode: 'percent'
          }));
          if (!isOffline) {
            try {
              if (isEdgeLocalAuth()) {
                await edgeFetch(`/api/edge/admin/table/${selectedTable.backendId}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ discount: discountPercent }),
                });
              } else {
                await httpFetch(`${API_BASE}/api/tables/${selectedTable.backendId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({ discount: discountPercent })
                }, { retries: 1 });
              }
            } catch (discountErr) {
              // Non-fatal: the discount is already saved locally and will be
              // included in the queued bill/settle actions that sync later.
              console.warn('[handleFinalBill] Table discount update failed (offline?):', discountErr.message);
            }
          }
        } else {
          // Extra table: store discount on the extraTables entry (no DB table to patch)
          setExtraTables(prev => prev.map(et =>
            et.id === selectedTable.id ? { ...et, discountPercent } : et
          ));
        }
      }

      // Step 2: Snapshot billable items before print-bill so we can detect item loss
      billItemsSnapshotRef.current = getBillableItems(selectedTable);

      // Step 3: Try local print FIRST (with timeout), then call backend with correct localPrinted flag.
      // Shared billEventId ensures Print Agent deduplicates even if response is lost.
      const billRequestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
      const billEventId = `${billRequestId}-bill`;

      try {
        const { printLocal } = await import('../utils/printOffline');
        const billItems = getBillableItems(selectedTable);
        const billCalc = calculateOrderTotal(billItems, discountPercent, restaurantConfig);
        const billEscpos = buildBillEscpos({
          billNumber: 'PENDING',
          tableNumber: selectedTable.number,
          sectionTag: selectedTable.sectionTag || null,
          items: billItems.map(i => ({
            name: i.name || i.n || '',
            quantity: i.quantity || i.q || 1,
            price: i.price || i.p || 0,
            amount: (i.price || i.p || 0) * (i.quantity || i.q || 1),
            menuType: i.menuType || i.type || undefined,
            notes: i.notes || null,
          })),
          subtotal: billCalc.rawSubtotal ?? billCalc.subtotal,
          discount: discountPercent > 0 ? { percent: discountPercent, amount: billCalc.discountAmount } : null,
          tax: (billCalc.cgst || billCalc.sgst) ? { cgst: billCalc.cgst, sgst: billCalc.sgst, total: (billCalc.cgst || 0) + (billCalc.sgst || 0) } : null,
          roundOff: billCalc.roundOff ?? 0,
          grandTotal: billCalc.grandTotal,
          itemCount: billItems.length,
          qtyCount: billItems.reduce((s, i) => s + (i.quantity || i.q || 1), 0),
          section: selectedTable.section?.name || undefined,
          restaurant: {
            name: restaurant?.name || undefined,
            receiptHeader: restaurant?.receiptHeader || undefined,
            receiptSubHeader: restaurant?.receiptSubHeader || undefined,
            address: restaurant?.address || undefined,
            phone: restaurant?.phone || undefined,
          },
        });
        const result = await printLocal({
          type: 'FINAL_BILL',
          escposData: billEscpos,
          eventId: billEventId,
          data: {
            tableNumber: selectedTable.number,
            items: billItems,
            subtotal: billCalc.rawSubtotal ?? billCalc.subtotal,
            discount: discountPercent > 0 ? { percent: discountPercent, amount: billCalc.discountAmount } : null,
            cgst: billCalc.cgst,
            sgst: billCalc.sgst,
            grandTotal: billCalc.grandTotal,
            roundOff: billCalc.roundOff ?? 0,
            billNumber: 'PENDING',
            restaurant: {
              name: restaurant?.name || undefined,
              receiptHeader: restaurant?.receiptHeader || undefined,
              receiptSubHeader: restaurant?.receiptSubHeader || undefined,
              address: restaurant?.address || undefined,
              phone: restaurant?.phone || undefined,
            },
          },
        });
        localPrinted = result?.printed || false;
        if (localPrinted) {
          console.log('[handleFinalBill] Local print succeeded — backend will skip socket emission');
        } else {
          console.log('[handleFinalBill] Local print failed — backend will emit via socket');
        }
      } catch (printErr) {
        console.warn('[handleFinalBill] Local print failed:', printErr.message);
      }

      // Call backend print-bill endpoint with localPrinted flag and shared billEventId
      const orderId = selectedTable?.activeOrder?.id;
      let response = null;
      if (orderId) {
        const printBillRestaurantId = selectedTable.section?.restaurantId || activeRestaurantId;
        const extraDiscountPercent = selectedTable.isExtra
          ? (discountPercent || selectedTable.discountPercent || 0)
          : 0;
        const extraKotIds = (selectedTable.kotHistory || [])
          .map(k => k.id)
          .filter(Boolean)
          .join(',');

        if (localPrinted) {
          // Bill already printed locally — fire-and-forget backend call for bill number assignment.
          // Spinner clears immediately; bill number updates table card when backend responds.
          const printBillArgs = selectedTable.isExtra
            ? { restaurantId: printBillRestaurantId, tableNumber: selectedTable.number, discountPercent: extraDiscountPercent, kotNumbers: extraKotIds, localPrinted, billEventId }
            : { restaurantId: printBillRestaurantId, localPrinted, billEventId };

          printBill(orderId, printBillArgs)
            .then(resp => {
              if (resp?.billNumber) {
                setSelectedTable(prev => prev ? { ...prev, billNumber: resp.billNumber } : prev);
                if (selectedTable.isExtra) {
                  setExtraTables(prev => prev.map(et =>
                    et.id === selectedTable.id ? { ...et, billNumber: resp.billNumber } : et
                  ));
                } else {
                  setActiveTables(prev => prev.map(t =>
                    t.backendId === selectedTable.backendId ? { ...t, billNumber: resp.billNumber } : t
                  ));
                }
              }
              if (resp?.offline) {
                addNotification('Offline', `Bill queued — will sync when online. Ref: ${resp.billNumber}`, 'warning');
              }
              window.dispatchEvent(new Event('softshape_order_updated'));
            })
            .catch(err => {
              console.warn('[handleFinalBill] Background printBill failed:', err.message);
              addNotification('Sync Pending', 'Bill printed, bill number will sync when online.', 'warning');
            })
            .finally(() => {
              isPrintingBillRef.current = false;
            });

          // Clear spinner immediately — bill is already printed
          setIsPrintingBill(false);

          // Per-table cooldown
          const printedTableKey = selectedTable.isExtra ? selectedTable.id : selectedTable?.backendId;
          if (printedTableKey) {
            billPrintCooldownRef.current.set(printedTableKey, Date.now() + 2000);
            setTimeout(() => billPrintCooldownRef.current.delete(printedTableKey), 2000);
          }

          addNotification('Success', 'Bill printed successfully.', 'success');

          // Update localStorage cache for the table status
          const tableIdForCache = selectedTable.isExtra ? selectedTable.id : selectedTable.backendId;
          if (!selectedTable.isExtra && tableIdForCache) {
            try {
              const cacheKey = activeOutlet === 'bar' ? getBarTablesCacheKey() : getTablesCacheKey();
              const cached = safeGetJSON(cacheKey, []);
              const updatedCache = cached.map(t =>
                t.backendId === tableIdForCache ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : t
              );
              localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
            } catch {}
          }

          return;
        }

        // localPrinted=false — MUST await backend (socket path prints the bill)
        response = selectedTable.isExtra
          ? await printBill(orderId, { restaurantId: printBillRestaurantId, tableNumber: selectedTable.number, discountPercent: extraDiscountPercent, kotNumbers: extraKotIds, localPrinted, billEventId })
          : await printBill(orderId, { restaurantId: printBillRestaurantId, localPrinted, billEventId });
        if (response?.offline) {
          addNotification('Offline', `Bill queued — will sync when online. Ref: ${response.billNumber}`, 'warning');
          // If local print didn't succeed above, try again with the offline bill number
          if (!localPrinted) {
            try {
              const { printLocal } = await import('../utils/printOffline');
              const billItems = getBillableItems(selectedTable);
              const billCalc = calculateOrderTotal(billItems, discountPercent, restaurantConfig);
              const billEscpos = buildBillEscpos({
                billNumber: response.billNumber,
                tableNumber: selectedTable.number,
                sectionTag: selectedTable.sectionTag || null,
                items: billItems.map(i => ({
                  name: i.name || i.n || '',
                  quantity: i.quantity || i.q || 1,
                  price: i.price || i.p || 0,
                  amount: (i.price || i.p || 0) * (i.quantity || i.q || 1),
                  menuType: i.menuType || i.type || undefined,
                  notes: i.notes || null,
                })),
                subtotal: billCalc.rawSubtotal ?? billCalc.subtotal,
                discount: discountPercent > 0 ? { percent: discountPercent, amount: billCalc.discountAmount } : null,
                tax: (billCalc.cgst || billCalc.sgst) ? { cgst: billCalc.cgst, sgst: billCalc.sgst, total: (billCalc.cgst || 0) + (billCalc.sgst || 0) } : null,
                roundOff: billCalc.roundOff ?? 0,
                grandTotal: billCalc.grandTotal,
                itemCount: billItems.length,
                qtyCount: billItems.reduce((s, i) => s + (i.quantity || i.q || 1), 0),
                section: selectedTable.section?.name || undefined,
                restaurant: {
                  name: restaurant?.name || undefined,
                  receiptHeader: restaurant?.receiptHeader || undefined,
                  receiptSubHeader: restaurant?.receiptSubHeader || undefined,
                  address: restaurant?.address || undefined,
                  phone: restaurant?.phone || undefined,
                },
              });
              const result = await printLocal({
                type: 'FINAL_BILL',
                escposData: billEscpos,
                eventId: billEventId,
                data: {
                  tableNumber: selectedTable.number,
                  items: billItems,
                  subtotal: billCalc.rawSubtotal ?? billCalc.subtotal,
                  discount: discountPercent > 0 ? { percent: discountPercent, amount: billCalc.discountAmount } : null,
                  cgst: billCalc.cgst,
                  sgst: billCalc.sgst,
                  grandTotal: billCalc.grandTotal,
                  roundOff: billCalc.roundOff ?? 0,
                  billNumber: response.billNumber,
                  restaurant: {
                    name: restaurant?.name || undefined,
                    receiptHeader: restaurant?.receiptHeader || undefined,
                    receiptSubHeader: restaurant?.receiptSubHeader || undefined,
                    address: restaurant?.address || undefined,
                    phone: restaurant?.phone || undefined,
                  },
                },
              });
              if (result.printed) {
                addNotification('Local Print', 'Bill printed to local printer.', 'success');
              } else if (result.queued) {
                addNotification('Print Queued', `No local printer: ${result.error || 'queued'}. Click "Retry prints" in the offline bar.`, 'warning');
              }
            } catch (printErr) {
              console.warn('[handleFinalBill] Local print failed:', printErr.message);
            }
          }
        } else {
          const returnedItems = response?.order?.items || response?.items || [];
          const snapshotCount = billItemsSnapshotRef.current.length;
          if (returnedItems.length > 0 && returnedItems.length < snapshotCount) {
            console.warn(`[handleFinalBill] Backend returned ${returnedItems.length} items but snapshot had ${snapshotCount}. NOT updating local state with reduced set.`);
          }
        }
      }

      // Store billNumber from print-bill response onto table state
      const printedBillNumber = response?.billNumber || null;
      if (printedBillNumber) {
        setSelectedTable(prev => prev ? { ...prev, billNumber: printedBillNumber } : prev);
        if (selectedTable.isExtra) {
          setExtraTables(prev => prev.map(et =>
            et.id === selectedTable.id ? { ...et, billNumber: printedBillNumber } : et
          ));
        } else {
          setActiveTables(prev => prev.map(t =>
            t.backendId === selectedTable.backendId ? { ...t, billNumber: printedBillNumber } : t
          ));
        }
      }

      // Update localStorage cache for the table status
      const tableIdForCache = selectedTable.isExtra ? selectedTable.id : selectedTable.backendId;
      if (!selectedTable.isExtra && tableIdForCache) {
        try {
          const cacheKey = activeOutlet === 'bar' ? getBarTablesCacheKey() : getTablesCacheKey();
          const cached = safeGetJSON(cacheKey, []);
          const updatedCache = cached.map(t =>
            t.backendId === tableIdForCache ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : t
          );
          localStorage.setItem(cacheKey, JSON.stringify(updatedCache));
        } catch {}
      }

      addNotification('Success', 'Bill printed successfully.', 'success');

      window.dispatchEvent(new Event('softshape_order_updated'));

      // Per-table cooldown: only block this specific table's button for 2s, not all tables
      const printedTableKey = selectedTable.isExtra ? selectedTable.id : selectedTable?.backendId;
      if (printedTableKey) {
        billPrintCooldownRef.current.set(printedTableKey, Date.now() + 2000);
        setTimeout(() => {
          billPrintCooldownRef.current.delete(printedTableKey);
        }, 2000);
      }

    } catch (error) {
      console.error('Final bill error:', error);
      const tableId = selectedTable.isExtra ? selectedTable.id : selectedTable?.backendId;
      if (localPrinted) {
        // Physical bill was already printed — keep the Settlement button active.
        // The backend sync failed but the bill exists; show a warning, not an error.
        addNotification('Warning', `Bill printed locally but backend sync failed: ${error.message || 'Unknown error'}. Proceed to settlement.`, 'warning');
      } else {
        addNotification('Error', error.message || 'Failed to print bill.', 'error');
        // On error, roll back the bill-printed flag
        if (tableId) {
          setBillPrintedTableIds(prev => {
            const next = new Set(prev);
            next.delete(tableId);
            try { localStorage.setItem(getTenantScopedKey('cashier_bill_printed_tables'), JSON.stringify([...next])); } catch {}
            return next;
          });
          billPrintCooldownRef.current.delete(tableId);
          if (selectedTable.isExtra) {
            setExtraTables(prev => prev.map(et =>
              et.id === tableId ? { ...et, status: 'Occupied', workflowStatus: 'Occupied' } : et
            ));
          }
          setSelectedTable(prev => prev ? { ...prev, status: 'Occupied', workflowStatus: 'Occupied' } : prev);
        }
      }
    } finally {
      setIsPrintingBill(false);
      isPrintingBillRef.current = false;
    }
  };

  // ── Reprint KOT (for restaurant Family Restaurant tables) ──────────────
  const handleReprintKOT = async () => {
    if (!selectedTable?.activeOrder?.id) {
      addNotification('Error', 'No active order to reprint KOT.', 'error');
      return;
    }
    try {
      const restaurantId = selectedTable.section?.restaurantId || activeRestaurantId;

      if (isOffline) {
        // Offline: print from local kotHistory if available
        const kotHistory = selectedTable.kotHistory || [];
        if (kotHistory.length === 0) {
          addNotification('Offline', 'No KOT history available offline.', 'warning');
          return;
        }
        const lastKot = kotHistory[kotHistory.length - 1];
        // Attempt local KOT printing
        try {
          const { printLocal } = await import('../utils/printOffline');
          const kotItems = (lastKot.items || []).map(i => ({
            name: i.n || i.name,
            quantity: i.q || i.quantity || 1,
            notes: i.notes || null,
          }));
          const result = await printLocal({
            jobType: 'KOT',
            data: {
              tableNumber: selectedTable.number,
              items: kotItems,
              kotNumber: lastKot.id || lastKot.kotNumber || 'N/A',
              captainName: lastKot.captainName || 'Cashier',
            },
          });
          if (result.printed) {
            addNotification('Offline KOT', 'KOT printed to local printer.', 'success');
          } else if (result.queued) {
            addNotification('KOT Queued', `No local printer: ${result.error || 'queued'}. Click "Retry prints" in the offline bar.`, 'warning');
          }
        } catch (printErr) {
          console.warn('[handleReprintKOT] Local print failed:', printErr.message);
          addNotification('Offline KOT', 'Reprinted last KOT from local history.', 'warning');
        }
        return;
      }

      // ── Edge server first (local SQLite + direct printer) ─────────────────────
      const useEdgeDirect = isEdgeLocalAuth();
      if (useEdgeDirect || await isEdgeAvailable()) {
        try {
          const edgeResult = await edgeFetch('/api/edge/kot/reprint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: selectedTable.activeOrder.id }),
          });
          if (edgeResult && edgeResult.success) {
            addNotification('KOT Reprinted', 'Kitchen copy sent to printer via edge.', 'success');
            return;
          }
        } catch (edgeErr) {
          if (useEdgeDirect) {
            console.error('[handleReprintKOT] Edge reprint failed:', edgeErr.message);
            addNotification('Reprint Failed', 'Edge server unavailable — please try again.', 'error');
            return;
          }
          console.warn('[handleReprintKOT] Edge reprint failed, falling through to cloud:', edgeErr.message);
        }
      }

      const response = await httpFetch(
        `${API_BASE}/api/orders/${selectedTable.activeOrder.id}/reprint-kot?restaurantId=${restaurantId}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } },
        { retries: 1 }
      );
      if (!response.ok) throw new Error('KOT reprint failed');
      addNotification('KOT Reprinted', 'Kitchen copy sent to printer.', 'success');
    } catch (error) {
      console.error('KOT reprint error:', error);
      addNotification('Error', error.message || 'Failed to reprint KOT.', 'error');
    }
  };

  // ── Venue extra table helpers (shared between bar and restaurant sections) ──
  const handleAddVenueExtraTable = (parentTable) => {
    const existingCount = extraTables.filter(et => et.baseBackendId === parentTable.backendId).length;
    const prefix = (parentTable.sectionName || parentTable.section?.name || '').toLowerCase().includes('family') ? 'F' :
                   (parentTable.sectionName || parentTable.section?.name || '').toLowerCase().includes('parcel') ? 'P' :
                   (parentTable.sectionName || parentTable.section?.name || '').toLowerCase().includes('gobox') ? 'GB' :
                   (parentTable.sectionName || parentTable.section?.name || '').toLowerCase().includes('conference') ? 'C' :
                   (parentTable.sectionName || parentTable.section?.name || '').toLowerCase().includes('room') ? 'R' :
                   (parentTable.sectionName || parentTable.section?.name || '').toLowerCase().includes('pdr') ? 'PDR' :
                   'V';
    const extraId = existingCount === 0 ? `${prefix}${parentTable.number}-X` : `${prefix}${parentTable.number}-X${existingCount + 1}`;
    const localOrderId = `extra-${extraId}-${Date.now()}`;
    setExtraTables(prev => [...prev, {
      id: extraId,
      number: extraId,
      backendId: parentTable.backendId,
      baseBackendId: parentTable.backendId,
      isExtra: true,
      localOrderId,
      status: 'Free',
      sectionId: parentTable.sectionId,
      section: parentTable.section,
      sectionName: parentTable.sectionName,
      sectionTag: parentTable.sectionTag,
      kotHistory: [],
      currentBill: 0,
      activeOrder: null,
      captainId: null,
      guests: 0,
      time: null,
    }]);
  };

  const handleRemoveVenueExtraTable = (extraTable) => {
    const extraItems = getAllOrderItems(extraTable);
    if (extraItems.length > 0) {
      // Do not merge extra-table items back into the parent table visually.
      // Extra tables have their own backend order; merging caused duplicate/untracked items.
      const unsavedItems = extraItems.filter(i => !i.backendId && !i.id);
      if (unsavedItems.length > 0) {
        addNotification('Extra table has unsaved items', 'Settle or save them before removing the extra table.', 'warning');
        return;
      }
    }
    setExtraTables(prev => prev.filter(et => et.id !== extraTable.id));
  };

  const handleWalkinFinalBill = async () => {
    if (cart.length === 0) return;

    // Ref guard - synchronous check to prevent race condition
    if (isPrintingBillRef.current) return;
    isPrintingBillRef.current = true;

    const tableLabel = selectedTable?.id || 'Walk-in';
    // Use calculateOrderTotal so walk-in GST matches the printed receipt exactly
    const walkinCalc = calculateOrderTotal(
      cart.map(i => ({ ...i, menuType: i.menuType || 'FOOD' })),
      discountPercent,
      restaurantConfig
    );
    const subtotalAmt = walkinCalc.rawSubtotal ?? walkinCalc.subtotal;
    const discountAmt = walkinCalc.discountAmount;
    const cgstAmt = walkinCalc.cgst;
    const sgstAmt = walkinCalc.sgst;
    const grandTotalAmt = walkinCalc.grandTotal;
    const requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36));

    try {
      setIsPrintingBill(true);

      if (isOffline || isEdgeLocal) {
        // Offline: queue the walk-in bill action for sync
        const { addPendingAction, addOfflineTransaction } = await import('../utils/offlineDB');
        await addPendingAction({
          requestId,
          entityId: `walkin-${tableLabel}`,
          entityType: 'walkin',
          actionType: 'walkin-final-bill',
          url: '/api/print/final-bill-emit',
          method: 'POST',
          body: {
            restaurantId: activeRestaurantId,
            billData: {
              tableNumber: tableLabel,
              items: cart.map(i => ({
                name: i.n || i.name,
                quantity: i.q,
                price: Number(i.p),
                menuType: i.menuType || 'FOOD',
                notes: i.notes || null
              })),
              subtotal: subtotalAmt,
              grandTotal: grandTotalAmt,
              cgst: cgstAmt,
              sgst: sgstAmt,
              discount: discountPercent > 0 ? { percent: discountPercent, amount: discountAmt } : null,
              captain: 'Walk-in',
              sectionTag: (fetchedSections.find(s => s.venue?.kotEnabled === false)?.sectionTag) || 'venue-restaurant-parcel',
              requestId
            }
          },
        });
        // Store local transaction record
        await addOfflineTransaction({
          localId: `offline-walkin-${Date.now()}`,
          requestId,
          tableLabel,
          grandTotal: grandTotalAmt,
          method: null,
          synced: false,
          createdAt: Date.now(),
        });
        addNotification('Offline', `Walk-in bill queued — will sync when online. Ref: OFFLINE-${requestId.slice(0, 8).toUpperCase()}`, 'warning');
        // Attempt local printing immediately
        try {
          const { printLocal } = await import('../utils/printOffline');
          const result = await printLocal({
            jobType: 'FINAL_BILL',
            data: {
              tableNumber: tableLabel,
              items: cart.map(i => ({
                name: i.n || i.name,
                quantity: i.q,
                price: Number(i.p),
                menuType: i.menuType || 'FOOD',
                notes: i.notes || null
              })),
              subtotal: subtotalAmt,
              discount: discountPercent > 0 ? { percent: discountPercent, amount: discountAmt } : null,
              cgst: cgstAmt,
              sgst: sgstAmt,
              grandTotal: grandTotalAmt,
              billNumber: `OFFLINE-${requestId.slice(0, 8).toUpperCase()}`,
            },
          });
          if (result.printed) {
            addNotification('Local Print', 'Walk-in bill printed to local printer.', 'success');
          } else if (result.queued) {
            addNotification('Print Queued', `No local printer: ${result.error || 'queued'}. Click "Retry prints" in the offline bar.`, 'warning');
          }
        } catch (printErr) {
          console.warn('[handleWalkinFinalBill] Local print failed:', printErr.message);
        }
        setShowSettleConfirm(true);
        return;
      }

      const response = await httpFetch(`${API_BASE}/api/print/final-bill-emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
            cgst: cgstAmt,
            sgst: sgstAmt,
            discount: discountPercent > 0 ? { percent: discountPercent, amount: discountAmt } : null,
            captain: 'Walk-in',
            sectionTag: (fetchedSections.find(s => s.venue?.kotEnabled === false)?.sectionTag) || 'venue-restaurant-parcel',
            requestId
          }
        })
      }, { retries: 1 });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Server returned ${response.status}`);
      }

      addNotification('Walk-in Bill Printed', `${tableLabel} — ₹${grandTotalAmt.toFixed(2)}`, 'success');
      setShowSettleConfirm(true);
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
        // Apply discount update before reprinting (always send, even 0, to reflect current input)
        if (!selectedTable.isExtra && selectedTable.backendId) {
          if (isEdgeLocalAuth()) {
            await edgeFetch(`/api/edge/admin/table/${selectedTable.backendId}`, {
              method: 'PATCH',
              body: JSON.stringify({ discount: discountPercent }),
            });
          } else {
            await httpFetch(`${API_BASE}/api/tables/${selectedTable.backendId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify({ discount: discountPercent }),
            }, { retries: 1 });
          }
          // Persist discount so it survives modal close/reopen until settlement
          localStorage.setItem(getTenantScopedKey(`cashier_table_discount_${selectedTable.backendId}`), JSON.stringify({
            value: String(discountPercent),
            mode: 'percent'
          }));
        } else if (selectedTable.isExtra) {
          setExtraTables(prev => prev.map(et =>
            et.id === selectedTable.id ? { ...et, discountPercent } : et
          ));
        }

        // Call the same print-bill endpoint — backend recalculates with new discount and re-emits to printer
        // Backend reuses the same bill number if one already exists
        const printBillRestaurantId = selectedTable.section?.restaurantId || activeRestaurantId;
        const extraDiscountPercent = selectedTable.isExtra
          ? (discountPercent || selectedTable.discountPercent || 0)
          : 0;
        const extraKotIds = (selectedTable.kotHistory || [])
          .map(k => k.id)
          .filter(Boolean)
          .join(',');
        const response = selectedTable.isExtra
          ? await printBill(orderId, { restaurantId: printBillRestaurantId, tableNumber: selectedTable.number, discountPercent: extraDiscountPercent, kotNumbers: extraKotIds })
          : await printBill(orderId, { restaurantId: printBillRestaurantId });

        // Backend returns 409 if PAID — handle gracefully
        if (response && response.error && !response.offline) {
          throw new Error(response.error);
        }
      } catch (error) {
        console.error('[Reprint] Failed:', error.message);
        addNotification('Re-print Failed', error.message || 'Could not send bill to printer.', 'error');
      }
    })();
  };

  const handlePayment = async (method, tipAmount = 0, cashAmount = 0, cardAmount = 0) => {
    if (!selectedTable || !method) return;
    if (isSubmittingPaymentRef.current) return;
    isSubmittingPaymentRef.current = true;

    // Validate transaction amount
    const txnAmount = Number(activeGrandTotal > 0 ? activeGrandTotal : fallbackTotal);
    if (txnAmount <= 0) {
      // Bug 5 fix: Don't hard-block — the frontend may have stale table data causing a false zero.
      // The backend recalculates totals from fresh DB data inside a transaction.
      // If the backend also sees ₹0, it will reject. But if there are real items in the DB,
      // the settlement will succeed and free the stuck table.
      const billableItems = getBillableItems(selectedTable);
      if (billableItems.length === 0) {
        addNotification(
          'Cannot Settle',
          'No items found on this table. If the table is stuck, use "Force Free Table" from the table menu.',
          'error'
        );
        setShowMethodPicker(false);
        setShowSettleConfirm(false);
        setShowTableModal(false);
        setShowPaymentModal(false);
        isSubmittingPaymentRef.current = false;
        return;
      }
      // Items exist but total is 0 — proceed with settlement, backend will recalculate
      console.warn('[handlePayment] Frontend shows ₹0 but items exist — proceeding with backend settlement to recalculate.');
    }

    // Guard: prevent double-settlement — use same broad resolution as handleFinalBill
    const orderId = selectedTable?.activeOrder?.id ||
      selectedTable?.orders?.[0]?.id ||
      selectedTable?.orderId;
    if (orderId && settledOrderIds.has(orderId)) {
      addNotification('Already Settled', 'This order has already been settled.', 'error');
      setShowMethodPicker(false);
      setShowSettleConfirm(false);
      setShowPaymentModal(false);
      isSubmittingPaymentRef.current = false;
      return;
    }

    // Store previous table state for rollback
    const previousTableState = selectedTable;
    const setTargetTables = setActiveTables;

    // Optimistic update: table becomes free
    const optimisticFn = () => {
      if (selectedTable.isExtra) {
        // Extra table: remove from extraTables state and return user to tables view
        setExtraTables(prev => prev.filter(et => et.id !== selectedTable.id));
        setActiveTab('tables');
        localStorage.setItem(getTenantScopedKey('cashier_active_tab'), 'tables');
      } else {
        // Regular table: update in tables state
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
                  time: null,
                  billNumber: null,
                }
              : t
          )
        );
      }

      // Clear billing alerts for this table
      setBillingAlerts(prev => prev.filter(a => a.tableBackendId !== selectedTable.backendId));

      // ── Release bill-printed lock on settlement ──
      const settledId = selectedTable.isExtra ? selectedTable.id : selectedTable.backendId;
      if (settledId) {
        setBillPrintedTableIds(prev => {
          const next = new Set(prev);
          next.delete(settledId);
          try { localStorage.setItem(getTenantScopedKey('cashier_bill_printed_tables'), JSON.stringify([...next])); } catch {}
          return next;
        });
        billPrintCooldownRef.current.delete(settledId);
      }

      // Close modals and clear state
      setShowMethodPicker(false);
      setShowSettleConfirm(false);
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
        localStorage.removeItem(getTenantScopedKey(`cashier_table_discount_${selectedTable.backendId}`));
      }
      setRawDiscountInput('');
      setExpandedNoteItemId(null);
      setRemovedItemIds([]);

      // Clear stale transaction cache immediately so History tab never shows old data
      // commitFn.loadTransactions will write the fresh list once the API call completes
      try { localStorage.removeItem(TX_CACHE_KEY); } catch {}

      // Show success notification
      addNotification('Payment Success', `${method} • ₹${txnAmount.toFixed(2)} collected`, 'success');

      // Clear walk-in mode after settlement
      if (isWalkinMode) {
        setIsWalkinMode(false);
        setSelectedTable(null);
        setCart([]);
      }

      // FIX 1 & 3: mark table as settled and update cache immediately
      if (selectedTable?.backendId && !selectedTable.isExtra) {
        setSettledTableIds(prev => new Set([...prev, selectedTable.backendId]));
        syncPauseUntilRef.current = Date.now() + 5000;
        // CRITICAL: write to localStorage so tableSyncService/barTableSyncService
        // (which only check localStorage, not in-memory refs) block stale socket events
        terminatedTableIdsRef.current.add(selectedTable.backendId);
        recentlyTerminatedRef.current[selectedTable.backendId] = Date.now();
        try {
          localStorage.setItem(getTenantScopedKey('cashier_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
        } catch {}
        setTimeout(() => terminatedTableIdsRef.current.delete(selectedTable.backendId), 15000);
        const cacheKey = activeOutlet === 'bar' ? getBarTablesCacheKey() : getTablesCacheKey();
        try {
          const cached = safeGetJSON(cacheKey, []);
          const updated = cached.map(t =>
            t.backendId === selectedTable.backendId
              ? { ...t, status: 'Free', workflowStatus: 'Free', activeOrder: null, orders: [], kotHistory: [], currentBill: 0, captainId: null, guests: 0, time: null, billNumber: null }
              : t
          );
          localStorage.setItem(cacheKey, JSON.stringify(updated));
        } catch {}
      }
      // Extra tables are already removed in optimisticFn above

      // Reset loading state immediately after optimistic UI update
      setIsPrintingBill(false);
    };

    // Rollback function: restore previous table state
    const rollbackFn = () => {
      if (previousTableState.isExtra) {
        // Restore extra table in extraTables state
        setExtraTables(prev => prev.map(et =>
          et.id === previousTableState.id ? previousTableState : et
        ));
      } else {
        // Restore regular table in tables state
        setTargetTables((prev) =>
          prev.map((t) =>
            t.backendId === previousTableState.backendId ? previousTableState : t
          )
        );
      }
      setSelectedTable(previousTableState);
      addNotification('Settlement Failed', 'Please try again', 'error');
    };

    // Commit function: call backend settle endpoint
    const commitFn = async () => {
      setIsSettling(true);
      // Add to background queue for final bill + inventory deduction
      await settlementQueueRef.current.add(async () => {
        // Call backend settle endpoint (creates transaction, marks paid, resets table)
        // NO PRINTING - that already happened in handleFinalBill
        if (orderId) {
          const settleRequestId = generateRequestId();
          const settleData = await settleOrder(
            orderId,
            [],
            'Cashier',
            settleRequestId,
            {
              paymentMethod: method,
              tipAmount: Number(tipAmount) || 0,
              cashTipAmount: method === 'CASH' ? (Number(tipAmount) || 0) : (method === 'MIXED' ? 0 : 0),
              cardTipAmount: method === 'CARD' ? (Number(tipAmount) || 0) : (method === 'MIXED' ? 0 : 0),
              cashAmount: Number(cashAmount) || 0,
              cardAmount: Number(cardAmount) || 0,
              discountPercent: selectedTable.isExtra
                ? (discountPercent || selectedTable.discountPercent || 0)
                : discountPercent,
              tableNumber: selectedTable.isExtra ? selectedTable.number : undefined,
              isExtraTable: selectedTable.isExtra ? true : undefined,
              sectionTag: selectedTable.sectionTag || undefined,
              grandTotal: Number(activeGrandTotal),
              roundOff: Number(activeOrderCalc.roundOff ?? 0),
              subtotal: Number(activeSubtotal),
              discountAmount: Number(activeDiscountAmount),
              cgst: Number(activeCgst),
              sgst: Number(activeSgst),
              restaurantId: selectedTable.section?.restaurantId || activeRestaurantId,
              items: getBillableItems(selectedTable)
                .filter(i => Number(i.quantity ?? i.q ?? 1) > 0)
                .map(i => ({
                  name: i.name ?? i.n,
                  quantity: Number(i.quantity ?? i.q ?? 1),
                  price: Number(i.price ?? i.p ?? 0),
                  menuType: i.menuType || 'FOOD',
                })),
            }
          );

          if (settleData?.offline) {
            console.log(`[Settlement] orderId=${orderId} queued offline`);
            recordSettlementAudit({
              requestId: settleRequestId,
              orderId,
              tableId: selectedTable?.backendId || null,
              method,
              amount: txnAmount,
              offline: true,
              status: 'pending',
            });
            // Mark as settled locally to prevent retries
            setSettledOrderIds(prev => new Set([...prev, orderId]));
            if (selectedTable?.backendId) {
              setSettledTableIds(prev => new Set([...prev, selectedTable.backendId]));
              syncPauseUntilRef.current = Date.now() + 5000;
              terminatedTableIdsRef.current.add(selectedTable.backendId);
              recentlyTerminatedRef.current[selectedTable.backendId] = Date.now();
              try {
                localStorage.setItem(getTenantScopedKey('cashier_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
              } catch {}
              setTimeout(() => terminatedTableIdsRef.current.delete(selectedTable.backendId), 15000);
            }

            // Show settlement in Past Transactions immediately while offline
            const offlineTxn = settleData?.transaction;
            if (offlineTxn && isTxnInDateFilter(Date.now())) {
              const mappedOffline = mapOfflineTransaction({
                ...offlineTxn,
                localId: offlineTxn.id,
                orderId,
                createdAt: Date.now(),
              });
              setPastTransactions(prev => {
                if (prev.some(t => t.id === mappedOffline.id)) return prev;
                return [mappedOffline, ...prev];
              });
            }
            loadTransactions(txnDateFilterRef.current, null, { silent: true });
            return;
          }

          console.log(`[Settlement] orderId=${orderId} settled on server`);

          recordSettlementAudit({
            requestId: settleRequestId,
            orderId,
            tableId: selectedTable?.backendId || null,
            method,
            amount: txnAmount,
            offline: false,
            status: 'success',
            syncedAt: Date.now(),
          });

          // Merge returned transaction into pastTransactions immediately (fixes fast-settlement disappearing bills)
          if (settleData?.transaction) {
            const txn = settleData.transaction;
            const mappedTxn = {
              id: txn.id,
              orderId: txn.orderId || null,
              txnNumber: txn.txnNumber || null,
              billNumber: txn.billNumber || null,
              displayId: txn.billNumber ? `B${txn.billNumber}` : (txn.txnNumber ? `T${txn.txnNumber}` : '—'),
              kot: txn.orderId ? `ORD-${txn.orderId.slice(-6).toUpperCase()}` : '—',
              amount: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
              grandTotal: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
              subtotal: Number(txn.subtotal ?? 0),
              discountPercent: Number(txn.discountPercent ?? 0),
              discountAmount: Number(txn.discountAmount ?? 0),
              cgst: Number(txn.cgst ?? 0),
              sgst: Number(txn.sgst ?? 0),
              roundOff: Number(txn.roundOff ?? 0),
              tipAmount: Number(txn.tipAmount ?? 0),
              time: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
              date: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
              timestamp: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? 0 : d.getTime(); } catch { return 0; } })(),
              items: txn.itemCount || (Array.isArray(txn.items) ? txn.items.length : 0),
              itemsList: txn.items || [],
              captainId: txn.captainId || 'CASHIER',
              captainName: txn.captainName || (txn.captainId && txn.captainId !== 'CASHIER' ? txn.captainId : 'Head Cashier'),
              method: txn.method || method,
              tableNumber: txn.tableNumber || null,
              tableDisplayName: txn.tableLabel || (txn.tableNumber ? `T${txn.tableNumber}` : '—'),
              source: sectionTagToSourceRef.current[txn.sectionTag] || activeOutlet,
              restaurantId: activeRestaurantId,
            };
            if (isTxnInDateFilter(txn.paidAt)) {
              setPastTransactions(prev => {
                if (prev.some(t => t.id === mappedTxn.id)) return prev;
                return [mappedTxn, ...prev];
              });
            }
          }

          // Warn if any kitchen inventory deductions failed (non-blocking)
          if (Array.isArray(settleData?.kitchenDeductionErrors) && settleData.kitchenDeductionErrors.length > 0) {
            addNotification(
              'Kitchen Inventory Warning',
              `Settlement succeeded but ${settleData.kitchenDeductionErrors.length} ingredient(s) could not be deducted. Check Kitchen Inventory → Deduction Check.`,
              'warning'
            );
          }

          // Warn if any bar inventory deductions failed (non-blocking)
          if (Array.isArray(settleData?.barDeductionErrors) && settleData.barDeductionErrors.length > 0) {
            addNotification(
              'Bar Inventory Warning',
              `Settlement succeeded but ${settleData.barDeductionErrors.length} bar item(s) could not be deducted. Check Bar Inventory → Deduction Check.`,
              'warning'
            );
          }

          // Warn if any food items have no recipe configured
          if (Array.isArray(settleData?.missingRecipeItems) && settleData.missingRecipeItems.length > 0) {
            addNotification(
              'Missing Recipes',
              `${settleData.missingRecipeItems.join(', ')} — no recipe set up, kitchen stock not deducted.`,
              'warning'
            );
          }

          // Mark as settled locally to prevent retries
          setSettledOrderIds(prev => new Set([...prev, orderId]));

          // FIX 1 & 5: mark table backendId as settled and pause sync for 5s
          if (selectedTable?.backendId) {
            setSettledTableIds(prev => new Set([...prev, selectedTable.backendId]));
            syncPauseUntilRef.current = Date.now() + 5000;
            terminatedTableIdsRef.current.add(selectedTable.backendId);
            recentlyTerminatedRef.current[selectedTable.backendId] = Date.now();
            try {
              localStorage.setItem(getTenantScopedKey('cashier_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
            } catch {}
            setTimeout(() => terminatedTableIdsRef.current.delete(selectedTable.backendId), 15000);
          }
        } else if (isWalkinMode) {
          // Walk-in settlement: no orderId exists, create transaction directly
          const walkinItems = cart
            .filter(i => Number(i.quantity ?? i.q ?? 1) > 0)
            .map(i => ({
              name: i.name ?? i.n,
              quantity: Number(i.quantity ?? i.q ?? 1),
              price: Number(i.price ?? i.p ?? 0),
              menuType: i.menuType || 'FOOD',
            }));

          const walkinSectionTag = (fetchedSections.find(s => s.venue?.kotEnabled === false)?.sectionTag) || 'venue-restaurant-parcel';
          const walkinSectionId = fetchedSections.find(s => s.venue?.kotEnabled === false)?.id || null;

          const walkinRequestId = generateRequestId();
          const txnData = await saveTransaction({
            restaurantId: activeRestaurantId,
            orderId: null,
            tableNumber: null,
            captainId: 'CASHIER',
            amount: Number(activeGrandTotal),
            method,
            itemCount: walkinItems.length,
            items: walkinItems,
            subtotal: Number(activeSubtotal),
            discountPercent: discountPercent || 0,
            discountAmount: Number(activeDiscountAmount),
            cgst: Number(activeCgst),
            sgst: Number(activeSgst),
            grandTotal: Number(activeGrandTotal),
            roundOff: Number(activeOrderCalc.roundOff ?? 0),
            tipAmount: Number(tipAmount) || 0,
            sectionId: walkinSectionId,
            sectionTag: walkinSectionTag,
            billNumber: null,
            platform: 'CASHIER',
          });

          recordSettlementAudit({
            requestId: walkinRequestId,
            orderId: null,
            tableId: null,
            method,
            amount: txnAmount,
            offline: !!txnData?.offline,
            status: 'success',
            syncedAt: txnData?.offline ? null : Date.now(),
          });

          // Merge returned transaction into pastTransactions
          if (txnData) {
            const txn = txnData.transaction || txnData;
            const mappedTxn = {
              id: txn.id,
              orderId: txn.orderId || null,
              txnNumber: txn.txnNumber || null,
              billNumber: txn.billNumber || null,
              displayId: txn.billNumber ? `B${txn.billNumber}` : (txn.txnNumber ? `T${txn.txnNumber}` : '—'),
              kot: '—',
              amount: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
              grandTotal: txn.grandTotal != null ? Number(txn.grandTotal) : Number(txn.amount ?? 0),
              subtotal: Number(txn.subtotal ?? 0),
              discountPercent: Number(txn.discountPercent ?? 0),
              discountAmount: Number(txn.discountAmount ?? 0),
              cgst: Number(txn.cgst ?? 0),
              sgst: Number(txn.sgst ?? 0),
              roundOff: Number(txn.roundOff ?? 0),
              tipAmount: Number(txn.tipAmount ?? 0),
              time: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
              date: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: KOLKATA_TIME_ZONE }); } catch { return '—'; } })(),
              timestamp: (() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? 0 : d.getTime(); } catch { return 0; } })(),
              items: txn.itemCount || (Array.isArray(txn.items) ? txn.items.length : 0),
              itemsList: txn.items || [],
              captainId: txn.captainId || 'CASHIER',
              captainName: 'Head Cashier',
              method: txn.method || method,
              tableNumber: null,
              tableDisplayName: 'Walk-in',
              source: sectionTagToSourceRef.current[txn.sectionTag] || activeOutlet,
              restaurantId: activeRestaurantId,
            };
            if (isTxnInDateFilter(txn.paidAt)) {
              setPastTransactions(prev => {
                if (prev.some(t => t.id === mappedTxn.id)) return prev;
                return [mappedTxn, ...prev];
              });
            }
          }
        }

        // Notify ItemAnalytics and other listeners to refresh
        window.dispatchEvent(new Event('softshape_order_updated'));

        // Immediate refresh (silent to avoid loading flicker)
        loadTransactions(txnDateFilterRef.current, null, { silent: true });
        // Secondary refresh at 3s — silent (no loading overlay flicker)
        setTimeout(() => {
          console.log(`[Settlement] Secondary loadTransactions for orderId=${orderId}`);
          loadTransactions(txnDateFilterRef.current, null, { silent: true });
        }, 3000);
      });
    };

    // Use optimistic update with rollback
    try {
      await withOptimisticUpdate({
        optimisticFn,
        rollbackFn,
        commitFn,
        onError: (error) => {
          logCriticalError('handlePayment', error, { orderId, method, txnAmount });
          addNotification('Settlement Failed', error.message || 'Payment could not be processed. Please retry.', 'error');
        }
      });
    } finally {
      setIsSettling(false);
      isSubmittingPaymentRef.current = false;
    }
  };

  const terminateTableSession = async () => {
    if (!selectedTable) return;
    if (isTerminating) return; // guard against double-click

    const tableSnap = { ...selectedTable }; // snapshot before any state mutation
    // Guard against socket events reviving the just-terminated table
    if (tableSnap.isExtra && tableSnap.id) {
      terminatedTableIdsRef.current.add(tableSnap.id);
      recentlyTerminatedRef.current[tableSnap.id] = Date.now();
      try {
        localStorage.setItem(getTenantScopedKey('cashier_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
      } catch {}
      setTimeout(() => terminatedTableIdsRef.current.delete(tableSnap.id), 6000);
    } else if (tableSnap.backendId) {
      terminatedTableIdsRef.current.add(tableSnap.backendId);
      recentlyTerminatedRef.current[tableSnap.backendId] = Date.now();
      try {
        localStorage.setItem(getTenantScopedKey('cashier_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
      } catch {}
      setTimeout(() => terminatedTableIdsRef.current.delete(tableSnap.backendId), 6000);
    }
    setIsTerminating(true);

    try {
      // Step 1: Call backend FIRST — do not touch UI until we know it succeeded
      if (tableSnap?.backendId) {
        const resId = tableSnap.section?.restaurantId || activeRestaurantId;
        const terminateUrl = (activeOutlet === 'bar' || activeOutlet === 'both')
          ? `${API_BASE}/api/bar/tables/terminate-table/${tableSnap.backendId}?restaurantId=${resId}` 
          : `${API_BASE}/api/orders/terminate-table/${tableSnap.backendId}?restaurantId=${resId}`;

        const response = await httpFetch(terminateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        }, { retries: 1 });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Server returned ${response.status}`);
        }

        // Step 2: Backend confirmed success — table is already fully reset by terminate endpoint
        // (order items deleted, order cancelled, table status set to Free, kotHistory cleared)
      }

      // Step 3: Update local state (only runs if backend succeeded or no backendId)
      // skipPersist: true — backend already set the table to Free via the terminate endpoint;
      // a redundant PATCH would race with the terminate socket events and cause flicker.
      setActiveTables(prev => prev.map(t =>
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
      ), { skipPersist: true });

      // Step 4: For extra tables — remove from extraTables so they vanish from UI immediately
      if (tableSnap.isExtra) {
        setExtraTables(prev => prev.filter(et => et.id !== tableSnap.id));
      }

      // Step 5: Clear UI selections
      setSelectedTable(null);
      setSelectedOrder(null);
      setCart([]);
      lastConfirmedItemsRef.current = [];
      clearCashierTableCache(selectedTable);
      setExpandedNoteItemId(null);
      setRemovedItemIds([]);
      setShowTableModal(false);

      // Step 5b: Clear bill-printed and settlement guards for this table
      const terminatedKey = tableSnap.isExtra ? tableSnap.id : tableSnap.backendId;
      if (terminatedKey) {
        setBillPrintedTableIds(prev => {
          const next = new Set(prev);
          next.delete(terminatedKey);
          try { localStorage.setItem(getTenantScopedKey('cashier_bill_printed_tables'), JSON.stringify([...next])); } catch {}
          return next;
        });
        billPrintCooldownRef.current.delete(terminatedKey);
        setSettledTableIds(prev => {
          const next = new Set(prev);
          next.delete(terminatedKey);
          return next;
        });
      }

      // Clean up persisted discount on terminate

      // Step 6: Evict terminated table from localStorage cache so hard refresh never shows it again
      const cacheKey = (activeOutlet === 'bar' || activeOutlet === 'both') ? getBarTablesCacheKey() : getTablesCacheKey();
      try {
        const cached = safeGetJSON(cacheKey, []);
        const filtered = cached.filter(t => t.backendId !== tableSnap.backendId);
        localStorage.setItem(cacheKey, JSON.stringify(filtered));
      } catch { /* ignore */ }
      if (tableSnap?.backendId) {
        localStorage.removeItem(getTenantScopedKey(`cashier_table_discount_${tableSnap.backendId}`));
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
      // Defensive: recompute expected total from live items before calling backend
      const liveItems = (selectedTable?.activeOrder?.items || [])
        .filter(item => !billRemovals.includes(item.id) && !item.removedFromBill)
        .map(item => ({ ...item, quantity: editQuantities[item.id] ?? item.quantity ?? item.q ?? 1 }));
      const liveCalc = calculateOrderTotal([...liveItems, ...billAdditions], discountPercent, restaurantConfig);
      const updatedOrder = await editBill(selectedTable.activeOrder.id, {
        removedItemIds: billRemovals,
        editQuantities,
        addedItems: billAdditions,
        editedBy: 'Cashier',
      });
      if (updatedOrder?.offline) {
        // Offline: don't merge server fields (they don't exist). Keep local state as-is.
        setBillRemovals([]);
        setBillEditQuantities({});
        setBillAdditions([]);
        setBillEditSearch('');
        setShowBillEditor(false);
        addNotification('Bill Edit Queued', 'Changes saved locally — will sync when online.', 'warning');
      } else {
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
        setBillEditQuantities({});
        setBillAdditions([]);
        setBillEditSearch('');
        setShowBillEditor(false);
        addNotification('Bill Updated', 'Changes saved successfully.', 'success');
      }
    } catch (err) {
      addNotification('Edit Failed', err.message, 'error');
    } finally {
      setIsSavingBillEdit(false);
    }
  };

  const activeCategories = useMemo(() => {
    if (activeOutlet === 'restaurant') return categories;
    const items = barMenuItems.filter(i => i.isAvailable !== false);
    const cats = items.map(i => i.category || i.c).filter(Boolean);
    return ['All', ...new Set(cats)];
  }, [activeOutlet, categories, barMenuItems]);

  const menuTypeSubcategories = useMemo(() => {
    const items = activeOutlet === 'restaurant'
      ? menuItems.filter(i => i.isAvailable !== false)
      : barMenuItems.filter(i => i.isAvailable !== false);
    const filtered = selectedMenuType === 'ALL'
      ? items
      : selectedMenuType === 'FOOD'
        ? items.filter(i => i.menuType !== 'LIQUOR')
        : selectedMenuType === 'LIQUOR'
          ? items.filter(i => i.menuType === 'LIQUOR')
          : selectedMenuType === 'DESSERTS'
            ? items.filter(i => String(i.c || i.category || '').toLowerCase().includes('dessert'))
            : items;
    const cats = filtered.map(i => i.category || i.c).filter(Boolean);
    const now = Date.now();
    const allItemsForSpecials = activeOutlet === 'restaurant' ? menuItems : barMenuItems;
    const hasTodaySpecial = allItemsForSpecials.some(
      item => item.isSpecial && item.active && (!item.expiresAt || now < item.expiresAt) && (item.specialChannel === 'CASHIER' || item.specialChannel === 'BOTH')
    );
    return ['All', ...(hasTodaySpecial ? ['Today Special'] : []), ...new Set(cats)];
  }, [selectedMenuType, activeOutlet, menuItems, barMenuItems]);

  const todaySpecials = useMemo(() => {
    const now = Date.now();
    const source = activeOutlet === 'restaurant' ? menuItems : barMenuItems;
    return (source || []).filter(
      i => i.isSpecial && i.active && (!i.expiresAt || now < i.expiresAt) && (i.specialChannel === 'CASHIER' || i.specialChannel === 'BOTH')
    );
  }, [menuItems, barMenuItems, activeOutlet]);

  const activeMenuItems = useMemo(() => {
    let itemsToFilter = [];
    const isVenueContext = fetchedSections.some(s => (sectionTagToSource[s.sectionTag] || s.name) === tableSubCategory);

    if (activeOutlet === 'restaurant') {
      itemsToFilter = menuItems.filter(item => item.isAvailable !== false);
    } else {
      itemsToFilter = barMenuItems.filter(i => i.isAvailable !== false);
    }

    // Determine current venue ID from selected table or sub-category
    // Prioritize tableSubCategory over selectedTable section
    let currentVenueId = null;
    const matchingSection = fetchedSections.find(s => (sectionTagToSource[s.sectionTag] || s.name) === tableSubCategory);
    if (matchingSection) {
      currentVenueId = matchingSection.venueId || matchingSection.venue?.id || null;
    } else if (selectedTable) {
      currentVenueId = selectedTable.section?.venueId || selectedTable.section?.venue?.id || null;
      if (!currentVenueId) {
        const sectionName = (selectedTable.sectionName || selectedTable.section?.name || '').toLowerCase();
        const tableSection = fetchedSections.find(s => s.name.toLowerCase() === sectionName);
        if (tableSection) {
          currentVenueId = tableSection.venueId || tableSection.venue?.id || null;
        }
      }
    }

    // Filter out items disabled for this venue
    if (currentVenueId) {
      itemsToFilter = itemsToFilter.filter(item => item.venueAvailabilities?.[currentVenueId] !== false);
    }

    // Build venue price map from item.venuePrices keyed by venue ID
    const venueSpecificPrices = {};
    if (currentVenueId) {
      for (const item of itemsToFilter) {
        const vp = item.venuePrices?.[currentVenueId];
        if (vp !== undefined) venueSpecificPrices[item.id] = vp;
      }
    }

    const isBarVenueContext = (activeOutlet === 'bar' || activeOutlet === 'both') && Boolean(currentVenueId);

    const mapped = itemsToFilter.map(item => {
      const overridePrice = venueSpecificPrices[item.id];

      let finalPrice;
      if (isBarVenueContext) {
        // Venue override if explicitly set, otherwise fall back to base item price
        finalPrice = (overridePrice != null && Number(overridePrice) > 0)
          ? Number(overridePrice)
          : Number(item.p || item.price || 0);
      } else {
        // Restaurant / main floor: venue override if set and > 0, else base price
        finalPrice = (overridePrice != null && Number(overridePrice) > 0)
          ? Number(overridePrice)
          : Number(item.p || item.price || 0);
      }

      const remappedVariants = item.variants?.map((v, idx) => {
        const variantOverride = venueSpecificPrices[`${item.id}_variant_${v.id}`];
        if (variantOverride !== undefined) {
          return { ...v, price: Number(variantOverride) };
        }
        // Apply item-level venue price override to the default (or first) variant
        if (overridePrice != null && Number(overridePrice) > 0 && (v.isDefault || (idx === 0 && !item.variants.some(vv => vv.isDefault)))) {
          return { ...v, price: Number(overridePrice) };
        }
        // If no variant-specific override but variant has no price, use item's venue price
        const variantBasePrice = v.price || v.p || 0;
        if (variantBasePrice === 0 && finalPrice > 0) {
          return { ...v, price: finalPrice };
        }
        return v;
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
      // In restaurant context, show all items (even with p=0, which may be a newly
      // added item without venue price yet). The price will be resolved from variant.
      return true;
    });

    const q = searchQuery.trim().toLowerCase();

    const filtered = mapped.filter((item) => {
      // 0. Menu type filter (FOOD / LIQUOR / DESSERTS / ALL)
      if (selectedMenuType === 'FOOD' && item.menuType === 'LIQUOR') return false;
      if (selectedMenuType === 'LIQUOR' && item.menuType !== 'LIQUOR') return false;
      if (selectedMenuType === 'DESSERTS') {
        const cat = String(item.c || item.category || '').toLowerCase();
        return cat.includes('dessert');
      }

      // 1. Diet filter
      if (activeDiet !== 'All' && item.t !== activeDiet) return false;

      // 2. Search query filter
      if (q.length > 0) {
        if (!itemMatchesQuery(item, q)) return false;
      } else {
        // 3. Category filter (only active if no search query)
        if (selectedCategory !== 'All') {
          if (selectedCategory === 'Today Special') {
            const now = Date.now();
            if (!(item.isSpecial && item.active && (!item.expiresAt || now < item.expiresAt) && (item.specialChannel === 'CASHIER' || item.specialChannel === 'BOTH'))) {
              return false;
            }
          } else if ((item.c || item.category) !== selectedCategory) {
            return false;
          }
        }
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
  }, [activeOutlet, menuItems, barMenuItems, searchQuery, selectedCategory, selectedMenuType, activeDiet, selectedTable, tableSubCategory, fetchedSections, sectionTagToSource]);

  const handleTableSelect = (table) => {
    setIsModalDataLoading(false);
    if (table.isExtra) {
      // Always use the fresh version from extraTables state — the grid snapshot may be stale
      // (e.g. activeOrder.id not yet set before createOrder resolved)
      const freshExtra = extraTables.find(et => et.id === table.id) || table;
      console.log('[ExtraTable] handleTableSelect:', freshExtra.id, {
        hasActiveOrder: !!freshExtra.activeOrder,
        itemCount: freshExtra.activeOrder?.items?.length ?? 0,
        kotHistoryCount: freshExtra.kotHistory?.length ?? 0,
        currentBill: freshExtra.currentBill,
        status: freshExtra.status,
        firstItem: freshExtra.activeOrder?.items?.[0] ?? null,
      });
      clearCashierTableCache(selectedTable);
      lastKnownBillRef.current = 0;
      lastAnyItemAddedRef.current = 0;
      setSelectedTable(freshExtra);
      setCart([]);
      setSelectedOrder(null);
      lastConfirmedItemsRef.current = [];
      setExpandedNoteItemId(null);

      const hasItems = (freshExtra.activeOrder?.items?.length || 0) > 0 || (freshExtra.kotHistory?.length || 0) > 0;
      const hasBill = Number(freshExtra.currentBill || 0) > 0;
      const isFreeExtra = (!freshExtra.status || freshExtra.status === 'Free') && !hasItems && !hasBill;
      // Pre-populate discount if this extra table already has one stored
      if (freshExtra.discountPercent && Number(freshExtra.discountPercent) > 0) {
        setDiscountMode('percent');
        setRawDiscountInput(String(Number(freshExtra.discountPercent)));
      } else {
        setRawDiscountInput('');
      }
      if (isFreeExtra) {
        setActiveTab('pos');
        localStorage.setItem(getTenantScopedKey('cashier_active_tab'), 'pos');
      } else {
        setShowTableModal(true);
      }
      return;
    }

    // Defensive: clear any previous table's cart from localStorage before switching
    clearCashierTableCache(selectedTable);
    lastKnownBillRef.current = 0; // Reset bill ref when selecting a new table
    lastAnyItemAddedRef.current = 0;
    // Set click cooldown to prevent socket echo from flickering the table
    if (table.backendId) {
      tableClickCooldownRef.current.set(table.backendId, Date.now() + 500);
      setTimeout(() => { tableClickCooldownRef.current.delete(table.backendId); }, 500);
    }
    setSelectedTable(table);
    setCart([]);
    setSelectedOrder(null);
    lastConfirmedItemsRef.current = [];
    setExpandedNoteItemId(null);

    if (!table.status || table.status === 'Free' || table.status === 'AVAILABLE') {
      setActiveTab('pos');
      localStorage.setItem(getTenantScopedKey('cashier_active_tab'), 'pos');
    } else {
      // Open modal immediately — don't block on network
      setShowTableModal(true);
      if (activeOutlet === 'bar' || activeOutlet === 'both') refetchBarTables();
      else refetchRestaurantTables();
      // Restore saved discount for this table if one exists
      const savedDiscount = localStorage.getItem(getTenantScopedKey(`cashier_table_discount_${table.backendId}`));
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

    // Background refresh: fetch fresh order data for occupied regular tables only
    // Does NOT block the modal from opening — silently patches in the data
    // Skip for extra tables: they share backendId with parent; fetchFreshOrderData would return parent order
    const isOccupied = table.status && table.status !== 'Free' && table.status !== 'AVAILABLE';
    if (table.backendId && isOccupied && !table.isExtra) {
      const gen = ++fetchGenerationRef.current;
      setIsModalDataLoading(true);
      fetchFreshOrderData(table.backendId).then(freshOrder => {
        if (gen !== fetchGenerationRef.current) return; // stale response — user switched tables
        if (freshOrder) {
          setSelectedTable(prev => {
            if (!prev || prev.backendId !== table.backendId || prev.isExtra) return prev; // user moved on or extra table
            // Server is authoritative — replace items entirely, no local-only merge
            const freshItems = freshOrder.items || [];
            lastFetchUpdateRef.current = { backendId: table.backendId, ts: Date.now() };
            return {
              ...prev,
              activeOrder: { ...freshOrder, items: freshItems },
            };
          });
        }
        setIsModalDataLoading(false);
      }).catch(() => {
        if (gen !== fetchGenerationRef.current) return; // stale error, discard
        // Silent — stale cached data is still better than nothing
        setIsModalDataLoading(false);
      });
    }
  };

  const handleAddItem = (item) => {
    const now = Date.now();
    const lastAdd = addItemCooldownRef.current['__global__'] || 0;
    if (now - lastAdd < 900) return; // 900ms global cooldown between item additions
    addItemCooldownRef.current['__global__'] = now;

    // Show typeable quantity picker for every item
    setLiquorQtyItem(item);
    setShowLiquorQtyPicker(true);
  };

  const handleQtySelect = (qty) => {
    if (!liquorQtyItem) return;
    addToCart(liquorQtyItem, qty);
    setShowLiquorQtyPicker(false);
    setLiquorQtyItem(null);
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

  const addToCart = (item, quantity = 1) => {
    kotRequestIdRef.current = null;
    lastKotCartSignatureRef.current = null;
    if (!selectedTable) {
      addNotification('Select Table', 'Please assign a table before adding items.', 'warning');
      setActiveTab('tables');
      localStorage.setItem(getTenantScopedKey('cashier_active_tab'), 'tables');
      return;
    }
    setCart(prev => {
      const itemId = String(item.id || item.menuItemId || '');
      const existing = prev.find(i => {
        if (itemId && String(i.id || i.menuItemId || '') === itemId && i.n === item.n) return true;
        if (!itemId && i.n === item.n) return true;
        return false;
      });
      if (existing) return prev.map(i => {
        if (itemId && String(i.id || i.menuItemId || '') === itemId && i.n === item.n) return { ...i, q: i.q + quantity };
        if (!itemId && i.n === item.n) return { ...i, q: i.q + quantity };
        return i;
      });
      return [...prev, { ...item, q: quantity }];
    });
  };

  const updateQty = (id, delta) => {
    kotRequestIdRef.current = null;
    lastKotCartSignatureRef.current = null;
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
    kotRequestIdRef.current = null;
    lastKotCartSignatureRef.current = null;
    setCart(prev =>
      prev.map(i => i.id === itemId ? { ...i, notes: note.trim() || null } : i)
    );
  };

  const saveEditQty = (itemId) => {
    const qty = Math.max(1, Math.floor(Number(editQtyValue) || 1));
    kotRequestIdRef.current = null;
    lastKotCartSignatureRef.current = null;
    setCart(prev =>
      prev.map(i => i.id === itemId ? { ...i, q: qty } : i)
    );
    setEditQtyItemId(null);
    setEditQtyValue('');
  };

  const handleSmartKOT = async () => {
    if (isKotSending || isSubmittingKotRef.current || cart.length === 0) return;
    if (isModalDataLoading) {
      addNotification('Loading', 'Table data is refreshing — please wait a moment.', 'warning');
      return;
    }
    isSubmittingKotRef.current = true;
    setIsKotSending(true);
    setIsKotSuccess(false);

    // Generate requestId for idempotency; reuse on retry if cart hasn't changed.
    const cartSignature = cart.map(i => `${i.id || i.menuItemId}:${i.q ?? i.quantity ?? 1}:${i.notes ?? ''}`).sort().join('|');
    let requestId;
    if (kotRequestIdRef.current && lastKotCartSignatureRef.current === cartSignature) {
      // Retry with same cart contents — reuse the same requestId so backend idempotency short-circuits
      requestId = kotRequestIdRef.current;
    } else {
      requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
      kotRequestIdRef.current = requestId;
      lastKotCartSignatureRef.current = cartSignature;
    }
    // Register this requestId so socket echoes from our own KOT submission are skipped
    processedSocketRequestIds.current.add(requestId);
    // Clean up after 30s to prevent unbounded growth
    setTimeout(() => { processedSocketRequestIds.current.delete(requestId); }, 30000);

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

    const newTotalBill = selectedTable ? calculateSessionBill(selectedTable, cart, restaurantConfig).total : 0;

    try {
      let orderResponse = null;

      // 1. Reserve KOT number first (for local printing with real number)
      let preReservedKotNumber = null;
      let localPrinted = false;
      try {
        const reserved = await reserveKotNumber(requestId);
        preReservedKotNumber = reserved?.kotNumber ?? null;
      } catch (reserveErr) {
        console.warn('[KOT] Reserve KOT number failed, falling back to cloud-only:', reserveErr.message);
      }

      // 2. If we have a reserved KOT number, generate ESC/POS and try local print FIRST.
      //    This ensures localPrinted is known before the API call, so the backend
      //    gets the correct flag and can skip socket emission when local print succeeded.
      //    Shared eventIds ensure the Print Agent deduplicates even if the response is lost.
      let kotEventIds = [];
      if (preReservedKotNumber != null && (selectedTable?.backendId || selectedTable?.isExtra)) {
        // Guard: prevent double-printing the same KOT number in this session
        const alreadyPrinted = _printedKotNumbers.has(preReservedKotNumber);
        if (alreadyPrinted) {
          console.warn(`[KOT] KOT #${preReservedKotNumber} already printed in this session — skipping local print`);
          localPrinted = true;
        } else {
        const kotOrderData = {
          tableNumber: selectedTable?.number ?? selectedTable?.id,
          orderId: selectedTable?.activeOrder?.id || 'pending',
          items: cart.map(i => ({
            name: i.n || i.name,
            quantity: i.q ?? i.quantity ?? 1,
            price: Number(i.p ?? i.price ?? 0),
            notes: i.notes || null,
            type: (i.menuType || 'FOOD').toUpperCase() === 'LIQUOR' ? 'liquor' : 'food',
          })),
          kotId: String(preReservedKotNumber),
          sectionName: selectedTable?.section?.name || 'Main Hall',
          captainName: 'Cashier',
          sectionTag: selectedTable?.sectionTag || undefined,
          restaurantName: restaurant?.name || undefined,
        };

        const foodEscpos = buildFoodKOT(kotOrderData);
        const liquorEscpos = buildLiquorKOT(kotOrderData);

        // Generate shared eventIds for dedup between local print and socket emission
        const foodEventId = `${requestId}-food`;
        const liquorEventId = `${requestId}-liquor`;
        kotEventIds = [];
        if (foodEscpos.length > 0) kotEventIds.push(foodEventId);
        if (liquorEscpos.length > 0) kotEventIds.push(liquorEventId);

        const localPrintPromises = [];
        if (foodEscpos.length > 0) {
          localPrintPromises.push(
            printLocal({
              type: 'KOT',
              escposData: foodEscpos,
              eventId: foodEventId,
              data: kotOrderData,
            }).catch(err => console.warn('[KOT] Local food print failed:', err.message))
          );
        }
        if (liquorEscpos.length > 0) {
          localPrintPromises.push(
            printLocal({
              type: 'BAR_KOT',
              escposData: liquorEscpos,
              eventId: liquorEventId,
              data: kotOrderData,
            }).catch(err => console.warn('[KOT] Local liquor print failed:', err.message))
          );
        }

        // Await local print results BEFORE sending the API call.
        // This ensures the backend gets the correct localPrinted flag.
        const localPrintResults = await Promise.allSettled(localPrintPromises);
        localPrinted = localPrintResults.some(r => r.status === 'fulfilled' && r.value?.printed);

        if (localPrinted) {
          _printedKotNumbers.add(preReservedKotNumber);
          console.log(`[KOT] Local print succeeded for KOT #${preReservedKotNumber} — backend will skip socket emission`);
        } else {
          console.log(`[KOT] Local print failed for KOT #${preReservedKotNumber} — backend will emit via socket`);
        }
        } // end else (not already printed)

        // 3. Send API call with correct localPrinted flag and shared kotEventIds.
        try {
          if (selectedTable.isExtra) {
            const orderId = selectedTable.activeOrder?.id;
            if (orderId) {
              orderResponse = await updateOrderItems(orderId, apiItems, requestId, 'Cashier', true, selectedTable.number, selectedTable.activeOrder?.updatedAt, 45000, localPrinted, preReservedKotNumber, kotEventIds, selectedTable.id);
            } else {
              orderResponse = await createOrder({
                tableId: selectedTable.backendId,
                tableNumber: selectedTable.number,
                restaurantId: selectedTable.section?.restaurantId || activeRestaurantId,
                items: apiItems,
                requestId,
                captainName: undefined,
                isExtraTable: true,
                sectionTag: selectedTable.sectionTag || undefined,
                platform: selectedOrderPlatform,
                timeoutMs: 45000,
                preReservedKotNumber,
                localPrinted,
                kotEventIds,
              });
            }
          } else if (selectedTable.activeOrder?.id) {
            orderResponse = await updateOrderItems(selectedTable.activeOrder.id, apiItems, requestId, 'Cashier', false, null, selectedTable.activeOrder?.updatedAt, 45000, localPrinted, preReservedKotNumber, kotEventIds, selectedTable.id);
          } else {
            try {
              orderResponse = await createOrder({
                tableId: selectedTable.backendId,
                tableNumber: selectedTable.number || selectedTable.id,
                restaurantId: selectedTable.section?.restaurantId || activeRestaurantId,
                items: apiItems,
                requestId,
                captainName: undefined,
                sectionTag: selectedTable.sectionTag || undefined,
                platform: selectedOrderPlatform,
                timeoutMs: 45000,
                preReservedKotNumber,
                localPrinted,
                kotEventIds,
              });
            } catch (createErr) {
              if (createErr.statusCode === 409 && createErr.existingOrderId) {
                console.warn('[KOT] Table already has an active order, retrying as update:', createErr.existingOrderId);
                // Fetch the existing order so the cashier knows what's already on the table
                try {
                  const existingOrder = await fetchFreshOrderData(selectedTable.backendId);
                  if (existingOrder?.items?.length > 0) {
                    setSelectedTable(prev => prev ? { ...prev, activeOrder: existingOrder } : prev);
                    addNotification(
                      'Table Already Has Order',
                      `Table ${selectedTable.number} already has ${existingOrder.items.length} item(s). Your new items will be added to this order.`,
                      'warning'
                    );
                  }
                } catch (fetchErr) {
                  console.warn('[KOT] Failed to fetch existing order for 409 fallback:', fetchErr.message);
                }
                setSelectedTable(prev => prev ? { ...prev, activeOrder: { ...prev.activeOrder, id: createErr.existingOrderId } } : prev);
                orderResponse = await updateOrderItems(createErr.existingOrderId, apiItems, requestId, 'Cashier', false, null, null, 45000, localPrinted, preReservedKotNumber, kotEventIds, selectedTable.id);
              } else {
                throw createErr;
              }
            }
          }
        } catch (apiErr) {
          // API call failed. If local print succeeded, warn user about sync pending.
          if (localPrinted) {
            console.warn('[KOT] API failed but local print succeeded — KOT was printed but not synced to server');
            addNotification(
              `KOT #${preReservedKotNumber} Printed ⚠ Sync Pending`,
              'KOT was printed to kitchen but server sync failed. Please retry to confirm.',
              'warning'
            );
            return;
          }
          // API failed and local print did not succeed — release the reserved KOT
          // number so it doesn't create a gap in the sequence.
          if (preReservedKotNumber != null && requestId) {
            releaseKotNumber(requestId);
          }
          throw apiErr;
        }

      } else {
        // Fallback: cloud-only flow (reserve failed or no table)
        if (selectedTable?.backendId || selectedTable?.isExtra) {
          if (selectedTable.isExtra) {
            const orderId = selectedTable.activeOrder?.id;
            if (orderId) {
              console.log('[ExtraTable] updateOrderItems:', orderId, 'items:', apiItems.length);
              orderResponse = await updateOrderItems(orderId, apiItems, requestId, 'Cashier', true, selectedTable.number, selectedTable.activeOrder?.updatedAt, 45000, false, null, null, selectedTable.id);
            } else {
              orderResponse = await createOrder({
                tableId: selectedTable.backendId,
                tableNumber: selectedTable.number,
                restaurantId: selectedTable.section?.restaurantId || activeRestaurantId,
                items: apiItems,
                requestId,
                captainName: undefined,
                isExtraTable: true,
                sectionTag: selectedTable.sectionTag || undefined,
                platform: selectedOrderPlatform,
                timeoutMs: 45000,
              });
            }
          } else if (selectedTable.activeOrder?.id) {
            orderResponse = await updateOrderItems(selectedTable.activeOrder.id, apiItems, requestId, 'Cashier', false, null, selectedTable.activeOrder?.updatedAt, 45000, false, null, null, selectedTable.id);
          } else {
            try {
              orderResponse = await createOrder({
                tableId: selectedTable.backendId,
                tableNumber: selectedTable.number || selectedTable.id,
                restaurantId: selectedTable.section?.restaurantId || activeRestaurantId,
                items: apiItems,
                requestId,
                captainName: undefined,
                sectionTag: selectedTable.sectionTag || undefined,
                platform: selectedOrderPlatform,
                timeoutMs: 45000,
              });
            } catch (createErr) {
              if (createErr.statusCode === 409 && createErr.existingOrderId) {
                console.warn('[KOT] Table already has an active order, retrying as update:', createErr.existingOrderId);
                // Fetch the existing order so the cashier knows what's already on the table
                try {
                  const existingOrder = await fetchFreshOrderData(selectedTable.backendId);
                  if (existingOrder?.items?.length > 0) {
                    setSelectedTable(prev => prev ? { ...prev, activeOrder: existingOrder } : prev);
                    addNotification(
                      'Table Already Has Order',
                      `Table ${selectedTable.number} already has ${existingOrder.items.length} item(s). Your new items will be added to this order.`,
                      'warning'
                    );
                  }
                } catch (fetchErr) {
                  console.warn('[KOT] Failed to fetch existing order for 409 fallback:', fetchErr.message);
                }
                orderResponse = await updateOrderItems(createErr.existingOrderId, apiItems, requestId, 'Cashier', false, null, null, 45000, false, null, null, selectedTable.id);
                setSelectedTable(prev => prev ? { ...prev, activeOrder: { ...prev.activeOrder, id: createErr.existingOrderId } } : prev);
              } else {
                throw createErr;
              }
            }
          }
        }
      }

      // API confirmed: clear any terminated block on this table so socket events
      // for the new order are not blocked. This is the legitimate re-occupation path.
      if (selectedTable?.backendId) {
        clearTerminatedTable(selectedTable.backendId);
        clearBarTerminatedTable(selectedTable.backendId);
      }

      // API confirmed: build KOT display from cart and update the table with server data.
      const foodItems = cart.filter(i => i.menuType === 'FOOD' || !i.menuType);
      const barItems = cart.filter(i => i.menuType === 'LIQUOR');
      const timestamp = Date.now();
      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      const kotsToCreate = [];
      if (foodItems.length > 0) {
        kotsToCreate.push({
          id: `${requestId}-food`,
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
          id: `${requestId}-liquor`,
          type: 'LIQUOR',
          time: timeStr,
          items: barItems.map(i => ({ ...i, s: 'KOT Sent' })),
          status: 'Incoming',
          createdAt: timestamp + 1,
          itemsReady: 0,
        });
      }

      const serverItems = orderResponse?.order?.items || orderResponse?.items || [];
      // Always prefer server kotHistory over local kotsToCreate (which are only a fallback)
      const serverKotHistory = (orderResponse?.order?.kotHistory?.length > 0)
        ? orderResponse.order.kotHistory
        : (orderResponse?.kotHistory?.length > 0)
          ? orderResponse.kotHistory
          : kotsToCreate;
      const resolvedOrderId = orderResponse?.id || orderResponse?.order?.id || selectedTable?.activeOrder?.id;

      if (selectedTable) {
        const committedSoFar = getBillableItems(selectedTable);
        lastConfirmedItemsRef.current = [...committedSoFar, ...cart];

        if (selectedTable.isExtra) {
          setExtraTables(prev => prev.map(et => {
            if (et.id !== selectedTable.id) return et;
            return {
              ...et,
              status: et.status === 'Free' ? 'Preparing' : et.status,
              workflowStatus: et.status === 'Free' ? 'Preparing' : et.workflowStatus,
              kotHistory: (() => {
                const existing = (et.kotHistory || []);
                const existingIds = new Set(existing.map(k => String(k.id)));
                return [...existing, ...(Array.isArray(serverKotHistory) ? serverKotHistory : []).filter(k => !existingIds.has(String(k.id)))];
              })(),
              currentBill: newTotalBill,
              activeOrder: {
                id: resolvedOrderId,
                items: serverItems.length ? serverItems : (et.activeOrder?.items || []),
                totalAmount: newTotalBill,
              },
            };
          }));
          setSelectedTable(prev => {
            if (!prev || prev.id !== selectedTable.id) return prev;
            return {
              ...prev,
              status: prev.status === 'Free' ? 'Preparing' : prev.status,
              workflowStatus: prev.status === 'Free' ? 'Preparing' : prev.workflowStatus,
              kotHistory: (() => {
                const existing = (prev.kotHistory || []);
                const existingIds = new Set(existing.map(k => String(k.id)));
                return [...existing, ...(Array.isArray(serverKotHistory) ? serverKotHistory : []).filter(k => !existingIds.has(String(k.id)))];
              })(),
              currentBill: newTotalBill,
              activeOrder: {
                id: resolvedOrderId,
                items: serverItems.length ? serverItems : (prev.activeOrder?.items || []),
                totalAmount: newTotalBill,
              },
            };
          });
        } else {
          const updater = prev => prev.map(t => {
            if (t.id !== selectedTable.id && t.backendId !== selectedTable.backendId) return t;
            const kotStatus = t.status === 'Waiting Bill' ? 'Waiting Bill' : 'Preparing';
            return {
              ...t,
              status: kotStatus,
              workflowStatus: kotStatus,
              kotHistory: (() => {
                const existing = (t.kotHistory || []);
                const existingIds = new Set(existing.map(k => String(k.id)));
                return [...existing, ...(Array.isArray(serverKotHistory) ? serverKotHistory : []).filter(k => !existingIds.has(String(k.id)))];
              })(),
              currentBill: newTotalBill,
              activeOrder: {
                id: resolvedOrderId,
                items: serverItems.length ? serverItems : (t.activeOrder?.items || []),
                totalAmount: newTotalBill,
              },
            };
          });
          setActiveTables(updater, { skipPersist: true });
          setSelectedTable(prev => {
            if (!prev) return prev;
            const kotStatusSel = prev.status === 'Waiting Bill' ? 'Waiting Bill' : 'Preparing';
            return {
              ...prev,
              status: kotStatusSel,
              workflowStatus: kotStatusSel,
              kotHistory: (() => {
                const existing = (prev.kotHistory || []);
                const existingIds = new Set(existing.map(k => String(k.id)));
                return [...existing, ...(Array.isArray(serverKotHistory) ? serverKotHistory : []).filter(k => !existingIds.has(String(k.id)))];
              })(),
              currentBill: newTotalBill,
              activeOrder: {
                id: resolvedOrderId,
                items: serverItems.length ? serverItems : (prev.activeOrder?.items || []),
                totalAmount: newTotalBill,
              },
            };
          });
        }
      }

      if (orderResponse || !selectedTable?.backendId) {
        setCart([]);
        kotRequestIdRef.current = null;
        lastKotCartSignatureRef.current = null;
        lastAnyItemAddedRef.current = 0;
        setExpandedNoteItemId(null);
        setIsKotSuccess(true);
        if (orderResponse?.offline) {
          addNotification('KOT Queued (Offline)', `KOT for Table ${selectedTable?.id || 'Walk-in'} saved locally — will sync when back online.`, 'warning');
        } else {
          addNotification('KOT Pushed', `Sent ${kotsToCreate.length} KOT(s) for Table ${selectedTable?.id || 'Walk-in'}.`, 'success');
        }
        setTimeout(() => setIsKotSuccess(false), 2000);
      }
    } catch (err) {
      console.error('[KOT] API failed:', err.message);
      const isTimeout = err.message?.includes('timed out') || err.name === 'AbortError';
      // Network-level errors (no HTTP status code) are ambiguous — the backend
      // may have processed the request and emitted the print job, but the response
      // was lost in transit.  HTTP errors (400, 401, 409, etc.) have a status code
      // and are definitive — the backend rejected the request, no print happened.
      const isNetworkError = !err.status && !err.statusCode;
      const needsVerification = (isTimeout || isNetworkError) && selectedTable?.backendId;

      if (needsVerification) {
        // Timeout or network error = unknown outcome. Check if the server actually committed the items.
        try {
          const verifyController = new AbortController();
          const verifyTimeout = setTimeout(() => verifyController.abort(), 5000);
          const verifyRes = await fetch(`${API_BASE}/api/orders/table/${selectedTable.backendId}`, {
            headers: getAuthHeaders(),
            signal: verifyController.signal,
          });
          clearTimeout(verifyTimeout);
          if (verifyRes.ok) {
            const freshOrder = await verifyRes.json();
            const serverItems = freshOrder?.items || [];
            // Check if all cart items are present in the server order
            const serverItemMap = new Map();
            for (const si of serverItems) {
              if (!si.removedFromBill) {
                const key = `${si.menuItemId}::${si.notes ?? ''}`;
                serverItemMap.set(key, (serverItemMap.get(key) || 0) + Number(si.quantity ?? si.q ?? 0));
              }
            }
            const allPresent = apiItems.every(ai => {
              const key = `${ai.menuItemId}::${ai.notes ?? ''}`;
              return (serverItemMap.get(key) || 0) >= ai.quantity;
            });

            if (allPresent) {
              // Items were actually committed — treat as success
              const serverKotHistory = freshOrder?.kotHistory?.length > 0 ? freshOrder.kotHistory : [];
              if (selectedTable.isExtra) {
                setExtraTables(prev => prev.map(et => {
                  if (et.id !== selectedTable.id) return et;
                  const existingKot = et.kotHistory || [];
                  const existingIds = new Set(existingKot.map(k => String(k.id)));
                  return { ...et, kotHistory: [...existingKot, ...serverKotHistory.filter(k => !existingIds.has(String(k.id)))], activeOrder: { ...et.activeOrder, id: freshOrder.id, items: serverItems } };
                }));
              } else {
                setActiveTables(prev => prev.map(t => {
                  if (t.backendId !== selectedTable.backendId) return t;
                  const existingKot = t.kotHistory || [];
                  const existingIds = new Set(existingKot.map(k => String(k.id)));
                  return { ...t, kotHistory: [...existingKot, ...serverKotHistory.filter(k => !existingIds.has(String(k.id)))], activeOrder: { ...t.activeOrder, id: freshOrder.id, items: serverItems } };
                }));
              }
              setSelectedTable(prev => prev ? {
                ...prev,
                kotHistory: (() => {
                  const existingKot = prev.kotHistory || [];
                  const existingIds = new Set(existingKot.map(k => String(k.id)));
                  return [...existingKot, ...serverKotHistory.filter(k => !existingIds.has(String(k.id)))];
                })(),
                activeOrder: { ...prev.activeOrder, id: freshOrder.id, items: serverItems },
              } : prev);

              setCart([]);
              kotRequestIdRef.current = null;
              lastKotCartSignatureRef.current = null;
              lastAnyItemAddedRef.current = 0;
              setIsKotSuccess(true);
              addNotification('KOT Sent', 'Server confirmed items were committed.', 'success');
              setTimeout(() => setIsKotSuccess(false), 2000);
              return;
            }
          }
        } catch (verifyErr) {
          console.warn('[KOT] Verification fetch failed:', verifyErr.message);
        }
        // Verification failed or items not found — show uncertain message
        addNotification(
          'KOT Submission Uncertain',
          'Request failed and server state could not be verified. Please check the order before retrying.',
          'warning'
        );
      } else {
        // Definitive HTTP error (400, 401, 409, etc.) — keep cart for retry
        addNotification(
          'KOT Not Sent to Kitchen',
          `${err.message || 'Network error'}. Cart kept — tap KOT again to retry.`,
          'error'
        );
      }
    } finally {
      isSubmittingKotRef.current = false;
      setIsKotSending(false);
    }
  };

  const settlementBreakdown = useMemo(() => {
    const breakdown = { CASH: 0, CARD: 0, UPI: 0, OTHER: 0, count: 0 };
    for (const txn of completedTransactions) {
      const method = (txn.method || '').toUpperCase();
      const amt = Number(txn.grandTotal ?? txn.amount ?? 0);
      if (method === 'MIXED') {
        const cash = Number(txn.cashAmount ?? 0);
        const card = Number(txn.cardAmount ?? 0);
        const other = Math.max(0, amt - cash - card);
        breakdown.CASH += cash;
        breakdown.CARD += card;
        breakdown.OTHER += other;
      } else if (method === 'CASH') breakdown.CASH += amt;
      else if (method === 'CARD') breakdown.CARD += amt;
      else if (method === 'UPI') breakdown.UPI += amt;
      else breakdown.OTHER += amt;
      breakdown.count++;
    }
    return breakdown;
  }, [completedTransactions]);

  const stats = [
    { label: "Total Sales", value: `₹${Number(dashboardTotalSales).toFixed(2)}`, change: `${completedTransactions.length} txns ${dashboardDate ? `(${dashboardDate})` : '(Today)'}`, icon: Wallet, color: "text-green-600", bg: "bg-green-50" },
    { label: "Discounts", value: `₹${Number(dashboardTotalDiscounts).toFixed(2)}`, change: `${completedTransactions.filter(t => Number(t.discountAmount ?? 0) > 0).length} discounted txns ${dashboardDate ? `(${dashboardDate})` : '(Today)'}`, icon: Tag, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Expenditures", value: `₹${Number(dashboardExpenditureAmount).toFixed(2)}`, change: `${expenditureSummary?.count || 0} expenditures ${dashboardDate ? `(${dashboardDate})` : '(Today)'}`, icon: Receipt, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Final Amount", value: `₹${Number(dashboardFinalAmount).toFixed(2)}`, change: "Total Sales − Expenditures", icon: Banknote, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <div className="flex flex-col-reverse sm:flex-row h-[100dvh] bg-[#F8FAFC] font-sans overflow-hidden text-[#1E293B]">
      <OfflineStatusBar />
      <PendingActionsModal open={showPendingModal} onClose={() => setShowPendingModal(false)} />
      <DeadLetterBanner />
      {/* SIDEBAR / BOTTOM BAR */}
      <aside className="w-full sm:w-20 lg:w-64 h-16 sm:h-auto bg-[#1E3A8A] border-t sm:border-t-0 sm:border-r border-white/15 flex sm:flex-col z-30 transition-all shrink-0">
        <div className="hidden sm:flex p-3 lg:p-4 border-b border-white/15 items-center justify-center shrink-0 bg-[#1E3A8A]">
          <div className="bg-white p-1.5 lg:p-3 rounded-2xl lg:rounded-[24px] shadow-lg lg:shadow-xl border border-gray-50 aspect-square w-14 lg:w-32 flex items-center justify-center">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape"
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
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'vouchers', label: 'Expenditures', icon: Receipt },
            { id: 'xreport', label: 'X Report', icon: FileText },
            { id: 'billfinder', label: 'Bill Finder', icon: Search },
          ].filter(item => {
            if (isEdgeLocal && (item.id === 'vouchers' || item.id === 'xreport')) return false;
            return true;
          }).map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); localStorage.setItem(getTenantScopedKey('cashier_active_tab'), item.id); }}
              className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1.5 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all duration-150 group relative shrink-0 min-w-[80px] sm:min-w-0 hover:scale-[1.02] active:scale-98 text-center sm:text-left ${activeTab === item.id
                ? 'bg-[#F59E0B] text-[#1E293B] font-black shadow-lg shadow-[#F59E0B]/20 scale-[1.01]'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
            >
              <item.icon size={22} className={activeTab === item.id ? 'text-[#1E293B]' : 'text-white/80 group-hover:scale-110 transition-transform'} />
              <span className="text-[10px] sm:hidden font-bold leading-none mt-1">{item.label}</span>
              <span className="hidden sm:block text-xs lg:text-sm font-black uppercase tracking-wider whitespace-nowrap">{item.label}</span>
              {activeTab === item.id && (
                <span className="hidden sm:block absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
              )}
            </button>
          ))}
        </nav>

        <div className="hidden sm:block p-3 border-t border-white/15 mt-auto pb-6">
          <button onClick={onLogout} className="flex items-center gap-3 w-full p-3 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all hover:scale-[1.02] active:scale-98">
            <LogOut size={22} className="text-white/80 group-hover:text-white" />
            <span className="hidden lg:block text-xs md:text-sm font-black uppercase tracking-wider text-white/80 group-hover:text-white">Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN VIEW */}
      <div className="flex-grow flex flex-col min-w-0 overflow-hidden">
        {/* COMPACT TOP BAR */}
        <header className="h-18 bg-[#1E3A8A] border-b border-white/15 px-6 flex items-center justify-between z-20 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">

            <div className="flex items-center gap-2.5 text-white/80">
              <Clock size={18} />
              <span className="text-xs md:text-sm font-black tabular-nums">{currentTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs md:text-sm font-black leading-none text-white">{user?.name || 'Cashier'}</p>
                <p className="text-[10px] text-white/70 font-black uppercase mt-1">{user?.role === 'OWNER' || user?.role === 'ADMIN' ? user.role : 'Cashier'}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-base shadow-inner border border-white/20">🤵</div>
              <button onClick={onLogout} className="sm:hidden ml-2 p-2 rounded-lg bg-white/10 text-white/90 hover:text-white hover:bg-white/20"><LogOut size={20} /></button>
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
                          setShowSettleConfirm(true);
                          setActiveTab('tables');
                          localStorage.setItem(getTenantScopedKey('cashier_active_tab'), 'tables');
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
                        <div key={i} className="min-w-[75vw] sm:min-w-0 snap-start shrink-0 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
                          <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shrink-0 shadow-inner`}>
                            <stat.icon size={24} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                            <p className={`text-xl sm:text-2xl font-black font-mono ${stat.color} leading-none mt-1`}>{stat.value}</p>
                            <p className="text-[10px] font-bold text-gray-400 mt-1 truncate">{stat.change}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Settlement Breakdown Summary */}
                    {settlementBreakdown.count > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 mb-3 flex items-center gap-2">
                          <Banknote size={16} className="text-[#1E3A8A]" />
                          Settlement Breakdown
                          <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">{settlementBreakdown.count} transactions</span>
                        </h3>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                            <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Cash</p>
                            <p className="text-lg font-black text-amber-700 tabular-nums">₹{settlementBreakdown.CASH.toFixed(2)}</p>
                          </div>
                          <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                            <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-1">Card</p>
                            <p className="text-lg font-black text-green-700 tabular-nums">₹{settlementBreakdown.CARD.toFixed(2)}</p>
                          </div>
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">UPI</p>
                            <p className="text-lg font-black text-blue-700 tabular-nums">₹{settlementBreakdown.UPI.toFixed(2)}</p>
                          </div>
                          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                            <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1">Other</p>
                            <p className="text-lg font-black text-orange-700 tabular-nums">₹{settlementBreakdown.OTHER.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Live Floor Status — Full Width, Only Running Tables */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
                          <Table2 size={18} className="text-[#1E3A8A]" />
                          Live Floor Status
                          <span className="bg-[#F59E0B] text-[#1E293B] text-[10px] font-black px-2.5 py-1 rounded-full">
                            {dashboardFloorTables.filter(t => t.status && t.status !== 'Free').length} Running
                          </span>
                          {!socketConnected && (
                            <span className="bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Offline — KOT still works
                            </span>
                          )}
                        </h3>
                        <div className="flex gap-4">
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Busy</span></div>
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bill</span></div>
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-orange-400" /><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Preparing</span></div>
                        </div>
                      </div>

                      {dashboardFloorTables.filter(t => {
                        if (!t.status || t.status === 'Free') return false;
                        const termTs = recentlyTerminatedRef.current[t.backendId];
                        if (termTs && Date.now() - termTs < 5000) return false;
                        return true;
                      }).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                          <Table2 size={52} className="text-gray-200 mb-4" />
                          <p className="text-base font-black uppercase tracking-widest text-gray-300">All Tables Free</p>
                          <p className="text-xs text-gray-300 font-bold mt-1.5">No active sessions on the floor</p>
                        </div>
                      ) : (
                        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                          {dashboardFloorTables
                            .filter(t => {
                              if (!t.status || t.status === 'Free') return false;
                              const termTs = recentlyTerminatedRef.current[t.backendId];
                              if (termTs && Date.now() - termTs < 5000) return false;
                              return true;
                            })
                            .sort((a, b) => {
                              if (a.status === 'Waiting Bill' && b.status !== 'Waiting Bill') return -1;
                              if (a.status !== 'Waiting Bill' && b.status === 'Waiting Bill') return 1;
                              return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
                            })
                            .map((table, i) => {
                              const hasItems = (table.kotHistory?.length > 0) || (table.activeOrder?.items?.length > 0) || Number(table.currentBill ?? 0) > 0;
                              const isWaitingBill = table.status === 'Waiting Bill' || table.status === 'BILLING_REQUESTED' || table.status === 'BILLING';
                              const isPreparing = table.status === 'Preparing' && hasItems;
                              const isOccupied = hasItems && !isWaitingBill && !isPreparing;
                              const bill = calculateTableBill(table, restaurantConfig);
                              const billAmt = bill?.subtotal > 0
                                ? bill.subtotal
                                : Math.max(
                                    Number(table.currentBill || 0),
                                    Number(table.activeOrder?.totalAmount || 0),
                                    Number(table.orders?.[0]?.totalAmount || 0)
                                  );

                              let cardBg = 'bg-white border-gray-200';
                              let textColor = 'text-gray-400';
                              let badgeCls = 'bg-gray-100 text-gray-400';
                              let statusLabel = 'Free';
                              let pulseClass = '';

                              if (isWaitingBill) {
                                cardBg = 'bg-yellow-100 border-yellow-400';
                                textColor = 'text-yellow-700';
                                badgeCls = 'bg-yellow-200 text-yellow-800';
                                statusLabel = 'Bill Requested';
                                pulseClass = 'animate-pulse';
                              } else if (isPreparing) {
                                cardBg = 'bg-orange-50 border-orange-400';
                                textColor = 'text-orange-700';
                                badgeCls = 'bg-orange-100 text-orange-700';
                                statusLabel = 'Preparing';
                              } else if (isOccupied) {
                                cardBg = 'bg-red-50 border-red-400';
                                textColor = 'text-red-600';
                                badgeCls = 'bg-red-100 text-red-700';
                                statusLabel = 'Occupied';
                              }

                              return (
                                <div
                                  key={i}
                                  className={`border-2 rounded-2xl p-4 flex flex-col gap-3 transition-all shadow-sm select-none ${cardBg} ${pulseClass}`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <span className={`text-4xl font-black leading-none ${textColor}`}>
                                      {activeOutlet === 'bar' || activeOutlet === 'both' ? `B${table.number ?? table.id}` : (table.number ?? table.id)}
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
                                    {isWaitingBill && table.billNumber && (
                                      <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${textColor}`}>
                                        {String(table.billNumber).startsWith('OFFLINE-')
                                          ? <span className="bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded">📱 {table.billNumber}</span>
                                          : <>Bill #{table.billNumber}</>
                                        }
                                      </p>
                                    )}
                                    <p className="text-xl font-black text-gray-900">
                                      ₹{billAmt > 0 ? billAmt.toFixed(2) : '—'}
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
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                        {activeTab === 'tables'
                          ? (fetchedSections.find(s => s.name === tableSubCategory)?.name
                            || fetchedSections.find(s => (sectionTagToSource[s.sectionTag] || s.name) === tableSubCategory)?.name
                            || tableSubCategory)
                          : activeTab.replace('-', ' ') + ' Feed'}
                      </h2>
                      {enabledModules.bar && enabledModules.food && (
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                          {['both', 'bar', 'restaurant'].map(outlet => (
                            <button
                              key={outlet}
                              onClick={() => setActiveOutlet(outlet)}
                              className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all ${activeOutlet === outlet
                                ? 'bg-[#F59E0B] text-[#1E293B] shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                              {outlet === 'both' ? 'All' : outlet}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Unified venue/section filter pills — drives transactions + analytics */}
                    {activeTab !== 'tables' && venueFilterSections.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mr-1">Venue:</span>
                        <button
                          onClick={() => setActiveVenueFilter('all')}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${activeVenueFilter === 'all'
                            ? 'bg-[#F59E0B] text-[#1E293B] shadow-sm'
                            : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                          All
                        </button>
                        {venueFilterSections.map(section => {
                          const sourceKey = sectionTagToSource[section.sectionTag] || section.name;
                          return (
                            <button
                              key={sourceKey}
                              onClick={() => setActiveVenueFilter(sourceKey)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${activeVenueFilter === sourceKey
                                ? 'bg-[#F59E0B] text-[#1E293B] shadow-sm'
                                : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                              {section.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {activeTab === 'tables' && enabledModules.tables !== false && (
                      <div className="space-y-4">
                        {/* ── SUBCATEGORY PILLS — dynamically from fetched sections ── */}
                        <div className="flex gap-2 flex-wrap">
                          {fetchedSections.length > 0
                            ? fetchedSections
                                .filter(section => {
                                  const sectionOutlet = isBarLikeVenue(section.venue?.venueType) ? 'bar' : 'restaurant';
                                  if (activeOutlet === 'both') return true;
                                  return sectionOutlet === activeOutlet;
                                })
                                .map(section => {
                                const sourceKey = sectionTagToSource[section.sectionTag] || section.name;
                                return (
                                  <button
                                    key={sourceKey}
                                    onClick={() => handleTabSwitch(sourceKey)}
                                    className={`px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-black border-2 transition-all shadow-sm ${tableSubCategory === sourceKey
                                        ? 'bg-[#F59E0B] text-[#1E293B] border-[#F59E0B]'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                                      }`}
                                  >
                                    {section.name}
                                  </button>
                                );
                              })
                            : sectionsLoading ? (
                              <div className="flex items-center gap-3 py-4">
                                <div className="inline-block w-6 h-6 border-3 border-gray-200 border-t-[#1E3A8A] rounded-full animate-spin"></div>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Loading sections...</p>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2 py-8">
                                <p className="text-gray-500 font-bold text-sm">No sections found for this outlet.</p>
                                <p className="text-gray-400 text-xs">Create sections and tables in the admin panel to see them here.</p>
                              </div>
                            )}
                        </div>

                        {/* ── MAIN TABLES ── */}
                        {/* Main bar section — uses activeTables from current restaurant */}
                        {(activeOutlet === 'bar' || activeOutlet === 'both') && tableSubCategory === (fetchedSections.find(s => s.venue?.venueType === 'BAR')?.name || '') && tableSubCategory !== '' && (
                          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-3.5">
                            {[...activeTables.filter((table) => {
                                const matchingSection = fetchedSections.find(s => s.venue?.venueType === 'BAR');
                                const sectionName = (table.sectionName || table.section?.name || '').toLowerCase();
                                return matchingSection ? sectionName === matchingSection.name.toLowerCase() : false;
                              }).sort((a, b) => Number(a.number || a.id) - Number(b.number || b.id)),
                              ...extraTables
                                .filter(et => {
                                  const termTs = recentlyTerminatedRef.current[et.id];
                                  return !(termTs && Date.now() - termTs < 5000);
                                })
                                .sort((a, b) => String(a.number).localeCompare(String(b.number)))
                            ]
                              .map((table) => {
                                const hasItems = (table.kotHistory?.length > 0) || (table.activeOrder?.items?.length > 0) || Number(table.currentBill ?? 0) > 0;
                                const isFree = !hasItems;
                                const isWaitingBill = hasItems && (table.status === 'Waiting Bill' || table.status === 'BILLING_REQUESTED' || table.status === 'BILLING');
                                const isBusy = hasItems && !isWaitingBill;
                                const isExtra = table.isExtra;
                                const hasExtra = false; // Always show + button to allow multiple extra tables

                                let containerClass = 'bg-white border border-gray-200 text-gray-400 hover:border-gray-300 hover:shadow-md';
                                let statusText = 'Open';
                                let statusClass = 'text-gray-400 bg-gray-100';

                                if (isExtra) {
                                  containerClass = 'bg-blue-50 border-2 border-dashed border-blue-400 text-blue-600 hover:border-blue-500 hover:shadow-md';
                                  statusText = 'Extra';
                                  statusClass = 'text-blue-600 bg-blue-100';
                                } else if (isWaitingBill) {
                                  containerClass = 'bg-yellow-100 border border-yellow-400 text-yellow-700 shadow-md animate-pulse';
                                  statusText = 'Bill';
                                  statusClass = 'text-yellow-700 bg-yellow-200';
                                } else if (isBusy) {
                                  containerClass = 'bg-red-50 border border-red-400 text-red-600 shadow-md';
                                  statusText = 'Busy';
                                  statusClass = 'text-red-600 bg-red-100';
                                }

                                return (
                                  <div
                                    key={isExtra ? `extra-${table.id}` : (table.backendId || table.id)}
                                    onClick={() => handleTableSelect(table)}
                                    className={`aspect-square rounded-2xl flex flex-col items-center justify-center text-center p-2.5 cursor-pointer transition-all hover:scale-105 active:scale-95 relative shadow-sm ${containerClass}`}
                                  >
                                    {/* Add Extra (+) button — top-left, only on non-extra tables */}
                                    {!isExtra && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // Generate sequential extra ID: B1-X, B1-X2, B1-X3...
                                          const existingCount = extraTables.filter(et => et.baseBackendId === table.backendId).length;
                                          const extraId = existingCount === 0 ? `${table.number}-X` : `${table.number}-X${existingCount + 1}`;
                                          const localOrderId = `extra-${extraId}-${Date.now()}`;
                                          setExtraTables(prev => [...prev, {
                                            id: extraId,
                                            number: extraId,
                                            backendId: table.backendId,
                                            baseBackendId: table.backendId,
                                            isExtra: true,
                                            localOrderId,
                                            status: 'Free',
                                            sectionId: table.sectionId,
                                            section: table.section,
                                            sectionName: table.sectionName,
                                            kotHistory: [],
                                            currentBill: 0,
                                            activeOrder: null,
                                            captainId: null,
                                            guests: 0,
                                            time: null,
                                          }]);
                                        }}
                                        className="absolute top-1 left-1 w-4 h-4 bg-green-500 text-white rounded-full flex items-center justify-center text-[10px] font-black hover:bg-green-600 z-10 shadow"
                                        title={`Add extra session for B${table.number}`}
                                      >+</button>
                                    )}
                                    {/* Remove Extra (−) button — top-left on extra tables */}
                                    {isExtra && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // Find the original/main table
                                          const mainTable = activeTables.find(t => t.backendId === table.baseBackendId);
                                          if (!mainTable) {
                                            setExtraTables(prev => prev.filter(et => et.id !== table.id));
                                            return;
                                          }
                                          // Collect items from the extra table
                                          const extraItems = getAllOrderItems(table);
                                          if (extraItems.length > 0) {
                                            // Merge items into main table's activeOrder.items and kotHistory
                                            const mainItems = mainTable.activeOrder?.items || [];
                                            const mainKotHistory = mainTable.kotHistory || [];
                                            const extraKotHistory = table.kotHistory || [];
                                            const mergedItems = [...mainItems, ...extraItems.map(i => ({
                                              id: null,
                                              n: i.n || i.name,
                                              name: i.n || i.name,
                                              p: Number(i.p ?? i.price ?? 0),
                                              price: Number(i.p ?? i.price ?? 0),
                                              q: Number(i.q ?? i.quantity ?? 1),
                                              quantity: Number(i.q ?? i.quantity ?? 1),
                                              menuType: (i.menuType || 'FOOD').toUpperCase(),
                                              removedFromBill: false,
                                              notes: i.notes || null,
                                            }))];
                                            const mergedKotHistory = [...mainKotHistory, ...extraKotHistory];
                                            const newBill = calculateOrderTotal(mergedItems, 0, restaurantConfig).total;
                                            // Update main table
                                            const updater = prev => prev.map(t => {
                                              if (t.backendId === mainTable.backendId) {
                                                return {
                                                  ...t,
                                                  status: t.status === 'Free' ? 'Occupied' : t.status,
                                                  kotHistory: mergedKotHistory,
                                                  currentBill: newBill,
                                                  activeOrder: t.activeOrder
                                                    ? { ...t.activeOrder, items: mergedItems }
                                                    : { id: null, items: mergedItems, totalAmount: newBill },
                                                };
                                              }
                                              return t;
                                            });
                                            setActiveTables(updater);
                                            // Also update selectedTable if it's the main table
                                            setSelectedTable(prev => {
                                              if (!prev || prev.backendId !== mainTable.backendId) return prev;
                                              return {
                                                ...prev,
                                                kotHistory: mergedKotHistory,
                                                currentBill: newBill,
                                                activeOrder: prev.activeOrder
                                                  ? { ...prev.activeOrder, items: mergedItems }
                                                  : { id: null, items: mergedItems, totalAmount: newBill },
                                              };
                                            });
                                          }
                                          // Remove extra table
                                          setExtraTables(prev => prev.filter(et => et.id !== table.id));
                                        }}
                                        className="absolute top-1 left-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-black hover:bg-red-600 z-10 shadow"
                                        title={`Remove extra session B${table.number} — items move to main table`}
                                      >−</button>
                                    )}
                                    {/* Captain Name Badge - Top Right */}
                                    {table.captainName && (
                                      <div className="absolute top-1 right-1 bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-[6px] text-[8px] font-black uppercase tracking-widest max-w-[70%] truncate shadow-sm">
                                        {table.captainName.split(' ')[0]}
                                      </div>
                                    )}
                                    <span className="text-3xl font-black leading-none">{isExtra ? `B${table.number}` : `B${table.number ?? table.id}`}</span>
                                    <span className={`mt-1.5 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-wider ${statusClass}`}>{statusText}</span>
                                    {!isFree && (
                                      <span className="text-xs md:text-sm font-black opacity-70 mt-1">₹{calculateTableBill(table, restaurantConfig).grandTotal}</span>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}


                        {/* ── GENERIC VENUE SECTION VIEWS (data-driven from fetchedSections) ── */}
                        {fetchedSections
                          .filter(section => {
                            const sourceKey = sectionTagToSource[section.sectionTag] || section.name;
                            // Skip the first bar section (main bar hall) — it has its own dedicated view above.
                            // Use the same identifier the dedicated view uses: the section's .name
                            const firstBarSection = fetchedSections.find(s => s.venue?.venueType === 'BAR');
                            const firstBarIdentifier = firstBarSection?.name || '';
                            if (section.venue?.venueType === 'BAR' && section.name === firstBarIdentifier && firstBarIdentifier) return false;
                            // Skip KOT-off sections — they show walk-in tables instead of regular tables
                            if (section.venue?.kotEnabled === false) return false;
                            // Show all sections from backend (onboarding/admin) without venue type filtering
                            // Sections should display exactly as configured in the system
                            return true;
                          })
                          .map(section => {
                            const sourceKey = sectionTagToSource[section.sectionTag] || section.name;
                            if (tableSubCategory !== sourceKey) return null;
                            return (
                              <VenueSectionView
                                key={section.id || sourceKey}
                                venueId={section.sectionTag || section.venueId || sourceKey}
                                sectionName={section.name}
                                sectionId={section.id}
                                restaurantId={getCurrentRestaurantId()}
                                roomMode="single"
                                onTableSelect={handleTableSelect}
                                onOrderPlaced={() => { }}
                                venueTables={activeTables}
                                isSyncing={false}
                                refetch={activeOutlet === 'bar' || activeOutlet === 'both' ? refetchBarTables : refetchRestaurantTables}
                                extraTables={extraTables}
                                onAddExtraTable={handleAddVenueExtraTable}
                                onRemoveExtraTable={handleRemoveVenueExtraTable}
                                compactMode={true}
                              />
                            );
                          })
                        }
                        {activeOutlet === 'restaurant' && fetchedSections.some(s => {
                          const sourceKey = sectionTagToSource[s.sectionTag] || s.name;
                          return sourceKey === tableSubCategory && s.venue?.kotEnabled === false;
                        }) && (
                          <div className="mt-4">
                            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Walk-in (Direct Bill — No KOT)</p>
                            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                              {buildWalkInTables().map((wt) => (
                                <div
                                  key={wt.id}
                                  onClick={() => {
                                    clearCashierTableCache(selectedTable);
                                    setIsWalkinMode(true);
                                    setSelectedTable(wt);
                                    setCart([]);
                                    setActiveTab('pos');
                                    localStorage.setItem(getTenantScopedKey('cashier_active_tab'), 'pos');
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
                        {/* PENDING transactions warning */}
                        {(() => {
                          const pendingTxns = pastTransactions.filter(t => (t.status || 'COMPLETED') === 'PENDING');
                          if (pendingTxns.length === 0) return null;
                          return (
                            <div className="m-3 mb-0 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <AlertCircle size={20} className="text-amber-600" />
                                <div>
                                  <p className="text-sm font-black text-amber-900">
                                    {pendingTxns.length} Pending Bill{pendingTxns.length > 1 ? 's' : ''} — Awaiting Payment Confirmation
                                  </p>
                                  <p className="text-xs text-amber-700">
                                    {pendingTxns.map(t => t.displayId || t.billNumber).filter(Boolean).join(', ')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={handleBulkConfirmPayment}
                                  disabled={bulkConfirmSaving}
                                  className={`text-xs font-black text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
                                    bulkConfirmSaving
                                      ? 'bg-green-400 cursor-not-allowed'
                                      : 'bg-green-600 hover:bg-green-700'
                                  }`}
                                >
                                  {bulkConfirmSaving ? (
                                    <><Loader2 size={12} className="animate-spin" /> Confirming...</>
                                  ) : (
                                    <><CheckCircle2 size={12} /> Confirm All</>
                                  )}
                                </button>
                                <button
                                  onClick={() => setTxnStatusFilter('PENDING')}
                                  className="text-xs font-black text-amber-700 bg-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-300 transition"
                                >
                                  View →
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                        {/* Total Amount Summary */}
                        <div className="m-3 mb-2">
                          <div className="bg-gradient-to-br from-[#1E3A8A] to-[#4A6A9A] border border-blue-200 rounded-xl p-4 flex flex-col gap-1 shadow-lg">
                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-100">Total Revenue (Pre-tax)</span>
                            <span className="text-3xl font-black text-white">
                              ₹{completedTransactions.reduce((sum, t) => sum + netTotal(t), 0).toFixed(2)}
                            </span>
                            <span className="text-[10px] font-bold text-blue-100">
                              {completedTransactions.length} transactions · Grand Total: ₹{completedTransactions.reduce((sum, t) => sum + Number(t.grandTotal ?? 0), 0).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Cash / UPI / Card / Other summary */}
                        <div className="grid grid-cols-4 gap-2 m-3 mt-0 mb-0">
                          {[
                            { label: 'Cash', method: 'CASH', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
                            { label: 'UPI', method: 'UPI', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                            { label: 'Card', method: 'CARD', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
                            { label: 'Other', method: 'OTHER', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
                          ].map(({ label, method, color, bg, border }) => {
                            const total = completedTransactions
                              .filter(t => t.method === method)
                              .reduce((sum, t) => sum + netTotal(t), 0);
                            const count = completedTransactions.filter(t => t.method === method).length;
                            return (
                              <div key={method} className={`${bg} border ${border} rounded-xl p-3 flex flex-col gap-0.5`}>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${color}`}>{label}</span>
                                <span className="text-sm font-black text-gray-900">₹{total.toFixed(2)}</span>
                                <span className="text-[9px] font-bold text-gray-400">{count} txns</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Tips summary — separate from sales */}
                        {(() => {
                          const tipTxns = completedTransactions.filter(t => Number(t.tipAmount ?? 0) > 0);
                          const totalTips = tipTxns.reduce((sum, t) => sum + Number(t.tipAmount ?? 0), 0);
                          if (totalTips <= 0) return null;
                          return (
                            <div className="mx-3 mt-2 mb-0 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Tips Collected</span>
                                <span className="text-sm font-black text-gray-900">₹{totalTips.toFixed(2)}</span>
                                <span className="text-[9px] font-bold text-gray-400">{tipTxns.length} tip transactions</span>
                              </div>
                              <Wallet size={20} className="text-amber-500" />
                            </div>
                          );
                        })()}
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
                              onClick={() => { setTxnDateFilter(f.key); setTxnSourceFilter('all'); setTxnMethodFilter('all'); setTxnStatusFilter('all'); setTxnSearch(''); setTxnCustomDate(''); }}
                              className={`px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${txnDateFilter === f.key && !txnCustomDate
                                ? 'bg-[#F59E0B] text-[#1E293B] shadow-sm'
                                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                            >
                              {f.label}
                            </button>
                          ))}
                          <input
                            type="date"
                            value={txnCustomDate}
                            max={getKolkataDateString()}
                            onChange={e => {
                              const val = e.target.value;
                              setTxnCustomDate(val);
                              if (val) {
                                setTxnDateFilter('custom');
                                loadTransactions('custom', val);
                              }
                            }}
                            className={`px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold border-2 outline-none transition-colors cursor-pointer ${
                              txnCustomDate
                                ? 'border-[#F59E0B] text-[#F59E0B] bg-[#F59E0B]/10'
                                : 'border-gray-200 text-gray-600 bg-white hover:border-gray-400'
                            }`}
                          />
                          <button
                            onClick={() => { loadTransactions(txnDateFilter); setTxnSourceFilter('all'); setTxnMethodFilter('all'); setTxnStatusFilter('all'); setTxnSearch(''); setTxnCustomDate(''); }}
                            className="ml-auto px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-850 hover:scale-[1.01] active:scale-[0.99] transition-all shadow-sm"
                          >
                            ↻ Sync
                          </button>
                        </div>
                        {/* Status filter row */}
                        <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap border-b border-gray-100">
                          {[
                            { key: 'all', label: 'All Status' },
                            { key: 'COMPLETED', label: 'Completed' },
                            { key: 'PENDING', label: 'Pending' },
                            { key: 'CANCELLED', label: 'Cancelled' },
                          ].map(f => (
                            <button
                              key={f.key}
                              onClick={() => setTxnStatusFilter(f.key)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all ${txnStatusFilter === f.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                        {/* FIX 4: Method filter + Search row */}
                        <div className="flex items-center gap-2 flex-wrap px-3 py-3 border-b border-gray-50">
                          {[
                            { key: 'all', label: 'All' },
                            { key: 'CASH', label: 'Cash' },
                            { key: 'UPI', label: 'UPI' },
                            { key: 'CARD', label: 'Card' },
                            { key: 'OTHER', label: 'Other' },
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
                          {txnsLoading && !txnInitialLoaded && filteredTransactions.length > 0 && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-xl">
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-7 h-7 border-2 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
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
                                <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">Date/Time</th>
                                <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">Status</th>
                                <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500">Method</th>
                                <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500 text-right">Amount</th>
                                <th className="p-4 text-xs md:text-sm font-black uppercase text-gray-500 text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {txnsLoading && !txnInitialLoaded && filteredTransactions.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="p-12 text-center">
                                    <div className="flex flex-col items-center justify-center gap-2 py-8">
                                      <div className="w-7 h-7 border-2 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading...</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : filteredTransactions.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="p-12 text-center">
                                    <History size={32} className="text-gray-300 mb-2 mx-auto" />
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No Transactions Found</p>
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
                                        <span className="text-xs md:text-sm font-black text-[#1E3A8A]">{txn.displayId || '—'}</span>
                                      </td>
                                      <td className="p-4">
                                        <span className="text-xs md:text-sm font-black text-gray-900">
                                          {txn.txnNumber ? `TXN-${String(txn.txnNumber).padStart(3, '0')}` : '—'}
                                        </span>
                                      </td>
                                      {/* FIX 6: Table Number */}
                                      <td className="p-4">
                                        <span className="text-xs md:text-sm font-black text-gray-700">
                                          {txn.tableDisplayName || '—'}
                                        </span>
                                      </td>
                                      <td className="p-4">
                                        <div className="flex flex-col">
                                          <span className="text-xs md:text-sm font-black text-gray-700">{txn.date}</span>
                                          <span className="text-xs text-gray-400 font-bold mt-0.5">{txn.time}</span>
                                        </div>
                                      </td>
                                      <td className="p-4">
                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${(txn.status || 'COMPLETED') === 'COMPLETED' ? 'bg-green-100 text-green-700' : (txn.status || 'COMPLETED') === 'PENDING' ? 'bg-amber-100 text-amber-700' : (txn.status || 'COMPLETED') === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-700'}`}>
                                          {(txn.status || 'COMPLETED') === 'COMPLETED' ? 'Done' : (txn.status || 'COMPLETED') === 'PENDING' ? 'Pending' : (txn.status || 'COMPLETED') === 'CANCELLED' ? 'Cancelled' : (txn.status || 'COMPLETED')}
                                        </span>
                                      </td>
                                      <td className="p-4">
                                        <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${txn.method === 'CASH' ? 'bg-green-100 text-green-700' :
                                          txn.method === 'UPI' ? 'bg-blue-100 text-blue-700' :
                                            txn.method === 'CARD' ? 'bg-purple-100 text-purple-700' :
                                              'bg-orange-100 text-orange-700'
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
                                      <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                        {(txn.status || 'COMPLETED') !== 'COMPLETED' && (
                                          <button
                                            onClick={() => handleConfirmPayment(txn)}
                                            title="Confirm payment"
                                            className="px-2 py-1 rounded-lg bg-green-600 text-white text-[10px] font-black uppercase hover:bg-green-700 transition-colors"
                                          >
                                            Confirm
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                    {expandedTxnId === txn.id && (
                                      <tr key={`${txn.id}-detail`} className="bg-gray-50">
                                        <td colSpan={8} className="px-6 pb-4 pt-2">
                                          {txn.itemsList && txn.itemsList.length > 0 ? (
                                            <>
                                              <div className="flex flex-col gap-2">
                                                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Order Items</p>
                                                {Object.values(
                                                  (txn.itemsList || []).reduce((acc, item, idx) => {
                                                    const key = item.name || item.n || idx;
                                                    if (acc[key]) {
                                                      acc[key] = { ...acc[key], quantity: (acc[key].quantity || acc[key].q || 1) + (item.quantity || item.q || 1) };
                                                    } else {
                                                      acc[key] = { ...item };
                                                    }
                                                    return acc;
                                                  }, {})
                                                ).map((item, idx) => (
                                                  <div key={idx} className="flex justify-between items-center bg-white rounded-xl px-4 py-2.5 border border-gray-100">
                                                    <span className="text-xs md:text-sm font-bold text-gray-700">{item.name || item.n} × {item.quantity || item.q}</span>
                                                    <span className="text-xs md:text-sm font-black text-gray-900">₹{Number((item.price || item.p || 0) * (item.quantity || item.q || 1)).toFixed(2)}</span>
                                                  </div>
                                                ))}
                                                <div className="flex justify-between items-center px-4 pt-2 border-t border-gray-200 mt-2">
                                                  <span className="text-xs font-black uppercase text-gray-500">Total</span>
                                                  <span className="text-sm font-black text-[#1E3A8A]">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(0)}</span>
                                                </div>
                                              </div>
                                              <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 mt-2 space-y-2">
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>Subtotal</span>
                                                  <span className="text-gray-800">₹{Number(txn.subtotal ?? txn.itemsList.reduce((sum, item) => sum + Number(item.price || item.p || 0) * Number(item.quantity || item.q || 1), 0)).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>Discount {Number(txn.discountPercent ?? 0) > 0 ? `(${Number(txn.discountPercent).toFixed(0)}%)` : '(0%)'}</span>
                                                  <span className="text-red-600">-₹{Number(txn.discountAmount ?? 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>CGST</span>
                                                  <span className="text-gray-800">₹{Number(txn.cgst ?? 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>SGST</span>
                                                  <span className="text-gray-800">₹{Number(txn.sgst ?? 0).toFixed(2)}</span>
                                                </div>
                                                {Number(txn.roundOff ?? 0) !== 0 && (
                                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-gray-500">
                                                  <span>Round Off</span>
                                                  <span className="text-gray-800">{Number(txn.roundOff) > 0 ? '+' : ''}₹{Number(txn.roundOff ?? 0).toFixed(2)}</span>
                                                </div>
                                                )}
                                                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                                  <span className="text-xs font-black uppercase text-gray-500">Grand Total</span>
                                                  <span className="text-sm font-black text-[#1E3A8A]">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(0)}</span>
                                                </div>
                                                {Number(txn.tipAmount ?? 0) > 0 && (
                                                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                                  <span className="text-xs font-black uppercase text-amber-600">Tip</span>
                                                  <span className="text-sm font-black text-amber-700">₹{Number(txn.tipAmount).toFixed(2)}</span>
                                                </div>
                                                )}
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
                      <ItemAnalytics outlet={activeOutlet} sections={fetchedSections} venueFilter={activeVenueFilter} />
                    )}

                    {activeTab === 'vouchers' && (
                      isEdgeLocal ? (
                        <div className="p-12 text-center flex flex-col items-center">
                          <Receipt size={32} className="text-gray-300 mb-2" />
                          <p className="text-sm font-black text-gray-500 uppercase tracking-wider">Requires Cloud Connectivity</p>
                          <p className="text-xs text-gray-400 mt-1">Expenditures are not available in offline (PIN) mode.</p>
                        </div>
                      ) : (
                        <ExpenditureModule />
                      )
                    )}

                    {activeTab === 'xreport' && (
                      isEdgeLocal ? (
                        <div className="p-12 text-center flex flex-col items-center">
                          <FileText size={32} className="text-gray-300 mb-2" />
                          <p className="text-sm font-black text-gray-500 uppercase tracking-wider">Requires Cloud Connectivity</p>
                          <p className="text-xs text-gray-400 mt-1">X Reports are not available in offline (PIN) mode.</p>
                        </div>
                      ) : (
                        <XReportSection />
                      )
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
                                onChange={(e) => { setBillFinderDate(e.target.value); setBillFinderSearched(false); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleBillSearch(); }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Bill Number</label>
                              <input
                                type="text"
                                placeholder="Enter bill number..."
                                value={billFinderBillNo}
                                onChange={(e) => { setBillFinderBillNo(e.target.value); setBillFinderSearched(false); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleBillSearch(); }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-black uppercase text-gray-400 mb-1 block">Table Number</label>
                              <input
                                type="text"
                                placeholder="Enter table number..."
                                value={billFinderTableNo}
                                onChange={(e) => { setBillFinderTableNo(e.target.value); setBillFinderSearched(false); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleBillSearch(); }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleBillSearch}
                            disabled={billFinderLoading}
                            className="w-full bg-[#F59E0B] text-[#1E293B] rounded-xl px-4 py-3 text-sm font-black uppercase hover:bg-[#D97706] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

                        {billFinderResults.length === 0 && !billFinderLoading && billFinderSearched && (
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
                                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Source</th>
                                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Method</th>
                                    <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Total</th>
                                    <th className="px-4 py-3 text-center text-xs font-black uppercase text-gray-600">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {billFinderResults.map((txn) => (
                                    <>
                                      <tr key={txn.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedBillRow(expandedBillRow === txn.id ? null : txn.id)}>
                                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{txn.billNumber || txn.displayId || '—'}</td>
                                      <td className="px-4 py-3 text-xs font-bold text-gray-600">
                                        {(() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return '—'; } })()}
                                        {' '}
                                        {(() => { try { const d = new Date(txn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return '—'; } })()}
                                      </td>
                                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{txn.tableDisplayName || '—'}</td>
                                      <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">
                                        {(() => {
                                          const mapped = sectionTagToSource[txn.sectionTag];
                                          if (mapped) return mapped.replace(/-/g, ' ');
                                          const section = fetchedSections.find(s => s.sectionTag === txn.sectionTag);
                                          if (section) return section.name;
                                          return '—';
                                        })()}
                                      </td>
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
                                      <td className="px-4 py-3 text-right text-sm font-black text-[#1E3A8A]">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(0)}</td>
                                      <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setBillPreviewTxn(txn); }}
                                            className="bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 text-xs font-bold uppercase hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
                                          >
                                            <Eye size={12} />
                                            Preview
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleReprintFoundBill(txn); }}
                                            disabled={isReprintingFoundBill}
                                            className="bg-blue-500 text-white rounded-lg px-3 py-1.5 text-xs font-bold uppercase hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                          >
                                            <Printer size={12} />
                                            Reprint
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                    {expandedBillRow === txn.id && (
                                      <tr key={`${txn.id}-detail`}>
                                        <td colSpan={7} className="px-4 py-3 bg-gray-50">
                                          <div className="space-y-1.5">
                                            <p className="text-xs font-black uppercase text-gray-500 mb-2">Items ({Array.isArray(txn.itemsList) ? txn.itemsList.length : 0})</p>
                                            {Array.isArray(txn.itemsList) && txn.itemsList.length > 0 ? (
                                              txn.itemsList.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-sm">
                                                  <span className="font-bold text-gray-700">
                                                    <span className="text-gray-500 mr-2">{item.quantity ?? item.q ?? 1}×</span>
                                                    {item.name ?? item.n ?? 'Unknown'}
                                                  </span>
                                                  <span className="font-bold text-gray-600">₹{Number((item.price ?? item.p ?? 0) * (item.quantity ?? item.q ?? 1)).toFixed(2)}</span>
                                                </div>
                                              ))
                                            ) : (
                                              <p className="text-xs text-gray-400 italic">No item details available</p>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                    </>
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
                            <p className="text-lg font-black text-[#1E3A8A]">
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
                                          <span className="text-[9px] font-black text-[#1E3A8A] uppercase">{kot.items.length} Items</span>
                                          <div className="w-1 h-1 rounded-full bg-gray-300" />
                                          <span className="text-[9px] font-black text-gray-500">{kot.itemsReady || 0}/{kot.items.length} Ready</span>
                                        </div>
                                      </div>

                                      <div className="space-y-1 text-[9px] text-gray-600 font-bold border-t border-gray-50 pt-2 mb-3">
                                        {kot.items.map((item, idx) => (
                                          <div key={`${kot.id}-${idx}`} className="flex justify-between items-center">
                                            <div className="flex flex-col min-w-0">
                                              <div className="flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${item.t === 'veg' ? 'bg-green-500' : 'bg-red-500'}`} />
                                                <span className="truncate max-w-[120px]">{item.n}</span>
                                              </div>
                                              {item.notes && (
                                                <span className="text-[8px] text-amber-600 italic font-semibold ml-3 truncate max-w-[120px]">* {item.notes}</span>
                                              )}
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
                          className="absolute left-5 top-1/2 -translate-y-1/2 text-[#1E3A8A] pointer-events-none z-10"
                        >
                          <Search size={24} />
                        </motion.div>

                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="Search by name, category, price, or ID... (Press '/' to focus)"
                          className={`w-full bg-white border-2 rounded-2xl pl-14 pr-12 h-16 text-base md:text-lg font-black text-gray-900 outline-none transition-all duration-200 shadow-md placeholder:text-gray-400 ${isSearchFocused
                            ? 'border-[#1E3A8A] ring-4 ring-[#1E3A8A]/20 shadow-[#1E3A8A]/10 scale-[1.002]'
                            : 'border-gray-300 hover:border-[#1E3A8A]/50 hover:shadow-md'
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
                              className="absolute right-5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-100 hover:bg-[#1E3A8A]/10 text-gray-405 hover:text-[#1E3A8A] flex items-center justify-center transition-colors shadow-inner cursor-pointer"
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
                              ...((activeOutlet === 'bar' || activeOutlet === 'both')
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
                                  ? 'bg-[#F59E0B] border-[#F59E0B] text-[#1E293B] shadow-lg shadow-[#F59E0B]/35'
                                  : 'bg-white border-gray-200 text-gray-700 hover:bg-[#F8FAFC] hover:border-[#F59E0B] hover:text-[#F59E0B]'
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
                        {/* Row 2 — Subcategory Pills */}
                        {menuTypeSubcategories.length > 1 && (
                          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide scroll-smooth py-1 flex-grow">
                            {menuTypeSubcategories.map(cat => {
                              const isSpecialPill = cat === 'Today Special';
                              return (
                                <button
                                  key={cat}
                                  onClick={() => setSelectedCategory(cat)}
                                  className={`px-6 py-4 rounded-xl text-base font-black uppercase transition-all duration-200 border shrink-0 hover:scale-[1.03] active:scale-95 flex items-center gap-2 ${
                                    isSpecialPill
                                      ? selectedCategory === cat
                                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 border-transparent text-white shadow-lg shadow-amber-500/30 scale-[1.04] z-10'
                                        : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 hover:border-amber-400'
                                      : selectedCategory === cat
                                        ? 'bg-[#F59E0B] border-[#F59E0B] text-[#1E293B] shadow-lg shadow-amber-500/35 scale-[1.04] z-10'
                                        : 'bg-white border-gray-200 text-gray-700 hover:bg-[#F8FAFC] hover:border-gray-300 hover:text-[#1E3A8A]'
                                  }`}
                                >
                                  {isSpecialPill && <Flame size={18} className={selectedCategory === cat ? 'text-white' : 'text-amber-500'} />}
                                  {cat}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-grow overflow-y-auto p-4 bg-gray-50/30 custom-scrollbar">
                      {!menuLoading && (
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-black uppercase tracking-widest text-amber-600 flex items-center gap-2">
                              <StarIcon size={14} className="fill-amber-500" /> Today Specials
                            </h4>
                            <button
                              onClick={handleOpenSpecialsModal}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-wider hover:bg-amber-200 transition-colors"
                            >
                              <Sparkles size={12} /> Manage
                            </button>
                          </div>
                          {todaySpecials.length > 0 && (
                            <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1">
                              {todaySpecials.map(special => (
                                <button
                                  key={special.id}
                                  onClick={() => handleAddItem(special)}
                                  className="shrink-0 flex flex-col items-start bg-gradient-to-br from-amber-50 to-white border border-amber-200 hover:border-amber-400 rounded-xl px-3 py-2 shadow-sm active:scale-95 transition-all text-left"
                                >
                                  <span className="text-xs font-black text-gray-900 line-clamp-1 max-w-[140px]">{special.n}</span>
                                  <span className="text-xs font-black text-[#1E3A8A]">₹{special.p}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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
                          <AlertCircle size={44} className="text-[#1E3A8A] mb-4" />
                          <h3 className="text-lg font-black text-gray-900 mb-1">No matching items found</h3>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest max-w-xs text-center">
                            {searchQuery.trim()
                              ? `We couldn't find anything matching "${searchQuery.trim()}".`
                              : "No items found in this category."}
                          </p>
                          {searchQuery.trim() && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="mt-6 px-6 py-2.5 bg-[#F59E0B] text-[#1E293B] rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-[#F59E0B]/10 cursor-pointer"
                            >
                              Clear Search
                            </button>
                          )}
                        </div>
                      ) : (
                        <div
                          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                        >
                          {activeMenuItems.map((item) => {
                            const isSpecial = item.isSpecial && item.active && (!item.expiresAt || Date.now() < item.expiresAt) && (item.specialChannel === 'CASHIER' || item.specialChannel === 'BOTH');
                            return (
                            <div
                              key={item.id || item.n}
                              className={`rounded-2xl border-2 overflow-hidden transition-all duration-200 cursor-default flex flex-col group hover:scale-[1.02] active:scale-[0.99] shadow-md min-h-[132px] p-3 sm:p-4 gap-2 justify-between relative ${
                                isSpecial
                                  ? 'bg-gradient-to-br from-amber-50 to-white border-amber-300 hover:border-amber-500 hover:shadow-amber-200/50'
                                  : 'bg-white border-gray-200 hover:border-[#1E3A8A] hover:shadow-xl'
                              }`}
                            >
                              {isSpecial && (
                                <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-orange-500 text-white text-[8px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-0.5 z-10">
                                  <Flame size={8} className="fill-white" /> Special
                                </div>
                              )}
                              {/* Top row: veg/non dot + menuType badge */}
                              <div className="flex items-center justify-between">
                                <div className={`w-4 h-4 rounded-[3px] border flex items-center justify-center ${item.t === 'veg' ? 'border-green-600' : 'border-red-600'}`}>
                                  <div className={`w-2 h-2 rounded-full ${item.t === 'veg' ? 'bg-green-600' : 'bg-red-600'}`} />
                                </div>
                                {(activeOutlet === 'bar' || activeOutlet === 'both') && item.menuType && (
                                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
                                    {item.menuType === 'FOOD' ? '🍽️ Food' : '🥃 Liquor'}
                                  </span>
                                )}
                              </div>

                              {/* Item name — full visibility, wraps cleanly */}
                              <h4 className="text-xs sm:text-sm font-black text-gray-900 leading-snug line-clamp-4 break-words">
                                <HighlightedText text={item.n} highlight={searchQuery} />
                              </h4>

                              {/* Price + Add button */}
                              <div className="flex items-center justify-between mt-auto">
                                <p className={`text-lg md:text-xl font-black ${isSpecial ? 'text-amber-600' : 'text-[#1E3A8A]'}`}>₹{item.p}</p>
                                <div onClick={(e) => { e.stopPropagation(); handleAddItem(item); }} className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors duration-150 shadow-sm active:scale-90 shrink-0 cursor-pointer ${
                                  isSpecial
                                    ? 'bg-amber-100 border-amber-200 text-amber-600 group-hover:bg-amber-500 group-hover:text-white'
                                    : 'bg-gray-100 border-gray-150 text-gray-500 group-hover:bg-[#1E3A8A] group-hover:text-white'
                                }`}>
                                  <Plus className="w-5 h-5" />
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* COMPACT CART */}
                  <div className={`w-full ${isCartExpanded ? 'lg:w-[520px]' : 'lg:w-[380px]'} flex flex-col bg-white shadow-xl z-20 shrink-0 transition-all duration-300 ${isCartMinimized ? 'h-14 lg:h-auto overflow-hidden' : 'h-[55vh] lg:h-auto'}`}>
                    <div
                      className="p-4.5 border-b border-gray-100 bg-gray-50/50 cursor-pointer lg:cursor-default shrink-0 flex items-center justify-between"
                      onClick={() => setIsCartMinimized(!isCartMinimized)}
                    >
                      <div className="flex flex-col w-full">
                        <div className="flex justify-between items-center mb-3">
                          <h2 className="font-black text-base md:text-lg uppercase tracking-widest text-gray-900 flex items-center gap-2.5">
                            <ShoppingCart size={22} className="text-[#1E3A8A]" />
                            Cart Log
                          </h2>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setIsCartExpanded(prev => !prev); }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors hidden lg:flex"
                              title={isCartExpanded ? 'Collapse cart' : 'Expand cart'}
                            >
                              {isCartExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setCart([]); }} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={22} /></button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveTab('tables'); localStorage.setItem(getTenantScopedKey('cashier_active_tab'), 'tables'); }}
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-black hover:bg-gray-200 uppercase whitespace-nowrap border border-gray-200 transition-colors"
                          >
                            {selectedTable ? 'Change Table' : '+ Table'}
                          </button>
                          <span className="text-xs font-bold text-gray-500 truncate hidden sm:inline">
                            {selectedTable ? `Table ${selectedTable.displayName || selectedTable.name || selectedTable.id}` : 'Walk-in Order'}
                          </span>
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex lg:hidden items-center justify-center text-gray-400 shrink-0 ml-4 shadow-sm">
                        <ChevronDown size={18} className={`transition-transform duration-300 ${isCartMinimized ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    <div className="px-4.5 pt-2">
                      <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Order Platform</label>
                      <select
                        value={selectedOrderPlatform}
                        onChange={(e) => setSelectedOrderPlatform(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 focus:border-[#1E3A8A] focus:outline-none"
                      >
                        <option value="DINE_IN">Dine In</option>
                        <option value="SWIGGY">Swiggy</option>
                        <option value="ZOMATO">Zomato</option>
                        <option value="MAGICPIN">Magicpin</option>
                        <option value="EAT_CLUB">Eat Club</option>
                        <option value="INSTAMART">Instamart</option>
                        <option value="BLINKIT">Blinkit</option>
                        <option value="ZEPTO">Zepto</option>
                        <option value="BAR_MENU">Bar Menu</option>
                      </select>
                    </div>

                    <div className="flex-grow overflow-y-auto p-4.5 space-y-4 custom-scrollbar bg-white">
                      {(() => {
                        const sessionItems = (() => {
                          if (!selectedTable) return [];
                          const order = selectedTable.activeOrder || selectedTable.orders?.[0];
                          if (order?.items?.length > 0) {
                            return [...order.items]
                              .filter(i => !i.removedFromBill)
                              .reverse()
                              .map(i => ({ ...i, n: i.name ?? i.n, p: Number(i.price ?? i.p ?? 0), q: Number(i.quantity ?? i.q ?? 1), isKotSent: true }));
                          }
                          return [...(selectedTable.kotHistory || [])]
                            .reverse()
                            .flatMap(k => k.items.map(i => ({ ...i, isKotSent: true, kotId: k.id })));
                        })();
                        const pendingItems = [...cart].reverse().map(i => ({ ...i, isKotSent: false }));
                        const displayCart = [...pendingItems, ...sessionItems];

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
                                <div className="text-right">
                                  <span className="text-[10px] font-bold text-gray-400">₹{item.p} × {item.q}</span>
                                  <p className="text-sm md:text-base font-black text-gray-900">₹{item.p * item.q}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2.5">
                                {item.isKotSent ? (
                                  <div className="flex items-center gap-1.5 text-sm font-black text-gray-500">
                                    <span>QTY: {item.q}</span>
                                    <span>•</span>
                                    <span>KOT-{item.kotId}</span>
                                  </div>
                                ) : editQtyItemId === item.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      autoFocus
                                      type="number"
                                      min={1}
                                      value={editQtyValue}
                                      onChange={(e) => setEditQtyValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEditQty(item.id);
                                        if (e.key === 'Escape') { setEditQtyItemId(null); setEditQtyValue(''); }
                                      }}
                                      className="w-16 text-center text-sm font-black border border-amber-300 rounded-lg px-2 py-1 bg-amber-50 outline-none focus:border-amber-500"
                                    />
                                    <button
                                      onClick={() => saveEditQty(item.id)}
                                      className="text-xs font-black text-white bg-amber-500 hover:bg-amber-600 px-2 py-1 rounded-lg transition-colors"
                                    >✓</button>
                                    <button
                                      onClick={() => { setEditQtyItemId(null); setEditQtyValue(''); }}
                                      className="text-xs text-gray-400 hover:text-red-500 px-1 py-1 rounded transition-colors"
                                    >✕</button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center bg-gray-100 rounded-lg p-1.5 gap-2">
                                      <button onClick={() => updateQty(item.id, -1)} className="p-1.5 text-gray-600 hover:text-red-650 hover:bg-gray-200 rounded-lg transition-colors"><Minus size={14} /></button>
                                      <span className="w-9 text-center text-sm md:text-base font-black text-gray-805">{item.q}</span>
                                      <button onClick={() => updateQty(item.id, 1)} className="p-1.5 text-gray-600 hover:text-red-655 hover:bg-gray-200 rounded-lg transition-colors"><Plus size={14} /></button>
                                    </div>
                                    <button
                                      onClick={() => { setEditQtyItemId(item.id); setEditQtyValue(String(item.q)); }}
                                      className="text-xs md:text-sm font-black text-[#1E3A8A] hover:underline px-2.5 py-1.5 hover:bg-[#1E3A8A]/10 rounded-lg transition-colors"
                                    >Edit</button>
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
                      <div className="pt-0.5">
                        {(isWalkinMode || (activeOutlet === 'restaurant' && fetchedSections.some(s => {
                          const sourceKey = sectionTagToSource[s.sectionTag] || s.name;
                          return sourceKey === tableSubCategory && s.venue?.kotEnabled === false;
                        }))) ? (
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
                                'bg-white border-gray-200 text-gray-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] hover:shadow-sm'
                              }`}
                          >
                            {isKotSuccess ? <Check size={18} /> : isKotSending ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                            <span className="text-xs sm:text-sm font-black uppercase tracking-wider">{isKotSuccess ? 'Pushed' : isKotSending ? 'Pushing' : 'KOT (Auto-Split)'}</span>
                            {isOffline && <span className="ml-1 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] text-amber-900 font-bold">OFFLINE</span>}
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
              localStorage.getItem(getTenantScopedKey(`cashier_table_discount_${selectedTable.backendId}`));
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
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#1E3A8A] text-white flex items-center justify-center font-black text-xl sm:text-2xl border-2 border-red-700 shadow-sm transform hover:rotate-1 transition-transform">
                  {(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.number ?? selectedTable.id}`}
                </div>
                <div>
                  <h2 className="text-[10px] sm:text-xs font-black uppercase text-gray-400 leading-none tracking-widest">Active Session</h2>
                  <p className="text-base sm:text-lg font-black text-gray-900 mt-0.5 sm:mt-1">
                    {selectedTable.time ? (() => { try { const d = new Date(selectedTable.time); return isNaN(d.getTime()) ? 'Just now' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }); } catch { return 'Just now'; } })() : 'Just now'}
                  </p>
                  {selectedTable.billNumber && (
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 mt-0.5">
                      {String(selectedTable.billNumber).startsWith('OFFLINE-')
                        ? <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">📱 {selectedTable.billNumber}</span>
                        : <>Bill #{selectedTable.billNumber}</>
                      }
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTableModal(false);
                  setExpandedNoteItemId(null);
                  // Only clear discount if no saved discount persisted for this table
                  const hasSavedDiscount = selectedTable?.backendId &&
                    localStorage.getItem(getTenantScopedKey(`cashier_table_discount_${selectedTable.backendId}`));
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
                <h3 className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-[#1E3A8A] border-b border-red-100 pb-1 shrink-0">
                  Order Summary
                </h3>
                <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-0.5 mt-2">
                  {(isModalDataLoading && getAllOrderItems(selectedTable).length === 0) ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-gray-400" />
                    </div>
                  ) : (
                    groupOrderItems(getAllOrderItems(selectedTable))
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
                              <span className={`text-[10px] font-bold whitespace-nowrap ${isCancelled ? 'text-gray-300' : 'text-gray-400'}`}>₹{item.p} × {item.q}</span>
                              <span className={`text-sm font-black whitespace-nowrap ${isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                ₹{Number(item.p * item.q).toFixed(2)}
                              </span>
                              {isCancelled ? (
                                <span className="text-xs font-black text-red-400 uppercase tracking-widest">Cancelled</span>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowCancelModal(true);
                                    const gKey = `${item.n}::${item.p}`;
                                    setCancelSelected({ [gKey]: { item, quantity: 1 } });
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
                      })
                  )}
                </div>
              </div>

              {/* ── Fixed Bottom Area ─────────────────────────────── */}
              <div className="shrink-0 pt-2 border-t border-gray-100">

                {/* ── Discount & Totals (Ultra Compact) ──────────────── */}
                <div className="flex gap-2 sm:gap-3 mb-2">
                  {(() => {
                    const isOrderSettled = selectedTable?.activeOrder?.status === 'PAID';
                    return (
                      <>
                  {/* Discount */}
                  <div className="w-32 sm:w-36 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] sm:text-xs font-black uppercase text-gray-400 tracking-wider">
                        Discount
                      </label>
                      <div className={`flex bg-gray-100 rounded-lg p-1 ml-2 ${isOrderSettled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}>
                        <button 
                          onClick={() => { setDiscountMode('percent'); setRawDiscountInput(''); }}
                          className={`px-3 py-1 text-sm sm:text-base font-black rounded-md transition-all ${discountMode === 'percent' ? 'bg-white shadow-sm border border-gray-200/50 text-[#1E3A8A]' : 'text-gray-400 hover:text-gray-600'}`}
                        >%</button>
                        <button 
                          onClick={() => { setDiscountMode('fixed'); setRawDiscountInput(''); }}
                          className={`px-3 py-1 text-sm sm:text-base font-black rounded-md transition-all ${discountMode === 'fixed' ? 'bg-white shadow-sm border border-gray-200/50 text-[#1E3A8A]' : 'text-gray-400 hover:text-gray-600'}`}
                        >₹</button>
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step={discountMode === 'percent' ? "0.01" : "1"}
                      value={rawDiscountInput}
                      onChange={(e) => setRawDiscountInput(e.target.value)}
                      disabled={isOrderSettled}
                      className="w-full px-3 py-2 bg-[#F8FAFC] border focus:border-[#1E3A8A] rounded-lg outline-none text-sm font-bold text-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-100"
                      placeholder="0"
                    />
                  </div>

                  {/* Totals */}
                  <div className="flex-1 bg-gray-50 rounded-xl p-2.5 border border-gray-200 shadow-sm flex flex-col justify-center gap-1">
                    <div className="flex justify-between text-xs font-black text-gray-500 uppercase">
                      <span>Subtotal</span>
                      <span className="font-black text-gray-800">₹{Number(activeSubtotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-black text-gray-500 uppercase">
                      <span>GST</span>
                      <span className="font-black text-gray-800">₹{Number(activeTaxes || 0).toFixed(2)}</span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex justify-between text-xs font-black text-[#1E3A8A] uppercase">
                        <span>Discount {discountMode === 'percent' ? `(${discountPercent}%)` : ''}</span>
                        <span>-₹{activeDiscountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {Number(activeOrderCalc.roundOff ?? 0) !== 0 && (
                      <div className="flex justify-between text-xs font-black text-gray-500 uppercase">
                        <span>Round Off</span>
                        <span className="font-black text-gray-800">{Number(activeOrderCalc.roundOff) > 0 ? '+' : ''}₹{Number(activeOrderCalc.roundOff).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-0.5">
                      <span className="text-xs font-black text-gray-900 uppercase tracking-widest">
                        {discountPercent > 0 ? 'Final' : 'Total'}
                      </span>
                      <span className="text-xl sm:text-2xl font-black font-mono text-[#1E3A8A] tracking-tight leading-none">
                        ₹{Number(activeGrandTotal).toFixed(0)}
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
                      localStorage.setItem(getTenantScopedKey('cashier_active_tab'), 'pos');
                      setShowTableModal(false);
                      setExpandedNoteItemId(null);
                      const hasSavedDiscount = selectedTable?.backendId &&
                        localStorage.getItem(getTenantScopedKey(`cashier_table_discount_${selectedTable.backendId}`));
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
                    const tableKey = selectedTable.isExtra ? selectedTable.id : selectedTable.backendId;
                    // If bill was printed and not yet settled → always show Settlement (ignore stale sync)
                    if (billPrintedTableIds.has(tableKey)) return true;
                    // Settled this session → treat as done
                    if (settledTableIds.has(tableKey)) return false;
                    // Fall back to socket-driven status
                    const s = selectedTable.status;
                    return s === 'Waiting Bill' || s === 'BILLING_REQUESTED';
                  })() ? (
                    <button
                      onClick={() => { if (isPrintingBill) return; setShowSettleConfirm(true); }}
                      disabled={isSettling}
                      className="py-2.5 rounded-lg bg-[#F59E0B] border border-[#B45309] text-[#1E293B] text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 hover:bg-[#D97706] shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {(selectedTable?.billNumber || selectedTable?.activeOrder?.billNumber) && (
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                          #{selectedTable?.billNumber || selectedTable?.activeOrder?.billNumber}
                        </span>
                      )}
                      Settlement
                    </button>
                  ) : (
                    (isModalDataLoading && getBillableItems(selectedTable).length === 0) ? (
                      <div className="py-2.5 rounded-lg border border-gray-300 bg-gray-100 text-gray-500 text-xs sm:text-sm font-black uppercase tracking-wider text-center shadow-sm flex items-center justify-center gap-2">
                        <Loader2 size={12} className="animate-spin text-gray-400" />
                        Loading items…
                      </div>
                    ) : getBillableItems(selectedTable).length > 0 ? (
                      (() => {
                        // Determine section context for restaurant outlet
                        const sectionTag = (selectedTable?.sectionTag || '').toLowerCase();
                        const tableSection = fetchedSections.find(s => s.sectionTag?.toLowerCase() === sectionTag);
                        const isParcelSection = tableSection
                          ? tableSection.venue?.kotEnabled === false
                          : (selectedTable?.section?.venue?.kotEnabled === false);
                        const isRestaurantSection = activeOutlet === 'restaurant' || (tableSection && !isBarLikeVenue(tableSection.venue?.venueType));
                        const isFamilyRestaurant = isRestaurantSection && !isParcelSection;

                        return isRestaurantSection ? (
                          <div className="flex gap-2">
                            {isFamilyRestaurant && (
                              <button
                                onClick={handleReprintKOT}
                                className="py-2.5 rounded-lg border border-green-300 bg-green-50 text-green-800 text-xs sm:text-sm font-black uppercase tracking-wider hover:bg-green-100 transition-all duration-150 shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Printer size={12} />
                                KOT
                              </button>
                            )}
                            <button
                              onClick={handleFinalBill}
                              disabled={isPrintingBill || (billPrintCooldownRef.current.get(selectedTable?.isExtra ? selectedTable?.id : selectedTable?.backendId) > Date.now())}
                              className={`flex-1 py-2.5 rounded-lg border text-white text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 shadow-md flex items-center justify-center gap-1.5 ${isPrintingBill || (billPrintCooldownRef.current.get(selectedTable?.isExtra ? selectedTable?.id : selectedTable?.backendId) > Date.now())
                                ? 'bg-gray-400 border-gray-500 cursor-not-allowed shadow-gray-400/20'
                                : 'bg-blue-600 border-blue-700 hover:bg-blue-700 cursor-pointer'
                                }`}
                            >
                              {isPrintingBill ? <Loader2 size={12} className="animate-spin" /> : null}
                              {isPrintingBill ? 'Fetching…' : (billPrintCooldownRef.current.get(selectedTable?.isExtra ? selectedTable?.id : selectedTable?.backendId) > Date.now()) ? 'Printed ✓' : 'Direct Bill'}
                              {isOffline && <span className="ml-1 rounded bg-amber-400 px-1 py-0.5 text-[8px] text-amber-900 font-bold">OFFLINE</span>}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={handleFinalBill}
                            disabled={isPrintingBill || (billPrintCooldownRef.current.get(selectedTable?.isExtra ? selectedTable?.id : selectedTable?.backendId) > Date.now())}
                            className={`py-2.5 rounded-lg border text-white text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-150 shadow-md flex items-center justify-center gap-1.5 ${isPrintingBill || (billPrintCooldownRef.current.get(selectedTable?.isExtra ? selectedTable?.id : selectedTable?.backendId) > Date.now())
                              ? 'bg-gray-400 border-gray-500 cursor-not-allowed shadow-gray-400/20'
                              : 'bg-blue-600 border-blue-700 hover:bg-blue-700 cursor-pointer'
                              }`}
                          >
                            {isPrintingBill ? <Loader2 size={12} className="animate-spin" /> : null}
                            {isPrintingBill ? 'Fetching…' : (billPrintCooldownRef.current.get(selectedTable?.isExtra ? selectedTable?.id : selectedTable?.backendId) > Date.now()) ? 'Printed ✓' : 'Final Bill'}
                            {isOffline && <span className="ml-1 rounded bg-amber-400 px-1 py-0.5 text-[8px] text-amber-900 font-bold">OFFLINE</span>}
                          </button>
                        );
                      })()
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
                      : (billPrintCooldownRef.current.get(selectedTable?.isExtra ? selectedTable?.id : selectedTable?.backendId) > Date.now())
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

                {/* Retry Print button — visible when there are pending offline print jobs */}
                {pendingPrintCount > 0 && (
                  <button
                    onClick={handleRetryPrint}
                    disabled={isRetryingPrint}
                    className="mt-1.5 w-full py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-1.5 hover:bg-amber-100 cursor-pointer shadow-sm"
                  >
                    {isRetryingPrint
                      ? <><Loader2 size={10} className="animate-spin" /> Retrying…</>
                      : <><Printer size={10} /> Retry Print ({pendingPrintCount} queued)</>
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
        const allMenuItems = (activeOutlet === 'bar' || activeOutlet === 'both') ? barMenuItems : menuItems;
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
                    Table {(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] sm:text-xs font-black uppercase text-gray-400 tracking-wider">New Total</p>
                    <p className="text-2xl sm:text-3xl font-black font-mono text-[#1E3A8A] tracking-tight">₹{Number(liveTotal).toFixed(2)}</p>
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
                            <span className={`text-[10px] font-bold ${isMarked ? 'text-red-300' : 'text-gray-400'}`}>₹{item.p} × {item.q}</span>
                            <span className={`text-sm sm:text-base font-black ${isMarked ? 'text-red-550' : 'text-gray-900'}`}>
                              {isMarked ? '−' : ''}₹{Number(item.p * item.q).toFixed(2)}
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
                          <span className="text-sm sm:text-base font-black text-amber-600">+ ₹{Number(m.basePrice ?? m.p ?? 0).toFixed(2)}</span>
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
                            <span className="text-sm sm:text-base font-black text-amber-700">+₹{Number(item.price * item.quantity).toFixed(2)}</span>
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

      {/* SETTLE — Payment Method Picker + Tip Input */}
      {showSettleConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Settle {(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${selectedTable?.number ?? selectedTable?.id}` : `T${selectedTable?.id ?? ''}`}</p>
                <p className="text-3xl font-black text-gray-900 mt-1 tabular-nums">₹{Number(activeGrandTotal > 0 ? activeGrandTotal : 0).toFixed(0)}</p>
              </div>
              <button
                onClick={() => { setShowSettleConfirm(false); setTipInput(''); setSelectedSettleMethod(null); setOtherCashInput(''); setOtherCardInput(''); }}
                className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors duration-150"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-xs font-black uppercase text-gray-400 tracking-widest mb-3">Select Payment Method</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { label: 'Cash', method: 'CASH', icon: Banknote, color: 'green' },
                  { label: 'Card', method: 'CARD', icon: CreditCard, color: 'purple' },
                  { label: 'UPI', method: 'UPI', icon: Smartphone, color: 'blue' },
                  { label: 'Other', method: 'OTHER', icon: Wallet, color: 'orange' },
                ].map(({ label, method, icon: Icon, color }) => (
                  <button
                    key={method}
                    onClick={() => { setSelectedSettleMethod(method); setOtherCashInput(''); setOtherCardInput(''); }}
                    className={`relative flex flex-col items-center gap-2.5 py-4 rounded-2xl border-2 transition-all duration-150 hover:scale-[1.02] active:scale-95 shadow-sm ${
                      selectedSettleMethod === method
                        ? color === 'green' ? 'bg-green-50 border-green-600 text-green-700'
                          : color === 'purple' ? 'bg-purple-50 border-purple-600 text-purple-700'
                          : color === 'blue' ? 'bg-blue-50 border-blue-600 text-blue-700'
                          : 'bg-orange-50 border-orange-600 text-orange-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={28} strokeWidth={2} />
                    <span className="text-sm font-black uppercase tracking-wider">{label}</span>
                    {selectedSettleMethod === method && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-current" />
                    )}
                  </button>
                ))}
              </div>

              {/* Cash/Card sub-boxes when "Other" is selected */}
              {selectedSettleMethod === 'OTHER' && (
                <div className="mb-5 p-4 bg-orange-50 rounded-xl border-2 border-orange-200 space-y-3">
                  <p className="text-xs font-black uppercase text-orange-600 tracking-widest">Other Payment Breakdown (Optional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1 block">Cash</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          value={otherCashInput}
                          onChange={(e) => setOtherCashInput(e.target.value)}
                          placeholder="0"
                          className="w-full pl-8 pr-3 py-2.5 rounded-lg border-2 border-gray-200 text-base font-black text-gray-900 tabular-nums focus:outline-none focus:border-orange-500 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1 block">Card</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          value={otherCardInput}
                          onChange={(e) => setOtherCardInput(e.target.value)}
                          placeholder="0"
                          className="w-full pl-8 pr-3 py-2.5 rounded-lg border-2 border-gray-200 text-base font-black text-gray-900 tabular-nums focus:outline-none focus:border-orange-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const cash = Number(otherCashInput) || 0;
                    const card = Number(otherCardInput) || 0;
                    const tip = Number(tipInput) || 0;
                    const total = cash + card + tip;
                    const grandTotalNum = Number(activeGrandTotal > 0 ? activeGrandTotal : 0);
                    const isMixed = cash > 0 || card > 0;
                    return (
                      <div className={`text-xs font-bold ${total >= grandTotalNum ? 'text-green-600' : 'text-gray-500'}`}>
                        {isMixed ? 'MIXED' : 'OTHER'} • Cash+Card+Tip = ₹{total.toFixed(0)}
                        {total >= grandTotalNum ? ' ✓' : ` (₹${(grandTotalNum - total).toFixed(0)} short)`}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="mb-5">
                <label className="text-xs font-black uppercase text-gray-400 tracking-widest mb-2 block">Tip Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl">₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    value={tipInput}
                    onChange={(e) => setTipInput(e.target.value)}
                    placeholder="0"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl border-2 border-gray-200 text-xl font-black font-mono text-gray-900 tabular-nums focus:outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-red-100 transition-colors"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  if (!selectedSettleMethod || isPrintingBill) return;
                  const cashAmt = Number(otherCashInput) || 0;
                  const cardAmt = Number(otherCardInput) || 0;
                  const isMixed = selectedSettleMethod === 'OTHER' && (cashAmt > 0 || cardAmt > 0);
                  const effectiveMethod = isMixed ? 'MIXED' : selectedSettleMethod;
                  handlePayment(effectiveMethod, Number(tipInput) || 0, cashAmt, cardAmt);
                  setTipInput('');
                  setSelectedSettleMethod(null);
                  setOtherCashInput('');
                  setOtherCardInput('');
                }}
                disabled={!selectedSettleMethod || isPrintingBill}
                className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.01] active:scale-95 ${selectedSettleMethod && !isPrintingBill
                  ? 'bg-[#F59E0B] text-[#1E293B] shadow-lg shadow-[#F59E0B]/20 hover:bg-[#D97706] border border-[#B45309]'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed border border-gray-200'
                  }`}
              >
                {isPrintingBill ? 'Processing...' : 'Settle'}
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
                  {(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`} → Select Destination
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
                      <span className="text-lg font-black">{(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${t.number ?? t.id}` : `T${t.id}`}</span>
                      <span className="text-[9px] font-bold text-green-600 mt-0.5">Free</span>
                    </button>
                  ))}
                {activeTables.filter(t => (!t.status || t.status === 'Free') && t.backendId !== selectedTable.backendId).length === 0 && (
                  <div className="col-span-4 py-8 text-center text-gray-400 text-xs font-bold">No free tables available</div>
                )}
              </div>

              {/* Occupied tables — shown greyed out, not selectable */}
              <p className="text-[11px] font-black uppercase text-gray-400 tracking-wider mt-4 mb-2">Occupied Tables</p>
              <div className="grid grid-cols-4 gap-2.5 max-h-32 overflow-y-auto pr-1">
                {activeTables
                  .filter(t => t.status && t.status !== 'Free' && t.status !== 'AVAILABLE' && t.backendId !== selectedTable.backendId)
                  .sort((a, b) => Number(a.id) - Number(b.id))
                  .map(t => (
                    <div
                      key={t.backendId || t.id}
                      className="aspect-square rounded-xl border-2 border-gray-100 bg-gray-50 flex flex-col items-center justify-center text-xs font-black opacity-40 cursor-not-allowed"
                    >
                      <span className="text-lg font-black text-gray-400">{(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${t.number ?? t.id}` : `T${t.id}`}</span>
                      <span className="text-[9px] font-bold text-red-400 mt-0.5">Occupied</span>
                    </div>
                  ))}
              </div>

              <button
                onClick={async () => {
                  if (!swapTargetId || !selectedTable?.backendId || isSwapping) return;
                  setIsSwapping(true);
                  try {
                    const swapResult = await swapTable(selectedTable.backendId, swapTargetId, 'Cashier', selectedTable.section?.restaurantId || activeRestaurantId);

                    // Immediately apply swap in local state without waiting for socket
                    const sourceId = selectedTable.backendId;
                    const targetId = swapTargetId;
                    const sourceSnap = { ...selectedTable };

                    const setSwapTables = setActiveTables;

                    setSwapTables(prev => prev.map(t => {
                      if (t.backendId === sourceId) {
                        return { ...t, status: 'Free', workflowStatus: 'Free', activeOrder: null, orders: [], kotHistory: [], currentBill: 0, captainId: null, guests: 0, time: null };
                      }
                      if (t.backendId === targetId) {
                        return { ...t, status: sourceSnap.status, workflowStatus: sourceSnap.workflowStatus, activeOrder: sourceSnap.activeOrder, kotHistory: sourceSnap.kotHistory || [], currentBill: sourceSnap.currentBill || 0, captainId: sourceSnap.captainId || null, guests: sourceSnap.guests || 0, time: sourceSnap.time || null };
                      }
                      return t;
                    }));

                    // Clear localStorage for source table
                    localStorage.removeItem(`cashier_cart_${sourceId}`);

                    // Set 1.5-second cooldown on both tables to prevent socket echo flickering
                    tableClickCooldownRef.current.set(sourceId, Date.now() + 1500);
                    tableClickCooldownRef.current.set(targetId, Date.now() + 1500);
                    syncPauseUntilRef.current = Date.now() + 1500;
                    setTimeout(() => {
                      tableClickCooldownRef.current.delete(sourceId);
                      tableClickCooldownRef.current.delete(targetId);
                    }, 1500);

                    setShowSwapModal(false);
                    setShowTableModal(false);
                    setSwapTargetId(null);
                    setSelectedTable(null);
                    setCart([]);
                    addNotification(swapResult?.offline ? 'Table Moved (Sync Pending)' : 'Table Moved', 'Session transferred successfully', swapResult?.offline ? 'warning' : 'success');
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

      {/* BILL PREVIEW MODAL */}
      {billPreviewTxn && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setBillPreviewTxn(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-wider">Bill Preview</h3>
              <button onClick={() => setBillPreviewTxn(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="text-center mb-4">
                <p className="text-sm font-black text-gray-900">{billPreviewTxn.billNumber || billPreviewTxn.displayId || '—'}</p>
                <p className="text-xs text-gray-500">{billPreviewTxn.tableDisplayName || '—'} • {billPreviewTxn.method || '—'}</p>
                <p className="text-xs text-gray-500">{(() => { try { const d = new Date(billPreviewTxn.paidAt); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return '—'; } })()}</p>
              </div>
              <div className="border-t border-dashed border-gray-300 pt-3 space-y-1.5">
                {Array.isArray(billPreviewTxn.itemsList) && billPreviewTxn.itemsList.length > 0 ? (
                  billPreviewTxn.itemsList.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="font-bold text-gray-700">
                        <span className="text-gray-500 mr-2">{item.quantity ?? item.q ?? 1}×</span>
                        {item.name ?? item.n ?? 'Unknown'}
                      </span>
                      <span className="font-bold text-gray-600">₹{Number((item.price ?? item.p ?? 0) * (item.quantity ?? item.q ?? 1)).toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 italic text-center py-4">No item details available</p>
                )}
              </div>
              <div className="border-t border-dashed border-gray-300 mt-3 pt-3 space-y-1">
                <div className="flex justify-between text-sm"><span className="font-bold text-gray-500">Subtotal</span><span className="font-bold text-gray-700">₹{Number(billPreviewTxn.subtotal ?? 0).toFixed(2)}</span></div>
                {Number(billPreviewTxn.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm"><span className="font-bold text-gray-500">Discount ({billPreviewTxn.discountPercent ?? 0}%)</span><span className="font-bold text-red-500">-₹{Number(billPreviewTxn.discountAmount ?? 0).toFixed(2)}</span></div>
                )}
                <div className="flex justify-between text-sm"><span className="font-bold text-gray-500">CGST</span><span className="font-bold text-gray-700">₹{Number(billPreviewTxn.cgst ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span className="font-bold text-gray-500">SGST</span><span className="font-bold text-gray-700">₹{Number(billPreviewTxn.sgst ?? 0).toFixed(2)}</span></div>
                {Number(billPreviewTxn.roundOff ?? 0) !== 0 && (
                  <div className="flex justify-between text-sm"><span className="font-bold text-gray-500">Round Off</span><span className="font-bold text-gray-700">{Number(billPreviewTxn.roundOff) > 0 ? '+' : ''}₹{Number(billPreviewTxn.roundOff ?? 0).toFixed(2)}</span></div>
                )}
                <div className="flex justify-between text-base font-black border-t border-gray-200 pt-2 mt-2"><span className="text-gray-900">Grand Total</span><span className="text-[#1E3A8A] font-mono">₹{Number(billPreviewTxn.grandTotal ?? billPreviewTxn.amount ?? 0).toFixed(0)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REPRINT PIN MODAL */}
      {showReprintPinModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowReprintPinModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-wider">Enter PIN</h3>
              <button onClick={() => setShowReprintPinModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-500 mb-4">Enter your PIN to authorize bill reprint.</p>
              <input
                type="password"
                autoFocus
                value={reprintPinInput}
                onChange={e => { setReprintPinInput(e.target.value); setReprintPinError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') verifyReprintPin(); }}
                placeholder="Enter PIN..."
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#1E3A8A] mb-2"
              />
              {reprintPinError && <p className="text-xs font-bold text-red-500 mb-2">{reprintPinError}</p>}
              <button
                onClick={verifyReprintPin}
                disabled={isVerifyingReprintPin}
                className="w-full bg-[#F59E0B] text-[#1E293B] rounded-lg py-3 text-sm font-black uppercase hover:bg-[#D97706] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifyingReprintPin ? 'Verifying...' : 'Verify & Reprint'}
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
                  {(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`} → Choose Items & Destination
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
                    const isFree = (!table.status || table.status === 'Free')
                      || (Number(table.currentBill ?? 0) === 0 && !(table.kotHistory?.length > 0) && !table.activeOrder);
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
                              {(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${table.number ?? table.id}` : `T${table.id}`}
                            </p>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mt-1">
                              {table.section?.name || 'Table'}
                            </p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${isFree
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                            }`}>
                            {isFree ? 'Free' : `₹${Number(table.currentBill || 0).toFixed(2)}`}
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
                    ? `Transfer ${itemSwapSelectedIds.length} items to ${(activeOutlet === 'bar' || activeOutlet === 'both')
                      ? `B${selectedItemSwapTarget?.number ?? selectedItemSwapTarget?.id}`
                      : `T${selectedItemSwapTarget?.id}`}`
                    : 'Select items and table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM PAYMENT MODAL */}
      {showConfirmPaymentModal && confirmPaymentTxn && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Confirm Payment</p>
                <p className="text-2xl font-black text-gray-900 mt-1">{confirmPaymentTxn.displayId || confirmPaymentTxn.id}</p>
                <p className="text-sm font-bold text-gray-600 mt-1">₹{Number(confirmPaymentTxn.grandTotal || confirmPaymentTxn.amount || 0).toFixed(2)}</p>
              </div>
              <button
                onClick={handleConfirmPaymentCancel}
                className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors duration-150"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-xs font-black uppercase text-gray-400 tracking-widest mb-3">Select Payment Method</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { label: 'Cash', method: 'CASH', icon: Banknote, color: 'green' },
                  { label: 'Card', method: 'CARD', icon: CreditCard, color: 'purple' },
                  { label: 'UPI', method: 'UPI', icon: Smartphone, color: 'blue' },
                  { label: 'Other', method: 'OTHER', icon: Wallet, color: 'orange' },
                ].map(({ label, method, icon: Icon, color }) => (
                  <button
                    key={method}
                    onClick={() => { setConfirmPaymentMethod(method); setConfirmCashInput(''); setConfirmCardInput(''); }}
                    className={`relative flex flex-col items-center gap-2.5 py-4 rounded-2xl border-2 transition-all duration-150 hover:scale-[1.02] active:scale-95 shadow-sm ${
                      confirmPaymentMethod === method
                        ? color === 'green' ? 'bg-green-50 border-green-600 text-green-700'
                          : color === 'purple' ? 'bg-purple-50 border-purple-600 text-purple-700'
                          : color === 'blue' ? 'bg-blue-50 border-blue-600 text-blue-700'
                          : 'bg-orange-50 border-orange-600 text-orange-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={28} strokeWidth={2} />
                    <span className="text-sm font-black uppercase tracking-wider">{label}</span>
                    {confirmPaymentMethod === method && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-current" />
                    )}
                  </button>
                ))}
              </div>

              {/* Cash/Card sub-boxes when "Other" is selected */}
              {confirmPaymentMethod === 'OTHER' && (
                <div className="mb-5 p-4 bg-orange-50 rounded-xl border-2 border-orange-200 space-y-3">
                  <p className="text-xs font-black uppercase text-orange-600 tracking-widest">Other Payment Breakdown (Optional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1 block">Cash</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          value={confirmCashInput}
                          onChange={(e) => setConfirmCashInput(e.target.value)}
                          placeholder="0"
                          className="w-full pl-8 pr-3 py-2.5 rounded-lg border-2 border-gray-200 text-base font-black text-gray-900 tabular-nums focus:outline-none focus:border-orange-500 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1 block">Card</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          value={confirmCardInput}
                          onChange={(e) => setConfirmCardInput(e.target.value)}
                          placeholder="0"
                          className="w-full pl-8 pr-3 py-2.5 rounded-lg border-2 border-gray-200 text-base font-black text-gray-900 tabular-nums focus:outline-none focus:border-orange-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const cash = Number(confirmCashInput) || 0;
                    const card = Number(confirmCardInput) || 0;
                    const tip = Number(confirmTipInput) || 0;
                    const total = cash + card + tip;
                    const grandTotalNum = Number(confirmPaymentTxn.grandTotal || confirmPaymentTxn.amount || 0);
                    const isMixed = cash > 0 || card > 0;
                    return (
                      <div className={`text-xs font-bold ${total >= grandTotalNum ? 'text-green-600' : 'text-gray-500'}`}>
                        {isMixed ? 'MIXED' : 'OTHER'} • Cash+Card+Tip = ₹{total.toFixed(0)}
                        {total >= grandTotalNum ? ' ✓' : ` (₹${(grandTotalNum - total).toFixed(0)} short)`}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="mb-5">
                <label className="text-xs font-black uppercase text-gray-400 tracking-widest mb-2 block">Tip Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl">₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    value={confirmTipInput}
                    onChange={(e) => setConfirmTipInput(e.target.value)}
                    placeholder="0"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl border-2 border-gray-200 text-xl font-black font-mono text-gray-900 tabular-nums focus:outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-red-100 transition-colors"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleConfirmPaymentCancel}
                  className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-600 font-black uppercase text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPaymentSubmit}
                  disabled={!confirmPaymentMethod}
                  className={`flex-1 py-3 px-4 rounded-xl font-black uppercase text-sm transition-colors ${confirmPaymentMethod
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TODAY SPECIALS MANAGEMENT MODAL */}
      {showSpecialsModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200 animate-slide-in">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center sticky top-0">
              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Cashier</p>
                <p className="text-xl font-black text-gray-900 mt-1 flex items-center gap-2">
                  <Sparkles size={22} className="text-amber-500" /> Manage Today Specials
                </p>
              </div>
              <button
                onClick={handleCloseSpecialsModal}
                disabled={specialsSaving}
                className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors duration-150"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Add food items that will be published as Today Specials. These will be available to Cashier and Captain for 24 hours and sync to all outlets.
              </p>

              {specialsError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700">
                  {specialsError}
                </div>
              )}

              <div className="space-y-3">
                {specialsRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-12 gap-3 items-start bg-gray-50 p-3 rounded-xl">
                    <div className="col-span-5">
                      <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Item Name</label>
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => handleSpecialRowChange(index, 'name', e.target.value)}
                        placeholder="e.g. Paneer Tikka"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Price (₹)</label>
                      <input
                        type="number"
                        value={row.price}
                        onChange={(e) => handleSpecialRowChange(index, 'price', e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Category</label>
                      <input
                        type="text"
                        value={row.category}
                        onChange={(e) => handleSpecialRowChange(index, 'category', e.target.value)}
                        placeholder="Main Course"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
                      />
                    </div>
                    <div className="col-span-1 pt-5">
                      {specialsRows.length > 1 && (
                        <button
                          onClick={() => handleRemoveSpecialRow(index)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="col-span-12 flex items-center gap-4 mt-1">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                        <input
                          type="radio"
                          checked={row.isVeg}
                          onChange={() => handleSpecialRowChange(index, 'isVeg', true)}
                          className="accent-green-600"
                        />
                        Veg
                      </label>
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                        <input
                          type="radio"
                          checked={!row.isVeg}
                          onChange={() => handleSpecialRowChange(index, 'isVeg', false)}
                          className="accent-red-600"
                        />
                        Non-Veg
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddSpecialRow}
                disabled={specialsSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-600 font-black text-xs uppercase tracking-wider hover:border-[#E53935] hover:text-[#E53935] transition-colors w-full justify-center"
              >
                <Plus size={16} /> Add Another Item
              </button>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3 sticky bottom-0">
              <button
                onClick={handleCloseSpecialsModal}
                disabled={specialsSaving}
                className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-600 font-black uppercase text-sm hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSpecials}
                disabled={specialsSaving}
                className={`flex-1 py-3 px-4 rounded-xl font-black uppercase text-sm transition-colors flex items-center justify-center gap-2 ${
                  specialsSaving
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-[#E53935] text-white hover:bg-red-700'
                }`}
              >
                {specialsSaving && <Loader2 size={16} className="animate-spin" />}
                {specialsSaving ? 'Saving...' : 'Publish Specials'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK CONFIRM PAYMENT MODAL */}
      {showBulkConfirmModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase text-gray-400 tracking-wider">Bulk Action</p>
                <p className="text-xl font-black text-gray-900 mt-1 flex items-center gap-2">
                  <CheckCircle2 size={22} className="text-green-600" /> Confirm Pending Bills
                </p>
              </div>
              {!bulkConfirmSaving && (
                <button
                  onClick={handleCloseBulkConfirmModal}
                  className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors duration-150"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              {bulkConfirmSaving && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm font-bold text-gray-700">
                    <span>Confirming payments...</span>
                    <span>{bulkConfirmProgress.current} / {bulkConfirmProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${bulkConfirmProgress.total > 0 ? (bulkConfirmProgress.current / bulkConfirmProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">Processing in chunks of 5 to prevent server overload.</p>
                </div>
              )}

              {bulkConfirmResults && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                      <p className="text-lg font-black text-green-700">{bulkConfirmResults.success.length}</p>
                      <p className="text-[10px] font-bold text-green-600 uppercase">Success</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                      <p className="text-lg font-black text-amber-700">{bulkConfirmResults.offline.length}</p>
                      <p className="text-[10px] font-bold text-amber-600 uppercase">Queued</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <p className="text-lg font-black text-red-700">{bulkConfirmResults.failed.length}</p>
                      <p className="text-[10px] font-bold text-red-600 uppercase">Failed</p>
                    </div>
                  </div>

                  {bulkConfirmResults.failed.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                      <p className="text-xs font-black text-red-700 mb-2">Failed bills:</p>
                      <ul className="space-y-1">
                        {bulkConfirmResults.failed.map((f, idx) => (
                          <li key={idx} className="text-xs text-red-600">
                            {f.txn?.displayId || f.txn?.billNumber || f.txn?.id} — {f.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
              {bulkConfirmResults?.failed.length > 0 ? (
                <>
                  <button
                    onClick={handleCloseBulkConfirmModal}
                    className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-600 font-black uppercase text-sm hover:bg-gray-100 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleBulkConfirmPayment}
                    className="flex-1 py-3 px-4 rounded-xl bg-green-600 text-white font-black uppercase text-sm hover:bg-green-700 transition-colors"
                  >
                    Retry Failed
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCloseBulkConfirmModal}
                  disabled={bulkConfirmSaving}
                  className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-600 font-black uppercase text-sm hover:bg-gray-100 transition-colors"
                >
                  {bulkConfirmSaving ? 'Confirming...' : 'Close'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS OVERLAY */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="pointer-events-auto flex items-center gap-3 bg-white border-l-4 border-l-[#1E3A8A] p-3 rounded-lg shadow-2xl animate-slide-in min-w-[240px]">
            <div className="w-8 h-8 rounded-full bg-[#1E3A8A]/10 flex items-center justify-center text-[#1E3A8A]">
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
        const cancellableItems = groupOrderItems(getBillableItems(selectedTable));
        const groupKey = (item) => `${item.n}::${item.p}`;
        const selectedCount = Object.keys(cancelSelected).length;
        const selectedQuantityTotal = Object.values(cancelSelected).reduce(
          (sum, entry) => sum + Math.max(1, Math.round(Number(entry.quantity ?? 1))),
          0
        );

        const handleCancelSelected = async () => {
          if (selectedCount === 0) return;

          cancelInProgressRef.current = true;
          setCancelBatchLoading(true);

          const cancelTimeout = setTimeout(() => {
            setCancelBatchLoading(false);
            // Do NOT close modal or clear selection — user can retry
            addNotification('Cancel is taking longer than expected — please retry', 'error');
          }, 30000);

          try {
            // For extra tables: fetchFreshOrderData returns parent order (wrong) — use activeOrder directly
            const freshOrder = selectedTable.isExtra
              ? null
              : await fetchFreshOrderData(selectedTable.backendId);
            const liveOrder = freshOrder || selectedTable.activeOrder;

            if (!liveOrder?.id) {
              addNotification('No active order found.', 'error');
              return;
            }

            // Build a map of orderItemId → fresh orderItem
            const freshItemMap = {};
            if (freshOrder?.items) {
              for (const fi of freshOrder.items) {
                if (!fi.removedFromBill) {
                  freshItemMap[fi.id] = fi;
                }
              }
            }

            // Also build from current selectedTable as secondary fallback
            const localItems = getBillableItems(selectedTable);
            for (const li of localItems) {
              if (!freshItemMap[li.id]) freshItemMap[li.id] = li;
            }

            // Build batch items list, distributing cancel quantity across grouped originalIds
            const batchItems = [];
            const resolvedIds = [];

            for (const [, { quantity, item: cachedGroup }] of Object.entries(cancelSelected)) {
              let remaining = Math.max(1, Math.round(Number(quantity ?? 1)));
              for (const orderItemId of cachedGroup.originalIds || []) {
                const freshItem = freshItemMap[orderItemId];
                if (!freshItem) continue;
                const avail = Number(freshItem.quantity ?? freshItem.q ?? 0);
                const toCancel = Math.min(remaining, avail);
                if (toCancel > 0) {
                  batchItems.push({ orderItemId, cancelQuantity: toCancel });
                  resolvedIds.push(orderItemId);
                  remaining -= toCancel;
                }
                if (remaining <= 0) break;
              }
            }

            // Clamp safeguard: ensure total batch quantity never exceeds what the cashier selected
            const totalBatchQty = batchItems.reduce((sum, b) => sum + b.cancelQuantity, 0);
            const totalSelectedQty = Object.values(cancelSelected).reduce(
              (sum, e) => sum + Math.max(1, Math.round(Number(e.quantity ?? 1))), 0
            );
            if (totalBatchQty > totalSelectedQty) {
              console.error('[CancelBatch] Clamp violation: batch qty > selected qty', { totalBatchQty, totalSelectedQty });
              const clamped = [];
              let clampRemaining = totalSelectedQty;
              for (const b of batchItems) {
                if (clampRemaining <= 0) break;
                const q = Math.min(b.cancelQuantity, clampRemaining);
                clamped.push({ ...b, cancelQuantity: q });
                clampRemaining -= q;
              }
              batchItems.length = 0;
              batchItems.push(...clamped);
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

            // Snapshot pre-cancel state so we can rollback on error
            const preCancelItems = selectedTable?.activeOrder?.items ? [...selectedTable.activeOrder.items] : [];
            const preCancelKotHistory = selectedTable?.kotHistory ? [...selectedTable.kotHistory] : [];

            try {
              // ONE API call → ONE CANCEL_KOT socket event → ONE printed slip
              const cancelResult = await cancelOrderItems(
                liveOrder.id,
                batchItems,
                'Cashier',
                selectedTable.number || selectedTable.id,
                batchRequestId
              );
              clearTimeout(cancelTimeout);
              if (cancelResult?.offline) {
                addNotification('Cancel Queued', 'Item cancellation saved locally — will sync when online.', 'warning');
              }

              const cancelQtyMap = new Map(batchItems.map(b => [b.orderItemId, b.cancelQuantity]));
              const applyCancelToItems = (items) => items.map(i => {
                if (!cancelQtyMap.has(i.id)) return i;
                const cancelQty = cancelQtyMap.get(i.id);
                const currentQty = Number(i.quantity ?? i.q ?? 0);
                const newQty = Math.max(0, currentQty - cancelQty);
                if (newQty <= 0) return { ...i, removedFromBill: true, quantity: 0, q: 0 };
                return { ...i, quantity: newQty, q: newQty };
              });
              const applyCancelToKotHistory = (kh) => (kh || []).map(kot => ({
                ...kot,
                items: (kot.items || []).map(kotItem => {
                  const itemId = kotItem.orderItemId || kotItem.id;
                  if (!cancelQtyMap.has(itemId)) return kotItem;
                  const cancelQty = cancelQtyMap.get(itemId);
                  const currentQty = Number(kotItem.q ?? kotItem.quantity ?? 0);
                  const newQty = Math.max(0, currentQty - cancelQty);
                  if (newQty <= 0) return { ...kotItem, s: 'Cancelled', q: 0 };
                  return { ...kotItem, q: newQty, quantity: newQty };
                }),
              }));
              const applyCancelOptimistic = (prev) => {
                if (!prev) return prev;
                const updatedOrder = prev.activeOrder ? {
                  ...prev.activeOrder,
                  items: applyCancelToItems(prev.activeOrder.items || []),
                } : prev.activeOrder;
                const updatedKotHistory = applyCancelToKotHistory(prev.kotHistory);
                return { ...prev, activeOrder: updatedOrder, kotHistory: updatedKotHistory };
              };
              setSelectedTable(applyCancelOptimistic);
              // ── DIAGNOSTIC: confirm optimistic cancel landed ──
              console.log('[DIAG cancel] optimistic update applied, cancelQtyMap:', [...cancelQtyMap.entries()]);

              const setTargetTables = setActiveTables;
              setTargetTables(prev => prev.map(t => {
                if (t.backendId !== selectedTable.backendId) return t;
                const updatedOrder = t.activeOrder
                  ? { ...t.activeOrder, items: applyCancelToItems(t.activeOrder.items || []) }
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
              const isAlreadyCancelled = err.message?.toLowerCase().includes('already') || err.status === 409 || err.code === 409;
              if (isAlreadyCancelled) {
                // 409 or "already cancelled" — treat as success and apply optimistic update anyway
                const cancelQtyMap = new Map(batchItems.map(b => [b.orderItemId, b.cancelQuantity]));
                const applyCancelToItems = (items) => items.map(i => {
                  if (!cancelQtyMap.has(i.id)) return i;
                  const cancelQty = cancelQtyMap.get(i.id);
                  const currentQty = Number(i.quantity ?? i.q ?? 0);
                  const newQty = Math.max(0, currentQty - cancelQty);
                  if (newQty <= 0) return { ...i, removedFromBill: true, quantity: 0, q: 0 };
                  return { ...i, quantity: newQty, q: newQty };
                });
                const applyCancelToKotHistory = (kh) => (kh || []).map(kot => ({
                  ...kot,
                  items: (kot.items || []).map(kotItem => {
                    const itemId = kotItem.orderItemId || kotItem.id;
                    if (!cancelQtyMap.has(itemId)) return kotItem;
                    const cancelQty = cancelQtyMap.get(itemId);
                    const currentQty = Number(kotItem.q ?? kotItem.quantity ?? 0);
                    const newQty = Math.max(0, currentQty - cancelQty);
                    if (newQty <= 0) return { ...kotItem, s: 'Cancelled', q: 0 };
                    return { ...kotItem, q: newQty, quantity: newQty };
                  }),
                }));
                setSelectedTable(prev => {
                  if (!prev) return prev;
                  const updatedOrder = prev.activeOrder ? {
                    ...prev.activeOrder,
                    items: applyCancelToItems(prev.activeOrder.items || []),
                  } : prev.activeOrder;
                  const updatedKotHistory = applyCancelToKotHistory(prev.kotHistory);
                  return { ...prev, activeOrder: updatedOrder, kotHistory: updatedKotHistory };
                });
                addNotification('Items already cancelled', 'success');
              } else {
                // Roll back: restore pre-cancel state
                setSelectedTable(prev => prev ? {
                  ...prev,
                  activeOrder: prev.activeOrder ? { ...prev.activeOrder, items: preCancelItems } : prev.activeOrder,
                  kotHistory: preCancelKotHistory,
                } : prev);
                addNotification(`Cancel failed: ${err.message}`, 'error');
              }
            } finally {
              const clearLoading = {};
              resolvedIds.forEach(id => { clearLoading[id] = false; });
              setCancelLoading(prev => ({ ...prev, ...clearLoading }));
            }

            setCancelSelected({});
            setShowCancelModal(false);
          } finally {
            clearTimeout(cancelTimeout);
            cancelInProgressRef.current = false;
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
                    const gKey = groupKey(item);
                    const isSelected = !!cancelSelected[gKey];
                    const isLoading = (item.originalIds || []).some(id => cancelLoading[id]);
                    const cancelQuantity = Math.max(
                      1,
                      Math.min(
                        Number(item.q ?? 1),
                        Math.round(Number(cancelSelected[gKey]?.quantity ?? 1))
                      )
                    );
                    const remainingQuantity = Math.max(0, Number(item.q ?? 0) - cancelQuantity);
                    return (
                      <button
                        key={gKey}
                        disabled={isLoading}
                        onClick={() => {
                          setCancelSelected(prev => {
                            const next = { ...prev };
                            if (next[gKey]) delete next[gKey];
                            else next[gKey] = { item, quantity: 1 };
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
                                  setCancelSelected(prev => {
                                    if (!prev[gKey]) return prev;
                                    return {
                                      ...prev,
                                      [gKey]: {
                                        ...prev[gKey],
                                        quantity: Math.max(1, Number(prev[gKey]?.quantity ?? 1) - 1),
                                      },
                                    };
                                  });
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
                                  setCancelSelected(prev => {
                                    if (!prev[gKey]) return prev;
                                    return {
                                      ...prev,
                                      [gKey]: {
                                        ...prev[gKey],
                                        quantity: nextValue,
                                      },
                                    };
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-12 text-center bg-transparent text-xs font-black text-red-700 outline-none"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelSelected(prev => {
                                    if (!prev[gKey]) return prev;
                                    return {
                                      ...prev,
                                      [gKey]: {
                                        ...prev[gKey],
                                        quantity: Math.min(Number(item.q ?? 1), Number(prev[gKey]?.quantity ?? 1) + 1),
                                      },
                                    };
                                  });
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
                    ? 'bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706] shadow-lg shadow-[#F59E0B]/30'
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
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1E3A8A] focus:outline-none text-lg font-black tracking-widest text-center"
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
                className="flex-1 py-3 rounded-xl text-sm font-black bg-[#F59E0B] text-[#1E293B] hover:bg-[#D97706] transition-colors uppercase tracking-widest"
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
                  Table {(activeOutlet === 'bar' || activeOutlet === 'both') ? `B${selectedTable.number ?? selectedTable.id}` : (selectedTable.displayName ?? selectedTable.number ?? selectedTable.id)}
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



      <QuantityPicker
        isOpen={showLiquorQtyPicker}
        itemName={liquorQtyItem?.n || ''}
        onSelect={handleQtySelect}
        onClose={() => { setShowLiquorQtyPicker(false); setLiquorQtyItem(null); }}
      />
    </div>
  );
};

export default CashierDashboard;

