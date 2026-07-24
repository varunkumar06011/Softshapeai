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

  FileText, History, Bell, RefreshCw, Info, Flame, ChevronLeft, Edit2, Image as ImageIcon,

  Target, TrendingUp, ArrowRightLeft, Wine, GlassWater, Mic, MicOff, Heart, ChevronUp,

  Wifi, WifiOff, AlertTriangle, Cloud

} from 'lucide-react';
import { StarIcon } from '../shared/icons/StarIcon';

import { motion, AnimatePresence } from 'framer-motion';

import { useMenuSync } from '../hooks/useMenuSync';
import { getSocket } from '../hooks/useSocket';
import { useTableSync } from '../services/tableSyncService';
import { useLongPress } from '../hooks/useLongPress';
import KotConfirmModal from '../shared/components/KotConfirmModal';
import QuantityPicker from '../shared/components/LiquorQtyPicker';

import { createOrder, requestBilling, updateOrderItems, fetchTransactions, cancelOrderItem, swapTable, reserveKotNumber } from '../services/orderApi';

import { calculateSessionBill, calculateOrderTotal, calculateTableBill, getTableItems, getBillableItems } from '../shared/utils/billing';

import { filterMenuItems } from '../shared/utils/menuSearch';

import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { getRestaurantConfig, refreshOutletConfigFromEdge } from '../utils/getRestaurantConfig.js';
import { getTenantScopedKey } from '../utils/cacheKeys';
import { safeGetJSON } from '../utils/safeParseJSON';
import { useAuth } from '../context/AuthContext.jsx';

import { getItemCategory } from '../utils/itemHelpers';
import { printLocal } from '../utils/printOffline';
import { buildFoodKOT, buildLiquorKOT } from '../utils/escposFrontend';
import { getLocalPrinterMapping, setLocalPrinterMapping } from '../utils/offlineDB';
import { getNextOfflineKotNumber } from '../utils/offlineDB';
import { useSyncStatus } from '../context/SyncStatusContext';
import { getEdgeUrl, setEdgeUrl, isEdgeAvailable, isEdgeLocalAuth, edgeFetch, prewarmEdgeHealth, discoverEdgeUrlFromBackend, discoverEdgeOnLAN, getEdgeConnectivityState, getEdgeDiscoveryFailReason, EDGE_READ_TIMEOUT_MS } from '../services/edgeHealth';
import { sendOutputIntent, generateIntentId } from '../services/outputClient';






import { useWaiterCalls } from '../services/waiterCallService';

import { useBarTableSync } from '../services/barTableSyncService';

import { useBarMenuSync } from '../services/barMenuSyncService';


import VenueSectionView from '../shared/components/VenueSectionView';

import { getTableSectionLabel, getSectionBadgeColor } from '../utils/tableHelpers';



import { authService } from '../services/authService';
import { API_BASE, apiUrl, getAuthHeaders } from '../services/apiConfig';

import { fetchCaptainTarget } from '../services/captainTargetService';

import { playChimeTone, unlockAudioContext } from '../services/audioService';

import { hapticSuccess } from '../shared/hooks/useHaptics';

import Sidebar from './components/Sidebar';
import TopNavbar from './components/TopNavbar';
import MobileBottomNav from './components/MobileBottomNav';
import ComingSoon from './components/ComingSoon';
import FloorOverview from './components/FloorOverview';



const { barUnitMl: BAR_UNIT_ML, fullBottleMl: FULL_BOTTLE_ML } = getRestaurantConfig();

// Bar-like venue types — expanded to include all bar-related venue types
const BAR_LIKE_VENUE_TYPES = ['BAR', 'PDR', 'CONFERENCE', 'BANQUET', 'ROOM_SERVICE', 'BAR_LOUNGE', 'BREWERY', 'PUB', 'LOUNGE', 'NIGHTCLUB', 'WINE_BAR', 'COCKTAIL_BAR'];
function isBarLikeVenue(venueType) {
  if (!venueType) return false;
  return BAR_LIKE_VENUE_TYPES.includes(venueType.toUpperCase());
}



const TABLE_STATUS = {
  FREE: 'Free',
  OCCUPIED: 'Occupied',
  PREPARING: 'Occupied',
  READY: 'Occupied',
  BILLING: 'Occupied'
};

const toFrontendTableStatus = (backendStatus) => {
  if (!backendStatus) return 'Free';
  if (backendStatus === 'AVAILABLE' || backendStatus === 'Free' || backendStatus === 'TERMINATED') return 'Free';
  return 'Occupied';
};

const normalizeKotsModule = (kots) => {
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
    kotHistory: isFreeWorkflow ? [] : ((Array.isArray(row.kots) && row.kots.length > 0) ? normalizeKotsModule(row.kots) : (Array.isArray(row.kotHistory) ? row.kotHistory : (existing?.kotHistory || []))),
    currentBill: isFreeWorkflow ? 0 : Number(row.currentBill ?? 0),
    activeOrder: isFreeWorkflow ? null : ((row.orders?.[0] && row.orders[0].tableId === row.id) ? row.orders[0] : (row.activeOrder || null)),
    ...(existing ? { displayName: existing.displayName, name: existing.name } : {}),
  };
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

const MemoMenuCard = React.memo(function MemoMenuCard({ item, totalQty, activeOutlet, onAdd, onMinus }) {
  const isVeg = item.t === 'veg';
  const className = `cursor-pointer rounded-2xl p-3.5 flex gap-4 items-center group transition-all duration-300 active:scale-[0.98] relative overflow-hidden ${
    item.isSpecial
      ? 'bg-gradient-to-br from-amber-50 to-white border border-amber-300 hover:border-amber-500 hover:shadow-[0_12px_30px_rgba(245,158,11,0.12)] shadow-[0_4px_20px_rgba(245,158,11,0.05)]'
      : 'bg-white border border-gray-100 hover:border-[#E53935]/40 hover:shadow-[0_12px_30px_rgba(229,57,53,0.07)] shadow-[0_4px_20px_rgba(0,0,0,0.015)]'
  }`;
  return (
    <ItemCard item={item} onAdd={onAdd} className={className}>
      {item.isSpecial && (
        <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-orange-500 text-white text-[7px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-0.5 z-10">
          <Flame size={7} className="fill-white" /> Special
        </div>
      )}
      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
        <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center ${isVeg ? 'border-emerald-600' : 'border-red-600'}`}>
          <div className={`w-2.5 h-2.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
        </div>
      </div>
      <div className="flex-grow min-w-0 py-0.5 flex flex-col justify-between h-full">
        <div>
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
          <h3 className="captain-item-title font-extrabold text-[11px] sm:text-[12px] text-gray-900 tracking-tight leading-snug mb-0.5 pr-4 line-clamp-2 transition-colors group-hover:text-red-600">
            {item.n}
          </h3>
          {item.desc && (
            <p className="text-[10px] text-gray-400 font-medium line-clamp-1 leading-normal">
              {item.desc}
            </p>
          )}
        </div>
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
          <div onClick={(e) => e.stopPropagation()}>
            {totalQty > 0 ? (
              <div className="flex items-center gap-1 bg-red-50/80 rounded-full p-0.5 border border-red-100 shadow-sm">
                {item.variants && item.variants.length > 0 ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAdd(e, item); }}
                    className="px-3 py-1 text-[9px] font-black text-[#E53935] uppercase tracking-wider"
                  >
                    {totalQty} Added
                  </button>
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onMinus(item.n, -1); }}
                      className="w-6.5 h-6.5 rounded-full bg-white text-[#E53935] flex items-center justify-center hover:bg-gray-50 active:scale-90 transition-all shadow-sm border border-red-100"
                    >
                      <Minus size={10} strokeWidth={3.5} />
                    </button>
                    <span className="text-xs font-black w-4 text-center text-gray-900">
                      {totalQty}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdd(e, item); }}
                      className="w-6.5 h-6.5 rounded-full bg-[#E53935] text-white flex items-center justify-center hover:bg-[#d32f2f] active:scale-90 transition-all shadow-sm"
                    >
                      <Plus size={10} strokeWidth={3.5} />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onAdd(e, item); }}
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
}, (prev, next) => prev.item === next.item && prev.totalQty === next.totalQty && prev.activeOutlet === next.activeOutlet);

export default function CaptainApp({ onLogout }) {

  const { restaurant, user, setAuth } = useAuth();
  const { isOffline, isOnline, syncStatus, pendingCount, lastError, triggerSync } = useSyncStatus();

  const enabledModules = restaurant?.enabledModules || {};
  const activeOutlet = enabledModules.bar && enabledModules.food ? 'both'
    : enabledModules.bar && !enabledModules.food ? 'bar'
    : 'restaurant';

  // ── Edge server settings state ──────────────────────────────────────────────
  const [showEdgeSettings, setShowEdgeSettings] = useState(false);
  const [edgeUrlInput, setEdgeUrlInput] = useState('');
  const [edgeStatus, setEdgeStatus] = useState({ checking: false, available: false, url: '' });
  const [discoveryStatus, setDiscoveryStatus] = useState('');

  const checkEdgeStatus = useCallback(async () => {
    setEdgeStatus(prev => ({ ...prev, checking: true }));
    // Discover edge URL from backend first (if no manual URL configured) so
    // isEdgeAvailable uses the cashier's LAN IP, not localhost.
    if (!localStorage.getItem('softshape_edge_url')) {
      await discoverEdgeUrlFromBackend().catch(() => {});
    }
    const url = getEdgeUrl();
    const available = await isEdgeAvailable();
    const connState = await getEdgeConnectivityState();
    // Use connState as the primary signal — it's more granular and more
    // accurate than the boolean isEdgeAvailable (which has a longer cache
    // interval and may return stale false while connState is edge_reachable).
    const edgeReachable = connState === 'edge_reachable' || (available && connState !== 'edge_not_ready');
    setEdgeStatus({ checking: false, available: edgeReachable, url, connState });
  }, []);

  // Fallback: refresh restaurantType/enabledModules for existing sessions
  useEffect(() => {
    // Periodically refresh outlet config from edge server
    refreshOutletConfigFromEdge();
    const interval = setInterval(refreshOutletConfigFromEdge, 60_000);
    return () => clearInterval(interval);
  }, []);

  // P1-10: Track config changes so billing inherits admin panel updates
  const [configVersion, setConfigVersion] = useState(0);
  useEffect(() => {
    const handler = () => setConfigVersion(v => v + 1);
    window.addEventListener('ss_restaurant_config_changed', handler);
    return () => window.removeEventListener('ss_restaurant_config_changed', handler);
  }, []);
  const restaurantConfig = useMemo(() => getRestaurantConfig(), [configVersion]);

  // ── Periodic edge connectivity polling ──────────────────────────────────────
  // Poll every 10 seconds so the status card reflects real-time connectivity.
  // The getEdgeConnectivityState function has its own 10s cache, so this is
  // effectively a continuous check that doesn't overload the edge server.
  useEffect(() => {
    const pollInterval = setInterval(() => {
      checkEdgeStatus();
    }, 10_000);
    return () => clearInterval(pollInterval);
  }, [checkEdgeStatus]);

  // ── Trigger LAN discovery on mount for captain devices ──────────────────────
  useEffect(() => {
    checkEdgeStatus();
    // Always attempt LAN discovery on mount — checkEdgeStatus is async so
    // edgeStatus.available won't be updated yet. discoverEdgeOnLAN internally
    // skips if a manual URL is configured or if already discovered.
    setDiscoveryStatus('Searching for edge server on LAN…');
    discoverEdgeOnLAN().then((discovered) => {
      if (discovered) {
        setDiscoveryStatus(`Found edge server: ${discovered}`);
        checkEdgeStatus();
      } else {
        const reason = getEdgeDiscoveryFailReason();
        setDiscoveryStatus(reason || 'Edge server not found on LAN');
      }
    }).catch(() => setDiscoveryStatus(''));
  }, []);

  useEffect(() => {
    if (!restaurant?.enabledModules) {
      fetch(`${API_BASE}/api/auth/me`, { credentials: 'include', headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.restaurant?.enabledModules) {
            const authKey = Object.keys(localStorage).find(k => k.includes('auth') && localStorage.getItem(k));
            if (authKey) {
              const parsed = safeGetJSON(authKey, null);
              if (parsed) {
                parsed.restaurant = { ...parsed.restaurant, ...data.restaurant };
                localStorage.setItem(authKey, JSON.stringify(parsed));
              }
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Proactive Print Agent URL caching — fetch on startup so it's available when offline
  // Also discover the edge server URL from the backend so the captain app on a
  // different device (phone/tablet) can find the edge server on the cashier PC.
  useEffect(() => {
    // Discover edge server LAN URL from backend (non-blocking, 3s timeout)
    discoverEdgeUrlFromBackend().catch(() => {});
    // Pre-warm edge health cache so first table fetch doesn't pay the health check latency
    prewarmEdgeHealth();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    fetch(`${API_BASE}/api/print/agent-endpoint`, {
      credentials: 'include',
      headers: getAuthHeaders(),
      signal: controller.signal,
    })
      .then(r => { clearTimeout(timeout); return r.ok ? r.json() : null; })
      .then(data => {
        if (data?.cacheVersion) {
          const storedVersion = localStorage.getItem('print_agent_cache_version');
          if (storedVersion !== data.cacheVersion) {
            localStorage.removeItem('last_working_print_agent_url');
            localStorage.setItem('print_agent_cache_version', data.cacheVersion);
          }
        }
        if (data?.httpUrl) {
          localStorage.setItem('last_working_print_agent_url', data.httpUrl);
        }
        if (data?.lanIp) {
          const lanUrl = `http://${data.lanIp}:3101`;
          if (!localStorage.getItem('last_working_print_agent_url')) {
            localStorage.setItem('last_working_print_agent_url', lanUrl);
          }
        }
      })
      .catch(() => { clearTimeout(timeout); });
    return () => clearTimeout(timeout);
  }, []);

  // Fetch sections dynamically - edge-first with cloud fallback
  const [fetchedSections, setFetchedSections] = useState([]);
  useEffect(() => {
    const fetchSections = async () => {
      // Edge-first: try edge server first, fall back to cloud
      const useEdgeDirect = isEdgeLocalAuth();
      if (useEdgeDirect || await isEdgeAvailable()) {
        try {
          const data = await edgeFetch('/api/edge/sections', { timeoutMs: EDGE_READ_TIMEOUT_MS });
          const rawSections = Array.isArray(data) ? data : data?.sections || [];
          setFetchedSections(rawSections);
        } catch (err) {
          console.warn('[fetchedSections] edge fetch failed, trying cloud:', err.message);
          // Fall back to cloud if edge fails
          try {
            const r = await fetch(`${API_BASE}/api/venue/sections`, {
              credentials: 'include',
              headers: getAuthHeaders(),
            });
            if (!r.ok) {
              console.error('[fetchedSections] cloud API error:', r.status, r.statusText);
              setFetchedSections([]);
              return;
            }
            const data = await r.json();
            setFetchedSections(Array.isArray(data) ? data : data.sections || []);
          } catch (err) {
            console.error('[fetchedSections] cloud fetch failed:', err);
            setFetchedSections([]);
          }
        }
        return;
      }
      // Edge unavailable: use cloud directly
      try {
        const r = await fetch(`${API_BASE}/api/venue/sections`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        if (!r.ok) {
          console.error('[fetchedSections] API error:', r.status, r.statusText);
          setFetchedSections([]);
          return;
        }
        const data = await r.json();
        setFetchedSections(Array.isArray(data) ? data : data.sections || []);
      } catch (err) {
        console.error('[fetchedSections] fetch failed:', err);
        setFetchedSections([]);
      }
    };
    fetchSections();
  }, []);

  // Refs needed by table sync guards — declared early so they're available to useTableSync/useBarTableSync
  const isSubmittingKotRef = useRef(false);
  const activeTableIdRef = useRef(null);

  const { tables: barTables, setTables: setBarTables, refetch: refetchBarTables } = useBarTableSync({
    shouldSkipTableUpdate: (t) => isSubmittingKotRef.current && String(t.id) === String(activeTableIdRef.current),
  });

  const { tables, setTables, isSyncing: tablesLoading, refetch: refetchRestaurantTables } = useTableSync({
    shouldSkipTableUpdate: (t) => isSubmittingKotRef.current && String(t.id) === String(activeTableIdRef.current),
  });

  const { menuItems: restaurantMenu, setMenuItems: setRestaurantMenu, categories: restaurantCategories, loading: restaurantMenuLoading, refreshMenu } = useMenuSync();

  const { menuItems: barMenu, loading: barMenuLoading } = useBarMenuSync();



  const { activeCalls, clearCall } = useWaiterCalls(activeOutlet);





  // ── All useState/useRef declarations FIRST (before any useMemo that references them) ──

  const [currentCaptain, setCurrentCaptain] = useState(() => {
    const saved = localStorage.getItem(getTenantScopedKey('active_captain'));
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        localStorage.removeItem(getTenantScopedKey('active_captain'));
      }
    }
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
      const r = safeGetJSON('ss_restaurant', {});
      return r?.slug || '';
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
  const kotRequestIdRef = useRef(null);

  const kotSubmitStartRef = useRef(0); // timestamp guard against stuck submissions
  const printTimeoutRef = useRef(null); // timeout for KOT print acknowledgement

  // Bug A: Dedup socket echoes from our own KOT submissions (same pattern as cashier)
  const processedSocketRequestIds = useRef(new Set());

  // Issue 17: Track tables where billing was requested — freeze items from stale
  // order:updated/order:created events, same pattern as cashier's billPrintedTableIdsRef.
  // Cleared when the table is settled (order:paid) or goes Free.
  const billRequestedTableIdsRef = useRef(new Set());

  // Guards against stale socket events reviving settled tables (same pattern as cashier)
  const terminatedTableIdsRef = useRef(new Set());
  const recentlyTerminatedRef = useRef((() => {
    try {
      const raw = localStorage.getItem(getTenantScopedKey('captain_recently_terminated'));
      const map = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      // 30-second TTL: keeps terminated tables hidden briefly to prevent flicker
      Object.keys(map).forEach(k => { if (now - map[k] > 30000) delete map[k]; });
      return map;
    } catch { return {}; }
  })());

  // Bug B: Guard against printing the same KOT number twice (same pattern as cashier)
  const _printedKotNumbers = useRef(new Set());
  const PRINTED_KOT_NUMBERS_MAX = 200;
  const markKotNumberPrinted = useCallback((kotNumber) => {
    const set = _printedKotNumbers.current;
    set.add(kotNumber);
    if (set.size > PRINTED_KOT_NUMBERS_MAX) {
      const arr = Array.from(set);
      set.clear();
      arr.slice(-PRINTED_KOT_NUMBERS_MAX).forEach(n => set.add(n));
    }
  }, []);
  const addItemCooldownRef = useRef({}); // key: item.id or item.n → last add timestamp
  const lastAnyItemAddedRef = useRef(0);
  const tableBillCacheRef = useRef(new Map()); // stable bill cache to prevent table view flickering

  const getStableTableBill = useCallback((table) => {
    if (!table) return { subtotal: 0, taxes: 0, total: 0, grandTotal: 0 };
    const items = getBillableItems(table);
    const sig = items.map(i => `${i.id ?? i.n}:${i.q ?? i.quantity}:${i.p ?? i.price}`).join('|');
    const cacheKey = String(table.backendId ?? table.id ?? table.number ?? '');
    const cached = tableBillCacheRef.current.get(cacheKey);
    if (cached && cached.sig === sig) return cached.bill;
    const bill = calculateTableBill(table, restaurantConfig);
    tableBillCacheRef.current.set(cacheKey, { sig, bill });
    return bill;
  }, [restaurantConfig]);



  // On mount: clean up stale entries in localStorage so they don't grow forever
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getTenantScopedKey('captain_recently_terminated'));
      const map = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      let changed = false;
      Object.keys(map).forEach(k => { if (now - map[k] > 30000) { delete map[k]; changed = true; } });
      if (changed) localStorage.setItem(getTenantScopedKey('captain_recently_terminated'), JSON.stringify(map));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Assignment tracking state

  const [activeView, setActiveView] = useState(() => localStorage.getItem(getTenantScopedKey('captain_active_tab')) || 'assignment');

  // 8-section sidebar navigation: floor | orders | menu | transactions | reports | customers | staff | settings
  const [activeSection, setActiveSection] = useState(() => localStorage.getItem(getTenantScopedKey('captain_active_section')) || 'floor');

  const [tableSubCategory, setTableSubCategory] = useState(() => {

    const saved = localStorage.getItem(getTenantScopedKey('softshape_selected_subcategory'));

    if (saved) return saved;

    return '';

  });

  // P1-9: Ref to avoid re-subscribing socket listeners when tableSubCategory changes
  const tableSubCategoryRef = useRef(tableSubCategory);
  useEffect(() => { tableSubCategoryRef.current = tableSubCategory; }, [tableSubCategory]);
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




  const [expandedNoteItemId, setExpandedNoteItemId] = useState(null);
  const [inlineQtyItem, setInlineQtyItem] = useState(null);
  const isInstructionFocusedRef = useRef(false);

  // Sticky header scroll state
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  // Menu scroll state for collapsible sticky header
  const [isMenuScrolled, setIsMenuScrolled] = useState(false);
  const menuScrollRef = useRef(null);

  // Reset scroll state when switching tables or views so the menu header is always visible initially
  useEffect(() => {
    setIsMenuScrolled(false);
    setIsHeaderVisible(true);
    lastScrollYRef.current = 0;
    if (menuScrollRef.current) {
      menuScrollRef.current.scrollTop = 0;
    }
  }, [activeTableId, view]);

  // Cancel-item state

  const [cancelLoading,  setCancelLoading]  = useState({});

  const [cancelConfirm,  setCancelConfirm]  = useState({});

  // KOT dispatch error state — null when no error, or { message, retryItems } when DB write fails.

  // retryItems is the pre-cleared currentSessionItems snapshot so the captain can retry

  // without re-selecting anything.

  const [kotError, setKotError] = useState(null);
  const retryRequestIdRef = useRef(null);

  const [sendingKOT, setSendingKOT] = useState(false);

  const [showKotConfirm, setShowKotConfirm] = useState(false);
  const [showLiquorQtyPicker, setShowLiquorQtyPicker] = useState(false);
  const [liquorQtyItem, setLiquorQtyItem] = useState(null);



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

    localStorage.setItem(getTenantScopedKey('captain_active_section'), activeSection);

    localStorage.setItem(getTenantScopedKey('softshape_captain_table_filter'), tableFilter);

  }, [view, activeTableId, searchQuery, activeCategory, activeDiet, isCartMinimized, tableSubCategory, selectedPDRRoom, activeBarMenu, tableCarts, activeView, tableFilter, activeSection]);



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

    return activeCalls.filter(c => c.status === 'pending');

  }, [activeCalls]);



  const loadCaptainRevenue = useCallback(async (captainId) => {

    if (!captainId) return;

    try {
      const todayISO = new Date().toISOString().slice(0, 10);
      const res = await fetch(`${API_BASE}/api/reports/captain-performance?startDate=${todayISO}&endDate=${todayISO}`, {
        headers: { ...getAuthHeaders() },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const data = await res.json();
      const captain = (data.captains || []).find(c => c.id === captainId);
      setTodayRevenue(captain ? Math.round(captain.sales) : 0);
    } catch (err) {
      console.warn('[CaptainApp] Failed to load captain revenue:', err.message);
    }

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
  const activeTables = useMemo(() => {
    if (activeOutlet === 'bar') return barTables;
    if (activeOutlet === 'restaurant') return tables;
    // 'both' — combine and deduplicate by backendId
    const combined = [...barTables, ...tables];
    const seen = new Set();
    return combined.filter(t => {
      const key = t.backendId || t.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeOutlet, barTables, tables]);

  const setActiveTables = (activeOutlet === 'bar' || activeOutlet === 'both') ? setBarTables : setTables;

  // Ref mirror so async socket handlers read the latest tables without stale closure
  const activeTablesRef = useRef(activeTables);
  useEffect(() => { activeTablesRef.current = activeTables; }, [activeTables]);

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
    const sourceMenu = (activeOutlet === 'bar' || activeOutlet === 'both') ? barMenu : restaurantMenu;
    const unavailableCount = sourceMenu.filter(item => item.isAvailable === false).length;
    let base = sourceMenu.filter(item => item.isAvailable !== false);

    // Resolve currentVenueId from the active table's section → venue relationship
    let currentVenueId = activeTable?.section?.venueId || activeTable?.section?.venue?.id || null;
    if (!currentVenueId) {
      // Look up section from fetchedSections by subcategory
      const section = fetchedSections.find(s => {
        const sourceKey = s.sectionTag?.startsWith('venue-') ? s.sectionTag.slice(6) : s.sectionTag;
        return sourceKey === tableSubCategory || s.name === tableSubCategory;
      });
      if (section) {
        currentVenueId = section.venueId || section.venue?.id || null;
      }
      if (!currentVenueId) {
        // Fallback: find by matching table section name
        for (const t of activeTables) {
          const tSection = fetchedSections.find(s => s.name === (t.sectionName || t.section?.name));
          if (tSection) {
            const sourceKey = tSection.sectionTag?.startsWith('venue-') ? tSection.sectionTag.slice(6) : tSection.sectionTag;
            if (sourceKey === tableSubCategory) {
              currentVenueId = tSection.venueId || tSection.venue?.id || null;
              break;
            }
          }
        }
      }
    }

    // Filter out items disabled for this venue
    if (currentVenueId) {
      const beforeVenueFilter = base.length;
      base = base.filter(item => item.venueAvailabilities?.[currentVenueId] !== false);
      const venueFilteredCount = beforeVenueFilter - base.length;
      if (venueFilteredCount > 0) {
        console.log(`[CaptainApp] Menu filter: ${unavailableCount} unavailable, ${venueFilteredCount} excluded by venueAvailabilities[venue=${currentVenueId}], ${base.length} remaining`);
      }
    }

    // Build venue price map from item.venuePrices keyed by venue ID
    const venueSpecificPrices = {};
    if (currentVenueId) {
      for (const item of base) {
        const vp = item.venuePrices?.[currentVenueId];
        if (vp !== undefined) venueSpecificPrices[item.id] = vp;
      }
    }

    const isBarVenueContext = (activeOutlet === 'bar' || activeOutlet === 'both') && currentVenueId !== null;

    return base.map(item => {
      const overridePrice = venueSpecificPrices[item.id];
      let finalPrice;
      if (isBarVenueContext) {
        const isLiquor = (item.menuType || '').toUpperCase() === 'LIQUOR' || (item.menuType || '').toUpperCase() === 'BAR';
        if (isLiquor) {
          // Liquor/bar items: only show with explicit venue price > 0 (no base-price fallback)
          finalPrice = overridePrice !== undefined ? Number(overridePrice) : 0;
        } else {
          // Food items: fall back to base price if no venue-specific price is set
          finalPrice = overridePrice !== undefined ? Number(overridePrice) : Number(item.p || item.price || 0);
        }
      } else {
        finalPrice = overridePrice !== undefined
          ? Number(overridePrice)
          : Number(item.p || item.price || 0);
      }
      const remappedVariants = item.variants?.map((v, idx) => {
        const variantOverride = venueSpecificPrices[`${item.id}_variant_${v.id}`];
        if (variantOverride !== undefined) {
          return { ...v, price: Number(variantOverride) };
        }
        // Apply item-level venue price override to the default (or first) variant
        if (overridePrice !== undefined && (v.isDefault || (idx === 0 && !item.variants.some(vv => vv.isDefault)))) {
          return { ...v, price: Number(overridePrice) };
        }
        return v;
      }) ?? item.variants;

      return { ...item, p: finalPrice, variants: remappedVariants };
    }).filter(item => {
      if (isBarVenueContext) {
        return Number(item.p) > 0;
      }
      return true;
    });
  }, [activeOutlet, barMenu, restaurantMenu, tableSubCategory, activeTable, activeTables, fetchedSections]);



  const todaySpecials = useMemo(() => {
    const allItems = [...barMenu, ...restaurantMenu];
    const now = Date.now();
    return allItems.filter(
      i => i.isSpecial && i.active && (!i.expiresAt || now < i.expiresAt) && (i.specialChannel === 'CAPTAIN' || i.specialChannel === 'BOTH')
    );
  }, [barMenu, restaurantMenu]);

  const categories = useMemo(() => {
    const cats = new Set(outletFilteredMenuItems.map(i => i.c));
    const hasSpecials = todaySpecials.length > 0;
    return ['All', ...(hasSpecials ? ['Today Special'] : []), ...Array.from(cats)].filter(Boolean);
  }, [outletFilteredMenuItems, todaySpecials]);

  // If Today Special was selected but specials are no longer available, reset to All
  useEffect(() => {
    if (activeCategory === 'Today Special' && todaySpecials.length === 0) {
      setActiveCategory('All');
    }
  }, [activeCategory, todaySpecials]);



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

      return calculateOrderTotal(currentSessionItems, 0, restaurantConfig);

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



    return calculateOrderTotal([...itemsForTotal, ...currentSessionItems], 0, restaurantConfig);

  }, [activeTable, currentSessionItems, restaurantConfig]);

  const billableItems = useMemo(() => getBillableItems(activeTable) || [], [activeTable]);



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
    if (!tableSubCategory) return activeTables;

    // Find the fetched section that matches tableSubCategory
    // Try: stripped sectionTag, raw sectionTag, or section name
    const matchedSection = fetchedSections.find(s => {
      const rawTag = s.sectionTag;
      const strippedTag = rawTag?.startsWith('venue-') ? rawTag.slice(6) : rawTag;
      return strippedTag === tableSubCategory ||
             rawTag === tableSubCategory ||
             s.name === tableSubCategory;
    });

    if (!matchedSection) {
      console.warn('[displayTables] No section found for tableSubCategory:', tableSubCategory,
        '| Available sections:', fetchedSections.map(s => ({ name: s.name, tag: s.sectionTag, id: s.id })));
      return activeTables;
    }

    // Filter tables by sectionId (primary) or section name (fallback) — same logic as VenueSectionView
    const targetId = matchedSection.id;
    const targetName = (matchedSection.name || '').trim().toLowerCase();

    const filtered = activeTables.filter(t => {
      // Primary: match by sectionId
      if (targetId && (t.sectionId === targetId || t.section?.id === targetId)) return true;
      // Fallback: match by section name
      const tName = (t.sectionName || t.section?.name || '').trim().toLowerCase();
      if (tName && tName === targetName) return true;
      // Loose match for longer names
      if (tName && targetName.length > 4 && tName.includes(targetName)) return true;
      if (tName && tName.length > 4 && targetName.includes(tName)) return true;
      return false;
    });

    return filtered;
  }, [activeTables, tableSubCategory, fetchedSections]);



  // Filtered tables based on filter selection

  const filteredTables = useMemo(() => {

    let baseTables = displayTables;

    if (tableFilter === 'all') return baseTables;

    return baseTables.filter(t => t.captainId === currentCaptain?.id);

  }, [displayTables, tableFilter, currentCaptain?.id]);



  const freeCount = useMemo(() => displayTables.filter(t => t.status === TABLE_STATUS.FREE).length, [displayTables]);

  const busyCount = useMemo(() => displayTables.filter(t => t.status !== TABLE_STATUS.FREE).length, [displayTables]);



  const myTablesCount = useMemo(() => {

    return displayTables.filter(t => t.captainId === currentCaptain?.id).length;

  }, [displayTables, currentCaptain?.id]);



  const allTablesCount = useMemo(() => displayTables.length, [displayTables]);



  const filteredMenu = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    const isTodaySpecialCategory = activeCategory === 'Today Special';
    if (!q) {
      // No search — apply category and diet filters normally
      if (isTodaySpecialCategory) {
        return todaySpecials.filter(item => activeDiet === 'All' || item.t === activeDiet);
      }
      return outletFilteredMenuItems.filter(item => {
        if (activeCategory !== 'All' && item.c !== activeCategory) return false;
        if (activeDiet !== 'All' && item.t !== activeDiet) return false;
        return true;
      });
    }

    if (isTodaySpecialCategory) {
      return filterMenuItems(todaySpecials, { query: searchQuery, category: 'All', diet: activeDiet });
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
  }, [searchQuery, activeCategory, activeDiet, outletFilteredMenuItems, todaySpecials]);



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



  // ── Visibility/Focus resync ──────────────────────────────────────────────────
  // On mobile Chrome, backgrounded tabs get their socket silently suspended and
  // miss table:updated / order:created events. When the tab returns to foreground,
  // force a full table refetch and socket reconnect to recover missed state before
  // the captain can send a KOT (which would otherwise hit a stale activeOrderIdRef).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      console.log('[CaptainApp] Tab foregrounded — forcing table resync');
      const socket = getSocket();
      if (socket && !socket.connected) {
        console.log('[CaptainApp] Socket stale — reconnecting');
        socket.connect();
      }
      refetchRestaurantTables();
      refetchBarTables();
      // Also refresh menu to catch any specials pushed while socket was suspended
      refreshMenu();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [refetchRestaurantTables, refetchBarTables, refreshMenu]);

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
      // Issue 17: Clear billing-requested freeze
      billRequestedTableIdsRef.current.delete(tableId);
      // Mark table as recently terminated so stale socket events cannot revive it
      terminatedTableIdsRef.current.add(tableId);
      recentlyTerminatedRef.current[tableId] = Date.now();
      try {
        localStorage.setItem(getTenantScopedKey('captain_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
      } catch {}
      setTimeout(() => terminatedTableIdsRef.current.delete(tableId), 5000);
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
        setActiveSection('floor');
        addNotification('Table settled by cashier', 'success');
      }
    };
    window.addEventListener('table:settled', onTableSettled);

    // Bug G: Reset stuck KOT submission state on unhandled promise rejection
    const onUnhandledRejection = () => {
      if (isSubmittingKotRef.current) {
        console.warn('[CaptainApp] Resetting stuck KOT submission due to unhandled rejection');
        isSubmittingKotRef.current = false;
        setSendingKOT(false);
      }
    };
    window.addEventListener('app:unhandled-rejection', onUnhandledRejection);

    if (!activeRestaurantId) return;

    const socket = getSocket();

    // Join the active outlet room; also join venue-001 whenever captain is on a
    // venue subcategory so real-time updates reach all sections.
    socket.emit('join', activeRestaurantId);

    const onConnect = () => {
      socket.emit('join', activeRestaurantId);
      // Fetch latest printer mapping on (re)connect — ensures captain inherits admin printer settings
      fetch(apiUrl('/api/print/agent-endpoint'), { headers: getAuthHeaders(), signal: AbortSignal.timeout(3000) })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.printerMapping && Object.keys(data.printerMapping).length > 0) {
            setLocalPrinterMapping(data.printerMapping).catch(() => {});
            console.log('[CaptainApp] Printer mapping synced on connect');
          }
        })
        .catch(() => {});
    };
    socket.on('connect', onConnect);

    // Listen for socket menu update events from admin panel
    const onMenuItemUpdated = (payload) => {
      console.log('[CaptainApp] Received menu-item-updated:', payload);
      window.dispatchEvent(new CustomEvent('menu-item-updated', { detail: payload }));
    };
    socket.on('menu-item-updated', onMenuItemUpdated);

    // Sync printer config when admin updates printer settings
    const onPrinterConfigUpdated = (payload) => {
      if (payload?.printerMapping && Object.keys(payload.printerMapping).length > 0) {
        setLocalPrinterMapping(payload.printerMapping).catch(() => {});
        console.log('[CaptainApp] Printer mapping updated from admin');
      }
    };
    socket.on('printer:config-updated', onPrinterConfigUpdated);

    const onOrderPaid = (payload) => {
      const tableId = payload?.tableId;
      if (!tableId) return;

      // Issue 17: Clear billing-requested freeze
      billRequestedTableIdsRef.current.delete(tableId);

      // Mark table as recently terminated so stale socket events (order:updated,
      // table:updated from before settlement) cannot revive it and cause ghost items.
      // Same pattern as cashier — 5s grace window.
      terminatedTableIdsRef.current.add(tableId);
      recentlyTerminatedRef.current[tableId] = Date.now();
      try {
        localStorage.setItem(getTenantScopedKey('captain_recently_terminated'), JSON.stringify(recentlyTerminatedRef.current));
      } catch {}
      setTimeout(() => terminatedTableIdsRef.current.delete(tableId), 5000);

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
      // Server is authoritative — use incoming directly
      return incoming;
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

    // Convert DB kots relation (from tableInclude) to frontend kotHistory format
    // DB KotItem has: { id, orderItemId, menuItemId, name, quantity, price, notes, status }
    // Frontend expects: { id, n, p, q, s, orderItemId, notes }
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

    const onTableUpdated = ({ table, requestId } = {}) => {
      if (!table?.id) return;
      if (table.restaurantId && table.restaurantId !== activeRestaurantId) return;
      // Bug A: Skip echoes from our own KOT submission
      if (requestId && processedSocketRequestIds.current.has(requestId)) return;
      // Guard: block stale non-Free events for recently terminated tables
      if (terminatedTableIdsRef.current.has(table.id)) {
        const incomingFree = table.status === 'AVAILABLE' || table.status === 'Free' || table.workflowStatus === 'Free';
        if (!incomingFree) return;
      }
      const termTsTbl = recentlyTerminatedRef.current[table.id];
      if (termTsTbl && Date.now() - termTsTbl < 5000) {
        const incomingFree = table.status === 'AVAILABLE' || table.status === 'Free' || table.workflowStatus === 'Free';
        if (!incomingFree) return;
      }
      const applyUpdate = (prev) => prev.map(t => {
        if (t.backendId !== table.id && t.id !== table.id) return t;
        // Guard: skip active table during KOT submission to prevent duplicate items in display
        if (isSubmittingKotRef.current && String(t.id) === String(activeTableIdRef.current)) return t;

        // Issue 14: Map backend status to frontend status (same as cashier)
        const incomingStatus = table.workflowStatus || (table.status !== undefined ? toFrontendTableStatus(table.status) : t.status);
        const incomingIsAvailable = incomingStatus === 'Free' || incomingStatus === 'AVAILABLE' || table.status === 'AVAILABLE';
        if (incomingIsAvailable && t.activeOrder) {
          const incomingHasLiveData = Array.isArray(table.orders) && table.orders.length > 0 && table.orders[0]?.items?.length > 0;
          const incomingHasBill = (table.currentBill ?? 0) > 0;
          if (incomingHasLiveData || incomingHasBill) {
            console.warn('[CaptainApp] Skipping stale AVAILABLE event — table still has data', t.number);
            return t;
          }
        }

        // Issue 16: Protect "Waiting Bill" status from being downgraded by stale events
        // (same pattern as cashier — once bill is requested, hold until Free/settled)
        const isWaitingBill = t.status === 'Waiting Bill' || t.workflowStatus === 'Waiting Bill';
        const protectedStatus = isWaitingBill && incomingStatus !== 'Free' && incomingStatus !== 'AVAILABLE'
          ? 'Waiting Bill'
          : incomingStatus;

        const incomingOrder = (table.orders?.[0] && table.orders[0].tableId === table.id) ? table.orders[0] : (table.activeOrder || null);
        const isTableFree = incomingStatus === 'Free' || incomingStatus === 'AVAILABLE' || table.workflowStatus === 'Free' || table.status === 'AVAILABLE';
        // Server is now authoritative — directly use its items and kots (no merge)
        // When table is Free (settled), clear items and activeOrder to prevent ghost items
        const serverItems = isTableFree ? [] : (incomingOrder?.items ?? (t.activeOrder?.items || []));
        // Preserve existing kotHistory when incoming event has no kots data (partial update)
        const serverKots = isTableFree ? [] : ((Array.isArray(table.kots) && table.kots.length > 0) ? normalizeKots(table.kots) : (Array.isArray(table.kotHistory) && table.kotHistory.length > 0 ? table.kotHistory : (t.kotHistory || [])));
        return {
          ...t,
          status: protectedStatus,
          workflowStatus: protectedStatus,
          currentBill: isTableFree ? 0 : (table.currentBill ?? t.currentBill),
          activeOrder: isTableFree
            ? null
            : (incomingOrder
              ? { ...(t.activeOrder || {}), ...incomingOrder, items: serverItems }
              : t.activeOrder),
          kotHistory: serverKots,
        };
      });
      setActiveTables(applyUpdate);
    };
    socket.on('table:updated', onTableUpdated);

    const onOrderUpdated = (payload) => {
      const order = payload?.order || payload;
      if (!order?.tableId) return;
      // Bug A: Skip echoes from our own KOT submission
      if (payload?.requestId && processedSocketRequestIds.current.has(payload.requestId)) return;
      // Guard: block stale events for recently terminated tables
      if (terminatedTableIdsRef.current.has(order.tableId)) return;
      const termTsUpd = recentlyTerminatedRef.current[order.tableId];
      if (termTsUpd && Date.now() - termTsUpd < 5000) return;
      // Issue 17: Freeze items once billing is requested — stale order:updated
      // events must not change items while the cashier is processing the bill.
      if (billRequestedTableIdsRef.current.has(order.tableId)) return;
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId !== order.tableId) return t;
        // Guard: skip active table during KOT submission to prevent duplicate items in display
        if (isSubmittingKotRef.current && String(t.id) === String(activeTableIdRef.current)) return t;
        // Server is authoritative — directly use incoming items (no merge)
        const serverItems = order.items || (t.activeOrder?.items || []);
        // Skip stale order:updated with no items for settled/Free tables to prevent ghost items
        if ((t.status === 'Free' || t.workflowStatus === 'Free' || t.dbStatus === 'AVAILABLE') && serverItems.length === 0) {
          console.warn('[CaptainApp] Ignoring stale order:updated (no items) for settled table', t.number);
          return t;
        }
        // Preserve existing kotHistory when incoming event has no kots data (partial update)
        const incomingKotArr = Array.isArray(order.kotHistory) && order.kotHistory.length > 0 ? order.kotHistory : ((Array.isArray(order.kots) && order.kots.length > 0) ? normalizeKots(order.kots) : (t.kotHistory || []));
        return { ...t, activeOrder: { ...(t.activeOrder || {}), ...order, items: serverItems }, kotHistory: incomingKotArr };
      });
      setActiveTables(updateTables);
    };
    socket.on('order:updated', onOrderUpdated);

    const onOrderCreated = (payload) => {
      const order = payload?.order || payload;
      if (!order?.tableId) return;
      // Bug A: Skip echoes from our own KOT submission
      if (payload?.requestId && processedSocketRequestIds.current.has(payload.requestId)) return;
      // Guard: block stale events for recently terminated tables
      if (terminatedTableIdsRef.current.has(order.tableId)) return;
      const termTsCre = recentlyTerminatedRef.current[order.tableId];
      if (termTsCre && Date.now() - termTsCre < 5000) return;
      // Issue 17: Freeze items once billing is requested
      if (billRequestedTableIdsRef.current.has(order.tableId)) return;
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId !== order.tableId) return t;
        // Guard: skip active table during KOT submission to prevent duplicate items in display
        if (isSubmittingKotRef.current && String(t.id) === String(activeTableIdRef.current)) return t;
        // Server is authoritative — directly use incoming items (no merge)
        const serverItems = order.items || [];
        // Skip stale order:created with no items for settled/Free tables
        if ((t.status === 'Free' || t.workflowStatus === 'Free' || t.dbStatus === 'AVAILABLE') && serverItems.length === 0) {
          console.warn('[CaptainApp] Ignoring stale order:created (no items) for settled table', t.number);
          return t;
        }
        // Preserve existing kotHistory when incoming event has no kots data (partial update)
        const incomingKotArr = Array.isArray(order.kotHistory) && order.kotHistory.length > 0 ? order.kotHistory
          : ((Array.isArray(order.kots) && order.kots.length > 0) ? normalizeKots(order.kots) : (t.kotHistory || []));
        return {
          ...t,
          activeOrder: { ...order, items: serverItems },
          kotHistory: incomingKotArr,
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
      // Issue 17: Mark this table as billing-requested so stale order events
      // don't change items while the bill is being processed by the cashier.
      billRequestedTableIdsRef.current.add(table.id);
      const updateTables = (prev) => prev.map(t =>
        t.backendId === table.id ? { ...t, status: 'Waiting Bill', workflowStatus: 'Waiting Bill' } : t
      );
      setActiveTables(updateTables);
    };
    socket.on('billing:requested', onBillingRequested);

    socket.on('order:paid', onOrderPaid);

    // Real-time table swap and item transfer sync (same events as cashier)
    const onTableSwapped = (payload) => {
      const { sourceTableId, targetTableId, sourceTable: rawSource, targetTable: rawTarget } = payload;
      // Issue 18: Use activeTablesRef.current instead of activeTables closure
      // so we always read the latest table state (avoids stale data in long-lived useEffect)
      const allTables = activeTablesRef.current;
      const existingSource = allTables.find(t => t.backendId === sourceTableId) || null;
      const existingTarget = allTables.find(t => t.backendId === targetTableId) || null;
      const mappedSource = mapRealtimeTablePayload(rawSource, existingSource);
      const mappedTarget = mapRealtimeTablePayload(rawTarget, existingTarget);
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId === sourceTableId) return mappedSource || t;
        if (t.backendId === targetTableId) return mappedTarget || t;
        return t;
      });
      setActiveTables(updateTables);
      // If captain had the source table open, switch selection to the new table
      if (activeTableIdRef.current && String(sourceTableId) === String(activeTableIdRef.current)) {
        if (mappedTarget && ((mappedTarget.kotHistory?.length > 0) || mappedTarget.activeOrder || (mappedTarget.currentBill > 0))) {
          setActiveTableId(String(mappedTarget.id));
          setView('session');
          setActiveSection('menu');
          addNotification('Table Moved', `Session moved to Table ${rawTarget?.number ?? ''}`, 'success');
        } else {
          setActiveTableId(null);
          setView('tables');
          setActiveSection('floor');
          addNotification('Table Moved', `Session moved to Table ${rawTarget?.number ?? ''}`, 'success');
        }
      }
    };
    socket.on('table:swapped', onTableSwapped);

    const onTableItemsTransferred = (payload) => {
      const { sourceTableId, targetTableId, sourceTable, targetTable } = payload;
      // Issue 18: Use activeTablesRef.current instead of activeTables closure
      const allTables = activeTablesRef.current;
      const existingSource = allTables.find(t => t.backendId === sourceTableId) || null;
      const existingTarget = allTables.find(t => t.backendId === targetTableId) || null;
      const mappedSource = mapRealtimeTablePayload(sourceTable, existingSource);
      const mappedTarget = mapRealtimeTablePayload(targetTable, existingTarget);
      const updateTables = (prev) => prev.map(t => {
        if (t.backendId === sourceTableId) return mappedSource || t;
        if (t.backendId === targetTableId) return mappedTarget || t;
        return t;
      });
      setActiveTables(updateTables);
    };
    socket.on('table:items-transferred', onTableItemsTransferred);

    return () => {
      window.removeEventListener('softshape_menu_updated', onMenuUpdated);
      window.removeEventListener('table:settled', onTableSettled);
      window.removeEventListener('app:unhandled-rejection', onUnhandledRejection);
      socket.off('connect', onConnect);
      socket.off('menu-item-updated', onMenuItemUpdated);
      socket.off('printer:config-updated', onPrinterConfigUpdated);
      socket.off('table:updated', onTableUpdated);
      socket.off('order:updated', onOrderUpdated);
      socket.off('order:created', onOrderCreated);
      socket.off('billing:requested', onBillingRequested);
      socket.off('order:paid', onOrderPaid);
      socket.off('table:swapped', onTableSwapped);
      socket.off('table:items-transferred', onTableItemsTransferred);
      socket.emit('leave', activeRestaurantId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurantId]);



  // Realtime assignment + revenue sync

  useEffect(() => {

    if (!currentCaptain?.id) return;

    loadAssignment(currentCaptain.id);

    loadCaptainRevenue(currentCaptain.id);



    // Poll every 3 minutes so captain sees new assignments without refresh
    // Socket.IO pushes real-time updates; this is just a safety net

    const interval = setInterval(() => {

      loadAssignment(currentCaptain.id);

      loadCaptainRevenue(currentCaptain.id);

    }, 180000);



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
      const sectionOutlet = isBarLikeVenue(s.venue?.venueType) ? 'bar' : 'restaurant';
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
    setPreviewItem(null);
    setEditingItem(null);

    setActiveTableId(table.id);
    lastConfirmedItemsRef.current = getTableItems(table); // seed immediately from live table
    setView('session');
    setActiveSection('menu');
    setIsCartMinimized(window.innerWidth < 1024);
  };



  // INVARIANT: Adding items to the cart NEVER changes table status or persists anything to backend.

  // Table status only changes to PREPARING when a KOT is successfully sent (see sendIncrementalKOT).

  // This prevents the cashier from seeing a table as occupied before any order is confirmed.

  const addItemToSession = (item, quantity = 1) => {
    if (!activeTableId) {
      console.warn('[CaptainApp] addItemToSession blocked: no activeTableId. Item:', item?.n, 'view:', view);
      return; // no active table, do nothing
    }
    const itemKey = String(item.id || item.n || '');
    const now = Date.now();
    const lastAdd = addItemCooldownRef.current[itemKey] || 0;
    if (now - lastAdd < 900) return; // 900ms cooldown per item
    addItemCooldownRef.current[itemKey] = now;

    const finalPrice = item.p;
    const finalName = item.n;



    setTableCarts(prev => {

      const currentCart = prev[activeTableId] ?? [];

      const existing = currentCart.find(i => i.n === finalName);

      let updatedCart;

      if (existing) {

        updatedCart = currentCart.map(i => i.n === finalName ? { ...i, q: i.q + quantity } : i);

      } else {

        updatedCart = [...currentCart, { ...item, n: finalName, p: finalPrice, q: quantity, notes: null, s: 'Pending', menuType: item.menuType || 'FOOD' }];

      }

      return { ...prev, [activeTableId]: updatedCart };

    });

    addNotification(`${finalName} added`, 'success');

    setSearchQuery('');

  };



  const handleItemClick = (e, item) => {
    e.stopPropagation();
    console.log('[CaptainApp] handleItemClick:', item?.n, 'activeTableId:', activeTableId, 'view:', view);

    // Show typeable quantity picker for every item
    setLiquorQtyItem(item);
    setShowLiquorQtyPicker(true);
  };

  const handleQtySelect = (qty) => {
    if (!liquorQtyItem) return;
    addItemToSession(liquorQtyItem, qty);
    setShowLiquorQtyPicker(false);
    setLiquorQtyItem(null);
  };

  const cancelSession = () => {

    setTableCarts(prev => ({ ...prev, [activeTableId]: [] }));

    lastConfirmedItemsRef.current = [];

    activeOrderIdRef.current = null;

    kotRequestIdRef.current = null;

    if (activeTable && (!activeTable.kotHistory || activeTable.kotHistory.length === 0) && (!activeTable.activeOrder || (activeTable.activeOrder.items || []).length === 0)) {
      setActiveTables(currentTables => currentTables.map(t => {
        if (t.id === activeTable.id) {

          return { ...t, status: TABLE_STATUS.FREE, captainId: null };

        }

        return t;

      }));

    }

    setView('tables');
    setActiveSection('floor');

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

  const handleItemClickRef = useRef(handleItemClick);
  handleItemClickRef.current = handleItemClick;
  const updateDraftQtyRef = useRef(updateDraftQty);
  updateDraftQtyRef.current = updateDraftQty;

  const stableUpdateDraftQty = useCallback((name, delta) => {
    updateDraftQtyRef.current(name, delta);
  }, []);

  const stableCardOnAdd = useCallback((e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    handleItemClickRef.current(e || { stopPropagation: () => {} }, item);
  }, []);



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
      setActiveSection('floor');
    }
  }, [view, activeTableId]);

  const sendIncrementalKOT = async (retryRequestId = null) => {
    // Issue 9: Don't clear previous print timeouts here — each KOT's timeout
    // is self-managed via a local closure variable. Clearing the shared ref
    // would cancel the WRONG timeout if a second KOT was sent before the first
    // one's 30s print ack window expired.
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

    // Reuse the same requestId on retry so the backend's idempotency check
    // finds the existing committed order and returns it instead of throwing
    // "Duplicate KOT detected". Generating a new requestId on retry bypasses
    // the lastRequestId/ProcessedRequest idempotency and hits the Redis
    // item-signature dedup, which presents a committed order as a failure.
    const requestId = retryRequestId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36));

    kotRequestIdRef.current = requestId;

    // Bug A: Register this requestId so socket echoes from our own KOT submission are skipped
    processedSocketRequestIds.current.add(requestId);
    // Clean up after 60s to prevent unbounded growth (same as cashier)
    setTimeout(() => { processedSocketRequestIds.current.delete(requestId); }, 60000);

    // Snapshot items before the API call — needed for retry in the catch block.
    // Must be declared outside the try block so it's accessible in catch.
    var retrySnapshot = [...currentSessionItems];

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

      const newTotalBill = calculateSessionBill(activeTable, currentSessionItems, restaurantConfig).grandTotal;



      setExpandedNoteItemId(null);

      // Clear error state

      setKotError(null);



      // 1. Reserve KOT number first (for local printing with real number)
      let savedOrder;
      let realKotId;
      const orderRestaurantId = activeRestaurantId;
      let preReservedKotNumber = null;
      let localPrinted = false;
      try {
        const reserved = await reserveKotNumber(requestId);
        preReservedKotNumber = reserved?.kotNumber ?? null;
      } catch (reserveErr) {
        console.warn('[KOT] Reserve KOT number failed, falling back to cloud-only:', reserveErr.message);
      }

      // 2. If we have a reserved KOT number, generate ESC/POS and fire local print
      //    and the API call CONCURRENTLY instead of sequentially.
      //    Shared eventIds ensure the Print Agent deduplicates even if the backend
      //    also emits via socket (localPrinted is false since we don't wait for print).
      let kotEventIds = [];
      if (preReservedKotNumber != null) {
        // Bug B: Guard against printing the same KOT number twice
        if (_printedKotNumbers.current.has(preReservedKotNumber)) {
          console.warn(`[KOT] KOT #${preReservedKotNumber} already printed in this session — skipping local print`);
          localPrinted = true;
        } else {
        const kotOrderData = {
          tableNumber: activeTable?.number ?? activeTable?.id,
          orderId: existingOrderId || 'pending',
          items: itemsForPrint.map(i => ({
            name: i.n || i.name,
            quantity: i.q ?? i.quantity ?? 1,
            price: Number(i.p ?? i.price ?? 0),
            notes: i.notes || null,
            type: (i.menuType || 'FOOD').toUpperCase() === 'LIQUOR' ? 'liquor' : 'food',
          })),
          kotId: String(preReservedKotNumber),
          sectionName: activeTable?.section?.name || 'Main Hall',
          captainName: currentCaptain?.name || 'Captain',
          sectionTag: activeTable?.sectionTag || undefined,
          restaurantName: restaurant?.name || undefined,
        };

        // ── R2: Try Output Intent API first (runtime handles printing) ──────────
        // Send PRINT_KOT and PRINT_LIQUOR_KOT intents to the runtime. If both
        // succeed, the runtime rendered + queued + dispatched the prints — no
        // need for local print or localPrinted/kotEventIds. If either fails,
        // fall back to the existing local print flow.
        const hasFoodItems = itemsForPrint.some(i => (i.menuType || 'FOOD').toUpperCase() !== 'LIQUOR');
        const hasLiquorItems = itemsForPrint.some(i => (i.menuType || 'FOOD').toUpperCase() === 'LIQUOR');
        let intentSucceeded = false;
        try {
          const intentPromises = [];
          if (hasFoodItems) {
            const foodIntentId = generateIntentId();
            intentPromises.push(
              sendOutputIntent({
                type: 'OUTPUT',
                intentId: foodIntentId,
                intent: 'PRINT_KOT',
                payload: { ...kotOrderData, requestId },
                priority: 'CRITICAL',
              }).then(() => ({ intentId: foodIntentId, ok: true }))
                .catch(err => { console.warn('[KOT] sendOutputIntent PRINT_KOT failed:', err.message); return { intentId: foodIntentId, ok: false }; })
            );
          }
          if (hasLiquorItems) {
            const liquorIntentId = generateIntentId();
            intentPromises.push(
              sendOutputIntent({
                type: 'OUTPUT',
                intentId: liquorIntentId,
                intent: 'PRINT_LIQUOR_KOT',
                payload: { ...kotOrderData, requestId },
                priority: 'CRITICAL',
              }).then(() => ({ intentId: liquorIntentId, ok: true }))
                .catch(err => { console.warn('[KOT] sendOutputIntent PRINT_LIQUOR_KOT failed:', err.message); return { intentId: liquorIntentId, ok: false }; })
            );
          }
          if (intentPromises.length > 0) {
            const intentResults = await Promise.allSettled(intentPromises);
            const allOk = intentResults.every(r => r.status === 'fulfilled' && r.value?.ok);
            if (allOk) {
              intentSucceeded = true;
              localPrinted = true;
              kotEventIds = intentResults.map(r => r.value?.intentId).filter(Boolean);
              markKotNumberPrinted(preReservedKotNumber);
              console.log(`[KOT] Output intent succeeded for KOT #${preReservedKotNumber} — runtime handled printing`);
            }
          }
        } catch (intentErr) {
          console.warn('[KOT] Output intent path failed, falling back to local print:', intentErr.message);
        }

        // ── Fallback: local print path (existing flow) ──────────────────────────
        if (!intentSucceeded) {
        const foodEscpos = buildFoodKOT(kotOrderData);
        const liquorEscpos = buildLiquorKOT(kotOrderData);

        // Generate shared eventIds that are passed to both local print and backend.
        // If local print succeeds with these eventIds, and the backend also emits
        // via socket (because localPrinted is false), the Print Agent's seenEventIds
        // dedup will catch it — no duplicate print.
        const foodEventId = `${requestId}-food`;
        const liquorEventId = `${requestId}-liquor`;
        kotEventIds = [];
        if (foodEscpos.length > 0) kotEventIds.push(foodEventId);
        if (liquorEscpos.length > 0) kotEventIds.push(liquorEventId);

        // Bug D: Await local print FIRST, then pass the correct localPrinted flag to the API.
        // This matches the cashier's approach and eliminates dependency on eventId dedup
        // for the common case (local print succeeds → backend skips socket emission).
        const localPrintPromises = [];
        if (foodEscpos.length > 0) {
          localPrintPromises.push(
            printLocal({
              type: 'KOT',
              escposData: foodEscpos,
              eventId: foodEventId,
              data: kotOrderData,
            }).catch(err => { console.warn('[KOT] Local food print failed:', err.message); return { printed: false }; })
          );
        }
        if (liquorEscpos.length > 0) {
          localPrintPromises.push(
            printLocal({
              type: 'BAR_KOT',
              escposData: liquorEscpos,
              eventId: liquorEventId,
              data: kotOrderData,
            }).catch(err => { console.warn('[KOT] Local liquor print failed:', err.message); return { printed: false }; })
          );
        }

        const printResults = await Promise.allSettled(localPrintPromises);
        // Fix: localPrinted must be true only if ALL prints succeeded.
        // Using .some() caused partial success (food OK, liquor failed) to
        // set localPrinted=true, which made the backend skip the print_job
        // socket emit — the failed print was silently lost.
        localPrinted = printResults.length > 0 && printResults.every(r => r.status === 'fulfilled' && r.value?.printed);
        if (localPrinted) {
          markKotNumberPrinted(preReservedKotNumber);
          console.log(`[KOT] Local print succeeded for KOT #${preReservedKotNumber}`);
        } else {
          // Filter kotEventIds to only those that actually printed, so the
          // backend's eventId dedup doesn't suppress re-emission of failed ones.
          const succeededEventIds = [];
          if (foodEscpos.length > 0 && printResults[0]?.status === 'fulfilled' && printResults[0]?.value?.printed) {
            succeededEventIds.push(foodEventId);
          }
          if (liquorEscpos.length > 0) {
            const liquorIdx = foodEscpos.length > 0 ? 1 : 0;
            if (printResults[liquorIdx]?.status === 'fulfilled' && printResults[liquorIdx]?.value?.printed) {
              succeededEventIds.push(liquorEventId);
            }
          }
          kotEventIds = succeededEventIds;
          console.log(`[KOT] Local print failed (partial or full) for KOT #${preReservedKotNumber} — backend will emit via socket for unprinted items`);
        }
        } // end fallback local print

        // Now call the API with the correct localPrinted flag.
        const activeTableEntry = activeTables.find(t => t.id === activeTableId || t.backendId === activeTableId);
        const lastUpdatedAt = activeTableEntry?.activeOrder?.updatedAt;

        try {
          if (existingOrderId) {
            const response = await updateOrderItems(existingOrderId, apiItems, requestId, currentCaptain?.name || undefined, false, null, lastUpdatedAt, 12000, preReservedKotNumber, activeTableId, localPrinted, kotEventIds);
            savedOrder = response;
          } else {
            try {
              savedOrder = await createOrder({
                tableId: activeTable?.backendId,
                tableNumber: activeTable?.number ?? activeTable?.id,
                restaurantId: orderRestaurantId,
                items: apiItems,
                requestId,
                captainName: currentCaptain?.name || undefined,
                sectionTag: activeTable?.sectionTag || undefined,
                preReservedKotNumber,
                localPrinted,
                kotEventIds,
              });
            } catch (createErr) {
              if (createErr.statusCode === 409 && createErr.existingOrderId) {
                console.warn('[KOT] Table already has an active order, retrying as update:', createErr.existingOrderId);
                activeOrderIdRef.current = createErr.existingOrderId;
                savedOrder = await updateOrderItems(createErr.existingOrderId, apiItems, requestId, currentCaptain?.name || undefined, false, null, lastUpdatedAt, 12000, preReservedKotNumber, activeTableId, localPrinted, kotEventIds);
              } else {
                throw createErr;
              }
            }
          }
        } catch (apiErr) {
          if (localPrinted) {
            console.warn('[KOT] API failed but local print succeeded — KOT was printed but not synced to server');
            addNotification(
              `KOT #${preReservedKotNumber} Printed ⚠ Sync Pending`,
              'KOT was printed to kitchen but server sync failed. Please retry to confirm.',
              'warning'
            );
            setTableCarts(prev => ({ ...prev, [activeTableId]: retrySnapshot }));
            retryRequestIdRef.current = requestId;
            setKotError({
              message: 'KOT printed but server sync failed — tap Retry to confirm.',
              retryItems: retrySnapshot,
            });
            return;
          }
          throw apiErr;
        }

        if (savedOrder?.order) savedOrder = savedOrder.order;
        const _kotHistory = savedOrder?.kotHistory;
        realKotId = Array.isArray(_kotHistory) && _kotHistory.length > 0
          ? _kotHistory[_kotHistory.length - 1].id
          : null;

        if (savedOrder?.id) activeOrderIdRef.current = savedOrder.id;
        if (!existingOrderId) {
          const _savedKotHistory = savedOrder?.kotHistory;
          realKotId = Array.isArray(_savedKotHistory) && _savedKotHistory.length > 0
            ? _savedKotHistory[_savedKotHistory.length - 1].id
            : null;
        }

        }

      } else {
        // Edge server is primary for ALL captains (PIN auth + JWT auth).
        // The edge server assigns KOT numbers, builds ESC/POS, and prints via
        // LAN WebSocket to the Tauri frontend. No local print needed — this
        // is the Petpooja Bridge Server pattern: one local path, ~15-40ms.
        //
        // Local print fallback only runs when:
        //   1. Edge server is unreachable (isEdgeAvailable() returned false)
        //   2. AND a local printer mapping exists (Print Agent on LAN)
        // This handles the rare case where the edge server is down but a
        // Print Agent is still reachable on the LAN.
        let edgeLocalPrinted = false;
        let edgeKotEventIds = [];
        let edgePreReservedKotNumber = null;
        const edgeAvailable = isEdgeLocalAuth() || await isEdgeAvailable();
        try {
          // Skip local print entirely when edge server is available — it handles printing.
          // Only attempt local print when edge is NOT available (fallback for cloud-only captains).
          if (!edgeAvailable) {
            const mapping = await getLocalPrinterMapping().catch(() => ({}));
          if (mapping && Object.keys(mapping).length > 0) {
            edgePreReservedKotNumber = await getNextOfflineKotNumber().catch(() => null);
            if (edgePreReservedKotNumber != null) {
              const edgeKotOrderData = {
                tableNumber: activeTable?.number ?? activeTable?.id,
                orderId: existingOrderId || 'pending',
                items: itemsForPrint.map(i => ({
                  name: i.n || i.name,
                  quantity: i.q ?? i.quantity ?? 1,
                  price: Number(i.p ?? i.price ?? 0),
                  notes: i.notes || null,
                  type: (i.menuType || 'FOOD').toUpperCase() === 'LIQUOR' ? 'liquor' : 'food',
                })),
                kotId: String(edgePreReservedKotNumber),
                sectionName: activeTable?.section?.name || 'Main Hall',
                captainName: currentCaptain?.name || 'Captain',
                sectionTag: activeTable?.sectionTag || undefined,
                restaurantName: restaurant?.name || undefined,
              };
              const edgeFoodEscpos = buildFoodKOT(edgeKotOrderData);
              const edgeLiquorEscpos = buildLiquorKOT(edgeKotOrderData);
              const edgeFoodEventId = `${requestId}-food`;
              const edgeLiquorEventId = `${requestId}-liquor`;
              edgeKotEventIds = [];
              if (edgeFoodEscpos.length > 0) edgeKotEventIds.push(edgeFoodEventId);
              if (edgeLiquorEscpos.length > 0) edgeKotEventIds.push(edgeLiquorEventId);
              const edgePrintPromises = [];
              if (edgeFoodEscpos.length > 0) {
                edgePrintPromises.push(
                  printLocal({ type: 'KOT', escposData: edgeFoodEscpos, eventId: edgeFoodEventId, data: edgeKotOrderData })
                    .catch(() => ({ printed: false }))
                );
              }
              if (edgeLiquorEscpos.length > 0) {
                edgePrintPromises.push(
                  printLocal({ type: 'BAR_KOT', escposData: edgeLiquorEscpos, eventId: edgeLiquorEventId, data: edgeKotOrderData })
                    .catch(() => ({ printed: false }))
                );
              }
              if (edgePrintPromises.length > 0) {
                const edgePrintResults = await Promise.allSettled(edgePrintPromises);
                edgeLocalPrinted = edgePrintResults.length > 0 && edgePrintResults.every(r => r.status === 'fulfilled' && r.value?.printed);
                localPrinted = edgeLocalPrinted;
                if (edgeLocalPrinted) {
                  markKotNumberPrinted(edgePreReservedKotNumber);
                  console.log(`[KOT] Edge fallback local print succeeded for KOT #${edgePreReservedKotNumber}`);
                } else {
                  // Filter edgeKotEventIds to only successful prints
                  const edgeSucceededEventIds = [];
                  if (edgeFoodEscpos.length > 0 && edgePrintResults[0]?.status === 'fulfilled' && edgePrintResults[0]?.value?.printed) {
                    edgeSucceededEventIds.push(edgeFoodEventId);
                  }
                  if (edgeLiquorEscpos.length > 0) {
                    const liquorIdx = edgeFoodEscpos.length > 0 ? 1 : 0;
                    if (edgePrintResults[liquorIdx]?.status === 'fulfilled' && edgePrintResults[liquorIdx]?.value?.printed) {
                      edgeSucceededEventIds.push(edgeLiquorEventId);
                    }
                  }
                  edgeKotEventIds = edgeSucceededEventIds;
                }
              }
            }
            }
          }
        } catch (edgePrintErr) {
          console.warn('[KOT] Edge local print fallback failed:', edgePrintErr.message);
        }

        // Send succeeded kotEventIds even on partial print failure so the edge
        // server can skip already-printed groups and only reprint failed ones.
        const edgeHasPrintedIds = edgeKotEventIds.length > 0;
        const edgeKotIdsToSend = edgeHasPrintedIds ? edgeKotEventIds : null;
        const edgeKotNumToSend = edgeHasPrintedIds ? edgePreReservedKotNumber : null;

        if (existingOrderId) {
          const activeTableEntry = activeTables.find(t => t.id === activeTableId || t.backendId === activeTableId);
          const lastUpdatedAt = activeTableEntry?.activeOrder?.updatedAt;
          const response = await updateOrderItems(existingOrderId, apiItems, requestId, currentCaptain?.name || undefined, false, null, lastUpdatedAt, 12000, edgeKotNumToSend, activeTableId, edgeHasPrintedIds, edgeKotIdsToSend);
          savedOrder = response?.order || response;
          const _kotHistory = response?.order?.kotHistory || response?.kotHistory;
          realKotId = Array.isArray(_kotHistory) && _kotHistory.length > 0
            ? _kotHistory[_kotHistory.length - 1].id
            : (savedOrder?.kotNumber ? String(savedOrder.kotNumber) : (savedOrder?.kotId ? String(savedOrder.kotId) : (edgeHasPrintedIds && edgePreReservedKotNumber != null ? String(edgePreReservedKotNumber) : null)));
        } else {
          try {
            savedOrder = await createOrder({
              tableId: activeTable?.backendId,
              tableNumber: activeTable?.number ?? activeTable?.id,
              restaurantId: orderRestaurantId,
              items: apiItems,
              requestId,
              captainName: currentCaptain?.name || undefined,
              sectionTag: activeTable?.sectionTag || undefined,
              preReservedKotNumber: edgeKotNumToSend,
              localPrinted: edgeHasPrintedIds,
              kotEventIds: edgeKotIdsToSend,
            });
          } catch (createErr) {
            if (createErr.statusCode === 409 && createErr.existingOrderId) {
              console.warn('[KOT] Table already has an active order, retrying as update:', createErr.existingOrderId);
              activeOrderIdRef.current = createErr.existingOrderId;
              const activeTableEntry = activeTables.find(t => t.id === activeTableId || t.backendId === activeTableId);
              const lastUpdatedAt = activeTableEntry?.activeOrder?.updatedAt;
              const response = await updateOrderItems(createErr.existingOrderId, apiItems, requestId, currentCaptain?.name || undefined, false, null, lastUpdatedAt, 12000, edgeKotNumToSend, activeTableId, edgeHasPrintedIds, edgeKotIdsToSend);
              savedOrder = response?.order || response;
              const _kotHistory = response?.order?.kotHistory || response?.kotHistory;
              realKotId = Array.isArray(_kotHistory) && _kotHistory.length > 0
                ? _kotHistory[_kotHistory.length - 1].id
                : (savedOrder?.kotNumber ? String(savedOrder.kotNumber) : (savedOrder?.kotId ? String(savedOrder.kotId) : (edgeHasPrintedIds && edgePreReservedKotNumber != null ? String(edgePreReservedKotNumber) : null)));
            } else {
              throw createErr;
            }
          }
          if (savedOrder?.id) activeOrderIdRef.current = savedOrder.id;
          const _savedKotHistory = savedOrder?.kotHistory;
          realKotId = Array.isArray(_savedKotHistory) && _savedKotHistory.length > 0
            ? _savedKotHistory[_savedKotHistory.length - 1].id
            : (savedOrder?.kotNumber ? String(savedOrder.kotNumber) : (savedOrder?.kotId ? String(savedOrder.kotId) : (edgeHasPrintedIds && edgePreReservedKotNumber != null ? String(edgePreReservedKotNumber) : null)));
        }
      }



      // 2. Update UI with real KOT data from backend

      const newKOT = {

        id: realKotId || (preReservedKotNumber != null ? String(preReservedKotNumber) : `kot-${Date.now()}`),

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
      if (savedOrder?.offline) {
        addNotification(`KOT #${preReservedKotNumber != null ? preReservedKotNumber : newKOT.id} Queued (Offline)`, 'KOT saved locally — will sync when back online.', 'warning');
      } else {
        addNotification(`KOT #${realKotId || newKOT.id} Sent ✓`, 'success');
      }

      // Background listener for print confirmation (non-blocking)
      // When the edge server handled printing AND all prints succeeded, it returns
      // printResults with ok:true and we skip the cloud socket listener.
      // If some prints failed, show the failure immediately — the cloud backend
      // was never called for edge orders, so waiting for kot:printed would always
      // timeout after 30s with a false "print failed" notification.
      let _edgePrintHandled = false;
      if (savedOrder?.edge && savedOrder?.printResults) {
        const printResults = savedOrder.printResults;
        const hasFailures = printResults.length > 0 &&
          printResults.some(r => !r.ok);
        if (hasFailures) {
          const failed = printResults.filter(r => !r.ok);
          addNotification(
            `KOT #${realKotId || newKOT.id} ⚠ Print failed`,
            failed.map(r => r.error || r.printerName).join('; ') || 'Printer error',
            'warning'
          );
        }
        // Edge handled printing (success or failure) — no cloud socket fallback
        // needed. The cloud backend was never called for edge orders, so
        // kot:printed will never fire.
        _edgePrintHandled = true;
      } else if (localPrinted) {
        // Captain already printed locally — cloud backend skips print_job emit,
        // so kot:printed will never fire. No need to wait for socket confirmation.
        _edgePrintHandled = true;
      }
      if (!_edgePrintHandled) {
      const socket = getSocket();
      // Issue 9: Use a local variable for this KOT's timeout so rapid KOT
      // submissions don't overwrite each other's timeout IDs in the shared ref.
      let printTimeoutId = null;
      const handler = ({ requestId: ackRequestId, status }) => {
        if (ackRequestId === requestId) {
          socket.off('kot:printed', handler);
          clearTimeout(printTimeoutId);
          if (status !== 'success') {
            addNotification(`KOT #${realKotId || newKOT.id} ⚠ Print failed`, 'warning');
          }
        }
      };
      socket.on('kot:printed', handler);
      printTimeoutId = setTimeout(() => {
        socket.off('kot:printed', handler);
        addNotification(`KOT #${realKotId || newKOT.id} ⚠ Saved, print failed`, 'warning');
      }, 30000);
      }

    } catch (err) {

      console.error('[KOT] DB write failed:', err.message);

      // ❌ DB failed — show persistent error banner with Retry instead of success toast.

      // Restore the session items so the captain can retry without re-selecting.

      setTableCarts(prev => ({ ...prev, [activeTableId]: retrySnapshot }));

      // Store the requestId so retry reuses it — the backend's idempotency
      // check will return the existing committed order instead of throwing
      // "Duplicate KOT detected".
      retryRequestIdRef.current = requestId;

      setKotError({

        message: err.message || 'Network error — kitchen did not receive this order.',

        retryItems: retrySnapshot,

      });

    } finally {

      // Delay releasing the KOT submission guard by 500ms so that socket
      // table:updated / order:created events arriving in the same tick don't
      // overwrite the optimistic setActiveTables updates above. React batches
      // state updates, so the guard must stay active until the next render
      // cycle processes the new table state.
      setTimeout(() => {
        isSubmittingKotRef.current = false;
      }, 500);

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



    // Optimistic UI — decrement or remove item based on cancel quantity
    const cancelQty = Number(kotItem.q ?? 1);
    setActiveTables(prev => prev.map(t => {
      if (t.backendId !== activeTable?.backendId) return t;

      return {

        ...t,

        kotHistory: (t.kotHistory || []).map(kot => {

          if (kot.id !== kotId) return kot;

          return {

            ...kot,

            items: kot.items.map(i => {
              if (i.orderItemId !== kotItem.orderItemId) return i;
              const currentQty = Number(i.q ?? i.quantity ?? 0);
              const newQty = Math.max(0, currentQty - cancelQty);
              if (newQty <= 0) return { ...i, s: 'Cancelled', removedFromBill: true, q: 0 };
              return { ...i, q: newQty, quantity: newQty };
            }),

          };

        }),

        activeOrder: t.activeOrder ? {
          ...t.activeOrder,
          items: (t.activeOrder.items || []).map(i => {
            if (i.id !== kotItem.orderItemId) return i;
            const currentQty = Number(i.quantity ?? i.q ?? 0);
            const newQty = Math.max(0, currentQty - cancelQty);
            if (newQty <= 0) return { ...i, removedFromBill: true, quantity: 0, q: 0 };
            return { ...i, quantity: newQty, q: newQty };
          }),
        } : t.activeOrder,

        currentBill: Math.max(0, (t.currentBill ?? 0) - (kotItem?.p ?? 0) * cancelQty),

      };

    }));



    const cancelRequestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36));

    let cancelLocalPrinted = false;
    try {
      const cancelEscpos = buildCancelKOT({
        tableNumber: String(activeTable?.number ?? activeTable?.id ?? 'N/A'),
        cancelledBy: currentCaptain?.name || currentCaptain?.id || 'Captain',
        timestamp: new Date().toISOString(),
        items: [{
          name: kotItem.n || kotItem.name || 'Item',
          quantity: Number(kotItem.q ?? 1),
          menuType: kotItem.menuType || (kotItem.type === 'liquor' ? 'BAR' : 'FOOD'),
        }],
        sectionName: activeTable?.section?.name || '',
        sectionTag: activeTable?.sectionTag || undefined,
        restaurant: {
          name: restaurant?.name || undefined,
          receiptHeader: restaurant?.receiptHeader || undefined,
        },
      });
      const cancelEventId = `${cancelRequestId}-cancel`;
      const cancelResult = await printLocal({
        type: 'CANCEL_KOT',
        escposData: cancelEscpos,
        eventId: cancelEventId,
        data: {
          tableNumber: activeTable?.number ?? activeTable?.id,
          items: [{ name: kotItem.n || kotItem.name, quantity: Number(kotItem.q ?? 1) }],
          cancelledBy: currentCaptain?.name || 'Captain',
        },
      });
      cancelLocalPrinted = cancelResult?.printed || false;
      if (cancelLocalPrinted) {
        console.log('[CancelKOT] Local print succeeded — backend will skip socket emission');
      }
    } catch (printErr) {
      console.warn('[CancelKOT] Local print failed:', printErr.message);
    }

    try {

      const cancelResult = await cancelOrderItem(

        activeOrderIdRef.current,

        kotItem.orderItemId,

        currentCaptain?.name || currentCaptain?.id || 'Captain',

        activeTable?.number ?? activeTable?.id,

        Number(kotItem.q ?? 1),

        cancelRequestId,

        cancelLocalPrinted,

        cancelEventId

      );

      addNotification(cancelResult?.offline ? `${kotItem.n} cancelled (sync pending)` : `${kotItem.n} cancelled`, cancelResult?.offline ? 'warning' : 'success');

      // If local print already succeeded, skip waiting for socket print ack
      if (cancelLocalPrinted) {
        setCancelLoading(prev => { const n = { ...prev }; delete n[kotItem.orderItemId]; return n; });
        return;
      }

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

                i.orderItemId === kotItem.orderItemId ? { ...i, s: 'KOT Sent', removedFromBill: false, q: (Number(i.q ?? 0) + cancelQty) } : i

              ),

            };

          }),

          activeOrder: t.activeOrder ? {
            ...t.activeOrder,
            items: (t.activeOrder.items || []).map(i =>
              i.id === kotItem.orderItemId ? { ...i, removedFromBill: false, quantity: (Number(i.quantity ?? 0) + cancelQty), q: (Number(i.q ?? 0) + cancelQty) } : i
            ),
          } : t.activeOrder,

          currentBill: (t.currentBill ?? 0) + (kotItem?.p ?? 0) * cancelQty,

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

        const billingResult = await requestBilling(orderId);

        if (billingResult?.offline) {
          addNotification('Billing requested — will sync when online', 'warning');
        }
        // Stay in session — captain can continue viewing the table, send more KOTs,
        // navigate to other tables, and settle later. The table status is already
        // 'Waiting Bill' from the optimistic update above.

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

    } else {

      addNotification('Cannot request bill — no active order found. Refresh and retry.', 'error');

      setActiveTables(prev => prev.map(t => {
        if (t.id === activeTableId || t.backendId === activeTableId) {
          return { ...t, status: previousStatus };
        }
        return t;
      }));

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

                alt="Softshape"

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
      className="flex flex-col bg-[#F8FAFC] overflow-hidden font-['Inter',sans-serif] text-[#111827]"
      style={{ height: 'calc(var(--captain-vh, 1dvh) * 100)' }}
    >



      {/* WAITER CALL EMERGENCY OVERLAY */}

      {pendingCalls.length > 0 && (

        <EmergencyOverlay

          call={pendingCalls[0]}

          currentCaptain={currentCaptain}

          onDismiss={(call) => clearCall(call.callId)}

          onAccept={async (call) => {

            if (currentCaptain) {

              // 2. Collision check: Did someone else just lock this table in the live floor map?

              const callTableNumber = String(call.tableId).match(/(\d+)/)?.[1] || call.tableId;
              const targetTable = activeTables.find(t => String(t.id) === String(callTableNumber));



              // Server-authoritative accept: POST to backend which atomically claims the call
              // via Redis SET NX (or in-memory fallback). No more localStorage-based race.
              try {
                const response = await fetch(`${API_BASE}/api/public/accept-waiter-call`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                  },
                  body: JSON.stringify({
                    callId: call.callId,
                    tableId: call.tableId,
                    captainName: currentCaptain.name,
                  }),
                });

                const result = await response.json();

                if (response.ok && result.success) {
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

                } else if (response.status === 409) {
                  // Another captain already accepted — server is the source of truth
                  const winnerName = result.acceptedByName;
                  addNotification(
                    winnerName
                      ? `${winnerName} already accepted this request`
                      : "Another captain has already accepted this request!",
                    "error"
                  );
                  clearCall(call.callId);
                } else {
                  addNotification(result.error || result.message || "Failed to accept waiter call", "error");
                  clearCall(call.callId);
                }
              } catch (err) {
                addNotification("Network error — could not reach server to accept call", "error");
                clearCall(call.callId);
              }

            }

          }}

        />

      )}

      {/* TOP NAVBAR */}
      <TopNavbar
        restaurant={restaurant}
        captainName={currentCaptain?.name}
        notificationCount={pendingCalls.length}
        onLogout={() => {
          localStorage.removeItem(getTenantScopedKey('captain_auth_v2'));
          localStorage.removeItem(getTenantScopedKey('active_captain'));
          setSelectedProfile(null);
          setCurrentCaptain(null);
          setPin('');
          setIsLoginView(true);
          if (onLogout) onLogout();
        }}
        onEdgeSettingsClick={() => {
          setEdgeUrlInput(getEdgeUrl());
          setShowEdgeSettings(true);
          checkEdgeStatus();
        }}
        edgeStatus={edgeStatus}
        isOffline={isOffline}
        syncStatus={syncStatus}
        pendingCount={pendingCount}
      />

      {/* MAIN ROW: sidebar + content */}
      <div className="flex flex-grow overflow-hidden">

      {/* SIDEBAR — desktop navigation */}
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        freeCount={freeCount}
        busyCount={busyCount}
        totalSales={todayRevenue}
        totalBills={allTablesCount}
        captainName={currentCaptain?.name}
      />

      {/* MAIN COLUMN */}
      <div className="flex flex-col flex-grow overflow-hidden">

      {/* EDGE SETTINGS MODAL */}
      {showEdgeSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowEdgeSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Edge Server Settings</h2>
              <button onClick={() => setShowEdgeSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Status */}
            <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                {edgeStatus.checking ? (
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                ) : edgeStatus.available ? (
                  <Wifi size={16} className="text-green-600" />
                ) : edgeStatus.connState === 'edge_not_ready' ? (
                  <AlertTriangle size={16} className="text-amber-600" />
                ) : edgeStatus.connState === 'cloud_reachable' ? (
                  <Cloud size={16} className="text-blue-600" />
                ) : (
                  <WifiOff size={16} className="text-red-600" />
                )}
                <span className="text-sm font-bold">
                  {edgeStatus.checking
                    ? 'Checking…'
                    : edgeStatus.available
                    ? 'Edge Connected'
                    : edgeStatus.connState === 'cloud_reachable'
                    ? 'Cloud Only (Edge Offline)'
                    : edgeStatus.connState === 'edge_not_ready'
                    ? 'Edge Not Ready (Session Invalid)'
                    : 'Fully Offline'}
                </span>
              </div>
              {edgeStatus.url && (
                <div className="text-xs text-gray-500 font-mono">{edgeStatus.url}</div>
              )}
              {discoveryStatus && (
                <div className="text-xs text-blue-600 mt-1">{discoveryStatus}</div>
              )}
            </div>

            {/* Manual URL configuration */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 mb-1">Edge Server URL</label>
              <input
                type="text"
                value={edgeUrlInput}
                onChange={e => setEdgeUrlInput(e.target.value)}
                placeholder="http://192.168.1.100:3101"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Enter the hub machine's LAN IP and port (default: 3101)</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setEdgeUrl(edgeUrlInput.trim() || null);
                  await checkEdgeStatus();
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Save & Test
              </button>
              <button
                onClick={async () => {
                  setDiscoveryStatus('Searching for edge server on LAN…');
                  setEdgeUrl(null);
                  const discovered = await discoverEdgeOnLAN({ force: true });
                  if (discovered) {
                    setEdgeUrlInput(discovered);
                    setDiscoveryStatus(`Found: ${discovered}`);
                    await checkEdgeStatus();
                  } else {
                    const reason = getEdgeDiscoveryFailReason();
                    setDiscoveryStatus(reason || 'No edge server found on LAN');
                  }
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 transition-colors"
              >
                Auto-Discover
              </button>
            </div>

            {/* Clear button */}
            <button
              onClick={async () => {
                setEdgeUrl(null);
                setEdgeUrlInput('');
                setDiscoveryStatus('');
                await checkEdgeStatus();
              }}
              className="w-full mt-2 px-4 py-2 rounded-lg text-red-600 text-xs font-bold hover:bg-red-50 transition-colors"
            >
              Reset to default
            </button>
          </div>
        </div>
      )}



      {/* OFFLINE STATUS BAR — colored strip showing sync state */}
      {(() => {
        const isSyncingNow = syncStatus === 'syncing';
        const hasError = syncStatus === 'error' || syncStatus === 'paused';
        const showBar = isOffline || isSyncingNow || hasError || pendingCount > 0;
        if (!showBar) return null;
        const barColor = isOffline ? 'bg-amber-500' : hasError ? 'bg-red-500' : 'bg-blue-500';
        const Icon = isOffline ? WifiOff : hasError ? AlertTriangle : RefreshCw;
        const label = isOffline
          ? `Offline${pendingCount > 0 ? ` — ${pendingCount} action${pendingCount !== 1 ? 's' : ''} queued` : ''}`
          : hasError
          ? (lastError || 'Sync error')
          : `Syncing${pendingCount > 0 ? ` ${pendingCount} pending` : '…'}`;
        return (
          <div className={`flex items-center justify-between px-4 py-1.5 text-white text-xs font-bold shrink-0 z-40 ${barColor}`}>
            <div className="flex items-center gap-2">
              <Icon size={14} className={isSyncingNow ? 'animate-spin' : ''} />
              <span>{label}</span>
            </div>
            <div className="flex items-center gap-2">
              {isOffline && pendingCount > 0 && (
                <span className="bg-white/20 rounded-full px-2 py-0.5 text-[10px]">Will sync automatically</span>
              )}
              {isOnline && (hasError || pendingCount > 0) && (
                <button
                  onClick={() => triggerSync()}
                  disabled={isSyncingNow}
                  className="flex items-center gap-1 bg-white/20 rounded px-2 py-0.5 hover:bg-white/30 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={10} className={isSyncingNow ? 'animate-spin' : ''} />
                  Retry sync
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* CONTENT AREA — switches based on activeSection */}
      <div className="flex-grow overflow-hidden flex flex-col relative">

        {/* FLOOR SECTION: sub-tabs for Assignment / Tables */}
        {activeSection === 'floor' && (
          <div className="bg-white border-b border-gray-200 px-4 flex shrink-0">
            <button
              onClick={() => { setActiveView('assignment'); localStorage.setItem(getTenantScopedKey('captain_active_tab'), 'assignment'); }}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-all ${activeView === 'assignment' ? 'border-[#EF4444] text-[#EF4444]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <Target size={14} />
              <span className="hidden sm:inline">Today's Target</span>
              <span className="sm:hidden">Target</span>
              {assignment && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5 shrink-0" />}
            </button>
            <button
              onClick={() => { setActiveView('tables'); localStorage.setItem(getTenantScopedKey('captain_active_tab'), 'tables'); }}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-all ${activeView === 'tables' ? 'border-[#EF4444] text-[#EF4444]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              <LayoutDashboard size={14} />
              Tables
              {view === 'session' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5 shrink-0" />}
            </button>
          </div>
        )}

      {/* TODAY ASSIGNMENT VIEW — only in floor section */}

      {activeSection === 'floor' && activeView === 'assignment' && (

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

      {/* FLOOR VIEW (tables grid) — only when floor section + tables sub-tab */}
      {activeSection === 'floor' && activeView === 'tables' && view === 'tables' && (
        <FloorOverview
          tables={displayTables}
          sections={fetchedSections}
          tableSubCategory={tableSubCategory}
          setTableSubCategory={setTableSubCategory}
          tableFilter={tableFilter}
          setTableFilter={setTableFilter}
          freeCount={freeCount}
          busyCount={busyCount}
          myTablesCount={myTablesCount}
          allTablesCount={allTablesCount}
          onTableSelect={openTableSession}
          selectedPDRRoom={selectedPDRRoom}
          setSelectedPDRRoom={setSelectedPDRRoom}
          captainId={currentCaptain?.id}
          tablesLoading={tablesLoading}
          refetchTables={refetchRestaurantTables}
          enabledModules={enabledModules}
          assignment={assignment}
          todayRevenue={todayRevenue}
          currentCaptain={currentCaptain}
        />
      )}

      {/* COMING SOON sections */}
      {activeSection !== 'floor' && activeSection !== 'menu' && (
        <ComingSoon sectionName={activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} />
      )}

      {/* MAIN CONTENT AREA — TABLES & SESSION */}

      <main className={`flex-grow flex flex-col overflow-hidden relative ${(activeSection !== 'menu' || (activeSection === 'floor' && activeView !== 'tables')) ? 'hidden' : ''}`}>

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
                          // Show all sections from backend (onboarding/admin) without venue type filtering
                          // Sections should display exactly as configured in the system
                          return true;
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
              ) : (

                <>

                  {/* Table Filter Toggle — shown for all section types */}

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

                    sectionId={(() => {
                      const section = fetchedSections.find(s => {
                        const sourceKey = sectionTagToSource[s.sectionTag] || s.name;
                        return sourceKey === tableSubCategory;
                      });
                      return section?.id;
                    })()}

                    restaurantId={getCurrentRestaurantId()}

                    roomMode="single"

                    selectedRoom={selectedPDRRoom}

                    onSelectRoom={setSelectedPDRRoom}

                    captainId={currentCaptain?.id}

                    onTableSelect={openTableSession}

                    onOrderPlaced={() => {}}

                    venueTables={tableFilter === 'my' ? displayTables.filter(t => t.captainId === currentCaptain?.id) : displayTables}
                    isSyncing={tablesLoading}
                    refetch={refetchRestaurantTables}
                  />

                </>

              )}

            </div>

          </div>

        ) : (

          <div className="flex-grow flex flex-col overflow-hidden bg-white">

            {/* STICKY SESSION HEADER */}

            <div className={`bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 shrink-0 z-40 shadow-sm transition-all duration-300 ${isHeaderVisible ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden py-0'}`}>

              <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">

                <button onClick={() => { setView('tables'); setActiveSection('floor'); }} className="p-2.5 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-xl border border-gray-100 transition-all"><ChevronLeft size={20} /></button>

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

                <button
                  onClick={() => setIsCartMinimized(false)}
                  className="relative p-2.5 bg-green-50 text-green-600 rounded-xl border border-green-100 shrink-0 flex items-center justify-center lg:hidden"
                  aria-label={`Cart with ${currentSessionItems.reduce((sum, i) => sum + (Number(i.q) || 0), 0)} items`}
                >
                  <ShoppingCart size={18} />
                  {currentSessionItems.reduce((sum, i) => sum + (Number(i.q) || 0), 0) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#EF4444] text-white text-[9px] font-bold flex items-center justify-center">
                      {currentSessionItems.reduce((sum, i) => sum + (Number(i.q) || 0), 0)}
                    </span>
                  )}
                </button>

              </div>

            </div>



            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">

              {/* MENU INTERFACE */}

              <div className={`flex-grow flex flex-col overflow-hidden bg-gray-50/30 ${isSearchFocused ? 'h-full lg:h-auto' : isCartMinimized ? 'min-h-0 lg:h-auto' : 'h-1/2 lg:h-auto'} border-b lg:border-b-0 lg:border-r border-gray-100 transition-all duration-300`}>

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

                          {categories.map(cat => {

                            const isSpecialCat = cat === 'Today Special';

                            return (

                            <button

                              key={cat}

                              onClick={() => setActiveCategory(cat)}

                              className={`px-5 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border shrink-0 flex items-center gap-1.5 ${
                                isSpecialCat
                                  ? activeCategory === cat
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-[0_4px_12px_rgba(245,158,11,0.2)] scale-[1.02]'
                                    : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 hover:border-amber-400'
                                  : activeCategory === cat
                                    ? 'bg-gradient-to-r from-[#E53935] to-[#B71C1C] text-white border-transparent shadow-[0_4px_12px_rgba(229,57,53,0.2)] scale-[1.02]'
                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-100 hover:text-red-700'
                              }`}

                            >

                              {isSpecialCat && <Flame size={12} className={activeCategory === cat ? 'text-white' : 'text-amber-500'} />}

                              {cat}

                            </button>

                            );

                          })}

                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 shadow-sm">

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

                        {categories.map(cat => {

                          const isSpecialCat = cat === 'Today Special';

                          return (

                          <button

                            key={cat}

                            onClick={() => setActiveCategory(cat)}

                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 flex items-center gap-1.5 ${
                              isSpecialCat
                                ? activeCategory === cat
                                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-[0_4px_12px_rgba(245,158,11,0.2)] scale-[1.02]'
                                  : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 hover:border-amber-400'
                                : activeCategory === cat
                                  ? 'bg-gradient-to-r from-[#E53935] to-[#FF7043] text-white border-transparent shadow-[0_8px_16px_rgba(229,57,53,0.15)] scale-[1.03]'
                                  : 'bg-white border-gray-100 text-gray-400 hover:bg-red-50/10 hover:text-gray-700'
                              }`}

                          >

                            {isSpecialCat && <Flame size={12} className={activeCategory === cat ? 'text-white' : 'text-amber-500'} />}

                            {cat}

                          </button>

                          );

                        })}

                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200">

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

        const name = String(item.n || item.name || '').toLowerCase();

        const cat = String(item.c || item.category || '').toLowerCase();

        return words.some(w => name.includes(w) || cat.includes(w) ||

          name.split(/\s+/).some(nw => nw.startsWith(w) || w.startsWith(nw))

        );

      })

    : [];

  return (

    <div className="pb-12">

      <div className="text-center py-8">

        <div className="text-4xl mb-3">🔍</div>

        <p className="text-sm font-black text-gray-700 uppercase tracking-widest">

          {activeCategory === 'Today Special' ? 'No Active Specials' : 'No Exact Search Found'}

        </p>

        <p className="text-xs font-bold text-gray-400 mt-1">

          {activeCategory === 'Today Special'

            ? 'No today specials are currently active. Check back later or contact admin.'

            : searchQuery.trim() ? `No results for "${searchQuery.trim()}"` : 'No items in this category.'}

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

                            <button onClick={(e) => { e.stopPropagation(); handleItemClick(e, item); }} className="w-6 h-6 rounded-full bg-[#E53935] text-white flex items-center justify-center hover:bg-[#d32f2f] active:scale-90 transition-all shadow-sm"><Plus size={10} strokeWidth={3.5} /></button>

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

                        return (

                          <MemoMenuCard

                            key={item.id || idx}

                            item={item}

                            totalQty={totalQty}

                            activeOutlet={activeOutlet}

                            onAdd={stableCardOnAdd}

                            onMinus={stableUpdateDraftQty}

                          />

                        );

                      })}

                    </div>

                  )}

                </div>

              </div>



              {/* SESSION ORDER PANEL */}

              <div className={`w-full lg:w-[420px] ${isCartMinimized ? 'lg:h-auto overflow-hidden' : 'fixed inset-0 z-[100] lg:relative lg:inset-auto lg:h-auto lg:z-40'} bg-white flex flex-col shrink-0 shadow-[0_0_100px_rgba(0,0,0,0.04)] transition-all duration-300 ${!isCartMinimized ? 'animate-in fade-in slide-in-from-bottom-12 lg:animate-none' : ''}`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)', height: isCartMinimized ? 'calc(5rem + env(safe-area-inset-bottom, 16px))' : undefined }}>

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



                <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar min-h-0">

                  {/* KOT LOGS */}

                  {(activeTable?.kotHistory || [])
                    .filter(kot => Array.isArray(kot.items) && kot.items.length > 0)
                    .map((kot) => {
                    const visibleItems = kot.items.filter(i => (i.q ?? i.quantity ?? 0) > 0);
                    const cancellableItems = visibleItems.filter(i => i.s !== 'Cancelled' && !!i.orderItemId);

                    return kot.items.length > 0 ? (

                      <div key={kot.id} className="space-y-2">

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
                                        <span className="line-through text-red-400 text-xs">{Number(item.q) + Number(item.cancelledQuantity ?? 0)}x</span>
                                        <span className="text-green-600 font-black ml-1">{item.q}x</span>
                                      </span>
                                    ) : (
                                      <span>{item.q}x</span>
                                    )}

                                  </div>

                                  <p className={`text-sm font-bold ${isCancelled ? 'line-through text-red-400' : 'text-gray-700'}`}>{item.n}</p>

                                  {item.notes && (
                                    <p className={`text-[10px] italic font-semibold ${isCancelled ? 'text-gray-300' : 'text-amber-600'} mt-0.5`}>* {item.notes}</p>
                                  )}

                                </div>

                                <div className="flex items-center gap-2">

                                  <span className={`text-[10px] font-bold ${isCancelled ? 'text-gray-300' : 'text-gray-400'}`}>₹{item.p} × {item.q}</span>

                                  <span className={`text-sm font-black ${isCancelled ? 'line-through text-red-400' : 'text-gray-900'}`}>₹{Number(item.p * item.q).toFixed(2)}</span>

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





                  {billableItems.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-dashed border-gray-100">
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2"><History size={16} /> Ordered Items</h4>
                      <div className="space-y-1.5">
                        {billableItems.map((item, idx) => {
                          const name = item.n || item.name || 'Item';
                          const qty = item.q ?? item.quantity ?? 1;
                          const price = item.p ?? item.price ?? 0;
                          return (
                            <div key={idx} className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                              <div className="flex justify-between items-start mb-1">
                                <p className="text-[11px] font-black text-gray-900 uppercase pr-8 leading-tight">{name}</p>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-500">Qty: {qty}</span>
                                <div className="text-right">
                                  <span className="text-[9px] font-bold text-gray-400">₹{price} × {qty}</span>
                                  <span className="text-sm font-black text-gray-900 block">₹{price * qty}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ACTIVE DRAFT */}

                  <div className="space-y-2 pt-2 border-t border-dashed border-gray-100">

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

                      <div className="space-y-1.5">

                        {currentSessionItems.map((item, idx) => (

                          <div key={idx} className="bg-red-50/50 p-2 rounded-xl border border-red-100/30 animate-in slide-in-from-right-4">

                            <div className="flex justify-between items-start mb-1">

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

                              <div className="text-right">
                                <span className="text-[9px] font-bold text-gray-400">₹{item.p} × {item.q}</span>
                                <span className="text-sm font-black text-gray-900 block">₹{item.p * item.q}</span>
                              </div>

                            </div>

                            <div className="mt-0 ml-1">

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

                        <StarIcon size={16} className="text-amber-500 fill-amber-500" />

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

                                onClick={(e) => { e.stopPropagation(); handleItemClick(e, item); }}

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



                <div className="p-8 pb-24 lg:pb-8 bg-white border-t border-gray-100 space-y-6 shrink-0 shadow-[0_-20px_50px_rgba(0,0,0,0.03)] relative z-10">

                  <div className="flex justify-between items-center">

                    <div className="flex flex-col gap-1">

                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Running Total</span>

                      <p className="text-3xl font-black text-gray-900 tracking-tighter leading-none">₹{sessionBill.grandTotal}</p>

                    </div>

                    <div className="text-right flex flex-col gap-1">

                      <span className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em]">New Items</span>

                      <span className="text-lg font-black text-gray-400">₹{calculateOrderTotal(currentSessionItems, 0, restaurantConfig).subtotal}</span>

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

                    className="w-full py-5 bg-[#E53935] text-white rounded-2xl font-black text-[9px] sm:text-xs uppercase tracking-wider sm:tracking-[0.15em] shadow-xl shadow-red-100 active:scale-98 transition-all flex items-center justify-center gap-2 sm:gap-3 disabled:opacity-20 disabled:shadow-none relative group overflow-hidden whitespace-nowrap"

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

      {/* FLOATING VIEW CART BUTTON — visible on mobile when cart is minimized with items */}
      {isCartMinimized && currentSessionItems.length > 0 && view === 'tables' && activeTableId && (
        <button
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[150] lg:hidden bg-[#E53935] text-white px-6 py-3 rounded-full shadow-2xl font-black text-sm uppercase flex items-center gap-2"
          onClick={() => setIsCartMinimized(false)}
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <ChevronUp size={16} /> View Cart & Send KOT ({currentSessionItems.length})
        </button>
      )}

      </main>

      </div>{/* end content area */}

      </div>{/* end main column */}

      </div>{/* end main row */}

      {/* MOBILE BOTTOM NAV */}
      <MobileBottomNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onFabClick={() => { setActiveSection('floor'); setActiveView('tables'); setView('tables'); }}
      />

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
                retryRequestIdRef.current = null;

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

                // Reuse the original requestId so the backend's idempotency
                // check recovers the existing committed order instead of
                // throwing "Duplicate KOT detected".
                const retryId = retryRequestIdRef.current;
                retryRequestIdRef.current = null;
                sendIncrementalKOT(retryId);

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

                            setActiveTableId(null);
                            activeOrderIdRef.current = null;
                            lastConfirmedItemsRef.current = [];
                            kotRequestIdRef.current = null;

                            setView('tables');
                            setActiveSection('floor');

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




      <QuantityPicker
        isOpen={showLiquorQtyPicker}
        itemName={liquorQtyItem?.n || ''}
        onSelect={handleQtySelect}
        onClose={() => { setShowLiquorQtyPicker(false); setLiquorQtyItem(null); }}
      />
      <KotConfirmModal
        isOpen={showKotConfirm}
        itemCount={currentSessionItems.length}
        totalQty={currentSessionItems.reduce((s, i) => s + (i.q ?? 1), 0)}
        amount={calculateOrderTotal(currentSessionItems, 0, restaurantConfig).subtotal}
        label="Send KOT"
        onConfirm={() => { setShowKotConfirm(false); sendIncrementalKOT(); }}
        onCancel={() => setShowKotConfirm(false)}
      />

    </div>

  );

}




