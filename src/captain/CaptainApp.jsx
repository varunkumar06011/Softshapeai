import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard, ShoppingCart, LogOut, ChevronRight, Clock, Plus, Minus,
  Send, CheckCircle2, Search, ArrowLeft, ChefHat, Timer,
  UtensilsCrossed, MessageSquare, Check, X, AlertCircle, Loader2, Zap,
  FileText, History, Bell, RefreshCw, Star, Info, Flame, ChevronLeft, Edit2, Image as ImageIcon,
  Target, TrendingUp, ArrowRightLeft, Wine, GlassWater
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMenuSync } from '../hooks/useMenuSync';
import { useTableSync } from '../services/tableSyncService';
import { createOrder, requestBilling, updateOrderItems, fetchTransactions, cancelOrderItem, swapTable } from '../services/orderApi';
import { calculateSessionBill, calculateOrderTotal, getTableItems } from '../shared/utils/billing';
import { filterMenuItems } from '../shared/utils/menuSearch';
import { RESTAURANT_ID } from '../services/tableApi';

const getLiquorDescription = (name, category) => {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();
  
  if (n.includes('vodka') || c.includes('vodka')) {
    return "Smooth and clean vodka with a crisp finish, ideal for classic cocktails and premium serves.";
  }
  if (n.includes('whisky') || n.includes('whiskey') || c.includes('whisky') || c.includes('single malt')) {
    return "Well-balanced whisky known for its smooth character and rich oak-inspired notes.";
  }
  if (n.includes('brandy') || c.includes('brandy')) {
    return "Classic brandy offering a warm profile with subtle fruit and spice undertones.";
  }
  if (n.includes('beer') || n.includes('lager') || n.includes('ale') || c.includes('beer') || c.includes('draught')) {
    return "Refreshing lager with a light body and easy-drinking character.";
  }
  if (n.includes('rum') || c.includes('rum')) {
    return "Rich and flavorful rum with deep molasses notes and a smooth finish.";
  }
  if (n.includes('gin') || c.includes('gin')) {
    return "Botanical-forward gin with bright juniper notes and a crisp, refreshing profile.";
  }
  if (n.includes('wine') || c.includes('wine') || c.includes('champagne')) {
    return "Elegant wine with a beautifully balanced profile and lingering aromatic finish.";
  }
  if (n.includes('tequila') || c.includes('tequila')) {
    return "Premium tequila offering a vibrant agave character with smooth, earthy undertones.";
  }
  
  return "Premium select offering a refined and smooth profile, crafted for an exceptional tasting experience.";
};

import { useWaiterCalls, broadcastWaiterEvent } from '../services/waiterCallService';
import { markWaiterCallAccepted } from '../services/customerSessionService';
import { useOutlet } from '../context/OutletContext';
import OutletToggle from '../shared/components/OutletToggle';
import { useBarTableSync } from '../services/barTableSyncService';
import { BAR_ID } from '../services/barApiConfig';
import BarMenuToggle from '../shared/components/BarMenuToggle';
import { fetchVenueMenu } from '../services/venueTableApi';
import { useBarMenuSync } from '../services/barMenuSyncService';
import VariantPicker from '../shared/components/VariantPicker';
import VenueSectionView from '../shared/components/VenueSectionView';

import { CAPTAINS } from '../config/captains';
import { fetchCaptainTarget } from '../services/captainTargetService';

const BAR_UNIT_ML = 30;
const FULL_BOTTLE_ML = 750;

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
    let audioCtx = null;
    let alarmInterval = null;

    const startAlarm = () => {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        const playBeep = () => {
          if (!audioCtx || audioCtx.state === 'suspended') return;
          const now = audioCtx.currentTime;

          // Chime tone 1 (A5 note)
          const osc1 = audioCtx.createOscillator();
          const gain1 = audioCtx.createGain();
          osc1.connect(gain1);
          gain1.connect(audioCtx.destination);
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(880, now);
          gain1.gain.setValueAtTime(0, now);
          gain1.gain.linearRampToValueAtTime(0.2, now + 0.05);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc1.start(now);
          osc1.stop(now + 0.3);

          // Chime tone 2 (C6 note)
          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1046.5, now + 0.08);
          gain2.gain.setValueAtTime(0, now + 0.08);
          gain2.gain.linearRampToValueAtTime(0.2, now + 0.13);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
          osc2.start(now + 0.08);
          osc2.stop(now + 0.38);
        };

        playBeep();
        alarmInterval = setInterval(playBeep, 800);
      } catch (e) {
        console.warn("Web Audio API not supported or blocked:", e);
      }
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
      if (audioCtx) {
        audioCtx.close().catch(() => { });
      }
    };
  }, [call]);

  const handleAccept = () => {
    if (navigator.vibrate) navigator.vibrate(200);
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
export default function CaptainApp({ onLogout }) {
  const { outlet } = useOutlet();
  const { tables: barTables, setTables: setBarTables } = useBarTableSync();
  const { tables, setTables, isSyncing: tablesSyncing } = useTableSync();
  const { menuItems: restaurantMenu, setMenuItems: setRestaurantMenu, categories: restaurantCategories, loading: restaurantMenuLoading } = useMenuSync();
  const { menuItems: barMenu, loading: barMenuLoading } = useBarMenuSync();

  const { activeCalls, clearCall } = useWaiterCalls();


  // ── All useState/useRef declarations FIRST (before any useMemo that references them) ──
  const [currentCaptain, setCurrentCaptain] = useState(() => {
    const saved = localStorage.getItem('active_captain');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoginView, setIsLoginView] = useState(() => {
    const auth = localStorage.getItem('captain_auth_v2') === 'true';
    const hasCaptain = !!localStorage.getItem('active_captain');
    return !(auth && hasCaptain);
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pin, setPin] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [view, setView] = useState('tables'); // tables, session
  const [activeTableId, setActiveTableId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeDiet, setActiveDiet] = useState('All');
  const [notifications, setNotifications] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [isCartMinimized, setIsCartMinimized] = useState(true);
  const [removedItem, setRemovedItem] = useState(null);
  const removeTimeoutRef = useRef(null);
  // Tracks the confirmed DB order ID for the current table session.
  // Using a ref (not state) so sendIncrementalKOT always reads the latest
  // value without needing to be in its dependency array.
  const activeOrderIdRef = useRef(null);
  const kotRequestIdRef = useRef(null);
  const isSubmittingKotRef = useRef(false);

  // Assignment tracking state
  const [activeView, setActiveView] = useState(() => localStorage.getItem('captain_active_tab') || 'assignment');
  const [tableSubCategory, setTableSubCategory] = useState('restaurant'); // 'restaurant' | 'conference1' | 'conference2' | 'pdr' | 'parcel'
  const [selectedPDRRoom, setSelectedPDRRoom] = useState(null); // 1-4
  const [assignment, setAssignment] = useState(null);
  const [todayRevenue, setTodayRevenue] = useState(0);

  const [activeBarMenu, setActiveBarMenu] = useState('food');
  const [tableCarts, setTableCarts] = useState({});
  const lastConfirmedItemsRef = useRef([]);
  const currentSessionItems = tableCarts[activeTableId] ?? [];

  const [activeVariantItem, setActiveVariantItem] = useState(null);
  const [expandedNoteItemId, setExpandedNoteItemId] = useState(null);

  // Cancel-item state
  const [cancelLoading,  setCancelLoading]  = useState({});
  const [cancelConfirm,  setCancelConfirm]  = useState({});
  // Cancel-items modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSelected,  setCancelSelected]  = useState({});  // { [orderItemId]: { item, kotId } }
  const [cancelBatchLoading, setCancelBatchLoading] = useState(false);

  // KOT dispatch error state — null when no error, or { message, retryItems } when DB write fails.
  // retryItems is the pre-cleared currentSessionItems snapshot so the captain can retry
  // without re-selecting anything.
  const [kotError, setKotError] = useState(null);
  const [sendingKOT, setSendingKOT] = useState(false);

  // Move-table swap state
  const [showMoveModal,   setShowMoveModal]   = useState(false);
  const [moveLoading,     setMoveLoading]     = useState(false);

  // Table filter state
  const [tableFilter, setTableFilter] = useState(() => {
    return localStorage.getItem('softshape_captain_table_filter') || 'my';
  });

  // ── Derived / memoised values (safe now that all state is declared above) ──
  const totalActiveTablesCount = useMemo(() => {
    if (!currentCaptain?.id) return 0;
    const activeList = outlet === 'bar' ? barTables : tables;
    return activeList.filter(t => t.captainId === currentCaptain.id && t.status !== TABLE_STATUS.FREE).length;
  }, [tables, barTables, currentCaptain?.id, outlet]);

  const hasReachedActiveLimit = false;

  const pendingCalls = useMemo(() => {
    return activeCalls.filter(c => c.status === 'pending' && (c.source || 'restaurant') === outlet);
  }, [activeCalls, outlet]);

  const loadCaptainRevenue = useCallback((captainId) => {
    if (!captainId) return;
    const todayDateISO = new Date().toISOString().slice(0, 10);
    // Fetch from both outlets and sum — captain may serve both
    const restaurantFetch = fetchTransactions(RESTAURANT_ID, 500, todayDateISO);
    const barFetch = fetchTransactions(BAR_ID, 500, todayDateISO);
    Promise.allSettled([restaurantFetch, barFetch]).then(results => {
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
  const activeMenuItems = outlet === 'bar' ? barMenu : restaurantMenu;
  const setMenuItems = outlet === 'bar' ? () => { } : setRestaurantMenu;
  const menuLoading = outlet === 'bar' ? barMenuLoading : restaurantMenuLoading;

  // Use venue-001 for all venue sections (conference1, conference2, pdr, parcel)
  const activeRestaurantId = useMemo(() => {
    if (tableSubCategory !== 'restaurant') return 'venue-001';
    if (outlet === 'bar') return BAR_ID;
    return RESTAURANT_ID;
  }, [outlet, tableSubCategory]);

  const [venueSpecificMenu, setVenueSpecificMenu] = useState(null);
  useEffect(() => {
    let currentVenueId = null;
    if (tableSubCategory === 'bar') currentVenueId = 'venue-bar';
    else if (tableSubCategory === 'conference1') currentVenueId = 'venue-conference1';
    else if (tableSubCategory === 'conference2') currentVenueId = 'venue-pdr';
    else if (tableSubCategory === 'pdr') currentVenueId = 'venue-rooms';
    else if (tableSubCategory === 'parcel') currentVenueId = 'venue-parcel';

    if (!currentVenueId) {
      setVenueSpecificMenu(null);
      return;
    }

    fetchVenueMenu(currentVenueId, activeRestaurantId)
      .then(items => {
        const mapped = items.map(serverItem => {
          const defaultVariant = serverItem.variants?.find(v => v.isDefault) ?? serverItem.variants?.[0];
          return {
            id: serverItem.id,
            n: serverItem.name,
            p: Math.round(serverItem.price),
            c: serverItem.category,
            t: serverItem.isVeg ? 'veg' : 'non',
            img: serverItem.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop',
            desc: serverItem.description || '',
            menuType: serverItem.menuType,
            variants: serverItem.variants?.map(v => ({...v, price: Number(v.price)}))
          };
        });
        setVenueSpecificMenu(mapped);
      })
      .catch(console.error);
  }, [tableSubCategory, activeRestaurantId]);

  const outletFilteredMenuItems = useMemo(() => {
    if (tableSubCategory !== 'restaurant' && venueSpecificMenu) {
      return venueSpecificMenu;
    }
    if (outlet === 'bar') {
      return activeMenuItems.filter(item => item.isAvailable !== false);
    }
    return activeMenuItems.filter(item => item.menuType === 'FOOD' && item.isAvailable !== false);
  }, [outlet, activeMenuItems, tableSubCategory, venueSpecificMenu]);

  const categories = useMemo(() => {
    if (outlet === 'restaurant') return restaurantCategories;
    const cats = new Set(outletFilteredMenuItems.map(i => i.c));
    return ['All', ...Array.from(cats)].filter(Boolean);
  }, [outlet, restaurantCategories, outletFilteredMenuItems]);

  const todaySpecials = useMemo(() => {
    const now = Date.now();
    return outletFilteredMenuItems.filter(
      i => i.isSpecial && i.active && (!i.expiresAt || now < i.expiresAt)
    );
  }, [outletFilteredMenuItems]);

  // Derived — switch between restaurant and bar floor
  const activeTables = outlet === 'bar' ? barTables : tables;
  const setActiveTables = outlet === 'bar' ? setBarTables : setTables;


  const activeTable = useMemo(() => activeTables.find(t => t.id === activeTableId), [activeTables, activeTableId]);

  const sessionBill = useMemo(() => {
    if (!activeTable) return { subtotal: 0, taxes: 0, total: 0 };
    // Fresh/free table — only count the current draft items
    const isFreshSession = activeTable.status === TABLE_STATUS.FREE
      || (!activeTable.kotHistory?.length && !activeTable.currentBill && !activeTable.activeOrder);
    if (isFreshSession) {
      return calculateOrderTotal(currentSessionItems);
    }
    const committedItems = getTableItems(activeTable);
    const itemsForTotal = committedItems.length > 0
      ? committedItems
      : lastConfirmedItemsRef.current;
    return calculateOrderTotal([...itemsForTotal, ...currentSessionItems]);
  }, [activeTable, currentSessionItems]);

  // Helper functions for captain colors
  const getCaptainBorderColor = (captainId) => {
    const captain = CAPTAINS.find(c => c.id === captainId);
    if (!captain) return '';
    const match = captain.color.match(/text-\[([^\]]+)\]/);
    return match ? `border-l-[${match[1]}]` : '';
  };

  const getCaptain = (captainId) => {
    return CAPTAINS.find(c => c.id === captainId);
  };

  // Filtered tables based on filter selection
  const filteredTables = useMemo(() => {
    const baseTables = activeTables;
    if (tableFilter === 'all') {
      return baseTables;
    }
    // "My Tables" - show only tables assigned to this captain
    return baseTables.filter(t => t.captainId === currentCaptain?.id);
  }, [activeTables, tableFilter, currentCaptain?.id]);

  const freeCount = useMemo(() => activeTables.filter(t => t.status === TABLE_STATUS.FREE).length, [activeTables]);
  const busyCount = useMemo(() => activeTables.filter(t => t.status !== TABLE_STATUS.FREE).length, [activeTables]);

  const myTablesCount = useMemo(() => {
    return activeTables.filter(t => t.captainId === currentCaptain?.id).length;
  }, [activeTables, currentCaptain?.id]);

  const allTablesCount = useMemo(() => activeTables.length, [activeTables]);

  const filteredMenu = useMemo(
    () =>
      filterMenuItems(outletFilteredMenuItems, {
        query: searchQuery,
        category: activeCategory,
        diet: activeDiet,
      }),
    [searchQuery, activeCategory, activeDiet, outletFilteredMenuItems]
  );

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
    return () => {
      window.removeEventListener('softshape_menu_updated', onMenuUpdated);
    };
  }, []);

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
    if (tablesSyncing) {
      setIsSyncing(true);
      const timer = setTimeout(() => setIsSyncing(false), 800);
      return () => clearTimeout(timer);
    }
  }, [tablesSyncing]);

  // Persist table filter preference
  useEffect(() => {
    localStorage.setItem('softshape_captain_table_filter', tableFilter);
  }, [tableFilter]);

  // Reset tableSubCategory to 'restaurant' when switching outlets
  useEffect(() => {
    setTableSubCategory('restaurant');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet]);

  // Clean up stale cart keys when a table is deleted from the active list
  useEffect(() => {
    const validIds = new Set(activeTables.map(t => String(t.id)));
    setTableCarts(prev => {
      const cleaned = Object.fromEntries(
        Object.entries(prev).filter(([k]) => validIds.has(k))
      );
      return Object.keys(cleaned).length === Object.keys(prev).length ? prev : cleaned;
    });
  }, [activeTables]);

  // SHARED STATE PERSISTENCE

  const addNotification = (title, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, title, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

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
  };

  const handlePinInput = (num) => {
    setPinError(false);
    if (pin.length < 4 && !isAuthenticating) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        setIsAuthenticating(true);
        setTimeout(() => {
          if (newPin === selectedProfile.pin) {
            setCurrentCaptain(selectedProfile);
            setIsLoginView(false);
            localStorage.setItem('captain_auth_v2', 'true');
            localStorage.setItem('active_captain', JSON.stringify(selectedProfile));
          } else {
            setPin('');
            setPinError(true);
          }
          setIsAuthenticating(false);
        }, 600);
      }
    }
  };

  // INVARIANT: lastConfirmedItemsRef.current must be reset to [] whenever openTableSession is called, not just when cancelSession is called.
  // INVARIANT: activeOrderIdRef.current must be null when a captain opens a free table. It must only be set to a real DB order ID when that order exists, is active (not PAID/CANCELLED), and has items.
  const openTableSession = (table) => {
    setActiveTableId(table.id);
    lastConfirmedItemsRef.current = [];
    activeOrderIdRef.current = null;
    kotRequestIdRef.current = null;
    setView('session');
  };

  // INVARIANT: Adding items to the cart NEVER changes table status or persists anything to backend.
  // Table status only changes to PREPARING when a KOT is successfully sent (see sendIncrementalKOT).
  // This prevents the cashier from seeing a table as occupied before any order is confirmed.
  const addItemToSession = (item, variant = null) => {
    if (!activeTableId) return; // no active table, do nothing

    const variantSuffix = variant ? ` ${variant.name}` : '';
    const finalName = `${item.n}${variantSuffix}`;
    const finalPrice = variant ? Number(variant.price) : item.p;

    setTableCarts(prev => {
      const currentCart = prev[activeTableId] ?? [];
      const existing = currentCart.find(i => i.n === finalName);
      let updatedCart;
      if (existing) {
        updatedCart = currentCart.map(i => i.n === finalName ? { ...i, q: i.q + 1 } : i);
      } else {
        updatedCart = [...currentCart, { ...item, n: finalName, p: finalPrice, q: 1, notes: null, s: 'Pending', menuType: item.menuType || 'FOOD' }];
      }
      return { ...prev, [activeTableId]: updatedCart };
    });
    addNotification(`${finalName} added`, 'success');
    setSearchQuery('');
  };

  const handleItemClick = (e, item) => {
    e.stopPropagation();
    if (outlet === 'bar' && item.menuType === 'LIQUOR' && !item.isBottleItem) {
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
    setTableCarts(prev => {
      const currentCart = prev[activeTableId] ?? [];
      const itemToUpdate = currentCart.find(i => i.n === name);
      if (itemToUpdate && itemToUpdate.q + delta <= 0) {
        setRemovedItem(itemToUpdate);
        if (removeTimeoutRef.current) clearTimeout(removeTimeoutRef.current);
        removeTimeoutRef.current = setTimeout(() => {
          setRemovedItem(null);
        }, 5000);
      }
      const updatedCart = currentCart.map(i => {
        if (i.n === name) return { ...i, q: i.q + delta };
        return i;
      }).filter(i => i.q > 0);
      return { ...prev, [activeTableId]: updatedCart };
    });
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
    // Always clear first - never carry a ref from a previous table
    activeOrderIdRef.current = null;
    kotRequestIdRef.current = null;

    if (activeTableId) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTableId]);

  const sendIncrementalKOT = async () => {
    if (sendingKOT || isSubmittingKotRef.current) return; // Prevent duplicate clicks
    if (currentSessionItems.length === 0) return;
    if (!currentCaptain) { setIsLoginView(true); return; }
    if (!activeTable?.backendId) {
      addNotification("Table is still syncing", "error");
      return;
    }

    isSubmittingKotRef.current = true;
    setSendingKOT(true);

    const existingOrderId = activeOrderIdRef.current;

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
          menuType: String(i.menuType || 'FOOD').toUpperCase() === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
        }))
        .filter(i => !!i.menuItemId);

      // Snapshot items before clearing — needed for print and retry
      const itemsForPrint = [...currentSessionItems];
      const retrySnapshot = [...currentSessionItems]; // preserved for Retry button
      const newTotalBill = calculateSessionBill(activeTable, currentSessionItems).subtotal;
      const requestId = existingOrderId
        ? (kotRequestIdRef.current || (kotRequestIdRef.current = crypto.randomUUID()))
        : null;

      setExpandedNoteItemId(null);
      // Clear error state
      setKotError(null);

      // 1. Create/update order in DB FIRST (CRITICAL: Wait for real KOT ID)
      let savedOrder;
      let realKotId;

      if (existingOrderId) {
        // Subsequent KOT on same table — append items to existing order
        const response = await updateOrderItems(existingOrderId, apiItems, requestId);
        savedOrder = response?.order || response;  // Handle both { order: {...} } and direct response
        // Extract real KOT ID from kotHistory in response
        realKotId = (response?.order?.kotHistory || response?.kotHistory)?.[
          (response?.order?.kotHistory || response?.kotHistory)?.length - 1
        ]?.id;
      } else {
        // First KOT — create a brand-new order row
        savedOrder = await createOrder({
          tableId: activeTable.backendId,
          tableNumber: activeTable.id,
          restaurantId: activeRestaurantId,
          items: apiItems,
        });
        // Store the real DB id so next KOT uses updateOrderItems, not createOrder
        if (savedOrder?.id) activeOrderIdRef.current = savedOrder.id;
        // Extract real KOT ID from kotHistory in response
        realKotId = savedOrder?.kotHistory?.[savedOrder.kotHistory.length - 1]?.id;
      }
      kotRequestIdRef.current = null;

      // 2. Update UI with real KOT data from backend
      const newKOT = {
        id: realKotId || Math.floor(1000 + Math.random() * 9000).toString(),
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
        items: itemsForPrint.map(i => ({ ...i, s: 'KOT Sent' })),
        status: 'Incoming',
        createdAt: Date.now(),
        itemsReady: 0
      };

      setActiveTables(prev => prev.map(t => {
        if (t.backendId !== activeTable.backendId) return t;
        return {
          ...t,
          status: TABLE_STATUS.PREPARING,
          time: t.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
          captainId: currentCaptain.id,
          kotHistory: (() => {
            const currentHistory = t.kotHistory || [];
            const exists = currentHistory.some(k => String(k.id) === String(newKOT.id));
            return exists ? currentHistory : [...currentHistory, newKOT];
          })(),
          currentBill: newTotalBill,
        };
      }));

      // 4. Stitch real DB orderItemId onto this KOT's items for cancel support
      const savedItems = savedOrder?.items ?? [];
      const allPrevIds = new Set(
        (activeTable.kotHistory || []).flatMap(k => k.items.map(i => i.orderItemId).filter(Boolean))
      );

      setActiveTables(prev => prev.map(t => {
        if (t.backendId !== activeTable.backendId) return t;
        return {
          ...t,
          kotHistory: (t.kotHistory || []).map(kot => {
            if (kot.id !== newKOT.id) return kot;
            return {
              ...kot,
              items: kot.items.map(kotI => {
                const matched = savedItems.find(si =>
                  si.name === (kotI.n || kotI.name) && !allPrevIds.has(si.id)
                );
                return matched ? { ...kotI, orderItemId: matched.id } : kotI;
              }),
            };
          }),
        };
      }), { skipPersist: true });

      // ✅ DB confirmed — snapshot and clear draft
      const committedSoFar = getTableItems(activeTable);
      lastConfirmedItemsRef.current = [...committedSoFar, ...currentSessionItems];
      setTableCarts(prev => ({ ...prev, [activeTableId]: [] })); // clear draft

      addNotification(`KOT #${realKotId || newKOT.id} Sent ✓`, 'success');
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
              i.orderItemId === kotItem.orderItemId ? { ...i, s: 'Cancelled' } : i
            ),
          };
        }),
        currentBill: Math.max(0, (t.currentBill ?? 0) - (kotItem.p ?? 0) * (kotItem.q ?? 1)),
      };
    }));

    try {
      await cancelOrderItem(
        activeOrderIdRef.current,
        kotItem.orderItemId,
        currentCaptain?.name || currentCaptain?.id || 'Captain',
        activeTable?.number ?? activeTable?.id,
        Number(kotItem.q ?? 1)
      );
      addNotification(`${kotItem.n} cancelled`, 'success');
      // Backend emits CANCEL_KOT print_job → PrintStation handles it
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
                i.orderItemId === kotItem.orderItemId ? { ...i, s: 'KOT Sent' } : i
              ),
            };
          }),
          currentBill: (t.currentBill ?? 0) + (kotItem.p ?? 0) * (kotItem.q ?? 1),
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
    setView('tables');
    setActiveTableId(null);

    // 2. Fire API
    if (orderId) {
      try {
        await requestBilling(orderId);
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

  if (isLoginView) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F4F5] p-4 sm:p-6 font-['Inter',sans-serif]">
        <div className="w-full max-w-lg bg-white rounded-[30px] sm:rounded-[40px] p-6 sm:p-10 shadow-[0_40px_80px_rgba(0,0,0,0.06)] border border-gray-100">
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
            <div className="grid grid-cols-2 gap-4">
              {CAPTAINS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleProfileSelect(p)}
                  className="flex flex-col items-center gap-4 p-6 rounded-[24px] border border-gray-100 bg-white hover:border-gray-300 hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
                >
                  <div className={`w-14 h-14 rounded-2xl ${p.color} flex items-center justify-center text-xl font-black tracking-tight shadow-sm group-hover:scale-110 transition-transform`}>
                    {p.initials}
                  </div>
                  <span className="text-[13px] font-bold text-gray-800 tracking-tight">{p.name}</span>
                </button>
              ))}
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
                    <p className="text-sm font-bold text-[#E53935]">plz enter right password</p>
                    <p className="text-sm font-bold text-[#E53935] mt-1">దయచేసి సరైన పాస్వర్డ్ను నమోదు చేయండి.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-white overflow-hidden font-['Inter',sans-serif] text-[#1A1A1A]">

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
                });
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
      <header className="h-14 bg-white border-b border-gray-100 px-6 flex items-center justify-between shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape.ai"
              className="h-12 sm:h-16 w-auto object-contain shrink-0"
            />
            <div className="hidden sm:flex flex-col border-l-2 border-gray-100 pl-3 justify-center">
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Terminal</span>
              <span className="text-[11px] font-black text-gray-900 tracking-tight leading-none">{currentCaptain?.name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <OutletToggle className="flex" />
          <div className={`flex items-center gap-2 transition-opacity duration-500 ${isSyncing ? 'opacity-100' : 'opacity-20'}`}>
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Live Sync</span>
          </div>
          <button onClick={() => {
            localStorage.removeItem('captain_auth_v2');
            localStorage.removeItem('active_captain');
            setIsLoginView(true);
          }} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><LogOut size={18} /></button>
        </div>
      </header>

      {/* CAPTAIN NAV TABS */}
      <div className="bg-white border-b border-gray-100 px-4 flex shrink-0">
        <button
          onClick={() => { setActiveView('assignment'); localStorage.setItem('captain_active_tab', 'assignment'); }}
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
          onClick={() => { setActiveView('tables'); localStorage.setItem('captain_active_tab', 'tables'); }}
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
                      ? new Date(assignment.assignedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
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

              {/* VENUE SUBCATEGORY PILLS — inside floor overview, not a separate screen */}
              <div className="flex gap-2 flex-wrap mb-4">
                {[
                  { id: 'restaurant', label: outlet === 'bar' ? '🍺 Bar' : '🍽 Restaurant' },
                  { id: 'conference1', label: 'Conference Hall' },
                  { id: 'conference2', label: 'PDR' },
                  { id: 'pdr', label: 'Rooms' },
                  { id: 'parcel', label: 'Parcel(vijay)' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setTableSubCategory(tab.id); setSelectedPDRRoom(null); }}
                    className={`px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-base sm:text-lg font-black border-2 uppercase tracking-widest transition-all shadow-sm ${
                      tableSubCategory === tab.id
                        ? 'bg-[#E53935] text-white border-[#E53935]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {tableSubCategory === 'restaurant' ? (
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
                      key={table.id}
                      onClick={() => openTableSession(table)}
                      className={`aspect-square p-3 sm:p-4 rounded-2xl sm:rounded-3xl border-2 transition-all flex flex-col items-center justify-between group relative overflow-hidden active:scale-95 ${
                        isMyTable ? `border-l-4 ${borderColor}` : ''
                      } ${table.status === TABLE_STATUS.FREE ? 'bg-white border-gray-100 hover:border-gray-300' :
                        table.status === TABLE_STATUS.BILLING ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-lg shadow-amber-100' :
                          table.status === TABLE_STATUS.READY ? 'bg-green-50 border-green-200 text-green-700' :
                            'bg-red-50 border-red-100 text-red-600'
                        }`}
                    >
                      <div className="w-full flex justify-between items-start">
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-600 transition-colors">{outlet === 'bar' ? 'B' : 'T'}{table.number ?? table.id}</span>
                          {table.captainName && (
                            <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-1 py-0.5 rounded leading-none">
                              {table.captainName.split(' ')[0]}
                            </span>
                          )}
                        </div>

                        {/* Captain Initials Badge */}
                        {isMyTable && assignedCaptain && (
                          <div className={`absolute top-2 right-2 w-6 h-6 rounded-lg ${assignedCaptain.color} flex items-center justify-center text-[8px] font-black shadow-sm`}>
                            {assignedCaptain.initials}
                          </div>
                        )}
                      </div>

                      <span className="text-2xl sm:text-3xl font-black leading-none">{table.number ?? table.id}</span>

                      <div className="w-full flex flex-col items-center gap-1.5">
                        <div className={`w-full py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[7px] sm:text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1 sm:gap-1.5 ${table.status === TABLE_STATUS.FREE ? 'bg-gray-100 text-gray-400' :
                          table.status === TABLE_STATUS.BILLING ? 'bg-amber-500 text-white animate-pulse' :
                            table.status === TABLE_STATUS.READY ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                          }`}>
                          {table.status}
                        </div>
                        {table.status !== TABLE_STATUS.FREE && (
                          <span className="text-[10px] font-black opacity-60">₹{table.currentBill}</span>
                        )}
                      </div>
                    </button>
                );
              })}
            </div>
          </>
        ) : (
          <VenueSectionView
            venueId={
              tableSubCategory === 'bar' ? 'venue-bar' :
              tableSubCategory === 'conference1' ? 'venue-conference1' :
              tableSubCategory === 'conference2' ? 'venue-pdr' :
              tableSubCategory === 'pdr' ? 'venue-rooms' : 'venue-parcel'
            }
            sectionName={
              tableSubCategory === 'bar' ? 'Bar' :
              tableSubCategory === 'conference1' ? 'Conference Hall' :
              tableSubCategory === 'conference2' ? 'PDR' :
              tableSubCategory === 'pdr' ? 'Rooms' : 'Parcel(vijay)'
            }
            restaurantId="venue-001"
            roomMode={tableSubCategory === 'pdr' ? 'pdr4' : 'single'}
            selectedRoom={selectedPDRRoom}
            onSelectRoom={setSelectedPDRRoom}
            captainId={currentCaptain?.id}
            onTableSelect={openTableSession}
            onOrderPlaced={() => {}}
          />
        )}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col overflow-hidden bg-white">
            {/* STICKY SESSION HEADER */}
            <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 shrink-0 z-40 shadow-sm">
              <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
                <button onClick={() => setView('tables')} className="p-2.5 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-xl border border-gray-100 transition-all"><ChevronLeft size={20} /></button>
                <div className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight uppercase leading-none">Table {activeTable?.displayName || activeTable?.name || activeTable?.id}</h2>
                    <div className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest border border-blue-100 shrink-0">Live Session #10{activeTable?.id}</div>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Timer size={10} /> {activeTable?.time
                      ? new Date(activeTable.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
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
                <button
                  onClick={requestFinalBill}
                  disabled={activeTable?.status === TABLE_STATUS.BILLING}
                  className="flex-grow sm:flex-grow-0 px-6 py-2.5 bg-amber-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-100 hover:scale-105 active:scale-95 transition-all text-center disabled:opacity-50 disabled:hover:scale-100"
                >
                  {activeTable?.status === TABLE_STATUS.BILLING ? 'Billing Requested' : 'Request Billing'}
                </button>
                <button className="p-2.5 bg-red-50 text-[#E53935] rounded-xl border border-red-100 shrink-0"><Bell size={18} /></button>
              </div>
            </div>

            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">
              {/* MENU INTERFACE */}
              <div className={`flex-grow flex flex-col overflow-hidden bg-gray-50/30 ${isCartMinimized ? 'h-full lg:h-auto' : 'h-1/2 lg:h-auto'} border-b lg:border-b-0 lg:border-r border-gray-100 transition-all duration-300`}>
                {/* STICKY MENU BAR */}
                {outlet === 'bar' ? (
                  <div className="bg-white/95 backdrop-blur-md border-b border-gray-100 shrink-0 z-30 shadow-sm transition-all duration-300">
                    <div className="px-4 py-3 flex flex-col gap-3">
                      <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#E53935]" size={22} />
                        <input
                          type="search"
                          placeholder="Search fine spirits, drinks & food..."
                          className="w-full bg-red-50/30 border border-red-100 rounded-2xl pl-12 pr-5 py-3.5 text-base font-bold outline-none focus:bg-white focus:border-[#E53935] focus:ring-4 focus:ring-red-50 transition-all shadow-inner"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
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
                ) : (
                  <div className="px-6 py-4 bg-white border-b border-gray-100 flex flex-col gap-4 shrink-0 z-30">
                    <div className="relative group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E53935] transition-colors" size={20} />
                      <input
                        type="search"
                        placeholder="Search by name, category, price, or ID..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-5 py-3.5 text-[15px] font-bold outline-none focus:bg-white focus:border-[#E53935] focus:ring-4 focus:ring-red-50 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoComplete="off"
                      />
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

                      {/* Dietary Filter */}
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
                <div className="flex-grow overflow-y-auto p-6 scroll-smooth">
                  {menuLoading ? (
                    <p className="text-center text-xs text-gray-400 py-12 font-black uppercase tracking-widest">Syncing menu…</p>
                  ) : filteredMenu.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-12 font-bold">
                      {searchQuery.trim()
                        ? `No dishes found for "${searchQuery.trim()}"`
                        : "No items in this category."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 pb-12">
                      {filteredMenu.map((item, idx) => {
                        const totalQty = currentSessionItems.filter(i => i.n.startsWith(item.n)).reduce((acc, i) => acc + i.q, 0);
                        const isVeg = item.t === 'veg';

                        return (
                          <div
                            key={idx}
                            onClick={() => setPreviewItem(item)}
                            className="cursor-pointer bg-white border border-gray-100 hover:border-[#E53935]/40 rounded-2xl p-3.5 flex gap-4 items-center group hover:shadow-[0_12px_30px_rgba(229,57,53,0.07)] transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.015)] active:scale-[0.98] relative overflow-hidden"
                          >
                            {/* Chef Special Badge */}
                            {item.isSpecial && (
                              <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-orange-500 text-white text-[7px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-0.5 z-10">
                                <Star size={6} className="fill-white" /> Special
                              </div>
                            )}

                            {/* Image container */}
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl sm:rounded-[20px] overflow-hidden shrink-0 relative shadow-inner bg-gray-50 border border-gray-100/50">
                              <img
                                src={item.img}
                                alt={item.n}
                                className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out"
                              />

                              {/* Premium Veg/Non-veg indicator square overlay */}
                              <div className="absolute top-1.5 left-1.5 bg-white/95 backdrop-blur-sm p-0.5 rounded-[4px] shadow-sm border border-gray-100 flex items-center justify-center">
                                <div className={`w-3.5 h-3.5 rounded-[3px] border-[1.5px] flex items-center justify-center ${isVeg ? 'border-emerald-600' : 'border-red-600'}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
                                </div>
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
                                  {outlet === 'bar' && item.menuType === 'FOOD' && (
                                    <span className="text-[7px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/50 px-1 py-0.2 rounded uppercase tracking-wider shrink-0">
                                      🍽️ Food
                                    </span>
                                  )}
                                </div>

                                {/* Item Name (Swiggy/Zomato style bold typography) */}
                                <h3 className="captain-item-title font-extrabold text-[11px] sm:text-[12px] text-gray-900 tracking-tight leading-snug mb-0.5 pr-4 line-clamp-2 transition-colors group-hover:text-red-600">
                                  {item.n}
                                </h3>

                                {/* ML sub-label for LIQUOR items */}
                                {item.menuType === 'LIQUOR' && !item.isBottleItem && (
                                  <p className="text-[10px] font-bold text-gray-500 mb-0.5">
                                    {item.n.endsWith('Full Bottle') ? `${FULL_BOTTLE_ML}ml (Full Bottle)` : `${totalQty} × ${BAR_UNIT_ML}ml = ${totalQty * BAR_UNIT_ML}ml`}
                                  </p>
                                )}

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
                                            setPreviewItem(item);
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
                          </div>
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
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">T{activeTable?.id} Activity</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-gray-900">₹{sessionBill.subtotal}</span>
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
                  {(activeTable?.kotHistory || []).map((kot) => {
                    const cancellableItems = kot.items.filter(i => i.s !== 'Cancelled' && !!i.orderItemId);
                    return (
                      <div key={kot.id} className="space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">KOT #{kot.id}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-gray-400 uppercase">
                              {kot.time
                                ? (kot.time.includes('T')
                                    ? new Date(kot.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                                    : kot.time)
                                : '—'}
                            </span>
                            {cancellableItems.length > 0 && (
                              <button
                                onClick={() => setShowCancelModal(true)}
                                className="px-2 py-0.5 rounded-md bg-red-50 text-red-500 text-[8px] font-black uppercase tracking-widest border border-red-100 hover:bg-red-100 transition-colors flex items-center gap-1"
                              >
                                <X size={10} /> Cancel Items
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-3">
                          {kot.items.map((item, iIdx) => {
                            const isCancelled = item.s === 'Cancelled';
                            const isLoading   = cancelLoading[item.orderItemId];
                            return (
                              <div key={iIdx} className={`flex justify-between items-center transition-opacity ${isCancelled ? 'opacity-40' : ''}`}>
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-600">{item.q}x</div>
                                  <p className={`text-[11px] font-bold ${isCancelled ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.n}</p>
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
                    );
                  })}


                  {/* ACTIVE DRAFT */}
                  <div className="space-y-5 pt-6 border-t-2 border-dashed border-gray-100">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-[#E53935] flex items-center gap-2"><ShoppingCart size={16} /> New KOT Draft</h4>
                      {(currentSessionItems.length > 0 || (!activeTable?.kotHistory || activeTable.kotHistory.length === 0)) && (
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
                                <span className="w-8 text-center text-xs font-black">{item.q}</span>
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
                            onClick={() => setPreviewItem(item)}
                            className="min-w-[150px] w-[150px] bg-amber-50/30 border border-amber-100 rounded-2xl p-3 shadow-sm shrink-0 snap-start flex flex-col relative overflow-hidden group cursor-pointer hover:border-amber-300 transition-colors"
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
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{currentSessionItems.length > 0 ? 'Updating' : 'Grand Total'}</span>
                      <p className="text-3xl font-black text-gray-900 tracking-tighter leading-none">₹{sessionBill.subtotal}</p>
                    </div>
                    <div className="text-right flex flex-col gap-1">
                      <span className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em]">KOT Draft</span>
                      <span className="text-lg font-black text-gray-400">₹{calculateOrderTotal(currentSessionItems).subtotal}</span>
                    </div>
                  </div>
                  <button
                    onClick={sendIncrementalKOT}
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

      {/* CUSTOMER ITEM PREVIEW MODAL */}
      {previewItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/40 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-3xl sm:rounded-[48px] overflow-hidden shadow-[0_100px_150px_rgba(0,0,0,0.3)] flex flex-col md:flex-row animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="w-full md:w-1/2 h-[200px] sm:h-[300px] md:h-auto relative shrink-0">
              <img src={previewItem.img} alt={previewItem.n} className="w-full h-full object-cover" />
              <button onClick={() => setPreviewItem(null)} className="absolute top-4 left-4 sm:top-6 sm:left-6 w-10 h-10 sm:w-12 sm:h-12 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-2xl flex items-center justify-center text-white transition-all"><X size={24} /></button>
              <div className="absolute bottom-8 left-8 flex gap-3">
                {previewItem.menuType !== 'LIQUOR' && (
                  <div className={`px-4 py-2 rounded-xl backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-widest ${previewItem.t === 'veg' ? 'bg-green-500/80' : 'bg-red-500/80'}`}>
                    {previewItem.t === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}
                  </div>
                )}
                {previewItem.spice > 0 && (
                  <div className="px-4 py-2 rounded-xl backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-widest bg-orange-500/80 flex items-center gap-2">
                    <Flame size={14} /> Spicy Lvl {previewItem.spice}
                  </div>
                )}
              </div>
            </div>
            <div className="w-full md:w-1/2 p-6 sm:p-12 flex flex-col justify-between">
              <div>
                <h3 className="text-2xl sm:text-4xl font-black tracking-tight text-gray-900 mb-2 sm:mb-4 leading-tight">{previewItem.n}</h3>
                <p className="text-sm sm:text-base text-gray-500 font-medium leading-relaxed mb-6 sm:mb-8">
                  {previewItem.menuType === 'LIQUOR' ? getLiquorDescription(previewItem.n, previewItem.c) : previewItem.desc}
                </p>

                <div className="space-y-4 sm:space-y-6">
                  {previewItem.menuType === 'LIQUOR' ? (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-amber-500"><Wine size={20} /></div>
                        <p className="text-sm font-black uppercase tracking-tight text-gray-700">Premium Bar Selection</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500"><GlassWater size={20} /></div>
                        <p className="text-sm font-black uppercase tracking-tight text-gray-700">Served perfectly chilled</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-[#E53935]"><CheckCircle2 size={20} /></div>
                        <p className="text-sm font-black uppercase tracking-tight text-gray-700">Premium Chef Special Recommendation</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-[#E53935]"><ChefHat size={20} /></div>
                        <p className="text-sm font-black uppercase tracking-tight text-gray-700">Freshly prepared in our high-speed kitchen</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-100 flex items-center justify-between gap-4">
                <div className="flex flex-col shrink-0">
                  <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest">A-la-Carte Price</span>
                  <span className="text-2xl sm:text-3xl font-black text-gray-900">₹{previewItem.p}</span>
                </div>
                <button
                  onClick={() => { addItemToSession(previewItem); setPreviewItem(null); }}
                  className="px-6 py-4 sm:px-10 sm:py-5 w-full bg-[#E53935] text-white rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] shadow-xl shadow-red-100 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-3"
                >
                  <Plus size={20} strokeWidth={3} />
                  Add to Session
                </button>
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

      {/* CANCEL ITEMS MODAL */}
      {showCancelModal && (() => {
        // Gather all cancellable items across all KOTs
        const allCancellable = [];
        (activeTable?.kotHistory || []).forEach(kot => {
          kot.items.forEach(item => {
            if (item.s !== 'Cancelled' && !!item.orderItemId) {
              allCancellable.push({ item, kotId: kot.id, kotTime: kot.time });
            }
          });
        });
        const selectedCount = Object.keys(cancelSelected).length;
        const selectedQuantityTotal = Object.values(cancelSelected).reduce(
          (sum, entry) => sum + Math.max(1, Math.round(Number(entry.quantity ?? 1))),
          0
        );

        const handleCancelSelected = async () => {
          if (selectedCount === 0) return;
          if (!activeOrderIdRef.current) {
            addNotification('No active order found.', 'error');
            return;
          }
          setCancelBatchLoading(true);
          const entries = Object.values(cancelSelected); // [{ item, kotId }]
          for (const { item, kotId } of entries) {
            const cancelQuantity = Math.max(1, Math.min(
              Number(item.q ?? 0),
              Math.round(Number(cancelSelected[item.orderItemId]?.quantity ?? 1))
            ));
            const isFullCancel = cancelQuantity >= Number(item.q ?? 0);
            // Optimistic update
            setActiveTables(prev => prev.map(t => {
              if (t.backendId !== activeTable?.backendId) return t;
              return {
                ...t,
                kotHistory: (t.kotHistory || []).map(kot => {
                  if (kot.id !== kotId) return kot;
                  return {
                    ...kot,
                    items: kot.items.map(i => {
                      if (i.orderItemId !== item.orderItemId) return i;
                      if (isFullCancel) {
                        return {
                          ...i,
                          q: 0,
                          s: 'Cancelled',
                          cancelledQuantity: Number(i.cancelledQuantity ?? 0) + cancelQuantity,
                        };
                      }
                      return {
                        ...i,
                        q: Math.max(0, Number(i.q ?? 0) - cancelQuantity),
                        s: 'KOT Sent',
                        cancelledQuantity: Number(i.cancelledQuantity ?? 0) + cancelQuantity,
                      };
                    }),
                  };
                }),
                currentBill: Math.max(0, (t.currentBill ?? 0) - (item.p ?? 0) * cancelQuantity),
              };
            }));
            setCancelLoading(prev => ({ ...prev, [item.orderItemId]: true }));
            try {
              await cancelOrderItem(
                activeOrderIdRef.current,
                item.orderItemId,
                currentCaptain?.name || currentCaptain?.id || 'Captain',
                activeTable?.number ?? activeTable?.id,
                cancelQuantity
              );
            } catch (err) {
              console.error('[CancelBatch]', err.message);
              // Revert this one item
              setActiveTables(prev => prev.map(t => {
                if (t.backendId !== activeTable?.backendId) return t;
                return {
                  ...t,
                  kotHistory: (t.kotHistory || []).map(kot => {
                    if (kot.id !== kotId) return kot;
                    return {
                      ...kot,
                      items: kot.items.map(i => {
                        if (i.orderItemId !== item.orderItemId) return i;
                        return isFullCancel
                          ? { ...i, q: Math.max(1, Number(item.q ?? 1)), s: 'KOT Sent' }
                          : {
                              ...i,
                              q: Number(i.q ?? 0) + cancelQuantity,
                              s: 'KOT Sent',
                              cancelledQuantity: Math.max(0, Number(i.cancelledQuantity ?? 0) - cancelQuantity),
                            };
                      }),
                    };
                  }),
                  currentBill: (t.currentBill ?? 0) + (item.p ?? 0) * cancelQuantity,
                };
              }));
              addNotification(`Failed to cancel ${item.n}`, 'error');
            } finally {
              setCancelLoading(prev => ({ ...prev, [item.orderItemId]: false }));
            }
          }
          addNotification(
            selectedCount === 1
              ? `${entries[0].item.n} x${selectedQuantityTotal} cancelled`
              : `${selectedQuantityTotal} qty cancelled`,
            'success'
          );
          setCancelSelected({});
          setCancelBatchLoading(false);
          setShowCancelModal(false);
        };

        return (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowCancelModal(false); setCancelSelected({}); }}>
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm mx-0 sm:mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-50 rounded-xl">
                    <X size={18} className="text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-gray-900">Cancel Items</h3>
                    <p className="text-[10px] text-gray-400 font-semibold">Table {activeTable?.number || activeTable?.id} — select items to remove</p>
                  </div>
                </div>
                <button onClick={() => { setShowCancelModal(false); setCancelSelected({}); }} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-all">
                  <X size={16} />
                </button>
              </div>

              {/* Item list */}
              <div className="p-4 max-h-72 overflow-y-auto space-y-2">
                {allCancellable.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 size={32} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">No cancellable items</p>
                  </div>
                ) : (
                  allCancellable.map(({ item, kotId, kotTime }) => {
                    const isChecked = !!cancelSelected[item.orderItemId];
                    const cancelQuantity = Math.max(
                      1,
                      Math.min(
                        Number(item.q ?? 1),
                        Math.round(Number(cancelSelected[item.orderItemId]?.quantity ?? 1))
                      )
                    );
                    const remainingQuantity = Math.max(0, Number(item.q ?? 0) - cancelQuantity);
                    return (
                      <button
                        key={item.orderItemId}
                        onClick={() => setCancelSelected(prev => {
                          if (prev[item.orderItemId]) {
                            const next = { ...prev };
                            delete next[item.orderItemId];
                            return next;
                          }
                          return { ...prev, [item.orderItemId]: { item, kotId, quantity: 1 } };
                        })}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${
                          isChecked
                            ? 'border-red-400 bg-red-50'
                            : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                            isChecked ? 'border-red-500 bg-red-500' : 'border-gray-300 bg-white'
                          }`}>
                            {isChecked && <Check size={12} className="text-white" strokeWidth={3} />}
                          </div>
                          <div>
                            <p className="text-[12px] font-black text-gray-900">{item.n}</p>
                            <p className="text-[9px] font-bold text-gray-400 uppercase">
                              {isChecked && cancelQuantity < Number(item.q ?? 0) ? (
                                <>
                                  <span className="line-through">{cancelQuantity}x</span>
                                  <span className="ml-1 text-red-500">{remainingQuantity}x remain</span>
                                </>
                              ) : (
                                <>{item.q}x · ₹{item.p * item.q} · KOT {kotTime}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isChecked && (
                            <div className="flex items-center gap-1 bg-white border border-red-200 rounded-lg px-2 py-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelSelected(prev => ({
                                    ...prev,
                                    [item.orderItemId]: {
                                      ...prev[item.orderItemId],
                                      quantity: Math.max(1, Number(prev[item.orderItemId]?.quantity ?? 1) - 1),
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
                                    [item.orderItemId]: {
                                      ...prev[item.orderItemId],
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
                                    [item.orderItemId]: {
                                      ...prev[item.orderItemId],
                                      quantity: Math.min(Number(item.q ?? 1), Number(prev[item.orderItemId]?.quantity ?? 1) + 1),
                                    },
                                  }));
                                }}
                                className="w-6 h-6 rounded-md bg-red-50 text-red-600 font-black"
                              >
                                +
                              </button>
                            </div>
                          )}
                          <span className="text-[10px] font-black text-gray-500">₹{item.p * item.q}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              {allCancellable.length > 0 && (
                <div className="px-4 pb-5 pt-3 border-t border-gray-100 space-y-2">
                  {selectedCount > 0 && (
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest text-center">
                      {selectedQuantityTotal} qty selected — will be removed from bill
                    </p>
                  )}
                  <button
                    disabled={selectedCount === 0 || cancelBatchLoading}
                    onClick={handleCancelSelected}
                    className="w-full py-3.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-lg shadow-red-100"
                  >
                    {cancelBatchLoading ? (
                      <><Loader2 size={15} className="animate-spin" /> Cancelling…</>
                    ) : (
                      <><X size={15} /> Cancel {selectedCount > 0 ? `${selectedQuantityTotal} Qty` : 'Selected'}</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* MOVE TABLE MODAL */}
      {showMoveModal && (() => {
        const freeTables = (outlet === 'bar' ? barTables : tables).filter(
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
                        key={t.id}
                        disabled={moveLoading}
                        onClick={async () => {
                          setMoveLoading(true);
                          try {
                            await swapTable(
                              activeTable.backendId,
                              t.backendId,
                              currentCaptain?.name || 'Captain',
                              RESTAURANT_ID,
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
    </div>
  );
}

