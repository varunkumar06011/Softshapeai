// ─────────────────────────────────────────────────────────────────────────────
// CaptainApp — Captain POS application for order taking and table management
// ─────────────────────────────────────────────────────────────────────────────
// Full-featured Captain POS (Point of Sale) application (~5700 lines):
//   - Table selection grid with real-time status (Free/Occupied/Billing)
//   - Menu item picker with search, categories, veg/non-veg filter
//   - Cart management (add, remove, modify quantities)
//   - KOT (Kitchen Order Ticket) sending with print confirmation
//   - Order modifications (add items, cancel items, transfer tables)
//   - Captain performance dashboard (revenue, targets, analytics)
//   - Waiter call notifications (real-time via Socket.IO)
//   - Voice search for menu items (Web Speech API)
//   - Today's specials display
//   - Offline support with action queueing
//   - Mobile-optimized touch targets and gestures
//
// Used by captains/waiters to take orders at tables. Syncs with backend
// via Socket.IO for real-time table status and order updates.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

import {

  LayoutDashboard, ShoppingCart, LogOut, ChevronRight, Clock, Plus, Minus,

  Send, CheckCircle2, Search, ArrowLeft, ChefHat, Timer,

  UtensilsCrossed, MessageSquare, Check, X, AlertCircle, Loader2, Zap,

  FileText, History, Bell, RefreshCw, Star, Info, Flame, ChevronLeft, Edit2, Image as ImageIcon,

  Target, TrendingUp, ArrowRightLeft, Wine, GlassWater, Mic, MicOff, Heart

} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';

import { useMenuSync } from '../hooks/useMenuSync';
import { useSocket, getSocket } from '../hooks/useSocket';
import { useTableSync } from '../services/tableSyncService';
import { useLongPress } from '../hooks/useLongPress';
import KotConfirmModal from '../shared/components/KotConfirmModal';

import { createOrder, requestBilling, updateOrderItems, fetchTransactions, cancelOrderItem, swapTable } from '../services/orderApi';

import { calculateSessionBill, calculateOrderTotal, calculateTableBill, getTableItems, getBillableItems } from '../shared/utils/billing';

import { filterMenuItems } from '../shared/utils/menuSearch';

import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { getRestaurantConfig } from '../utils/getRestaurantConfig.js';
import { getTenantScopedKey } from '../utils/cacheKeys';
import { useAuth } from '../context/AuthContext.jsx';

import { isBeerItem } from '../utils/itemHelpers';






import { useWaiterCalls, broadcastWaiterEvent } from '../services/waiterCallService';

import { markWaiterCallAccepted } from '../services/customerSessionService';

import { useBarTableSync } from '../services/barTableSyncService';

import { useBarMenuSync } from '../services/barMenuSyncService';

import VariantPicker from '../shared/components/VariantPicker';

import VenueSectionView from '../shared/components/VenueSectionView';

import { getTableSectionLabel, getSectionBadgeColor } from '../utils/tableHelpers';



import { authService } from '../services/authService';
import { API_BASE, getAuthHeaders } from '../services/apiConfig';

import { fetchCaptainTarget } from '../services/captainTargetService';

import { playChimeTone, unlockAudioContext } from '../services/audioService';

import { hapticSuccess } from '../shared/hooks/useHaptics';



const { barUnitMl: BAR_UNIT_ML, fullBottleMl: FULL_BOTTLE_ML } = getRestaurantConfig();



const TABLE_STATUS = {

  FREE: 'Free',

  OCCUPIED: 'Occupied',

  PREPARING: 'Preparing',

  READY: 'Ready',

  BILLING: 'Waiting Bill'

};







function EmergencyOverlay({ call, currentCaptain, onAccept, onDismiss }) {

  const [timeLeft, setTimeLeft] = useState(12);



  useEffect(() => {

    let alarmInterval = null;



    const startAlarm = () => {

      playChimeTone();

      alarmInterval = setInterval(playChimeTone, 800);

    };



    // Calculate initial time left based on when it was actually received locally

    const elapsed = Math.floor((Date.now() - (call.localTimestamp || Date.now())) / 1000);

    const initial = Math.max(0, 12 - elapsed);

    setTimeLeft(initial);



    if (initial > 0) {

      startAlarm();

    }



    const timer = setInterval(() => {

      const currentElapsed = Math.floor((Date.now() - (call.localTimestamp || Date.now())) / 1000);

      const remaining = Math.max(0, 12 - currentElapsed);

      setTimeLeft(remaining);

      if (remaining <= 0) {

        clearInterval(timer);

        if (alarmInterval) {

          clearInterval(alarmInterval);

          alarmInterval = null;

        }

      }

    }, 1000);



    return () => {

      clearInterval(timer);

      if (alarmInterval) {

        clearInterval(alarmInterval);

      }

    };

  }, [call]);



  const handleAccept = () => {

    hapticSuccess();

    onAccept(call);

  };



  const displayTableId = String(call?.tableId || 'UNKNOWN').toUpperCase().replace(/TABLE[- ]?/, '');

  const sourceLabel = call?.source === 'bar' ? 'Bar' : call?.source === 'restaurant' ? 'Restaurant' : '';

  const displayLabelUpper = sourceLabel ? `${sourceLabel.toUpperCase()} TABLE ${displayTableId}` : `TABLE ${displayTableId}`;



  if (timeLeft <= 0) {

    // Reduced Warning Mode

    return (

      <div className="fixed bottom-6 right-6 z-[9999] bg-[#B71C1C] text-white p-4 rounded-2xl shadow-[0_10px_30px_rgba(183,28,28,0.4)] flex items-center gap-4 animate-in slide-in-from-bottom-5 border border-red-500/30">

        <button 

          onClick={() => onDismiss && onDismiss(call)} 

          className="absolute -top-2 -right-2 w-6 h-6 bg-white text-[#B71C1C] rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-all z-10"

        >

          <X size={14} strokeWidth={3} />

        </button>

        <div className="w-10 h-10 rounded-full bg-white text-[#B71C1C] flex items-center justify-center animate-pulse shrink-0">

          <Bell size={20} />

        </div>

        <div>

          <h3 className="font-black text-sm uppercase tracking-widest leading-none mb-1">{displayLabelUpper}</h3>

          <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Needs assistance</p>

        </div>

        <button

          onClick={handleAccept}

          className="ml-2 px-4 py-2 bg-white text-[#B71C1C] text-xs font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all shadow-sm"

        >

          Accept

        </button>

      </div>

    );

  }



  // Full Screen Emergency Mode

  return (

    <motion.div 

      className="fixed inset-0 z-[9999] animate-police-flash text-white flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300"

      drag="x"

      dragConstraints={{ left: 0, right: 0 }}

      dragElastic={0.8}

      onDragEnd={(e, info) => {

        if (Math.abs(info.offset.x) > 100) {

          onDismiss && onDismiss(call);

        }

      }}

    >

      <button 

        onClick={() => onDismiss && onDismiss(call)}

        className="absolute top-6 right-6 w-12 h-12 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm transition-all z-50 text-white/80 hover:text-white"

      >

        <X size={24} />

      </button>

      <div className="relative z-10 flex flex-col items-center text-center animate-emergency-shake w-full max-w-2xl pointer-events-none">

        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white text-[#E53935] flex items-center justify-center mb-4 sm:mb-6 shadow-[0_0_100px_rgba(255,255,255,0.5)] relative">

          <div className="absolute inset-0 rounded-full border-4 border-white animate-ping opacity-50" />

          <Bell className="w-8 h-8 sm:w-12 sm:h-12" />

        </div>



        <h1 className="text-2xl sm:text-6xl font-black mb-2 tracking-tighter uppercase drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)]">

          🚨 CUSTOMER REQUEST

        </h1>

        <div className="bg-black/30 backdrop-blur-md px-4 py-3 sm:px-8 sm:py-4 rounded-2xl sm:rounded-3xl mb-6 sm:mb-8 border border-white/20 shadow-xl w-full max-w-3xl">

          <p className="text-lg sm:text-5xl font-black uppercase text-white drop-shadow-lg">

            {displayLabelUpper} NEEDS ASSISTANCE

          </p>

        </div>



        <div className="text-5xl sm:text-7xl font-black mb-4 tabular-nums drop-shadow-md tracking-tight">

          00:{timeLeft.toString().padStart(2, '0')}

        </div>



        {/* Visual Timeline Progress Bar */}

        <div className="w-full max-w-xs sm:max-w-md bg-black/20 rounded-full h-2 sm:h-3 mb-8 sm:mb-10 overflow-hidden backdrop-blur-sm border border-white/10 shadow-inner">

          <div

            className="bg-white h-full transition-all duration-1000 ease-linear rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"

            style={{ width: `${(timeLeft / 12) * 100}%` }}

          />

        </div>



        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pointer-events-auto">

          <button

            onClick={() => onDismiss && onDismiss(call)}

            className="px-8 py-4 sm:px-8 sm:py-6 bg-black/40 backdrop-blur-md text-white rounded-full text-lg sm:text-2xl font-black uppercase tracking-widest shadow-lg hover:bg-black/60 active:scale-95 transition-all relative overflow-hidden group border border-white/20"

          >

            <span className="relative z-10 flex items-center gap-2"><X size={28} /> DISMISS</span>

          </button>

          

          <button

            onClick={handleAccept}

            className="px-8 py-4 sm:px-12 sm:py-6 bg-white text-[#E53935] rounded-full text-lg sm:text-2xl font-black uppercase tracking-widest shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:scale-105 active:scale-95 transition-all relative overflow-hidden group"

          >

            <div className="absolute inset-0 bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity" />

            <span className="relative z-10 flex items-center gap-2"><Check size={28} /> ACCEPT</span>

          </button>

        </div>

        

        <p className="text-sm font-bold opacity-90 mt-6 uppercase tracking-widest drop-shadow-md">

          Swipe left/right or click dismiss to remove

        </p>

      </div>

    </motion.div>

  );

}

function ItemCard({ item, onAdd, children, className }) {
  const lp = useLongPress(() => onAdd(item));
  return (
    <div {...lp.handlers} className={className} style={{ touchAction: 'pan-y', userSelect: 'none' }}>
      {children}
    </div>
  );
}

export default function CaptainApp({ onLogout }) {

  const { restaurant, user, setAuth } = useAuth();

  const enabledModules = restaurant?.enabledModules || {};
  const activeOutlet = enabledModules.bar && enabledModules.food ? 'both'
    : enabledModules.bar && !enabledModules.food ? 'bar'
    : 'restaurant';

  // Fallback: refresh restaurantType/enabledModules for existing sessions
  useEffect(() => {
    if (!restaurant?.enabledModules) {
      fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.restaurant?.enabledModules) {
            const authKey = Object.keys(localStorage).find(k => k.includes('auth') && localStorage.getItem(k));
            if (authKey) {
              try {
                const parsed = JSON.parse(localStorage.getItem(authKey));
                parsed.restaurant = { ...parsed.restaurant, ...data.restaurant };
                localStorage.setItem(authKey, JSON.stringify(parsed));
              } catch {}
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Fetch sections dynamically
  const [fetchedSections, setFetchedSections] = useState([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/venue/sections`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(r => {
        if (!r.ok) {
          console.error('[fetchedSections] API error:', r.status, r.statusText);
          return [];
        }
        return r.json();
      })
      .then(data => setFetchedSections(Array.isArray(data) ? data : data.sections || []))
      .catch(err => {
        console.error('[fetchedSections] fetch failed:', err);
        setFetchedSections([]);
      });
  }, []);

  const { tables: barTables, setTables: setBarTables } = useBarTableSync();

  const { tables, setTables, isSyncing: tablesLoading, refetch: refetchRestaurantTables } = useTableSync();

  const { menuItems: restaurantMenu, setMenuItems: setRestaurantMenu, categories: restaurantCategories, loading: restaurantMenuLoading } = useMenuSync();

  const { menuItems: barMenu, loading: barMenuLoading } = useBarMenuSync();



  // Socket hooks must be called at top level, not conditionally
  // Preserve hook count; actual room management is done in the socket effect below
  useSocket(null);
  useSocket(null);

  const { activeCalls, clearCall } = useWaiterCalls(activeOutlet);





  // ── All useState/useRef declarations FIRST (before any useMemo that references them) ──

  const [currentCaptain, setCurrentCaptain] = useState(() => {
    const saved = localStorage.getItem(getTenantScopedKey('active_captain'));
    if (saved) return JSON.parse(saved);
    // Respect main auth context when captain logged in via shared LoginScreen
    if (user?.role === 'CAPTAIN' && user?.name) {
      return {
        id: user.id,
        name: user.name,
        initials: user.name.split(' ').map(n => n[0]).join('').toUpperCase(),
        color: 'bg-[#EFF6FF] text-[#1D4ED8]',
      };
    }
    return null;
  });

  const [isLoginView, setIsLoginView] = useState(() => {
    const auth = localStorage.getItem(getTenantScopedKey('captain_auth_v2')) === 'true';
    const hasCaptain = !!localStorage.getItem(getTenantScopedKey('active_captain'));
    if (auth && hasCaptain) return false;
    // Also respect main auth context (captain logged in via shared LoginScreen PIN flow)
    if (user?.role === 'CAPTAIN') return false;
    return true;
  });

  const [availableCaptains, setAvailableCaptains] = useState([]);

  const [captainSlug, setCaptainSlug] = useState(

    () => {
      try {
        const r = JSON.parse(localStorage.getItem('ss_restaurant') || '{}');
        return r?.slug || '';
      } catch { return ''; }
    }

  );

  const [crewLoadError, setCaptainCrewError] = useState('');

  const [crewLoading, setCaptainCrewLoading] = useState(false);

  const [captainSearchQuery, setCaptainSearchQuery] = useState('');

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [pinError, setPinError] = useState('');

  const [pin, setPin] = useState('');

  const [selectedProfile, setSelectedProfile] = useState(null);

  const [view, setView] = useState(() => localStorage.getItem(getTenantScopedKey('captain_view')) || 'tables'); // tables, session

  const [activeTableId, setActiveTableId] = useState(() => localStorage.getItem(getTenantScopedKey('captain_activeTableId')) || null);

  const [searchQuery, setSearchQuery] = useState('');

  const [searchInput, setSearchInput] = useState('');



  // Debounce: only update actual searchQuery 300ms after typing stops

  useEffect(() => {

    const t = setTimeout(() => setSearchQuery(searchInput), 300);

    return () => clearTimeout(t);

  }, [searchInput]);



  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const cartMinimizedBeforeSearchRef = useRef(null);



  const handleSearchFocus = () => {
    if (window.innerWidth < 1024) {
      cartMinimizedBeforeSearchRef.current = isCartMinimized;
      setIsCartMinimized(true);
      setIsSearchFocused(true);
    }
  };



  const handleSearchBlur = () => {

    if (window.innerWidth < 1024) {

      setIsSearchFocused(false);

      if (!searchQuery && cartMinimizedBeforeSearchRef.current !== null) {

        setIsCartMinimized(cartMinimizedBeforeSearchRef.current);

      }

    }

  };



  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef(null);



  const [activeCategory, setActiveCategory] = useState(() => localStorage.getItem(getTenantScopedKey('captain_activeCategory')) || 'All');

  const [activeDiet, setActiveDiet] = useState(() => localStorage.getItem(getTenantScopedKey('captain_activeDiet')) || 'All');

  const [notifications, setNotifications] = useState([]);

  const [isSyncing, setIsSyncing] = useState(false);

  const [previewItem, setPreviewItem] = useState(null);

  const [editingItem, setEditingItem] = useState(null);

  const [isCartMinimized, setIsCartMinimized] = useState(() => localStorage.getItem(getTenantScopedKey('captain_isCartMinimized')) !== 'false');

  const [removedItem, setRemovedItem] = useState(null);

  const removeTimeoutRef = useRef(null);
  const pinTimeoutRef = useRef(null);

  // Tracks the confirmed DB order ID for the current table session.

  // Using a ref (not state) so sendIncrementalKOT always reads the latest

  // value without needing to be in its dependency array.

  const activeOrderIdRef = useRef(null);
  const activeTableIdRef = useRef(null);
  const kotRequestIdRef = useRef(null);

  const isSubmittingKotRef = useRef(false);
  const kotSubmitStartRef = useRef(0); // timestamp guard against stuck submissions
  const printTimeoutRef = useRef(null); // timeout for KOT print acknowledgement
  const addItemCooldownRef = useRef({}); // key: item.id or item.n → last add timestamp
  const lastAnyItemAddedRef = useRef(0);



  // Assignment tracking state

  const [activeView, setActiveView] = useState(() => localStorage.getItem(getTenantScopedKey('captain_active_tab')) || 'assignment');

  const [tableSubCategory, setTableSubCategory] = useState(() => {

    const saved = localStorage.getItem(getTenantScopedKey('softshape_selected_subcategory'));

    if (saved) return saved;

    return '';

  });

  const [selectedPDRRoom, setSelectedPDRRoom] = useState(() => {

    const saved = localStorage.getItem(getTenantScopedKey('captain_selectedPDRRoom'));

    return saved ? Number(saved) : null;

  }); // 1-4

  const [assignment, setAssignment] = useState(null);

  const [todayRevenue, setTodayRevenue] = useState(0);



  const [activeBarMenu, setActiveBarMenu] = useState(() => localStorage.getItem(getTenantScopedKey('captain_activeBarMenu')) || 'food');

  const [tableCarts, setTableCarts] = useState(() => {

    try {

      const saved = localStorage.getItem(getTenantScopedKey('captain_tableCarts'));

      return saved ? JSON.parse(saved) : {};

    } catch {

      return {};

    }

  });

  const lastConfirmedItemsRef = useRef([]);



  // FIX #1: Keep layout height synced to actual visible viewport

  useEffect(() => {

    const setVh = () => {

      const vh = (window.visualViewport?.height ?? window.innerHeight) * 0.01;

      document.documentElement.style.setProperty('--captain-vh', `${vh}px`);

    };

    setVh();

    window.visualViewport?.addEventListener('resize', setVh);

    window.visualViewport?.addEventListener('scroll', setVh);

    window.addEventListener('resize', setVh);

    return () => {

      window.visualViewport?.removeEventListener('resize', setVh);

      window.visualViewport?.removeEventListener('scroll', setVh);

      window.removeEventListener('resize', setVh);

    };

  }, []);

  // ── Debug: log mount and key state ──
  useEffect(() => {
    console.log('[CaptainApp] mounted. user:', user?.id, 'role:', user?.role, 'restaurant:', restaurant?.id);
  }, []);

  useEffect(() => {
    const handleViewportResize = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const screenHeight = window.screen.height;
      const screenWidth = window.innerWidth;
      // Skip cart minimization and scroll when instruction input is focused
      if (viewportHeight < screenHeight * 0.7 && screenWidth < 1024 && !isInstructionFocusedRef.current) {
        setIsCartMinimized(true);
        // Prevent the browser from scrolling the page up when keyboard opens
        if (window.visualViewport) {
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewportResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
    };
  }, []);



  useEffect(() => {
    // Prevent iOS/Android from resizing/scrolling the page when keyboard opens
    const originalHeight = document.documentElement.style.height;
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.height = originalHeight;
      document.body.style.overflow = '';
    };
  }, []);



  // Sticky header scroll detection
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          
          // Show header when scrolling up or at the top
          if (currentScrollY < lastScrollYRef.current || currentScrollY < 10) {
            setIsHeaderVisible(true);
          } 
          // Hide header when scrolling down (and not at top)
          else if (currentScrollY > lastScrollYRef.current && currentScrollY > 10) {
            setIsHeaderVisible(false);
          }
          
          lastScrollYRef.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    // Add scroll listener to window
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);



  const currentSessionItems = tableCarts[activeTableId] ?? [];



  const [activeVariantItem, setActiveVariantItem] = useState(null);

  const [expandedNoteItemId, setExpandedNoteItemId] = useState(null);
  const [inlineQtyItem, setInlineQtyItem] = useState(null);
  const isInstructionFocusedRef = useRef(false);

  // Sticky header scroll state
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  // Menu scroll state for collapsible sticky header
  const [isMenuScrolled, setIsMenuScrolled] = useState(false);
  const menuScrollRef = useRef(null);

  // Cancel-item state

  const [cancelLoading,  setCancelLoading]  = useState({});

  const [cancelConfirm,  setCancelConfirm]  = useState({});

  // KOT dispatch error state — null when no error, or { message, retryItems } when DB write fails.

  // retryItems is the pre-cleared currentSessionItems snapshot so the captain can retry

  // without re-selecting anything.

  const [kotError, setKotError] = useState(null);

  const [sendingKOT, setSendingKOT] = useState(false);

  const [showKotConfirm, setShowKotConfirm] = useState(false);



  // Move-table swap state

  const [showMoveModal,   setShowMoveModal]   = useState(false);

  const [moveLoading,     setMoveLoading]     = useState(false);



  // Table filter state

  const [tableFilter, setTableFilter] = useState(() => {

    return localStorage.getItem(getTenantScopedKey('softshape_captain_table_filter')) || 'my';

  });



  // Menu panel error state for local error boundary

  const [menuPanelError, setMenuPanelError] = useState(null);



  // Sync state to localStorage

  useEffect(() => {

    localStorage.setItem(getTenantScopedKey('captain_view'), view);

    if (activeTableId) {

      localStorage.setItem(getTenantScopedKey('captain_activeTableId'), activeTableId);

    } else {

      localStorage.removeItem(getTenantScopedKey('captain_activeTableId'));

    }

    localStorage.setItem(getTenantScopedKey('captain_searchQuery'), searchQuery);

    localStorage.setItem(getTenantScopedKey('captain_activeCategory'), activeCategory);

    localStorage.setItem(getTenantScopedKey('captain_activeDiet'), activeDiet);

    localStorage.setItem(getTenantScopedKey('captain_isCartMinimized'), isCartMinimized);

    localStorage.setItem(getTenantScopedKey('captain_tableSubCategory'), tableSubCategory);

    if (selectedPDRRoom) {

      localStorage.setItem(getTenantScopedKey('captain_selectedPDRRoom'), selectedPDRRoom);

    } else {

      localStorage.removeItem(getTenantScopedKey('captain_selectedPDRRoom'));

    }

    localStorage.setItem(getTenantScopedKey('captain_activeBarMenu'), activeBarMenu);

    localStorage.setItem(getTenantScopedKey('captain_tableCarts'), JSON.stringify(tableCarts));

    localStorage.setItem(getTenantScopedKey('captain_active_tab'), activeView);

    localStorage.setItem(getTenantScopedKey('softshape_captain_table_filter'), tableFilter);

  }, [view, activeTableId, searchQuery, activeCategory, activeDiet, isCartMinimized, tableSubCategory, selectedPDRRoom, activeBarMenu, tableCarts, activeView, tableFilter]);



  // Monitor menu loading errors for local error boundary

  useEffect(() => {

    if (restaurantMenuLoading || barMenuLoading) return;

    // Check for errors from menu sync services

    const restaurantError = restaurantMenuLoading === false && restaurantMenu.length === 0;

    const barError = barMenuLoading === false && barMenu.length === 0 && (activeOutlet === 'bar' || activeOutlet === 'both');

    if (restaurantError || barError) {

      setMenuPanelError(new Error('Menu failed to load'));

    } else {

      setMenuPanelError(null);

    }

  }, [restaurantMenuLoading, barMenuLoading, restaurantMenu.length, barMenu.length, activeOutlet]);



  // ── Derived / memoised values (safe now that all state is declared above) ──

  const totalActiveTablesCount = useMemo(() => {

    if (!currentCaptain?.id) return 0;

    const activeList = (activeOutlet === 'bar' || activeOutlet === 'both') ? barTables : tables;

    return activeList.filter(t => t.captainId === currentCaptain.id && t.status !== TABLE_STATUS.FREE).length;

  }, [tables, barTables, currentCaptain?.id, activeOutlet]);



  const hasReachedActiveLimit = false;



  const pendingCalls = useMemo(() => {

    return activeCalls.filter(c => c.status === 'pending' && (c.source || 'restaurant') === activeOutlet);

  }, [activeCalls, activeOutlet]);



  const loadCaptainRevenue = useCallback((captainId) => {

    if (!captainId) return;

    const todayDateISO = new Date().toISOString().slice(0, 10);

    const restaurantFetch = fetchTransactions(getCurrentRestaurantId(), 500, todayDateISO);

    Promise.allSettled([restaurantFetch]).then(results => {

      const allTxns = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

      const filtered = allTxns.filter(t => t.captainId === captainId);

      const sum = filtered.reduce((acc, t) => acc + Number(t.amount || 0), 0);

      setTodayRevenue(sum);

    });

  }, []);



  const loadAssignment = useCallback(async (captainId) => {

    if (!captainId) return;

    try {

      const data = await fetchCaptainTarget(captainId);

      setAssignment(data);

    } catch (err) {

      console.error('[CaptainApp] Failed to load assignment:', err);

    }

  }, []);



  // Derive today's specials from the live global menu — eliminates dead softshape_specials key

  const activeMenuItems = (activeOutlet === 'bar' || activeOutlet === 'both') ? barMenu : restaurantMenu;

  const setMenuItems = (activeOutlet === 'bar' || activeOutlet === 'both') ? () => { } : setRestaurantMenu;

  const menuLoading = (activeOutlet === 'bar' || activeOutlet === 'both') ? barMenuLoading : restaurantMenuLoading;

  // Derived — switch between restaurant and bar floor
  const activeTables = (activeOutlet === 'bar' || activeOutlet === 'both') ? barTables : tables;

  const setActiveTables = (activeOutlet === 'bar' || activeOutlet === 'both') ? setBarTables : setTables;

  const activeTable = useMemo(() =>
    activeTables.find(t => t.id === activeTableId),
  [activeTables, activeTableId]);



  const activeRestaurantId = useMemo(() => {

    if (activeOutlet === 'bar' || activeOutlet === 'both') return getCurrentRestaurantId();

    if (tableSubCategory === 'parcel') return getCurrentRestaurantId();

    if (tableSubCategory && tableSubCategory !== '' && !['dine-in', 'parcel'].includes(tableSubCategory)) {
      console.warn('[CaptainApp] Unknown tableSubCategory:', tableSubCategory, '— falling back to getCurrentRestaurantId()');
    }

    return getCurrentRestaurantId();

  }, [activeOutlet, tableSubCategory]);

  const outletFilteredMenuItems = useMemo(() => {
    const base = ((activeOutlet === 'bar' || activeOutlet === 'both') ? barMenu : restaurantMenu).filter(item => item.isAvailable !== false);

    // Resolve currentVenueId from actual table section ID (not hardcoded tag)
    let currentVenueId = activeTable?.sectionId || activeTable?.section?.id || null;
    if (!currentVenueId) {
      // Look up section from fetchedSections by subcategory
      const section = fetchedSections.find(s => {
        const sourceKey = s.sectionTag?.startsWith('venue-') ? s.sectionTag.slice(6) : s.sectionTag;
        return sourceKey === tableSubCategory || s.name === tableSubCategory;
      });
      if (section) {
        currentVenueId = section.sectionTag || section.id;
      } else {
        // Fallback: find by matching table section name
        for (const t of activeTables) {
          const tSection = fetchedSections.find(s => s.name === (t.sectionName || t.section?.name));
          if (tSection) {
            const sourceKey = tSection.sectionTag?.startsWith('venue-') ? tSection.sectionTag.slice(6) : tSection.sectionTag;
            if (sourceKey === tableSubCategory) {
              currentVenueId = tSection.sectionTag || tSection.id;
              break;
            }
          }
        }
      }
    }

    // Build venue price map from item.venuePrices keyed by section ID
    const venueSpecificPrices = {};
    for (const item of base) {
      const vp = item.venuePrices?.[currentVenueId];
      if (vp !== undefined) venueSpecificPrices[item.id] = vp;
    }

    const isBarVenueContext = (activeOutlet === 'bar' || activeOutlet === 'both') && currentVenueId !== null;

    return base.map(item => {
      const overridePrice = venueSpecificPrices[item.id];
      let finalPrice;
      if (isBarVenueContext) {
        // Bar venue: only show items with an explicit venue price > 0 (no base-price fallback)
        finalPrice = overridePrice !== undefined ? Number(overridePrice) : 0;
      } else {
        finalPrice = overridePrice !== undefined
          ? Number(overridePrice)
          : Number(item.p || item.price || 0);
      }
      const remappedVariants = item.variants?.map(v => {
        const variantOverride = venueSpecificPrices[`${item.id}_variant_${v.id}`];
        return variantOverride !== undefined
          ? { ...v, price: Number(variantOverride) }
          : v;
      }) ?? item.variants;

      return { ...item, p: finalPrice, variants: remappedVariants };
    }).filter(item => {
      if (isBarVenueContext) {
        return Number(item.p) > 0;
      }
      return true;
    });
  }, [activeOutlet, barMenu, restaurantMenu, tableSubCategory, activeTable, activeTables, fetchedSections]);



  const categories = useMemo(() => {
    const cats = new Set(outletFilteredMenuItems.map(i => i.c));

    return ['All', ...Array.from(cats)].filter(Boolean);
  }, [outletFilteredMenuItems]);



  const todaySpecials = useMemo(() => {

    const now = Date.now();

    return outletFilteredMenuItems.filter(

      i => i.isSpecial && i.active && (!i.expiresAt || now < i.expiresAt)

    );

  }, [outletFilteredMenuItems]);



  const sessionBill = useMemo(() => {

    if (!activeTable) return { subtotal: 0, taxes: 0, total: 0, grandTotal: 0 };



    const isFreshSession =

      activeTable?.status === TABLE_STATUS.FREE ||

      (

        !activeTable?.kotHistory?.length &&

        !activeTable?.currentBill &&

        !activeTable?.activeOrder &&

        !lastConfirmedItemsRef.current.length   // FIX #5: also check ref

      );



    if (isFreshSession) {

      return calculateOrderTotal(currentSessionItems);

    }



    const committedItems = getBillableItems(activeTable);



    // FIX #5: Use whichever is larger — DB items or lastConfirmedRef items

    // This prevents the total from dropping when a socket update arrives with

    // an empty activeOrder before the DB items are fetched

    const refItems = lastConfirmedItemsRef.current;

    const itemsForTotal =

      committedItems.length >= refItems.length

        ? committedItems

        : refItems;



    return calculateOrderTotal([...itemsForTotal, ...currentSessionItems]);

  }, [activeTable, currentSessionItems]);



  // Helper functions for captain colors

  const getCaptainBorderColor = (captainId) => {
    const captain = availableCaptains.find(c => c.id === captainId);
    if (!captain) return '';
    const match = captain.color?.match(/text-\[([^\]]+)\]/);
    return match ? `border-l-[${match[1]}]` : '';
  };

  const getCaptain = (captainId) => {
    return availableCaptains.find(c => c.id === captainId);
  };



  // Determine which table array is actually being displayed based on subcategory

  // Build dynamic set of venue subcategory source keys from fetchedSections
  const venueSubcategories = useMemo(() => {
    const set = new Set();
    for (const section of fetchedSections) {
      const sourceKey = section.sectionTag?.startsWith('venue-') ? section.sectionTag.slice(6) : section.sectionTag;
      if (sourceKey) set.add(sourceKey);
    }
    return set;
  }, [fetchedSections]);

  // Build dynamic sectionTagToSource map from fetchedSections
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

  const displayTables = useMemo(() => {

    const isVenueSubcategory = venueSubcategories.has(tableSubCategory);

    return activeTables;

  }, [activeTables, tableSubCategory, venueSubcategories]);



  // Filtered tables based on filter selection

  const filteredTables = useMemo(() => {

    let baseTables = displayTables;



    // When in bar outlet main bar section, further narrow to bar-section tables

    const mainBarSourceKey = fetchedSections.find(s => s.venue?.venueType === 'BAR')?.name || '';

    if ((activeOutlet === 'bar' || activeOutlet === 'both') && tableSubCategory === mainBarSourceKey && mainBarSourceKey !== '') {

      const mainBarSection = fetchedSections.find(s => s.venue?.venueType === 'BAR');

      const barTables = displayTables.filter(t => {

        const sec = (t.sectionName || t.section?.name || '').toLowerCase();

        return mainBarSection ? sec === mainBarSection.name.toLowerCase() : false;

      });

      baseTables = barTables.length > 0 ? barTables : displayTables;

    }



    if (tableFilter === 'all') return baseTables;

    return baseTables.filter(t => t.captainId === currentCaptain?.id);

  }, [displayTables, tableFilter, currentCaptain?.id, activeOutlet, tableSubCategory, fetchedSections, sectionTagToSource]);



  const freeCount = useMemo(() => displayTables.filter(t => t.status === TABLE_STATUS.FREE).length, [displayTables]);

  const busyCount = useMemo(() => displayTables.filter(t => t.status !== TABLE_STATUS.FREE).length, [displayTables]);



  const myTablesCount = useMemo(() => {

    return displayTables.filter(t => t.captainId === currentCaptain?.id).length;

  }, [displayTables, currentCaptain?.id]);



  const allTablesCount = useMemo(() => displayTables.length, [displayTables]);



  const filteredMenu = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) {
      // No search — apply category and diet filters normally
      return outletFilteredMenuItems.filter(item => {
        if (activeCategory !== 'All' && item.c !== activeCategory) return false;
        if (activeDiet !== 'All' && item.t !== activeDiet) return false;
        return true;
      });
    }

    // Use shared filterMenuItems for consistent search behavior across all terminals
    const baseResults = filterMenuItems(outletFilteredMenuItems, {
      query: searchQuery,
      category: activeCategory,
      diet: activeDiet,
    });

    return baseResults.sort((a, b) => {
      const an = (a.n || '').toLowerCase();
      const bn = (b.n || '').toLowerCase();
      const query = q;

      // Exact full-name match comes first
      if (an === query) return -1;
      if (bn === query) return 1;

      // Items whose name starts with the query come next
      if (an.startsWith(query) && !bn.startsWith(query)) return -1;
      if (bn.startsWith(query) && !an.startsWith(query)) return 1;

      // Then items matching more words rank higher
      const words = query.split(/\s+/).filter(Boolean);
      const aScore = words.filter(w => an.includes(w)).length;
      const bScore = words.filter(w => bn.includes(w)).length;
      return bScore - aScore;
    });
  }, [searchQuery, activeCategory, activeDiet, outletFilteredMenuItems]);



  const suggestedSpecials = useMemo(() => {

    if (currentSessionItems.length === 0) return [];



    let hasSoup = false, hasBiryani = false, hasStarter = false;

    currentSessionItems.forEach(item => {

      const name = item.n.toLowerCase();

      if (name.includes('soup')) hasSoup = true;

      if (name.includes('biryani')) hasBiryani = true;

      if (item.c === 'Starters') hasStarter = true;

    });



    let suggestions = [];

    if (hasSoup && !hasBiryani) {

      suggestions = outletFilteredMenuItems.filter(m => m.n.toLowerCase().includes('biryani') || m.n === 'Chicken 65');

    } else if (hasBiryani) {

      suggestions = outletFilteredMenuItems.filter(m => m.c === 'Drinks' || m.c === 'Desserts' || m.n === 'Chicken Lollipop');

    } else if (hasStarter) {

      suggestions = outletFilteredMenuItems.filter(m => m.c === 'Main Course' || m.c === 'Drinks');

    } else {

      suggestions = outletFilteredMenuItems.filter(m => m.c === 'Desserts' || m.c === 'Drinks');

    }



    // Filter out items already in the cart

    suggestions = suggestions.filter(s => !currentSessionItems.find(i => i.n === s.n));

    return suggestions.slice(0, 4);

  }, [currentSessionItems, outletFilteredMenuItems]);



  const displaySpecials = useMemo(() => {

    // todaySpecials is now derived from live menuItems — always up to date

    const liveSpecials = todaySpecials.filter(s => !currentSessionItems.find(i => i.n === s.n));

    if (liveSpecials.length > 0) {

      return liveSpecials.slice(0, 4);

    }

    return suggestedSpecials;

  }, [todaySpecials, suggestedSpecials, currentSessionItems]);



  useEffect(() => {
    // Show the Live Sync indicator whenever the global menu broadcasts an update
    const onMenuUpdated = () => {
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 800);
    };
    window.addEventListener('softshape_menu_updated', onMenuUpdated);

    // Listen for settled/terminated tables from sync services and clear stale state immediately
    const onTableSettled = (e) => {
      const { tableId } = e.detail || {};
      if (!tableId) return;
      // Clear cart for this table from localStorage-backed state
      setTableCarts(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
      // If this is the currently active table, reset all session state
      if (String(activeTableIdRef.current) === String(tableId)) {
        setActiveTableId(null);
        activeOrderIdRef.current = null;
        lastConfirmedItemsRef.current = [];
        kotRequestIdRef.current = null;
        setKotError(null);
        setSendingKOT(false);
        isSubmittingKotRef.current = false;
        setView('tables');
        addNotification('Table settled by cashier', 'success');
      }
    };
    window.addEventListener('table:settled', onTableSettled);

    if (!activeRestaurantId) return;

    const socket = getSocket();

    // Join the active outlet room; also join venue-001 whenever captain is on a
    // venue subcategory so real-time updates reach all sections.
    socket.emit('join', activeRestaurantId);

    const onConnect = () => {
      socket.emit('join', activeRestaurantId);
    };
    socket.on('connect', onConnect);

    // Listen for socket menu update events from admin panel
    const onMenuItemUpdated = (payload) => {
      console.log('[CaptainApp] Received menu-item-updated:', payload);
      window.dispatchEvent(new CustomEvent('menu-item-updated', { detail: payload }));
    };
    socket.on('menu-item-updated', onMenuItemUpdated);

    const onOrderPaid = (payload) => {
      const tableId = payload?.tableId;
      if (!tableId) return;

      const clearTable = (prev) => prev.map(t =>
        t.backendId === tableId || t.id === tableId
          ? { ...t, status: 'Free', workflowStatus: 'Free', activeOrder: null, orders: [], kotHistory: [], currentBill: 0, captainId: null, guests: 0, time: null }
          : t
      );
      setActiveTables(clearTable);

      if (activeTableIdRef.current && String(tableId) === String(activeTableIdRef.current)) {
        const settledId = activeTableIdRef.current;
        setTableCarts(prev => {
          const next = { ...prev };
          delete next[settledId];
          return next;
        });
        setActiveTableId(null);
        activeOrderIdRef.current = null;
        lastConfirmedItemsRef.current = [];
        kotRequestIdRef.current = null;
        addNotification('Order settled', 'success');
      }
    };

    const mergeOrderItems = (existing = [], incoming = []) => {
      const map = new Map();
      const incomingByName = new Map(incoming.map(i => [i.name ?? i.n, i]).filter(([k]) => !!k));

      // Keep existing items unless they are optimistic placeholders (no id) that the backend
      // has now confirmed with a real id. Cancelled items stay in the map so the captain can
      // render them as struck-through.
      existing.forEach(i => {
        const name = i.name ?? i.n;
        if (!i.id && name && incomingByName.has(name)) return;
        if (i.id) map.set(i.id, i);
      });

      // Merge incoming items on top. Incoming is authoritative for cancellation state
      // EXCEPT when existing is locally cancelled and incoming is stale (not cancelled).
      incoming.forEach(i => {
        if (!i.id) return;
        const existingItem = map.get(i.id);
        if (!existingItem) {
          map.set(i.id, i);
          return;
        }
        // Don't let a stale incoming revive a locally-cancelled item
        if (existingItem.removedFromBill && !i.removedFromBill) {
          return;
        }
        // Incoming confirms a cancel — use it
        if (i.removedFromBill && !existingItem.removedFromBill) {
          map.set(i.id, { ...existingItem, ...i });
          return;
        }
        // Neither is cancelled — prefer the HIGHER quantity to protect additions
        const existingQty = Number(existingItem.quantity ?? existingItem.q ?? 0);
        const incomingQty = Number(i.quantity ?? i.q ?? 0);
        if (incomingQty > existingQty) {
          map.set(i.id, { ...existingItem, ...i });
        } else {
          map.set(i.id, { ...i, ...existingItem });
        }
      });

      return Array.from(map.values());
    };

    const dedupKotHistory = (existing = [], incoming = []) => {
      const map = new Map();
      [...existing, ...incoming].forEach(k => {
        const existingK = map.get(k.id);
        if (!existingK || (k.createdAt || 0) > (existingK.createdAt || 0)) {
          map.set(k.id, k);
        }
      });
      return Array.from(map.values());
    };

    const onTableUpdated = ({ table } = {}) => {
      if (!table?.id) return;
      if (table.restaurantId && table.restaurantId !== activeRestaurantId) return;
      const applyUpdate = (prev) => prev.map(t => {
        if (t.backendId !== table.id && t.id !== table.id) return t;

        const incomingIsAvailable = table.workflowStatus === 'Free' || table.status === 'AVAILABLE';
        if (incomingIsAvailable && t.activeOrder) {
          const incomingHasLiveData = Array.isArray(table.orders) && table.orders.length > 0 && table.orders[0]?.items?.length > 0;
          const incomingHasBill = (table.currentBill ?? 0) > 0;
          if (incomingHasLiveData || incomingHasBill) {
            console.warn('[CaptainApp] Skipping stale AVAILABLE event — table still has data', t.number);
            return t;
          }
        }

        const incomingOrder = table.orders?.[0] || table.activeOrder;
        const mergedItems = incomingOrder?.items
          ? mergeOrderItems(t.activeOrder?.items || [], incomingOrder.items)
          : (t.activeOrder?.items || []);
        const isTableFree = table.workflowStatus === 'Free' || table.status === 'AVAILABLE';
        const mergedKotHistory = isTableFree
          ? []
          : dedupKotHistory(t.kotHistory || [], Array.isArray(table.kotHistory) ? table.kotHistory : []);
        return {
          ...t,
          status: table.workflowStatus || (table.status !== undefined ? table.status : t.status),
          workflowStatus: table.workflowStatus ?? t.workflowStatus,
          currentBill: table.currentBill ?? t.currentBill,
          activeOrder: incomingOrder
            ? { ...(t.activeOrder || {}), ...incomingOrder, items: mergedItems }
            : t.activeOrder,
          kotHistory: mergedKotHistory,
        };
      });
      setActiveTables(applyUpdate);
    };
    socket.on('table:updated', onTableUpdated);

    const onOrderUpdated = (payload) => {
      const order = payload?.order || payload;
      if (!order?.tableId) return;
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId !== order.tableId) return t;
        // Merge incoming items with existing so KOTs don't vanish
        const mergedItems = mergeOrderItems(t.activeOrder?.items || [], order.items || []);
        const mergedOrder = { ...(t.activeOrder || {}), ...order, items: mergedItems };
        // Sync cancelled status back into kotHistory items
        const cancelledIds = new Set(
          (order.items || []).filter(i => i.removedFromBill).map(i => i.id)
        );
        const updatedKotHistory = dedupKotHistory(
          (t.kotHistory || []).map(kot => ({
            ...kot,
            items: kot.items.map(i =>
              cancelledIds.has(i.orderItemId) ? { ...i, s: 'Cancelled', removedFromBill: true } : i
            )
          })),
          Array.isArray(order.kotHistory) ? order.kotHistory : []
        );
        return { ...t, activeOrder: mergedOrder, kotHistory: updatedKotHistory };
      });
      setActiveTables(updateTables);
    };
    socket.on('order:updated', onOrderUpdated);

    const onOrderCreated = (payload) => {
      const order = payload?.order || payload;
      if (!order?.tableId) return;
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId !== order.tableId) return t;
        // Merge items with existing so previously sent KOT items don't vanish
        // if order:created arrives after order:updated (socket race condition)
        const mergedItems = mergeOrderItems(t.activeOrder?.items || [], order.items || []);
        return {
          ...t,
          activeOrder: { ...order, items: mergedItems },
          status: t.status === 'Free' ? 'Occupied' : t.status,
          workflowStatus: t.workflowStatus === 'Free' ? 'Occupied' : t.workflowStatus,
        };
      });
      setActiveTables(updateTables);
    };
    socket.on('order:created', onOrderCreated);

    const onBillingRequested = (payload) => {
      const { table } = payload;
      if (!table?.id) return;
      const updateTables = (prev) => prev.map(t =>
        t.backendId === table.id ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : t
      );
      setActiveTables(updateTables);
    };
    socket.on('billing:requested', onBillingRequested);

    socket.on('order:paid', onOrderPaid);

    return () => {
      window.removeEventListener('softshape_menu_updated', onMenuUpdated);
      window.removeEventListener('table:settled', onTableSettled);
      socket.off('connect', onConnect);
      socket.off('menu-item-updated', onMenuItemUpdated);
      socket.off('table:updated', onTableUpdated);
      socket.off('order:updated', onOrderUpdated);
      socket.off('order:created', onOrderCreated);
      socket.off('billing:requested', onBillingRequested);
      socket.off('order:paid', onOrderPaid);
      socket.emit('leave', activeRestaurantId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurantId, tableSubCategory]);



  // Realtime assignment + revenue sync

  useEffect(() => {

    if (!currentCaptain?.id) return;

    loadAssignment(currentCaptain.id);

    loadCaptainRevenue(currentCaptain.id);



    // Poll every 60 seconds so captain sees new assignments without refresh

    const interval = setInterval(() => {

      loadAssignment(currentCaptain.id);

      loadCaptainRevenue(currentCaptain.id);

    }, 60000);



    return () => clearInterval(interval);

  }, [currentCaptain, loadAssignment, loadCaptainRevenue]);



  useEffect(() => {

    if (tablesLoading) {

      setIsSyncing(true);

      const timer = setTimeout(() => setIsSyncing(false), 800);

      return () => clearTimeout(timer);

    }

  }, [tablesLoading]);



  // Persist table filter preference

  useEffect(() => {

    localStorage.setItem(getTenantScopedKey('softshape_captain_table_filter'), tableFilter);

  }, [tableFilter]);



  // Reset tableSubCategory when switching outlets — use first fetched section
  useEffect(() => {
    const matchingSection = fetchedSections.find(s => {
      const sectionOutlet = s.venue?.venueType === 'BAR' ? 'bar' : 'restaurant';
      if (activeOutlet === 'both') return true;
      return sectionOutlet === activeOutlet;
    }) || fetchedSections[0];
    if (matchingSection) {
      const sourceKey = sectionTagToSource[matchingSection.sectionTag] || matchingSection.name;
      setTableSubCategory(sourceKey);
    }



    // Clear the active session so restaurant cart items don't bleed into bar (and vice versa)

    setActiveView('tables');

    setActiveTableId(null);

    setTableCarts({});

    lastConfirmedItemsRef.current = [];

    activeOrderIdRef.current = null;

    kotRequestIdRef.current = null;

    setSearchInput('');

    setSearchQuery('');

    setActiveCategory('All');

    setActiveDiet('All');

    setKotError(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [activeOutlet, fetchedSections, sectionTagToSource]);



  // Persist venue selection to shared localStorage key

  useEffect(() => {

    localStorage.setItem(getTenantScopedKey('softshape_selected_subcategory'), tableSubCategory);

  }, [tableSubCategory]);



  // Cross-tab sync: update venue selection when changed in another tab (Cashier / Captain)

  useEffect(() => {

    const onStorage = (e) => {

      if (e.key === getTenantScopedKey('softshape_selected_subcategory') && e.newValue && e.newValue !== tableSubCategory) {

        setTableSubCategory(e.newValue);

      }

    };

    window.addEventListener('storage', onStorage);

    return () => window.removeEventListener('storage', onStorage);

  }, [tableSubCategory]);



  // Fix 3: Reset menu filters when venue changes so stale filters don't hide the new venue's menu

  useEffect(() => {

    setSearchQuery('');

    setActiveCategory('All');

    setActiveDiet('All');

    setSelectedPDRRoom(null);

  }, [tableSubCategory]);


  // Clean up stale cart keys when a table is deleted from the active list

  useEffect(() => {
    if (tablesLoading) return;
    const validIds = new Set(activeTables.map(t => String(t.id)));
    setTableCarts(prev => {

      const cleaned = Object.fromEntries(

        Object.entries(prev).filter(([k]) => validIds.has(k))

      );

      return Object.keys(cleaned).length === Object.keys(prev).length ? prev : cleaned;

    });
  }, [activeTables, tablesLoading]);



  // SHARED STATE PERSISTENCE



  const notificationIdRef = useRef(0);

  const addNotification = (title, type = 'success') => {

    const id = ++notificationIdRef.current;

    setNotifications(prev => [...prev, { id, title, type }]);

    const timer = setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);

    return () => clearTimeout(timer);

  };



  const startVoiceSearch = useCallback(() => {

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {

      addNotification('Voice search is not supported. Use Chrome on Android.', 'error');

      return;

    }

    if (isListening) {

      recognitionRef.current?.abort();

      recognitionRef.current = null;

      setIsListening(false);

      return;

    }

    // Abort any orphaned instance before creating a new one
    recognitionRef.current?.abort();

    const recognition = new SpeechRecognition();

    recognitionRef.current = recognition;

    recognition.lang = 'en-IN';

    recognition.interimResults = false;

    recognition.maxAlternatives = 5;



    recognition.onresult = (event) => {
      const results = event.results[0];
      // Use the top transcript directly — raw spoken words as search query
      const transcript = results[0].transcript.trim();
      setSearchInput(transcript);
    };



    recognition.onerror = (e) => {

      if (e.error === 'not-allowed') {

        addNotification('Microphone access denied. Please allow microphone access.', 'error');

      }

      setIsListening(false);

    };

    recognition.onend = () => setIsListening(false);

    setIsListening(true);

    try {

      recognition.start();

    } catch (err) {

      addNotification('Voice search failed to start. Please try again.', 'error');

      setIsListening(false);

    }

  }, [isListening, outletFilteredMenuItems]);



  const handleImageUpload = (e, item) => {

    const file = e.target.files[0];

    if (!file) return;



    const reader = new FileReader();

    reader.onload = (event) => {

      const img = new Image();

      img.onload = () => {

        const canvas = document.createElement('canvas');

        const MAX_WIDTH = 600;

        const MAX_HEIGHT = 450;

        let width = img.width;

        let height = img.height;



        if (width > height) {

          if (width > MAX_WIDTH) {

            height *= MAX_WIDTH / width;

            width = MAX_WIDTH;

          }

        } else {

          if (height > MAX_HEIGHT) {

            width *= MAX_HEIGHT / height;

            height = MAX_HEIGHT;

          }

        }



        canvas.width = width;

        canvas.height = height;

        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, width, height);



        const base64String = canvas.toDataURL('image/jpeg', 0.7); // Compress to prevent localStorage crash



        setMenuItems(prev => prev.map(m => m.n === item.n ? { ...m, img: base64String } : m));

        setEditingItem(null);

        addNotification(`${item.n} image updated globally`, 'success');

      };

      img.src = event.target.result;

    };

    reader.readAsDataURL(file);

  };



  const handleProfileSelect = (profile) => {

    setSelectedProfile(profile);

    setPin('');

    unlockAudioContext();

  };

  const loadCaptainCrew = async () => {

    if (!captainSlug.trim()) {

      setCaptainCrewError('Enter your restaurant ID or slug');

      return;

    }

    setCaptainCrewLoading(true);

    setCaptainCrewError('');

    try {

      const data = await authService.fetchCrew(captainSlug.trim());

      setAvailableCaptains(data.captains || []);

      // Cache the resolved DB restaurantId for socket/order routing

      if (data.restaurantId) {

        localStorage.setItem(getTenantScopedKey('pending_restaurant_id'), data.restaurantId);

      }

      if ((data.captains || []).length === 0) {

        setCaptainCrewError('No active captains found for this restaurant.');

      }

    } catch (e) {

      setCaptainCrewError(e.message || 'Could not load staff');

    } finally {

      setCaptainCrewLoading(false);

    }

  };



  const handlePinInput = (num) => {

    setPinError('');

    if (pin.length < 4 && !isAuthenticating) {

      const newPin = pin + num;

      setPin(newPin);

      if (newPin.length === 4) {

        setIsAuthenticating(true);

        unlockAudioContext();

        const authTimer = setTimeout(async () => {

          try {

            const restaurantId = localStorage.getItem(getTenantScopedKey('pending_restaurant_id')) || getCurrentRestaurantId();
            if (!restaurantId) {
              setPinError('Session expired, please reload and log in again.');
              setIsAuthenticating(false);
              return;
            }
            const { token, user, restaurant } = await authService.captainLogin(restaurantId, selectedProfile.id, newPin);

            if (token && user) {
              setAuth({ token, user, restaurant });
            }

            const enriched = {
              ...user,
              initials: selectedProfile.initials,
              color: selectedProfile.color || 'bg-[#EFF6FF] text-[#1D4ED8]',
            };

            setCurrentCaptain(enriched);

            setIsLoginView(false);

            localStorage.setItem(getTenantScopedKey('captain_auth_v2'), 'true');

            localStorage.setItem(getTenantScopedKey('active_captain'), JSON.stringify(enriched));

            unlockAudioContext();

          } catch {

            setPin('');

            setPinError('Invalid PIN. Please try again.');

          } finally {

            setIsAuthenticating(false);

          }

        }, 600);
        pinTimeoutRef.current = authTimer;

      }

    }

  };



  // INVARIANT: lastConfirmedItemsRef.current must be reset to [] whenever openTableSession is called, not just when cancelSession is called.

  // INVARIANT: activeOrderIdRef.current must be null when a captain opens a free table. It must only be set to a real DB order ID when that order exists, is active (not PAID/CANCELLED), and has items.

  const openTableSession = (table) => {
    if (!table || !table.id) {
      console.warn('[CaptainApp] openTableSession blocked: missing table or table.id', table);
      return;
    }
    // BUG FIX: Reset ALL session state before switching tables so nothing from the previous table leaks in.
    // Clear the previous table's cart from localStorage-backed state.
    const previousTableId = activeTableIdRef.current;
    if (previousTableId) {
      const prevCart = tableCarts[previousTableId];
      const hasUnsentItems = Array.isArray(prevCart) && prevCart.some(i => i.s === 'Pending');
      if (!hasUnsentItems) {
        setTableCarts(prev => {
          const next = { ...prev };
          delete next[previousTableId];
          return next;
        });
      }
    }
    setTableCarts(prev => ({ ...prev, [table.id]: [] }));
    lastConfirmedItemsRef.current = [];
    activeOrderIdRef.current = null;
    kotRequestIdRef.current = null;
    setKotError(null);
    setSendingKOT(false);
    isSubmittingKotRef.current = false;
    setExpandedNoteItemId(null);
    setInlineQtyItem(null);
    setActiveVariantItem(null);
    setPreviewItem(null);
    setEditingItem(null);

    setActiveTableId(table.id);
    lastConfirmedItemsRef.current = getTableItems(table); // seed immediately from live table
    setView('session');
  };



  // INVARIANT: Adding items to the cart NEVER changes table status or persists anything to backend.

  // Table status only changes to PREPARING when a KOT is successfully sent (see sendIncrementalKOT).

  // This prevents the cashier from seeing a table as occupied before any order is confirmed.

  const addItemToSession = (item, variant = null) => {
    if (!activeTableId) {
      console.warn('[CaptainApp] addItemToSession blocked: no activeTableId. Item:', item?.n, 'view:', view);
      return; // no active table, do nothing
    }
    const itemKey = String(item.id || item.n || '');
    const now = Date.now();
    const lastAdd = addItemCooldownRef.current[itemKey] || 0;
    if (now - lastAdd < 2000) return; // 2-second cooldown per item
    addItemCooldownRef.current[itemKey] = now;

    // Global 2s cooldown — any item add blocks all other item adds
    const existingInCart = (tableCarts[activeTableId] ?? []).find(i => i.n === item.n);
    if (!existingInCart) {
      if (now - lastAnyItemAddedRef.current < 2000) return;
      lastAnyItemAddedRef.current = now;
    }

    const finalPrice = variant ? Number(variant.price) : item.p;



    setTableCarts(prev => {

      const currentCart = prev[activeTableId] ?? [];

      const existing = currentCart.find(i => i.n === item.n);

      let updatedCart;

      if (existing) {

        updatedCart = currentCart.map(i => i.n === item.n ? { ...i, q: i.q + 1 } : i);

      } else {

        updatedCart = [...currentCart, { ...item, n: item.n, p: finalPrice, q: 1, notes: null, s: 'Pending', menuType: item.menuType || 'FOOD' }];

      }

      return { ...prev, [activeTableId]: updatedCart };

    });

    addNotification(`${item.n} added`, 'success');

    setSearchQuery('');

  };



  const handleItemClick = (e, item) => {
    e.stopPropagation();
    console.log('[CaptainApp] handleItemClick:', item?.n, 'activeTableId:', activeTableId, 'view:', view);

    // Beer items should be added directly
    if ((activeOutlet === 'bar' || activeOutlet === 'both') && isBeerItem(item)) {
      addItemToSession(item);
      return;
    }

    // Other liquor items (spirits) should show variant picker
    if ((activeOutlet === 'bar' || activeOutlet === 'both') && item.menuType === 'LIQUOR' && !item.isBottleItem) {
      setActiveVariantItem(item);
    } else {
      addItemToSession(item);
    }
  };



  const handleVariantSelect = (item, variant) => {

    setActiveVariantItem(null);

    addItemToSession(item, variant);

  };



  const cancelSession = () => {

    setTableCarts(prev => ({ ...prev, [activeTableId]: [] }));

    lastConfirmedItemsRef.current = [];

    activeOrderIdRef.current = null;

    kotRequestIdRef.current = null;

    if (activeTable && (!activeTable.kotHistory || activeTable.kotHistory.length === 0)) {
      setActiveTables(currentTables => currentTables.map(t => {
        if (t.id === activeTable.id) {

          return { ...t, status: TABLE_STATUS.FREE, captainId: null };

        }

        return t;

      }));

    }

    setView('tables');

  };



  const updateDraftQty = (name, delta) => {

    let itemToRemove = null;

    setTableCarts(prev => {

      const currentCart = prev[activeTableId] ?? [];

      const itemToUpdate = currentCart.find(i => i.n === name);

      if (itemToUpdate && itemToUpdate.q + delta <= 0) {

        itemToRemove = itemToUpdate;

      }

      const updatedCart = currentCart.map(i => {

        if (i.n === name) return { ...i, q: i.q + delta };

        return i;

      }).filter(i => i.q > 0);

      return { ...prev, [activeTableId]: updatedCart };

    });

    // Side effects run AFTER the state updater, not inside it
    if (itemToRemove) {
      setRemovedItem(itemToRemove);
      if (removeTimeoutRef.current) clearTimeout(removeTimeoutRef.current);
      removeTimeoutRef.current = setTimeout(() => {
        setRemovedItem(null);
      }, 5000);
    }

  };



  const undoRemove = () => {

    if (removedItem) {

      setTableCarts(prev => {

        const currentCart = prev[activeTableId] ?? [];

        if (currentCart.find(i => i.n === removedItem.n)) return prev;

        return { ...prev, [activeTableId]: [...currentCart, removedItem] };

      });

      setRemovedItem(null);

      if (removeTimeoutRef.current) clearTimeout(removeTimeoutRef.current);

    }

  };



  // Reset the active-order ref when the captain navigates away from a table

  // so the next table session starts fresh.

  // INVARIANT: activeOrderIdRef.current must be null when a captain opens a free table. It must only be set to a real DB order ID when that order exists, is active (not PAID/CANCELLED), and has items.

  useEffect(() => {
    // Sync ref so async socket handlers always read the latest active table
    activeTableIdRef.current = activeTableId;

    // BUG FIX: Reset ALL session state at the top of the effect before any live-table lookup.
    // This guarantees the UI shows empty/clean state first even if the fetch is slow.
    activeOrderIdRef.current = null;
    kotRequestIdRef.current = null;
    lastAnyItemAddedRef.current = 0;
    setKotError(null);
    setSendingKOT(false);
    isSubmittingKotRef.current = false;
    lastConfirmedItemsRef.current = [];

    if (activeTableId) {
      // Ensure the cart for this table starts empty so stale items never appear.
      // (If the table truly has a live session, the sync service will populate it via socket.)
      setTableCarts(prev => {
        const hadCart = prev[activeTableId] && prev[activeTableId].length > 0;
        if (hadCart) {
          return { ...prev, [activeTableId]: [] };
        }
        return prev;
      });

      // Re-seed from live state so second KOT on a reloaded session works correctly
      const liveTableEntry = activeTables.find(
        t => t.backendId === activeTableId || t.id === activeTableId
      );

      const liveOrder = liveTableEntry?.activeOrder;

      if (
        liveOrder?.id &&
        liveTableEntry?.status !== 'Free' &&
        liveTableEntry?.status !== 'AVAILABLE' &&
        liveTableEntry?.dbStatus !== 'AVAILABLE' &&
        liveOrder?.status !== 'CANCELLED' &&
        liveOrder?.status !== 'PAID' &&
        (liveOrder?.items?.length ?? 0) > 0
      ) {
        activeOrderIdRef.current = liveOrder.id;
      } else {
        activeOrderIdRef.current = null;
      }

      // Seed lastConfirmedItemsRef from live table so items survive re-mount/re-open
      lastConfirmedItemsRef.current = getTableItems(liveTableEntry);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTableId]);

  // Stale session guard: if view is 'session' but there's no active table, reset to tables view
  useEffect(() => {
    if (view === 'session' && !activeTableId) {
      console.warn('[CaptainApp] Stale session detected: view=session but no activeTableId. Resetting to tables view.');
      setView('tables');
    }
  }, [view, activeTableId]);

  const sendIncrementalKOT = async () => {
    // Cancel any pending print timeout from a previous KOT before any early return
    clearTimeout(printTimeoutRef.current);

    // Stuck-guard: if a previous submission has been running for >15s, force-reset
    if (isSubmittingKotRef.current && kotSubmitStartRef.current && Date.now() - kotSubmitStartRef.current > 15000) {
      console.warn('[KOT] Stuck submission detected (>15s), forcing reset');
      isSubmittingKotRef.current = false;
      setSendingKOT(false);
    }

    if (sendingKOT || isSubmittingKotRef.current) {
      console.warn('[KOT] Blocked — already submitting. sendingKOT=', sendingKOT, 'ref=', isSubmittingKotRef.current);
      return;
    }

    if (currentSessionItems.length === 0) return;

    if (!currentCaptain) { setIsLoginView(true); return; }

    if (!activeTable?.backendId) {

      addNotification("Table is still syncing", "error");

      return;

    }



    isSubmittingKotRef.current = true;
    kotSubmitStartRef.current = Date.now();

    setSendingKOT(true);



    const existingOrderId = activeOrderIdRef.current;

    const requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36));

    kotRequestIdRef.current = requestId;



    try {

      // Format items for the API — menuType MUST be included so the backend

      // can split food → KOT (kitchen) and liquor → BAR_KOT (bar printer).

      const apiItems = currentSessionItems

        .map(i => ({

          menuItemId: String(i.id || i.menuItemId || ''),

          name: i.n || i.name,

          price: Number(i.p ?? i.price ?? 0),

          quantity: Number(i.q ?? i.quantity ?? 1),

          notes: i.notes || null,

          menuType: ['LIQUOR', 'BAR'].includes(String(i.menuType || 'FOOD').toUpperCase()) ? 'LIQUOR' : 'FOOD',

        }))

        .filter(i => !!i.menuItemId);



      // Snapshot items before clearing — needed for print and retry

      const itemsForPrint = [...currentSessionItems];

      const retrySnapshot = [...currentSessionItems]; // preserved for Retry button

      const newTotalBill = calculateSessionBill(activeTable, currentSessionItems).grandTotal;



      setExpandedNoteItemId(null);

      // Clear error state

      setKotError(null);



      // 1. Create/update order in DB FIRST (CRITICAL: Wait for real KOT ID)

      let savedOrder;

      let realKotId;

      const orderRestaurantId = activeRestaurantId;

      if (existingOrderId) {

        // Subsequent KOT on same table — append items to existing order
        const activeTableEntry = activeTables.find(t => t.id === activeTableId || t.backendId === activeTableId);
        const lastUpdatedAt = activeTableEntry?.activeOrder?.updatedAt;
        const response = await updateOrderItems(existingOrderId, apiItems, requestId, currentCaptain?.name || undefined, false, null, lastUpdatedAt);

        savedOrder = response?.order || response;  // Handle both { order: {...} } and direct response

        // Extract real KOT ID from kotHistory in response
        const _kotHistory = response?.order?.kotHistory || response?.kotHistory;
        realKotId = Array.isArray(_kotHistory) && _kotHistory.length > 0
          ? _kotHistory[_kotHistory.length - 1].id
          : null;

      } else {

        // First KOT — create a brand-new order row

        savedOrder = await createOrder({

          tableId: activeTable?.backendId,
          tableNumber: activeTable?.number ?? activeTable?.id,
          restaurantId: orderRestaurantId,
          items: apiItems,

          requestId,
          captainName: currentCaptain?.name || undefined,
          sectionTag: activeTable?.sectionTag || undefined,

        });

        // Store the real DB id so next KOT uses updateOrderItems, not createOrder

        if (savedOrder?.id) activeOrderIdRef.current = savedOrder.id;

        // Extract real KOT ID from kotHistory in response
        const _savedKotHistory = savedOrder?.kotHistory;
        realKotId = Array.isArray(_savedKotHistory) && _savedKotHistory.length > 0
          ? _savedKotHistory[_savedKotHistory.length - 1].id
          : null;

      }



      // 2. Update UI with real KOT data from backend

      const newKOT = {

        id: realKotId || `kot-${Date.now()}`,

        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),

        items: itemsForPrint.map(i => ({ ...i, s: 'KOT Sent' })),

        status: 'Incoming',

        createdAt: Date.now(),

        itemsReady: 0

      };

      setActiveTables(prev => prev.map(t => {
        if (t.backendId !== activeTable?.backendId) return t;

        return {

          ...t,

          status: TABLE_STATUS.PREPARING,

          time: t.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),

          captainId: currentCaptain.id,

          kotHistory: (() => {
            const currentHistory = t.kotHistory || [];
            const newIdStr = String(newKOT.id);
            // If this is a real server KOT ID, replace any temp optimistic entry instead of appending
            const isRealId = !newIdStr.startsWith('kot-');
            if (isRealId) {
              const tempIndex = currentHistory.findIndex(k => String(k.id).startsWith('kot-'));
              if (tempIndex >= 0) {
                const next = [...currentHistory];
                next[tempIndex] = newKOT;
                return next;
              }
            }
            const exists = currentHistory.some(k => String(k.id) === newIdStr);
            return exists ? currentHistory : [...currentHistory, newKOT];
          })(),

          currentBill: newTotalBill,

        };

      }), { skipPersist: true });



      // 4. Stitch real DB orderItemId onto this KOT's items for cancel support

      const savedItems = savedOrder?.items ?? [];

      const allPrevIds = new Set(

        (activeTable?.kotHistory || []).flatMap(k => k.items.map(i => i.orderItemId).filter(Boolean))

      );

      setActiveTables(prev => prev.map(t => {
        if (t.backendId !== activeTable?.backendId) return t;

        return {

          ...t,

          kotHistory: (t.kotHistory || []).map(kot => {

            if (kot.id !== newKOT.id) return kot;

            return {

              ...kot,

              items: kot.items.map(kotI => {

                const kotMenuItemId = kotI.id || kotI.menuItemId;
                const matched = savedItems.find(si =>

                  si.menuItemId === kotMenuItemId &&
                  (si.notes ?? null) === (kotI.notes ?? null) &&
                  !allPrevIds.has(si.id)

                );

                return matched ? { ...kotI, orderItemId: matched.id } : kotI;

              }),

            };

          }),

        };

      }), { skipPersist: true });



      // 4. Unblock UI immediately after DB write; print confirmation is background
      const committedSoFar = getTableItems(activeTable);
      lastConfirmedItemsRef.current = [...committedSoFar, ...currentSessionItems];
      setTableCarts(prev => ({ ...prev, [activeTableId]: [] }));
      lastAnyItemAddedRef.current = 0;
      addNotification(`KOT #${realKotId || newKOT.id} Sent ✓`, 'success');

      // Background listener for print confirmation (non-blocking)
      const socket = getSocket();
      const handler = ({ requestId: ackRequestId, status }) => {
        if (ackRequestId === requestId) {
          socket.off('kot:printed', handler);
          clearTimeout(printTimeoutRef.current);
          printTimeoutRef.current = null;
          if (status !== 'success') {
            addNotification(`KOT #${realKotId || newKOT.id} ⚠ Print failed`, 'warning');
          }
        }
      };
      socket.on('kot:printed', handler);
      printTimeoutRef.current = setTimeout(() => {
        socket.off('kot:printed', handler);
        printTimeoutRef.current = null;
        addNotification(`KOT #${realKotId || newKOT.id} ⚠ Saved, print failed`, 'warning');
      }, 30000);

    } catch (err) {

      console.error('[KOT] DB write failed:', err.message);

      // ❌ DB failed — show persistent error banner with Retry instead of success toast.

      // Restore the session items so the captain can retry without re-selecting.

      setTableCarts(prev => ({ ...prev, [activeTableId]: retrySnapshot }));

      setKotError({

        message: err.message || 'Network error — kitchen did not receive this order.',

        retryItems: retrySnapshot,

      });

    } finally {

      isSubmittingKotRef.current = false;

      setSendingKOT(false);

      kotRequestIdRef.current = null;

    }

  };



  // ── Cancel a sent KOT item ───────────────────────────────────────────────────



  const cancelKotItem = async (kotItem, kotId) => {

    if (!kotItem.orderItemId) {

      addNotification('Cannot cancel — item ID missing. Refresh and retry.', 'error');

      return;

    }

    if (!activeOrderIdRef.current) {

      addNotification('No active order found for this table.', 'error');

      return;

    }



    setCancelLoading(prev => ({ ...prev, [kotItem.orderItemId]: true }));



    // Optimistic UI — mark item as CANCELLED immediately
    setActiveTables(prev => prev.map(t => {
      if (t.backendId !== activeTable?.backendId) return t;

      return {

        ...t,

        kotHistory: (t.kotHistory || []).map(kot => {

          if (kot.id !== kotId) return kot;

          return {

            ...kot,

            items: kot.items.map(i =>

              i.orderItemId === kotItem.orderItemId ? { ...i, s: 'Cancelled', removedFromBill: true } : i

            ),

          };

        }),

        activeOrder: t.activeOrder ? {
          ...t.activeOrder,
          items: (t.activeOrder.items || []).map(i =>
            i.id === kotItem.orderItemId ? { ...i, removedFromBill: true } : i
          ),
        } : t.activeOrder,

        currentBill: Math.max(0, (t.currentBill ?? 0) - (kotItem?.p ?? 0) * (kotItem?.q ?? 1)),

      };

    }));



    const cancelRequestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36));

    try {

      await cancelOrderItem(

        activeOrderIdRef.current,

        kotItem.orderItemId,

        currentCaptain?.name || currentCaptain?.id || 'Captain',

        activeTable?.number ?? activeTable?.id,

        Number(kotItem.q ?? 1),

        cancelRequestId

      );

      addNotification(`${kotItem.n} cancelled`, 'success');

      // Wait for CANCEL_KOT print ack (best-effort, 12s timeout)
      const socket = getSocket();
      const printResult = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          socket.off('kot:printed', handler);
          socket.off('disconnect', disconnectHandler);
          resolve('timeout');
        }, 12000);
        const handler = ({ requestId: ackRequestId, status }) => {
          if (ackRequestId === cancelRequestId) {
            clearTimeout(timeout);
            socket.off('kot:printed', handler);
            socket.off('disconnect', disconnectHandler);
            resolve(status || 'success');
          }
        };
        const disconnectHandler = () => {
          clearTimeout(timeout);
          socket.off('kot:printed', handler);
          resolve('disconnected');
        };
        socket.on('kot:printed', handler);
        socket.on('disconnect', disconnectHandler);
      });

      if (printResult === 'timeout') {
        addNotification(`${kotItem.n} cancelled ✓ — cancel slip may be delayed`, 'success');
      }

    } catch (err) {

      console.error('[CancelKOT]', err.message);

      addNotification(`Cancel failed: ${err.message}`, 'error');

      // Revert optimistic update
      setActiveTables(prev => prev.map(t => {
        if (t.backendId !== activeTable?.backendId) return t;

        return {

          ...t,

          kotHistory: (t.kotHistory || []).map(kot => {

            if (kot.id !== kotId) return kot;

            return {

              ...kot,

              items: kot.items.map(i =>

                i.orderItemId === kotItem.orderItemId ? { ...i, s: 'KOT Sent', removedFromBill: false } : i

              ),

            };

          }),

          activeOrder: t.activeOrder ? {
            ...t.activeOrder,
            items: (t.activeOrder.items || []).map(i =>
              i.id === kotItem.orderItemId ? { ...i, removedFromBill: false } : i
            ),
          } : t.activeOrder,

          currentBill: (t.currentBill ?? 0) + (kotItem?.p ?? 0) * (kotItem?.q ?? 1),

        };

      }));

    } finally {

      setCancelLoading(prev => ({ ...prev, [kotItem.orderItemId]: false }));

      setCancelConfirm(prev => ({ ...prev, [kotItem.orderItemId]: false }));

    }

  };



  const requestFinalBill = async () => {

    // Re-fetch from live tables in case state is stale
    const liveTable = activeTables.find(t => t.id === activeTableId || t.backendId === activeTableId);
    const orderId = liveTable?.activeOrder?.id;

    const previousStatus = liveTable?.status || TABLE_STATUS.PREPARING;



    // 1. Update UI immediately
    setActiveTables(prev => prev.map(t => {
      if (t.id === activeTableId || t.backendId === activeTableId) {

        return { ...t, status: TABLE_STATUS.BILLING };

      }

      return t;

    }));

    addNotification("Billing Requested", 'success');

    // 2. Fire API
    if (orderId) {
      try {

        await requestBilling(orderId);

        setView('tables');
        setActiveTableId(null);

      } catch (err) {

        console.error('[Billing] requestBilling failed:', err.message);

        addNotification('Billing request failed — please try again', 'error');

        // Revert table status back to previous status (e.g. PREPARING)
        setActiveTables(prev => prev.map(t => {
          if (t.id === liveTable?.id || t.backendId === liveTable?.backendId) {

            return { ...t, status: previousStatus };

          }

          return t;

        }));

      }

    }

  };

  const filteredCaptains = availableCaptains.filter(p =>
    p.name.toLowerCase().includes(captainSearchQuery.toLowerCase().trim())
  );

  if (isLoginView) {
    console.log('[CaptainApp] rendering login view');
    return (
      <div className="flex min-h-screen items-start justify-center bg-[#F4F4F5] p-4 sm:p-6 font-['Inter',sans-serif] overflow-y-auto">

        <div className="w-full max-w-lg bg-white rounded-[30px] sm:rounded-[40px] p-6 sm:p-10 shadow-[0_40px_80px_rgba(0,0,0,0.06)] border border-gray-100 my-auto">

          <div className="text-center mb-10">

            <div className="flex flex-col items-center justify-center mb-6 gap-2">

              <img

                src="/logo softshape.ai.png"

                alt="Softshape.ai"

                className="h-16 w-auto object-contain"

              />

            </div>

            <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Operational Terminal</h2>

            <p className="text-lg font-black text-gray-900">Sign in to Session</p>

          </div>



          {!selectedProfile ? (

            <div className="space-y-4">

              {availableCaptains.length === 0 ? (

                <div className="space-y-3">
                  <input
                    className="w-full h-12 rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 text-sm font-bold outline-none focus:border-[#E53935] focus:bg-white transition-all"
                    placeholder="Restaurant ID (e.g. your-restaurant-code)"
                    value={captainSlug}
                    onChange={e => { setCaptainSlug(e.target.value); setCaptainCrewError(''); }}
                    onKeyDown={e => e.key === 'Enter' && loadCaptainCrew()}
                  />
                  <button
                    onClick={loadCaptainCrew}
                    disabled={crewLoading}
                    className="w-full h-12 rounded-2xl bg-[#E53935] text-white text-xs font-black uppercase tracking-widest hover:bg-[#B71C1C] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {crewLoading ? 'Loading…' : 'Load Staff'}
                  </button>
                  {crewLoadError && (
                    <p className="text-xs font-bold text-red-600 text-center">{crewLoadError}</p>
                  )}
                </div>

              ) : (

                <>
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={captainSearchQuery}
                      onChange={(e) => setCaptainSearchQuery(e.target.value)}
                      placeholder="Search captain..."
                      className="w-full h-12 rounded-2xl border border-gray-100 bg-gray-50 pl-11 pr-4 text-sm font-black outline-none focus:border-gray-300 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="max-h-[360px] overflow-y-auto pr-1 -mr-1">
                    <div className="grid grid-cols-2 gap-4">
                      {filteredCaptains.map(p => {
                        const initials = p.name
                          .split(' ')
                          .map(w => w[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase();
                        const profile = {
                          ...p,
                          initials,
                          color: 'bg-[#EFF6FF] text-[#1D4ED8]',
                        };
                        return (
                          <button
                            key={p.id}
                            onClick={() => handleProfileSelect(profile)}
                            className="flex flex-col items-center gap-4 p-6 rounded-[24px] border border-gray-100 bg-white hover:border-gray-300 hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
                          >
                            <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center text-xl font-black tracking-tight shadow-sm group-hover:scale-110 transition-transform">
                              {initials}
                            </div>
                            <span className="text-[13px] font-bold text-gray-800 tracking-tight">
                              {p.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {filteredCaptains.length === 0 && (
                      <p className="text-center text-[12px] font-bold text-gray-400 py-8">No captains found</p>
                    )}
                  </div>
                </>

              )}

            </div>

          ) : (

            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

              <div className="flex items-center justify-center gap-4">

                <button onClick={() => setSelectedProfile(null)} className="p-2 text-gray-400 hover:text-gray-900 transition-colors"><ArrowLeft size={20} /></button>

                <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-[20px] border border-gray-100 shadow-sm">

                  <div className={`w-8 h-8 rounded-xl ${selectedProfile.color} flex items-center justify-center text-xs font-black tracking-tight`}>

                    {selectedProfile.initials}

                  </div>

                  <span className="text-sm font-bold text-gray-900 tracking-tight">{selectedProfile.name}</span>

                </div>

              </div>

              <div className="space-y-6">

                <div className="flex justify-center gap-4">

                  {[...Array(4)].map((_, i) => (

                    <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${pin.length > i ? 'bg-[#E53935] scale-125 shadow-lg shadow-red-200' : 'bg-gray-200'}`} />

                  ))}

                </div>

                <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">

                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '←'].map(n => (

                    <button

                      key={n}

                      disabled={isAuthenticating}

                      onClick={() => {

                        if (n === 'C') setPin('');

                        else if (n === '←') setPin(prev => prev.slice(0, -1));

                        else handlePinInput(n.toString());

                      }}

                      className="w-full aspect-square rounded-2xl border border-gray-100 text-xl font-black text-gray-900 hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"

                    >

                      {n}

                    </button>

                  ))}

                </div>

                {isAuthenticating && (

                  <div className="flex items-center justify-center gap-2 text-[#E53935]">

                    <Loader2 size={16} className="animate-spin" />

                    <span className="text-[10px] font-black uppercase tracking-widest">Validating PIN...</span>

                  </div>

                )}

                {pinError && !isAuthenticating && (

                  <div className="text-center animate-in fade-in slide-in-from-bottom-2">

                    <p className="text-sm font-bold text-[#E53935]">{pinError}</p>

                  </div>

                )}

              </div>

            </div>

          )}

        </div>

      </div>

    );

  }

  // ── Guard: never render the dashboard with missing auth or still-loading critical data ──
  if (!restaurant || !user) {
    console.warn('[CaptainApp] dashboard blocked: missing restaurant or user');
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F4F4F5]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-[#E53935]" />
          <p className="text-sm font-bold text-gray-500">Loading restaurant data…</p>
        </div>
      </div>
    );
  }

  console.log('[CaptainApp] rendering dashboard. tables:', tables?.length, 'menu:', restaurantMenu?.length);

  return (
    <div
      className="flex flex-col bg-white overflow-hidden font-['Inter',sans-serif] text-[#1A1A1A]"
      style={{ height: 'calc(var(--captain-vh, 1dvh) * 100)' }}
    >



      {/* WAITER CALL EMERGENCY OVERLAY */}

      {pendingCalls.length > 0 && (

        <EmergencyOverlay

          call={pendingCalls[0]}

          currentCaptain={currentCaptain}

          onDismiss={(call) => clearCall(call.callId)}

          onAccept={(call) => {

            if (currentCaptain) {

              // 2. Collision check: Did someone else just lock this table in the live floor map?

              const callTableNumber = String(call.tableId).match(/(\d+)/)?.[1] || call.tableId;
              const targetTable = activeTables.find(t => String(t.id) === String(callTableNumber));



              const locked = markWaiterCallAccepted(call.tableId, currentCaptain.id);

              if (locked) {

                broadcastWaiterEvent('captain:accept_waiter_call', {

                  callId: call.callId,

                  captainId: currentCaptain.id,

                  captainName: currentCaptain.name

                }, activeOutlet);

                addNotification(`You accepted table ${call.tableId}`, 'success');



                // Allocate table to this captain
                setActiveTables(prev => prev.map(t => {
                  if (String(t.id) === String(callTableNumber)) {

                    return {

                      ...t,

                      captainId: currentCaptain.id,

                      captainName: currentCaptain.name

                    };

                  }

                  return t;

                }));

              } else {

                addNotification("Another captain has already accepted this request!", "error");

                clearCall(call.callId);

              }

            }

          }}

        />

      )}



      {/* GLOBAL HEADER */}

      <header className={`h-14 bg-white border-b border-gray-100 px-6 flex items-center justify-between shrink-0 z-50 transition-all duration-300 ${isHeaderVisible ? 'opacity-100 h-14' : 'opacity-0 h-0 overflow-hidden'}`}>

        <div className="flex items-center gap-4">

          <div className="flex items-center gap-2">

            <img

              src="/logo softshape.ai.png"

              alt="Softshape.ai"

              className="h-12 sm:h-16 w-auto object-contain shrink-0"

            />

            <div className="hidden sm:flex flex-col border-l-2 border-gray-100 pl-3 justify-center">

              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{restaurant?.name || 'Softshape'}</span>

              <span className="text-[11px] font-black text-gray-900 tracking-tight leading-none">{currentCaptain?.name}</span>

            </div>

          </div>

        </div>



        <div className="flex items-center gap-3 sm:gap-6 shrink-0">

          <div className={`flex items-center gap-2 transition-opacity duration-500 ${isSyncing ? 'opacity-100' : 'opacity-20'}`}>

            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />

            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Live Sync</span>

          </div>

          <button onClick={() => {

            localStorage.removeItem(getTenantScopedKey('captain_auth_v2'));

            localStorage.removeItem(getTenantScopedKey('active_captain'));

            setIsLoginView(true);

          }} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><LogOut size={18} /></button>

        </div>

      </header>



      {/* CAPTAIN NAV TABS */}

      <div className={`bg-white border-b border-gray-100 px-4 flex shrink-0 transition-all duration-300 ${isHeaderVisible ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>

        <button

          onClick={() => { setActiveView('assignment'); localStorage.setItem(getTenantScopedKey('captain_active_tab'), 'assignment'); }}

          className={`flex items-center gap-2 px-5 py-3.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeView === 'assignment'

            ? 'border-[#E53935] text-[#E53935]'

            : 'border-transparent text-gray-400 hover:text-gray-600'

            }`}

        >

          <Target size={13} />

          <span className="hidden xs:inline">ఈరోజు అప్పగింత</span>

          <span className="xs:hidden">Today</span>

          {assignment && (

            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5 shrink-0" />

          )}

        </button>

        <button

          onClick={() => { setActiveView('tables'); localStorage.setItem(getTenantScopedKey('captain_active_tab'), 'tables'); }}

          className={`flex items-center gap-2 px-5 py-3.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeView === 'tables'

            ? 'border-[#E53935] text-[#E53935]'

            : 'border-transparent text-gray-400 hover:text-gray-600'

            }`}

        >

          <LayoutDashboard size={13} />

          Tables

          {view === 'session' && (

            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5 shrink-0" />

          )}

        </button>

      </div>



      {/* TODAY ASSIGNMENT VIEW */}

      {activeView === 'assignment' && (

        <div className="flex-grow overflow-y-auto bg-gray-50/40">

          {!assignment ? (

            <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center p-8">

              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">

                <Target size={26} className="text-gray-300" />

              </div>

              <h3 className="text-sm font-black text-gray-700 mb-1">No Assignment Yet</h3>

              <p className="text-[11px] font-bold text-gray-400 max-w-xs leading-relaxed">

                Admin hasn&apos;t assigned targets for today. Check back soon.

              </p>

            </div>

          ) : (

            <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-4">



              {/* Captain Identity Card */}

              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">

                <div className={`w-12 h-12 rounded-2xl ${currentCaptain?.color || 'bg-gray-100 text-gray-600'} flex items-center justify-center text-base font-black shadow-sm shrink-0`}>

                  {currentCaptain?.initials || '?'}

                </div>

                <div className="flex-grow min-w-0">

                  <h2 className="text-sm font-black text-gray-900 truncate">{currentCaptain?.name}</h2>

                  <div className="flex items-center gap-1.5 mt-0.5">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />

                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Active Session</span>

                  </div>

                </div>

                <div className="text-right shrink-0">

                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Assigned At</p>

                  <p className="text-[10px] font-black text-gray-700 mt-0.5">

                    {assignment.assignedAt

                      ? (() => { try { const d = new Date(assignment.assignedAt); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }); } catch { return '—'; } })()

                      : '—'}

                  </p>

                </div>

              </div>



              {/* Revenue Target & Progress */}

              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">

                <div className="flex items-center justify-between mb-4">

                  <div className="flex items-center gap-2">

                    <div className="w-8 h-8 rounded-xl bg-[#FFF4F4] flex items-center justify-center shrink-0">

                      <Flame size={14} className="text-[#E53935]" />

                    </div>

                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Daily Revenue Target</span>

                  </div>

                  <span className="text-xs font-black text-[#E53935] bg-[#FFF4F4] px-2.5 py-1 rounded-xl">

                    ₹{(assignment.revenueTarget || 0).toLocaleString('en-IN')}

                  </span>

                </div>



                {/* Progress bar */}

                <div className="mb-4">

                  <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">

                    <span>Progress</span>

                    <span>{Math.min(100, Math.round((todayRevenue / (assignment.revenueTarget || 1)) * 100))}%</span>

                  </div>

                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">

                    <div

                      className="h-full rounded-full transition-all duration-700"

                      style={{

                        width: `${Math.min(100, (todayRevenue / (assignment.revenueTarget || 1)) * 100)}%`,

                        background: 'linear-gradient(to right, #E53935, #FF7043)',

                      }}

                    />

                  </div>

                </div>



                <div className="flex justify-between items-end">

                  <div>

                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Earned Today</p>

                    <p className="text-2xl font-black text-gray-900 tracking-tight tabular-nums">₹{todayRevenue.toLocaleString('en-IN')}</p>

                  </div>

                  <div className="text-right">

                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Remaining</p>

                    {Math.max(0, (assignment.revenueTarget || 0) - todayRevenue) === 0 ? (

                      <p className="text-sm font-black text-emerald-600">✓ Achieved!</p>

                    ) : (

                      <p className="text-2xl font-black text-gray-900 tracking-tight tabular-nums">

                        ₹{Math.max(0, (assignment.revenueTarget || 0) - todayRevenue).toLocaleString('en-IN')}

                      </p>

                    )}

                  </div>

                </div>

              </div>



              {/* Discount Auth */}

              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">

                <div className="flex items-center gap-3">

                  <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">

                    <TrendingUp size={14} className="text-indigo-600" />

                  </div>

                  <div>

                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Max Discount Auth</p>

                    <p className="text-[9px] font-bold text-gray-400 mt-0.5">You can offer up to this discount</p>

                  </div>

                </div>

                <span className="text-3xl font-black text-indigo-600 tabular-nums">{assignment.discountLimit || 0}%</span>

              </div>



              {/* Status Banner */}

              <div className={`rounded-2xl p-4 border flex items-center gap-3 ${todayRevenue >= (assignment.revenueTarget || 0)

                ? 'bg-emerald-50 border-emerald-200'

                : 'bg-[#FFF4F4] border-[#FFCDD2]'

                }`}>

                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${todayRevenue >= (assignment.revenueTarget || 0) ? 'bg-emerald-500' : 'bg-[#E53935]'

                  }`}>

                  {todayRevenue >= (assignment.revenueTarget || 0)

                    ? <CheckCircle2 size={18} className="text-white" />

                    : <Flame size={18} className="text-white" />}

                </div>

                <div>

                  <p className="text-xs font-black text-gray-900">

                    {todayRevenue >= (assignment.revenueTarget || 0) ? 'Target Achieved! 🎉' : 'Keep Going!'}

                  </p>

                  <p className="text-[10px] font-bold text-gray-500 mt-0.5">

                    {todayRevenue >= (assignment.revenueTarget || 0)

                      ? `Exceeded by ₹${(todayRevenue - (assignment.revenueTarget || 0)).toLocaleString('en-IN')}`

                      : `${Math.min(100, Math.round((todayRevenue / (assignment.revenueTarget || 1)) * 100))}% of daily target completed`

                    }

                  </p>

                </div>

              </div>



            </div>

          )}

        </div>

      )}



      {/* MAIN CONTENT AREA — TABLES & SESSION */}

      <main className={`flex-grow flex flex-col overflow-hidden relative ${activeView !== 'tables' ? 'hidden' : ''}`}>

        {view === 'tables' ? (

          <div className="flex-grow overflow-y-auto p-4 sm:p-6 scroll-smooth bg-gray-50/50">

            <div className="max-w-6xl mx-auto">

              <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">

                <div>

                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">Floor Overview</h2>

                  <div className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">

                    <div className="w-2 h-2 bg-green-500 rounded-full" />

                    Active Operations • Floor Rank #1

                  </div>

                </div>

                <div className="flex gap-2">

                  <div className="px-4 py-2 bg-white rounded-xl border border-gray-200 flex items-center gap-2">

                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />

                    <span className="text-[10px] font-black uppercase text-gray-600">{freeCount} Free</span>

                  </div>

                  <div className="px-4 py-2 bg-white rounded-xl border border-gray-200 flex items-center gap-2">

                    <div className="w-1.5 h-1.5 bg-[#E53935] rounded-full" />

                    <span className="text-[10px] font-black uppercase text-gray-600">{busyCount} Busy</span>

                  </div>

                </div>

              </div>



              {/* VENUE SUBCATEGORY PILLS — dynamically from fetched sections */}
              {enabledModules.tables !== false && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {fetchedSections.length > 0
                    ? fetchedSections
                        .filter(section => {
                          const sectionOutlet = section.venue?.venueType === 'BAR' ? 'bar' : 'restaurant';
                          if (activeOutlet === 'both') return true;
                          return sectionOutlet === activeOutlet;
                        })
                        .map(section => {
                        const sourceKey = section.sectionTag || section.name;
                        return (
                          <button
                            key={sourceKey}
                            onClick={() => { setTableSubCategory(sourceKey); setSelectedPDRRoom(null); }}
                            className={`px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-black border-2 uppercase tracking-widest transition-all shadow-sm ${
                              tableSubCategory === sourceKey
                                ? 'bg-[#E53935] text-white border-[#E53935]'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {section.name}
                          </button>
                        );
                      })
                    : (
                      <div className="flex items-center gap-3 py-4">
                        <div className="inline-block w-6 h-6 border-2 border-gray-200 border-t-[#E53935] rounded-full animate-spin"></div>
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Loading sections...</p>
                      </div>
                    )}
                </div>
              )}

              {enabledModules.tables === false ? (
                <div className="text-center p-10 text-gray-500">
                  <p className="text-lg font-semibold">Table management is not enabled for this restaurant type.</p>
                </div>
              ) : (activeOutlet === 'bar' || activeOutlet === 'both') && tableSubCategory === (fetchedSections.find(s => s.venue?.venueType === 'BAR')?.name || '') && tableSubCategory !== '' ? (

                <>

                  {/* Table Filter Toggle */}

                  <div className="flex gap-2 mb-6">

                    <button

                      onClick={() => setTableFilter('my')}

                      className={`px-4 py-2 rounded-xl border font-black text-xs uppercase tracking-[0.2em] transition-all ${

                        tableFilter === 'my'

                          ? 'bg-[#E53935] text-white border-[#E53935] shadow-lg'

                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'

                      }`}

                    >

                      My Tables ({myTablesCount})

                    </button>

                    <button

                      onClick={() => setTableFilter('all')}

                      className={`px-4 py-2 rounded-xl border font-black text-xs uppercase tracking-[0.2em] transition-all ${

                        tableFilter === 'all'

                          ? 'bg-[#E53935] text-white border-[#E53935] shadow-lg'

                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'

                      }`}

                    >

                      All Tables ({allTablesCount})

                    </button>

                  </div>



                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">

                {filteredTables.map(table => {

                  const isMyTable = table.captainId === currentCaptain?.id;

                  const assignedCaptain = table.captainId ? getCaptain(table.captainId) : null;

                  const borderColor = isMyTable ? getCaptainBorderColor(table.captainId) : '';



                  return (

                    <button

                      key={table.backendId || table.id}

                      onClick={() => openTableSession(table)}
                      className={`aspect-square p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 transition-all flex flex-col items-center justify-between group relative overflow-hidden active:scale-95 w-full ${
                        isMyTable ? `border-l-4 ${borderColor}` : ''

                      } ${table.status === TABLE_STATUS.FREE ? 'bg-white border-gray-100 hover:border-gray-300' :

                        table.status === TABLE_STATUS.BILLING ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-lg shadow-amber-100' :

                          table.status === TABLE_STATUS.READY ? 'bg-green-50 border-green-200 text-green-700' :

                            'bg-red-50 border-red-100 text-red-600'

                        }`}

                    >

                      {/* Section Badge - Top Left */}

                      {(table.sectionName || table.section?.name) && (

                        <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shadow-sm z-10 ${getSectionBadgeColor(table)}`}>

                          {getTableSectionLabel(table)}

                        </div>

                      )}



                      <div className="w-full flex justify-between items-start">

                        <div className="flex flex-col items-start gap-0.5">

                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-600 transition-colors">{(activeOutlet === 'bar' || activeOutlet === 'both') ? 'B' : 'T'}{table.number ?? table.id}</span>

                          {table.captainName && (

                            <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-1 py-0.5 rounded leading-none">

                              {table.captainName.split(' ')[0]}

                            </span>

                          )}

                        </div>



                        {/* Captain Initials Badge - Top Right */}

                        {isMyTable && assignedCaptain && (

                          <div className={`absolute top-2 right-2 w-6 h-6 rounded-lg ${assignedCaptain.color} flex items-center justify-center text-[8px] font-black shadow-sm z-10`}>

                            {assignedCaptain.initials}

                          </div>

                        )}

                      </div>

                      <span className="text-3xl sm:text-4xl font-black leading-none">{table.number ?? table.id}</span>



                      <div className="w-full flex flex-col items-center gap-1.5">
                        <div className={`w-full py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 ${table.status === TABLE_STATUS.FREE ? 'bg-gray-100 text-gray-400' :
                          table.status === TABLE_STATUS.BILLING ? 'bg-amber-500 text-white animate-pulse' :

                            table.status === TABLE_STATUS.READY ? 'bg-green-600 text-white' : 'bg-red-600 text-white'

                          }`}>

                          {table.status}

                        </div>

                        {table.status !== TABLE_STATUS.FREE && (

                          <span className="text-[10px] font-black opacity-60">₹{calculateTableBill(table).grandTotal}</span>

                        )}

                      </div>

                    </button>

                );

              })}

            </div>

          </>

        ) : (

          <VenueSectionView

            venueId={(() => {
              const section = fetchedSections.find(s => {
                const sourceKey = sectionTagToSource[s.sectionTag] || s.name;
                return sourceKey === tableSubCategory;
              });
              return section?.sectionTag || section?.venueId || tableSubCategory;
            })()}

            sectionName={(() => {
              const section = fetchedSections.find(s => {
                const sourceKey = sectionTagToSource[s.sectionTag] || s.name;
                return sourceKey === tableSubCategory;
              });
              return section?.name || tableSubCategory;
            })()}

            restaurantId={getCurrentRestaurantId()}

            roomMode="single"

            selectedRoom={selectedPDRRoom}

            onSelectRoom={setSelectedPDRRoom}

            captainId={currentCaptain?.id}

            onTableSelect={openTableSession}

            onOrderPlaced={() => {}}

            venueTables={activeTables}
            isSyncing={false}
            refetch={refetchRestaurantTables}
          />

        )}

            </div>

          </div>

        ) : (

          <div className="flex-grow flex flex-col overflow-hidden bg-white">

            {/* STICKY SESSION HEADER */}

            <div className={`bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 shrink-0 z-40 shadow-sm transition-all duration-300 ${isHeaderVisible ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden py-0'}`}>

              <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">

                <button onClick={() => setView('tables')} className="p-2.5 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-xl border border-gray-100 transition-all"><ChevronLeft size={20} /></button>

                <div className="flex flex-col">

                  <div className="flex flex-wrap items-center gap-2">

                    <h2 className="text-lg font-black tracking-tight uppercase leading-none">Table {activeTable?.displayName || activeTable?.name || activeTable?.id}</h2>

                    <div className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest border border-blue-100 shrink-0">Live Session #10{activeTable?.id}</div>

                  </div>

                  <div className="flex items-center gap-4 mt-1">

                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Timer size={10} /> {activeTable?.time

                      ? (() => { try { const d = new Date(activeTable.time); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }); } catch { return '—'; } })()

                      : '—'}</span>

                    <span className="text-[9px] font-black text-[#E53935] uppercase tracking-widest flex items-center gap-1"><History size={10} /> {(activeTable?.kotHistory || []).length} KOTs</span>

                  </div>

                </div>

              </div>

              <div className="flex gap-2 w-full sm:w-auto">

                <button

                  onClick={() => setShowMoveModal(true)}

                  title="Swap Table"

                  className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shrink-0 hover:bg-blue-100 transition-all"

                >

                  <ArrowRightLeft size={18} />

                </button>

                <button className="p-2.5 bg-red-50 text-[#E53935] rounded-xl border border-red-100 shrink-0"><Bell size={18} /></button>

              </div>

            </div>



            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">

              {/* MENU INTERFACE */}

              <div className={`flex-grow flex flex-col overflow-hidden bg-gray-50/30 ${(isCartMinimized || isSearchFocused) ? 'h-full lg:h-auto' : 'h-1/2 lg:h-auto'} border-b lg:border-b-0 lg:border-r border-gray-100 transition-all duration-300`}>

                {/* STICKY MENU BAR */}

                {(activeOutlet === 'bar' || activeOutlet === 'both') ? (

                  <div className="bg-white/95 backdrop-blur-md border-b border-gray-100 shrink-0 z-30 shadow-sm transition-all duration-300 sticky top-0">

                    <div className="px-4 py-3 flex flex-col gap-3">

                      <div className="relative group flex items-center">

                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#E53935]" size={20} />

                        <input

                          type="search"

                          placeholder="Search fine spirits, drinks & food..."

                          className="w-full bg-red-50/30 border border-red-100 rounded-2xl pl-12 pr-12 py-3.5 text-base font-bold outline-none focus:bg-white focus:border-[#E53935] focus:ring-4 focus:ring-red-50 transition-all shadow-inner"

                          value={searchInput}

                          onChange={(e) => setSearchInput(e.target.value)}

                          autoComplete="off"

                          style={{ fontSize: '16px' }}

                          onFocus={(e) => {

                            handleSearchFocus();
                          }}

                          onBlur={handleSearchBlur}

                        />

                        <button

                          type="button"

                          onClick={startVoiceSearch}

                          className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors ${

                            isListening ? 'bg-red-100 text-[#E53935] animate-pulse' : 'text-gray-400 hover:text-[#E53935]'

                          }`}

                        >

                          {isListening ? <MicOff size={18} /> : <Mic size={18} />}

                        </button>

                      </div>

                      <div className={`overflow-hidden transition-all duration-300 ${isMenuScrolled ? 'max-h-0 opacity-0 py-0' : 'max-h-40 opacity-100'}`}>
                        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">

                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide scroll-smooth flex-grow">

                          {categories.map(cat => (

                            <button

                              key={cat}

                              onClick={() => setActiveCategory(cat)}

                              className={`px-5 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border shrink-0 ${activeCategory === cat

                                  ? 'bg-gradient-to-r from-[#E53935] to-[#B71C1C] text-white border-transparent shadow-[0_4px_12px_rgba(229,57,53,0.2)] scale-[1.02]'

                                  : 'bg-white border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-100 hover:text-red-700'

                                }`}

                            >

                              {cat}

                            </button>

                          ))}

                        </div>

                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 shrink-0 shadow-sm">

                          {['All', 'veg', 'non'].map(diet => (

                            <button

                              key={diet}

                              onClick={() => setActiveDiet(diet)}

                              className={`px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeDiet === diet

                                ? (diet === 'All' ? 'bg-gray-800 text-white shadow-sm' : diet === 'veg' ? 'bg-green-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm')

                                : 'text-gray-400 hover:text-gray-600 bg-transparent'

                                }`}

                            >

                              {diet === 'All' ? 'All' : diet === 'veg' ? 'Veg' : 'Non'}

                            </button>

                          ))}

                        </div>

                      </div>

                    </div>

                  </div>

                </div>

                ) : (

                  <div className="px-6 py-4 bg-white border-b border-gray-100 flex flex-col gap-4 shrink-0 z-30 sticky top-0">

                    <div className="relative group flex items-center">

                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E53935] transition-colors" size={20} />

                      <input

                        type="search"

                        placeholder="Search by name, category, price, or ID..."

                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-12 py-3.5 text-[15px] font-bold outline-none focus:bg-white focus:border-[#E53935] focus:ring-4 focus:ring-red-50 transition-all"

                        value={searchInput}

                        onChange={(e) => setSearchInput(e.target.value)}

                        autoComplete="off"

                        style={{ fontSize: '16px' }}

                        onFocus={(e) => {

                          handleSearchFocus();
                        }}

                        onBlur={handleSearchBlur}

                      />

                      <button

                        type="button"

                        onClick={startVoiceSearch}

                        className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors ${

                          isListening ? 'bg-red-100 text-[#E53935] animate-pulse' : 'text-gray-400 hover:text-[#E53935]'

                        }`}

                      >

                        {isListening ? <MicOff size={18} /> : <Mic size={18} />}

                      </button>

                    </div>

                    <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 xl:gap-0">

                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">

                        {categories.map(cat => (

                          <button

                            key={cat}

                            onClick={() => setActiveCategory(cat)}

                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${activeCategory === cat

                                ? 'bg-gradient-to-r from-[#E53935] to-[#FF7043] text-white border-transparent shadow-[0_8px_16px_rgba(229,57,53,0.15)] scale-[1.03]'

                                : 'bg-white border-gray-100 text-gray-400 hover:bg-red-50/10 hover:text-gray-700'

                              }`}

                          >

                            {cat}

                          </button>

                        ))}

                      </div>

                      <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 shrink-0">

                        {['All', 'veg', 'non'].map(diet => (

                          <button

                            key={diet}

                            onClick={() => setActiveDiet(diet)}

                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeDiet === diet

                              ? 'bg-white text-gray-900 shadow-sm'

                              : 'text-gray-400 hover:text-gray-600'

                              }`}

                          >

                            {diet === 'All' ? 'All' : diet === 'veg' ? 'Veg' : 'Non-Veg'}

                          </button>

                        ))}

                      </div>

                    </div>

                  </div>
                )}



                {/* SCROLLABLE MENU GRID */}

                <div
                  ref={menuScrollRef}
                  className="flex-grow overflow-y-auto p-6 scroll-smooth"
                  onScroll={(e) => {
                    const scrollTop = e.currentTarget.scrollTop;
                    setIsMenuScrolled(scrollTop > 60);
                  }}
                >

                  {menuPanelError ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                      <p className="text-red-600 font-medium mb-2">Menu failed to load — tap to retry</p>
                      <button
                        onClick={() => {
                          setMenuPanelError(null);
                          // Trigger menu refresh by calling refreshMenu from the hooks
                          if (activeOutlet === 'bar' || activeOutlet === 'both') {
                            // barMenu refresh is handled by the hook, just clear error
                          } else {
                            // restaurantMenu refresh is handled by the hook, just clear error
                          }
                        }}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                      >
                        Retry
                      </button>
                    </div>
                  ) : menuLoading ? (
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
                  ) : filteredMenu.length === 0 ? (() => {

  const words = (searchQuery || '').toLowerCase().split(/\s+/).filter(w => w.length >= 3);

  const related = words.length > 0

    ? outletFilteredMenuItems.filter(item => {

        const name = (item.n || item.name || '').toLowerCase();

        const cat = (item.c || item.category || '').toLowerCase();

        return words.some(w => name.includes(w) || cat.includes(w) ||

          name.split(/\s+/).some(nw => nw.startsWith(w) || w.startsWith(nw))

        );

      })

    : [];

  return (

    <div className="pb-12">

      <div className="text-center py-8">

        <div className="text-4xl mb-3">🔍</div>

        <p className="text-sm font-black text-gray-700 uppercase tracking-widest">No Exact Search Found</p>

        <p className="text-xs font-bold text-gray-400 mt-1">

          {searchQuery.trim() ? `No results for "${searchQuery.trim()}"` : 'No items in this category.'}

        </p>

      </div>

      {related.length > 0 && (

        <div className="mt-4">

          <div className="flex items-center gap-2 mb-4 px-1">

            <div className="flex-1 h-px bg-gray-100" />

            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Related Items</span>

            <div className="flex-1 h-px bg-gray-100" />

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">

            {related.slice(0, 12).map((item, idx) => {

              const totalQty = currentSessionItems.filter(i => i.n === item.n).reduce((acc, i) => acc + i.q, 0);

              const isVeg = item.t === 'veg';

              return (

                <div

                  key={idx}

                  className="bg-white border border-gray-100 hover:border-[#E53935]/40 rounded-2xl p-3.5 flex gap-4 items-center group hover:shadow-[0_12px_30px_rgba(229,57,53,0.07)] transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.015)] active:scale-[0.98] relative overflow-hidden"

                >

                  <div className="w-8 h-8 shrink-0 flex items-center justify-center">

                    <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center ${isVeg ? 'border-emerald-600' : 'border-red-600'}`}>

                      <div className={`w-2.5 h-2.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />

                    </div>

                  </div>

                  <div className="flex-grow min-w-0 py-0.5 flex flex-col justify-between h-full">

                    <div>

                      <div className="flex items-center gap-2 mb-1">

                        <span className="text-[9px] font-black text-red-500/80 uppercase tracking-widest truncate">{item.c || 'Dish'}</span>

                      </div>

                      <h3 className="font-extrabold text-[11px] sm:text-[12px] text-gray-900 tracking-tight leading-snug mb-0.5 pr-4 line-clamp-2 group-hover:text-red-600">{item.n}</h3>

                      {item.desc && <p className="text-[10px] text-gray-400 font-medium line-clamp-1">{item.desc}</p>}

                    </div>

                    <div className="flex items-center justify-between mt-2.5">

                      <div className="flex items-baseline">

                        <span className="text-[11px] font-bold text-[#E53935] mr-0.5">₹</span>

                        <span className="text-sm sm:text-base font-black text-gray-900 tracking-tight">{item.p}</span>

                      </div>

                      <div onClick={(e) => e.stopPropagation()}>

                        {totalQty > 0 ? (

                          <div className="flex items-center gap-1 bg-red-50/80 rounded-full p-0.5 border border-red-100 shadow-sm">

                            <button onClick={(e) => { e.stopPropagation(); updateDraftQty(item.n, -1); }} className="w-6 h-6 rounded-full bg-white text-[#E53935] flex items-center justify-center hover:bg-gray-50 active:scale-90 transition-all shadow-sm border border-red-100"><Minus size={10} strokeWidth={3.5} /></button>

                            <span className="text-xs font-black w-4 text-center text-gray-900">{totalQty}</span>

                            <button onClick={(e) => { e.stopPropagation(); addItemToSession(item); }} className="w-6 h-6 rounded-full bg-[#E53935] text-white flex items-center justify-center hover:bg-[#d32f2f] active:scale-90 transition-all shadow-sm"><Plus size={10} strokeWidth={3.5} /></button>

                          </div>

                        ) : (

                          <button onClick={(e) => { e.stopPropagation(); handleItemClick(e, item); }} className="px-4 py-1.5 rounded-full bg-white border border-red-100 text-[9px] font-black uppercase tracking-widest text-[#E53935] hover:bg-[#E53935] hover:text-white hover:border-[#E53935] transition-all shadow-sm active:scale-95 duration-200">Add</button>

                        )}

                      </div>

                    </div>

                  </div>

                </div>

              );

            })}

          </div>

        </div>

      )}

    </div>

  );

})() : (

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 pb-12">

                      {filteredMenu.map((item, idx) => {

                        const totalQty = currentSessionItems.filter(i => i.n === item.n).reduce((acc, i) => acc + i.q, 0);

                        const isVeg = item.t === 'veg';



                        return (

                          <ItemCard key={idx} item={item} onAdd={(item) => handleItemClick({ stopPropagation: () => {} }, item)} className="cursor-pointer bg-white border border-gray-100 hover:border-[#E53935]/40 rounded-2xl p-3.5 flex gap-4 items-center group hover:shadow-[0_12px_30px_rgba(229,57,53,0.07)] transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.015)] active:scale-[0.98] relative overflow-hidden">

                            {/* Chef Special Badge */}

                            {item.isSpecial && (

                              <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-orange-500 text-white text-[7px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-0.5 z-10">

                                <Star size={6} className="fill-white" /> Special

                              </div>

                            )}



                            {/* Veg/Non-veg indicator — no image */}

                            <div className="w-8 h-8 shrink-0 flex items-center justify-center">

                              <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center ${isVeg ? 'border-emerald-600' : 'border-red-600'}`}>

                                <div className={`w-2.5 h-2.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />

                              </div>

                            </div>



                            {/* Content section */}

                            <div className="flex-grow min-w-0 py-0.5 flex flex-col justify-between h-full">

                              <div>

                                {/* Category Tag & Spice Level */}

                                <div className="flex items-center gap-2 mb-1">

                                  <span className="text-[9px] font-black text-red-500/80 uppercase tracking-widest truncate">

                                    {item.c || 'Dish'}

                                  </span>

                                  {item.spice > 0 && (

                                    <span className="flex items-center gap-0.5 text-[8px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-1 py-0.2 rounded shrink-0">

                                      <Flame size={8} className="fill-orange-600" /> Lvl {item.spice}

                                    </span>

                                  )}

                                  {item.menuType === 'LIQUOR' && (

                                    <span className="text-[7px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200/50 px-1 py-0.2 rounded uppercase tracking-wider shrink-0">

                                      🥃 Liquor

                                    </span>

                                  )}

                                  {(activeOutlet === 'bar' || activeOutlet === 'both') && item.menuType === 'FOOD' && (

                                    <span className="text-[7px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/50 px-1 py-0.2 rounded uppercase tracking-wider shrink-0">

                                      🍽️ Food

                                    </span>

                                  )}

                                </div>



                                {/* Item Name (Swiggy/Zomato style bold typography) */}

                                <h3 className="captain-item-title font-extrabold text-[11px] sm:text-[12px] text-gray-900 tracking-tight leading-snug mb-0.5 pr-4 line-clamp-2 transition-colors group-hover:text-red-600">

                                  {item.n}

                                </h3>





                                {/* Item Short Description */}

                                {item.desc && (

                                  <p className="text-[10px] text-gray-400 font-medium line-clamp-1 leading-normal">

                                    {item.desc}

                                  </p>

                                )}

                              </div>



                              {/* Price & Action button */}

                              <div className="flex items-center justify-between mt-2.5">

                                <div className="flex items-baseline">

                                  <span className="text-[11px] font-bold text-[#E53935] mr-0.5">₹</span>

                                  <span className="text-sm sm:text-base font-black text-gray-900 tracking-tight">

                                    {item.p}

                                  </span>

                                  {item.variants && item.variants.length > 0 && (

                                    <span className="text-[8px] font-bold text-gray-400 ml-1.5 shrink-0">

                                      ({item.variants.length} Opt)

                                    </span>

                                  )}

                                </div>



                                {/* Add/Quantity control buttons */}

                                <div onClick={(e) => e.stopPropagation()}>

                                  {totalQty > 0 ? (

                                    <div className="flex items-center gap-1 bg-red-50/80 rounded-full p-0.5 border border-red-100 shadow-sm">

                                      {/* If the item has variants, let them select via preview/variant picker, else use quick minus/plus */}

                                      {item.variants && item.variants.length > 0 ? (

                                        <button

                                          onClick={(e) => {

                                            e.stopPropagation();

                                            handleItemClick(e, item);

                                          }}

                                          className="px-3 py-1 text-[9px] font-black text-[#E53935] uppercase tracking-wider"

                                        >

                                          {totalQty} Added

                                        </button>

                                      ) : (

                                        <>

                                          <button

                                            onClick={(e) => {

                                              e.stopPropagation();

                                              updateDraftQty(item.n, -1);

                                            }}

                                            className="w-6.5 h-6.5 rounded-full bg-white text-[#E53935] flex items-center justify-center hover:bg-gray-50 active:scale-90 transition-all shadow-sm border border-red-100"

                                          >

                                            <Minus size={10} strokeWidth={3.5} />

                                          </button>

                                          <span className="text-xs font-black w-4 text-center text-gray-900">

                                            {totalQty}

                                          </span>

                                          <button

                                            onClick={(e) => {

                                              e.stopPropagation();

                                              addItemToSession(item);

                                            }}

                                            className="w-6.5 h-6.5 rounded-full bg-[#E53935] text-white flex items-center justify-center hover:bg-[#d32f2f] active:scale-90 transition-all shadow-sm"

                                          >

                                            <Plus size={10} strokeWidth={3.5} />

                                          </button>

                                        </>

                                      )}

                                    </div>

                                  ) : (

                                    <button

                                      onClick={(e) => {

                                        e.stopPropagation();

                                        handleItemClick(e, item);

                                      }}

                                      className="px-4 py-1.5 rounded-full bg-white border border-red-100 text-[9px] font-black uppercase tracking-widest text-[#E53935] hover:bg-[#E53935] hover:text-white hover:border-[#E53935] transition-all shadow-sm active:scale-95 duration-200"

                                    >

                                      Add

                                    </button>

                                  )}

                                </div>

                              </div>

                            </div>

                          </ItemCard>

                        );

                      })}

                    </div>

                  )}

                </div>

              </div>



              {/* SESSION ORDER PANEL */}

              <div className={`w-full lg:w-[420px] ${isCartMinimized ? 'h-16 lg:h-auto overflow-hidden' : 'fixed inset-0 z-[100] lg:relative lg:inset-auto lg:h-auto lg:z-40'} bg-white flex flex-col shrink-0 shadow-[0_0_100px_rgba(0,0,0,0.04)] transition-all duration-300 ${!isCartMinimized ? 'animate-in fade-in slide-in-from-bottom-12 lg:animate-none' : ''}`}>

                <div

                  className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0 cursor-pointer lg:cursor-default"

                  onClick={() => {

                    if (isCartMinimized || window.innerWidth >= 1024) {

                      setIsCartMinimized(!isCartMinimized);

                    }

                  }}

                >

                  <div className="flex items-center gap-3">

                    {!isCartMinimized && (

                      <button

                        onClick={(e) => { e.stopPropagation(); setIsCartMinimized(true); }}

                        className="lg:hidden p-2 -ml-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center"

                      >

                        <ArrowLeft size={20} />

                      </button>

                    )}

                    <History size={18} className={`text-[#E53935] ${!isCartMinimized ? 'hidden lg:block' : ''}`} />

                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">{getTableSectionLabel(activeTable)} Activity</h3>

                  </div>

                  <div className="flex items-center gap-3">

                    <span className="text-sm font-black text-gray-900">₹{sessionBill.grandTotal}</span>

                    {isCartMinimized && (

                      <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex lg:hidden items-center justify-center text-gray-400">

                        <ChevronLeft size={16} className="rotate-90" />

                      </div>

                    )}

                    <div className="hidden lg:flex w-8 h-8 rounded-full bg-white border border-gray-200 items-center justify-center text-gray-400">

                      <ChevronLeft size={16} className={`transition-transform duration-300 ${isCartMinimized ? 'rotate-90' : '-rotate-90'}`} />

                    </div>

                  </div>

                </div>



                <div className="flex-grow overflow-y-auto p-6 space-y-8 custom-scrollbar min-h-0">

                  {/* KOT LOGS */}

                  {(activeTable?.kotHistory || [])
                    .filter(kot => Array.isArray(kot.items) && kot.items.length > 0)
                    .map((kot) => {
                    const visibleItems = kot.items.filter(i => (i.q ?? i.quantity ?? 0) > 0);
                    const cancellableItems = visibleItems.filter(i => i.s !== 'Cancelled' && !!i.orderItemId);

                    return visibleItems.length > 0 ? (

                      <div key={kot.id} className="space-y-4">

                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">

                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">KOT #{kot.id}</span>

                          <div className="flex items-center gap-2">

                            <span className="text-[9px] font-black text-gray-400 uppercase">

                              {kot.time

                                ? (kot.time.includes('T')

                                    ? (() => { try { const d = new Date(kot.time); return isNaN(d.getTime()) ? kot.time : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }); } catch { return kot.time; } })()

                                    : kot.time)

                                : '—'}

                            </span>
                          </div>

                        </div>

                        <div className="space-y-3">

                          {kot.items.map((item, iIdx) => {

                            const isCancelled = item.s === 'Cancelled' || item.removedFromBill === true;

                            const isLoading   = cancelLoading[item.orderItemId];

                            return (

                              <div key={iIdx} className={`flex justify-between items-center transition-all duration-300 ${isCancelled ? 'opacity-40 bg-red-50 rounded-lg px-1' : ''}`}>

                                <div className="flex items-center gap-3">

                                  <div className="w-6 h-6 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-600">

                                    {isCancelled ? (
                                      // Full cancellation — show original qty struck through in red
                                      <span className="line-through text-red-400">{item.q}x</span>
                                    ) : Number(item.cancelledQuantity ?? 0) > 0 ? (
                                      // Partial cancellation — show original (struck) → remaining
                                      <span>
                                        <span className="line-through text-red-400 text-[9px]">{Number(item.q) + Number(item.cancelledQuantity ?? 0)}x</span>
                                        <span className="text-green-600 font-black ml-1">{item.q}x</span>
                                      </span>
                                    ) : (
                                      <span>{item.q}x</span>
                                    )}

                                  </div>

                                  <p className={`text-[11px] font-bold ${isCancelled ? 'line-through text-red-400' : 'text-gray-700'}`}>{item.n}</p>

                                </div>

                                <div className="flex items-center gap-2">

                                  {isLoading ? (

                                    <Loader2 size={13} className="animate-spin text-red-400 shrink-0" />

                                  ) : isCancelled ? (

                                    <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-500 text-[8px] font-black uppercase tracking-widest border border-red-100">Cancelled</span>

                                  ) : (

                                    <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-[8px] font-black uppercase tracking-widest border border-green-100">{item.s}</span>

                                  )}

                                </div>

                              </div>

                            );

                          })}

                        </div>

                      </div>

                    ) : null;

                  })}





                  {/* ACTIVE DRAFT */}

                  <div className="space-y-5 pt-6 border-t-2 border-dashed border-gray-100">

                    <div className="flex items-center justify-between">

                      <h4 className="text-[11px] font-black uppercase tracking-widest text-[#E53935] flex items-center gap-2"><ShoppingCart size={16} /> New Items</h4>

                      {(currentSessionItems.length > 0 || (!activeTable?.kotHistory || activeTable?.kotHistory.length === 0)) && (

                        <button onClick={cancelSession} className="text-[9px] font-black text-[#E53935] uppercase hover:text-red-700 transition-colors bg-red-50 px-2 py-1 rounded-md border border-red-100">Cancel Session</button>

                      )}

                    </div>



                    {currentSessionItems.length === 0 ? (

                      <div className="py-12 text-center border-2 border-dashed border-gray-50 rounded-[32px] flex flex-col items-center bg-gray-50/30">

                        <UtensilsCrossed size={32} className="text-gray-200 mb-3" />

                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-relaxed">Menu is open.<br />Add items to start KOT.</p>

                      </div>

                    ) : (

                      <div className="space-y-3">

                        {currentSessionItems.map((item, idx) => (

                          <div key={idx} className="bg-red-50/50 p-4 rounded-3xl border border-red-100/30 animate-in slide-in-from-right-4">

                            <div className="flex justify-between items-start mb-3">

                              <p className="text-[11px] font-black text-gray-900 uppercase pr-8 leading-tight">{item.n}</p>

                              <button onClick={() => updateDraftQty(item.n, -item.q)} className="text-gray-300 hover:text-red-500 transition-colors"><X size={16} /></button>

                            </div>

                            <div className="flex items-center justify-between">

                              <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border border-red-50">

                                <button onClick={() => updateDraftQty(item.n, -1)} className="w-8 h-8 flex items-center justify-center text-[#E53935] hover:bg-red-50 rounded-lg transition-colors"><Minus size={14} strokeWidth={3} /></button>

                                {inlineQtyItem === item.n ? (
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    min="1"
                                    autoFocus
                                    defaultValue={item.q}
                                    className="w-10 text-center text-xs font-black bg-white border border-red-200 rounded-md outline-none focus:ring-1 focus:ring-red-300 py-0.5"
                                    onBlur={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (!isNaN(val) && val >= 1 && val !== item.q) {
                                        const delta = val - item.q;
                                        updateDraftQty(item.n, delta);
                                      }
                                      setInlineQtyItem(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.target.blur();
                                      } else if (e.key === 'Escape') {
                                        setInlineQtyItem(null);
                                      }
                                    }}
                                  />
                                ) : (
                                  <span
                                    onClick={() => setInlineQtyItem(item.n)}
                                    className="w-8 text-center text-xs font-black cursor-pointer select-none"
                                  >
                                    {item.q}
                                  </span>
                                )}

                                <button onClick={() => updateDraftQty(item.n, 1)} className="w-8 h-8 flex items-center justify-center text-[#E53935] hover:bg-red-50 rounded-lg transition-colors"><Plus size={14} strokeWidth={3} /></button>

                              </div>

                              <span className="text-sm font-black text-gray-900">₹{item.p * item.q}</span>

                            </div>

                            <div className="mt-1 ml-1">

                              {expandedNoteItemId === (item.menuItemId || item.id || item.n) ? (

                                <div className="flex items-center gap-1.5">

                                  <input

                                    type="text"

                                    maxLength={40}

                                    value={item.notes || ''}

                                    onFocus={() => isInstructionFocusedRef.current = true}

                                    onBlur={() => isInstructionFocusedRef.current = false}

                                    onChange={e => {

                                      const val = e.target.value;

                                      const key = item.menuItemId || item.id || item.n;

                                      setTableCarts(prev => ({

                                        ...prev,

                                        [activeTableId]: (prev[activeTableId] ?? []).map(ci =>

                                          (ci.menuItemId || ci.id || ci.n) === key

                                            ? { ...ci, notes: val || null }

                                            : ci

                                        )

                                      }));

                                    }}

                                    placeholder="e.g. Less spicy, No onion"

                                    autoFocus

                                    className="flex-1 text-[11px] font-bold px-2 py-1 rounded-lg border border-orange-300 bg-orange-50 text-gray-700 placeholder-gray-400 outline-none focus:border-orange-500 transition-colors"

                                  />

                                  <button

                                    onClick={() => setExpandedNoteItemId(null)}

                                    className="text-[10px] font-black text-gray-400 hover:text-gray-600 px-1"

                                  >

                                    ×

                                  </button>

                                </div>

                              ) : (

                                <button

                                  onClick={() => setExpandedNoteItemId(item.menuItemId || item.id || item.n)}

                                  className="text-[10px] font-black uppercase tracking-wide text-orange-500 hover:text-orange-700 transition-colors"

                                >

                                  {item.notes ? `📝 ${item.notes}` : '+ Add Instruction'}

                                </button>

                              )}

                            </div>

                          </div>

                        ))}

                      </div>

                    )}

                  </div>



                  {/* TODAY SPECIALS SMART SUGGESTIONS */}

                  {currentSessionItems.length > 0 && displaySpecials.length > 0 && (

                    <div className="pt-8 border-t-2 border-dashed border-gray-100">

                      <div className="flex items-center gap-2 mb-4">

                        <Star size={16} className="text-amber-500 fill-amber-500" />

                        <h4 className="text-[11px] font-black uppercase tracking-widest text-[#E53935]">Today Specials</h4>

                      </div>

                      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x custom-scrollbar">

                        {displaySpecials.map((item, idx) => (

                          <div

                            key={idx}

                            className="min-w-[150px] w-[150px] bg-amber-50/30 border border-amber-100 rounded-2xl p-3 shadow-sm shrink-0 snap-start flex flex-col relative overflow-hidden group hover:border-amber-300 transition-colors"

                          >

                            <p className="text-[11px] font-bold text-gray-900 leading-tight mb-3 pr-2">{item.n}</p>

                            <div className="flex items-center justify-between mt-auto">

                              <span className="text-[11px] font-black text-gray-500">₹{item.p}</span>

                              <button

                                onClick={(e) => { e.stopPropagation(); addItemToSession(item); }}

                                className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors"

                              >

                                <Plus size={16} strokeWidth={3} />

                              </button>

                            </div>

                          </div>

                        ))}

                      </div>

                    </div>

                  )}

                </div>



                <div className="p-8 bg-white border-t border-gray-100 space-y-6 shrink-0 shadow-[0_-20px_50px_rgba(0,0,0,0.03)] relative z-10">

                  <div className="flex justify-between items-center">

                    <div className="flex flex-col gap-1">

                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Running Total</span>

                      <p className="text-3xl font-black text-gray-900 tracking-tighter leading-none">₹{sessionBill.grandTotal}</p>

                    </div>

                    <div className="text-right flex flex-col gap-1">

                      <span className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em]">New Items</span>

                      <span className="text-lg font-black text-gray-400">₹{calculateOrderTotal(currentSessionItems).subtotal}</span>

                    </div>

                  </div>

                  {/* GST Breakdown */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">Subtotal</span>
                      <span className="block text-sm font-black text-gray-700">₹{sessionBill.subtotal}</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">CGST</span>
                      <span className="block text-sm font-black text-gray-700">₹{sessionBill.cgst}</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">SGST</span>
                      <span className="block text-sm font-black text-gray-700">₹{sessionBill.sgst}</span>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2">
                      <span className="block text-[9px] font-bold text-red-400 uppercase tracking-wider">Grand Total</span>
                      <span className="block text-sm font-black text-red-700">₹{sessionBill.grandTotal}</span>
                    </div>
                  </div>

                  <button

                    onClick={() => setShowKotConfirm(true)}

                    disabled={currentSessionItems.length === 0 || sendingKOT}

                    className="w-full py-5 bg-[#E53935] text-white rounded-2xl font-black text-xs uppercase tracking-[0.25em] shadow-xl shadow-red-100 active:scale-98 transition-all flex items-center justify-center gap-3 disabled:opacity-20 disabled:shadow-none relative group overflow-hidden"

                  >

                    {sendingKOT ? (

                      <>

                        <Loader2 size={18} className="animate-spin" />

                        Sending...

                      </>

                    ) : (

                      <>

                        <Send size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />

                        Send KOT to Kitchen

                      </>

                    )}

                  </button>

                </div>

              </div>

            </div>

          </div>

        )}

      </main>



      {/* EDIT ITEM MODAL */}

      {editingItem && (

        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 backdrop-blur-xl bg-black/40 animate-in fade-in duration-300">

          <div className="bg-white w-full max-w-sm rounded-[40px] overflow-hidden shadow-2xl p-8 animate-in zoom-in-95 duration-500 relative">

            <button onClick={() => setEditingItem(null)} className="absolute top-6 right-6 w-10 h-10 bg-gray-50 hover:bg-red-50 hover:text-red-500 rounded-full flex items-center justify-center transition-all"><X size={20} /></button>



            <div className="mb-8">

              <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-none mb-2">Update Asset</h3>

              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{editingItem.n}</p>

            </div>



            <div className="space-y-6">

              <div className="h-48 w-full rounded-[24px] overflow-hidden border-2 border-dashed border-gray-200 relative group flex items-center justify-center bg-gray-50">

                {editingItem.img ? (

                  <img src={editingItem.img} className="w-full h-full object-cover opacity-80 group-hover:opacity-40 transition-opacity" />

                ) : (

                  <ImageIcon className="text-gray-300" size={48} />

                )}

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">

                  <label className="cursor-pointer px-6 py-3 bg-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl border border-gray-100 hover:scale-105 active:scale-95 transition-transform flex items-center gap-2">

                    <ImageIcon size={14} className="text-[#E53935]" />

                    Upload Photo

                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, editingItem)} />

                  </label>

                </div>

              </div>



              <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 py-3 rounded-2xl border border-green-100">

                <RefreshCw size={14} className="animate-spin-slow" />

                <p className="text-[9px] font-black uppercase tracking-[0.1em]">Syncs instantly to all terminals</p>

              </div>

            </div>

          </div>

        </div>

      )}







      {/* UNDO NOTIFICATION */}

      {removedItem && (

        <div

          className="fixed bottom-24 right-6 z-[130] pointer-events-auto flex items-center justify-between gap-6 bg-gray-900 text-white px-5 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right-4 min-w-[280px] transition-transform"

          onTouchStart={e => e.currentTarget.dataset.startX = e.touches[0].clientX}

          onTouchMove={e => {

            const startX = parseFloat(e.currentTarget.dataset.startX);

            const currentX = e.touches[0].clientX;

            const deltaX = currentX - startX;

            if (deltaX > 0) {

              e.currentTarget.style.transform = `translateX(${deltaX}px)`;

              e.currentTarget.style.opacity = 1 - (deltaX / 200);

            }

          }}

          onTouchEnd={e => {

            const startX = parseFloat(e.currentTarget.dataset.startX);

            const currentX = e.changedTouches[0].clientX;

            if (currentX - startX > 50) {

              setRemovedItem(null);

            } else {

              e.currentTarget.style.transform = '';

              e.currentTarget.style.opacity = '';

            }

          }}

        >

          <div>

            <p className="text-[11px] font-black uppercase tracking-tight leading-none">{removedItem.n} Removed</p>

            <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase">Item removed from draft</p>

          </div>

          <button

            onClick={undoRemove}

            className="text-[10px] font-black text-amber-400 hover:text-amber-300 uppercase tracking-widest px-4 py-2 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors"

          >

            Undo

          </button>

        </div>

      )}



      {/* KOT FAILURE BANNER — shown when DB write fails; stays visible until dismissed or retried */}

      {kotError && (

        <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-between gap-4 bg-[#E53935] text-white px-5 py-4 shadow-2xl animate-in slide-in-from-top-2 duration-300">

          <div className="flex items-center gap-3 flex-1 min-w-0">

            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">

              <AlertCircle size={18} className="text-white" />

            </div>

            <div className="min-w-0">

              <p className="text-[12px] font-black uppercase tracking-wider leading-none">KOT Failed — Kitchen Did Not Receive This Order</p>

              <p className="text-[10px] font-bold text-white/75 mt-0.5 truncate">{kotError.message}</p>

            </div>

          </div>

          <div className="flex items-center gap-2 shrink-0">

            <button

              onClick={() => {

                // Items already restored into currentSessionItems in the catch block;

                // just dismiss the banner and let the captain press Send KOT again.

                setKotError(null);

              }}

              className="px-4 py-2 text-[11px] font-black uppercase tracking-wider border border-white/40 rounded-xl hover:bg-white/10 active:scale-95 transition-all"

            >

              Dismiss

            </button>

            <button

              onClick={() => {

                setKotError(null);

                // currentSessionItems was already restored in the catch block;

                // calling sendIncrementalKOT now re-submits the same items.

                sendIncrementalKOT();

              }}

              className="px-5 py-2 text-[11px] font-black uppercase tracking-wider bg-white text-[#E53935] rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg"

            >

              Retry

            </button>

          </div>

        </div>

      )}



      {/* OPERATIONAL NOTIFICATIONS */}

      <div className="fixed bottom-6 right-6 z-[120] flex flex-col gap-3 pointer-events-none">

        {notifications.map(n => (

          <div

            key={n.id}

            className="pointer-events-auto flex items-center gap-4 bg-white border border-gray-100 p-4 rounded-[24px] shadow-[0_20px_40px_rgba(0,0,0,0.1)] animate-in slide-in-from-right-4 min-w-[280px] transition-transform"

            onTouchStart={e => e.currentTarget.dataset.startX = e.touches[0].clientX}

            onTouchMove={e => {

              const startX = parseFloat(e.currentTarget.dataset.startX);

              const currentX = e.touches[0].clientX;

              const deltaX = currentX - startX;

              if (deltaX > 0) {

                e.currentTarget.style.transform = `translateX(${deltaX}px)`;

                e.currentTarget.style.opacity = 1 - (deltaX / 200);

              }

            }}

            onTouchEnd={e => {

              const startX = parseFloat(e.currentTarget.dataset.startX);

              const currentX = e.changedTouches[0].clientX;

              if (currentX - startX > 50) {

                setNotifications(prev => prev.filter(notif => notif.id !== n.id));

              } else {

                e.currentTarget.style.transform = '';

                e.currentTarget.style.opacity = '';

              }

            }}

          >

            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-[#E53935]'}`}>

              {n.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}

            </div>

            <div>

              <p className="text-[11px] font-black text-gray-900 uppercase tracking-tight leading-none">{n.title}</p>

              <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase">Cloud Synchronized</p>

            </div>

          </div>

        ))}

      </div>


      {/* MOVE TABLE MODAL */}

      {showMoveModal && (() => {

        const freeTables = ((activeOutlet === 'bar' || activeOutlet === 'both') ? barTables : tables).filter(

          t => t.status === TABLE_STATUS.FREE && t.id !== activeTable?.id

        );

        return (

          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowMoveModal(false)}>

            <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>

              {/* Header */}

              <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">

                <div className="flex items-center gap-2">

                  <div className="p-2 bg-blue-50 rounded-xl">

                    <ArrowRightLeft size={18} className="text-blue-600" />

                  </div>

                  <div>

                    <h3 className="font-black text-sm text-gray-900">Swap Table</h3>

                    <p className="text-[10px] text-gray-400 font-semibold">From Table {activeTable?.number || activeTable?.id}</p>

                  </div>

                </div>

                <button onClick={() => setShowMoveModal(false)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-all">

                  <X size={16} />

                </button>

              </div>



              {/* Table grid */}

              <div className="p-4 max-h-72 overflow-y-auto">

                {freeTables.length === 0 ? (

                  <div className="text-center py-8">

                    <div className="text-3xl mb-2">🪑</div>

                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">No free tables available</p>

                  </div>

                ) : (

                  <div className="grid grid-cols-3 gap-2">

                    {freeTables.map(t => (

                      <button

                        key={t.backendId || t.id}

                        disabled={moveLoading}

                        onClick={async () => {

                          setMoveLoading(true);

                          try {

                            await swapTable(

                              activeTable?.backendId,

                              t.backendId,

                              currentCaptain?.name || 'Captain',

                              activeRestaurantId,

                            );

                            setShowMoveModal(false);

                            setView('tables');

                          } catch (err) {

                            console.error('Move table failed:', err);

                            alert(err?.response?.data?.error || 'Move failed. Please try again.');

                          } finally {

                            setMoveLoading(false);

                          }

                        }}

                        className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 border-blue-100 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 transition-all active:scale-95 disabled:opacity-50"

                      >

                        <span className="text-lg font-black text-blue-700">{t.number || t.id}</span>

                        <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Free</span>

                      </button>

                    ))}

                  </div>

                )}

              </div>



              {/* Footer */}

              {moveLoading && (

                <div className="px-5 pb-5 flex items-center justify-center gap-2 text-blue-600">

                  <Loader2 size={16} className="animate-spin" />

                  <span className="text-[11px] font-black uppercase tracking-widest">Moving session…</span>

                </div>

              )}

            </div>

          </div>

        );

      })()}



      {/* VARIANT PICKER */}

      <VariantPicker

        item={activeVariantItem}

        onSelect={handleVariantSelect}

        onClose={() => setActiveVariantItem(null)}

      />

      <KotConfirmModal
        isOpen={showKotConfirm}
        itemCount={currentSessionItems.length}
        totalQty={currentSessionItems.reduce((s, i) => s + (i.q ?? 1), 0)}
        amount={calculateOrderTotal(currentSessionItems).subtotal}
        label="Send KOT"
        onConfirm={() => { setShowKotConfirm(false); sendIncrementalKOT(); }}
        onCancel={() => setShowKotConfirm(false)}
      />

    </div>

  );

}




