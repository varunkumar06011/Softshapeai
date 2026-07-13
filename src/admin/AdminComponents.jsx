// ─────────────────────────────────────────────────────────────────────────────

// AdminComponents — Large shared component library for admin dashboard modules

// ─────────────────────────────────────────────────────────────────────────────

// Contains the majority of admin UI components including:

//   - Dashboard overview with live stats and revenue charts

//   - Menu management (categories, items, variants, bulk import, AI parse)

//   - Table management (CRUD, QR codes, floor/section layout)

//   - Order management (live orders, KOT viewing, status transitions)

//   - Billing and settlement interface

//   - Inventory management (kitchen + bar)

//   - AI Tools panel (dish creation, creative engine, pricing engine)

//   - Marketing panel (campaigns, promotions — TODO WIP)

//   - Surveillance dashboard integration

//   - Settings page integration

//

// This is the largest frontend file (~7300 lines) and serves as the main

// component library imported by AdminDashboard.jsx.

// ─────────────────────────────────────────────────────────────────────────────



import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';

import AppsSection from './settings/AppsSection';

import {

  ChartNoAxesCombined,

  ClipboardList,

  Bot,

  Megaphone,

  Sparkles,

  Search,

  UtensilsCrossed,

  Camera,

  Check,

  CheckSquare,

  Calendar,

  Aperture,

  Send,

  Share2,

  ArrowLeft,

  Smartphone,

  CheckCircle2,

  X,

  RefreshCw,

  TrendingUp,

  TrendingDown,

  User,

  Users,

  DollarSign,

  Layers,

  Briefcase,

  AlertCircle,

  Package,

  History,

  Settings,

  Clock,

  ChevronRight,

  ChevronDown,

  ChevronUp,

  Filter,

  ArrowRightLeft,

  Plus,

  ArrowUp,

  ArrowDown,

  GlassWater,

  Utensils,

  Trash2,

  Download,

  FileSpreadsheet,

  FileText,

  Printer,

  Edit2,

  Pencil,

  Upload,

  Loader,

  Activity

} from 'lucide-react';
import { StarIcon } from '../shared/icons/StarIcon';

import { 

  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, CartesianGrid

} from 'recharts';

import { useMenu } from '../context/MenuContext';

import { useAuth } from '../context/AuthContext';

import { useSocket } from '../hooks/useSocket';

import UnifiedOrdersDashboard from './UnifiedOrdersDashboard';

import { getSmartRecommendation } from '../services/pricingEngine';

import { STYLES, generateRandomConfig } from '../services/creativeEngine';

import CreativeCanvas from '../shared/components/CreativeCanvas';

import { calculateOrderTotal } from '../shared/utils/billing';

import { filterMenuItems, menuItemMatchesSearch } from '../shared/utils/menuSearch';

import { useTableSync } from '../services/tableSyncService';

import { useBarTableSync } from '../services/barTableSyncService';

import { useBarMenuSync, updateBarMenuItem, toggleBarMenuAvailability } from '../services/barMenuSyncService';

import { API_BASE, apiUrl, getAuthHeaders, apiFetch } from '../services/apiConfig';

import { fetchVenues } from '../services/tableApi';

import { fetchUnifiedMenu } from '../services/unifiedMenuService';

import { fetchTransactions } from '../services/orderApi';

import { getTodayAttendanceSummary, getAttendance, getAttendanceRange, markAttendance, markAttendanceBulk, checkIn, checkOut } from '../services/attendanceService';

import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

import { getRestaurantConfig } from '../utils/getRestaurantConfig.js';

import { authService } from '../services/authService';

import { useVenueSections } from '../hooks/useVenueSections';

import { fetchBarInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, adjustStock, recordPurchase, fetchLowStockItems, fetchTransactions as fetchBarTransactions, fetchBarTopSelling, fetchBarDeductionCheck } from '../services/barInventoryApi';

import FloorPlanEditor from './FloorPlanEditor';

import InventoryRangeSummary from './InventoryRangeSummary';
import DateRangePicker from './components/DateRangePicker';

import MenuUpload from '../onboarding/MenuUpload';



const { barUnitMl: BAR_UNIT_ML, fullBottleMl: FULL_BOTTLE_ML } = getRestaurantConfig();

const BAR_FULL_BOTTLE_MULTIPLIER = Math.round(FULL_BOTTLE_ML / BAR_UNIT_ML);



// Helper function to determine ml per unit for liquor items based on item name

function getLiquorMlPerUnit(itemName, bottleSize) {

  if (itemName.endsWith('Full Bottle')) return FULL_BOTTLE_ML;

  if (itemName.endsWith('30ml')) return BAR_UNIT_ML;

  // Bottle items (Beer, Soft drinks) — use stored bottleSize

  return bottleSize || FULL_BOTTLE_ML;

}

// Helper: format a milliliter quantity as "N bottles + M ml"
function formatBottlesMl(totalMl, bottleSize) {
  const safeBottleSize = bottleSize > 0 ? bottleSize : 750;
  const bottles = Math.floor(totalMl / safeBottleSize);
  const remainingMl = Math.round(totalMl % safeBottleSize);
  if (remainingMl === 0) return `${bottles} bottles`;
  return `${bottles} bottles + ${remainingMl} ml`;
}



const formatTableTime = (timeString) => {

  if (!timeString) return '---';

  const d = new Date(timeString);

  if (isNaN(d.getTime())) return timeString;

  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

};



// Popup Component - Replaces alert() calls

function Popup({ message, type = 'info', onClose }) {

  // type: 'success', 'error', 'warning', 'info'

  const bgColors = {

    success: 'bg-green-50 border-green-500',

    error: 'bg-red-50 border-red-500',

    warning: 'bg-yellow-50 border-yellow-500',

    info: 'bg-blue-50 border-blue-500'

  };



  const textColors = {

    success: 'text-green-800',

    error: 'text-red-800',

    warning: 'text-yellow-800',

    info: 'text-blue-800'

  };



  const icons = {

    success: '✓',

    error: '✕',

    warning: '⚠',

    info: 'ℹ'

  };



  return (

    <div

      className="fixed inset-0 flex items-center justify-center z-50"

      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}

      onClick={onClose}

    >

      <style>{`

        @keyframes scale-in {

          from {

            transform: scale(0.9);

            opacity: 0;

          }

          to {

            transform: scale(1);

            opacity: 1;

          }

        }

        .animate-scale-in {

          animation: scale-in 0.2s ease-out;

        }

      `}</style>

      <div

        className={`${bgColors[type]} border-l-4 rounded-lg shadow-2xl p-6 max-w-md mx-4 animate-scale-in`}

        onClick={(e) => e.stopPropagation()}

      >

        <div className="flex items-start gap-4">

          <div className={`text-3xl ${textColors[type]}`}>

            {icons[type]}

          </div>

          <div className="flex-1">

            <p className={`${textColors[type]} font-semibold text-lg mb-2`}>

              {type.charAt(0).toUpperCase() + type.slice(1)}

            </p>

            <p className="text-gray-700">{message}</p>

          </div>

          <button

            onClick={onClose}

            className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"

          >

            ×

          </button>

        </div>

        <div className="mt-4 flex justify-end">

          <button

            onClick={onClose}

            className="px-6 py-2 bg-gray-800 text-white rounded-lg font-semibold hover:bg-gray-700 transition-all"

          >

            OK

          </button>

        </div>

      </div>

    </div>

  );

}



// ButtonSpinner Component - Small inline spinner for loading states

function ButtonSpinner() {

  return (

    <svg className="animate-spin h-4 w-4 inline-block" viewBox="0 0 24 24">

      <circle

        className="opacity-25"

        cx="12"

        cy="12"

        r="10"

        stroke="currentColor"

        strokeWidth="4"

        fill="none"

      />

      <path

        className="opacity-75"

        fill="currentColor"

        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"

      />

    </svg>

  );

}



// Shared Styles

const btn = "rounded-md bg-[#E53935] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#c62828]";

const cardBase = "rounded-[10px] border border-[#FFCDD2]";

const card = cardBase + " bg-white";

const input = "w-full rounded-[4px] border border-[#FFCDD2] bg-white px-3 py-2 text-sm outline-none focus:border-[#E53935]";

// ── Shared helpers (module-level so all components can use them) ──────────

const uploadImageToCloudinary = async (base64DataUri, itemName = '') => {
  const base64Data = base64DataUri.includes(',') ? base64DataUri.split(',')[1] : base64DataUri;
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/jpeg' });

  const formData = new FormData();
  formData.append('file', blob, 'image.jpg');
  formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'softshape-menu');
  if (itemName?.trim()) {
    formData.append('context', `alt=${encodeURIComponent(itemName.trim())}`);
  }

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dnlhxmtqu';
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error(data?.error?.message || 'Cloudinary upload failed');
  return data.secure_url;
};

function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 600;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

const AVATAR_COLORS = ['#B71C1C','#1B5E20','#0D47A1','#4A148C',
                       '#E65100','#006064','#827717','#37474F'];

const _TITLE_KEEP_UPPER = new Set(['PP', 'PVC', 'HDPE', 'LDPE', 'HM', 'LD', 'B/L']);
function toTitleCase(str) {
  if (!str) return str;
  return str.toLowerCase().split(' ').map(word => {
    if (!word) return word;
    if (_TITLE_KEEP_UPPER.has(word.toUpperCase())) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

function IngredientAvatar({ name }) {
  const bg = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div
      style={{ background: bg }}
      className="h-9 w-9 rounded-full flex items-center justify-center text-white text-[11px] font-black shrink-0"
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}



export function Dashboard({ revenue, totalSales, netSales, totalDiscount, ordersCount, activityLog, dashboardScope }) {

  const { tables } = useTableSync();
  const { restaurant } = useAuth();

  const [sales, setSales] = useState([]);

  const [salesLoading, setSalesLoading] = useState(true);

  const [staffPresent, setStaffPresent] = useState(0);

  const [staffTotal, setStaffTotal] = useState(0);



  const occupiedCount = tables.filter(t => t.status && t.status !== 'Free' && t.status !== 'available').length;

  const totalTables = tables.length;

  const liveOrdersCount = tables.filter(t => t.status && t.status !== 'Free' && t.status !== 'available').length;



  useEffect(() => {

    let cancelled = false;



    const loadSalesData = async () => {

      try {

        const now = new Date();

        const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);

        const sevenDaysAgo = new Date(istNow);

        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);



        const startISO = sevenDaysAgo.toISOString().slice(0, 10);

        const endISO = istNow.toISOString().slice(0, 10);



        const outletId = dashboardScope === 'all' ? 'all' : restaurant?.id;
        const res = await fetch(`${API_BASE}/api/reports/daily-sales?startDate=${startISO}&endDate=${endISO}&outletId=${outletId}`, {

          headers: { ...getAuthHeaders() },

        });



        if (!res.ok) throw new Error('Failed to fetch sales data');

        const data = await res.json();



        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        const dailyData = days.map(d => ({ day: d, revenue: 0 }));



        (data.byDay || []).forEach(day => {

          const dayDate = new Date(day.date);

          const dayIdx = dayDate.getDay();

          dailyData[dayIdx].revenue += Number(day.revenue || 0);

        });



        const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

        const chartData = order.map(dayName => {

          const dayIdx = days.indexOf(dayName);

          return {

            d: dayName,

            v: Math.round(dailyData[dayIdx].revenue)

          };

        });



        if (!cancelled) {

          setSales(chartData);

          setSalesLoading(false);

        }

      } catch (err) {

        console.warn('[Dashboard] Failed to load sales data:', err.message);

        if (!cancelled) {

          setSalesLoading(false);

        }

      }

    };



    loadSalesData();

    const interval = setInterval(loadSalesData, 600000); // Refresh every 10 minutes



    return () => {

      cancelled = true;

      clearInterval(interval);

    };

  }, [dashboardScope, restaurant?.id]);



  useEffect(() => {

    let cancelled = false;



    const loadStaff = async () => {

      try {

        const summary = await getTodayAttendanceSummary();

        if (cancelled) return;

        setStaffPresent(summary.present ?? 0);

        setStaffTotal(summary.total ?? 0);

      } catch (err) {

        console.warn('[Dashboard] Failed to load staff attendance:', err.message);

      }

    };



    loadStaff();

    const interval = setInterval(loadStaff, 300000); // Refresh every 5 minutes



    return () => {

      cancelled = true;

      clearInterval(interval);

    };

  }, []);



  return <div className="space-y-4 font-sans">

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">

      {[

        { label: "Total Sales", value: `₹${(totalSales ?? 0).toLocaleString()}`, sub: "With GST, after discount", color: "text-[#2E7D32]" },

        { label: "Net Sales", value: `₹${(netSales ?? 0).toLocaleString()}`, sub: "Excl. GST, after discount", color: "text-[#1565C0]" },

        { label: "Discount", value: `₹${(totalDiscount ?? 0).toLocaleString()}`, sub: `${ordersCount || 0} txns`, color: "text-[#C62828]" },

        { label: "Tables Occupied", value: `${occupiedCount}/${totalTables}`, sub: "active", color: "text-[#1A1A1A]" },

      ].map((x) => (

        <div key={x.label} className={card + " border-t-4 border-t-[#E53935] p-3 md:p-4 min-w-0 shadow-sm transition-all hover:translate-y-[-2px]"}>

          <p className="text-[10px] md:text-xs font-bold uppercase tracking-tight text-[#6B6B6B] truncate">{x.label}</p>

          <div className="mt-1 md:mt-2 flex flex-col sm:flex-row sm:items-baseline gap-1 overflow-hidden">

            <p className="text-xl md:text-2xl lg:text-3xl font-black text-[#1A1A1A] whitespace-nowrap animate-number-grow">{x.value}</p>

            <p className={`text-[10px] md:text-xs font-bold ${x.color} whitespace-nowrap`}>{x.sub}</p>

          </div>

        </div>

      ))}

    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      <div className={card + " p-4 lg:col-span-2 flex flex-col animate-chart-in"}>

        <h3 className="mb-4 font-bold text-sm md:text-base flex items-center gap-2">

          <ChartNoAxesCombined size={18} className="text-[#E53935]" />

          Sales Attribution - Last 7 days

        </h3>

        <div className="flex-grow h-[250px] w-full min-h-[250px]" style={{ minWidth: 0 }}>

          <ResponsiveContainer width="99%" height="100%">

            <BarChart data={sales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>

              <defs>

                <linearGradient id="dashBarGrad" x1="0" y1="0" x2="0" y2="1">

                  <stop offset="0%" stopColor="#E53935" stopOpacity={1} />

                  <stop offset="100%" stopColor="#E53935" stopOpacity={0.4} />

                </linearGradient>

              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />

              <XAxis dataKey="d" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />

              <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />

              <Tooltip cursor={{ fill: '#FFEBEE' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />

              <Bar dataKey="v" fill="url(#dashBarGrad)" radius={[6, 6, 0, 0]} barSize={32} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />

            </BarChart>

          </ResponsiveContainer>

        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <TopItemsWidget dashboardScope={dashboardScope} restaurantId={restaurant?.id} />
        </div>

      </div>

      

      <div className={card + " p-0 overflow-hidden flex flex-col h-[320px] lg:h-auto animate-chart-in-delay-1"}>

        <div className="p-4 border-b border-[#FFCDD2] bg-gray-50 flex items-center justify-between">

          <h3 className="font-bold text-sm md:text-base flex items-center gap-2">

            <ClipboardList size={18} className="text-[#E53935]" />

            Live Activity

          </h3>

          <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>

        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">

          {activityLog.length === 0 ? (

            <p className="text-sm text-gray-400 text-center py-6">No live activity yet</p>

          ) : (

            activityLog.map((log) => (

              <div key={log.id} className="flex gap-3 animate-slide-in">

                <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${

                  log.type === "success" ? "bg-green-500" : 

                  log.type === "info" ? "bg-blue-500" : 

                  log.type === "tip" ? "bg-amber-500" : "bg-red-500"

                }`} />

                <div className="flex-grow min-w-0">

                  <p className="text-xs font-medium text-[#1A1A1A] leading-relaxed">{log.text}</p>

                  <p className="text-[10px] text-[#6B6B6B] mt-1">{log.time}</p>

                </div>

              </div>

            ))

          )}

        </div>

      </div>

      <div className={card + " p-4 flex flex-col animate-chart-in-delay-2"}>
        <h3 className="mb-4 font-bold text-sm md:text-base flex items-center gap-2">
          <StarIcon size={18} className="text-amber-500 fill-amber-500" />
          Today Specials Sold
        </h3>
        <TodaySpecialsSoldWidget dashboardScope={dashboardScope} restaurantId={restaurant?.id} />
      </div>

    </div>

  </div>;

}



function TopItemsWidget({ dashboardScope, restaurantId }) {
  const [topItems, setTopItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const socket = useSocket(restaurantId);

  useEffect(() => {
    let cancelled = false;
    const loadTopItems = async () => {
      try {
        setLoading(true);
        const outletId = dashboardScope === 'all' ? 'all' : restaurantId;
        const res = await fetch(`${API_BASE}/api/analytics/top-items?outletId=${outletId}&limit=3&sortBy=quantity`, {
          headers: { ...getAuthHeaders() },
        });
        if (!res.ok) throw new Error('Failed to fetch top items');
        const data = await res.json();
        if (!cancelled) setTopItems(data.items || []);
      } catch (err) {
        console.warn('[TopItemsWidget] Failed to load top items:', err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadTopItems();
    const interval = setInterval(loadTopItems, 600000); // 10 minutes
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dashboardScope, restaurantId]);

  useEffect(() => {
    if (!socket) return;
    const loadTopItems = async () => {
      try {
        const outletId = dashboardScope === 'all' ? 'all' : restaurantId;
        const res = await fetch(`${API_BASE}/api/analytics/top-items?outletId=${outletId}&limit=3&sortBy=quantity`, {
          headers: { ...getAuthHeaders() },
        });
        if (!res.ok) throw new Error('Failed to fetch top items');
        const data = await res.json();
        setTopItems(data.items || []);
      } catch (err) {
        console.warn('[TopItemsWidget] Failed to load top items:', err.message);
      }
    };
    const onOrderPaid = () => loadTopItems();
    socket.on('order:paid', onOrderPaid);
    return () => {
      socket.off('order:paid', onOrderPaid);
    };
  }, [socket, dashboardScope, restaurantId]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg" />)}
      </div>
    );
  }

  if (topItems.length === 0) {
    return <p className="text-xs text-gray-400 font-bold">No sales data yet</p>;
  }

  return (
    <div>
      <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Top Selling Items</h4>
      <div className="space-y-2">
        {topItems.map((item, idx) => (
          <div key={item.name} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-5 h-5 rounded-full bg-[#E53935] text-white text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
              <span className="text-sm font-bold text-gray-900 truncate">{item.name}</span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-black text-[#E53935]">{item.quantity}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase ml-1">sold</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



function TodaySpecialsSoldWidget({ dashboardScope, restaurantId }) {
  const [specials, setSpecials] = useState([]);
  const [loading, setLoading] = useState(true);
  const socket = useSocket(restaurantId);

  const loadSpecials = useCallback(async () => {
    try {
      setLoading(true);
      const outletId = dashboardScope === 'all' ? 'all' : restaurantId;
      const res = await fetch(`${API_BASE}/api/analytics/today-specials-sold?outletId=${outletId}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Failed to fetch today specials sold');
      const data = await res.json();
      setSpecials(data.specials || []);
    } catch (err) {
      console.warn('[TodaySpecialsSoldWidget] Failed to load:', err.message);
    } finally {
      setLoading(false);
    }
  }, [dashboardScope, restaurantId]);

  useEffect(() => {
    loadSpecials();
  }, [loadSpecials]);

  useEffect(() => {
    if (!socket) return;
    const onOrderPaid = () => {
      loadSpecials();
    };
    socket.on('order:paid', onOrderPaid);
    return () => {
      socket.off('order:paid', onOrderPaid);
    };
  }, [socket, loadSpecials]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg" />)}
      </div>
    );
  }

  if (specials.length === 0) {
    return <p className="text-xs text-gray-400 font-bold">No specials sold today</p>;
  }

  return (
    <div>
      <h4 className="text-xs font-black uppercase tracking-widest text-amber-500 mb-3 flex items-center gap-2">
        <StarIcon size={14} className="fill-amber-500" /> Today Specials Sold
      </h4>
      <div className="space-y-2">
        {specials.map(special => (
          <div key={special.id} className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-black text-gray-500 uppercase">{special.specialChannel || 'BOTH'}</span>
              <span className="text-sm font-bold text-gray-900 truncate">{special.name}</span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-black text-[#E53935]">{special.soldCount}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase ml-1">sold</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



export function Pos() {

  const [cart, setCart] = useState([]);

  const [cat, setCat] = useState("All");

  const [search, setSearch] = useState("");

  const [kotStatus, setKotStatus] = useState(null);

  const [table, setTable] = useState("8");

  const { menuItems, categories, loading } = useMenu();



  const displayItems = useMemo(

    () => filterMenuItems(menuItems, { query: search, category: cat }),

    [cat, search, menuItems]

  );



  const { subtotal, taxes: gst, total } = calculateOrderTotal(cart);



  const handleSendToKitchen = () => {

    if (cart.length === 0) return;

    setKotStatus('sending');

    onKOTSend("Admin", table);

    setTimeout(() => {

      setKotStatus('delivered');

      setTimeout(() => {

        setKotStatus('accepted');

        setTimeout(() => setKotStatus(null), 3000);

      }, 1500);

    }, 1500);

  };



  const handleBill = (paymentMode) => {

    if (cart.length === 0) return;

    onOrderComplete("ADMIN", total, cart.length, paymentMode, cart);

    setCart([]);

    alert(`Order closed. Payment: ${paymentMode}`);

  };



  const addToCart = (item) => {

    setCart(prev => {

      const existing = prev.find(x => x.n === item.n);

      if (existing) return prev.map(x => x.n === item.n ? { ...x, q: x.q + 1 } : x);

      return [...prev, { ...item, q: 1 }];

    });

  };



  const removeFromCart = (name) => {

    setCart(prev => prev.filter(x => x.n !== name));

  };



  return (

    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 font-sans">

      <div className="lg:col-span-3 space-y-4">

        <div className="flex flex-col sm:flex-row gap-3">

          <div className="relative flex-grow">

            <input

              type="search"

              className={input + " pl-10 h-11"}

              placeholder="Search by name, category, price, or ID..."

              value={search}

              onChange={(e) => setSearch(e.target.value)}

              autoComplete="off"

            />

            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] pointer-events-none" size={18} />

          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">

            {categories.map((x) => (

              <button key={x} onClick={() => setCat(x)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${cat === x ? "border-[#E53935] bg-[#E53935] text-white shadow-md shadow-red-100" : "border-[#FFCDD2] bg-white text-[#6B6B6B] hover:bg-[#FFF5F5]"}`}>{x}</button>

            ))}

          </div>

        </div>

        {loading ? (

          <p className="text-sm text-[#6B6B6B] py-8 text-center">Syncing menu from server...</p>

        ) : (

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">

          {displayItems.length === 0 && !loading && (

            <p className="col-span-full text-sm text-[#6B6B6B] py-8 text-center">

              {search.trim() ? `No items found for "${search.trim()}"` : "No items in this category."}

            </p>

          )}

          {displayItems.map((x) => (

            <div key={x.n} onClick={() => addToCart(x)} className={card + " p-3 flex flex-col justify-between transition-transform active:scale-95 cursor-pointer group hover:border-[#E53935]"}>

              <div>

                <p className="font-bold text-sm md:text-base text-[#1A1A1A] line-clamp-1 group-hover:text-[#E53935]">{x.n}</p>

                <p className="text-sm font-semibold text-[#6B6B6B] mt-0.5 whitespace-nowrap">₹{x.p}</p>

              </div>

              <div className="mt-3 flex items-center justify-between">

                <div className={`h-4 w-4 rounded-sm border flex items-center justify-center ${x.t === "veg" ? "border-green-600" : "border-red-600"}`}>

                  <div className={`h-1.5 w-1.5 rounded-full ${x.t === "veg" ? "bg-green-600" : "bg-red-600"}`} />

                </div>

                <button className={btn + " px-3 py-1 text-[10px] md:text-xs rounded-full"}>Add</button>

              </div>

            </div>

          ))}

        </div>

        )}

      </div>

      <div className="lg:col-span-2 space-y-4">

        <div className={card + " p-4 h-fit lg:sticky lg:top-20 shadow-lg shadow-red-50/50"}>

          <div className="flex items-center justify-between border-b border-[#FFCDD2] pb-3 mb-3">

            <h3 className="font-bold text-[#1A1A1A]">Order <span className="text-[#B71C1C]">#1043</span></h3>

            <span className="text-xs bg-[#FFEBEE] text-[#B71C1C] px-2 py-0.5 rounded-full font-bold">Table {table}</span>

          </div>

          <div className="space-y-3 max-h-[35vh] lg:max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">

            {cart.length === 0 ? (

              <div className="py-10 text-center text-[#6B6B6B] text-sm italic">Cart is empty. Add some items to start.</div>

            ) : (

              cart.map((item) => (

                <div key={item.n} className="flex justify-between items-center text-sm group">

                  <div className="flex flex-col">

                    <span className="font-medium">{item.n}</span>

                    <span className="text-[10px] text-[#6B6B6B]">₹{item.p} x {item.q}</span>

                  </div>

                  <div className="flex items-center gap-3">

                    <span className="font-bold">₹{item.p * item.q}</span>

                    <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.n); }} className="text-[#E53935] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>

                  </div>

                </div>

              ))

            )}

          </div>

          <div className="mt-4 border-t border-[#FFCDD2] pt-3 space-y-1">

            <div className="flex justify-between text-xs text-[#6B6B6B]"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>

            <div className="flex justify-between text-xs text-[#6B6B6B]"><span>GST ({(() => { const c = getRestaurantConfig(); const isAc = String(c.gstCategory).toUpperCase() === 'AC'; const r = c.gstRegistered === false ? 0 : (c.gstRate ?? (isAc ? 18 : 5)); return r; })()}%)</span><span>₹{gst.toFixed(2)}</span></div>

            <div className="flex justify-between text-base font-black text-[#1A1A1A] pt-1"><span>Total</span><span>₹{total.toFixed(2)}</span></div>

          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">

            {["Cash", "Card", "UPI"].map((x, i) => (

              <button key={x} onClick={() => handleBill(x)} className={`rounded-md border py-2 text-xs font-bold transition-all ${i === 2 ? "border-[#E53935] bg-[#FFEBEE] text-[#B71C1C]" : "border-[#FFCDD2] bg-white text-[#6B6B6B] hover:bg-[#FFF5F5]"}`}>{x}</button>

            ))}

          </div>

          <div className="mt-4 space-y-2">

            <button onClick={handleSendToKitchen} disabled={!!kotStatus} className={`${btn} w-full py-3 text-sm shadow-md flex items-center justify-center gap-2 ${kotStatus ? 'bg-amber-600' : ''}`}>

              {kotStatus === 'sending' ? 'Sending...' : kotStatus === 'delivered' ? 'Delivered' : kotStatus === 'accepted' ? 'Accepted' : <><UtensilsCrossed size={16} /> Send to Kitchen</>}

            </button>

            <button onClick={() => setCart([])} className="w-full rounded-md border border-[#FFCDD2] py-2 text-xs font-bold hover:bg-[#FFF5F5]">Clear Cart</button>

          </div>

        </div>

      </div>

    </div>

  );

}



export function Tables({ onOpen }) {

  const [activePopupTableId, setActivePopupTableId] = useState(null);
  const [popupCaptainId, setPopupCaptainId] = useState('');
  const [savingCaptain, setSavingCaptain] = useState(false);

  const [editMode, setEditMode] = useState(false);

  const { tables } = useTableSync();

  useEffect(() => {
    const t = tables.find(t => (t.backendId || t.id) === activePopupTableId);
    setPopupCaptainId(t?.captainId || '');
  }, [activePopupTableId, tables]);

  const [venues, setVenues] = useState([]);

  const [selectedSectionId, setSelectedSectionId] = useState('');

  const [loadingVenues, setLoadingVenues] = useState(true);

  const [staffMap, setStaffMap] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/staff`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const map = {};
        (Array.isArray(data) ? data : []).forEach(s => { if (s.id && s.name) map[s.id] = s.name; });
        setStaffMap(map);
      })
      .catch(() => {});
  }, []);



  useEffect(() => {

    fetchVenues()

      .then(data => {

        const v = Array.isArray(data) ? data : [];

        setVenues(v);

        const allSections = v.flatMap(venue => [

          ...(venue.sections || []).map(s => ({ ...s, venueName: venue.name })),

          ...(venue.floors || []).flatMap(f => (f.sections || []).map(s => ({ ...s, venueName: venue.name }))),

        ]);

        if (allSections.length > 0) {

          setSelectedSectionId(allSections[0].id);

        }

      })

      .catch(() => {})

      .finally(() => setLoadingVenues(false));

  }, []);



  const allSections = useMemo(() => {

    return venues.flatMap(venue => [

      ...(venue.sections || []).map(s => ({ ...s, venueName: venue.name })),

      ...(venue.floors || []).flatMap(f => (f.sections || []).map(s => ({ ...s, venueName: venue.name }))),

    ]);

  }, [venues]);



  const selectedSection = allSections.find(s => s.id === selectedSectionId);

  const filteredTables = selectedSectionId

    ? tables.filter(t => t.sectionId === selectedSectionId || t.section?.id === selectedSectionId)

    : tables;



  if (editMode) {

    return (

      <div className="space-y-4 font-sans">

        <div className="flex items-center justify-between">

          <h3 className="font-semibold">Space Management</h3>

          <button

            onClick={() => setEditMode(false)}

            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-bold rounded-lg transition"

          >

            <Edit2 size={14} /> Exit Edit

          </button>

        </div>

        <FloorPlanEditor />

      </div>

    );

  }



  return <div className="space-y-4 font-sans">

    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

      <h3 className="font-semibold">

        {selectedSection ? `Floor Plan — ${selectedSection.venueName} — ${selectedSection.name}` : 'Floor Plan'}

      </h3>

      <div className="flex items-center gap-2">

        <select

          className={input + " w-full sm:max-w-52"}

          value={selectedSectionId}

          onChange={e => setSelectedSectionId(e.target.value)}

          disabled={loadingVenues}

        >

          {allSections.map(s => (

            <option key={s.id} value={s.id}>{s.venueName} — {s.name}</option>

          ))}

        </select>

        <button

          onClick={() => setEditMode(true)}

          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E53935] text-white text-xs font-bold rounded-lg hover:bg-[#B71C1C] transition flex-shrink-0"

        >

          <Edit2 size={14} /> Edit Layout

        </button>

      </div>

    </div>

    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">

      {filteredTables.map((t) => {

        const isFree = !t.status || t.status === 'Free' || t.status === 'available';

        const isReserved = t.status === 'reserved';

        

        // Define colors like Cashier/Captain

        let bgClass = "bg-[#E8F5E9] text-[#1B5E20]";

        if (t.status === 'Waiting Bill') {

           bgClass = "bg-[#FFEBEE] text-[#B71C1C] border-[#E53935] animate-pulse";

        } else if (t.status === 'Preparing') {

           bgClass = "bg-[#FFF8E1] text-[#F57F17] border-[#F57F17]";

        } else if (!isFree && !isReserved) {

           bgClass = "bg-[#FFF8E1] text-[#F57F17] border-[#F57F17]";

        } else if (isReserved) {

           bgClass = "bg-[#FFF3E0] text-[#8D4E00]";

        }



        const items = (t.kotHistory && t.kotHistory.length > 0) ? t.kotHistory.flatMap(k => k.items || []) : (t.items || []);

        const itemsCount = items.reduce((sum, i) => sum + i.q, 0);

        const captainName = t.captainName || staffMap[t.captainId] || 'Staff';



        let details = "Available";

        if (!isFree && !isReserved) {

           details = `${t.guests || 0} guests — ₹${t.currentBill || 0}`;

        } else if (isReserved) {

           details = t.details || "Reserved";

        }

        

        const label = isFree ? "Available" : isReserved ? `Reserved — ${details}` : `${t.status} — ${details}`;

        

        return (

          <button

             key={t.backendId || t.id}

             onClick={() => {

               if (!isFree && !isReserved) {

                 setActivePopupTableId(t.backendId || t.id);

               }

             }}

             className={`${cardBase} ${bgClass} min-h-[100px] p-3 text-left transition-all active:scale-95 flex flex-col justify-between`}

          >

             <div className="flex justify-between items-start w-full">

               <p className="text-xl font-black leading-none">T{t.id}</p>

               {!isFree && !isReserved && (

                 <span className="text-[9px] font-black uppercase bg-white/20 px-1.5 py-0.5 rounded">{formatTableTime(t.time)}</span>

               )}

             </div>

             

             {isFree || isReserved ? (

               <p className="text-[11px] font-bold mt-2">{label}</p>

             ) : (

               <div className="mt-2 space-y-1.5 w-full">

                 <div className="flex justify-between items-center text-[10px]">

                   <span className="font-bold truncate opacity-90 flex items-center gap-1"><User size={10} /> {captainName}</span>

                   <span className="font-black flex items-center gap-1"><Users size={10} /> {t.guests || 0}</span>

                 </div>

                 

                 {items.length > 0 && (

                   <div className="text-[9px] leading-tight opacity-90 border-t border-white/20 pt-1.5">

                     <p className="truncate font-medium">

                       {items.slice(0, 2).map(i => `${i.q}x ${i.n}`).join(', ')}

                     </p>

                     {items.length > 2 && (

                       <p className="italic text-[8px] mt-0.5">+{items.length - 2} more items</p>

                     )}

                   </div>

                 )}

                 

                 <div className="flex justify-between items-end border-t border-white/20 pt-1.5 mt-1">

                   <div className="flex flex-col">

                     <span className="text-[8px] uppercase tracking-widest opacity-80">{t.status}</span>

                     <span className="text-[9px] font-bold">{itemsCount} Items</span>

                   </div>

                   <span className="text-sm font-black">₹{t.currentBill || 0}</span>

                 </div>

               </div>

             )}

          </button>

        );

      })}

    </div>

    <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-3 border border-[#FFCDD2] shadow-sm">

      <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Status:</span>

      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#FFF8E1] border border-[#F57F17]" /><span className="text-xs font-medium">Occupied</span></div>

      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#E8F5E9] border border-[#1B5E20]" /><span className="text-xs font-medium">Available</span></div>

      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#FFEBEE] border border-[#E53935]" /><span className="text-xs font-medium">Billing Requested</span></div>

      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#FFF3E0] border border-[#8D4E00]" /><span className="text-xs font-medium">Reserved</span></div>

    </div>



    {/* LIVE SESSION DETAILS POPUP */}

    {activePopupTableId && (() => {

      const pTable = tables.find(t => (t.backendId || t.id) === activePopupTableId);

      if (!pTable || !pTable.status || pTable.status === 'Free' || pTable.status === 'available') {

         setTimeout(() => setActivePopupTableId(null), 0);

         return null;

      }

      

      const rawItems = (pTable.activeOrder?.items?.length > 0)
        ? pTable.activeOrder.items
        : (pTable.kotHistory && pTable.kotHistory.length > 0)
          ? pTable.kotHistory.flatMap(k => k.items || [])
          : (pTable.items || []);
      const pItems = rawItems.map(i => ({
        q: i.q ?? i.quantity ?? 1,
        n: i.n ?? i.name ?? 'Item',
        s: i.s ?? i.status ?? 'Sent',
      }));

      const pCount = pItems.reduce((sum, i) => sum + Number(i.q || 0), 0);

      const pCaptainName = pTable.captainName || staffMap[pTable.captainId] || 'Staff';

      

      return (

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in duration-200" onClick={() => setActivePopupTableId(null)}>

          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>

             <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">

                <div className="flex items-center gap-3">

                   <div className={`w-3 h-3 rounded-full ${pTable.status === 'Waiting Bill' ? 'bg-amber-500 animate-pulse' : pTable.status === 'Preparing' ? 'bg-orange-500' : 'bg-red-600'}`} />

                   <h3 className="font-black text-lg text-gray-900 tracking-tight">Table {pTable.number ?? pTable.id}</h3>

                   <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-gray-200 text-gray-700">{pTable.status}</span>

                </div>

                <button onClick={() => setActivePopupTableId(null)} className="p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 rounded-lg transition-colors">

                   <X size={18} />

                </button>

             </div>

             

             <div className="p-5">

                <div className="flex items-center justify-between mb-5">

                   <div className="flex flex-col gap-0.5">

                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Assigned Captain</span>

                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><User size={14} className="text-gray-400"/> {pCaptainName}</span>

                   </div>

                   <div className="flex gap-4 text-right">

                      <div className="flex flex-col gap-0.5">

                         <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Guests</span>

                         <span className="text-sm font-bold text-gray-900 flex items-center gap-1 justify-end"><Users size={14} className="text-gray-400"/> {pTable.guests || 0}</span>

                      </div>

                      <div className="flex flex-col gap-0.5">

                         <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Duration</span>

                         <span className="text-sm font-bold text-gray-900 flex items-center gap-1 justify-end"><Clock size={14} className="text-gray-400"/> {formatTableTime(pTable.time)}</span>

                      </div>

                   </div>

                </div>



                <div className="mb-5">

                   <div className="flex items-center justify-between mb-2">

                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Active Order ({pCount} Items)</span>

                      <span className="text-[10px] font-black uppercase text-green-600 tracking-widest">{(pTable.kotHistory || []).length} KOTs</span>

                   </div>

                   

                   <div className="bg-gray-50 border border-gray-100 rounded-xl p-1 max-h-48 overflow-y-auto custom-scrollbar">

                      {pItems.length > 0 ? pItems.map((item, idx) => (

                         <div key={idx} className="flex items-center justify-between p-2 hover:bg-white rounded-lg transition-colors border-b border-transparent hover:border-gray-100">

                            <div className="flex items-center gap-3">

                               <div className="w-6 h-6 rounded bg-white border border-gray-200 flex items-center justify-center text-[10px] font-black text-gray-700">{item.q}x</div>

                               <span className="text-[12px] font-bold text-gray-800">{item.n}</span>

                            </div>

                            <span className="text-[10px] font-black uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{item.s || 'Sent'}</span>

                         </div>

                      )) : (

                         <div className="text-center py-4 text-xs font-bold text-gray-400">No items submitted yet</div>

                      )}

                   </div>

                </div>



                <div className="pt-4 border-t border-gray-100 flex items-end justify-between">

                   <div className="flex flex-col gap-1">

                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Live Running Total</span>

                      <span className="text-xs font-bold text-gray-500">Including Taxes (5% GST)</span>

                   </div>

                   <span className="text-2xl font-black text-[#E53935] tracking-tight">₹{pTable.currentBill || 0}</span>

                </div>

             </div>

          </div>

        </div>

      );

    })()}

  </div>;

}



export function MenuPage({ onAddDish }) {

  const { menuItems, allMenuItems, updateMenu, loading, error, refreshMenu, setGlobalMenu } = useMenu();

  const { restaurant } = useAuth();

  const configuredPrinters = restaurant?.printerConfig?.printers || [];
  const agentAvailablePrinters = restaurant?.printerConfig?.availablePrinters || [];

  // Live agent data polled from cashier desktop
  const [liveAgentData, setLiveAgentData] = useState(null);

  useEffect(() => {
    const fetchLivePrinters = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/print/agent-status`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setLiveAgentData(data);
        }
      } catch (e) {
        console.error('[Admin] Failed to fetch live printer config:', e);
      }
    };
    fetchLivePrinters();
    const id = setInterval(fetchLivePrinters, 120_000); // 2 minutes
    return () => clearInterval(id);
  }, [restaurant?.id]);

  // Build a deduplicated list of all known printers from:
  // 1. Manually configured printers (admin settings)
  // 2. Live printers from print agent on cashier desktop (prioritized)
  // 3. Live agent mapping values (kitchen/bar/bill → printer name)
  // 4. Cached availablePrinters from restaurant object
  const allPrinterOptions = useMemo(() => {
    const map = new Map();
    // Configured printers first
    configuredPrinters.forEach(p => {
      if (p.name) map.set(p.name, { name: p.name, type: p.type || '', source: 'configured' });
    });
    // Live agent printers (highest priority — these are what's actually connected)
    const liveAgentPrinters = liveAgentData?.availablePrinters || [];
    liveAgentPrinters.forEach(name => {
      if (typeof name === 'string') {
        map.set(name, { name, type: '', source: 'agent-live' });
      }
    });
    // Live agent mapping values — the actual printer names assigned to kitchen/bar/bill
    const liveMapping = liveAgentData?.agentMapping || {};
    Object.values(liveMapping).forEach(name => {
      if (typeof name === 'string' && name && !map.has(name)) {
        map.set(name, { name, type: '', source: 'agent-mapped' });
      }
    });
    // Legacy cached fallback from restaurant object
    agentAvailablePrinters.forEach(name => {
      if (typeof name === 'string' && !map.has(name)) {
        map.set(name, { name, type: '', source: 'agent-cached' });
      }
    });
    return Array.from(map.values());
  }, [configuredPrinters, agentAvailablePrinters, liveAgentData]);

  const [filter, setFilter] = useState("");

  const [activeVenueId, setActiveVenueId] = useState(null);

  const [showHiddenVenueItems, setShowHiddenVenueItems] = useState(false);



  // ── Admin items: fetched from admin endpoint (includes unavailable) ───

  const [adminItems, setAdminItems] = useState([]);

  const [adminLoading, setAdminLoading] = useState(true);

  const [activeOutlet, setActiveOutlet] = useState('restaurant'); // 'restaurant' | 'bar'



  // ── Venue/section resolution from actual tenant venues ──

  const { outlets, venueColumns: currentVenueColumns } = useVenueSections(activeOutlet);



  // Keep activeOutlet valid when outlets list changes

  useEffect(() => {

    if (outlets.length > 0 && !outlets.includes(activeOutlet)) {

      setActiveOutlet(outlets[0]);

    }

  }, [outlets, activeOutlet]);



  const fetchAdminItems = useCallback(async () => {

    try {

      setAdminLoading(true);

      let url;

      if (activeOutlet === 'bar') {

        url = `${API_BASE}/api/bar/menu/items?restaurantId=${getCurrentRestaurantId()}`;

      } else {

        url = `${API_BASE}/api/menu/items/admin?restaurantId=${getCurrentRestaurantId()}`;

      }



      const res = await fetch(url, { headers: { ...getAuthHeaders() } });

      if (!res.ok) throw new Error('Admin fetch failed');

      const data = await res.json();

      // Map to POS shape, preserving isAvailable

      const DEFAULT_IMG = '/placeholder.svg';

      setAdminItems(data.map(item => ({

        id: item.id,

        n: item.name,

        p: Math.round(item.price ?? 0),

        c: item.category,

        t: item.isVeg ? 'veg' : 'non',

        img: item.imageUrl || DEFAULT_IMG,

        desc: item.description || '',

        menuType: item.menuType,

        isAvailable: item.isAvailable,

        venuePrices: item.venuePrices || {},

        categoryPrinterTarget: item.categoryPrinterTarget,

        printerTarget: item.printerTarget,

        printerName: item.printerName,

        gstEnabled: item.gstEnabled !== false,

      })));

    } catch (err) {

      console.error('[MenuPage] Failed to load admin items:', err);

      // Fall back to the POS cache so the table still shows something

      setAdminItems(allMenuItems.map(i => ({ ...i, isAvailable: i.isAvailable !== false })));

    } finally {

      setAdminLoading(false);

    }

  }, [allMenuItems, activeOutlet]);



  useEffect(() => { fetchAdminItems(); }, []);



  // Reset venue tab when switching outlets and refetch

  useEffect(() => {

    setActiveVenueId(currentVenueColumns[0]?.id ?? null);

    fetchAdminItems(); // Refetch when outlet changes

  }, [activeOutlet, fetchAdminItems]);



  // Keep activeVenueId valid once columns load / change.

  useEffect(() => {

    if (currentVenueColumns.length === 0) return;

    const exists = currentVenueColumns.some((c) => c.id === activeVenueId);

    if (!exists) setActiveVenueId(currentVenueColumns[0].id);

  }, [currentVenueColumns, activeVenueId]);



  const items = useMemo(() => {

    return adminItems

      .filter((x) => {

        // If only one venue column, show all items unfiltered

        if (currentVenueColumns.length <= 1) return true;

        return showHiddenVenueItems || Number(x.venuePrices?.[activeVenueId] || 0) > 0;

      })

      .filter((x) => menuItemMatchesSearch(x, filter));

  }, [filter, adminItems, activeVenueId, showHiddenVenueItems, currentVenueColumns]);



  const activeVenue = currentVenueColumns.find((venue) => venue.id === activeVenueId) || currentVenueColumns[0];



  const [editingItem, setEditingItem] = useState(null);

  const [addingItem, setAddingItem] = useState(null);

  const [deletingItem, setDeletingItem] = useState(null);

  const [showUploadModal, setShowUploadModal] = useState(false);

  const [saving, setSaving] = useState(false);

  const [deleteWorking, setDeleteWorking] = useState(false);

  const [togglingId, setTogglingId] = useState(null);

  const [togglingMenuTypeId, setTogglingMenuTypeId] = useState(null);



  // Recipe editor state (Phase 5)

  const [recipeRows, setRecipeRows] = useState([]);

  const [kitchenIngredients, setKitchenIngredients] = useState([]);

  const [recipeLoading, setRecipeLoading] = useState(false);

  // Auto-generate recipes state
  const [autoGenLoading, setAutoGenLoading] = useState(false);
  const [autoGenResult, setAutoGenResult] = useState(null);
  const [autoGenConfirm, setAutoGenConfirm] = useState(false);
  const [autoGenError, setAutoGenError] = useState(null);



  // ── Availability toggle with optimistic update ─────────────────────────

  const handleToggleAvailability = useCallback(async (item) => {

    if (togglingId) return;

    const hasMultiVenue = currentVenueColumns.length > 1 && activeVenueId;

    const venueAvail = item.venueAvailabilities?.[activeVenueId] !== false;

    const isVenueScope = hasMultiVenue && item.isAvailable !== false;

    const newValue = isVenueScope ? !venueAvail : !item.isAvailable;

    setTogglingId(item.id);



    // Optimistic UI update

    setAdminItems(prev =>

      prev.map(i => {

        if (i.id !== item.id) return i;

        if (isVenueScope) {
          return { ...i, venueAvailabilities: { ...i.venueAvailabilities, [activeVenueId]: newValue } };

        }

        return { ...i, isAvailable: newValue };

      })

    );



    try {

      let endpoint;

      let body = undefined;

      if (isVenueScope) {

        endpoint = activeOutlet === 'bar'

          ? `${API_BASE}/api/bar/menu/items/${item.id}/venue-availability`

          : `${API_BASE}/api/menu/items/${item.id}/venue-availability`;

        body = JSON.stringify({ venueId: activeVenueId });

      } else {

        endpoint = activeOutlet === 'bar'

          ? `${API_BASE}/api/bar/menu/items/${item.id}/availability`

          : `${API_BASE}/api/menu/items/${item.id}/availability`;

      }

      const res = await fetch(endpoint, {

        method: 'PATCH',

        headers: body ? { 'Content-Type': 'application/json', ...getAuthHeaders() } : { ...getAuthHeaders() },

        ...(body && { body }),

      });

      if (!res.ok) throw new Error('Toggle failed');

      // Backend confirmed — also refresh the shared POS menu so unavailable items disappear

      refreshMenu().catch(() => {});

    } catch (err) {

      console.error('[MenuPage] Availability toggle failed:', err);

      // Revert on error

      setAdminItems(prev =>

        prev.map(i => {

          if (i.id !== item.id) return i;

          if (isVenueScope) {
            return { ...i, venueAvailabilities: { ...i.venueAvailabilities, [activeVenueId]: !newValue } };

          }

          return { ...i, isAvailable: !newValue };

        })

      );

      alert('Could not update availability. Please try again.');

    } finally {

      setTogglingId(null);

    }

  }, [togglingId, refreshMenu, activeVenueId, currentVenueColumns, activeOutlet]);



  const handleToggleMenuType = useCallback(async (item) => {
    if (togglingMenuTypeId) return;
    const newType = item.menuType === 'LIQUOR' ? 'FOOD' : 'LIQUOR';

    // Determine default printer for the new type — use agent mapping first, then fall back to type-based search
    const agentMap = liveAgentData?.agentMapping || {};
    const defaultPrinter = newType === 'LIQUOR'
      ? agentMap.bar || allPrinterOptions.find(p => (p.type === 'BAR' || p.name.toLowerCase().includes('bar')))?.name || ''
      : agentMap.kitchen || allPrinterOptions.find(p => (p.type === 'KITCHEN' || p.type === 'KOT' || p.name.toLowerCase().includes('kitchen')))?.name || '';

    const newPrinterTarget = defaultPrinter || item.printerTarget || item.categoryPrinterTarget || '';

    setTogglingMenuTypeId(item.id);

    // Optimistic update: flip menuType AND set printerTarget
    setAdminItems(prev =>
      prev.map(i => i.id === item.id ? { ...i, menuType: newType, printerTarget: newPrinterTarget || null } : i)
    );

    try {
      const endpoint = activeOutlet === 'bar'
        ? `${API_BASE}/api/bar/menu/items/${item.id}`
        : `${API_BASE}/api/menu/items/${item.id}/menu-type`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          menuType: newType,
          ...(newPrinterTarget ? { printerTarget: newPrinterTarget } : {}),
        }),
      });

      if (!res.ok) throw new Error('Toggle failed');
      refreshMenu().catch(() => {});
    } catch (err) {
      console.error('[MenuPage] Menu type toggle failed:', err);
      // Revert on error
      setAdminItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, menuType: item.menuType, printerTarget: item.printerTarget } : i)
      );
      alert('Could not update menu type. Please try again.');
    } finally {
      setTogglingMenuTypeId(null);
    }
  }, [togglingMenuTypeId, refreshMenu, activeOutlet, allPrinterOptions, liveAgentData]);



  // ── Dynamic categories ────────────────────────────────────────────────

  const [dbCategories, setDbCategories] = useState([]);

  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const [editingCatId, setEditingCatId] = useState(null);

  const [editingCatName, setEditingCatName] = useState('');

  const [newCatName, setNewCatName] = useState('');

  const [catSaving, setCatSaving] = useState(false);



  const fetchCategories = useCallback(async () => {

    try {

      setCategoriesLoading(true);

      const res = await fetch(`${API_BASE}/api/menu/categories?restaurantId=${getCurrentRestaurantId()}`);

      if (!res.ok) throw new Error('Failed to fetch categories');

      const data = await res.json();

      setDbCategories(Array.isArray(data) ? data.filter(c => c.isActive !== false) : []);

    } catch (err) {

      console.error('[MenuPage] Failed to load categories:', err);

    } finally {

      setCategoriesLoading(false);

    }

  }, []);



  useEffect(() => {

    fetchCategories();

  }, [fetchCategories]);



  // Category item counts from adminItems

  const categoryItemCounts = useMemo(() => {

    const counts = {};

    adminItems.forEach(item => {

      const cat = item.c || 'Uncategorized';

      counts[cat] = (counts[cat] || 0) + 1;

    });

    return counts;

  }, [adminItems]);



  const handleCategoryRename = async (id, name) => {

    if (!name.trim()) { setEditingCatId(null); return; }

    setCatSaving(true);

    try {

      const res = await fetch(`${API_BASE}/api/menu/categories/${id}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify({ name: name.trim() }),

      });

      if (!res.ok) {

        const err = await res.json();

        throw new Error(err.error || 'Failed to rename category');

      }

      await fetchCategories();

    } catch (err) {

      alert(err.message);

    } finally {

      setCatSaving(false);

      setEditingCatId(null);

    }

  };



  const handleCategoryReorder = async (id, newSortOrder) => {

    setCatSaving(true);

    try {

      const res = await fetch(`${API_BASE}/api/menu/categories/${id}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify({ sortOrder: newSortOrder }),

      });

      if (!res.ok) throw new Error('Failed to reorder category');

      await fetchCategories();

    } catch (err) {

      alert(err.message);

    } finally {

      setCatSaving(false);

    }

  };



  const handleCategoryDelete = async (id) => {

    if (!confirm('Delete this category? Items using it will become Uncategorized.')) return;

    setCatSaving(true);

    try {

      const res = await fetch(`${API_BASE}/api/menu/categories/${id}`, {

        method: 'DELETE',

        headers: getAuthHeaders(),

      });

      if (res.status === 400) {

        const err = await res.json();

        alert(err.error);

        return;

      }

      if (!res.ok) throw new Error('Failed to delete category');

      await fetchCategories();

    } catch (err) {

      alert(err.message);

    } finally {

      setCatSaving(false);

    }

  };



  const handleCategoryAdd = async () => {

    if (!newCatName.trim()) return;

    setCatSaving(true);

    try {

      const res = await fetch(`${API_BASE}/api/menu/categories`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify({ name: newCatName.trim() }),

      });

      if (!res.ok) {

        const err = await res.json();

        throw new Error(err.error || 'Failed to create category');

      }

      setNewCatName('');

      await fetchCategories();

    } catch (err) {

      alert(err.message);

    } finally {

      setCatSaving(false);

    }

  };



  const handleEdit = async (item) => {

    setEditingItem({

      originalName: item.n,

      ...item,

      basePrice: item.p,

      venuePrice: item.venuePrices?.[activeVenueId] ?? item.p,

      categoryPrinterTarget: item.categoryPrinterTarget,

    });



    // Fetch existing recipe + available ingredients for FOOD items

    if (item.menuType !== 'LIQUOR') {

      setRecipeLoading(true);

      try {

        const rid = getCurrentRestaurantId();

        const [recipeRes, ingredientsRes] = await Promise.all([

          fetch(`${API_BASE}/api/menu/recipes/${item.id}`, { headers: { ...getAuthHeaders() } }),

          fetch(`${API_BASE}/api/inventory/kitchen?restaurantId=${rid}`, { headers: { ...getAuthHeaders() } }),

        ]);

        if (recipeRes.ok) {

          const recipes = await recipeRes.json();

          setRecipeRows(recipes.map(r => ({ ingredientId: r.ingredientId, quantity: r.quantity, name: r.ingredient?.name, unit: r.ingredient?.unit })));

        } else {

          setRecipeRows([]);

        }

        if (ingredientsRes.ok) {

          setKitchenIngredients(await ingredientsRes.json());

        }

      } catch (err) {

        console.error('[MenuPage] Failed to load recipe data:', err);

        setRecipeRows([]);

      } finally {

        setRecipeLoading(false);

      }

    } else {

      setRecipeRows([]);

    }

  };

  // ── Auto-Generate Recipes ──────────────────────────────────────────────

  const handleAutoGenerateRecipes = async () => {
    setAutoGenConfirm(false);
    setAutoGenLoading(true);
    setAutoGenError(null);
    setAutoGenResult(null);
    try {
      const data = await apiFetch('/api/menu/recipes/auto-generate', {
        method: 'POST',
        timeout: 60000,
      });
      setAutoGenResult(data);
    } catch (err) {
      console.error('[MenuPage] Auto-generate recipes failed:', err);
      setAutoGenError(err.message || 'Failed to auto-generate recipes');
    } finally {
      setAutoGenLoading(false);
    }
  };

  const handleDeleteClick = (item) => setDeletingItem(item);






  // ── confirmDelete — async, soft-delete via backend ───────────────────────

  const confirmDelete = async () => {

    if (!deletingItem || deleteWorking) return;

    setDeleteWorking(true);

    try {

      const endpoint = activeOutlet === 'bar'

        ? `${API_BASE}/api/bar/menu/items/${deletingItem.id}`

        : `${API_BASE}/api/menu/items/${deletingItem.id}`;

      const res = await fetch(endpoint, {

        method: 'DELETE',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

      });

      if (res.ok) {

        // Optimistic update: remove item from local state immediately
        const deletedId = deletingItem.id;
        setGlobalMenu(prev => prev.filter(i => i.id !== deletedId));
        setAdminItems(prev => prev.filter(i => i.id !== deletedId));

        setDeletingItem(null);

        // Background sync to confirm with server (no loading spinner)

        refreshMenu().catch(() => {});

      } else {

        alert('Delete failed');

      }

    } catch {

      alert('Delete failed');

    }

    setDeleteWorking(false);

  };



  // ── handleSaveEdit — async, Cloudinary upload then PATCH ─────────────────

  const handleSaveEdit = async () => {

    if (!editingItem.n) return;

    setSaving(true);

    try {

      let imageUrl = undefined;

      if (editingItem.img && editingItem.img.startsWith('data:')) {

        imageUrl = await uploadImageToCloudinary(editingItem.img, editingItem.n);

      }



      const body = {

        name: editingItem.n,

        category: editingItem.c,

        isVeg: editingItem.t === 'veg',

        price: Number(editingItem.basePrice ?? editingItem.p ?? 0),

        menuType: editingItem.menuType || 'FOOD',

        venuePrices: {

          ...(editingItem.venuePrices || {}),

          [activeVenueId]: Number(editingItem.venuePrice ?? 0),

        },

        gstEnabled: editingItem.gstEnabled !== false,

        ...(editingItem.printerName !== undefined

          ? { printerName: editingItem.printerName || null }

          : {}),

        ...(editingItem.categoryPrinterTarget !== undefined

          ? { categoryPrinterTarget: editingItem.categoryPrinterTarget }

          : {}),

        ...(editingItem.printerTarget !== undefined

          ? { printerTarget: editingItem.printerTarget || null }

          : {}),

        ...(imageUrl !== undefined ? { imageUrl } : {}),

      };



      const endpoint = activeOutlet === 'bar'

        ? `${API_BASE}/api/bar/menu/items/${editingItem.id}`

        : `${API_BASE}/api/menu/items/${editingItem.id}`;

      const res = await fetch(endpoint, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify(body),

      });



      if (res.ok) {

        const serverItem = await res.json();

        // Build optimistic POS-shaped item from backend response

        const DEFAULT_IMG = '/placeholder.svg';

        const defaultVariant = serverItem?.variants?.find(v => v.isDefault) ?? (serverItem?.variants?.length > 0 ? serverItem.variants[0] : null);

        const optimisticItem = {

          id: editingItem.id,

          n: body.name,

          p: Math.round(body.price),

          c: editingItem.c,

          t: body.isVeg ? 'veg' : 'non',

          img: imageUrl ?? editingItem.img ?? DEFAULT_IMG,

          desc: editingItem.desc ?? '',

          menuType: editingItem.menuType || 'FOOD',

          venuePrices: body.venuePrices,

          gstEnabled: body.gstEnabled,

        };

        // Apply optimistic update instantly — no loading flash

        setGlobalMenu(prev => prev.map(i => i.id === editingItem.id ? optimisticItem : i));

        setAdminItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...optimisticItem, isAvailable: editingItem.isAvailable } : i));

        window.dispatchEvent(new CustomEvent('softshape_venue_prices_updated'));

        setEditingItem(null);



        // Save recipe if any rows are set (Phase 5)

        if (recipeRows.length > 0 && activeOutlet === 'restaurant') {

          try {

            const validRows = recipeRows.filter(r => r.ingredientId && r.quantity);

            if (validRows.length > 0) {

              await fetch(`${API_BASE}/api/menu/recipes/${optimisticItem.id}`, {

                method: 'POST',

                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

                body: JSON.stringify({ ingredients: validRows.map(r => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) })) }),

              });

            }

          } catch (recipeErr) {

            console.error('[MenuPage] Failed to save recipe:', recipeErr);

          }

        }



        // Background re-sync to confirm server state

        refreshMenu().catch(() => {});

      } else {

        alert('Failed to save changes');

      }

    } catch (e) {

      alert(e.message || 'Failed to save changes');

    }

    setSaving(false);

  };



  const handleImageUpload = (e) => {

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

          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }

        } else {

          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }

        }



        canvas.width = width; canvas.height = height;

        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, width, height);



        const base64String = canvas.toDataURL('image/jpeg', 0.7);

        if (editingItem) setEditingItem(prev => ({ ...prev, img: base64String }));

        if (addingItem) setAddingItem(prev => ({ ...prev, img: base64String }));

      };

      img.src = event.target.result;

    };

    reader.readAsDataURL(file);

  };



  // ── handleSaveAdd — async, Cloudinary upload then POST ───────────────────

  const handleSaveAdd = async () => {

    if (!addingItem.n || !addingItem.p) return;

    setSaving(true);

    try {

      let imageUrl = null;

      if (addingItem.img && addingItem.img.startsWith('data:')) {

        imageUrl = await uploadImageToCloudinary(addingItem.img, addingItem.n);

      }



      const endpoint = activeOutlet === 'bar'

        ? `${API_BASE}/api/bar/menu/items`

        : `${API_BASE}/api/menu/items`;

      const res = await fetch(endpoint, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify({

          name: addingItem.n,

          category: addingItem.c,

          isVeg: addingItem.t === 'veg',

          price: Number(addingItem.p),

          menuType: addingItem.menuType || 'FOOD',

          venuePrices: Object.fromEntries(

            currentVenueColumns.map((venue) => [venue.id, Number(addingItem.venuePrices?.[venue.id] || 0)])

          ),

          gstEnabled: addingItem.gstEnabled !== false,

          ...(addingItem.categoryPrinterTarget !== undefined

            ? { categoryPrinterTarget: addingItem.categoryPrinterTarget || null }

            : {}),

          ...(addingItem.printerTarget !== undefined

            ? { printerTarget: addingItem.printerTarget || null }

            : {}),

          ...(addingItem.printerName !== undefined

            ? { printerName: addingItem.printerName || null }

            : {}),

          ...(imageUrl ? { imageUrl } : {}),

        }),

      });



      if (res.ok) {

        const serverItem = await res.json();

        // Map backend item to POS shape for optimistic insert

        const DEFAULT_IMG = '/placeholder.svg';

        const defaultVariant = serverItem?.variants?.find(v => v.isDefault) ?? (serverItem?.variants?.length > 0 ? serverItem.variants[0] : null);

        const optimisticItem = {

          id: serverItem.id,

          n: serverItem.name,

          p: Math.round(defaultVariant?.price ?? Number(addingItem.p)),

          c: serverItem.category?.name ?? addingItem.c,

          t: serverItem.isVeg ? 'veg' : 'non',

          img: serverItem.imageUrl || imageUrl || DEFAULT_IMG,

          desc: serverItem.description || '',

          menuType: serverItem.menuType,

          venuePrices: Object.fromEntries(

            currentVenueColumns.map((venue) => [venue.id, Number(addingItem.venuePrices?.[venue.id] || 0)])

          ),

          gstEnabled: addingItem.gstEnabled !== false,

        };

        // Append new item instantly — no loading flash

        setGlobalMenu(prev => [...prev, optimisticItem]);

        setAdminItems(prev => [...prev, { ...optimisticItem, isAvailable: true }]);

        window.dispatchEvent(new CustomEvent('softshape_venue_prices_updated'));

        // Save recipe if present
        if (activeOutlet === 'restaurant' && recipeRows.length > 0 && serverItem?.id) {
          try {
            await fetch(`${API_BASE}/api/recipes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify({
                menuItemId: serverItem.id,
                ingredients: recipeRows.map(r => ({
                  kitchenInventoryItemId: r.ingredientId,
                  quantity: Number(r.qty) || 0,
                  unit: r.unit,
                })).filter(r => r.kitchenInventoryItemId),
              }),
            });
          } catch (e) {
            console.error('[MenuPage] Recipe save failed:', e);
          }
        }

        setRecipeRows([]);

        setAddingItem(null);

        // Background re-sync

        refreshMenu().catch(() => {});

      } else {

        alert('Failed to add item');

      }

    } catch (e) {

      alert(e.message || 'Failed to add item');

    }

    setSaving(false);

  };



  return <div className={card + " p-4 font-sans"}>

    {error && (

      <p className="mb-3 text-sm text-red-600 font-medium">{error}</p>

    )}

    <div className="mb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">

        <h3 className="font-semibold text-lg shrink-0">

          Menu Items

          {!adminLoading && adminItems.length > 0 && (

            <span className="ml-2 text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">

              {adminItems.length} synced

            </span>

          )}

          {adminLoading && <span className="text-xs font-normal text-gray-400"> (syncing…)</span>}

        </h3>

        <button type="button" onClick={() => { refreshMenu(); fetchAdminItems(); }} className="text-xs font-bold text-[#E53935] hover:underline">Refresh from server</button>

        <input

          type="search"

          className={input + " h-9 w-full sm:w-64"}

          placeholder="Search by name, category, price, or ID..."

          value={filter}

          onChange={(e) => setFilter(e.target.value)}

          autoComplete="off"

        />

      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto justify-end">

        <button 

          className="rounded-lg bg-white border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md hover:border-gray-300 flex items-center justify-center gap-2 active:scale-95 whitespace-nowrap w-full sm:w-auto" 

          onClick={() => {

            const firstCat = dbCategories[0];

            const defaultPrinterTarget = firstCat?.printerTarget || configuredPrinters[0]?.name || null;

            setAddingItem({

              n: '',

              c: firstCat?.name ?? '',

              p: '',

              t: 'veg',

              img: null,

              venuePrices: Object.fromEntries(currentVenueColumns.map((venue) => [venue.id, venue.id === activeVenueId ? '' : 0])),

              categoryPrinterTarget: activeOutlet === 'restaurant' ? defaultPrinterTarget : undefined,

              menuType: 'FOOD',

              gstEnabled: true,

            });

            setRecipeRows([]);

            const rid = getCurrentRestaurantId();

            fetch(`${API_BASE}/api/inventory/kitchen?restaurantId=${rid}`, { headers: { ...getAuthHeaders() } })

              .then(r => r.ok ? r.json() : [])

              .then(data => setKitchenIngredients(data))

              .catch(() => {});

          }}

        >

          <span className="text-gray-400 font-black">+</span> Add Item

        </button>

        <button

          onClick={() => setShowUploadModal(true)}

          className="rounded-lg bg-white border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md hover:border-gray-300 flex items-center justify-center gap-2 active:scale-95 whitespace-nowrap w-full sm:w-auto"

        >

          <Upload size={16} className="text-gray-500" /> Upload Menu

        </button>

        <button

          type="button"

          disabled={autoGenLoading}

          onClick={() => setAutoGenConfirm(true)}

          className="rounded-lg bg-white border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md hover:border-gray-300 flex items-center justify-center gap-2 active:scale-95 whitespace-nowrap w-full sm:w-auto disabled:opacity-50"

        >

          {autoGenLoading ? (

            <span className="inline-block h-4 w-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"></span>

          ) : (

            <span>⚡</span>

          )}

          {autoGenLoading ? 'Generating...' : 'Auto-Generate Recipes'}

        </button>

        <button 

          className="relative group rounded-lg p-[1px] transition-all hover:scale-[1.02] active:scale-95 whitespace-nowrap w-full sm:w-auto"

          onClick={onAddDish}

        >

          <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-lg opacity-80 group-hover:opacity-100 transition-opacity animate-pulse"></span>

          <div className="relative flex items-center justify-center gap-2 bg-gray-950 px-4 py-2 rounded-lg font-bold text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]">

            <Sparkles size={16} className="text-purple-300" /> 

            <span className="bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent text-sm">AI Generate</span>

          </div>

        </button>

      </div>

    </div>

    {/* ── Auto-Generate Recipes Confirmation Dialog ── */}

    {autoGenConfirm && (

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in">

        <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95">

          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">

            <h3 className="font-black text-lg text-gray-900 tracking-tight">Auto-Generate Recipes</h3>

            <button onClick={() => setAutoGenConfirm(false)} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>

          </div>

          <div className="px-5 py-4">

            <p className="text-sm text-gray-700 leading-relaxed">

              This will scan all your current food menu items and generate ingredient recipes using standard Indian restaurant recipes.

            </p>

            <p className="text-sm text-red-600 font-bold mt-3 leading-relaxed">

              ⚠️ This OVERWRITES any recipe you've already set up or edited for every food item. Quantities can be reviewed and adjusted afterward in each item's recipe editor.

            </p>

          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">

            <button

              onClick={() => setAutoGenConfirm(false)}

              className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"

            >Cancel</button>

            <button

              onClick={handleAutoGenerateRecipes}

              className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg"

            >Yes, Overwrite All Recipes</button>

          </div>

        </div>

      </div>

    )}

    {/* ── Auto-Generate Recipes Results Panel ── */}

    {autoGenError && (

      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">

        <div className="flex items-center justify-between">

          <p className="text-sm font-bold text-red-700">Auto-Generate Failed</p>

          <button onClick={() => setAutoGenError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>

        </div>

        <p className="text-sm text-red-600 mt-1">{autoGenError}</p>

      </div>

    )}

    {autoGenResult && (

      <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4">

        <div className="flex items-center justify-between">

          <p className="text-sm font-bold text-green-700">Auto-Generate Complete</p>

          <button onClick={() => setAutoGenResult(null)} className="text-green-400 hover:text-green-600"><X size={16} /></button>

        </div>

        <div className="mt-2 grid grid-cols-3 gap-3">

          <div className="bg-white rounded-lg p-3 text-center">

            <p className="text-2xl font-black text-green-700">{autoGenResult.ingredientsCreated}</p>

            <p className="text-xs text-gray-500 mt-1">Ingredients Created</p>

          </div>

          <div className="bg-white rounded-lg p-3 text-center">

            <p className="text-2xl font-black text-green-700">{autoGenResult.recipesGenerated}</p>

            <p className="text-xs text-gray-500 mt-1">Recipes Generated</p>

          </div>

          <div className="bg-white rounded-lg p-3 text-center">

            <p className="text-2xl font-black text-gray-500">{autoGenResult.itemsSkippedExistingRecipe}</p>

            <p className="text-xs text-gray-500 mt-1">Items Skipped</p>

          </div>

        </div>

        {autoGenResult.warnings && autoGenResult.warnings.length > 0 && (

          <div className="mt-3">

            <details>

              <summary className="text-sm font-bold text-amber-700 cursor-pointer hover:text-amber-800">

                ⚠ {autoGenResult.warnings.length} warning{autoGenResult.warnings.length !== 1 ? 's' : ''} (click to expand)

              </summary>

              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-amber-50 border border-amber-200 p-3">

                {autoGenResult.warnings.map((w, i) => (

                  <p key={i} className="text-xs text-amber-800 py-0.5">{w}</p>

                ))}

              </div>

            </details>

          </div>

        )}

      </div>

    )}

    {/* Outlet Selector — only when tenant has more than one outlet type */}

    {outlets.length > 1 && (

      <div className="mb-4 flex gap-2">

        {outlets.map((outlet) => (

          <button

            key={outlet}

            onClick={() => setActiveOutlet(outlet)}

            className={`px-4 py-2 rounded-lg font-medium transition-colors ${

              activeOutlet === outlet

                ? outlet === 'bar'

                  ? 'bg-purple-500 text-white'

                  : 'bg-blue-500 text-white'

                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'

            }`}

          >

            {outlet === 'bar' ? '🍺 Bar' : '🍽️ Restaurant'}

          </button>

        ))}

      </div>

    )}



    {/* Venue-specific tabs — only when more than one section exists */}

    {currentVenueColumns.length > 1 && (

      <div className="mb-3 flex flex-col gap-2">

        <div className="flex flex-wrap gap-2">

          {currentVenueColumns.map((venue) => (

            <button

              key={venue.id}

              type="button"

              onClick={() => setActiveVenueId(venue.id)}

              className={`rounded-lg border px-3 py-2 text-xs font-black uppercase transition ${

                activeVenueId === venue.id

                  ? 'border-[#E53935] bg-[#E53935] text-white'

                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'

              }`}

            >

              {venue.label}

            </button>

          ))}

        </div>

        <label className="flex items-center gap-2 text-xs font-bold text-gray-500">

          <input

            type="checkbox"

            checked={showHiddenVenueItems}

            onChange={(e) => setShowHiddenVenueItems(e.target.checked)}

            className="accent-[#E53935]"

          />

          Show items hidden from {activeVenue.label}

        </label>

      </div>

    )}

    <p className="text-xs text-[#6B6B6B] mb-3">

      Showing {items.length} item{items.length !== 1 ? "s" : ""}

      {filter ? ` matching "${filter}"` : ""} · synced from backend

    </p>



    {/* ── Category Manager ── */}

    <div className="mb-4 border border-gray-200 rounded-xl overflow-hidden">

      <button

        onClick={() => setShowCategoryManager(!showCategoryManager)}

        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"

      >

        <span className="text-sm font-bold text-gray-700 flex items-center gap-2">

          <Layers size={16} /> Manage Categories

          <span className="text-xs font-normal text-gray-400">({dbCategories.length})</span>

        </span>

        {showCategoryManager ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}

      </button>

      {showCategoryManager && (

        <div className="p-3 space-y-1.5">

          {categoriesLoading ? (

            <p className="text-xs text-gray-400 py-2">Loading categories...</p>

          ) : dbCategories.length === 0 ? (

            <p className="text-xs text-gray-400 py-2">No categories yet. Add one below.</p>

          ) : (

            dbCategories.map((cat, idx) => (

              <div key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group">

                <div className="flex flex-col">

                  <button

                    onClick={() => handleCategoryReorder(cat.id, cat.sortOrder - 1)}

                    disabled={catSaving || idx === 0}

                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30"

                  >

                    <ArrowUp size={14} />

                  </button>

                  <button

                    onClick={() => handleCategoryReorder(cat.id, cat.sortOrder + 1)}

                    disabled={catSaving || idx === dbCategories.length - 1}

                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30"

                  >

                    <ArrowDown size={14} />

                  </button>

                </div>

                {editingCatId === cat.id ? (

                  <input

                    autoFocus

                    value={editingCatName}

                    onChange={(e) => setEditingCatName(e.target.value)}

                    onBlur={() => handleCategoryRename(cat.id, editingCatName)}

                    onKeyDown={(e) => {

                      if (e.key === 'Enter') handleCategoryRename(cat.id, editingCatName);

                      if (e.key === 'Escape') setEditingCatId(null);

                    }}

                    className="flex-1 px-2 py-1 border border-[#E53935] rounded text-sm focus:outline-none"

                    disabled={catSaving}

                  />

                ) : (

                  <span

                    className="flex-1 text-sm font-medium text-gray-700 cursor-pointer hover:text-[#E53935]"

                    onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}

                  >

                    {cat.name}

                  </span>

                )}

                <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">

                  {categoryItemCounts[cat.name] || 0}

                </span>

                <button

                  onClick={() => handleCategoryDelete(cat.id)}

                  disabled={catSaving}

                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"

                >

                  <Trash2 size={15} />

                </button>

              </div>

            ))

          )}

          {/* Add new category */}

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">

            <Plus size={16} className="text-gray-400" />

            <input

              value={newCatName}

              onChange={(e) => setNewCatName(e.target.value)}

              onKeyDown={(e) => { if (e.key === 'Enter') handleCategoryAdd(); }}

              placeholder="New category name..."

              className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E53935]"

              disabled={catSaving}

            />

            <button

              onClick={handleCategoryAdd}

              disabled={catSaving || !newCatName.trim()}

              className="px-3 py-1.5 bg-[#E53935] text-white rounded text-xs font-bold hover:bg-[#B71C1C] disabled:opacity-50"

            >

              Add

            </button>

          </div>

        </div>

      )}

    </div>



    <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">

      <table className="w-full text-left text-sm whitespace-nowrap">

        <thead className="sticky top-0 bg-white z-10">

          <tr className="border-b border-[#FFCDD2]">

            <th className="px-4 py-2">Image</th>

            <th className="px-4 py-2">Name</th>

            <th className="px-4 py-2">Category</th>

            <th className="px-4 py-2">

              {activeVenue.label} Price

            </th>

            <th className="px-4 py-2">Veg/Non</th>

            <th className="px-4 py-2 text-left text-xs font-black uppercase text-gray-500">KOT Type</th>

            <th className="px-4 py-2">Available</th>

            <th className="px-4 py-2">Action</th>

          </tr>

        </thead>

        <tbody>

          {adminLoading ? (

            <tr>

              <td colSpan={8} className="px-4 py-12 text-center text-sm text-[#6B6B6B]">

                Syncing menu from server…

              </td>

            </tr>

          ) : items.length === 0 ? (

            <tr>

              <td colSpan={8} className="px-4 py-12 text-center text-sm text-[#6B6B6B]">

                {filter.trim()

                  ? `No items found for "${filter.trim()}".`

                  : 'No menu items loaded. Click "Refresh from server" to load from backend.'}

              </td>

            </tr>

          ) : (

          items.map((item) => (

            <tr key={item.id || item.n} className={`border-b border-[#FFEBEE] hover:bg-[#FFF5F5] transition-opacity ${item.isAvailable ? '' : 'opacity-60'}`}>

              <td className="px-4 py-2">

                 {item.img ? (

                    <img src={item.img} alt={item.n} className="h-10 w-10 rounded-md object-cover" />

                 ) : (

                    <div className="h-10 w-10 rounded-md bg-[#EF9A9A]" />

                 )}

              </td>

              <td className="px-4 py-2 font-medium">{item.n}</td>

              <td className="px-4 py-2">{item.c}</td>

              <td className="px-4 py-2">

                {Number(item.venuePrices?.[activeVenueId] || 0) > 0

                  ? `₹${Number(item.venuePrices?.[activeVenueId] || 0)}`

                  : <span className="text-gray-400 font-bold">Hidden</span>}

              </td>

              <td className="px-4 py-2">

                <span className={`inline-flex h-2 w-2 rounded-full mr-2 ${item.t === "veg" ? "bg-green-600" : "bg-red-600"}`} />

                {item.t === "veg" ? "Veg" : "Non-Veg"}

              </td>

              <td className="px-4 py-2">

                <span className={`rounded-full px-2 py-0.5 text-xs font-black uppercase ${

                  item.menuType === 'LIQUOR'

                    ? 'bg-purple-100 text-purple-700'

                    : 'bg-green-100 text-green-700'

                }`}>

                  {item.menuType === 'LIQUOR' ? '🥃 Bar' : '🍽 Food'}

                </span>

              </td>

              <td className="px-4 py-2">

                {(() => {

                  const venueAvail = currentVenueColumns.length > 1

                    ? (item.isAvailable !== false && item.venueAvailabilities?.[activeVenueId] !== false)

                    : item.isAvailable;

                  return (

                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${

                      venueAvail

                        ? 'bg-green-100 text-green-800'

                        : 'bg-red-100 text-red-700'

                    }`}>

                      {venueAvail ? 'Available' : 'Unavailable'}

                    </span>

                  );

                })()}

              </td>

              <td className="px-4 py-2 flex items-center gap-2">

                {(() => {

                  const venueAvail = currentVenueColumns.length > 1

                    ? (item.isAvailable !== false && item.venueAvailabilities?.[activeVenueId] !== false)

                    : item.isAvailable;

                  return (

                    <button

                      onClick={() => handleToggleAvailability(item)}

                      disabled={togglingId === item.id}

                      title={venueAvail ? 'Mark Unavailable' : 'Mark Available'}

                      className={`text-xs font-bold px-2 py-1 rounded-md border transition-all ${

                        venueAvail

                          ? 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'

                          : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'

                      } disabled:opacity-40 disabled:cursor-not-allowed`}

                    >

                      {togglingId === item.id ? '…' : venueAvail ? 'Disable' : 'Enable'}

                    </button>

                  );

                })()}

                <button
                  onClick={() => handleToggleMenuType(item)}
                  disabled={togglingMenuTypeId === item.id}
                  title={item.menuType === 'LIQUOR' ? 'Switch to Food (Kitchen KOT)' : 'Switch to Bar (Liquor KOT)'}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all ${
                    item.menuType === 'LIQUOR'
                      ? 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100'
                      : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {togglingMenuTypeId === item.id ? '…' : (
                    <span className="whitespace-nowrap">
                      {item.menuType === 'LIQUOR'
                        ? `Bar → Kitchen`
                        : `Kitchen → Bar`
                      }
                    </span>
                  )}
                </button>

                <button onClick={() => handleEdit(item)} className="text-blue-600 hover:scale-110 transition-transform">✏️</button>

                <button onClick={() => handleDeleteClick(item)} className="text-red-600 hover:scale-110 transition-transform">🗑️</button>

              </td>

            </tr>

          )))}

        </tbody>

      </table>

    </div>



    {/* EDIT MODAL */}

    {editingItem && (

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in">

        <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">

          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">

            <h3 className="font-black text-lg text-gray-900 tracking-tight">Edit Item</h3>

            <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>

          </div>

          <div className="p-5 space-y-4 overflow-y-auto">

            {/* ── Section 1: Basic Info ── */}

            <details open className="group">

              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">

                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />

                Basic Info

              </summary>

              <div className="space-y-4">

            <div>

               <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Item Image</label>

               <div className="flex items-center gap-4">

                  {editingItem.img ? (

                     <img src={editingItem.img} alt={editingItem.n} className="h-16 w-16 rounded-xl object-cover border border-gray-200" />

                  ) : (

                     <div className="h-16 w-16 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center"><Camera size={20} className="text-gray-400"/></div>

                  )}

                  <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-600 hover:file:bg-red-100" />

               </div>

            </div>

            <div>

               <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Item Name</label>

               <input value={editingItem.n} onChange={e => setEditingItem({...editingItem, n: e.target.value})} className={input + " w-full bg-gray-50"} />

            </div>

            <div>

                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Category</label>

                  <select

                    value={editingItem.c}

                    onChange={e => setEditingItem({...editingItem, c: e.target.value})}

                    className={input + " w-full bg-gray-50"}

                    disabled={categoriesLoading}

                  >

                    <option value="">

                      {categoriesLoading ? 'Loading...' : 'Select a category'}

                    </option>

                    {dbCategories.map(cat => (

                      <option key={cat.id} value={cat.name}>{cat.name}</option>

                    ))}

                  </select>

                  {dbCategories.length === 0 && !categoriesLoading && (

                    <p style={{ color: 'orange', fontSize: '0.75rem', marginTop: '4px' }}>

                      No categories found. Add categories first.

                    </p>

                  )}

               </div>

            <div>

               <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Dietary Type</label>

               <div className="flex gap-4 mt-2">

                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">

                     <input type="radio" name="diet" value="veg" checked={editingItem.t === 'veg'} onChange={() => setEditingItem({...editingItem, t: 'veg'})} className="accent-green-600" />

                     <span className="text-green-700">Vegetarian</span>

                  </label>

                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">

                     <input type="radio" name="diet" value="non" checked={editingItem.t === 'non'} onChange={() => setEditingItem({...editingItem, t: 'non'})} className="accent-red-600" />

                     <span className="text-red-700">Non-Veg</span>

                  </label>

               </div>

            </div>

              </div>

            </details>

            {/* ── Section 2: Pricing ── */}

            <details open className="group">

              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">

                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />

                Pricing

              </summary>

              <div className="space-y-4">

            <div>

                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{activeVenue.label} Price (₹)</label>

                  <input type="number" value={editingItem.venuePrice} onChange={e => setEditingItem({...editingItem, venuePrice: e.target.value})} className={input + " w-full bg-gray-50"} />

               </div>

            {currentVenueColumns.length > 1 && (

            <div>

              <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Venue Prices</label>

              <div className="grid grid-cols-2 gap-3">

                {currentVenueColumns.map((venue) => (

                  <div key={venue.id}>

                    <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">{venue.label}</label>

                    <input

                      type="number"

                      placeholder="0.00"

                      value={venue.id === activeVenueId ? editingItem.venuePrice : (editingItem.venuePrices?.[venue.id] ?? '')}

                      onChange={(e) => setEditingItem({

                        ...editingItem,

                        venuePrice: venue.id === activeVenueId ? e.target.value : editingItem.venuePrice,

                        venuePrices: { ...(editingItem.venuePrices || {}), [venue.id]: e.target.value },

                      })}

                      className={input + " w-full bg-gray-50"}

                    />

                  </div>

                ))}

              </div>

            </div>

            )}

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingItem.gstEnabled !== false}
                  onChange={e => setEditingItem({...editingItem, gstEnabled: e.target.checked})}
                  className="accent-[#E53935] w-4 h-4"
                />
                <span className="text-gray-700">GST Applicable</span>
              </label>
              <span className="text-[10px] text-gray-400 font-medium">If off, no GST is charged on this item in bills</span>
            </div>

              </div>

            </details>

            {/* ── Section 3: Printer Settings ── */}

            <details className="group border-t border-gray-100 pt-3">

              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">

                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />

                Printer Settings

              </summary>

              <div className="space-y-4">

                {/* Print To: merged KOT Destination + Item Printer Override */}
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Print To</label>

                <select
                  value={editingItem.printerTarget || editingItem.categoryPrinterTarget || ''}
                  onChange={(e) => {
                    const val = e.target.value || null;
                    setEditingItem({
                      ...editingItem,
                      printerTarget: val,
                      categoryPrinterTarget: val,
                    });
                  }}
                  className={input + ' w-full bg-gray-50'}
                >
                  <option value="">Default (auto-resolve)</option>
                  {allPrinterOptions.map(opt => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name}
                      {opt.source === 'agent-live' ? ' (Live)' : opt.type ? ` (${opt.type})` : ''}
                    </option>
                  ))}
                </select>

                {activeOutlet === 'bar' && (
                  <div className="flex gap-2 mt-2">
                    {[
                      { value: 'FOOD', label: 'Food' },
                      { value: 'LIQUOR', label: 'Bar / Drinks' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditingItem({ ...editingItem, menuType: opt.value })}
                        className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all text-left ${
                          (editingItem.menuType || 'FOOD') === opt.value
                            ? opt.value === 'FOOD'
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <div>{opt.label}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Physical Printer override (optional) */}
                {(
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Physical Printer Override (optional)</label>
                    <select
                      value={editingItem.printerName || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, printerName: e.target.value || null })}
                      className={input + ' w-full bg-gray-50'}
                    >
                      <option value="">Auto-resolve from Print To</option>
                      {allPrinterOptions.map(opt => (
                        <option key={opt.name} value={opt.name}>
                          {opt.name}
                          {opt.source === 'agent-live' ? ' (Live)' : opt.type ? ` (${opt.type})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">Only change if the Windows printer name differs from the logical destination above.</p>
                  </div>
                )}

              </div>

            </details>

            {/* ── Section 4: Recipe ── */}

            {editingItem.menuType !== 'LIQUOR' && (

            <details className="group border-t border-gray-100 pt-3">

              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">

                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />

                Recipe (Kitchen Ingredients)

              </summary>

              <div className="space-y-3">

                <div className="flex items-center justify-between mb-2">

                  <div className="flex items-center gap-3">

                    <button

                      type="button"

                      onClick={() => setRecipeRows([...recipeRows, { ingredientId: '', quantity: '', name: '', unit: '' }])}

                      className="text-xs font-bold text-[#E53935] hover:text-[#B71C1C]"

                    >+ Add Ingredient</button>

                  </div>

                </div>

                {recipeLoading ? (

                  <p className="text-xs text-gray-400">Loading recipe...</p>

                ) : recipeRows.length === 0 ? (

                  <p className="text-xs text-gray-400">No recipe set. Add ingredients to enable automatic kitchen inventory deduction on settle.</p>

                ) : (

                  <div className="space-y-2">

                    {recipeRows.map((row, idx) => (

                      <div key={idx} className="flex items-center gap-2">

                        <select

                          value={row.ingredientId}

                          onChange={(e) => {

                            const ing = kitchenIngredients.find(i => i.id === e.target.value);

                            setRecipeRows(recipeRows.map((r, i) => i === idx ? { ...r, ingredientId: e.target.value, name: ing?.name, unit: ing?.unit } : r));

                          }}

                          className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50"

                        >

                          <option value="">Select ingredient</option>

                          {kitchenIngredients.map(ing => (

                            <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>

                          ))}

                        </select>

                        <input

                          type="number"

                          step="0.001"

                          placeholder="Qty"

                          value={row.quantity}

                          onChange={(e) => setRecipeRows(recipeRows.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}

                          className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 text-right"

                        />

                        <span className="text-xs text-gray-400 w-8">{row.unit || ''}</span>

                        <button

                          type="button"

                          onClick={() => setRecipeRows(recipeRows.filter((_, i) => i !== idx))}

                          className="p-1 text-red-500 hover:text-red-600"

                        >

                          <Trash2 size={14} />

                        </button>

                      </div>

                    ))}

                  </div>

                )}

              </div>

            </details>

            )}

          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 shrink-0">

            <button onClick={() => setEditingItem(null)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>

            <button onClick={handleSaveEdit} disabled={!editingItem.n || saving} className="px-6 py-2 text-sm font-black text-white bg-[#E53935] hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-md">{saving ? 'Saving…' : 'Save Changes'}</button>

          </div>

        </div>

      </div>

    )}



    {/* ADD MODAL */}

    {addingItem && (

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in">

        <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">

          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">

            <h3 className="font-black text-lg text-gray-900 tracking-tight">Add New Item</h3>

            <button onClick={() => { setAddingItem(null); setRecipeRows([]); }} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>

          </div>

          <div className="p-5 space-y-4 overflow-y-auto min-h-0">

            {/* ── Section 1: Basic Info ── */}

            <details open className="group">

              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">

                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />

                Basic Info

              </summary>

              <div className="space-y-4">

            <div>

               <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Item Image</label>

               <div className="flex items-center gap-4">

                  {addingItem.img ? (

                     <img src={addingItem.img} alt="Preview" className="h-16 w-16 rounded-xl object-cover border border-gray-200" />

                  ) : (

                     <div className="h-16 w-16 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center"><Camera size={20} className="text-gray-400"/></div>

                  )}

                  <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-600 hover:file:bg-red-100" />

               </div>

            </div>

            <div>

               <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Item Name</label>

               <input value={addingItem.n} onChange={e => setAddingItem({...addingItem, n: e.target.value})} placeholder="e.g. Chicken Biryani" className={input + " w-full bg-gray-50"} />

            </div>

            <div>

                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Category</label>

                  <select

                    value={addingItem.c}

                    onChange={e => {

                      const newCatName = e.target.value;

                      const cat = dbCategories.find(c => c.name === newCatName);

                      const derivedTarget = activeOutlet === 'restaurant'

                        ? (cat?.printerTarget || configuredPrinters[0]?.name || null)

                        : addingItem.categoryPrinterTarget;

                      setAddingItem({...addingItem, c: newCatName, categoryPrinterTarget: derivedTarget});

                    }}

                    className={input + " w-full bg-gray-50"}

                    disabled={categoriesLoading}

                  >

                    <option value="">

                      {categoriesLoading ? 'Loading...' : 'Select a category'}

                    </option>

                    {dbCategories.map(cat => (

                      <option key={cat.id} value={cat.name}>{cat.name}</option>

                    ))}

                  </select>

                  {dbCategories.length === 0 && !categoriesLoading && (

                    <p style={{ color: 'orange', fontSize: '0.75rem', marginTop: '4px' }}>

                      No categories found. Add categories first.

                    </p>

                  )}

               </div>

            <div>

               <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Dietary Type</label>

               <div className="flex gap-4 mt-2">

                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">

                     <input type="radio" name="add_diet" value="veg" checked={addingItem.t === 'veg'} onChange={() => setAddingItem({...addingItem, t: 'veg'})} className="accent-green-600" />

                     <span className="text-green-700">Vegetarian</span>

                  </label>

                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">

                     <input type="radio" name="add_diet" value="non" checked={addingItem.t === 'non'} onChange={() => setAddingItem({...addingItem, t: 'non'})} className="accent-red-600" />

                     <span className="text-red-700">Non-Veg</span>

                  </label>

               </div>

            </div>

              </div>

            </details>

            {/* ── Section 2: Pricing ── */}

            <details open className="group">

              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">

                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />

                Pricing

              </summary>

              <div className="space-y-4">

            <div>

                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Base Price (₹)</label>

                  <input type="number" placeholder="0.00" value={addingItem.p} onChange={e => setAddingItem({...addingItem, p: e.target.value})} className={input + " w-full bg-gray-50"} />

               </div>

            {currentVenueColumns.length > 1 && (

            <div>

              <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Venue Prices</label>

              <div className="grid grid-cols-2 gap-3">

                {currentVenueColumns.map((venue) => (

                  <div key={venue.id}>

                    <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">{venue.label}</label>

                    <input

                      type="number"

                      placeholder="0.00"

                      value={addingItem.venuePrices?.[venue.id] ?? ''}

                      onChange={(e) => setAddingItem({

                        ...addingItem,

                        venuePrices: { ...(addingItem.venuePrices || {}), [venue.id]: e.target.value },

                        p: venue.id === activeVenueId ? e.target.value : addingItem.p,

                      })}

                      className={input + " w-full bg-gray-50"}

                    />

                  </div>

                ))}

              </div>

            </div>

            )}

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={addingItem.gstEnabled !== false}
                  onChange={e => setAddingItem({...addingItem, gstEnabled: e.target.checked})}
                  className="accent-[#E53935] w-4 h-4"
                />
                <span className="text-gray-700">GST Applicable</span>
              </label>
              <span className="text-[10px] text-gray-400 font-medium">If off, no GST is charged on this item in bills</span>
            </div>

              </div>

            </details>

            {/* ── Section 3: Printer Settings ── */}

            <details className="group border-t border-gray-100 pt-3">

              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">

                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />

                Printer Settings

              </summary>

              <div className="space-y-4">

                {/* Print To: merged KOT Destination + Item Printer Override */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Print To</label>

                  <select
                      value={addingItem.printerTarget || addingItem.categoryPrinterTarget || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setAddingItem({
                          ...addingItem,
                          printerTarget: val,
                          categoryPrinterTarget: val,
                        });
                      }}
                      className={input + ' w-full bg-gray-50'}
                    >
                      <option value="">Default (auto-resolve)</option>
                      {allPrinterOptions.map(opt => (
                        <option key={opt.name} value={opt.name}>
                          {opt.name}
                          {opt.source === 'agent-live' ? ' (Live)' : opt.type ? ` (${opt.type})` : ''}
                        </option>
                      ))}
                    </select>

                    {activeOutlet === 'bar' && (
                      <div className="flex gap-2 mt-2">
                        {[
                          { value: 'FOOD', label: 'Food' },
                          { value: 'LIQUOR', label: 'Bar / Drinks' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setAddingItem({ ...addingItem, menuType: opt.value })}
                            className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all text-left ${
                              (addingItem.menuType || 'FOOD') === opt.value
                                ? opt.value === 'FOOD'
                                  ? 'border-green-500 bg-green-50 text-green-700'
                                  : 'border-purple-500 bg-purple-50 text-purple-700'
                                : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            <div>{opt.label}</div>
                          </button>
                        ))}
                      </div>
                    )}
                </div>

                {/* Physical Printer override (optional) */}
                {(
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Physical Printer Override (optional)</label>
                    <select
                      value={addingItem.printerName || ''}
                      onChange={(e) => setAddingItem({ ...addingItem, printerName: e.target.value || null })}
                      className={input + ' w-full bg-gray-50'}
                    >
                      <option value="">Auto-resolve from Print To</option>
                      {allPrinterOptions.map(opt => (
                        <option key={opt.name} value={opt.name}>
                          {opt.name}
                          {opt.source === 'agent-live' ? ' (Live)' : opt.type ? ` (${opt.type})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">Only change if the Windows printer name differs from the logical destination above.</p>
                  </div>
                )}

              </div>

            </details>

            {/* ── Section 4: Recipe ── */}

            {activeOutlet === 'restaurant' && (

            <details className="group border-t border-gray-100 pt-3">

              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">

                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />

                Recipe (Kitchen Inventory)

              </summary>

              <div className="space-y-3">

                {recipeRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <select
                      value={row.ingredientId || ''}
                      onChange={(e) => {
                        const ing = kitchenIngredients.find(i => i.id === e.target.value);
                        setRecipeRows(prev => prev.map((r, i) => i === idx ? { ...r, ingredientId: e.target.value, unit: ing?.unit || '' } : r));
                      }}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs"
                    >
                      <option value="">Select ingredient…</option>
                      {kitchenIngredients.map(ing => (
                        <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Qty"
                      value={row.qty || ''}
                      onChange={(e) => setRecipeRows(prev => prev.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-xs"
                    />
                    <span className="text-xs font-bold text-gray-400 w-10">{row.unit}</span>
                    <button onClick={() => setRecipeRows(prev => prev.filter((_, i) => i !== idx))} className="p-1.5 text-red-500 hover:text-red-700 rounded-lg">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setRecipeRows(prev => [...prev, { ingredientId: '', qty: '', unit: '' }])}
                  className="text-xs font-bold text-[#E53935] hover:text-red-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Ingredient
                </button>
              </div>
            </details>
            )}

          </div>

          <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 shrink-0">

            <button onClick={() => { setAddingItem(null); setRecipeRows([]); }} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>

            <button onClick={handleSaveAdd} disabled={!addingItem.n || !addingItem.p || saving} className="px-6 py-2 text-sm font-black text-white bg-[#E53935] hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-md">{saving ? 'Saving…' : 'Add Item'}</button>

          </div>

        </div>

      </div>

    )}



    {/* DELETE CONFIRMATION MODAL */}

    {deletingItem && (

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in">

        <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95">

          <div className="p-6 text-center space-y-4">

            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2">

              <AlertCircle size={32} />

            </div>

            <h3 className="font-black text-xl text-gray-900 tracking-tight">Remove Item?</h3>

            <p className="text-sm text-gray-500 font-medium"><span className="font-bold text-gray-900">{deletingItem.n}</span> will be hidden from all menus.</p>

          </div>

          <div className="p-4 border-t border-gray-100 flex justify-center gap-3 bg-gray-50/50">

            <button onClick={() => setDeletingItem(null)} className="flex-1 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors">Cancel</button>

            <button onClick={confirmDelete} disabled={deleteWorking} className="flex-1 py-2.5 text-sm font-black text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl shadow-md transition-colors">{deleteWorking ? 'Removing…' : 'Yes, Delete'}</button>

          </div>

        </div>

      </div>

    )}

    {showUploadModal && (

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in">

        <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">

          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">

            <h3 className="font-black text-lg text-gray-900 tracking-tight">Upload Menu (PDF / Excel / CSV)</h3>

            <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>

          </div>

          <div className="p-5 overflow-y-auto">

            <MenuUpload

              onboardingMode={false}

              restaurantType={restaurant?.restaurantType}

              existingCategories={dbCategories.map(c => c.name)}

              sessionId={crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)}

              targetVenueId={activeVenueId}

              onImported={() => { fetchAdminItems(); refreshMenu(); setShowUploadModal(false); }}

            />

          </div>

        </div>

      </div>

    )}

  </div>;

}



export function Orders() {

  const { tables } = useTableSync();

  const { user } = useAuth();

  const [startDate, setStartDate] = useState(() => {

    const d = new Date();

    return d.toISOString().split('T')[0];

  });

  const [endDate, setEndDate] = useState(() => {

    const d = new Date();

    return d.toISOString().split('T')[0];

  });

  const [report, setReport] = useState(null);

  const [loading, setLoading] = useState(false);



  const loadReport = useCallback(async () => {

    const restaurantId = getCurrentRestaurantId();

    if (!restaurantId || !startDate || !endDate) return;

    setLoading(true);

    try {

      const res = await fetch(`${API_BASE}/api/reports/online-orders?restaurantId=${restaurantId}&startDate=${startDate}&endDate=${endDate}`, {

        headers: { ...getAuthHeaders() },

      });

      if (res.ok) setReport(await res.json());

    } catch (err) {

      console.error('[Online Orders] load report failed:', err);

    } finally {

      setLoading(false);

    }

  }, [startDate, endDate]);



  useEffect(() => { loadReport(); }, [loadReport]);



  const rows = tables

    .filter((table) => table.status && table.status !== 'Free')

    .map((table) => {

      const items = (table.kotHistory || []).flatMap((kot) => kot.items || []);

      return {

        id: `#T${table.id}`,

        type: 'Dine-In',

        customer: `Table ${table.id}`,

        items: items.length,

        amount: `₹${table.currentBill || calculateOrderTotal(items).subtotal}`,

        status: table.status,

        time: table.time ? formatTableTime(table.time) : 'Live',

        action: table.status === 'Waiting Bill' ? 'Bill' : 'View',

      };

    });



  return <div className="space-y-4 font-sans">

    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

      <div className="flex items-center gap-2">

        <span className="text-sm font-semibold text-[#6B6B6B]">Date Range:</span>

        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-[#FFCDD2] px-2 py-1 text-sm" />

        <span className="text-sm text-[#6B6B6B]">to</span>

        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-[#FFCDD2] px-2 py-1 text-sm" />

        <button onClick={loadReport} className="rounded-md bg-[#B71C1C] px-3 py-1 text-sm text-white hover:bg-[#9A1313]">Refresh</button>

      </div>

      {report?.highestSellingItem && (

        <div className="text-sm text-[#6B6B6B]">

          Highest Selling: <span className="font-semibold text-[#B71C1C]">{report.highestSellingItem.name}</span> ({report.highestSellingItem.quantity} sold)

        </div>

      )}

    </div>



    {loading && <div className="text-sm text-[#6B6B6B]">Loading app-wise sales...</div>}



    {report && !loading && (

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

        {report.platforms.map((p) => (

          <div key={p.platform} className={card + ' p-4'}>

            <div className="text-xs font-semibold uppercase tracking-wide text-[#6B6B6B]">{p.platform.replace(/_/g, ' ')}</div>

            <div className="mt-1 text-2xl font-bold text-[#B71C1C]">₹{p.sales.toFixed(2)}</div>

            <div className="mt-1 text-xs text-[#6B6B6B]">{p.orders} orders · {p.items} items</div>

          </div>

        ))}

      </div>

    )}



    <UnifiedOrdersDashboard />

    <div className="flex gap-2 overflow-x-auto pb-1">{[`Dine-In (${rows.length})`, `Billing (${rows.filter((row) => row.status === 'Waiting Bill').length})`, `Preparing (${rows.filter((row) => row.status === 'Preparing').length})`, `All (${rows.length})`].map((x, i) => <button key={x} className={`whitespace-nowrap rounded-md border px-3 py-1 text-sm ${i === 0 ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{x}</button>)}</div>

    <div className={card + " overflow-x-auto"}>

      <table className="w-full text-left text-sm whitespace-nowrap">

        <thead className="bg-[#FFEBEE]">

          <tr><th className="p-3">Order ID</th><th className="p-3">Type</th><th className="p-3">Customer/Table</th><th className="p-3">Items</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Time</th><th className="p-3">Action</th></tr>

        </thead>

        <tbody>

          {rows.map((r) => (

            <tr key={r.id} className="border-b border-[#FFEBEE] hover:bg-[#FFF5F5]">

              <td className="p-3 font-semibold">{r.id}</td><td className="p-3">{r.type}</td><td className="p-3">{r.customer}</td><td className="p-3">{r.items} items</td><td className="p-3 font-bold">{r.amount}</td>

              <td className="p-3"><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-700">{r.status}</span></td>

              <td className="p-3 text-[#6B6B6B]">{r.time}</td><td className="p-3"><button className="font-semibold text-[#B71C1C] hover:underline">{r.action}</button></td>

            </tr>

          ))}

          {rows.length === 0 && (

            <tr>

              <td colSpan={8} className="p-6 text-center text-sm text-[#6B6B6B]">No live dine-in orders yet.</td>

            </tr>

          )}

        </tbody>

      </table>

    </div>

  </div>;

}



export { default as Reports } from './AdminReports';



export function Payroll() {

  const [employees, setEmployees] = useState([]);

  const [records, setRecords] = useState([]);

  const [loading, setLoading] = useState(true);

  const [monthYear, setMonthYear] = useState(() => {

    const now = new Date();

    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  });

  const [dateMode, setDateMode] = useState('month'); // 'month' | 'range'
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });
  const [periodWarning, setPeriodWarning] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);

  const [newEmp, setNewEmp] = useState({ name: '', age: '', role: '', designation: '', workerCategory: '', baseSalary: '' });

  const [addError, setAddError] = useState('');

  const [adding, setAdding] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState('');

  const [payModal, setPayModal] = useState(null);

  const [payAmount, setPayAmount] = useState('');

  const [advanceModal, setAdvanceModal] = useState(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [advanceHistory, setAdvanceHistory] = useState([]);

  const [editValues, setEditValues] = useState({});
  const [autoCountMap, setAutoCountMap] = useState({}); // employeeId -> boolean

  const [searchTerm, setSearchTerm] = useState('');

  const [savingRecordId, setSavingRecordId] = useState(null);

  const [deletingId, setDeletingId] = useState(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState('excel');
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [editedProposed, setEditedProposed] = useState([]);

  const restaurantId = getCurrentRestaurantId();



  const loadData = useCallback(async () => {

    setLoading(true);

    try {

      let recordsUrl = `/api/payroll/records?restaurantId=${restaurantId}`;
      if (dateMode === 'range') {
        recordsUrl += `&startDate=${startDate}&endDate=${endDate}`;
      } else {
        recordsUrl += `&monthYear=${monthYear}`;
      }

      const [employees, records] = await Promise.all([

        apiFetch(`/api/payroll/employees?restaurantId=${restaurantId}`),

        apiFetch(recordsUrl),

      ]);

      setEmployees(employees || []);

      setRecords(records || []);

      // Warn if the loaded records were computed for a different period
      const first = (records || [])[0];
      if (dateMode === 'range' && first?.periodStart && first?.periodEnd) {
        if (first.periodStart !== startDate || first.periodEnd !== endDate) {
          setPeriodWarning({ savedStart: first.periodStart, savedEnd: first.periodEnd });
        } else {
          setPeriodWarning(null);
        }
      } else {
        setPeriodWarning(null);
      }

    } catch (err) {

      console.error('[Payroll] Failed to load:', err);

    } finally {

      setLoading(false);

    }

  }, [monthYear, startDate, endDate, dateMode, restaurantId]);



  useEffect(() => { loadData(); }, [loadData]);



  const handleAddEmployee = async () => {

    if (!newEmp.name || !newEmp.baseSalary || adding) return;

    setAdding(true);

    setAddError('');

    try {

      await apiFetch('/api/payroll/employees', {

        method: 'POST',

        body: JSON.stringify({

          restaurantId,

          ...newEmp,

          baseSalary: parseFloat(newEmp.baseSalary),

          age: newEmp.age ? parseInt(newEmp.age) : null,

          idempotencyKey,

        }),

      });

      setNewEmp({ name: '', age: '', role: '', designation: '', workerCategory: '', baseSalary: '' });

      setShowAddModal(false);

      setIdempotencyKey('');

      loadData();

    } catch (err) {

      console.error('[Payroll] Add employee failed:', err);

      setAddError(err.message || 'Failed to add employee');

    } finally {

      setAdding(false);

    }

  };



  const handleSaveRecord = async (employeeId) => {

    const vals = editValues[employeeId] || {};
    const rec = getRecord(employeeId);
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;

    try {

      setSavingRecordId(employeeId);

      // Save base salary on Employee if it was edited
      if (vals.baseSalary !== undefined && vals.baseSalary !== Number(emp.baseSalary)) {
        await apiFetch('/api/payroll/employees', {
          method: 'POST',
          body: JSON.stringify({
            id: employeeId,
            name: emp.name,
            age: emp.age,
            role: emp.role,
            designation: emp.designation,
            workerCategory: emp.workerCategory,
            baseSalary: vals.baseSalary,
            restaurantId,
          }),
        });
      }

      // Save presentDays/otDays on PayrollRecord. advanceAmount is read-only and
      // derived from expenditures + manual advances, so we do not send it to the backend.
      // Also recalculate when base salary changes so the salary reflects the new amount.
      if (vals.baseSalary !== undefined || vals.presentDays !== undefined || vals.otDays !== undefined || dateMode === 'range' || autoCountMap[employeeId]) {
        await apiFetch('/api/payroll/records', {

          method: 'POST',

          body: JSON.stringify({

            restaurantId,

            employeeId,

            monthYear: dateMode === 'range' ? startDate.slice(0, 7) : monthYear,

            startDate: dateMode === 'range' ? startDate : undefined,
            endDate: dateMode === 'range' ? endDate : undefined,

            presentDays: vals.presentDays ?? rec?.presentDays ?? 0,

            otDays: vals.otDays ?? rec?.otDays ?? 0,

            autoCount: !!autoCountMap[employeeId],

          }),

        });
      }

      await loadData();

      setEditValues((prev) => {
        const next = { ...prev };
        delete next[employeeId];
        return next;
      });

    } catch (err) {

      console.error('[Payroll] Save record failed:', err);

    } finally {

      setSavingRecordId(null);

    }

  };

  const handleDeleteEmployee = async (employeeId) => {
    if (!window.confirm('Delete this staff member? This will permanently remove their payroll records, attendance, and staff access.')) return;
    try {
      setDeletingId(employeeId);
      await apiFetch(`/api/payroll/employees/${employeeId}`, {
        method: 'DELETE',
      });
      loadData();
    } catch (err) {
      console.error('[Payroll] Delete employee failed:', err);
      alert(err.message || 'Failed to delete employee');
    } finally {
      setDeletingId(null);
    }
  };



  const handlePayment = async () => {

    if (!payModal || !payAmount) return;

    try {

      await apiFetch(`/api/payroll/records/${payModal.id}/payment`, {

        method: 'POST',

        body: JSON.stringify({ amount: parseFloat(payAmount) }),

      });

      setPayModal(null);

      setPayAmount('');

      loadData();

    } catch (err) {

      console.error('[Payroll] Payment failed:', err);

    }

  };

  const handleAddManualAdvance = async () => {
    if (!advanceModal || !advanceAmount) return;
    try {
      await apiFetch(`/api/payroll/records/${advanceModal.id}/advance`, {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(advanceAmount),
          reason: advanceReason.trim(),
        }),
      });
      setAdvanceAmount('');
      setAdvanceReason('');
      loadAdvanceHistory(advanceModal.id);
      loadData();
    } catch (err) {
      console.error('[Payroll] Add manual advance failed:', err);
      alert(err.message || 'Failed to add manual advance');
    }
  };

  const loadAdvanceHistory = async (recordId) => {
    try {
      const history = await apiFetch(`/api/payroll/records/${recordId}/advance-history`);
      setAdvanceHistory(history || []);
    } catch (err) {
      console.error('[Payroll] Load advance history failed:', err);
    }
  };

  const openAdvanceModal = (rec) => {
    setAdvanceModal(rec);
    setAdvanceHistory([]);
    setAdvanceAmount('');
    setAdvanceReason('');
    loadAdvanceHistory(rec.id);
  };

  const downloadImportTemplate = () => {
    const csv = 'S.NO,NAME,DESIGNATION,SALARY\n1,Manas Kumar,Master,30000\n2,Jitendra,Master,20000\n3,Krishna,Assistant,13000';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPreview = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportError('');
    setImportPreview(null);
    setEditedProposed([]);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const isPhoto = importFile.type.startsWith('image/');
      const res = await fetch(`${API_BASE}/api/payroll/import/preview`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData,
        signal: AbortSignal.timeout(isPhoto ? 120000 : 30000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setImportPreview(data);
      setEditedProposed(data.proposed || []);
    } catch (err) {
      console.error('[Payroll] Import preview failed:', err);
      setImportError(err.message || 'Failed to preview import');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportCommit = async () => {
    const unresolved = editedProposed.filter((r) => r.action === 'ambiguous' || r.action === 'needsReview');
    if (unresolved.length > 0) {
      setImportError(`Please resolve ${unresolved.length} row(s) marked for review before committing.`);
      return;
    }
    setImporting(true);
    setImportError('');
    try {
      const res = await fetch(`${API_BASE}/api/payroll/import/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ rows: editedProposed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Commit failed');
      setShowImportModal(false);
      setImportFile(null);
      setImportPreview(null);
      setEditedProposed([]);
      loadData();
      alert(`Import complete: ${data.created} created, ${data.updated} updated${data.errors.length ? `, ${data.errors.length} errors` : ''}`);
    } catch (err) {
      console.error('[Payroll] Import commit failed:', err);
      setImportError(err.message || 'Failed to commit import');
    } finally {
      setImporting(false);
    }
  };

  const updateProposedRow = (index, field, value) => {
    setEditedProposed((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      if (field === 'baseSalary') row.baseSalary = parseFloat(value) || 0;
      else if (field === 'role') row.role = value;
      else if (field === 'name') row.name = value;
      else if (field === 'staffCode') row.staffCode = value;
      else if (field === 'action') row.action = value;
      next[index] = row;
      return next;
    });
  };



  const getRecord = (empId) => records.find((r) => r.employeeId === empId);

  const recordsByEmployee = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      if (!map.has(r.employeeId)) map.set(r.employeeId, r);
    });
    return map;
  }, [records]);

  const totalBaseSalary = employees.reduce((sum, emp) => {
    const vals = editValues[emp.id] || {};
    return sum + (Number(vals.baseSalary ?? emp.baseSalary) || 0);
  }, 0);

  const totalAdvance = employees.reduce((sum, emp) => {
    const rec = recordsByEmployee.get(emp.id);
    return sum + (Number(rec?.totalAdvance) || 0);
  }, 0);

  const totalPaid = employees.reduce((sum, emp) => {
    const rec = recordsByEmployee.get(emp.id);
    return sum + (Number(rec?.paidAmount) || 0);
  }, 0);

  const totalPayable = Math.max(0, totalBaseSalary - totalAdvance);

  const totalOutstanding = Math.max(0, totalPayable - totalPaid);

  if (loading) {

    return <div className="flex items-center justify-center py-20 text-gray-400">Loading payroll...</div>;

  }



  return (

    <div className="space-y-6 font-sans">

      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm gap-6">

        <div>

          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">Staff Payroll & Attendance</h2>

          <div className="flex items-center gap-3 mt-2 flex-wrap">

            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => {
                  setDateMode('month');
                  // keep monthYear aligned with the selected range
                  if (startDate) setMonthYear(startDate.slice(0, 7));
                }}
                className={`px-3 py-1 rounded-md text-xs font-bold ${dateMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                Month
              </button>
              <button
                onClick={() => {
                  setDateMode('range');
                  // seed the range from the currently selected month
                  const [y, m] = monthYear.split('-').map(Number);
                  const lastDay = new Date(y, m, 0).getDate();
                  setStartDate(`${monthYear}-01`);
                  setEndDate(`${monthYear}-${String(lastDay).padStart(2, '0')}`);
                }}
                className={`px-3 py-1 rounded-md text-xs font-bold ${dateMode === 'range' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                Date Range
              </button>
            </div>

            {dateMode === 'month' ? (
              <input
                type="month"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
              />
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStartDate(val);
                    const [y, m] = val.split('-').map(Number);
                    const lastDay = new Date(y, m, 0).getDate();
                    const max = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                    if (!endDate || endDate < val || endDate > max) {
                      setEndDate(max);
                    }
                  }}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
                />
                <span className="text-xs font-bold text-gray-500">to</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={(() => {
                    const [y, m] = startDate.split('-').map(Number);
                    const lastDay = new Date(y, m, 0).getDate();
                    return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                  })()}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
                />
              </div>
            )}

            <button

              onClick={() => {

                if (records.length === 0) return;

                const headers = ['Staff Name', 'Base Salary', 'Present Days', 'OT Days', '4 Days', 'Total Days', 'Actual Salary', 'Advance', 'Final Salary', 'Salary Paid', 'Balance Salary', 'Status', 'Month'];

                const rows = records.map(r => [

                  r.employee?.name || '',

                  Number(r.baseSalary),

                  r.presentDays || 0,

                  r.otDays || 0,

                  r.leaveDays || 0,

                  r.totalDays || 0,

                  Number(r.actualSalary || 0),

                  Number(r.totalAdvance || 0),

                  Number(r.finalSalary || 0),

                  Number(r.paidAmount),

                  Number(r.balanceSalary || 0),

                  r.status || 'PENDING',

                  dateMode === 'range' ? `${startDate}_${endDate}` : monthYear,

                ].join(','));

                const csv = [headers.join(','), ...rows].join('\n');

                const blob = new Blob([csv], { type: 'text/csv' });

                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');

                a.href = url;

                a.download = `payroll-${dateMode === 'range' ? `${startDate}_to_${endDate}` : monthYear}.csv`;

                a.click();

                URL.revokeObjectURL(url);

              }}

              disabled={records.length === 0}

              className="text-xs font-bold bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"

            >

              <Download size={14} className="inline mr-1" />

              CSV

            </button>

          </div>

          {periodWarning && dateMode === 'range' && (
            <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700">
              Saved records were last computed for {periodWarning.savedStart} to {periodWarning.savedEnd}. Saving again will overwrite with {startDate} to {endDate}.
            </div>
          )}

        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-10">

          <div className="text-left sm:text-right">

            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Totals for {new Date(`${monthYear}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>

            <div className="flex gap-6">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Base</p>
                <p className="text-xl font-black text-gray-900 tracking-tighter">₹{totalBaseSalary.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Advance</p>
                <p className="text-xl font-black text-amber-600 tracking-tighter">₹{totalAdvance.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Payable</p>
                <p className="text-3xl font-black text-[#B71C1C] tracking-tighter">₹{totalPayable.toLocaleString()}</p>
              </div>
            </div>

            {totalOutstanding > 0 && (

              <p className="text-xs text-amber-600 font-bold mt-1">Outstanding: ₹{totalOutstanding.toLocaleString()}</p>

            )}

          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button

              onClick={() => {

                setIdempotencyKey(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

                setAddError('');

                setShowAddModal(true);

              }}

              className="w-full sm:w-auto bg-[#B71C1C] text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#8E1414] transition-all shadow-xl shadow-red-100 active:scale-95"

            >

              Add Staff

            </button>

            <button
              onClick={() => {
                setShowImportModal(true);
                setImportTab('excel');
                setImportFile(null);
                setImportPreview(null);
                setImportError('');
                setEditedProposed([]);
              }}
              className="w-full sm:w-auto bg-gray-900 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-gray-800 transition-all shadow-xl shadow-gray-100 active:scale-95"
            >
              <Upload size={14} className="inline mr-2" />
              Import Staff
            </button>
          </div>

        </div>

      </div>



      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search staff by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm font-bold text-gray-900 placeholder-gray-400"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-xs font-bold text-gray-500 hover:text-gray-700">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status:</span>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-gray-100 text-gray-500">Not Generated</span>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700">Pending</span>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700">Partial</span>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-green-100 text-green-700">Paid</span>
      </div>

      <div className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm overflow-hidden">

        <div className="overflow-x-auto">

          <table className="w-full text-left text-sm whitespace-nowrap">

            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">

              <tr>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Staff</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Designation</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Base Salary</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Present Days</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">OT Days</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">4 Days</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Total Days</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Actual Salary</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Advance</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Final Salary</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Salary Paid</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Balance Salary</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Status</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Actions</th>

              </tr>

            </thead>

            <tbody className="divide-y divide-gray-50">

              {employees
                .filter((emp) => emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((emp) => {

                const rec = getRecord(emp.id);

                const vals = editValues[emp.id] || {};
                const isAutoCount = !!autoCountMap[emp.id];
                const presentDaysVal = vals.presentDays ?? rec?.presentDays ?? 0;
                const otDaysVal = vals.otDays ?? rec?.otDays ?? 0;

                return (

                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">

                    <td className="px-4 py-4">

                      <div className="flex items-center gap-3">

                        <div className="h-9 w-9 rounded-full bg-red-50 flex items-center justify-center text-xs font-black text-[#B71C1C]">

                          {emp.name.split(' ').map(n => n[0]).join('')}

                        </div>

                        <div>

                          <p className="font-black text-gray-900">{emp.name}</p>

                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{emp.role || 'Staff'}</p>

                          {emp.createdVia === 'CASHIER' && (
                            <p className="text-[10px] font-bold text-amber-600 mt-0.5">Created by cashier — set base salary</p>
                          )}

                          {rec?.needsReview && (
                            <p className="text-[10px] font-bold text-amber-600 mt-0.5">Advance recorded, present days not set</p>
                          )}

                        </div>

                      </div>

                    </td>

                    <td className="px-4 py-4 text-left">
                      <p className="text-sm font-bold text-gray-700">{emp.designation || '-'}</p>
                      {emp.workerCategory && (
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{emp.workerCategory.replace('_', ' ')}</p>
                      )}
                    </td>

                    <td className="px-4 py-4 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={vals.baseSalary ?? (Number(emp.baseSalary) || 0)}
                        onChange={(e) => {
                          setEditValues({ ...editValues, [emp.id]: { ...vals, baseSalary: parseFloat(e.target.value) || 0 } });
                        }}
                        className="w-24 text-right border border-gray-200 rounded-lg py-1 text-sm"
                      />
                    </td>

                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="31"
                            step="0.5"
                            value={presentDaysVal}
                            disabled={isAutoCount}
                            onChange={(e) => {
                              setEditValues({ ...editValues, [emp.id]: { ...vals, presentDays: parseFloat(e.target.value) || 0 } });
                            }}
                            className={`w-14 text-center border border-gray-200 rounded-lg py-1 text-sm ${isAutoCount ? 'bg-gray-100 text-gray-500' : ''}`}
                          />
                          <button
                            onClick={() => {
                              const next = !isAutoCount;
                              setAutoCountMap({ ...autoCountMap, [emp.id]: next });
                            }}
                            className={`text-[10px] font-bold px-2 py-1 rounded-md ${isAutoCount ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
                          >
                            {isAutoCount ? 'Auto' : 'Manual'}
                          </button>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-center">

                      <input

                        type="number"

                        min="0"

                        value={otDaysVal}

                        onChange={(e) => {
                          setEditValues({ ...editValues, [emp.id]: { ...vals, otDays: parseInt(e.target.value) || 0 } });
                        }}

                        className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm"

                      />

                    </td>

                    <td className="px-4 py-4 text-center font-bold text-gray-700">
                      {rec?.leaveDays ?? 0}
                    </td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">
                      {rec?.totalDays ?? 0}
                    </td>

                    <td className="px-4 py-4 text-right font-bold text-gray-700">
                      ₹{Number(rec?.actualSalary || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-bold text-amber-600">₹{Number(rec?.totalAdvance || 0).toLocaleString()}</span>
                        {rec && (
                          <button
                            onClick={() => openAdvanceModal(rec)}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline"
                          >
                            History
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-right font-black text-gray-900">
                      ₹{Number(rec?.finalSalary || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-4 text-right font-bold text-gray-600">

                      ₹{rec ? Number(rec.paidAmount).toLocaleString() : '0'}

                    </td>

                    <td className="px-4 py-4 text-right font-bold text-[#B71C1C]">
                      ₹{Number(rec?.balanceSalary || 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-4 text-center">

                      {rec ? (

                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${

                          rec.status === 'PAID' ? 'bg-green-100 text-green-700' :

                          rec.status === 'PARTIAL' ? 'bg-blue-100 text-blue-700' :

                          'bg-amber-100 text-amber-700 animate-pulse'

                        }`}>

                          {rec.status}

                        </span>

                      ) : (

                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500">Not Generated</span>

                      )}

                    </td>

                    <td className="px-4 py-4 text-center">

                      <div className="flex items-center justify-center gap-2">

                        {savingRecordId === emp.id ? (
                          <span className="text-[10px] font-bold text-blue-600 animate-pulse">Saving...</span>
                        ) : (
                          <button
                            onClick={() => handleSaveRecord(emp.id)}
                            className="px-3 py-1.5 bg-[#E53935] text-white rounded-lg text-xs font-bold hover:bg-[#c62828]"
                          >
                            Save
                          </button>
                        )}

                        {rec && rec.status !== 'PAID' && (

                          <button

                            onClick={() => { setPayModal(rec); setPayAmount(''); }}

                            className="px-3 py-1.5 bg-[#B71C1C] text-white rounded-lg text-xs font-bold hover:bg-[#8E1414]"

                          >

                            Pay

                          </button>

                        )}

                        <button
                          onClick={() => openAdvanceModal(rec)}
                          disabled={!rec}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 disabled:opacity-50"
                        >
                          Advance
                        </button>

                        <button
                          onClick={() => handleDeleteEmployee(emp.id)}
                          disabled={deletingId === emp.id}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                        >
                          {deletingId === emp.id ? '...' : 'Delete'}
                        </button>

                      </div>

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

      </div>



      {employees.length === 0 && !searchTerm && (

        <div className="text-center py-12 text-gray-400">

          <Users size={48} className="mx-auto mb-3 opacity-30" />

          <p>No staff yet. Click "Add Staff" to get started.</p>

        </div>

      )}

      {employees.length > 0 && employees.filter((e) => e.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm font-bold">No staff match your search.</p>
        </div>
      )}



      {/* Add Employee Modal */}

      {showAddModal && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>

          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>

            <h3 className="text-lg font-black text-gray-900">Add Staff</h3>

            {addError && (

              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">

                {addError}

              </div>

            )}

            <input type="text" placeholder="Name" value={newEmp.name} onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />

            <input type="number" placeholder="Age" value={newEmp.age} onChange={(e) => setNewEmp({ ...newEmp, age: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />

            <select value={newEmp.role} onChange={(e) => setNewEmp({ ...newEmp, role: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm">

              <option value="">Select Role</option>

              <option value="Chef">Chef</option>

              <option value="Captain">Captain</option>

              <option value="Helper">Helper</option>

              <option value="Cashier">Cashier</option>

              <option value="Waitstaff">Waitstaff</option>

            </select>

            <select value={newEmp.designation} onChange={(e) => setNewEmp({ ...newEmp, designation: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm">

              <option value="">Select Designation</option>

              <option value="Master">Master</option>

              <option value="Assistant">Assistant</option>

              <option value="Supervisor">Supervisor</option>

              <option value="Manager">Manager</option>

              <option value="Trainee">Trainee</option>

            </select>

            <select value={newEmp.workerCategory} onChange={(e) => setNewEmp({ ...newEmp, workerCategory: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm">

              <option value="">Select Worker Category</option>

              <option value="SKILLED">Skilled</option>

              <option value="SEMI_SKILLED">Semi-Skilled</option>

              <option value="UNSKILLED">Unskilled</option>

            </select>

            <input type="number" placeholder="Base Salary (₹)" value={newEmp.baseSalary} onChange={(e) => setNewEmp({ ...newEmp, baseSalary: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />

            <div className="flex gap-3 pt-2">

              <button onClick={() => setShowAddModal(false)} disabled={adding} className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-sm disabled:opacity-50">Cancel</button>

              <button onClick={handleAddEmployee} disabled={adding} className="flex-1 py-2.5 bg-[#B71C1C] text-white rounded-xl font-bold text-sm hover:bg-[#8E1414] disabled:opacity-50 disabled:cursor-not-allowed">

                {adding ? 'Saving...' : 'Add'}

              </button>

            </div>

          </div>

        </div>

      )}



      {/* Payment Modal */}

      {payModal && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPayModal(null)}>

          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>

            <h3 className="text-lg font-black text-gray-900">Payment for {payModal.employee?.name}</h3>

            <div className="text-sm text-gray-500 space-y-1">

              <p>Final Salary: <span className="font-bold text-gray-900">₹{Number(payModal.finalSalary || payModal.netPayable).toLocaleString()}</span></p>

              <p>Already Paid: <span className="font-bold text-gray-700">₹{Number(payModal.paidAmount).toLocaleString()}</span></p>

              <p>Balance Salary: <span className="font-bold text-[#B71C1C]">₹{Number(payModal.balanceSalary || 0).toLocaleString()}</span></p>

            </div>

            <input type="number" placeholder="Payment amount" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />

            <div className="flex gap-3 pt-2">

              <button onClick={() => setPayModal(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-sm">Cancel</button>

              <button onClick={handlePayment} className="flex-1 py-2.5 bg-[#B71C1C] text-white rounded-xl font-bold text-sm hover:bg-[#8E1414]">Pay</button>

            </div>

          </div>

        </div>

      )}



      {/* Manual Advance Modal */}

      {advanceModal && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAdvanceModal(null)}>

          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

            <h3 className="text-lg font-black text-gray-900">Advance History — {advanceModal.employee?.name}</h3>

            <div className="text-sm text-gray-500 space-y-1">
              <p>Total Advance: <span className="font-bold text-amber-600">₹{Number(advanceModal.totalAdvance || 0).toLocaleString()}</span></p>
            </div>

            {advanceHistory.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No advance history for this record.</p>
            ) : (
              <div className="space-y-2">
                {advanceHistory.map((h) => (
                  <div key={h.id} className="border border-gray-100 rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-900">₹{Number(h.amount).toLocaleString()}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${h.type === 'EXPENDITURE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {h.type === 'EXPENDITURE' ? 'Expenditure' : 'Manual'}
                        </span>
                        <span className="text-xs text-gray-400">{h.date}</span>
                      </div>
                    </div>
                    {h.reason && <p className="text-xs text-gray-500 mt-1">{h.reason}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">By {h.createdBy?.name || 'Admin'}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-bold text-gray-900">Add Manual Advance</p>
              <input
                type="number"
                placeholder="Amount (₹)"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Reason (required for non-cashier advances)"
                value={advanceReason}
                onChange={(e) => setAdvanceReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <div className="flex gap-3 pt-2">
                <button onClick={() => setAdvanceModal(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-sm">Close</button>
                <button onClick={handleAddManualAdvance} disabled={!advanceAmount} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50">Add Advance</button>
              </div>
            </div>

          </div>

        </div>

      )}

      {/* Import Staff Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">Import Staff</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">
                {importError}
              </div>
            )}

            <div className="flex gap-2 border-b border-gray-200 pb-2">
              <button
                onClick={() => setImportTab('excel')}
                className={`px-4 py-2 text-xs font-black rounded-lg ${importTab === 'excel' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <FileSpreadsheet size={14} className="inline mr-1" />
                Excel / CSV
              </button>
              <button
                onClick={() => setImportTab('photo')}
                className={`px-4 py-2 text-xs font-black rounded-lg ${importTab === 'photo' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <Camera size={14} className="inline mr-1" />
                Photo
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadImportTemplate}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
                >
                  <Download size={14} className="inline mr-1" />
                  Download template
                </button>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors">
                <input
                  type="file"
                  id="staff-import-file"
                  className="hidden"
                  accept={importTab === 'excel' ? '.csv,.xlsx,.xls' : 'image/*'}
                  onChange={(e) => {
                    setImportFile(e.target.files[0]);
                    setImportPreview(null);
                    setEditedProposed([]);
                    setImportError('');
                  }}
                />
                <label htmlFor="staff-import-file" className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload size={32} className="text-gray-400" />
                  <span className="text-sm font-bold text-gray-700">
                    {importFile ? importFile.name : 'Click or drag file here'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {importTab === 'excel' ? 'Supports .csv, .xlsx, .xls' : 'Supports .jpg, .png, .jpeg'}
                  </span>
                </label>
              </div>

              <button
                onClick={handleImportPreview}
                disabled={!importFile || importLoading}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                {importLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader size={16} className="animate-spin" />
                    {importTab === 'photo' ? 'Scanning photo...' : 'Parsing file...'}
                  </span>
                ) : (
                  'Preview Import'
                )}
              </button>

              {importPreview && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">
                      Preview ({importPreview.parsedRows?.length || 0} rows found)
                    </p>
                    {importPreview.confidence && (
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full ${
                        importPreview.confidence === 'HIGH' ? 'bg-green-100 text-green-700' :
                        importPreview.confidence === 'MEDIUM' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {importPreview.confidence} CONFIDENCE
                      </span>
                    )}
                  </div>

                  {importPreview.warnings?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg text-xs space-y-1">
                      {importPreview.warnings.map((w, i) => (
                        <p key={i}>⚠ {w}</p>
                      ))}
                    </div>
                  )}

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-black text-gray-500">S.No</th>
                            <th className="px-3 py-2 font-black text-gray-500">Name</th>
                            <th className="px-3 py-2 font-black text-gray-500">Designation</th>
                            <th className="px-3 py-2 font-black text-gray-500">Salary</th>
                            <th className="px-3 py-2 font-black text-gray-500">Action</th>
                            <th className="px-3 py-2 font-black text-gray-500">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {editedProposed.map((row, idx) => (
                            <tr key={idx} className={`${row.action === 'ambiguous' || row.action === 'needsReview' ? 'bg-amber-50' : ''}`}>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={row.staffCode || ''}
                                  onChange={(e) => updateProposedRow(idx, 'staffCode', e.target.value)}
                                  className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={row.name}
                                  onChange={(e) => updateProposedRow(idx, 'name', e.target.value)}
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={row.role}
                                  onChange={(e) => updateProposedRow(idx, 'role', e.target.value)}
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={row.baseSalary}
                                  onChange={(e) => updateProposedRow(idx, 'baseSalary', e.target.value)}
                                  className="w-24 border border-gray-200 rounded px-2 py-1 text-xs text-right"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={row.action}
                                  onChange={(e) => updateProposedRow(idx, 'action', e.target.value)}
                                  className="border border-gray-200 rounded px-2 py-1 text-xs"
                                >
                                  <option value="create">Create</option>
                                  <option value="update">Update</option>
                                  <option value="ambiguous">Ambiguous</option>
                                  <option value="needsReview">Needs Review</option>
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                {row.action === 'create' && <span className="text-[10px] font-black text-green-600">NEW</span>}
                                {row.action === 'update' && (
                                  <span className="text-[10px] font-black text-blue-600">
                                    UPDATE {row.oldBaseSalary !== row.baseSalary && ` ₹${row.oldBaseSalary} → ₹${row.baseSalary}`}
                                  </span>
                                )}
                                {row.action === 'ambiguous' && <span className="text-[10px] font-black text-amber-600">AMBIGUOUS</span>}
                                {row.action === 'needsReview' && <span className="text-[10px] font-black text-red-600">REVIEW</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setImportPreview(null);
                        setEditedProposed([]);
                        setImportFile(null);
                      }}
                      disabled={importing}
                      className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-sm disabled:opacity-50"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleImportCommit}
                      disabled={importing}
                      className="flex-1 py-2.5 bg-[#B71C1C] text-white rounded-xl font-bold text-sm hover:bg-[#8E1414] disabled:opacity-50"
                    >
                      {importing ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader size={16} className="animate-spin" />
                          Importing...
                        </span>
                      ) : (
                        `Import ${editedProposed.filter((r) => r.action !== 'ambiguous' && r.action !== 'needsReview').length} Staff`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>

  );

}



// ==========================================

// KITCHEN INVENTORY MANAGEMENT (Phase 5)

// ==========================================



function getISTDateString() {

  const now = new Date();

  const istOffset = 5.5 * 60 * 60 * 1000;

  const istDate = new Date(now.getTime() + istOffset);

  return istDate.toISOString().slice(0, 10);

}



export function KitchenInventory() {

  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);

  const [newItem, setNewItem] = useState({ name: '', unit: 'Kg', category: '', currentStock: '', prize: '', image: null, imagePreview: null });

  const [searchQuery, setSearchQuery] = useState('');

  const [addStockModal, setAddStockModal] = useState(null);

  const [addStockAmount, setAddStockAmount] = useState('');

  const [fromDate, setFromDate] = useState(getISTDateString);
  const [toDate, setToDate] = useState(getISTDateString);
  const isRangeMode = fromDate !== toDate;

  const [manualConsumption, setManualConsumption] = useState({});

  const [savingItemId, setSavingItemId] = useState(null);

  const [topSelling, setTopSelling] = useState(null);

  const [topSellingLoading, setTopSellingLoading] = useState(false);

  const [editingCell, setEditingCell] = useState(null);

  const [editSaving, setEditSaving] = useState(false);

  const [importing, setImporting] = useState(false);

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [addError, setAddError] = useState(null);

  const [adding, setAdding] = useState(false);

  const [editingImageItem, setEditingImageItem] = useState(null);

  const [imageEditPreview, setImageEditPreview] = useState(null);

  const [outletFilter, setOutletFilter] = useState('self'); // 'self' | 'combined'

  const [accessibleOutlets, setAccessibleOutlets] = useState([]);

  const [categoryFilter, setCategoryFilter] = useState('All');

  const [deductionCheckOrderId, setDeductionCheckOrderId] = useState('');

  const [deductionCheckResult, setDeductionCheckResult] = useState(null);

  const [deductionCheckLoading, setDeductionCheckLoading] = useState(false);

  const [showDeductionPanel, setShowDeductionPanel] = useState(false);

  const csvImportRef = useRef(null);

  const restaurantId = getCurrentRestaurantId();

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      if (raw) setAccessibleOutlets(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);



  const loadItems = useCallback(async () => {

    if (isRangeMode) return;

    setLoading(true);

    try {

      if (outletFilter === 'combined') {

        const res = await fetch(`${API_BASE}/api/inventory/kitchen/combined?restaurantId=${restaurantId}`, {

          headers: { ...getAuthHeaders() },

        });

        if (res.ok) {

          const data = await res.json();

          setItems(data.kitchen || []);

        }

      } else {

        const res = await fetch(`${API_BASE}/api/inventory/kitchen?restaurantId=${restaurantId}&date=${encodeURIComponent(fromDate)}`, {

          headers: { ...getAuthHeaders() },

        });

        if (res.ok) setItems(await res.json());

      }

    } catch (err) {

      console.error('[KitchenInventory] Failed to load:', err);

    } finally {

      setLoading(false);

    }

  }, [restaurantId, fromDate, outletFilter, isRangeMode]);



  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => { setManualConsumption({}); }, [fromDate]);



  const handleAddItem = async () => {

    if (!newItem.name || !newItem.unit || adding) return;

    setAddError(null);

    setAdding(true);

    try {

      let imageUrl = null;

      if (newItem.image && newItem.image.startsWith('data:')) {
        imageUrl = await uploadImageToCloudinary(newItem.image, newItem.name);
      }

      const res = await fetch(`${API_BASE}/api/inventory/kitchen/items`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify({

          restaurantId,

          name: newItem.name.trim(),

          unit: newItem.unit,

          category: newItem.category.trim(),

          currentStock: parseFloat(newItem.currentStock) || 0,

          price: parseFloat(newItem.prize) || 0,

          ...(imageUrl ? { image: imageUrl } : {}),

        }),

      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setAddError(`"${newItem.name}" already exists in inventory.`);
        } else {
          setAddError(body.error || 'Failed to add ingredient');
        }
        return;
      }

      setNewItem({ name: '', unit: 'kg', category: '', currentStock: '', prize: '', image: null, imagePreview: null });

      setShowAddModal(false);

      loadItems();

    } catch (err) {

      console.error('[KitchenInventory] Add item failed:', err);

      setAddError(err.message || 'Failed to add ingredient');

    } finally {

      setAdding(false);

    }

  };

  const handleImageEditSave = async () => {
    if (!editingImageItem || !imageEditPreview) return;
    try {
      const imageUrl = await uploadImageToCloudinary(imageEditPreview, editingImageItem.name);
      await fetch(`${API_BASE}/api/inventory/kitchen/items/${editingImageItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ image: imageUrl }),
      });
      setItems(prev => prev.map(i => i.id === editingImageItem.id ? { ...i, image: imageUrl } : i));
      setEditingImageItem(null);
      setImageEditPreview(null);
    } catch (err) {
      console.error('[KitchenInventory] Image edit failed:', err);
    }
  };



  const handleAddStock = async () => {

    if (!addStockModal || !addStockAmount) return;

    try {

      await fetch(`${API_BASE}/api/inventory/kitchen/entries`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify({

          restaurantId,

          itemId: addStockModal.id,

          addStock: parseFloat(addStockAmount),

          date: fromDate,

        }),

      });

      setAddStockModal(null);

      setAddStockAmount('');

      loadItems();

    } catch (err) {

      console.error('[KitchenInventory] Add stock failed:', err);

    }

  };



  const handleSaveManualConsumption = async (item) => {

    const delta = parseFloat(manualConsumption[item.id]);

    if (!delta || delta <= 0 || isNaN(delta)) return;



    setSavingItemId(item.id);

    try {

      const res = await fetch(`${API_BASE}/api/inventory/kitchen/entries`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify({

          restaurantId,

          itemId: item.id,

          consumedStock: delta,

          date: fromDate,

        }),

      });

      if (!res.ok) {

        const body = await res.json().catch(() => ({}));

        alert(body.error || 'Failed to save consumption');

      } else {

        setManualConsumption(prev => ({ ...prev, [item.id]: '' }));

        loadItems();

      }

    } catch (err) {

      console.error('[KitchenInventory] Save consumption failed:', err);

      alert('Failed to save consumption');

    } finally {

      setSavingItemId(null);

    }

  };



  const [importProgress, setImportProgress] = useState('');



  const handleImportCSV = async (file) => {

    if (!file.name.endsWith('.csv')) { alert('Please select a .csv file.'); return; }



    const parseCSVLine = (line) => {

      const result = []; let current = ''; let inQuotes = false;

      for (let i = 0; i < line.length; i++) {

        const ch = line[i];

        if (ch === '"') { inQuotes = !inQuotes; }

        else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }

        else { current += ch; }

      }

      result.push(current);

      return result;

    };



    const rawText = await file.text();

    // Strip UTF-8 BOM (Excel adds \uFEFF at start of CSV files)

    const text = rawText.replace(/^\uFEFF/, '');

    const lines = text.trim().split('\n');

    const header = lines[0].trim().replace(/\r/g, '');

    const hasStockColumn = header === 'S.NO,INGREDIENT,CATEGORY,PRICE,STOCK';

    const hasScaleColumn = header === 'S.NO,INGREDIENT,CATEGORY,PRICE,STOCK,SCALE';

    const hasReorderColumn = header === 'S.NO,INGREDIENT,CATEGORY,PRICE,STOCK,SCALE,REORDER';

    if (header !== 'S.NO,INGREDIENT,CATEGORY,PRICE' && !hasStockColumn && !hasScaleColumn && !hasReorderColumn) {

      alert(`Invalid CSV format.\nExpected header: S.NO,INGREDIENT,CATEGORY,PRICE,STOCK,SCALE,REORDER\nGot: ${header}`);

      return;

    }



    // Parse all valid rows first

    const rows = [];

    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {

      const line = lines[i].trim().replace(/\r/g, '');

      if (!line) continue;

      const cols = parseCSVLine(line);

      if (cols.length < 4) { skipped++; continue; }

      const [, rawIngredient, rawCategory, price, stock, rawScale, rawReorder] = cols.map(c => c.trim());
      const ingredient = rawIngredient;

      if (!ingredient) { skipped++; continue; }

      const prize    = (price       === 'N/A' || price       === '' || price       === '0') ? 0  : parseFloat(price) || 0;

      const category = (rawCategory === 'N/A' || rawCategory === '' || rawCategory == null) ? '' : rawCategory;

      const unit     = (rawScale    === 'N/A' || rawScale    === '' || rawScale    == null) ? '' : rawScale;

      const currentStock = ((hasStockColumn || hasScaleColumn || hasReorderColumn) && stock !== 'N/A' && stock !== '') ? parseFloat(stock) || 0 : 0;

      let reorderLevel = 0;
      if (hasReorderColumn && rawReorder !== undefined && rawReorder !== 'N/A' && rawReorder !== '') {
        reorderLevel = parseFloat(rawReorder) || 0;
      } else if (currentStock > 0) {
        reorderLevel = Math.max(Math.round(currentStock * 0.15 * 100) / 100, 1);
      }

      rows.push({ ingredient, unit, prize, currentStock, category, reorderLevel, rowNum: i + 1 });

    }



    if (rows.length === 0) { alert('No valid rows found in the file.'); return; }



    setImporting(true);

    setImportProgress(`0 / ${rows.length}`);

    let done = 0, succeeded = 0, alreadyExists = 0;

    const errors = [];

    const BATCH = 10;



    // Process in parallel batches of 10 so 200 items takes ~6s not 60s

    for (let b = 0; b < rows.length; b += BATCH) {

      const batch = rows.slice(b, b + BATCH);

      await Promise.all(batch.map(async ({ ingredient, unit, prize, currentStock, category, reorderLevel, rowNum }) => {

        try {

          const res = await fetch(`${API_BASE}/api/inventory/kitchen/items`, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

            body: JSON.stringify({ restaurantId, name: ingredient, unit, prize, currentStock, category, reorderLevel }),

          });

          if (!res.ok) {

            if (res.status === 409) {
              alreadyExists++;
            } else {
              const body = await res.json().catch(() => ({}));
              errors.push(`Row ${rowNum} (${ingredient}): ${body.error || res.status}`);
            }

          } else {

            succeeded++;

          }

        } catch (err) {

          errors.push(`Row ${rowNum} (${ingredient}): ${err.message}`);

        }

        done++;

        setImportProgress(`${done} / ${rows.length}`);

      }));

    }



    setImporting(false);

    setImportProgress('');

    loadItems();

    const errMsg = errors.length ? `\n\nErrors (${errors.length}):\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n…and ${errors.length - 5} more` : ''}` : '';

    alert(`Import complete!\n✅ ${succeeded} items saved\n⏭ ${skipped} rows skipped\n⏺ ${alreadyExists} already existed${errMsg}`);

  };



  const handleUpdateItem = async (id, fields) => {

    try {

      const res = await fetch(`${API_BASE}/api/inventory/kitchen/items/${id}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify(fields),

      });

      if (!res.ok) {

        const body = await res.json().catch(() => ({}));

        throw new Error(body.error || res.statusText);

      }

      // Update only the changed item locally instead of reloading the whole list.

      setItems(prev => prev.map(item => item.id === id ? { ...item, ...fields } : item));

    } catch (err) {

      console.error('[KitchenInventory] Update item failed:', err);

    }

  };



  const handleInlineSave = async (item, field) => {

    if (!editingCell) return;

    setEditSaving(true);

    try {

      if (field === 'price' || field === 'name' || field === 'unit' || field === 'category') {

        const payload = {};

        if (field === 'price') payload.price = parseFloat(editingCell.value) || 0;

        else if (field === 'name') payload.name = editingCell.value.trim() || item.name;

        else if (field === 'unit') payload.unit = editingCell.value.trim() || item.unit;

        else if (field === 'category') payload.category = editingCell.value.trim();

        await handleUpdateItem(item.id, payload);

        setEditingCell(null);

        return;

      } else {

        const payload = { restaurantId, itemId: item.id, date: fromDate, replace: true };

        if (field === 'opening') payload.openingStock = parseFloat(editingCell.value) || 0;

        else if (field === 'purchase') payload.addStock = parseFloat(editingCell.value) || 0;

        else if (field === 'consumed') payload.consumedStock = parseFloat(editingCell.value) || 0;

        await fetch(`${API_BASE}/api/inventory/kitchen/entries`, {

          method: 'POST',

          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

          body: JSON.stringify(payload),

        });

      }

      setEditingCell(null);

      loadItems();

    } catch (err) {

      console.error('[KitchenInventory] Inline save failed:', err);

    } finally {

      setEditSaving(false);

    }

  };



  const handleFetchTopSelling = async () => {

    setTopSellingLoading(true);

    try {

      const res = await fetch(

        `${API_BASE}/api/inventory/kitchen/top-selling?restaurantId=${restaurantId}&startDate=${encodeURIComponent(fromDate)}&endDate=${encodeURIComponent(fromDate)}`,

        { headers: { ...getAuthHeaders() } }

      );

      if (res.ok) {

        setTopSelling(await res.json());

      } else {

        setTopSelling([]);

      }

    } catch (err) {

      console.error('[KitchenInventory] Top selling failed:', err);

      setTopSelling([]);

    } finally {

      setTopSellingLoading(false);

    }

  };



  const handleDeleteItem = async (id) => {

    if (!confirm('Delete this ingredient?')) return;

    try {

      await fetch(`${API_BASE}/api/inventory/kitchen/items/${id}`, {

        method: 'DELETE',

        headers: { ...getAuthHeaders() },

      });

      loadItems();

    } catch (err) {

      console.error('[KitchenInventory] Delete failed:', err);

    }

  };



  const allCategories = [...new Set(items.map(i => i.category || '').filter(Boolean))].sort();

  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (categoryFilter === 'All' || (i.category || '') === categoryFilter)
  );

  const allSelected = filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id));

  const someSelected = filteredItems.some(i => selectedIds.has(i.id));



  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };



  const handleSelectItem = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };



  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected ingredient(s)?`)) return;

    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let failed = 0;

    await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch(`${API_BASE}/api/inventory/kitchen/items/${id}`, {
          method: 'DELETE',
          headers: { ...getAuthHeaders() },
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }));

    setSelectedIds(new Set());
    setBulkDeleting(false);
    loadItems();

    if (failed > 0) {
      alert(`${ids.length - failed} deleted, ${failed} failed.`);
    }
  };



  const renderEditCell = (item, field, displayValue) => {

    const isEditing = editingCell?.itemId === item.id && editingCell?.field === field;

    const currentFieldValue = field === 'price' ? Number(item.price || 0)

      : field === 'opening' ? (item.todayEntry ? Number(item.todayEntry.openingStock || 0) : 0)

      : field === 'purchase' ? (item.todayEntry ? Number(item.todayEntry.addedStock || 0) : 0)

      : (item.todayEntry ? Number(item.todayEntry.consumedStock || 0) : 0);

    if (isEditing) {

      return (

        <div className="flex items-center justify-center gap-1">

          <input

            type="number" step="0.01" min="0"

            value={editingCell.value}

            onChange={(e) => setEditingCell(prev => ({ ...prev, value: e.target.value }))}

            className="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-center outline-none focus:border-blue-400"

            autoFocus

            disabled={editSaving}

          />

          <button onClick={() => handleInlineSave(item, field)} disabled={editSaving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={12} /></button>

          <button onClick={() => setEditingCell(null)} disabled={editSaving} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>

        </div>

      );

    }

    return (

      <div className="flex items-center justify-center gap-1 group/cell">

        <span>{displayValue}</span>

        <button

          onClick={() => setEditingCell({ itemId: item.id, field, value: String(currentFieldValue) })}

          className="p-0.5 text-gray-400 hover:text-gray-700"

        >

          <Pencil size={12} />

        </button>

      </div>

    );

  };



  const lowStockItems = items.filter((i) => i.currentStock <= i.reorderLevel && i.reorderLevel > 0);



  if (loading) {

    return <div className="flex items-center justify-center py-20 text-gray-400">Loading kitchen inventory...</div>;

  }



  return (

    <div className="space-y-6 font-sans">

      <div className="flex flex-col lg:flex-row lg:items-center justify-between bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm gap-6">

        <div className="min-w-0 flex-shrink-0">
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter leading-tight">Kitchen<br />Inventory</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 leading-relaxed">Ingredients & Daily<br />Tracking</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">

          {accessibleOutlets.length > 1 && (

            <div className="flex items-center gap-2">

              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">View</label>

              <select

                value={outletFilter}

                onChange={(e) => setOutletFilter(e.target.value)}

                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-[#E53935] outline-none"

              >

                <option value="self">This Outlet</option>

                <option value="combined">All Outlets (Shared)</option>

              </select>

              {outletFilter === 'combined' && (

                <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">Read-only</span>

              )}

            </div>

          )}

          <DateRangePicker
            fromDate={fromDate}
            toDate={toDate}
            onChange={(newFrom, newTo) => {
              setFromDate(newFrom);
              setToDate(newTo);
            }}
          />

          {!isRangeMode && (<>

          <button

            onClick={() => {

              if (items.length === 0) return;

              const headers = ['S.NO', 'ITEM NAME', 'UNITS', 'RATE', 'OPENING', 'PURCHASE', 'CLOSING'];

              const rows = items.map((item, index) => {

                const prize = parseFloat(item.price);

                const priceCell    = (!item.price || isNaN(prize) || prize === 0) ? 'N/A' : prize.toFixed(2);

                const scaleCell    = (item.unit && item.unit.trim() !== '') ? item.unit : 'N/A';

                const safeName     = item.name.includes(',') ? `"${item.name}"` : item.name;

                const safeScale    = scaleCell.includes(',') ? `"${scaleCell}"` : scaleCell;

                const hasEntry = !!item.todayEntry;

                const opening  = hasEntry ? Number(item.todayEntry.openingStock  ?? 0) : 0;

                const purchase = hasEntry ? Number(item.todayEntry.addedStock    ?? 0) : 0;

                const closingStock = hasEntry ? Number(item.todayEntry.closingStock ?? 0) : Number(item.currentStock || 0);

                const openingCell  = opening.toFixed(2);

                const purchaseCell = purchase.toFixed(2);

                const closingCell  = closingStock.toFixed(2);

                return [index + 1, safeName, safeScale, priceCell, openingCell, purchaseCell, closingCell].join(',');

              });

              const csv  = [headers.join(','), ...rows].join('\n');

              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

              const url  = URL.createObjectURL(blob);

              const a = document.createElement('a');

              a.href = url;

              a.download = `kitchen-inventory-${new Date().toISOString().slice(0, 10)}.csv`;

              a.click();

              URL.revokeObjectURL(url);

            }}

            disabled={items.length === 0}

            className="w-full sm:w-auto text-xs font-bold bg-[#F4F4F5] text-gray-700 px-6 py-4 rounded-2xl hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"

          >

            <Download size={14} /> CSV

          </button>

          <input

            ref={csvImportRef}

            type="file"

            accept=".csv"

            className="hidden"

            onChange={(e) => { if (e.target.files[0]) handleImportCSV(e.target.files[0]); e.target.value = ''; }}

          />

          <button

            onClick={() => csvImportRef.current?.click()}

            disabled={importing}

            className="w-full sm:w-auto text-xs font-bold bg-[#F4F4F5] text-gray-700 px-6 py-4 rounded-2xl hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"

          >

            <Download size={14} className="rotate-180" /> {importing ? `Importing ${importProgress}…` : 'Import CSV'}

          </button>

          <input

            type="text"

            placeholder="Search ingredients..."

            value={searchQuery}

            onChange={(e) => setSearchQuery(e.target.value)}

            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-[#E53935] outline-none w-40"

          />

          <button

            onClick={() => {
              setNewItem({ name: '', unit: 'Kg', currentStock: '', prize: '', image: null, imagePreview: null });
              setAddError(null);
              setShowAddModal(true);
            }}

            className="w-full sm:w-auto bg-[#B71C1C] text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#8E1414] transition-all shadow-xl shadow-red-100 active:scale-95"

          >

            Add Ingredient

          </button>

          <button

            onClick={handleFetchTopSelling}

            disabled={topSellingLoading}

            className="w-full sm:w-auto bg-[#FFF3E0] text-[#E65100] px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#FFE0B2] transition-all active:scale-95 disabled:opacity-50"

          >

            {topSellingLoading ? 'Loading...' : 'Top 3 Selling Items'}

          </button>

          <button

            onClick={() => setShowDeductionPanel(p => !p)}

            className={`w-full sm:w-auto px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-2 ${showDeductionPanel ? 'bg-[#B71C1C] text-white shadow-red-100 shadow-xl' : 'bg-[#F4F4F5] text-gray-700 hover:bg-gray-200'}`}

          >

            <Activity size={14} /> Deduction Check

          </button>

          </>)}

        </div>

      </div>



      {isRangeMode && (
        <InventoryRangeSummary
          restaurantId={restaurantId}
          startDate={fromDate}
          endDate={toDate}
          kind="kitchen"
        />
      )}

      {!isRangeMode && (
        <>

      {/* Deduction Diagnostic Panel */}
      {showDeductionPanel && (
        <div className="bg-white border-2 border-red-100 rounded-3xl p-6 shadow-sm mb-6 relative">
          <button onClick={() => setShowDeductionPanel(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-red-600" size={20} />
            <h3 className="text-sm font-black uppercase tracking-widest text-red-900">Deduction Diagnostic</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">Enter an Order ID to verify what kitchen stock was deducted when the bill was settled.</p>
          <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Paste Order ID here…"
                value={deductionCheckOrderId}
                onChange={(e) => setDeductionCheckOrderId(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-[#E53935] outline-none font-mono"
              />
              <button
                onClick={async () => {
                  if (!deductionCheckOrderId.trim()) return;
                  setDeductionCheckLoading(true);
                  setDeductionCheckResult(null);
                  try {
                    const res = await fetch(`${API_BASE}/api/inventory/kitchen/deduction-check?orderId=${encodeURIComponent(deductionCheckOrderId.trim())}`, {
                      headers: { ...getAuthHeaders() },
                    });
                    const data = await res.json();
                    setDeductionCheckResult(res.ok ? data : { error: data.error || 'Request failed' });
                  } catch (err) {
                    setDeductionCheckResult({ error: err.message });
                  } finally {
                    setDeductionCheckLoading(false);
                  }
                }}
                disabled={deductionCheckLoading || !deductionCheckOrderId.trim()}
                className="px-5 py-2 bg-[#B71C1C] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#8E1414] disabled:opacity-50"
              >
                {deductionCheckLoading ? 'Checking…' : 'Check'}
              </button>
            </div>

            {deductionCheckResult && (
              <div className="space-y-3">
                {deductionCheckResult.error ? (
                  <p className="text-sm text-red-600 font-bold">{deductionCheckResult.error}</p>
                ) : (
                  <>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="font-bold text-gray-700">Status: <span className={deductionCheckResult.status === 'PAID' ? 'text-green-600' : 'text-amber-600'}>{deductionCheckResult.status}</span></span>
                      <span className="font-bold text-gray-700">Inventory Deducted: <span className={deductionCheckResult.inventoryDeducted ? 'text-green-600' : 'text-red-600'}>{deductionCheckResult.inventoryDeducted ? 'Yes ✓' : 'No ✗'}</span></span>
                      <span className="font-bold text-gray-700">Food Items: {deductionCheckResult.totalFoodItems}</span>
                    </div>

                    {deductionCheckResult.missingRecipes?.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                        <p className="text-xs font-black text-red-700 mb-1">No Recipe Set Up For:</p>
                        <p className="text-xs text-red-600">{deductionCheckResult.missingRecipes.join(', ')}</p>
                        <p className="text-[10px] text-red-500 mt-1">Go to Menu → Edit the item → Set Recipe to fix this.</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      {deductionCheckResult.foodItems?.map((fi) => (
                        <div key={fi.menuItemId} className={`rounded-xl border p-3 ${fi.hasRecipe ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-black text-gray-900">{fi.name} × {fi.orderedQty}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fi.hasRecipe ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {fi.hasRecipe ? '✓ Recipe found' : '✗ No recipe'}
                            </span>
                          </div>
                          {fi.ingredients?.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {fi.ingredients.map((ing) => (
                                <span key={ing.ingredientId} className={`text-[10px] border rounded-lg px-2 py-0.5 ${ing.deductionStatus === 'FAILED' ? 'bg-red-50 border-red-300 text-red-700' : ing.deductionStatus === 'SUCCESS' ? 'bg-white border-green-200 text-gray-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                                  {ing.name}: -{ing.totalDeductQty.toFixed(3)} {ing.unit}
                                  {ing.deductionStatus && (
                                    <span className="ml-1 font-bold">
                                      {ing.deductionStatus === 'SUCCESS' ? '✓' : ing.deductionStatus === 'FAILED' ? '✗' : '—'}
                                    </span>
                                  )}
                                  {ing.deductionError && (
                                    <span className="ml-1 text-red-500">({ing.deductionError})</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {deductionCheckResult.deductionSummary?.failedCount > 0 && (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-amber-800">{deductionCheckResult.deductionSummary.failedCount} ingredient(s) failed deduction</p>
                          <p className="text-[10px] text-amber-600">
                            {deductionCheckResult.deductionSummary.failedIngredients?.map(f => `${f.name}: ${f.error}`).join(', ')}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`${API_BASE}/api/inventory/kitchen/retry-deduction/${encodeURIComponent(deductionCheckOrderId.trim())}`, {
                                method: 'POST',
                                headers: { ...getAuthHeaders() },
                              });
                              const data = await res.json();
                              if (res.ok) {
                                alert(data.message || 'Retry completed');
                                setDeductionCheckResult(null);
                                setDeductionCheckLoading(true);
                                const checkRes = await fetch(`${API_BASE}/api/inventory/kitchen/deduction-check?orderId=${encodeURIComponent(deductionCheckOrderId.trim())}`, {
                                  headers: { ...getAuthHeaders() },
                                });
                                const checkData = await checkRes.json();
                                setDeductionCheckResult(checkRes.ok ? checkData : { error: checkData.error });
                              } else {
                                alert(data.error || 'Retry failed');
                              }
                            } catch (err) {
                              alert(err.message || 'Retry failed');
                            } finally {
                              setDeductionCheckLoading(false);
                            }
                          }}
                          className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-700 whitespace-nowrap"
                        >
                          Retry Deduction
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
      )}



      {lowStockItems.length > 0 && (

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">

          <AlertCircle className="text-amber-600" size={24} />

          <div>

            <p className="font-bold text-amber-800">{lowStockItems.length} ingredient(s) below reorder level</p>

            <p className="text-sm text-amber-600">{lowStockItems.map((i) => i.name).join(', ')}</p>

          </div>

        </div>

      )}



      {selectedIds.size > 0 && (

        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">

          <div className="flex items-center gap-3">

            <CheckSquare className="text-red-600" size={20} />

            <p className="font-bold text-red-800">{selectedIds.size} ingredient(s) selected</p>

          </div>

          <div className="flex items-center gap-3">

            <button

              onClick={() => setSelectedIds(new Set())}

              className="text-sm font-bold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100"

            >Clear Selection</button>

            <button

              onClick={handleBulkDelete}

              disabled={bulkDeleting}

              className="text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-2"

            >

              {bulkDeleting ? <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <Trash2 size={14} />}

              {bulkDeleting ? 'Deleting...' : 'Delete Selected'}

            </button>

          </div>

        </div>

      )}



      {/* Category Filter Tabs */}
      {allCategories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {['All', ...allCategories].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                categoryFilter === cat
                  ? 'bg-[#B71C1C] text-white shadow-md'
                  : 'bg-[#F4F4F5] text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat === 'All' ? `All (${items.length})` : `${cat} (${items.filter(i => (i.category || '') === cat).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Laptop Table */}
      <div className="hidden md:block bg-white rounded-3xl border border-[#FFCDD2] shadow-sm overflow-hidden">

        <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">

          <table className="w-full text-left text-sm whitespace-nowrap">

            <thead className="sticky top-0 bg-[#F9FAFB] border-b border-[#FFCDD2] z-10">

              <tr>

                <th className="px-4 py-4 text-center">

                  <input

                    type="checkbox"

                    checked={allSelected}

                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}

                    onChange={handleSelectAll}

                    className="h-4 w-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935] cursor-pointer"

                  />

                </th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Ingredient</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Category</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Scale</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Price</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Opening Stock</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Opening Amount</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Purchase</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Purchase Amount</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Total Stock</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Total Stock Amount</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Consumption</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Consumption Amount</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Balance Stock</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Balance Stock Amount</th>

                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Actions</th>

              </tr>

            </thead>

            <tbody className="divide-y divide-gray-50">

              {filteredItems.map((item) => {

                const isLow = item.currentStock <= item.reorderLevel && item.reorderLevel > 0;

                const price = Number(item.price || 0);

                const hasEntry = !!item.todayEntry;

                const isCarryOver = item.todayEntry?.isCarryOver === true;

                const opening  = hasEntry ? Number(item.todayEntry.openingStock  ?? 0) : null;

                const purchase = hasEntry ? Number(item.todayEntry.addedStock    ?? 0) : null;

                const consumed = hasEntry ? Number(item.todayEntry.consumedStock ?? 0) : null;

                const closingStock = hasEntry ? Number(item.todayEntry.closingStock ?? 0) : null;

                const openingAmt     = opening     != null ? opening     * price : null;

                const purchaseAmt    = purchase    != null ? purchase    * price : null;

                const totalStock     = hasEntry    ? opening + purchase          : null;

                const totalStockAmt  = totalStock  != null ? totalStock  * price : null;

                const consumptionAmt = consumed    != null ? consumed    * price : null;

                const balanceStock   = closingStock;

                const balanceStockAmt = balanceStock != null ? balanceStock * price : null;

                const fmtAmt = (val) => val == null ? '—' : `₹ ${Number(val).toFixed(2)}`;

                const fmtVal = (val) => val == null ? '—' : String(val);

                return (

                  <tr key={item.id} className={`transition-colors ${isCarryOver ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-gray-50'} ${selectedIds.has(item.id) ? 'bg-red-50/50' : ''}`}>

                    <td className="px-4 py-4 text-center">

                      <input

                        type="checkbox"

                        checked={selectedIds.has(item.id)}

                        onChange={() => handleSelectItem(item.id)}

                        className="h-4 w-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935] cursor-pointer"

                      />

                    </td>

                    <td className="px-4 py-4">

                      <div className="flex items-center gap-3">

                        <div className="relative group">

                          {item.image ? (

                            <img

                              src={item.image}

                              alt={item.name}

                              className="h-12 w-12 rounded-full object-cover border border-gray-200 shadow-sm shrink-0"

                            />

                          ) : (

                            <IngredientAvatar name={item.name} />

                          )}

                          <button

                            onClick={(e) => { e.stopPropagation(); setEditingImageItem(item); setImageEditPreview(null); }}

                            className="absolute -bottom-1 -right-1 p-1 bg-white rounded-full shadow border border-gray-200 text-gray-500 hover:text-[#E53935] opacity-0 group-hover:opacity-100 transition-opacity"

                            title="Change image"

                          >

                            <Pencil size={10} />

                          </button>

                        </div>

                        <div>

                          {editingCell?.itemId === item.id && editingCell?.field === 'name' ? (

                            <div className="flex items-center gap-1">

                              <input

                                type="text"

                                value={editingCell.value}

                                onChange={(e) => setEditingCell(prev => ({ ...prev, value: e.target.value }))}

                                onKeyDown={(e) => { if (e.key === 'Enter') handleInlineSave(item, 'name'); if (e.key === 'Escape') setEditingCell(null); }}

                                className="px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:border-blue-400 w-32"

                                autoFocus

                                disabled={editSaving}

                              />

                              <button onClick={() => handleInlineSave(item, 'name')} disabled={editSaving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={12} /></button>

                              <button onClick={() => setEditingCell(null)} disabled={editSaving} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>

                            </div>

                          ) : (

                            <div className="flex items-center gap-1 group/name">

                              <p className="font-black text-gray-900 text-sm">{item.name}</p>

                              <button

                                onClick={() => setEditingCell({ itemId: item.id, field: 'name', value: item.name })}

                                className="p-0.5 text-gray-400 hover:text-gray-700 opacity-0 group-hover/name:opacity-100 transition-opacity"

                                title="Edit ingredient name"

                              >

                                <Pencil size={11} />

                              </button>

                            </div>

                          )}

                          {isCarryOver && <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">↩ carried over</span>}

                        </div>

                      </div>

                    </td>

                    <td className="px-4 py-4 text-gray-500 text-sm">

                      {editingCell?.itemId === item.id && editingCell?.field === 'category' ? (

                        <div className="flex items-center justify-start gap-1">

                          <input

                            type="text"

                            list="category-suggestions"

                            value={editingCell.value}

                            onChange={(e) => setEditingCell(prev => ({ ...prev, value: e.target.value }))}

                            onKeyDown={(e) => { if (e.key === 'Enter') handleInlineSave(item, 'category'); if (e.key === 'Escape') setEditingCell(null); }}

                            className="px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:border-blue-400 w-32"

                            placeholder="e.g. Vegetables"

                            autoFocus

                            disabled={editSaving}

                          />

                          <datalist id="category-suggestions">

                            {allCategories.map(c => <option key={c} value={c} />)}

                          </datalist>

                          <button onClick={() => handleInlineSave(item, 'category')} disabled={editSaving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={12} /></button>

                          <button onClick={() => setEditingCell(null)} disabled={editSaving} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>

                        </div>

                      ) : (

                        <div className="flex items-center justify-start gap-1 group/cat">

                          <span className={`${item.category ? 'bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold -ml-2' : 'text-gray-300 text-xs italic'}`}>

                            {item.category || 'Uncategorized'}

                          </span>

                          <button

                            onClick={() => setEditingCell({ itemId: item.id, field: 'category', value: item.category || '' })}

                            className="p-0.5 text-gray-400 hover:text-gray-700 opacity-0 group-hover/cat:opacity-100 transition-opacity"

                            title="Edit category"

                          >

                            <Pencil size={11} />

                          </button>

                        </div>

                      )}

                    </td>

                    <td className="px-4 py-4 text-gray-500 text-sm">

                      {editingCell?.itemId === item.id && editingCell?.field === 'unit' ? (

                        <div className="flex items-center justify-start gap-1">

                          <select

                            value={editingCell.value}

                            onChange={(e) => setEditingCell(prev => ({ ...prev, value: e.target.value }))}

                            className="px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:border-blue-400"

                            autoFocus

                            disabled={editSaving}

                          >

                            <option value="Kg">Kg</option>
                            <option value="Gram">Gram</option>
                            <option value="Liter">Liter</option>
                            <option value="Ml">Ml</option>
                            <option value="Pcs">Pcs</option>
                            <option value="Pack">Pack</option>
                            <option value="Kgs">Kgs</option>
                            <option value="Nos">Nos</option>
                            <option value="Bottle">Bottle</option>
                            <option value="Packets">Packets</option>
                            <option value="Box">Box</option>
                            <option value="Dozen">Dozen</option>
                            <option value="Tin">Tin</option>
                            <option value="Rolls">Rolls</option>
                            <option value="Units">Units</option>
                            <option value="Cans">Cans</option>
                            <option value="Bags">Bags</option>
                            <option value="Half Kg">Half Kg</option>

                          </select>

                          <button onClick={() => handleInlineSave(item, 'unit')} disabled={editSaving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={12} /></button>

                          <button onClick={() => setEditingCell(null)} disabled={editSaving} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>

                        </div>

                      ) : (

                        <div className="flex items-center justify-start gap-1 group/unit">

                          <span>{toTitleCase(item.unit)}</span>

                          <button

                            onClick={() => setEditingCell({ itemId: item.id, field: 'unit', value: toTitleCase(item.unit) })}

                            className="p-0.5 text-gray-400 hover:text-gray-700 opacity-0 group-hover/unit:opacity-100 transition-opacity"

                            title="Edit scale"

                          >

                            <Pencil size={11} />

                          </button>

                        </div>

                      )}

                    </td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{renderEditCell(item, 'price', `₹ ${price.toFixed(2)}`)}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{renderEditCell(item, 'opening', fmtVal(opening, item.unit))}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{fmtAmt(openingAmt)}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{renderEditCell(item, 'purchase', fmtVal(purchase, item.unit))}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{fmtAmt(purchaseAmt)}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{fmtVal(totalStock, item.unit)}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{fmtAmt(totalStockAmt)}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{renderEditCell(item, 'consumed', fmtVal(consumed, item.unit))}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{fmtAmt(consumptionAmt)}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{fmtVal(balanceStock, item.unit)}</td>

                    <td className="px-4 py-4 text-center font-bold text-gray-900">{fmtAmt(balanceStockAmt)}</td>

                    <td className="px-4 py-4 text-center">

                      <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-red-600 hover:text-red-500">

                        <Trash2 size={16} />

                      </button>

                    </td>

                  </tr>

                );

              })}

            </tbody>

            <tfoot className="bg-[#F9FAFB] border-t-2 border-[#FFCDD2] font-black">

              {(() => {
                const totals = filteredItems.reduce((acc, item) => {
                  const price = Number(item.price || 0);
                  const hasEntry = !!item.todayEntry;
                  const opening = hasEntry ? Number(item.todayEntry.openingStock ?? 0) : 0;
                  const purchase = hasEntry ? Number(item.todayEntry.addedStock ?? 0) : 0;
                  const consumed = hasEntry ? Number(item.todayEntry.consumedStock ?? 0) : 0;
                  const closing = hasEntry ? Number(item.todayEntry.closingStock ?? 0) : 0;
                  const totalStock = opening + purchase;
                  acc.opening += opening;
                  acc.openingAmt += opening * price;
                  acc.purchase += purchase;
                  acc.purchaseAmt += purchase * price;
                  acc.totalStock += totalStock;
                  acc.totalStockAmt += totalStock * price;
                  acc.consumed += consumed;
                  acc.consumptionAmt += consumed * price;
                  acc.balanceStock += closing;
                  acc.balanceStockAmt += closing * price;
                  return acc;
                }, {
                  opening: 0, openingAmt: 0, purchase: 0, purchaseAmt: 0,
                  totalStock: 0, totalStockAmt: 0, consumed: 0, consumptionAmt: 0,
                  balanceStock: 0, balanceStockAmt: 0,
                });

                const fmtAmt = (val) => `₹ ${Number(val).toFixed(2)}`;

                return (
                  <tr>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-sm text-gray-900">Total</td>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-center text-[#B71C1C]">{fmtAmt(totals.openingAmt)}</td>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-center text-[#B71C1C]">{fmtAmt(totals.purchaseAmt)}</td>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-center text-[#B71C1C]">{fmtAmt(totals.totalStockAmt)}</td>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-center text-[#B71C1C]">{fmtAmt(totals.consumptionAmt)}</td>
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-4 py-4 text-center text-[#B71C1C]">{fmtAmt(totals.balanceStockAmt)}</td>
                    <td className="px-4 py-4 text-center"></td>
                  </tr>
                );
              })()}

            </tfoot>

          </table>

        </div>

      </div>

      {/* Mobile Card List */}
      <div className="block md:hidden space-y-3">
        {filteredItems.map((item) => {
          const isLow = item.currentStock <= item.reorderLevel && item.reorderLevel > 0;
          const price = Number(item.price || 0);
          const hasEntry = !!item.todayEntry;
          const isCarryOver = item.todayEntry?.isCarryOver === true;
          const opening  = hasEntry ? Number(item.todayEntry.openingStock  ?? 0) : null;
          const purchase = hasEntry ? Number(item.todayEntry.addedStock    ?? 0) : null;
          const consumed = hasEntry ? Number(item.todayEntry.consumedStock ?? 0) : null;
          const closingStock = hasEntry ? Number(item.todayEntry.closingStock ?? 0) : null;
          const totalStock = hasEntry ? opening + purchase : null;
          const fmtAmt = (val) => val == null ? '—' : `₹${Number(val).toFixed(2)}`;
          const fmtVal = (val) => val == null ? '—' : String(val);

          return (
            <div key={item.id} className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 ${isCarryOver ? 'bg-blue-50/40' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="relative">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="h-16 w-16 rounded-lg object-cover border border-gray-200 shrink-0" />
                  ) : (
                    <IngredientAvatar name={item.name} />
                  )}
                  <button
                    onClick={() => { setEditingImageItem(item); setImageEditPreview(null); }}
                    className="absolute -bottom-1 -right-1 p-1 bg-white rounded-full shadow border border-gray-200 text-gray-500 hover:text-[#E53935]"
                    title="Change image"
                  >
                    <Pencil size={10} />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-black text-gray-900 truncate">{item.name}</p>
                    <div className="flex items-center gap-1.5">
                      {item.category && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[9px] font-bold" title="Category">{item.category}</span>}
                      <span className="text-[10px] font-bold text-gray-400 uppercase" title="Scale">{item.unit}</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">₹{price.toFixed(2)} <span className="text-[10px] font-medium text-gray-400">/ unit</span></p>
                  {isCarryOver && <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">↩ carried over</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Opening</p>
                  <p className="text-sm font-black text-gray-900">{fmtVal(opening, item.unit)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Purchase</p>
                  <p className="text-sm font-black text-gray-900">{fmtVal(purchase, item.unit)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Consumed</p>
                  <p className="text-sm font-black text-gray-900">{fmtVal(consumed, item.unit)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Balance</p>
                  <p className="text-sm font-black text-gray-900">{fmtVal(closingStock, item.unit)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Total Value</p>
                  <p className="text-sm font-black text-[#B71C1C]">{totalStock != null ? fmtAmt(totalStock * price) : '—'}</p>
                </div>
                <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-red-600 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (

        <div className="text-center py-12 text-gray-400">

          <Package size={48} className="mx-auto mb-3 opacity-30" />

          <p>No ingredients yet. Click "Add Ingredient" to get started.</p>

          <p className="text-xs mt-2">Recipes must be set up for menu items to enable automatic deduction on settlement.</p>

        </div>

      )}



      {/* Add Ingredient Modal */}

      {showAddModal && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>

          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>

            <h3 className="text-lg font-black text-gray-900">Add Ingredient</h3>

            <input type="text" placeholder="Name (e.g., Rice, Oil, Tomatoes)" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Scale</label>
              <select value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}

                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm">

                <option value="Kg">Kg</option>
                <option value="Gram">Gram</option>
                <option value="Liter">Liter</option>
                <option value="Ml">Ml</option>
                <option value="Pcs">Pcs</option>
                <option value="Pack">Pack</option>
                <option value="Kgs">Kgs</option>
                <option value="Nos">Nos</option>
                <option value="Bottle">Bottle</option>
                <option value="Packets">Packets</option>
                <option value="Box">Box</option>
                <option value="Dozen">Dozen</option>
                <option value="Tin">Tin</option>
                <option value="Rolls">Rolls</option>
                <option value="Units">Units</option>
                <option value="Cans">Cans</option>
                <option value="Bags">Bags</option>
                <option value="Half Kg">Half Kg</option>

            </select>
            </div>

            <input type="number" step="0.01" placeholder="Current Stock" value={newItem.currentStock} onChange={(e) => setNewItem({ ...newItem, currentStock: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />

            <input type="number" step="0.01" min="0" placeholder="Price per unit (₹)" value={newItem.prize} onChange={(e) => setNewItem({ ...newItem, prize: e.target.value })}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Category</label>
              <input
                type="text"
                list="add-category-suggestions"
                placeholder="e.g. Vegetables, Spices, Dairy"
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <datalist id="add-category-suggestions">
                {allCategories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            {/* Image Upload */}
            <div className="flex items-center gap-3">
              {newItem.imagePreview ? (
                <img src={newItem.imagePreview} alt="Preview" className="h-12 w-12 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                  <Package size={20} />
                </div>
              )}
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      compressImage(e.target.files[0], (b64) => {
                        setNewItem(prev => ({ ...prev, image: b64, imagePreview: b64 }));
                      });
                    }
                  }}
                />
                <span className="block w-full px-4 py-2 border border-gray-200 border-dashed rounded-lg text-sm text-gray-500 hover:border-[#E53935] hover:text-[#E53935] transition-colors text-center">
                  {newItem.imagePreview ? 'Change Image' : 'Upload Image'}
                </span>
              </label>
            </div>

            {addError && <p className="text-red-600 text-xs font-bold">{addError}</p>}

            <div className="flex gap-3 pt-2">

              <button onClick={() => { setShowAddModal(false); setAddError(null); }} disabled={adding} className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-sm disabled:opacity-50">Cancel</button>

              <button onClick={handleAddItem} disabled={adding} className="flex-1 py-2.5 bg-[#B71C1C] text-white rounded-xl font-bold text-sm hover:bg-[#8E1414] disabled:opacity-50 disabled:cursor-not-allowed">{adding ? 'Saving…' : 'Add'}</button>

            </div>

          </div>

        </div>

      )}

      {/* Inline Image Edit Modal */}
      {editingImageItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setEditingImageItem(null); setImageEditPreview(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-gray-900">Edit Image</h3>
            <p className="text-sm text-gray-500">{editingImageItem.name}</p>
            <div className="flex justify-center">
              {imageEditPreview ? (
                <img src={imageEditPreview} alt="Preview" className="h-32 w-32 rounded-full object-cover border border-gray-200" />
              ) : editingImageItem.image ? (
                <img src={editingImageItem.image} alt={editingImageItem.name} className="h-32 w-32 rounded-full object-cover border border-gray-200" />
              ) : (
                <IngredientAvatar name={editingImageItem.name} />
              )}
            </div>
            <label className="block cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files[0]) {
                    compressImage(e.target.files[0], (b64) => setImageEditPreview(b64));
                  }
                }}
              />
              <span className="block w-full px-4 py-2 border border-gray-200 border-dashed rounded-lg text-sm text-gray-500 hover:border-[#E53935] hover:text-[#E53935] transition-colors text-center">
                {imageEditPreview ? 'Change Image' : 'Choose New Image'}
              </span>
            </label>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setEditingImageItem(null); setImageEditPreview(null); }} className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-sm">Cancel</button>
              <button onClick={handleImageEditSave} disabled={!imageEditPreview} className="flex-1 py-2.5 bg-[#B71C1C] text-white rounded-xl font-bold text-sm hover:bg-[#8E1414] disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Selling Modal */}

      {topSelling !== null && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTopSelling(null)}>

          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>

            <div className="flex items-center justify-between">

              <h3 className="text-lg font-black text-gray-900">Top 3 Selling Items — {fromDate}</h3>

              <button onClick={() => setTopSelling(null)} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>

            </div>

            {topSelling.length === 0 ? (

              <p className="text-sm text-gray-500 text-center py-4">No sales data for this date.</p>

            ) : (

              <div className="space-y-3">

                {topSelling.map((item, idx) => (

                  <div key={item.menuItemId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">

                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-700'}`}>

                      {idx + 1}

                    </div>

                    <div className="flex-1">

                      <p className="font-bold text-gray-900">{toTitleCase(item.name)}</p>

                      <p className="text-xs text-gray-500">{item.totalSold} sold</p>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        </div>

      )}

          </>)}



      {/* Add Stock Modal */}

      {addStockModal && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAddStockModal(null)}>

          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>

            <h3 className="text-lg font-black text-gray-900">Add Stock — {addStockModal.name}</h3>

            <p className="text-sm text-gray-500">Current: <span className="font-bold">{addStockModal.currentStock} {addStockModal.unit}</span></p>

            <input type="number" step="0.01" placeholder={`Amount (${addStockModal.unit})`} value={addStockAmount} onChange={(e) => setAddStockAmount(e.target.value)}

              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm" />

            <div className="flex gap-3 pt-2">

              <button onClick={() => setAddStockModal(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-sm">Cancel</button>

              <button onClick={handleAddStock} className="flex-1 py-2.5 bg-[#B71C1C] text-white rounded-xl font-bold text-sm hover:bg-[#8E1414]">Add</button>

            </div>

          </div>

        </div>

      )}


    </div>

  );

}



// ==========================================

// BAR INVENTORY MANAGEMENT

// ==========================================



// TransactionsTab Component

function TransactionsTab() {

  const [transactions, setTransactions] = useState([]);

  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({

    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),

    endDate: new Date().toISOString().slice(0, 10),

    type: 'all',

    itemId: 'all',

  });

  const [currentPage, setCurrentPage] = useState(1);

  const [itemsPerPage] = useState(50);



  useEffect(() => {

    const loadTransactions = async () => {

      try {

        setLoading(true);

        const params = {

          startDate: filters.startDate,

          endDate: filters.endDate,

          limit: 500,

        };

        if (filters.type !== 'all') params.type = filters.type;

        if (filters.itemId !== 'all') params.itemId = filters.itemId;



        const data = await fetchBarTransactions(params);

        setTransactions(data || []);

      } catch (err) {

        console.warn('[TransactionsTab] Failed to load:', err.message);

      } finally {

        setLoading(false);

      }

    };



    loadTransactions();

  }, [filters]);



  const indexOfLastItem = currentPage * itemsPerPage;

  const indexOfFirstItem = indexOfLastItem - itemsPerPage;

  const currentTransactions = transactions.slice(indexOfFirstItem, indexOfLastItem);

  const totalPages = Math.ceil(transactions.length / itemsPerPage);



  const getTypeBadge = (type) => {

    const badges = {

      PURCHASE: 'bg-green-100 text-green-800',

      SALE: 'bg-red-100 text-red-800',

      WASTAGE: 'bg-orange-100 text-orange-800',

      ADJUSTMENT: 'bg-blue-100 text-blue-800',

    };

    return badges[type] || 'bg-gray-100 text-gray-800';

  };



  const setDateRange = (preset) => {

    const today = new Date().toISOString().slice(0, 10);

    const presets = {

      today: { start: today, end: today },

      yesterday: {

        start: new Date(Date.now() - 86400000).toISOString().slice(0, 10),

        end: new Date(Date.now() - 86400000).toISOString().slice(0, 10),

      },

      last7: {

        start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),

        end: today,

      },

      last30: {

        start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),

        end: today,

      },

      thisMonth: {

        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),

        end: today,

      },

    };

    setFilters(prev => ({ ...prev, startDate: presets[preset].start, endDate: presets[preset].end }));

    setCurrentPage(1);

  };



  return (

    <div className="space-y-4">

      <div className="bg-white rounded-xl border border-gray-200 p-4">

        <h3 className="font-bold text-sm mb-3">Filters</h3>



        <div className="flex gap-2 mb-4 flex-wrap">

          {[

            { id: 'today', label: 'Today' },

            { id: 'yesterday', label: 'Yesterday' },

            { id: 'last7', label: 'Last 7 Days' },

            { id: 'last30', label: 'Last 30 Days' },

            { id: 'thisMonth', label: 'This Month' },

          ].map(preset => (

            <button

              key={preset.id}

              onClick={() => setDateRange(preset.id)}

              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-gray-100 text-gray-700 hover:bg-[#E53935] hover:text-white transition-all"

            >

              {preset.label}

            </button>

          ))}

        </div>



        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

          <div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>

            <input

              type="date"

              value={filters.startDate}

              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}

              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-[#E53935] outline-none"

            />

          </div>

          <div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>

            <input

              type="date"

              value={filters.endDate}

              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}

              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-[#E53935] outline-none"

            />

          </div>

          <div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">Transaction Type</label>

            <select

              value={filters.type}

              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}

              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-[#E53935] outline-none"

            >

              <option value="all">All Types</option>

              <option value="PURCHASE">Stock Added (Purchase)</option>

              <option value="ADJUSTMENT">Adjusted</option>

              <option value="WASTAGE">Wastage</option>

              <option value="SALE">Stock Sold</option>

            </select>

          </div>

        </div>

      </div>



      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        <div className="bg-white rounded-xl border border-gray-200 p-4">

          <p className="text-xs font-semibold text-gray-500 uppercase">Total Transactions</p>

          <p className="text-2xl font-black text-[#E53935] mt-1">{transactions.length}</p>

        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">

          <p className="text-xs font-semibold text-gray-500 uppercase">Purchases</p>

          <p className="text-2xl font-black text-green-600 mt-1">

            {transactions.filter(t => t.type === 'PURCHASE').length}

          </p>

        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">

          <p className="text-xs font-semibold text-gray-500 uppercase">Sales</p>

          <p className="text-2xl font-black text-red-600 mt-1">

            {transactions.filter(t => t.type === 'SALE').length}

          </p>

        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">

          <p className="text-xs font-semibold text-gray-500 uppercase">Adjustments</p>

          <p className="text-2xl font-black text-blue-600 mt-1">

            {transactions.filter(t => t.type === 'ADJUSTMENT' || t.type === 'WASTAGE').length}

          </p>

        </div>

      </div>



      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {loading ? (

          <div className="p-8 text-center text-gray-500">Loading transactions...</div>

        ) : transactions.length === 0 ? (

          <div className="p-8 text-center text-gray-500">No transactions found for selected filters.</div>

        ) : (

          <>

            <div className="overflow-x-auto">

              <table className="w-full">

                <thead className="bg-gray-50 border-b border-gray-200">

                  <tr>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date & Time</th>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Item Name</th>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Type</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Qty Change</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Stock Before</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Stock After</th>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Notes</th>

                  </tr>

                </thead>

                <tbody>

                  {currentTransactions.map((txn) => (

                    <tr key={txn.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">

                      <td className="px-4 py-3 text-sm text-gray-700">

                        {new Date(txn.transactionDate).toLocaleDateString()} <br />

                        <span className="text-xs text-gray-500">

                          {new Date(txn.transactionDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}

                        </span>

                      </td>

                      <td className="px-4 py-3 text-sm font-medium text-gray-900">

                        {txn.item?.menuItem?.name || 'Unknown Item'}

                      </td>

                      <td className="px-4 py-3">

                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${getTypeBadge(txn.type)}`}>

                          {txn.type}

                        </span>

                      </td>

                      <td className={`px-4 py-3 text-sm text-right font-semibold ${txn.quantityChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>

                        {txn.quantityChange >= 0 ? '+' : ''}{Number(txn.quantityChange).toFixed(0)} ml

                      </td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">

                        {Number(txn.stockBefore).toFixed(0)} ml

                      </td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">

                        {Number(txn.stockAfter).toFixed(0)} ml

                      </td>

                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">

                        {txn.notes || '-'}

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>



            {totalPages > 1 && (

              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">

                <div className="text-sm text-gray-600">

                  Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, transactions.length)} of {transactions.length} transactions

                </div>

                <div className="flex gap-2">

                  <button

                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}

                    disabled={currentPage === 1}

                    className="px-3 py-1.5 rounded-md border border-gray-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-all"

                  >

                    Previous

                  </button>

                  <span className="px-3 py-1.5 text-sm font-semibold text-gray-700">

                    Page {currentPage} of {totalPages}

                  </span>

                  <button

                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}

                    disabled={currentPage === totalPages}

                    className="px-3 py-1.5 rounded-md border border-gray-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-all"

                  >

                    Next

                  </button>

                </div>

              </div>

            )}

          </>

        )}

      </div>

    </div>

  );

}



// SalesReportsTab Component with Sub-tabs (Phase 4)

function SalesReportsTab({ inventory }) {

  const [reportType, setReportType] = useState('sales');



  return (

    <div className="space-y-4">

      {/* Report Type Sub-tabs */}

      <div className="flex gap-2 border-b border-gray-200 pb-0 overflow-x-auto">

        <button

          onClick={() => setReportType('sales')}

          className={`px-6 py-3 rounded-t-xl font-bold text-xs uppercase tracking-[0.1em] transition-all whitespace-nowrap ${

            reportType === 'sales'

              ? 'bg-[#E53935] text-white'

              : 'bg-white text-gray-700 hover:bg-[#FFF5F5] border border-gray-200'

          }`}

        >

          Sales Report

        </button>

        <button

          onClick={() => setReportType('lowstock')}

          className={`px-6 py-3 rounded-t-xl font-bold text-xs uppercase tracking-[0.1em] transition-all whitespace-nowrap ${

            reportType === 'lowstock'

              ? 'bg-[#E53935] text-white'

              : 'bg-white text-gray-700 hover:bg-[#FFF5F5] border border-gray-200'

          }`}

        >

          Low Stock

        </button>

        <button

          onClick={() => setReportType('comparison')}

          className={`px-6 py-3 rounded-t-xl font-bold text-xs uppercase tracking-[0.1em] transition-all whitespace-nowrap ${

            reportType === 'comparison'

              ? 'bg-[#E53935] text-white'

              : 'bg-white text-gray-700 hover:bg-[#FFF5F5] border border-gray-200'

          }`}

        >

          Comparison

        </button>

        <button

          onClick={() => setReportType('topperformers')}

          className={`px-6 py-3 rounded-t-xl font-bold text-xs uppercase tracking-[0.1em] transition-all whitespace-nowrap ${

            reportType === 'topperformers'

              ? 'bg-[#E53935] text-white'

              : 'bg-white text-gray-700 hover:bg-[#FFF5F5] border border-gray-200'

          }`}

        >

          Top Performers

        </button>

        <button

          onClick={() => setReportType('waste')}

          className={`px-6 py-3 rounded-t-xl font-bold text-xs uppercase tracking-[0.1em] transition-all whitespace-nowrap ${

            reportType === 'waste'

              ? 'bg-[#E53935] text-white'

              : 'bg-white text-gray-700 hover:bg-[#FFF5F5] border border-gray-200'

          }`}

        >

          Waste Report

        </button>

      </div>



      {/* Render appropriate report based on selection */}

      {reportType === 'sales' && <SalesReport inventory={inventory} />}

      {reportType === 'lowstock' && <LowStockReport inventory={inventory} />}

      {reportType === 'comparison' && <ComparisonReport inventory={inventory} />}

      {reportType === 'topperformers' && <TopPerformersReport inventory={inventory} />}

      {reportType === 'waste' && <WasteReport inventory={inventory} />}

    </div>

  );

}



// Sales Report Component (extracted from original SalesReportsTab)

function SalesReport({ inventory }) {

  const [salesData, setSalesData] = useState([]);

  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState(() => ({

    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),

    endDate: new Date().toISOString().slice(0, 10),

  }));



  useEffect(() => {

    // Helper: Calculate cost price from inventory (moved inside useEffect to avoid dependency issues)

    const calculateCostPrice = (itemName, mlPerUnit) => {

      if (!inventory || !Array.isArray(inventory)) return 0;



      // Find matching inventory item (fuzzy match on item name)

      const invItem = inventory.find(inv => {

        const invName = inv?.menuItem?.name?.toLowerCase() || '';

        const searchName = itemName?.toLowerCase() || '';

        return invName.includes(searchName) || searchName.includes(invName);

      });



      if (!invItem || !invItem.costPerBottle || !invItem.bottleSize) {

        return 0;

      }



      const costPerMl = invItem.bottleSize > 0 ? invItem.costPerBottle / invItem.bottleSize : 0;

      return costPerMl * mlPerUnit;

    };



    const loadSalesData = async () => {

      setLoading(true);

      try {

        // Fetch sales data from analytics API

        const response = await fetch(

          apiUrl(`/api/analytics/items-sold?restaurantId=${getCurrentRestaurantId()}&startDate=${filters.startDate}&endDate=${filters.endDate}`)

        );



        if (!response.ok) {

          throw new Error('Failed to fetch sales data');

        }



        const data = await response.json();



        // Extract items array from API response

        const itemsArray = data.items || [];



        // Process and group data

        const processed = itemsArray.map(item => {

          const itemName = item.name || '';

          const mlPerUnit = getLiquorMlPerUnit(itemName, null);



          // Find matching inventory item for cost data

          const invItem = inventory?.find(inv =>

            inv.menuItem?.name && itemName.startsWith(inv.menuItem.name)

          );

          const costPerBottle = Number(invItem?.costPerBottle || 0);

          const bottleSize = Number(invItem?.bottleSize || FULL_BOTTLE_ML);

          const costPerMl = bottleSize > 0 ? costPerBottle / bottleSize : 0;

          const costPrice = costPerMl * mlPerUnit;

          const revenue = Number(item.revenue || 0);

          const quantity = Number(item.quantity || 0);

          const totalCost = costPrice * quantity;



          return {

            itemName,

            quantity,

            revenue,

            totalCost,

            sellingPrice: quantity > 0 ? revenue / quantity : 0,

            mlPerUnit,

            type: item.type || 'food',

          };

        });



        setSalesData(processed);

      } catch (error) {

        console.warn('[SalesReportsTab] Failed to load:', error.message);

        setSalesData([]);

      } finally {

        setLoading(false);

      }

    };



    loadSalesData();

  }, [filters, inventory]);



  // Group data by category + pour size

  const groupedData = useMemo(() => {

    const groups = {};



    salesData.forEach(item => {

      // Group by item type and ml size

      // Spirits: "BRANDY 30ML" or "WHISKY FULL BOTTLE"

      // Bottle items (beer): "BEER"

      // Food: "FOOD"

      let groupKey;

      if (item.type === 'food') {

        groupKey = 'FOOD';

      } else if (item.itemName.endsWith('Full Bottle')) {

        groupKey = 'FULL BOTTLE (750ML)';

      } else if (item.itemName.endsWith('30ml')) {

        groupKey = 'SPIRITS 30ML';

      } else {

        groupKey = 'BEER / BOTTLE ITEMS';

      }



      if (!groups[groupKey]) {

        groups[groupKey] = {

          name: groupKey,

          items: [],

          totalQuantity: 0,

          totalRevenue: 0,

          totalProfit: 0,

          totalCost: 0,

          uom: item.itemName.endsWith('Full Bottle') ? '750ml bottle' :

               item.itemName.endsWith('30ml') ? '30ml' : 'bottle',

        };

      }



      groups[groupKey].items.push(item);

      groups[groupKey].totalQuantity += item.quantity;

      groups[groupKey].totalRevenue += item.revenue;

      groups[groupKey].totalCost += item.totalCost;

      groups[groupKey].totalProfit += (item.revenue - item.totalCost);

    });



    return Object.values(groups);

  }, [salesData]);



  // Calculate grand totals

  const grandTotals = useMemo(() => {

    return groupedData.reduce((acc, group) => ({

      quantity: acc.quantity + group.totalQuantity,

      revenue: acc.revenue + group.totalRevenue,

      profit: acc.profit + group.totalProfit,

      cost: acc.cost + group.totalCost,

    }), { quantity: 0, revenue: 0, profit: 0, cost: 0 });

  }, [groupedData]);



  const setDateRange = (preset) => {

    const today = new Date().toISOString().slice(0, 10);

    const presets = {

      last7: {

        start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),

        end: today,

      },

      last30: {

        start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),

        end: today,

      },

      thisMonth: {

        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),

        end: today,

      },

      lastMonth: {

        start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10),

        end: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10),

      },

    };

    setFilters({ startDate: presets[preset].start, endDate: presets[preset].end });

  };



  // Format dates for display

  const formatDateRange = () => {

    const start = new Date(filters.startDate);

    const end = new Date(filters.endDate);

    const startStr = start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const endStr = end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return `${startStr} - ${endStr}`;

  };



  const getCurrentTimestamp = () => {

    const now = new Date();

    return now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +

           ' at ' +

           now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  };



  // Export to PDF

  const exportToPDF = () => {

    try {

      // Check if jsPDF library is loaded

      if (!window.jspdf) {

        showNotification('PDF library not loaded. Please refresh the page and try again.', 'error');

        return;

      }



      const { jsPDF } = window.jspdf;

      const doc = new jsPDF();



      // Header

      doc.setFontSize(18);

      doc.setFont('helvetica', 'bold');

      doc.text('Bar - Softshape', 105, 15, { align: 'center' });



      doc.setFontSize(14);

      doc.text('Sales Report', 105, 25, { align: 'center' });



      doc.setFontSize(10);

      doc.setFont('helvetica', 'normal');

      const dateRange = `${new Date(filters.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - ${new Date(filters.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

      doc.text(dateRange, 105, 32, { align: 'center' });



      const generated = `Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

      doc.text(generated, 105, 38, { align: 'center' });



      // Summary section

      doc.setFontSize(11);

      doc.setFont('helvetica', 'bold');

      doc.text('Summary', 14, 48);



      doc.setFontSize(9);

      doc.setFont('helvetica', 'normal');

      doc.text(`Total Items Sold: ${grandTotals.quantity}`, 14, 54);

      doc.text(`Total Revenue: ₹${grandTotals.revenue.toLocaleString('en-IN')}`, 14, 59);

      doc.text(`Total Profit: ₹${grandTotals.profit.toLocaleString('en-IN')}`, 14, 64);

      const margin = grandTotals.revenue > 0 ? ((grandTotals.profit / grandTotals.revenue) * 100).toFixed(1) : '0.0';

      doc.text(`Profit Margin: ${margin}%`, 14, 69);



      // Prepare table data grouped by category

      let yPosition = 75;



      groupedData.forEach(group => {

        // Check if we need a new page

        if (yPosition > 250) {

          doc.addPage();

          yPosition = 20;

        }



        // Category header

        doc.setFontSize(11);

        doc.setFont('helvetica', 'bold');

        doc.setFillColor(255, 205, 210); // Light pink

        doc.rect(14, yPosition, 182, 7, 'F');

        doc.text(`Category: ${group.name}`, 16, yPosition + 5);

        yPosition += 10;



        // Table for this category

        const tableData = group.items.map(item => [

          item.itemName,

          item.quantity.toString(),

          group.uom,

          item.totalCost > 0 ? `₹${(item.totalCost / item.quantity).toFixed(2)}` : 'N/A',

          `₹${item.sellingPrice.toFixed(2)}`,

          '₹0',

          `₹${item.revenue.toLocaleString('en-IN')}`,

          `₹${(item.revenue - item.totalCost).toLocaleString('en-IN')}`

        ]);



        doc.autoTable({

          startY: yPosition,

          head: [['Item Name', 'Qty', 'UOM', 'Cost Price', 'Selling Price', 'Discount', 'Revenue', 'Profit']],

          body: tableData,

          foot: [[

            'Category Total',

            group.totalQuantity.toString(),

            '',

            '',

            '',

            '',

            `₹${group.totalRevenue.toLocaleString('en-IN')}`,

            `₹${group.totalProfit.toLocaleString('en-IN')}`

          ]],

          theme: 'grid',

          styles: { fontSize: 8, cellPadding: 2 },

          headStyles: { fillColor: [229, 57, 53], textColor: 255, fontStyle: 'bold' },

          footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },

          columnStyles: {

            0: { cellWidth: 40 },

            1: { cellWidth: 15, halign: 'right' },

            2: { cellWidth: 20 },

            3: { cellWidth: 25, halign: 'right' },

            4: { cellWidth: 25, halign: 'right' },

            5: { cellWidth: 20, halign: 'right' },

            6: { cellWidth: 25, halign: 'right' },

            7: { cellWidth: 25, halign: 'right' }

          },

          margin: { left: 14, right: 14 }

        });



        yPosition = doc.lastAutoTable.finalY + 5;

      });



      // Grand total

      if (yPosition > 265) {

        doc.addPage();

        yPosition = 20;

      }



      doc.setFontSize(12);

      doc.setFont('helvetica', 'bold');

      doc.setFillColor(229, 57, 53); // Red

      doc.setTextColor(255, 255, 255); // White text

      doc.rect(14, yPosition, 182, 8, 'F');

      doc.text(`GRAND TOTAL: ${grandTotals.quantity} items`, 16, yPosition + 5.5);

      doc.text(`Revenue: ₹${grandTotals.revenue.toLocaleString('en-IN')}`, 105, yPosition + 5.5);

      doc.text(`Profit: ₹${grandTotals.profit.toLocaleString('en-IN')}`, 155, yPosition + 5.5);



      // Save

      const filename = `Sales_Report_${new Date().toISOString().slice(0, 10)}.pdf`;

      doc.save(filename);

    } catch (error) {

      console.error('PDF export failed:', error);

      showNotification(`Failed to export PDF: ${error.message || 'Please try again.'}`, 'error');

    }

  };



  // Export to Excel

  const exportToExcel = () => {

    try {

      const XLSX = window.XLSX;



      // Create workbook

      const wb = XLSX.utils.book_new();



      // Prepare data with headers

      const data = [];



      // Add header info

      data.push(['Bar - Softshape']);

      data.push(['Sales Report']);

      data.push([`${new Date(filters.startDate).toLocaleDateString('en-GB')} - ${new Date(filters.endDate).toLocaleDateString('en-GB')}`]);

      data.push([`Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-US', { hour12: false })}`]);

      data.push([]);



      // Summary

      data.push(['Summary']);

      data.push(['Total Items Sold', grandTotals.quantity]);

      data.push(['Total Revenue', grandTotals.revenue]);

      data.push(['Total Profit', grandTotals.profit]);

      const margin = grandTotals.revenue > 0 ? ((grandTotals.profit / grandTotals.revenue) * 100).toFixed(1) : '0.0';

      data.push(['Profit Margin %', margin]);

      data.push([]);



      // Add detailed data by category

      groupedData.forEach(group => {

        data.push([`Category: ${group.name}`]);

        data.push(['Item Name', 'Qty', 'UOM', 'Cost Price', 'Selling Price', 'Discount', 'Revenue', 'Profit']);



        group.items.forEach(item => {

          data.push([

            item.itemName,

            item.quantity,

            group.uom,

            item.totalCost > 0 ? item.totalCost / item.quantity : 'N/A',

            item.sellingPrice,

            0,

            item.revenue,

            item.revenue - item.totalCost

          ]);

        });



        data.push([

          'Category Total',

          group.totalQuantity,

          '',

          '',

          '',

          '',

          group.totalRevenue,

          group.totalProfit

        ]);

        data.push([]);

      });



      // Grand total

      data.push(['GRAND TOTAL', grandTotals.quantity, '', '', '', '', grandTotals.revenue, grandTotals.profit]);



      // Create worksheet

      const ws = XLSX.utils.aoa_to_sheet(data);



      // Set column widths

      ws['!cols'] = [

        { wch: 25 }, // Item Name

        { wch: 8 },  // Qty

        { wch: 12 }, // UOM

        { wch: 12 }, // Cost Price

        { wch: 14 }, // Selling Price

        { wch: 10 }, // Discount

        { wch: 14 }, // Revenue

        { wch: 12 }  // Profit

      ];



      // Add worksheet to workbook

      XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');



      // Save file

      const filename = `Sales_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;

      XLSX.writeFile(wb, filename);

    } catch (error) {

      console.error('Excel export failed:', error);

      alert('Failed to export Excel. Please try again.');

    }

  };



  // Export to CSV

  const exportToCSV = () => {

    try {

      // Prepare CSV data

      let csv = 'Bar - Softshape\n';

      csv += 'Sales Report\n';

      csv += `${new Date(filters.startDate).toLocaleDateString('en-GB')} - ${new Date(filters.endDate).toLocaleDateString('en-GB')}\n`;

      csv += `Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-US', { hour12: false })}\n\n`;



      // Summary

      csv += 'Summary\n';

      csv += `Total Items Sold,${grandTotals.quantity}\n`;

      csv += `Total Revenue,${grandTotals.revenue}\n`;

      csv += `Total Profit,${grandTotals.profit}\n`;

      const margin = grandTotals.revenue > 0 ? ((grandTotals.profit / grandTotals.revenue) * 100).toFixed(1) : '0.0';

      csv += `Profit Margin %,${margin}\n\n`;



      // Detailed data

      groupedData.forEach(group => {

        csv += `\nCategory: ${group.name}\n`;

        csv += 'Item Name,Qty,UOM,Cost Price,Selling Price,Discount,Revenue,Profit\n';



        group.items.forEach(item => {

          csv += `${item.itemName},${item.quantity},${group.uom},${item.totalCost > 0 ? (item.totalCost / item.quantity).toFixed(2) : 'N/A'},${item.sellingPrice.toFixed(2)},0,${item.revenue},${item.revenue - item.totalCost}\n`;

        });



        csv += `Category Total,${group.totalQuantity},,,,,${group.totalRevenue},${group.totalProfit}\n`;

      });



      // Grand total

      csv += `\nGRAND TOTAL,${grandTotals.quantity},,,,,${grandTotals.revenue},${grandTotals.profit}\n`;



      // Create blob and download

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

      const filename = `Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`;



      // Use FileSaver

      const { saveAs } = window;

      if (saveAs) {

        saveAs(blob, filename);

      } else {

        // Fallback

        const link = document.createElement('a');

        link.href = URL.createObjectURL(blob);

        link.download = filename;

        link.click();

      }

    } catch (error) {

      console.error('CSV export failed:', error);

      alert('Failed to export CSV. Please try again.');

    }

  };



  // Print functionality

  const handlePrint = () => {

    try {

      // Create a printable version

      const printWindow = window.open('', '', 'height=800,width=1000');



      printWindow.document.write('<html><head><title>Sales Report</title>');

      printWindow.document.write('<style>');

      printWindow.document.write(`

        body { font-family: Arial, sans-serif; padding: 20px; }

        h1 { text-align: center; color: #E53935; margin-bottom: 5px; }

        h2 { text-align: center; font-size: 18px; margin: 5px 0; }

        .meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px; }

        .summary { background: #FFF5F5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }

        .summary div { margin: 5px 0; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }

        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }

        th { background-color: #E53935; color: white; font-weight: bold; }

        .category-header { background-color: #FFCDD2; font-weight: bold; padding: 10px; margin-top: 15px; }

        .category-total { background-color: #f0f0f0; font-weight: bold; }

        .grand-total { background-color: #E53935; color: white; font-weight: bold; font-size: 14px; padding: 10px; }

        .text-right { text-align: right; }

        @media print {

          body { padding: 10px; }

          .no-print { display: none; }

        }

      `);

      printWindow.document.write('</style></head><body>');



      // Header

      printWindow.document.write('<h1>Bar - Softshape</h1>');

      printWindow.document.write('<h2>Sales Report</h2>');

      printWindow.document.write(`<div class="meta">${new Date(filters.startDate).toLocaleDateString('en-GB')} - ${new Date(filters.endDate).toLocaleDateString('en-GB')}</div>`);

      printWindow.document.write(`<div class="meta">Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-US', { hour12: false })}</div>`);



      // Summary

      printWindow.document.write('<div class="summary">');

      printWindow.document.write('<h3>Summary</h3>');

      printWindow.document.write(`<div>Total Items Sold: ${grandTotals.quantity}</div>`);

      printWindow.document.write(`<div>Total Revenue: ₹${grandTotals.revenue.toLocaleString('en-IN')}</div>`);

      printWindow.document.write(`<div>Total Profit: ₹${grandTotals.profit.toLocaleString('en-IN')}</div>`);

      const margin = grandTotals.revenue > 0 ? ((grandTotals.profit / grandTotals.revenue) * 100).toFixed(1) : '0.0';

      printWindow.document.write(`<div>Profit Margin: ${margin}%</div>`);

      printWindow.document.write('</div>');



      // Tables by category

      groupedData.forEach(group => {

        printWindow.document.write(`<div class="category-header">Category: ${group.name}</div>`);

        printWindow.document.write('<table>');

        printWindow.document.write('<thead><tr>');

        printWindow.document.write('<th>Item Name</th><th>Qty</th><th>UOM</th><th>Cost Price</th><th>Selling Price</th><th>Discount</th><th>Revenue</th><th>Profit</th>');

        printWindow.document.write('</tr></thead><tbody>');



        group.items.forEach(item => {

          printWindow.document.write('<tr>');

          printWindow.document.write(`<td>${item.itemName}</td>`);

          printWindow.document.write(`<td class="text-right">${item.quantity}</td>`);

          printWindow.document.write(`<td>${group.uom}</td>`);

          printWindow.document.write(`<td class="text-right">${item.totalCost > 0 ? '₹' + (item.totalCost / item.quantity).toFixed(2) : 'N/A'}</td>`);

          printWindow.document.write(`<td class="text-right">₹${item.sellingPrice.toFixed(2)}</td>`);

          printWindow.document.write(`<td class="text-right">₹0</td>`);

          printWindow.document.write(`<td class="text-right">₹${item.revenue.toLocaleString('en-IN')}</td>`);

          printWindow.document.write(`<td class="text-right">₹${(item.revenue - item.totalCost).toLocaleString('en-IN')}</td>`);

          printWindow.document.write('</tr>');

        });



        printWindow.document.write('<tr class="category-total">');

        printWindow.document.write(`<td>Category Total</td>`);

        printWindow.document.write(`<td class="text-right">${group.totalQuantity}</td>`);

        printWindow.document.write(`<td colspan="4"></td>`);

        printWindow.document.write(`<td class="text-right">₹${group.totalRevenue.toLocaleString('en-IN')}</td>`);

        printWindow.document.write(`<td class="text-right">₹${group.totalProfit.toLocaleString('en-IN')}</td>`);

        printWindow.document.write('</tr>');

        printWindow.document.write('</tbody></table>');

      });



      // Grand total

      printWindow.document.write('<div class="grand-total">');

      printWindow.document.write(`GRAND TOTAL: ${grandTotals.quantity} items | Revenue: ₹${grandTotals.revenue.toLocaleString('en-IN')} | Profit: ₹${grandTotals.profit.toLocaleString('en-IN')}`);

      printWindow.document.write('</div>');



      printWindow.document.write('</body></html>');

      printWindow.document.close();



      // Wait for content to load then print

      setTimeout(() => {

        printWindow.print();

      }, 250);

    } catch (error) {

      console.error('Print failed:', error);

      alert('Failed to print. Please try again.');

    }

  };



  return (

    <div className="space-y-4">

      {/* Report Header */}

      <div className="bg-white rounded-xl border-2 border-[#E53935] p-6">

        <div className="text-center space-y-2">

          <h2 className="text-2xl font-black text-[#E53935] uppercase tracking-[0.15em]">Bar - Softshape</h2>

          <p className="text-base font-bold text-gray-700">Sales Report</p>

          <p className="text-sm font-semibold text-gray-600">{formatDateRange()}</p>

          <p className="text-xs text-gray-500">Generated on {getCurrentTimestamp()}</p>

        </div>

      </div>



      {/* Filters */}

      <div className="bg-white rounded-xl border border-gray-200 p-4">

        <h3 className="font-bold text-sm mb-3">Filters</h3>



        <div className="flex gap-2 mb-4 flex-wrap">

          {[

            { id: 'last7', label: 'Last 7 Days' },

            { id: 'last30', label: 'Last 30 Days' },

            { id: 'thisMonth', label: 'This Month' },

            { id: 'lastMonth', label: 'Last Month' },

          ].map(preset => (

            <button

              key={preset.id}

              onClick={() => setDateRange(preset.id)}

              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-gray-100 text-gray-700 hover:bg-[#E53935] hover:text-white transition-all"

            >

              {preset.label}

            </button>

          ))}

        </div>



        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          <div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>

            <input

              type="date"

              value={filters.startDate}

              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}

              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-[#E53935] outline-none"

            />

          </div>

          <div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>

            <input

              type="date"

              value={filters.endDate}

              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}

              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-[#E53935] outline-none"

            />

          </div>

        </div>

      </div>



      {/* Summary Cards */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        <div className="bg-gradient-to-br from-red-50 to-white rounded-xl border-2 border-red-200 p-4 shadow-sm">

          <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Total Items Sold</p>

          <p className="text-3xl font-black text-[#E53935] mt-2">{grandTotals.quantity}</p>

        </div>

        <div className="bg-gradient-to-br from-green-50 to-white rounded-xl border-2 border-green-200 p-4 shadow-sm">

          <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Total Revenue</p>

          <p className="text-3xl font-black text-green-700 mt-2">

            ₹{grandTotals.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}

          </p>

        </div>

        <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl border-2 border-blue-200 p-4 shadow-sm">

          <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Total Profit</p>

          <p className="text-3xl font-black text-blue-700 mt-2">

            ₹{grandTotals.profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}

          </p>

        </div>

        <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl border-2 border-purple-200 p-4 shadow-sm">

          <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Profit Margin</p>

          <p className="text-3xl font-black text-purple-700 mt-2">

            {grandTotals.revenue > 0 ? ((grandTotals.profit / grandTotals.revenue) * 100).toFixed(1) : '0.0'}%

          </p>

        </div>

      </div>



      {/* Export Buttons */}

      <div className="flex gap-3 flex-wrap">

        <button

          onClick={exportToPDF}

          className="px-6 py-3 bg-[#E53935] text-white rounded-xl font-bold text-xs uppercase tracking-[0.1em] hover:bg-[#B71C1C] transition-all flex items-center gap-2"

        >

          <Download className="w-4 h-4" />

          Export PDF

        </button>



        <button

          onClick={exportToExcel}

          className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold text-xs uppercase tracking-[0.1em] hover:bg-green-700 transition-all flex items-center gap-2"

        >

          <FileSpreadsheet className="w-4 h-4" />

          Export Excel

        </button>



        <button

          onClick={exportToCSV}

          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-[0.1em] hover:bg-blue-700 transition-all flex items-center gap-2"

        >

          <FileText className="w-4 h-4" />

          Export CSV

        </button>



        <button

          onClick={handlePrint}

          className="px-6 py-3 bg-gray-600 text-white rounded-xl font-bold text-xs uppercase tracking-[0.1em] hover:bg-gray-700 transition-all flex items-center gap-2"

        >

          <Printer className="w-4 h-4" />

          Print

        </button>

      </div>



      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {loading ? (

          <div className="p-8 text-center text-gray-500">Loading sales data...</div>

        ) : salesData.length === 0 ? (

          <div className="p-8 text-center text-gray-500">No sales data found for selected date range.</div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead className="bg-gray-50 border-b-2 border-gray-300">

                <tr>

                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Item Name</th>

                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Qty</th>

                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">UOM</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Cost<br/>Price</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Selling<br/>Price</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Discount</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Revenue</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Profit</th>

                </tr>

              </thead>

              <tbody>

                {groupedData.map((group, groupIdx) => (

                  <React.Fragment key={groupIdx}>

                    {/* Category Header */}

                    <tr className="bg-[#FFCDD2] border-t-2 border-[#E53935]">

                      <td colSpan="8" className="px-4 py-3">

                        <div className="flex items-center justify-between">

                          <span className="font-black text-sm text-gray-900 uppercase tracking-[0.1em]">

                            Category: {group.name}

                          </span>

                        </div>

                      </td>

                    </tr>



                    {/* Group Items */}

                    {group.items.map((item, itemIdx) => (

                      <tr key={itemIdx} className="border-b border-gray-200 hover:bg-[#FFF5F5] transition-colors">

                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.itemName}</td>

                        <td className="px-4 py-3 text-sm text-center text-gray-900 font-semibold">{item.quantity}</td>

                        <td className="px-4 py-3 text-sm text-center text-gray-600">{group.uom}</td>

                        <td className="px-4 py-3 text-sm text-right text-gray-700">

                          {item.totalCost > 0 ? `₹${(item.totalCost / item.quantity).toFixed(2)}` : 'N/A'}

                        </td>

                        <td className="px-4 py-3 text-sm text-right text-gray-700">

                          ₹{item.sellingPrice.toFixed(2)}

                        </td>

                        <td className="px-4 py-3 text-sm text-right text-gray-600">₹0</td>

                        <td className="px-4 py-3 text-sm text-right text-green-700 font-semibold">

                          ₹{item.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}

                        </td>

                        <td className="px-4 py-3 text-sm text-right text-blue-700 font-semibold">

                          ₹{(item.revenue - item.totalCost).toLocaleString('en-IN', { maximumFractionDigits: 0 })}

                        </td>

                      </tr>

                    ))}



                    {/* Category Total */}

                    <tr className="bg-gray-100 border-b-2 border-gray-400">

                      <td className="px-4 py-3 text-sm font-black text-gray-800" colSpan="1">

                        Category Total

                      </td>

                      <td className="px-4 py-3 text-sm text-center font-black text-gray-900">{group.totalQuantity}</td>

                      <td className="px-4 py-3 text-sm text-center text-gray-700" colSpan="4"></td>

                      <td className="px-4 py-3 text-sm text-right font-black text-green-800">

                        ₹{group.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}

                      </td>

                      <td className="px-4 py-3 text-sm text-right font-black text-blue-800">

                        ₹{group.totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}

                      </td>

                    </tr>

                  </React.Fragment>

                ))}



                {/* Grand Total */}

                <tr className="bg-[#E53935] text-white font-black">

                  <td className="px-4 py-4 text-sm uppercase tracking-[0.1em]" colSpan="1">

                    GRAND TOTAL

                  </td>

                  <td className="px-4 py-4 text-sm text-center">{grandTotals.quantity}</td>

                  <td className="px-4 py-4 text-sm text-center" colSpan="4"></td>

                  <td className="px-4 py-4 text-sm text-right">

                    ₹{grandTotals.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}

                  </td>

                  <td className="px-4 py-4 text-sm text-right">

                    ₹{grandTotals.profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}

                  </td>

                </tr>

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>

  );

}



// Low Stock Report Component (Phase 4)

function LowStockReport({ inventory }) {

  const lowStockItems = useMemo(() => {

    if (!inventory || !Array.isArray(inventory)) return [];



    return inventory

      .filter(item => {

        if (!item) return false;

        const current = parseFloat(item.currentStock) || 0;

        const reorder = parseFloat(item.reorderLevel) || 0;

        return current <= reorder && reorder > 0;

      })

      .sort((a, b) => {

        const aReorder = parseFloat(a.reorderLevel) || 1;

        const bReorder = parseFloat(b.reorderLevel) || 1;

        const aPercent = (parseFloat(a.currentStock) / aReorder) * 100;

        const bPercent = (parseFloat(b.currentStock) / bReorder) * 100;

        return aPercent - bPercent;

      });

  }, [inventory]);



  const totalRestockValue = useMemo(() => {

    return lowStockItems.reduce((sum, item) => {

      const current = parseFloat(item.currentStock) || 0;

      const reorder = parseFloat(item.reorderLevel) || 0;

      const restockQty = Math.max(0, reorder - current);

      const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';

      const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : 750;

      const bottlesNeeded = Math.ceil(restockQty / bottleSize);

      return sum + (bottlesNeeded * (parseFloat(item.costPerBottle) || 0));

    }, 0);

  }, [lowStockItems]);



  return (

    <div className="space-y-4">

      {/* Alert Banner */}

      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">

        <h3 className="font-bold text-red-800 text-lg">

          {lowStockItems.length === 0 ? '✅ All items adequately stocked' : `⚠️ ${lowStockItems.length} item${lowStockItems.length !== 1 ? 's' : ''} below reorder level`}

        </h3>

        {lowStockItems.length > 0 && (

          <p className="text-sm text-red-600 mt-1">

            Total restock investment required: ₹{totalRestockValue.toLocaleString('en-IN')}

          </p>

        )}

      </div>



      {lowStockItems.length > 0 ? (

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead className="bg-gray-50 border-b-2 border-gray-300">

                <tr>

                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Item Name</th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Category</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Current Stock</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Reorder Level</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Stock %</th>

                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Status</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Cost/Bottle</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Restock Value</th>

                </tr>

              </thead>

              <tbody>

                {lowStockItems.map((item, idx) => {

                  if (!item) return null;

                  const current = parseFloat(item.currentStock) || 0;

                  const reorder = parseFloat(item.reorderLevel) || 0;

                  const stockPercent = reorder > 0 ? (current / reorder) * 100 : 0;

                  const restockQty = Math.max(0, reorder - current);

                  const category = item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category) || '';

                  const isBeer = String(category || '').toLowerCase() === 'beer';

                  const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';

                  const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : (isBeer ? 650 : 750);

                  const bottlesNeeded = bottleSize > 0 ? Math.ceil(restockQty / bottleSize) : 0;

                  const restockValue = bottlesNeeded * (parseFloat(item.costPerBottle) || 0);

                  const currentBottles = bottleSize > 0 ? Math.floor(current / bottleSize) : 0;

                  const reorderBottles = bottleSize > 0 ? Math.ceil(reorder / bottleSize) : 0;

                  const currentBottlesDisplay = Math.floor(current / bottleSize);

                  const currentMlRemainder = current % bottleSize;

                  const reorderBottlesDisplay = Math.floor(reorder / bottleSize);

                  const reorderMlRemainder = reorder % bottleSize;



                  return (

                    <tr key={item.id || idx} className="border-b border-gray-100 hover:bg-[#FFF5F5] transition-colors">

                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">

                        {item.menuItem?.name || item.name || 'Unknown Item'}

                      </td>

                      <td className="px-4 py-3 text-sm text-gray-700">

                        {item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category) || 'N/A'}

                      </td>

                      <td className="px-4 py-3 text-sm text-right text-gray-900">

                        {currentBottlesDisplay} bottles + {currentMlRemainder.toFixed(0)} ml

                      </td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">

                        {reorderBottlesDisplay} bottles + {reorderMlRemainder.toFixed(0)} ml

                      </td>

                      <td className="px-4 py-3 text-sm text-right">

                        <span className={`font-bold ${stockPercent < 25 ? 'text-red-600' : 'text-orange-600'}`}>

                          {stockPercent.toFixed(0)}%

                        </span>

                      </td>

                      <td className="px-4 py-3 text-center">

                        {stockPercent === 0 ? (

                          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white">

                            OUT OF STOCK

                          </span>

                        ) : stockPercent < 25 ? (

                          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">

                            CRITICAL

                          </span>

                        ) : stockPercent < 50 ? (

                          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">

                            LOW

                          </span>

                        ) : (

                          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">

                            BELOW TARGET

                          </span>

                        )}

                      </td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">

                        ₹{(parseFloat(item.costPerBottle) || 0).toFixed(2)}

                      </td>

                      <td className="px-4 py-3 text-sm text-right font-bold text-green-700">

                        ₹{restockValue.toLocaleString('en-IN')}

                      </td>

                    </tr>

                  );

                })}

              </tbody>

              <tfoot>

                <tr className="bg-gray-100 font-black">

                  <td colSpan="7" className="px-4 py-4 text-sm uppercase tracking-wide text-gray-800">

                    Total Restock Investment Required

                  </td>

                  <td className="px-4 py-4 text-sm text-right text-green-800">

                    ₹{totalRestockValue.toLocaleString('en-IN')}

                  </td>

                </tr>

              </tfoot>

            </table>

          </div>

        </div>

      ) : (

        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">

          <div className="text-6xl mb-4">✅</div>

          <p className="text-xl font-bold text-gray-700">All items are adequately stocked</p>

          <p className="text-sm text-gray-500 mt-2">No items below reorder level</p>

        </div>

      )}

    </div>

  );

}



// Comparison Report Component (Phase 4)

function ComparisonReport({ inventory }) {

  const [comparisonType, setComparisonType] = useState('week');

  const [period1Data, setPeriod1Data] = useState([]);

  const [period2Data, setPeriod2Data] = useState([]);

  const [loading, setLoading] = useState(false);



  const getDateRanges = useCallback(() => {

    const today = new Date();



    if (comparisonType === 'week') {

      const thisWeekStart = new Date(today);

      thisWeekStart.setDate(today.getDate() - today.getDay());

      thisWeekStart.setHours(0, 0, 0, 0);

      const thisWeekEnd = new Date(today);



      const lastWeekStart = new Date(thisWeekStart);

      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      const lastWeekEnd = new Date(thisWeekStart);

      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);



      return {

        period1: { start: lastWeekStart, end: lastWeekEnd, label: 'Last Week' },

        period2: { start: thisWeekStart, end: thisWeekEnd, label: 'This Week' }

      };

    } else if (comparisonType === 'month') {

      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const thisMonthEnd = new Date(today);



      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);



      return {

        period1: { start: lastMonthStart, end: lastMonthEnd, label: 'Last Month' },

        period2: { start: thisMonthStart, end: thisMonthEnd, label: 'This Month' }

      };

    }

  }, [comparisonType]);



  useEffect(() => {

    const loadComparisonData = async () => {

      setLoading(true);

      try {

        const ranges = getDateRanges();



        const [data1Response, data2Response] = await Promise.all([

          fetch(apiUrl(`/api/analytics/items-sold?restaurantId=${getCurrentRestaurantId()}&startDate=${ranges.period1.start.toISOString().slice(0, 10)}&endDate=${ranges.period1.end.toISOString().slice(0, 10)}`)),

          fetch(apiUrl(`/api/analytics/items-sold?restaurantId=${getCurrentRestaurantId()}&startDate=${ranges.period2.start.toISOString().slice(0, 10)}&endDate=${ranges.period2.end.toISOString().slice(0, 10)}`))

        ]);



        const data1 = await data1Response.json();

        const data2 = await data2Response.json();



        setPeriod1Data(data1.items || []);

        setPeriod2Data(data2.items || []);

      } catch (error) {

        console.error('[ComparisonReport] Failed to load:', error);

        setPeriod1Data([]);

        setPeriod2Data([]);

      } finally {

        setLoading(false);

      }

    };



    loadComparisonData();

  }, [comparisonType, getDateRanges]);



  const period1Total = useMemo(() => {

    return period1Data.reduce((sum, item) => sum + (item.revenue || 0), 0);

  }, [period1Data]);



  const period2Total = useMemo(() => {

    return period2Data.reduce((sum, item) => sum + (item.revenue || 0), 0);

  }, [period2Data]);



  const changePercent = useMemo(() => {

    return period1Total > 0 ? ((period2Total - period1Total) / period1Total * 100) : 0;

  }, [period1Total, period2Total]);



  const mergedData = useMemo(() => {

    const itemMap = new Map();



    period1Data.forEach(item => {

      const name = item.itemName || item.name;

      itemMap.set(name, {

        name,

        period1Qty: item.quantity || 0,

        period1Revenue: item.revenue || 0,

        period2Qty: 0,

        period2Revenue: 0

      });

    });



    period2Data.forEach(item => {

      const name = item.itemName || item.name;

      if (itemMap.has(name)) {

        const existing = itemMap.get(name);

        existing.period2Qty = item.quantity || 0;

        existing.period2Revenue = item.revenue || 0;

      } else {

        itemMap.set(name, {

          name,

          period1Qty: 0,

          period1Revenue: 0,

          period2Qty: item.quantity || 0,

          period2Revenue: item.revenue || 0

        });

      }

    });



    return Array.from(itemMap.values()).sort((a, b) => b.period2Revenue - a.period2Revenue);

  }, [period1Data, period2Data]);



  const ranges = getDateRanges();



  return (

    <div className="space-y-4">

      {/* Comparison Type Selector */}

      <div className="flex gap-3">

        <button

          onClick={() => setComparisonType('week')}

          className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-[0.1em] transition-all ${

            comparisonType === 'week'

              ? 'bg-[#E53935] text-white'

              : 'bg-white text-gray-700 hover:bg-[#FFF5F5] border border-gray-200'

          }`}

        >

          Week vs Week

        </button>

        <button

          onClick={() => setComparisonType('month')}

          className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-[0.1em] transition-all ${

            comparisonType === 'month'

              ? 'bg-[#E53935] text-white'

              : 'bg-white text-gray-700 hover:bg-[#FFF5F5] border border-gray-200'

          }`}

        >

          Month vs Month

        </button>

      </div>



      {/* Summary Cards */}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl">

          <div className="text-xs text-blue-600 uppercase tracking-wide font-bold">

            {ranges.period1.label}

          </div>

          <div className="text-3xl font-black text-blue-800 mt-2">

            ₹{period1Total.toLocaleString('en-IN')}

          </div>

          <div className="text-sm text-blue-600 mt-1">

            {period1Data.reduce((sum, item) => sum + (item.quantity || 0), 0)} items sold

          </div>

        </div>



        <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-xl">

          <div className="text-xs text-green-600 uppercase tracking-wide font-bold">

            {ranges.period2.label}

          </div>

          <div className="text-3xl font-black text-green-800 mt-2">

            ₹{period2Total.toLocaleString('en-IN')}

          </div>

          <div className="text-sm text-green-600 mt-1">

            {period2Data.reduce((sum, item) => sum + (item.quantity || 0), 0)} items sold

          </div>

        </div>



        <div className={`p-6 border-l-4 rounded-r-xl ${changePercent >= 0 ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>

          <div className={`text-xs uppercase tracking-wide font-bold ${changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>

            Change

          </div>

          <div className={`text-3xl font-black mt-2 ${changePercent >= 0 ? 'text-green-800' : 'text-red-800'}`}>

            {changePercent >= 0 ? '↑' : '↓'} {Math.abs(changePercent).toFixed(1)}%

          </div>

          <div className={`text-sm mt-1 ${changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>

            {changePercent >= 0 ? `+₹${(period2Total - period1Total).toLocaleString('en-IN')}` : `-₹${Math.abs(period2Total - period1Total).toLocaleString('en-IN')}`}

          </div>

        </div>

      </div>



      {/* Comparison Table */}

      {loading ? (

        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">

          Loading comparison data...

        </div>

      ) : mergedData.length === 0 ? (

        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">

          No data available for comparison.

        </div>

      ) : (

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead className="bg-gray-50 border-b-2 border-gray-300">

                <tr>

                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Item</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">{ranges.period1.label} Qty</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">{ranges.period1.label} Revenue</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">{ranges.period2.label} Qty</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">{ranges.period2.label} Revenue</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Qty Change</th>

                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Revenue Change</th>

                </tr>

              </thead>

              <tbody>

                {mergedData.map((item, idx) => {

                  const qtyChange = item.period2Qty - item.period1Qty;

                  const qtyChangePercent = item.period1Qty > 0 ? (qtyChange / item.period1Qty * 100) : 0;

                  const revenueChange = item.period2Revenue - item.period1Revenue;

                  const revenueChangePercent = item.period1Revenue > 0 ? (revenueChange / item.period1Revenue * 100) : 0;



                  return (

                    <tr key={idx} className="border-b border-gray-100 hover:bg-[#FFF5F5] transition-colors">

                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.name}</td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">{item.period1Qty}</td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">₹{item.period1Revenue.toLocaleString('en-IN')}</td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">{item.period2Qty}</td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">₹{item.period2Revenue.toLocaleString('en-IN')}</td>

                      <td className="px-4 py-3 text-sm text-right">

                        <span className={`font-bold ${qtyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>

                          {qtyChange >= 0 ? '+' : ''}{qtyChange} ({qtyChangePercent >= 0 ? '+' : ''}{qtyChangePercent.toFixed(1)}%)

                        </span>

                      </td>

                      <td className="px-4 py-3 text-sm text-right">

                        <span className={`font-bold ${revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>

                          {revenueChange >= 0 ? '+' : ''}₹{Math.abs(revenueChange).toLocaleString('en-IN')} ({revenueChangePercent >= 0 ? '+' : ''}{revenueChangePercent.toFixed(1)}%)

                        </span>

                      </td>

                    </tr>

                  );

                })}

              </tbody>

            </table>

          </div>

        </div>

      )}

    </div>

  );

}



// Top Performers Report Component (Phase 4)

function TopPerformersReport({ inventory }) {

  const [salesData, setSalesData] = useState([]);

  const [loading, setLoading] = useState(true);

  const [sortBy, setSortBy] = useState('revenue');

  const [limit, setLimit] = useState(10);

  const [dateRange, setDateRange] = useState(() => ({

    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),

    endDate: new Date().toISOString().slice(0, 10),

  }));



  useEffect(() => {

    const loadTopPerformers = async () => {

      setLoading(true);

      try {

        const response = await fetch(

          apiUrl(`/api/analytics/items-sold?restaurantId=${getCurrentRestaurantId()}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`)

        );



        if (!response.ok) throw new Error('Failed to fetch sales data');



        const data = await response.json();

        const itemsArray = data.items || [];



        const processedData = itemsArray.map(item => {

          const itemName = item.itemName || item.name || '';

          const quantity = item.quantity || 0;

          const revenue = item.revenue || 0;



          const invItem = inventory?.find(inv => {

            const invName = inv?.menuItem?.name?.toLowerCase() || '';

            const searchName = itemName?.toLowerCase() || '';

            return invName.includes(searchName) || searchName.includes(invName);

          });



          const costPerBottle = parseFloat(invItem?.costPerBottle) || 0;

          const bottleSize = parseInt(invItem?.bottleSize) || 750;



          // Determine ml per unit using the helper function

          const mlPerUnit = getLiquorMlPerUnit(itemName, bottleSize);

          const costPrice = mlPerUnit > 0 && bottleSize > 0 ? (costPerBottle / bottleSize) * mlPerUnit : 0;



          const totalCost = quantity * costPrice;

          const profit = revenue - totalCost;

          const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;



          return {

            id: itemName,

            name: itemName,

            category: item.category || 'OTHER',

            quantity,

            revenue,

            cost: totalCost,

            profit,

            profitMargin

          };

        });



        setSalesData(processedData);

      } catch (error) {

        console.error('[TopPerformersReport] Failed to load:', error);

        setSalesData([]);

      } finally {

        setLoading(false);

      }

    };



    loadTopPerformers();

  }, [dateRange, inventory]);



  const sortedData = useMemo(() => {

    const sorted = [...salesData].sort((a, b) => {

      switch (sortBy) {

        case 'revenue':

          return b.revenue - a.revenue;

        case 'profit':

          return b.profit - a.profit;

        case 'margin':

          return b.profitMargin - a.profitMargin;

        case 'quantity':

          return b.quantity - a.quantity;

        default:

          return b.revenue - a.revenue;

      }

    });

    return sorted.slice(0, limit);

  }, [salesData, sortBy, limit]);



  const topThree = sortedData.slice(0, 3);



  return (

    <div className="space-y-4">

      {/* Controls */}

      <div className="flex flex-wrap gap-3">

        <select

          value={sortBy}

          onChange={(e) => setSortBy(e.target.value)}

          className="px-4 py-3 bg-white border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none text-sm font-semibold"

        >

          <option value="revenue">Sort by Revenue</option>

          <option value="profit">Sort by Profit</option>

          <option value="margin">Sort by Margin %</option>

          <option value="quantity">Sort by Quantity</option>

        </select>



        <select

          value={limit}

          onChange={(e) => setLimit(Number(e.target.value))}

          className="px-4 py-3 bg-white border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none text-sm font-semibold"

        >

          <option value="10">Top 10</option>

          <option value="20">Top 20</option>

          <option value="50">Top 50</option>

        </select>



        <input

          type="date"

          value={dateRange.startDate}

          onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}

          className="px-4 py-3 bg-white border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none text-sm"

        />



        <input

          type="date"

          value={dateRange.endDate}

          onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}

          className="px-4 py-3 bg-white border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none text-sm"

        />

      </div>



      {loading ? (

        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">

          Loading top performers...

        </div>

      ) : sortedData.length === 0 ? (

        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">

          No sales data found for selected date range.

        </div>

      ) : (

        <>

          {/* Podium Display (Top 3) */}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {topThree.map((item, index) => (

              <div

                key={item.id}

                className={`p-6 rounded-2xl text-center transition-all hover:scale-105 ${

                  index === 0 ? 'bg-yellow-100 border-4 border-yellow-500 shadow-xl' :

                  index === 1 ? 'bg-gray-100 border-4 border-gray-400 shadow-lg' :

                  'bg-orange-100 border-4 border-orange-400 shadow-lg'

                }`}

              >

                <div className="text-5xl mb-3">

                  {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}

                </div>

                <div className="font-black text-lg text-gray-900 mb-1 truncate" title={item.name}>

                  {item.name}

                </div>

                <div className="text-3xl font-black text-green-700 my-2">

                  ₹{item.revenue.toLocaleString('en-IN')}

                </div>

                <div className="text-sm text-gray-600 space-y-1">

                  <div>{item.quantity} sold</div>

                  <div className="font-bold text-blue-700">

                    {item.profitMargin.toFixed(1)}% margin

                  </div>

                </div>

              </div>

            ))}

          </div>



          {/* Full Table */}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

            <div className="overflow-x-auto">

              <table className="w-full">

                <thead className="bg-gray-50 border-b-2 border-gray-300">

                  <tr>

                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Rank</th>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Item Name</th>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Category</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Quantity Sold</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Revenue</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Cost</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Profit</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Margin %</th>

                  </tr>

                </thead>

                <tbody>

                  {sortedData.map((item, index) => (

                    <tr key={item.id} className="border-b border-gray-100 hover:bg-[#FFF5F5] transition-colors">

                      <td className="px-4 py-3 text-center">

                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${

                          index === 0 ? 'bg-yellow-200 text-yellow-800' :

                          index === 1 ? 'bg-gray-200 text-gray-800' :

                          index === 2 ? 'bg-orange-200 text-orange-800' :

                          'bg-gray-100 text-gray-600'

                        }`}>

                          {index + 1}

                        </span>

                      </td>

                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.name}</td>

                      <td className="px-4 py-3 text-sm text-gray-700">{item.category}</td>

                      <td className="px-4 py-3 text-sm text-right text-gray-900">{item.quantity}</td>

                      <td className="px-4 py-3 text-sm text-right text-green-700 font-bold">

                        ₹{item.revenue.toLocaleString('en-IN')}

                      </td>

                      <td className="px-4 py-3 text-sm text-right text-gray-700">

                        ₹{item.cost.toLocaleString('en-IN')}

                      </td>

                      <td className="px-4 py-3 text-sm text-right text-blue-700 font-bold">

                        ₹{item.profit.toLocaleString('en-IN')}

                      </td>

                      <td className="px-4 py-3 text-sm text-right">

                        <span className={`font-bold ${

                          item.profitMargin >= 50 ? 'text-green-600' :

                          item.profitMargin >= 30 ? 'text-blue-600' :

                          'text-orange-600'

                        }`}>

                          {item.profitMargin.toFixed(1)}%

                        </span>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </div>

        </>

      )}

    </div>

  );

}



// Waste Report Component (Phase 4)

function WasteReport({ inventory }) {

  const [wasteData, setWasteData] = useState([]);

  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] = useState(() => ({

    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),

    endDate: new Date().toISOString().slice(0, 10),

  }));

  const [groupBy, setGroupBy] = useState('item');



  useEffect(() => {

    const loadWasteData = async () => {

      setLoading(true);

      try {

        const params = {

          startDate: dateRange.startDate,

          endDate: dateRange.endDate,

          type: 'WASTAGE',

          limit: 500

        };



        const data = await fetchBarTransactions(params);



        const wasteTransactions = (data || []).filter(txn => {

          return txn.type === 'WASTAGE' || (txn.type === 'ADJUSTMENT' && parseFloat(txn.quantityChange) < 0);

        });



        setWasteData(wasteTransactions);

      } catch (error) {

        console.error('[WasteReport] Failed to load:', error);

        setWasteData([]);

      } finally {

        setLoading(false);

      }

    };



    loadWasteData();

  }, [dateRange]);



  const totalWasteCost = useMemo(() => {

    return wasteData.reduce((sum, txn) => {

      const qty = Math.abs(parseFloat(txn.quantityChange) || 0);



      const invItem = inventory?.find(inv => inv.id === txn.itemId);

      const costPerBottle = parseFloat(invItem?.costPerBottle) || 0;

      const bottleSize = parseInt(invItem?.bottleSize) || 750;

      const costPerMl = bottleSize > 0 ? costPerBottle / bottleSize : 0;



      return sum + (qty * costPerMl);

    }, 0);

  }, [wasteData, inventory]);



  const groupedData = useMemo(() => {

    if (groupBy === 'item') {

      const itemMap = new Map();



      wasteData.forEach(txn => {

        const itemName = txn.item?.menuItem?.name || 'Unknown Item';

        const qty = Math.abs(parseFloat(txn.quantityChange) || 0);



        const invItem = inventory?.find(inv => inv.id === txn.itemId);

        const costPerBottle = parseFloat(invItem?.costPerBottle) || 0;

        const bottleSize = parseInt(invItem?.bottleSize) || 750;

        const costPerMl = bottleSize > 0 ? costPerBottle / bottleSize : 0;

        const cost = qty * costPerMl;



        if (itemMap.has(itemName)) {

          const existing = itemMap.get(itemName);

          existing.quantity += qty;

          existing.cost += cost;

          existing.count += 1;

        } else {

          itemMap.set(itemName, {

            name: itemName,

            quantity: qty,

            cost,

            count: 1,

            category: txn.item?.menuItem?.category || 'N/A'

          });

        }

      });



      return Array.from(itemMap.values()).sort((a, b) => b.cost - a.cost);

    } else if (groupBy === 'category') {

      const categoryMap = new Map();



      wasteData.forEach(txn => {

        const category = txn.item?.menuItem?.category || 'N/A';

        const qty = Math.abs(parseFloat(txn.quantityChange) || 0);



        const invItem = inventory?.find(inv => inv.id === txn.itemId);

        const costPerBottle = parseFloat(invItem?.costPerBottle) || 0;

        const bottleSize = parseInt(invItem?.bottleSize) || 750;

        const costPerMl = bottleSize > 0 ? costPerBottle / bottleSize : 0;

        const cost = qty * costPerMl;



        if (categoryMap.has(category)) {

          const existing = categoryMap.get(category);

          existing.quantity += qty;

          existing.cost += cost;

          existing.count += 1;

        } else {

          categoryMap.set(category, {

            name: category,

            quantity: qty,

            cost,

            count: 1

          });

        }

      });



      return Array.from(categoryMap.values()).sort((a, b) => b.cost - a.cost);

    }



    return wasteData;

  }, [wasteData, groupBy, inventory]);



  const setPresetDateRange = useCallback((preset) => {

    const today = new Date().toISOString().slice(0, 10);

    const presets = {

      last7: {

        start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),

        end: today,

      },

      last30: {

        start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),

        end: today,

      },

      thisMonth: {

        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),

        end: today,

      },

    };

    setDateRange({ startDate: presets[preset].start, endDate: presets[preset].end });

  }, []);



  return (

    <div className="space-y-4">

      {/* Alert Banner */}

      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">

        <h3 className="font-bold text-red-800 text-lg">

          💸 Total Waste Cost: ₹{totalWasteCost.toLocaleString('en-IN')}

        </h3>

        <p className="text-sm text-red-600 mt-1">

          {wasteData.length} waste transaction{wasteData.length !== 1 ? 's' : ''} recorded

        </p>

      </div>



      {/* Filters */}

      <div className="bg-white rounded-xl border border-gray-200 p-4">

        <h3 className="font-bold text-sm mb-3">Filters</h3>



        <div className="flex gap-2 mb-4 flex-wrap">

          {[

            { id: 'last7', label: 'Last 7 Days' },

            { id: 'last30', label: 'Last 30 Days' },

            { id: 'thisMonth', label: 'This Month' },

          ].map(preset => (

            <button

              key={preset.id}

              onClick={() => setPresetDateRange(preset.id)}

              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-gray-100 text-gray-700 hover:bg-[#E53935] hover:text-white transition-all"

            >

              {preset.label}

            </button>

          ))}

        </div>



        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          <div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>

            <input

              type="date"

              value={dateRange.startDate}

              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}

              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-[#E53935] outline-none"

            />

          </div>

          <div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>

            <input

              type="date"

              value={dateRange.endDate}

              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}

              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-[#E53935] outline-none"

            />

          </div>

          <div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">Group By</label>

            <select

              value={groupBy}

              onChange={(e) => setGroupBy(e.target.value)}

              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-[#E53935] outline-none"

            >

              <option value="item">By Item</option>

              <option value="category">By Category</option>

              <option value="date">By Date (Individual)</option>

            </select>

          </div>

        </div>

      </div>



      {/* Table */}

      {loading ? (

        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">

          Loading waste data...

        </div>

      ) : wasteData.length === 0 ? (

        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">

          <div className="text-6xl mb-4">✅</div>

          <p className="text-xl font-bold text-gray-700">No waste recorded</p>

          <p className="text-sm text-gray-500 mt-2">No wastage transactions found for selected date range</p>

        </div>

      ) : (

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          <div className="overflow-x-auto">

            {groupBy === 'date' ? (

              <table className="w-full">

                <thead className="bg-gray-50 border-b-2 border-gray-300">

                  <tr>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Item Name</th>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Category</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Quantity Wasted</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Est. Cost</th>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Notes</th>

                  </tr>

                </thead>

                <tbody>

                  {wasteData.map((txn, idx) => {

                    const qty = Math.abs(parseFloat(txn.quantityChange) || 0);

                    const invItem = inventory?.find(inv => inv.id === txn.itemId);

                    const costPerBottle = parseFloat(invItem?.costPerBottle) || 0;

                    const bottleSize = parseInt(invItem?.bottleSize) || 750;

                    const costPerMl = bottleSize > 0 ? costPerBottle / bottleSize : 0;

                    const cost = qty * costPerMl;



                    return (

                      <tr key={txn.id || idx} className="border-b border-gray-100 hover:bg-[#FFF5F5] transition-colors">

                        <td className="px-4 py-3 text-sm text-gray-700">

                          {new Date(txn.transactionDate).toLocaleDateString('en-GB')}

                        </td>

                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">

                          {txn.item?.menuItem?.name || 'Unknown Item'}

                        </td>

                        <td className="px-4 py-3 text-sm text-gray-700">

                          {txn.item?.menuItem?.category || 'N/A'}

                        </td>

                        <td className="px-4 py-3 text-sm text-right text-red-600 font-bold">

                          {qty.toFixed(0)} ml

                        </td>

                        <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">

                          ₹{cost.toLocaleString('en-IN')}

                        </td>

                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">

                          {txn.notes || '-'}

                        </td>

                      </tr>

                    );

                  })}

                </tbody>

                <tfoot>

                  <tr className="bg-red-50 font-black">

                    <td colSpan="4" className="px-4 py-4 text-sm uppercase tracking-wide text-gray-800">

                      Total Waste Cost

                    </td>

                    <td className="px-4 py-4 text-sm text-right text-red-700">

                      ₹{totalWasteCost.toLocaleString('en-IN')}

                    </td>

                    <td></td>

                  </tr>

                </tfoot>

              </table>

            ) : (

              <table className="w-full">

                <thead className="bg-gray-50 border-b-2 border-gray-300">

                  <tr>

                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">

                      {groupBy === 'item' ? 'Item Name' : 'Category'}

                    </th>

                    {groupBy === 'item' && (

                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Category</th>

                    )}

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Total Quantity Wasted</th>

                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Total Cost</th>

                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase"># Incidents</th>

                  </tr>

                </thead>

                <tbody>

                  {groupedData.map((item, idx) => (

                    <tr key={idx} className="border-b border-gray-100 hover:bg-[#FFF5F5] transition-colors">

                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.name}</td>

                      {groupBy === 'item' && (

                        <td className="px-4 py-3 text-sm text-gray-700">{item.category}</td>

                      )}

                      <td className="px-4 py-3 text-sm text-right text-red-600 font-bold">

                        {item.quantity.toFixed(0)} ml

                      </td>

                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">

                        ₹{item.cost.toLocaleString('en-IN')}

                      </td>

                      <td className="px-4 py-3 text-sm text-center text-gray-700">{item.count}</td>

                    </tr>

                  ))}

                </tbody>

                <tfoot>

                  <tr className="bg-red-50 font-black">

                    <td colSpan={groupBy === 'item' ? '3' : '2'} className="px-4 py-4 text-sm uppercase tracking-wide text-gray-800">

                      Total Waste Cost

                    </td>

                    <td className="px-4 py-4 text-sm text-right text-red-700">

                      ₹{totalWasteCost.toLocaleString('en-IN')}

                    </td>

                    <td className="px-4 py-4 text-sm text-center text-gray-700">

                      {wasteData.length}

                    </td>

                  </tr>

                </tfoot>

              </table>

            )}

          </div>

        </div>

      )}

    </div>

  );

}



export function Inventory() {

  const { restaurant } = useAuth();

  const enabledModules = restaurant?.enabledModules || {};

  const activeOutlet = enabledModules.bar && enabledModules.food ? 'both'

    : enabledModules.bar && !enabledModules.food ? 'bar'

    : 'restaurant';

  const [inventory, setInventory] = useState([]);

  const [menuItems, setMenuItems] = useState([]);

  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);

  const [showAdjustModal, setShowAdjustModal] = useState(false);

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const [selectedItem, setSelectedItem] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  const [filterStatus, setFilterStatus] = useState('all');

  const [activeTab, setActiveTab] = useState('inventory');

  const socket = useSocket(getCurrentRestaurantId());

  const [popup, setPopup] = useState(null);
  const [outletFilter, setOutletFilter] = useState('self');
  const [accessibleOutlets, setAccessibleOutlets] = useState([]);
  const [fromDate, setFromDate] = useState(getISTDateString);
  const [toDate, setToDate] = useState(getISTDateString);
  const isRangeMode = fromDate !== toDate;



  // Loading states for action buttons

  const [isCreating, setIsCreating] = useState(false);

  const [isAdjusting, setIsAdjusting] = useState(false);

  const [isRecordingPurchase, setIsRecordingPurchase] = useState(false);

  const [deletingItemId, setDeletingItemId] = useState(null);



  // Edit modal states

  const [showEditModal, setShowEditModal] = useState(false);

  const [editingItem, setEditingItem] = useState(null);

  const [isUpdating, setIsUpdating] = useState(false);

  const [topSellingLoading, setTopSellingLoading] = useState(false);
  const [topSelling, setTopSelling] = useState(null);
  const [showDeductionPanel, setShowDeductionPanel] = useState(false);
  const [deductionCheckOrderId, setDeductionCheckOrderId] = useState('');
  const [deductionCheckLoading, setDeductionCheckLoading] = useState(false);
  const [deductionCheckResult, setDeductionCheckResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  
  const [editingBarCell, setEditingBarCell] = useState(null);
  const [editBarSaving, setEditBarSaving] = useState(false);

  const handleBarInlineSave = async (item, field) => {
    if (!editingBarCell || !editingBarCell.value) {
      setEditingBarCell(null);
      return;
    }
    
    // Quick escape if value hasn't changed
    const originalVal = field === 'name' ? (item.name || item.menuItem?.name) :
                        field === 'category' ? (item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category)) :
                        field === 'bottleSize' ? item.bottleSize :
                        field === 'price' ? (item.menuItem?.basePrice || item.menuItem?.price) :
                        field === 'opening' ? ((item.todayEntry?.openingStock ?? 0) / (item.bottleSize || 750)).toFixed(2) :
                        field === 'purchase' ? ((item.todayEntry?.addedStock ?? 0) / (item.bottleSize || 750)).toFixed(2) :
                        field === 'consumed' ? item.todayEntry?.consumedStock : '';
                        
    if (String(originalVal) === String(editingBarCell.value)) {
      setEditingBarCell(null);
      return;
    }

    setEditBarSaving(true);
    try {
      const payload = {};
      if (field === 'name') payload.name = editingBarCell.value;
      if (field === 'category') payload.category = editingBarCell.value;
      if (field === 'bottleSize') payload.bottleSize = Number(editingBarCell.value);
      if (field === 'price') payload.price = Number(editingBarCell.value);
      if (field === 'opening') payload.openingStockBottles = Number(editingBarCell.value);
      if (field === 'purchase') payload.purchaseBottles = Number(editingBarCell.value);
      if (field === 'consumed') payload.consumed = Number(editingBarCell.value);

      const res = await fetch(apiUrl(`/api/bar/inventory/items/${item.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error(await res.text());
      const updatedItem = await res.json();
      
      setInventory(prev => prev.map(inv => {
        if (inv.id === item.id) {
          // Attempt to merge updated properties back into the array locally to avoid full reload
          const merged = { ...inv, ...updatedItem };
          // Refetching inventory is safer for daily ledger consistency
          return merged;
        }
        return inv;
      }));
      loadInventory(); // reload to get fresh todayEntry
    } catch (err) {
      console.error('Failed to update inline:', err);
      showNotification(`Failed to update value: ${err.message}`, 'error');
    } finally {
      setEditBarSaving(false);
      setEditingBarCell(null);
    }
  };
  const csvImportRef = useRef(null);

  const showNotification = (message, type = 'info') => {

    setPopup({ message, type });

  };



  useEffect(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      if (raw) setAccessibleOutlets(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);



  const closePopup = () => {

    setPopup(null);

  };



  const loadBarMenu = useCallback(async () => {

    try {

      const res = await fetch(apiUrl(`/api/bar/menu/items?restaurantId=${getCurrentRestaurantId()}`), {

        headers: authService.getAuthHeader()

      });

      const data = await res.json();

      const liquorItems = Array.isArray(data)

        ? data.filter(item => item && item.id && item.menuType === 'LIQUOR')

        : [];

      setMenuItems(liquorItems);

    } catch (err) {

      console.error('[Inventory] Menu load failed:', err);

      setMenuItems([]);

    }

  }, []);



  const loadInventory = useCallback(async () => {
    if (isRangeMode) return;
    try {
      if (outletFilter === 'combined') {
        const res = await fetch(apiUrl(`/api/bar/inventory/combined?restaurantId=${getCurrentRestaurantId()}`), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...getAuthHeaders() },
        });
        if (!res.ok) throw new Error('Failed to fetch combined inventory');
        const data = await res.json();
        setInventory(Array.isArray(data) ? data : []);
      } else {
        const data = await fetchBarInventory(fromDate);
        setInventory(Array.isArray(data) ? data.filter(item => item && item.id) : []);
      }
    } catch (err) {
      console.error('[Inventory] Load failed:', err);
      showNotification('Failed to load inventory', 'error');
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, [outletFilter, fromDate, isRangeMode]);



  useEffect(() => {

    if (activeOutlet === 'bar' || activeOutlet === 'both') {

      loadInventory();

      loadBarMenu();

    } else {

      Promise.resolve().then(() => setLoading(false));

    }

  }, [activeOutlet, loadInventory, loadBarMenu]);



  const handleImportCSV = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawText = e.target.result;
        const text = rawText.replace(/^\uFEFF/, '');
        const lines = text.trim().split('\n');
        const header = lines[0].trim().replace(/\r/g, '');

        if (header !== 'S.NO,ITEM,CATEGORY,PRICE,STOCK(ml),BOTTLE_SIZE(ml),REORDER(bottles),COST_PER_BOTTLE') {
          alert(`Invalid CSV format.\nExpected header: S.NO,ITEM,CATEGORY,PRICE,STOCK(ml),BOTTLE_SIZE(ml),REORDER(bottles),COST_PER_BOTTLE\nGot: ${header}`);
          return;
        }

        const rows = [];
        let skipped = 0;
        
        // Simple CSV parser inline
        const parseLine = (str) => {
          const arr = [];
          let quote = false;
          for (let row = 0, col = 0, c = 0; c < str.length; c++) {
            let cc = str[c], nc = str[c+1];
            arr[col] = arr[col] || '';
            if (cc === '"' && quote && nc === '"') { arr[col] += cc; ++c; continue; }
            if (cc === '"') { quote = !quote; continue; }
            if (cc === ',' && !quote) { ++col; continue; }
            arr[col] += cc;
          }
          return arr;
        };

        const toTitle = (s) => s ? s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '';

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim().replace(/\r/g, '');
          if (!line) continue;
          const cols = parseLine(line);
          if (cols.length < 8) { skipped++; continue; }
          const [, rawItem, rawCategory, price, stock, bottleSize, rawReorder, costPerBottle] = cols.map(c => c.trim());
          const name = toTitle(rawItem);
          if (!name) { skipped++; continue; }

          rows.push({
            name,
            category: rawCategory === 'N/A' || rawCategory === '' ? '' : rawCategory,
            price: parseFloat(price) || 0,
            currentStock: parseFloat(stock) || 0,
            bottleSize: parseInt(bottleSize) || 750,
            reorderLevel: parseFloat(rawReorder) || 0,
            costPerBottle: parseFloat(costPerBottle) || 0,
            rowNum: i + 1
          });
        }

        if (rows.length === 0) { alert('No valid rows found in the file.'); return; }

        setImporting(true);
        setImportProgress(`0 / ${rows.length}`);

        let done = 0, succeeded = 0;
        for (const row of rows) {
          try {
            let existingInv = inventory.find(i => (i.menuItem?.name || i.name || '').toLowerCase() === row.name.toLowerCase() && !i.isVirtual);
            
            if (existingInv) {
              await updateInventoryItem(existingInv.id, {
                bottleSize: row.bottleSize,
                reorderLevel: row.reorderLevel,
                costPerBottle: row.costPerBottle
              });
              succeeded++;
            } else {
              let virtualInv = inventory.find(i => (i.menuItem?.name || '').toLowerCase() === row.name.toLowerCase() && i.isVirtual);
              if (virtualInv) {
                await createInventoryItem({
                  menuItemId: virtualInv.menuItemId,
                  unitOfMeasure: 'ml',
                  bottleSize: row.bottleSize,
                  currentStock: row.currentStock,
                  reorderLevel: row.reorderLevel,
                  costPerBottle: row.costPerBottle
                });
                succeeded++;
              } else {
                console.warn(`Row ${row.rowNum}: No menu item found for "${row.name}". Please add to menu first.`);
              }
            }
          } catch (err) {
            console.error(`Row ${row.rowNum} error:`, err);
          }
          done++;
          setImportProgress(`${done} / ${rows.length}`);
        }

        setImporting(false);
        showNotification(`Imported ${succeeded} items successfully.`, 'success');
        loadInventory();
      } catch (err) {
        console.error('CSV import error:', err);
        alert('Failed to process CSV file.');
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {

    const handleInventoryUpdate = (data) => {

      // Validate data structure

      if (!data || !data.item || !data.item.id) {

        console.warn('[Inventory] Invalid inventory update data:', data);

        return;

      }



      const { item } = data;

      setInventory(prev => {

        const index = prev.findIndex(i => i && i.id === item.id);

        if (index >= 0) {

          const updated = [...prev];

          updated[index] = item;

          return updated;

        }

        return prev;

      });

    };



    const handleLowStock = (data) => {

      // Validate data structure

      if (!data || !data.item) {

        console.warn('[Inventory] Invalid low stock alert data:', data);

        return;

      }



      const { item } = data;

      showNotification(`Low Stock Alert: ${item.name || item.menuItem?.name || 'Unknown Item'}`, 'warning');

    };



    if (socket) {

      socket.on('inventory:updated', handleInventoryUpdate);

      socket.on('inventory:low_stock', handleLowStock);

    }



    return () => {

      if (socket) {

        socket.off('inventory:updated', handleInventoryUpdate);

        socket.off('inventory:low_stock', handleLowStock);

      }

    };

  }, [socket]);



  const handleCreateItem = async (formData) => {

    if (isCreating) return;



    setIsCreating(true);

    try {

      const newItem = await createInventoryItem(formData);

      if (newItem && newItem.id) {

        setInventory(prev => [...prev, newItem]);

        setShowAddModal(false);

        showNotification('Inventory item created successfully', 'success');

      } else {

        throw new Error('Invalid response from server');

      }

    } catch (err) {

      console.error('[Inventory] Create failed:', err);

      showNotification(err.message || 'Failed to create inventory item', 'error');

    } finally {

      setIsCreating(false);

    }

  };



  const handleAdjustStock = async (item, adjustment) => {

    if (isAdjusting) return;



    setIsAdjusting(true);

    try {

      // If it's a virtual item, create it first

      if (item.isVirtual) {

        await createInventoryItem({

          menuItemId: item.menuItemId,

          bottleSize: item.bottleSize,

          currentStock: adjustment.quantityChange > 0 ? adjustment.quantityChange : 0,

          reorderLevel: item.reorderLevel,

          maxStock: item.maxStock || (item.reorderLevel * 3) || 10000,

          costPerBottle: item.costPerBottle,

          unitOfMeasure: item.unitOfMeasure,

        });

      } else {

        await adjustStock({

          itemId: item.id,

          quantityChange: adjustment.quantityChange,

          type: adjustment.type,

          notes: adjustment.notes,

        });

      }

      setShowAdjustModal(false);

      setSelectedItem(null);

      showNotification('Stock adjusted successfully', 'success');

      loadInventory();

    } catch (err) {

      console.error('[Inventory] Adjust failed:', err);

      showNotification(err.message || 'Failed to adjust stock', 'error');

    } finally {

      setIsAdjusting(false);

    }

  };



  const handleRecordPurchase = async (purchaseData) => {

    if (isRecordingPurchase) return;



    setIsRecordingPurchase(true);

    try {

      await recordPurchase(purchaseData);

      setShowPurchaseModal(false);

      showNotification('Purchase recorded successfully', 'success');

      loadInventory();

    } catch (err) {

      console.error('[Inventory] Purchase record failed:', err);

      showNotification(err.message || 'Failed to record purchase', 'error');

    } finally {

      setIsRecordingPurchase(false);

    }

  };



  const handleDeleteItem = async (itemId) => {
    if (!confirm('Delete this ingredient?')) return;
    if (deletingItemId) return;

    setDeletingItemId(itemId);
    try {
      const item = displayItems.find(i => i.id === itemId);
      if (!item) return;

      if (!item.isVirtual) {
        await fetch(apiUrl(`/api/bar/inventory/items/${itemId}`), {
          method: 'DELETE',
          headers: { ...getAuthHeaders() },
        });
      }

      /* Temporarily disabled: do not delete from POS menu
      if (item.menuItemId) {
        await fetch(apiUrl(`/api/bar/menu/items/${item.menuItemId}`), {
          method: 'DELETE',
          headers: { ...getAuthHeaders() },
        });
      }
      */

      loadBarMenu();
      loadInventory();
    } catch (err) {

      console.error('[Inventory] Delete failed:', err);

      showNotification(err.message || 'Failed to delete inventory item', 'error');

    } finally {

      setDeletingItemId(null);

    }

  };



  const handleUpdateItem = async (itemId, updateData) => {

    if (isUpdating) return;



    setIsUpdating(true);

    try {

      await updateInventoryItem(itemId, {

        costPerBottle: parseFloat(updateData.costPerBottle),

        bottleSize: parseInt(updateData.bottleSize),

        reorderLevel: parseFloat(updateData.reorderLevel),

        maxStock: parseFloat(updateData.maxStock),

      });



      setShowEditModal(false);

      setEditingItem(null);

      showNotification('Inventory item updated successfully. Menu prices recalculated.', 'success');

      loadInventory();

    } catch (err) {

      console.error('[Inventory] Update failed:', err);

      showNotification(err.message || 'Failed to update item', 'error');

    } finally {

      setIsUpdating(false);

    }

  };



  const getStockStatus = (item) => {

    const currentStock = parseFloat(item.currentStock) || 0;

    const category = item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category) || '';

    const isBeer = String(category || '').toLowerCase() === 'beer';

    const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';

    const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : (isBeer ? 650 : 750);

    const reorderLevel = parseFloat(item.reorderLevel) || 0;



    if (currentStock <= 0) return { status: 'out', label: 'Out of Stock', color: 'text-red-600' };

    if (currentStock <= reorderLevel) return { status: 'low', label: 'Low Stock', color: 'text-amber-600' };

    return { status: 'ok', label: 'In Stock', color: 'text-green-600' };

  };



  // Use only actual inventory items, decoupling the display from the POS menu's virtual items
  const displayItems = [...inventory]
    .filter(inv => inv && inv.id) // Filter out invalid items
    .sort((a, b) => {
      const catA = (a.category || (typeof a.menuItem?.category === 'object' ? a.menuItem?.category?.name : a.menuItem?.category) || '').toLowerCase();
      const catB = (b.category || (typeof b.menuItem?.category === 'object' ? b.menuItem?.category?.name : b.menuItem?.category) || '').toLowerCase();
      const catCmp = catA.localeCompare(catB);
      if (catCmp !== 0) return catCmp;
      const nameA = (a.name || a.menuItem?.name || '').toLowerCase();
      const nameB = (b.name || b.menuItem?.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const filteredInventory = displayItems.filter(item => {

    if (!item) return false;

    const itemName = item.name || item.menuItem?.name || '';

    const matchesSearch = itemName.toLowerCase().includes(searchTerm.toLowerCase());

    const stockStatus = getStockStatus(item).status;

    const matchesFilter = filterStatus === 'all' || stockStatus === filterStatus;

    return matchesSearch && matchesFilter;

  }).sort((a, b) => {
    const catA = (a.category || (typeof a.menuItem?.category === 'object' ? a.menuItem?.category?.name : a.menuItem?.category) || '').toLowerCase();
    const catB = (b.category || (typeof b.menuItem?.category === 'object' ? b.menuItem?.category?.name : b.menuItem?.category) || '').toLowerCase();
    const catCmp = catA.localeCompare(catB);
    if (catCmp !== 0) return catCmp;
    const nameA = (a.name || a.menuItem?.name || '').toLowerCase();
    const nameB = (b.name || b.menuItem?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });



  const lowStockItems = useMemo(() => {
    return displayItems.filter(i => {
      const stockStatus = getStockStatus(i);
      return stockStatus.status === 'low' || stockStatus.status === 'out';
    });
  }, [displayItems]);

  const toggleSelection = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected ingredient(s)?`)) return;

    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let failed = 0;

    await Promise.all(ids.map(async (id) => {
      try {
        const item = displayItems.find(i => i.id === id);
        if (!item) return;

        let success = true;
        
        if (!item.isVirtual) {
          const resInv = await fetch(apiUrl(`/api/bar/inventory/items/${id}`), {
            method: 'DELETE',
            headers: { ...getAuthHeaders() },
          });
          if (!resInv.ok) success = false;
        }

        /* Temporarily disabled: do not delete from POS menu
        if (item.menuItemId) {
          const resMenu = await fetch(apiUrl(`/api/bar/menu/items/${item.menuItemId}`), {
            method: 'DELETE',
            headers: { ...getAuthHeaders() },
          });
          if (!resMenu.ok) success = false;
        }
        */

        if (!success) failed++;
      } catch {
        failed++;
      }
    }));

    setSelectedIds(new Set());
    setBulkDeleting(false);
    loadBarMenu();
    loadInventory();

    if (failed > 0) {
      alert(`${ids.length - failed} deleted, ${failed} failed.`);
    }
  };

  // Show "Coming Soon" for restaurant-only outlet

  if (activeOutlet === 'restaurant') {

    return (

      <div className="flex items-center justify-center h-[60vh]">

        <div className="text-center">

          <Package size={80} className="text-gray-300 mx-auto mb-6" />

          <h2 className="text-3xl font-black uppercase tracking-[0.2em] text-gray-800 mb-2">

            Restaurant Inventory

          </h2>

          <p className="text-xl text-gray-500 font-bold">Coming Soon</p>

          <p className="text-sm text-gray-400 mt-2">Switch to Bar outlet to manage liquor inventory</p>

        </div>

      </div>

    );

  }



  if (loading) {

    return (

      <div className="flex items-center justify-center h-64">

        <div className="text-center">

          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E53935] mx-auto mb-4"></div>

          <p className="text-gray-600">Loading inventory...</p>

        </div>

      </div>

    );

  }



  const renderEditBarCell = (item, field, displayValue, inputType = "number", align = "center", unit = "") => {
    return editingBarCell?.itemId === item.id && editingBarCell?.field === field ? (
      <div className={`flex items-center justify-${align} gap-1`}>
        <input
          type={inputType}
          step="any"
          value={editingBarCell.value}
          onChange={(e) => setEditingBarCell(prev => ({ ...prev, value: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleBarInlineSave(item, field);
            if (e.key === 'Escape') setEditingBarCell(null);
          }}
          className={`px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:border-blue-400 ${inputType === 'text' ? 'w-32' : 'w-20'} text-${align}`}
          autoFocus
          disabled={editBarSaving}
        />
        <button onClick={() => handleBarInlineSave(item, field)} disabled={editBarSaving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={12} /></button>
        <button onClick={() => setEditingBarCell(null)} disabled={editBarSaving} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </div>
    ) : (
      <div className={`flex items-center justify-${align} gap-1 group/cell`}>
        <span>
          {displayValue} {unit}
        </span>
        <button
          onClick={() => !item.isVirtual && setEditingBarCell({ 
            itemId: item.id, 
            field, 
            value: String(
              field === 'name' ? toTitleCase(item.name || item.menuItem?.name || '') : 
              field === 'category' ? (item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category) || '') : 
              field === 'bottleSize' ? (item.bottleSize || '') : 
              field === 'price' ? (item.menuItem?.basePrice || item.menuItem?.price || 0) : 
              field === 'opening' ? ((item.todayEntry?.openingStock ?? 0) / (item.bottleSize || 750)).toFixed(2) : 
              field === 'purchase' ? ((item.todayEntry?.addedStock ?? 0) / (item.bottleSize || 750)).toFixed(2) : 
              field === 'consumed' ? (item.todayEntry?.consumedStock ?? 0) : ''
            ) 
          })}
          className="p-0.5 text-gray-400 hover:text-gray-700"
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  };

  return (

    <div className="space-y-6">

      <div className="flex flex-col lg:flex-row lg:items-center justify-between bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm gap-6">

        <div className="min-w-0 flex-shrink-0">
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter leading-tight">Bar<br />Inventory</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 leading-relaxed">Liquor Stock Levels<br />& Purchases</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {accessibleOutlets.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">View</label>
              <select
                value={outletFilter}
                onChange={(e) => setOutletFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-[#E53935] outline-none"
              >
                <option value="self">This Outlet</option>
                <option value="combined">All Outlets (Shared)</option>
              </select>
              {outletFilter === 'combined' && (
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">Read-only</span>
              )}
            </div>
          )}
          <DateRangePicker
            fromDate={fromDate}
            toDate={toDate}
            onChange={(newFrom, newTo) => {
              setFromDate(newFrom);
              setToDate(newTo);
            }}
          />

          {!isRangeMode && (<>

          <button
            onClick={() => {
              if (displayItems.length === 0) return;
              const headers = ['S.NO', 'ITEM', 'CATEGORY', 'PRICE', 'STOCK(ml)', 'BOTTLE_SIZE(ml)', 'REORDER(bottles)', 'COST_PER_BOTTLE'];
              const rows = displayItems.map((item, index) => {
                const name = item.name || item.menuItem?.name || '';
                const category = item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category) || '';
                const price = parseFloat(item.menuItem?.basePrice || item.menuItem?.price || 0);
                const stock = parseFloat(item.currentStock || 0);
                const bottleSize = parseInt(item.bottleSize || 750);
                const reorder = parseFloat(item.reorderLevel || 0);
                const cost = parseFloat(item.costPerBottle || 0);
                const safeName = name.includes(',') ? `"${name}"` : name;
                const safeCategory = category.includes(',') ? `"${category}"` : category;
                return [index + 1, safeName, safeCategory, price, stock, bottleSize, reorder, cost].join(',');
              });
              const csv = [headers.join(','), ...rows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `bar-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            disabled={displayItems.length === 0}
            className="w-full sm:w-auto text-xs font-bold bg-[#F4F4F5] text-gray-700 px-6 py-4 rounded-2xl hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download size={14} /> CSV
          </button>
          
          <input
            ref={csvImportRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files[0]) {
                handleImportCSV(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />
          <button
            onClick={() => csvImportRef.current?.click()}
            disabled={importing}
            className="w-full sm:w-auto text-xs font-bold bg-[#F4F4F5] text-gray-700 px-6 py-4 rounded-2xl hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download size={14} className="rotate-180" /> {importing ? `Importing ${importProgress}…` : 'Import CSV'}
          </button>

          <input
            type="text"
            placeholder="Search inventory..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-3 border border-gray-100 rounded-xl text-sm focus:border-[#E53935] outline-none shadow-sm flex-1 sm:flex-none sm:w-64"
          />

          <button
            onClick={() => setShowAddModal(true)}
            className="w-full sm:w-auto bg-[#B71C1C] text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#8E1414] shadow-red-100 shadow-xl transition-all active:scale-95 text-center"
          >
            Add Item
          </button>

          <button
            onClick={() => setShowPurchaseModal(true)}
            className="w-full sm:w-auto bg-[#E8F5E9] text-[#2E7D32] px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#C8E6C9] transition-all active:scale-95"
          >
            Record Purchase
          </button>

          <button
            onClick={async () => {
              setTopSellingLoading(true);
              try {
                const res = await fetchBarTopSelling({ startDate: fromDate, endDate: fromDate });
                setTopSelling(res);
              } catch (err) {
                showNotification('Failed to fetch top selling items', 'error');
              } finally {
                setTopSellingLoading(false);
              }
            }}
            disabled={topSellingLoading}
            className="w-full sm:w-auto bg-[#FFF3E0] text-[#E65100] px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#FFE0B2] transition-all active:scale-95 disabled:opacity-50"
          >
            {topSellingLoading ? 'Loading...' : 'Top 3 Selling Items'}
          </button>

          <button
            onClick={() => setShowDeductionPanel(p => !p)}
            className={`w-full sm:w-auto px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-2 ${showDeductionPanel ? 'bg-[#B71C1C] text-white shadow-red-100 shadow-xl' : 'bg-[#F4F4F5] text-gray-700 hover:bg-gray-200'}`}
          >
            <Activity size={14} /> Deduction Check
          </button>

          </>)}

        </div>
      </div>

      {isRangeMode && (
        <InventoryRangeSummary
          restaurantId={getCurrentRestaurantId()}
          startDate={fromDate}
          endDate={toDate}
          kind="bar"
        />
      )}

      {!isRangeMode && (
        <>

      {showDeductionPanel && (
        <div className="bg-white border-2 border-red-100 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-red-600" size={20} />
            <h3 className="text-sm font-black uppercase tracking-widest text-red-900">Deduction Diagnostic</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">Enter an Order ID to verify what liquor stock was deducted when the bill was settled.</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="order_xxx..."
              value={deductionCheckOrderId}
              onChange={(e) => setDeductionCheckOrderId(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-[#E53935] outline-none font-mono"
            />
            <button
              onClick={async () => {
                if (!deductionCheckOrderId.trim()) return;
                setDeductionCheckLoading(true);
                setDeductionCheckResult(null);
                try {
                  const data = await fetchBarDeductionCheck(deductionCheckOrderId.trim());
                  setDeductionCheckResult(data);
                } catch (err) {
                  setDeductionCheckResult({ error: err.message });
                } finally {
                  setDeductionCheckLoading(false);
                }
              }}
              disabled={deductionCheckLoading || !deductionCheckOrderId.trim()}
              className="px-5 py-2 bg-[#B71C1C] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#8E1414] disabled:opacity-50"
            >
              {deductionCheckLoading ? 'Checking…' : 'Check'}
            </button>
          </div>

          {deductionCheckResult && (
            <div className="space-y-3 mt-4">
              {deductionCheckResult.error ? (
                <p className="text-sm text-red-600 font-bold">{deductionCheckResult.error}</p>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-bold text-gray-700">Status: <span className={deductionCheckResult.status === 'PAID' ? 'text-green-600' : 'text-amber-600'}>{deductionCheckResult.status}</span></span>
                    <span className="font-bold text-gray-700">Liquor Items: {deductionCheckResult.summary.totalLiquorItems}</span>
                  </div>

                  {deductionCheckResult.missingInventoryLinks?.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-xs font-black text-red-700 mb-1">No Inventory Link Found For:</p>
                      <p className="text-xs text-red-600">{deductionCheckResult.missingInventoryLinks.join(', ')}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {deductionCheckResult.liquorItems?.map((li) => (
                      <div key={li.menuItemId} className={`rounded-xl border p-3 ${li.hasInventoryLink && li.deductedQty !== null ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-black text-gray-900">{li.name} × {li.orderedQty}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${li.hasInventoryLink ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {li.hasInventoryLink ? '✓ Inventory found' : '✗ No inventory'}
                          </span>
                        </div>
                        {li.deductedQty !== null && (
                          <div className="text-[10px] bg-white border border-green-200 rounded-lg px-2 py-1 text-gray-700 inline-block">
                            Deducted: <span className="font-bold text-red-600">-{li.deductedQty} ml</span> 
                            <span className="mx-2 text-gray-300">|</span> 
                            Stock: {li.stockBefore} → {li.stockAfter}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}







      {activeTab === 'inventory' && (
        <>

          {lowStockItems.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 mb-6">
              <AlertCircle className="text-amber-600" size={24} />
              <div>
                <p className="font-bold text-amber-800">{lowStockItems.length} item(s) below reorder level</p>
                <p className="text-sm text-amber-600">{lowStockItems.map((i) => i.name || i.menuItem?.name || 'Unknown Item').join(', ')}</p>
              </div>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <CheckSquare className="text-red-600" size={24} />
                <p className="font-bold text-red-800">{selectedIds.size} item(s) selected</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-sm font-bold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100"
                >Clear Selection</button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {bulkDeleting ? <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <Trash2 size={14} />}
                  {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
                </button>
              </div>
            </div>
          )}







      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-3xl border border-[#FFCDD2] shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-4 py-4 text-center">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935] cursor-pointer"
                    checked={filteredInventory.length > 0 && filteredInventory.every(i => selectedIds.has(i.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filteredInventory.map(i => i.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                </th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 w-[1%] whitespace-nowrap">Ingredient</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Category</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Scale</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Price</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Opening Stock</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Opening Amount</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Purchase</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Purchase Amount</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Total Stock</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Total Stock Amount</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Consumption</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Consumption Amount</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Balance Stock</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Balance Stock Amount</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center w-full">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredInventory.map(item => {
                if (!item) return null;
                const stockStatus = getStockStatus(item);
                const currentStock = parseFloat(item.currentStock) || 0;
                const category = item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category) || '';
                const isBeer = String(category || '').toLowerCase() === 'beer';
                const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';
                const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : (isBeer ? 650 : 750);
                const reorderLevel = parseFloat(item.reorderLevel) || 0;
                const reorderBottles = bottleSize > 0 ? Math.ceil(reorderLevel / bottleSize) : 0;
                const maxStock = parseFloat(item.maxStock) || (reorderLevel * 3) || 10000;
                const stockPercentage = maxStock > 0 ? Math.min((currentStock / maxStock) * 100, 100) : 0;
                
                const hasEntry = !!item.todayEntry;
                const isCarryOver = item.todayEntry?.isCarryOver === true;
                const opening  = hasEntry ? Number(item.todayEntry.openingStock  ?? 0) : null;
                const purchase = hasEntry ? Number(item.todayEntry.addedStock    ?? 0) : null;
                const consumed = hasEntry ? Number(item.todayEntry.consumedStock ?? 0) : null;
                const closingStock = hasEntry ? Number(item.todayEntry.closingStock ?? 0) : null;

                const price = Number(item.menuItem?.basePrice || item.menuItem?.price || 0);
                const costPerBottle = item.costPerBottle ? Number(item.costPerBottle) : (price * (bottleSize / 30));
                const pricePerMl = bottleSize > 0 ? (costPerBottle / bottleSize) : 0;

                const openingAmt     = opening     != null ? opening     * pricePerMl : null;
                const purchaseAmt    = purchase    != null ? purchase    * pricePerMl : null;
                const totalStock     = hasEntry    ? opening + purchase          : null;
                const totalStockAmt  = totalStock  != null ? totalStock  * pricePerMl : null;
                const consumptionAmt = consumed    != null ? consumed    * pricePerMl : null;
                const balanceStock   = closingStock;
                const balanceStockAmt = balanceStock != null ? balanceStock * pricePerMl : null;

                const fmtAmt = (val) => val == null ? '—' : `₹ ${Number(val).toFixed(2)}`;
                const fmtVal = (val) => val == null ? '—' : Number(val).toFixed(0);

                return (
                  <tr key={item.id} className={`transition-colors ${isCarryOver ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-gray-50'} ${selectedIds.has(item.id) ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-4 text-center">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-gray-300 text-[#E53935] focus:ring-[#E53935] cursor-pointer" 
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative group shrink-0">
                          {item.menuItem?.imageUrl ? (
                            <img src={item.menuItem.imageUrl} alt={item.name || item.menuItem?.name || ''} className="h-9 w-9 rounded-full object-cover border border-gray-200 shadow-sm" />
                          ) : (
                            <IngredientAvatar name={item.name || item.menuItem?.name || 'Unknown Item'} />
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {editingBarCell?.itemId === item.id && editingBarCell?.field === 'name' ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingBarCell.value}
                                onChange={(e) => setEditingBarCell(prev => ({ ...prev, value: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleBarInlineSave(item, 'name'); if (e.key === 'Escape') setEditingBarCell(null); }}
                                className="px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:border-blue-400 w-32"
                                autoFocus
                                disabled={editBarSaving}
                              />
                              <button onClick={() => handleBarInlineSave(item, 'name')} disabled={editBarSaving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={12} /></button>
                              <button onClick={() => setEditingBarCell(null)} disabled={editBarSaving} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 group/name">
                              <p className="font-black text-gray-900 text-sm">{toTitleCase(item.name || item.menuItem?.name || 'Unknown Item')}</p>
                              <button
                                onClick={() => !item.isVirtual && setEditingBarCell({ itemId: item.id, field: 'name', value: toTitleCase(item.name || item.menuItem?.name || '') })}
                                className="p-0.5 text-gray-400 hover:text-gray-700 opacity-0 group-hover/name:opacity-100 transition-opacity"
                              >
                                <Pencil size={11} />
                              </button>
                            </div>
                          )}
                          {isCarryOver && <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">↩ carried over</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 text-sm">
                      {editingBarCell?.itemId === item.id && editingBarCell?.field === 'category' ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingBarCell.value}
                            onChange={(e) => setEditingBarCell(prev => ({ ...prev, value: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleBarInlineSave(item, 'category'); if (e.key === 'Escape') setEditingBarCell(null); }}
                            className="px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:border-blue-400 w-24"
                            autoFocus
                            disabled={editBarSaving}
                          />
                          <button onClick={() => handleBarInlineSave(item, 'category')} disabled={editBarSaving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={12} /></button>
                          <button onClick={() => setEditingBarCell(null)} disabled={editBarSaving} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-start gap-1 group/cat">
                          <span className={`${category ? 'bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold -ml-2' : 'text-gray-300 text-xs italic'}`}>
                            {category || 'Uncategorized'}
                          </span>
                          <button
                            onClick={() => !item.isVirtual && setEditingBarCell({ itemId: item.id, field: 'category', value: category || '' })}
                            className="p-0.5 text-gray-400 hover:text-gray-700 opacity-0 group-hover/cat:opacity-100 transition-opacity"
                          >
                            <Pencil size={11} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-500 text-sm">
                      {editingBarCell?.itemId === item.id && editingBarCell?.field === 'bottleSize' ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={editingBarCell.value}
                            onChange={(e) => setEditingBarCell(prev => ({ ...prev, value: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleBarInlineSave(item, 'bottleSize'); if (e.key === 'Escape') setEditingBarCell(null); }}
                            className="px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:border-blue-400 w-20"
                            autoFocus
                            disabled={editBarSaving}
                          />
                          <button onClick={() => handleBarInlineSave(item, 'bottleSize')} disabled={editBarSaving} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40"><Check size={12} /></button>
                          <button onClick={() => setEditingBarCell(null)} disabled={editBarSaving} className="p-1 text-gray-400 hover:text-gray-600"><X size={12} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-start gap-1 group/unit">
                          <span>{bottleSize} ml</span>
                          <button
                            onClick={() => !item.isVirtual && setEditingBarCell({ itemId: item.id, field: 'bottleSize', value: String(bottleSize || '') })}
                            className="p-0.5 text-gray-400 hover:text-gray-700 opacity-0 group-hover/unit:opacity-100 transition-opacity"
                          >
                            <Pencil size={11} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-center font-bold text-gray-900">{renderEditBarCell(item, 'price', `₹${price.toFixed(2)}`, 'number')}</td>
                    <td className="px-4 py-4 text-xs text-center font-bold text-gray-900">{renderEditBarCell(item, 'opening', opening != null ? formatBottlesMl(opening, bottleSize) : '—')}</td>
                    <td className="px-4 py-4 text-xs text-center text-gray-600">{fmtAmt(openingAmt)}</td>
                    <td className="px-4 py-4 text-xs text-center font-bold text-gray-900">{renderEditBarCell(item, 'purchase', purchase != null ? formatBottlesMl(purchase, bottleSize) : '—')}</td>
                    <td className="px-4 py-4 text-xs text-center text-gray-600">{fmtAmt(purchaseAmt)}</td>
                    <td className="px-4 py-4 text-xs text-center font-bold text-blue-600">{totalStock != null ? formatBottlesMl(totalStock, bottleSize) : '—'}</td>
                    <td className="px-4 py-4 text-xs text-center text-blue-600">{fmtAmt(totalStockAmt)}</td>
                    <td className="px-4 py-4 text-xs text-center font-bold text-red-600">{renderEditBarCell(item, 'consumed', consumed != null ? formatBottlesMl(consumed, bottleSize) : '—')}</td>
                    <td className="px-4 py-4 text-xs text-center text-red-600">{fmtAmt(consumptionAmt)}</td>
                    <td className="px-4 py-4 text-xs text-center font-bold text-green-600">{balanceStock != null ? formatBottlesMl(balanceStock, bottleSize) : '—'}</td>
                    <td className="px-4 py-4 text-xs text-center font-bold text-green-600">{fmtAmt(balanceStockAmt)}</td>
                    <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            disabled={deletingItemId === item.id}
                            className="p-1.5 text-red-600 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deletingItemId === item.id ? <ButtonSpinner /> : <Trash2 size={16} />}
                          </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredInventory.map(item => {
          if (!item) return null;

          const stockStatus = getStockStatus(item);

          const currentStock = parseFloat(item.currentStock) || 0;

          const category = item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category) || '';

          const isBeer = String(category || '').toLowerCase() === 'beer';

          const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';

          const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : (isBeer ? 650 : 750);

          const reorderLevel = parseFloat(item.reorderLevel) || 0;

          const bottles = bottleSize > 0 ? Math.floor(currentStock / bottleSize) : 0;

          const reorderBottles = bottleSize > 0 ? Math.ceil(reorderLevel / bottleSize) : 0;



          // Calculate percentage for progress bar using maxStock

          const maxStock = parseFloat(item.maxStock) || (reorderLevel * 3) || 10000;

          const stockPercentage = maxStock > 0 ? Math.min((currentStock / maxStock) * 100, 100) : 0;



          return (

            <div key={item.id} className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm p-6 hover:shadow-md transition-all">

              <div className="flex items-center justify-between gap-4">

                {/* Left: Item Info */}

                <div className="flex-1 min-w-0">

                  <div className="flex items-center gap-3 mb-2">

                    <h3 className="font-black text-sm uppercase tracking-wide text-gray-900 truncate">{item.name || item.menuItem?.name || 'Unknown Item'}</h3>



                  </div>



                  {/* Stock Progress Bar */}

                  <div className="mb-3">

                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">

                      <span className="text-gray-400">Stock Level</span>

                      <span className="text-gray-900">{formatBottlesMl(currentStock, bottleSize)}</span>

                    </div>

                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">

                      <div

                        className={`h-full rounded-full transition-all duration-500 ${

                          stockStatus.status === 'out' ? 'bg-red-500' :

                          stockStatus.status === 'low' ? 'bg-amber-400' :

                          'bg-green-400'

                        }`}

                        style={{ width: `${stockPercentage}%` }}

                      />

                    </div>

                  </div>



                  {/* Additional Info */}

                  <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-gray-400">

                    <span>Reorder: <strong className="text-gray-900">{reorderBottles} btl</strong></span>

                    <span>Size: <strong className="text-gray-900">{bottleSize} ml</strong></span>

                    {item.costPerBottle > 0 && (

                      <span>Cost: <strong className="text-gray-900">₹{parseFloat(item.costPerBottle).toFixed(2)}</strong></span>

                    )}

                  </div>

                </div>



                {/* Right: Action Buttons */}

                <div className="flex flex-col sm:flex-row gap-2">

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={deletingItemId === item.id}
                      className="p-1.5 text-red-600 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingItemId === item.id ? <ButtonSpinner /> : <Trash2 size={16} />}
                    </button>

                </div>

              </div>

            </div>

          );

        })}

      </div>



      {filteredInventory.length === 0 && (

        <div className="text-center py-12">

          <Package size={48} className="text-gray-400 mx-auto mb-4" />

          <p className="text-gray-600">No inventory items found</p>

        </div>

      )}

          </>)}



      {showAddModal && (

        <AddInventoryModal

          onClose={() => setShowAddModal(false)}

          onSave={handleCreateItem}

          isSubmitting={isCreating}

        />

      )}



      {showAdjustModal && selectedItem && (

        <AdjustStockModal

          item={selectedItem}

          onClose={() => {

            setShowAdjustModal(false);

            setSelectedItem(null);

          }}

          onSave={(adjustment) => handleAdjustStock(selectedItem, adjustment)}

          isSubmitting={isAdjusting}

        />

      )}



      {showPurchaseModal && (

        <RecordPurchaseModal

          inventory={displayItems.filter(item => !item.isVirtual)}

          onClose={() => setShowPurchaseModal(false)}

          onSave={handleRecordPurchase}

          showNotification={showNotification}

          isSubmitting={isRecordingPurchase}

        />

      )}



      {showEditModal && editingItem && (
        <EditInventoryModal
          item={editingItem}
          onClose={() => {
            setShowEditModal(false);
            setEditingItem(null);
          }}
          onSave={(updateData) => handleUpdateItem(editingItem.id, updateData)}
          isSubmitting={isUpdating}
        />
      )}

      {/* Top Selling Modal */}
      {topSelling !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTopSelling(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">Top 3 Selling Items</h3>
              <button onClick={() => setTopSelling(null)} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>
            </div>
            {topSelling.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No sales data found.</p>
            ) : (
              <div className="space-y-3">
                {topSelling.map((item, idx) => {
                  const toTitleCase = (s) => s ? s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '';
                  return (
                  <div key={item.menuItemId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-700'}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{toTitleCase(item.name)}</p>
                      <p className="text-xs text-gray-500">{item.totalSold} sold</p>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
        </div>
      )}

        </>

      )}







      {popup && (

        <Popup

          message={popup.message}

          type={popup.type}

          onClose={closePopup}

        />

      )}

    </div>

  );

}



function AddInventoryModal({ onClose, onSave, isSubmitting }) {

  const [menuItems, setMenuItems] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');

  const [showDropdown, setShowDropdown] = useState(false);

  const [formData, setFormData] = useState({

    menuItemId: '',

    menuItemName: '',

    bottleSize: 750,

    currentStock: 0,

    reorderLevel: 0,

    maxStock: 0,

    costPerBottle: 0,

    unitOfMeasure: 'ml',

  });



  useEffect(() => {

    fetch(apiUrl(`/api/bar/menu/items?restaurantId=${getCurrentRestaurantId()}`), {

      headers: authService.getAuthHeader()

    })

      .then(res => res.json())

      .then(data => setMenuItems(data.filter(item => item.menuType === 'LIQUOR')))

      .catch(console.error);

  }, []);



  const handleSubmit = (e) => {

    e.preventDefault();

    onSave({

      menuItemId: formData.menuItemId,

      bottleSize: formData.bottleSize,

      currentStock: parseFloat(formData.currentStock),

      reorderLevel: parseFloat(formData.reorderLevel),

      maxStock: parseFloat(formData.maxStock),

      costPerBottle: parseFloat(formData.costPerBottle),

      unitOfMeasure: formData.unitOfMeasure,

    });

  };



  // Show all items, filter by search if there's a search term

  const filteredMenuItems = menuItems.filter(item =>

    !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase())

  );



  const selectItem = (item) => {

    const isBeer = String(item.category || '').toLowerCase() === 'beer';

    setFormData({

      ...formData,

      menuItemId: item.id,

      menuItemName: item.name,

      bottleSize: isBeer ? 650 : 750

    });

    setSearchTerm(item.name);

    setShowDropdown(false);

  };



  const handleClickOutside = (e) => {

    if (e.target === e.currentTarget) {

      onClose();

    }

  };



  return (

    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClickOutside}>

      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-hide" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">

          <h3 className="text-xl font-black uppercase tracking-[0.2em]">Add Inventory Item</h3>

          <button

            onClick={onClose}

            className="p-2 hover:bg-[#FFEBEE] rounded-full transition-colors"

          >

            <X size={20} className="text-[#6B6B6B]" />

          </button>

        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="relative">

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Select Menu Item</label>

            <input

              type="text"

              required

              value={searchTerm}

              onChange={(e) => {

                setSearchTerm(e.target.value);

                setShowDropdown(true);

                setFormData({ ...formData, menuItemId: '', menuItemName: '' });

              }}

              onFocus={() => setShowDropdown(true)}

              onBlur={() => {

                setTimeout(() => setShowDropdown(false), 200);

              }}

              placeholder="Search for liquor item..."

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none font-medium transition-all"

            />

            {showDropdown && filteredMenuItems.length > 0 && (

              <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto scrollbar-hide z-10">

                {filteredMenuItems.map(item => (

                  <div

                    key={item.id}

                    onMouseDown={(e) => {

                      e.preventDefault();

                      selectItem(item);

                    }}

                    className="px-4 py-3 hover:bg-[#FFF5F5] cursor-pointer border-b border-gray-100 last:border-0 transition-colors font-medium"

                  >

                    {item.name}

                  </div>

                ))}

              </div>

            )}

            {showDropdown && filteredMenuItems.length === 0 && searchTerm && (

              <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl p-4 z-10">

                <p className="text-gray-500 text-sm text-center">No items found</p>

              </div>

            )}

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Bottle Size (ml)</label>

            <input

              type="number"

              required

              value={formData.bottleSize}

              onChange={(e) => setFormData({ ...formData, bottleSize: parseInt(e.target.value) })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Current Stock (ml)</label>

            <input

              type="number"

              required

              value={formData.currentStock}

              onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Reorder Level (ml)</label>

            <input

              type="number"

              required

              value={formData.reorderLevel}

              onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Max Stock (ml)</label>

            <input

              type="number"

              required

              value={formData.maxStock}

              onChange={(e) => setFormData({ ...formData, maxStock: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Cost Per Bottle (₹)</label>

            <input

              type="number"

              step="0.01"

              value={formData.costPerBottle}

              onChange={(e) => setFormData({ ...formData, costPerBottle: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div className="flex gap-2 pt-4">

            <button

              type="button"

              onClick={onClose}

              disabled={isSubmitting}

              className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-xl font-bold text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"

            >

              Cancel

            </button>

            <button

              type="submit"

              disabled={isSubmitting}

              className="flex-1 px-4 py-3 bg-[#E53935] text-white rounded-xl font-bold text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"

            >

              {isSubmitting ? (

                <span className="flex items-center justify-center gap-2">

                  <ButtonSpinner /> Creating...

                </span>

              ) : (

                'Create Item'

              )}

            </button>

          </div>

        </form>

      </div>

    </div>

  );

}



function EditInventoryModal({ item, onClose, onSave, isSubmitting }) {

  const [formData, setFormData] = useState({

    costPerBottle: item.costPerBottle || 0,

    bottleSize: item.bottleSize || 750,

    reorderLevel: item.reorderLevel || 0,

    maxStock: item.maxStock || 0,

  });



  const handleSubmit = (e) => {

    e.preventDefault();

    onSave(formData);

  };



  const handleClickOutside = (e) => {

    if (e.target === e.currentTarget) {

      onClose();

    }

  };



  const itemName = item.name || item.menuItem?.name || 'Unknown Item';



  return (

    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClickOutside}>

      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-hide" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">

          <h3 className="text-xl font-black uppercase tracking-[0.2em]">Edit Inventory Item</h3>

          <button

            onClick={onClose}

            className="p-2 hover:bg-[#FFEBEE] rounded-full transition-colors"

          >

            <X size={20} className="text-[#6B6B6B]" />

          </button>

        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide text-gray-600">Item Name</label>

            <input

              type="text"

              value={itemName}

              disabled

              className="w-full px-4 py-3 bg-gray-100 border-2 border-gray-300 rounded-xl outline-none font-medium text-gray-600 cursor-not-allowed"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Cost Per Bottle (₹)</label>

            <input

              type="number"

              step="0.01"

              min="0"

              required

              value={formData.costPerBottle}

              onChange={(e) => setFormData({ ...formData, costPerBottle: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Bottle Size (ml)</label>

            <input

              type="number"

              min="1"

              required

              value={formData.bottleSize}

              onChange={(e) => setFormData({ ...formData, bottleSize: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Reorder Level (ml)</label>

            <input

              type="number"

              min="0"

              required

              value={formData.reorderLevel}

              onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Max Stock (ml)</label>

            <input

              type="number"

              min="0"

              required

              value={formData.maxStock}

              onChange={(e) => setFormData({ ...formData, maxStock: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div className="flex gap-2 pt-4">

            <button

              type="button"

              onClick={onClose}

              disabled={isSubmitting}

              className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-xl font-bold text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"

            >

              Cancel

            </button>

            <button

              type="submit"

              disabled={isSubmitting}

              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-bold text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"

            >

              {isSubmitting ? (

                <span className="flex items-center justify-center gap-2">

                  <ButtonSpinner /> Saving...

                </span>

              ) : (

                'Save Changes'

              )}

            </button>

          </div>

        </form>

      </div>

    </div>

  );

}



function AdjustStockModal({ item, onClose, onSave, isSubmitting }) {

  const [adjustment, setAdjustment] = useState({

    quantityChange: 0,

    type: 'ADJUSTMENT',

    notes: '',

  });



  const handleSubmit = (e) => {

    e.preventDefault();

    onSave({

      ...adjustment,

      quantityChange: parseFloat(adjustment.quantityChange),

    });

  };



  const handleClickOutside = (e) => {

    if (e.target === e.currentTarget) {

      onClose();

    }

  };



  const currentStock = parseFloat(item.currentStock) || 0;

  const category = item.category || (typeof item.menuItem?.category === 'object' ? item.menuItem.category.name : item.menuItem?.category) || '';

  const isBeer = String(category || '').toLowerCase() === 'beer';

  const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';

  const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : (isBeer ? 650 : 750);

  const newStock = currentStock + parseFloat(adjustment.quantityChange || 0);



  return (

    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClickOutside}>

      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-hide" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">

          <h3 className="text-xl font-black uppercase tracking-[0.2em]">{item.isVirtual ? 'Add Stock' : 'Adjust Stock'}: {item.name || item.menuItem?.name || 'Unknown Item'}</h3>

          <button

            onClick={onClose}

            className="p-2 hover:bg-[#FFEBEE] rounded-full transition-colors"

          >

            <X size={20} className="text-[#6B6B6B]" />

          </button>

        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="bg-[#FFF5F5] rounded-xl p-4 mb-4 border-2 border-gray-200">

            <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">Current Stock:</p>

            <p className="text-2xl font-black text-[#E53935]">{currentStock.toFixed(0)} ml ({Math.floor(currentStock / bottleSize)} bottles)</p>

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Adjustment Type</label>

            <select

              value={adjustment.type}

              onChange={(e) => setAdjustment({ ...adjustment, type: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all font-medium"

            >

              <option value="ADJUSTMENT">Manual Adjustment</option>

              <option value="WASTAGE">Wastage/Spillage</option>

              <option value="PURCHASE">Purchase Received</option>

            </select>

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Quantity Change (ml)</label>

            <input

              type="number"

              required

              value={adjustment.quantityChange}

              onChange={(e) => setAdjustment({ ...adjustment, quantityChange: e.target.value })}

              placeholder="Use negative for deduction (e.g., -1500)"

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

            <p className="text-xs text-gray-500 mt-1">Enter positive to add, negative to deduct</p>

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Notes (Optional)</label>

            <textarea

              value={adjustment.notes}

              onChange={(e) => setAdjustment({ ...adjustment, notes: e.target.value })}

              placeholder="Reason for adjustment..."

              rows={3}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none resize-none transition-all"

            />

          </div>



          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-200">

            <p className="text-sm text-gray-600 font-bold uppercase tracking-wide">New Stock After Adjustment:</p>

            <p className={`text-2xl font-black ${newStock < 0 ? 'text-red-600' : 'text-green-600'}`}>

              {newStock.toFixed(0)} ml ({Math.floor(newStock / bottleSize)} bottles)

            </p>

          </div>



          <div className="flex gap-2 pt-4">

            <button

              type="button"

              onClick={onClose}

              disabled={isSubmitting}

              className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-xl font-bold text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"

            >

              Cancel

            </button>

            <button

              type="submit"

              disabled={isSubmitting}

              className="flex-1 px-4 py-3 bg-[#E53935] text-white rounded-xl font-bold text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"

            >

              {isSubmitting ? (

                <span className="flex items-center justify-center gap-2">

                  <ButtonSpinner /> Adjusting...

                </span>

              ) : (

                item.isVirtual ? 'Add Stock' : 'Save Adjustment'

              )}

            </button>

          </div>

        </form>

      </div>

    </div>

  );

}



function RecordPurchaseModal({ inventory, onClose, onSave, showNotification, isSubmitting }) {

  const [menuItems, setMenuItems] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');

  const [showDropdown, setShowDropdown] = useState(false);

  const [formData, setFormData] = useState({

    itemId: '',

    itemName: '',

    bottleSize: 0,

    quantityPurchased: 0,

    costPerBottle: 0,

    supplierName: '',

    notes: '',

  });



  useEffect(() => {

    fetch(apiUrl(`/api/bar/menu/items?restaurantId=${getCurrentRestaurantId()}`), {

      headers: authService.getAuthHeader()

    })

      .then(res => res.json())

      .then(data => setMenuItems(data.filter(item => item.menuType === 'LIQUOR')))

      .catch(console.error);

  }, []);



  const handleSubmit = (e) => {

    e.preventDefault();



    // Find inventory item - check both menuItemId and direct id match

    const existingInventory = inventory.find(inv =>

      inv.menuItemId === formData.itemId ||

      inv.id === formData.itemId

    );



    if (!existingInventory) {

      showNotification('This item does not have inventory yet. Please add it to inventory first using the "Add Item" button.', 'error');

      return;

    }



    // Check if it's a virtual item (not yet saved to backend)

    if (existingInventory.isVirtual || (typeof existingInventory.id === 'string' && existingInventory.id.startsWith('virtual-'))) {

      showNotification('This item is not saved yet. Please save the item to inventory first before recording purchases.', 'warning');

      return;

    }



    // Item has real inventory, record purchase

    onSave({

      itemId: existingInventory.id,

      quantity: parseFloat(formData.quantityPurchased), // Backend expects 'quantity', not 'quantityPurchased'

      costPerBottle: parseFloat(formData.costPerBottle),

      supplierName: formData.supplierName,

      notes: formData.notes,

    });

  };



  // Show all menu items, filter by search if there's a search term

  const filteredMenuItems = menuItems.filter(item =>

    !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase())

  );



  const selectItem = (item) => {

    const isBeer = String(item.category || '').toLowerCase() === 'beer';

    setFormData({

      ...formData,

      itemId: item.id,

      itemName: item.name,

      bottleSize: isBeer ? 650 : 750

    });

    setSearchTerm(item.name);

    setShowDropdown(false);

  };



  const handleClickOutside = (e) => {

    if (e.target === e.currentTarget) {

      onClose();

    }

  };



  return (

    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClickOutside}>

      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-hide" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">

          <h3 className="text-xl font-black uppercase tracking-[0.2em]">Record Purchase</h3>

          <button

            onClick={onClose}

            className="p-2 hover:bg-[#FFEBEE] rounded-full transition-colors"

          >

            <X size={20} className="text-[#6B6B6B]" />

          </button>

        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="relative">

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Select Item</label>

            <input

              type="text"

              required

              value={searchTerm}

              onChange={(e) => {

                setSearchTerm(e.target.value);

                setShowDropdown(true);

                setFormData({ ...formData, itemId: '', itemName: '', bottleSize: 0 });

              }}

              onFocus={() => setShowDropdown(true)}

              onBlur={() => {

                setTimeout(() => setShowDropdown(false), 200);

              }}

              placeholder="Search for liquor item..."

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none font-medium transition-all"

            />

            {showDropdown && filteredMenuItems.length > 0 && (

              <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto scrollbar-hide z-10">

                {filteredMenuItems.map(item => {

                  const existingInventory = inventory.find(inv => inv.menuItemId === item.id);

                  const isBeer = String(item.category || '').toLowerCase() === 'beer';

                  const bottleSize = existingInventory

                    ? (parseInt(existingInventory.bottleSize) || (isBeer ? 650 : 750))

                    : (isBeer ? 650 : 750);

                  return (

                    <div

                      key={item.id}

                      onMouseDown={(e) => {

                        e.preventDefault();

                        selectItem(item);

                      }}

                      className="px-4 py-3 hover:bg-[#FFF5F5] cursor-pointer border-b border-gray-100 last:border-0 transition-colors"

                    >

                      <div className="font-bold">{item.name}</div>

                      {existingInventory && (

                        <div className="text-xs text-gray-500">

                          Current: {Math.floor((parseFloat(existingInventory.currentStock) || 0) / bottleSize)} bottles ({(parseFloat(existingInventory.currentStock) || 0).toFixed(0)} ml)

                        </div>

                      )}

                      {!existingInventory && (

                        <div className="text-xs text-amber-600 font-medium">No inventory yet</div>

                      )}

                    </div>

                  );

                })}

              </div>

            )}

            {showDropdown && filteredMenuItems.length === 0 && searchTerm && (

              <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl p-4 z-10">

                <p className="text-gray-500 text-sm text-center">No items found</p>

              </div>

            )}

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Quantity Purchased (ml)</label>

            <input

              type="number"

              required

              value={formData.quantityPurchased}

              onChange={(e) => setFormData({ ...formData, quantityPurchased: e.target.value })}

              placeholder="e.g., 7500 for 10 bottles of 750ml"

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Cost Per Bottle (₹)</label>

            <input

              type="number"

              step="0.01"

              required

              value={formData.costPerBottle}

              onChange={(e) => setFormData({ ...formData, costPerBottle: e.target.value })}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Supplier Name (Optional)</label>

            <input

              type="text"

              value={formData.supplierName}

              onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}

              placeholder="Enter supplier name"

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none transition-all"

            />

          </div>



          <div>

            <label className="block text-sm font-bold mb-2 uppercase tracking-wide">Notes (Optional)</label>

            <textarea

              value={formData.notes}

              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}

              placeholder="Invoice number, delivery date, etc."

              rows={2}

              className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none resize-none transition-all"

            />

          </div>



          <div className="flex gap-2 pt-4">

            <button

              type="button"

              onClick={onClose}

              disabled={isSubmitting}

              className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-xl font-bold text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"

            >

              Cancel

            </button>

            <button

              type="submit"

              disabled={isSubmitting}

              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-bold text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"

            >

              {isSubmitting ? (

                <span className="flex items-center justify-center gap-2">

                  <ButtonSpinner /> Recording...

                </span>

              ) : (

                'Record Purchase'

              )}

            </button>

          </div>

        </form>

      </div>

    </div>

  );

}



export function Marketing({ upload, setUpload, uploadRef }) {

  const [step, setStep] = useState('upload');

  const [selectedConfig, setSelectedConfig] = useState(null);

  const [caption, setCaption] = useState("✨ Savor the perfection in every bite! Our chef's latest creation is here to redefine your dining experience. Handcrafted with authentic spices and passion. 🥘❤️\n\n#SoftshapeAI #GourmetExperience #FoodArt");

  const [scheduling, setScheduling] = useState('now');



  const handlePost = () => {

    setStep('posting');

    setTimeout(() => setStep('done'), 4000);

  };



  return (

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 font-sans h-full">

      <div className="lg:col-span-2">

        {step === 'upload' && (

          <div className="bg-white border-2 border-dashed border-[#FFCDD2] rounded-[40px] h-[600px] flex flex-col items-center justify-center space-y-6 group cursor-pointer hover:bg-red-50 transition-all duration-500 shadow-xl shadow-red-50/50" onClick={() => uploadRef.current.click()}>

            <input type="file" ref={uploadRef} onChange={(e) => {

              const file = e.target.files[0];

              if (file) {

                setUpload({ url: URL.createObjectURL(file), name: file.name });

                setStep('templates');

              }

            }} className="hidden" />

            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-[#E53935] group-hover:scale-110 transition-transform shadow-inner">

              <Camera size={40} />

            </div>

            <div className="text-center">

              <h3 className="text-2xl font-black text-gray-900 tracking-tight">Step 1: Upload Dish Photography</h3>

              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2">Spire AI will generate professional marketing designs</p>

            </div>

          </div>

        )}

        

        {step === 'templates' && (

           <div className="bg-white p-10 rounded-[40px] border border-[#FFCDD2] shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">

              <div className="flex items-center justify-between mb-10">

                <div>

                   <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Step 2: Choose Your Design</h3>

                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Spire AI has rendered 6 cinematic variations for your dish</p>

                </div>

                <button onClick={() => setStep('upload')} className="text-[#E53935] text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:underline"><ArrowLeft size={12} /> Change Photo</button>

              </div>

              

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8 max-h-[650px] overflow-y-auto pr-4 custom-scrollbar">

                {STYLES.slice(0, 6).map((style, i) => {

                  const config = generateRandomConfig(style.id, i);

                  return (

                    <div 

                      key={i} 

                      onClick={() => { setSelectedConfig(config); setStep('caption'); }}

                      className="group relative rounded-[32px] overflow-hidden cursor-pointer border-4 border-transparent hover:border-[#E53935] transition-all shadow-xl hover:shadow-2xl"

                    >

                       <div className="aspect-[4/5] bg-gray-100 relative">

                          <CreativeCanvas config={config} uploadUrl={upload.url} className="h-full w-full group-hover:scale-105 transition-transform duration-700" />

                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">

                             <div className="bg-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest scale-90 group-hover:scale-100 transition-transform shadow-2xl">Use This Style</div>

                          </div>

                       </div>

                       <div className="p-5 bg-white flex items-center justify-between">

                          <span className="text-xs font-black uppercase tracking-widest text-gray-900">{style.name}</span>

                          <Sparkles size={16} className="text-[#E53935]" />

                       </div>

                    </div>

                  );

                })}

              </div>

           </div>

        )}



        {step === 'caption' && (

           <div className="bg-white p-10 rounded-[40px] border border-[#FFCDD2] shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">

              <div className="flex items-center gap-4 mb-10">

                 <button onClick={() => setStep('templates')} className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 text-gray-400 hover:text-gray-900 transition-colors"><ArrowLeft size={20} /></button>

                 <h3 className="text-2xl font-black text-gray-900 tracking-tight">Step 3: Caption & Launch</h3>

              </div>

              

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

                 <div className="space-y-6">

                    <div className="aspect-[4/5] rounded-[32px] overflow-hidden shadow-2xl border-[6px] border-white ring-1 ring-gray-100">

                       <CreativeCanvas config={selectedConfig} uploadUrl={upload.url} className="h-full w-full" />

                    </div>

                    <p className="text-[10px] font-black text-gray-400 uppercase text-center tracking-[0.2em]">Creative Preview</p>

                 </div>

                 

                 <div className="space-y-8 flex flex-col">

                    <div className="space-y-4">

                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex justify-between items-center">

                          Marketing Copy (Edit)

                          <button onClick={() => setCaption(caption + "!")} className="text-[#E53935] hover:underline flex items-center gap-1"><RefreshCw size={10} /> Regenerate</button>

                       </label>

                       <textarea 

                         value={caption}

                         onChange={(e) => setCaption(e.target.value)}

                         className="w-full h-48 p-6 bg-gray-50 rounded-3xl border-none text-sm font-medium leading-relaxed focus:ring-4 focus:ring-red-50 transition-all outline-none resize-none custom-scrollbar"

                       />

                    </div>

                    

                    <div className="space-y-4">

                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Post Schedule</label>

                       <div className="grid grid-cols-2 gap-3">

                          <button onClick={() => setScheduling('now')} className={`p-4 rounded-2xl border-2 flex items-center gap-3 transition-all ${scheduling === 'now' ? 'border-[#E53935] bg-red-50' : 'border-gray-50'}`}>

                             <div className={`h-2 w-2 rounded-full ${scheduling === 'now' ? 'bg-[#E53935] animate-pulse' : 'bg-gray-300'}`} />

                             <span className="text-[10px] font-black uppercase">Post Now</span>

                          </button>

                          <button onClick={() => setScheduling('later')} className={`p-4 rounded-2xl border-2 flex items-center gap-3 transition-all ${scheduling === 'later' ? 'border-[#E53935] bg-red-50' : 'border-gray-50'}`}>

                             <Calendar size={14} className={scheduling === 'later' ? 'text-[#E53935]' : 'text-gray-400'} />

                             <span className="text-[10px] font-black uppercase">Schedule</span>

                          </button>

                       </div>

                    </div>

                    

                    <div className="flex-grow flex flex-col justify-end">

                       <button 

                         onClick={handlePost}

                         className="w-full py-6 bg-[#E53935] text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-red-100 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"

                       >

                         {scheduling === 'now' ? <Send size={20} /> : <Calendar size={20} />}

                         {scheduling === 'now' ? 'Deploy Live Campaign' : 'Queue Social Post'}

                       </button>

                    </div>

                 </div>

              </div>

           </div>

        )}



        {step === 'posting' && (

           <div className="h-[700px] flex flex-col items-center justify-center animate-in fade-in duration-500">

              <div className="relative w-[300px] h-[600px] bg-[#121212] rounded-[60px] border-[12px] border-[#222] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden">

                 <div className="h-full w-full bg-white flex flex-col animate-in slide-in-from-bottom-8 duration-[2000ms]">

                    <div className="p-4 flex items-center gap-3 border-b border-gray-50">

                       <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 to-purple-600 p-0.5">

                          <div className="h-full w-full rounded-full bg-white flex items-center justify-center p-1">

                             <img src="/logo softshape.ai.png" className="w-full h-full object-contain" />

                          </div>

                       </div>

                       <div className="flex flex-col">

                          <p className="text-[9px] font-black">{upload?.restaurantName || 'Your Restaurant'}</p>

                          <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">Your City, India</p>

                       </div>

                    </div>

                    

                    <div className="aspect-square bg-gray-100 relative">

                       <CreativeCanvas config={selectedConfig} uploadUrl={upload.url} className="h-full w-full" />

                       <div className="absolute inset-0 bg-blue-500/10 animate-pulse" />

                    </div>

                    

                    <div className="p-4 space-y-3">

                       <div className="flex gap-4 text-gray-700">

                          <div className="animate-bounce"><Sparkles size={18} className="text-[#E53935]" /></div>

                          <Share2 size={18} />

                       </div>

                       <div className="space-y-1.5">

                          <div className="h-1.5 w-[90%] bg-gray-100 rounded-full" />

                          <div className="h-1.5 w-[70%] bg-gray-100 rounded-full" />

                          <div className="h-1.5 w-[40%] bg-gray-100 rounded-full" />

                       </div>

                    </div>



                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center text-center p-10 animate-in fade-in duration-700 delay-500">

                       <div className="h-20 w-20 bg-blue-500 rounded-full flex items-center justify-center text-white mb-6 animate-bounce shadow-2xl">

                          <Send size={40} />

                       </div>

                       <h3 className="text-white font-black uppercase tracking-[0.2em] text-sm">Uploading Assets...</h3>

                       <p className="text-white/40 text-[9px] font-bold uppercase mt-2">Connecting to Instagram Graph API</p>

                       <div className="mt-8 w-full h-1 bg-white/10 rounded-full overflow-hidden">

                          <div className="h-full bg-blue-500 animate-[shimmer_2s_infinite]" style={{ width: '100%' }} />

                       </div>

                    </div>

                 </div>

              </div>

              <p className="mt-12 text-sm font-black text-gray-900 tracking-[0.3em] uppercase animate-pulse">Syncing Social Hooks</p>

           </div>

        )}



        {step === 'done' && (

           <div className="h-[700px] flex flex-col items-center justify-center space-y-8 animate-in zoom-in-95 duration-700">

              <div className="h-32 w-32 bg-green-100 rounded-full flex items-center justify-center text-green-600 shadow-2xl shadow-green-100 border-4 border-white">

                 <CheckCircle2 size={64} />

              </div>

              <div className="text-center space-y-3">

                 <h2 className="text-4xl font-black text-gray-900 tracking-tighter">Campaign Successfully Deployed!</h2>

                 <p className="text-gray-500 font-medium max-w-md mx-auto leading-relaxed text-sm">Spire AI has published your creative and caption to Instagram, Facebook, and Google My Business.</p>

              </div>

              <div className="flex gap-4 pt-4">

                 <button onClick={() => { setStep('upload'); setUpload(null); }} className="px-10 py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all hover:bg-black active:scale-95">Start New Campaign</button>

                 <button onClick={() => { setStep('upload'); setUpload(null); }} className="px-10 py-4 bg-white border-2 border-gray-100 text-gray-900 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-50 transition-all active:scale-95">Go to Dashboard</button>

              </div>

           </div>

        )}

      </div>



      <div className="space-y-6">

        <div className="bg-[#F0FDF4] p-6 rounded-3xl border border-[#DCFCE7] space-y-4">

           <div className="flex items-center gap-2 text-green-700">

              <TrendingUp size={18} />

              <p className="text-[10px] font-black uppercase tracking-widest">Spike detected from previous Public Holiday traffic.</p>

           </div>

           <div className="flex items-center justify-between">

              <div>

                 <p className="text-[10px] font-black text-gray-400 uppercase">REVENUE IMPACT</p>

                 <p className="text-lg font-black text-green-700">+35% revenue</p>

              </div>

              <div className="text-right">

                 <p className="text-[10px] font-black text-gray-400 uppercase">SIGNALS</p>

                 <p className="text-[10px] font-bold text-gray-700 uppercase">Rainy • Public Holiday</p>

              </div>

           </div>

           <button className="w-full bg-[#166534] text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-100">Apply Now</button>

        </div>



        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm space-y-6">

           <div className="flex items-center justify-between">

              <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">OPERATIONAL PULSE</h3>

              <span className="text-[9px] font-bold text-gray-400">Updated 06:48 PM</span>

           </div>

           <div className="space-y-3">

              {[

                { name: "Monsoon Special", desc: "₹50 OFF on all Biryani", status: "Active", color: "text-green-600 bg-green-50" },

                { name: "Lassi Combo", desc: "Buy 2 Get 1 Free", status: "Scheduled", color: "text-blue-600 bg-blue-50" }

              ].map((p, i) => (

                <div key={i} className="flex items-center justify-between p-4 rounded-2xl border border-gray-50 bg-gray-50/50">

                   <div>

                      <p className="text-xs font-black text-gray-900">{p.name}</p>

                      <p className="text-[10px] font-medium text-gray-500">{p.desc}</p>

                   </div>

                   <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${p.color}`}>{p.status}</span>

                </div>

              ))}

              <button className="w-full border-2 border-dashed border-[#FFCDD2] text-[#E53935] py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all">+ New Promotion</button>

           </div>

        </div>



        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm space-y-6">

           <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">CAMPAIGN PERFORMANCE</h3>

           <div className="space-y-4">

              <div className="flex items-end justify-between">

                 <div>

                    <p className="text-2xl font-black text-gray-900">12.4k</p>

                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">TOTAL IMPRESSIONS</p>

                 </div>

                 <div className="text-right">

                    <p className="text-xs font-black text-green-600 flex items-center gap-1">↑ 24%</p>

                    <p className="text-[9px] font-bold text-gray-400 uppercase">vs last week</p>

                 </div>

              </div>

              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">

                 <div className="h-full bg-[#E53935] w-[70%]" />

              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">

                 <div>

                    <p className="text-sm font-black text-gray-900">842</p>

                    <p className="text-[9px] font-black text-gray-400 uppercase">CONVERSIONS</p>

                 </div>

                 <div className="text-right">

                    <p className="text-sm font-black text-gray-900">₹1.2k</p>

                    <p className="text-[9px] font-black text-gray-400 uppercase">AD SPEND</p>

                 </div>

              </div>

           </div>

        </div>

      </div>

    </div>

  );

}



export function Pricing() {

  const plans = [

    {

      name: "Starter Plan",

      dayPrice: "100",

      monthPrice: "2,999",

      features: ["POS Billing", "Basic Inventory", "Captain Analytics"],

      color: "border-gray-200",

      btn: "bg-gray-900 text-white"

    },

    {

      name: "Growth Plan",

      dayPrice: "200",

      monthPrice: "5,999",

      features: ["Everything in Starter", "Marketing AI", "Smart Pricing Engine"],

      color: "border-[#B71C1C] ring-4 ring-red-50 shadow-2xl",

      popular: true,

      btn: "bg-[#B71C1C] text-white"

    },

    {

      name: "Pro Plan",

      dayPrice: "333",

      monthPrice: "9,999",

      features: ["Everything in Growth", "Surveillance AI", "Swiggy & Zomato Integration"],

      color: "border-gray-200",

      btn: "bg-gray-900 text-white"

    }

  ];



  return (

    <div className="py-8 px-4 font-sans">

      <div className="text-center mb-16">

        <h2 className="text-4xl font-black text-gray-900 tracking-tighter mb-4">Enterprise-Grade Scalability</h2>

        <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-xs">Transparent Pricing for Modern Restaurants</p>

      </div>



      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">

        {plans.map((plan, i) => (

          <div key={i} className={`relative bg-white rounded-[40px] border-2 p-10 flex flex-col transition-all duration-500 hover:translate-y-[-12px] ${plan.color}`}>

            {plan.popular && (

              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#B71C1C] text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-100">

                Most Popular

              </div>

            )}

            <h3 className="text-xl font-black text-gray-900 mb-4">{plan.name}</h3>

            <div className="flex flex-col mb-10">

              <div className="flex items-baseline gap-1">

                <span className="text-5xl font-black text-gray-900 tracking-tighter">₹{plan.dayPrice}</span>

                <span className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">/ Day</span>

              </div>

              <p className="text-sm font-medium text-gray-400 mt-2">₹{plan.monthPrice} / Month</p>

            </div>



            <div className="space-y-4 mb-12 flex-grow">

              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">What's included:</p>

              {plan.features.map((f, j) => (

                <div key={j} className="flex items-center gap-3">

                  <div className="h-5 w-5 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">

                    <Check size={12} strokeWidth={4} />

                  </div>

                  <span className="text-sm font-bold text-gray-700">{f}</span>

                </div>

              ))}

            </div>



            <button className={`w-full py-4 rounded-[20px] font-black uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95 shadow-lg ${plan.btn}`}>

              Select {plan.name.split(' ')[0]}

            </button>

          </div>

        ))}

      </div>



      <div className="mt-20 text-center">

        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Trusted by 2,400+ restaurants globally</p>

        <div className="mt-4 flex justify-center gap-8 opacity-30 grayscale contrast-150">

           {/* Mock Brand Logos */}

           <div className="h-6 w-24 bg-gray-400 rounded-md" />

           <div className="h-6 w-24 bg-gray-400 rounded-md" />

           <div className="h-6 w-24 bg-gray-400 rounded-md" />

        </div>

      </div>

    </div>

  );

}



export function BarTables() {

  const [activePopupTableId, setActivePopupTableId] = useState(null);

  const { tables } = useBarTableSync();

  const [staffMap, setStaffMap] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/staff`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const map = {};
        (Array.isArray(data) ? data : []).forEach(s => { if (s.id && s.name) map[s.id] = s.name; });
        setStaffMap(map);
      })
      .catch(() => {});
  }, []);

  return (

    <div className="space-y-4 font-sans">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        <h3 className="font-semibold">Floor Plan — Bar Hall</h3>

        <span className="text-[11px] font-black text-[#B71C1C] uppercase tracking-widest bg-[#FFF5F5] px-3 py-1.5 rounded-full">

          🍺 Bar • {tables.filter(t => t.status !== 'Free').length} Occupied / {tables.length} Total

        </span>

      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">

        {tables.map((t) => {

          const isFree = !t.status || t.status === 'Free';

          let bgClass = "bg-[#E8F5E9] text-[#1B5E20]";

          if (t.status === 'Waiting Bill') bgClass = "bg-[#FFEBEE] text-[#B71C1C] border-[#E53935] animate-pulse";

          else if (t.status === 'Preparing') bgClass = "bg-[#FFF8E1] text-[#F57F17] border-[#F57F17]";

          else if (!isFree) bgClass = "bg-[#FFF8E1] text-[#F57F17] border-[#F57F17]";



          return (

            <button

              key={t.backendId || t.id}

              onClick={() => {

                if (!isFree) {

                  setActivePopupTableId(t.backendId || t.id);

                }

              }}

              className={`${bgClass} rounded-2xl border-2 min-h-[100px] p-3 text-left transition-all active:scale-95 flex flex-col justify-between`}

            >

              <div className="flex justify-between items-start w-full">

                <p className="text-xl font-black leading-none">B{t.number ?? t.id}</p>

                {!isFree && (

                  <span className="text-[9px] font-black uppercase bg-white/20 px-1.5 py-0.5 rounded">

                    {formatTableTime(t.time)}

                  </span>

                )}

              </div>

              <p className="text-[11px] font-bold mt-2">

                {isFree ? 'Available' : `${t.status} — ₹${t.currentBill || 0}`}

              </p>

            </button>

          );

        })}

      </div>

      

      {/* LIVE SESSION DETAILS POPUP */}

      {activePopupTableId && (() => {

        const pTable = tables.find(t => (t.backendId || t.id) === activePopupTableId);

        if (!pTable || !pTable.status || pTable.status === 'Free') {

           setTimeout(() => setActivePopupTableId(null), 0);

           return null;

        }

        

        const rawItems = (pTable.activeOrder?.items?.length > 0)
          ? pTable.activeOrder.items
          : (pTable.kotHistory && pTable.kotHistory.length > 0)
            ? pTable.kotHistory.flatMap(k => k.items || [])
            : (pTable.items || []);
        const pItems = rawItems.map(i => ({
          q: i.q ?? i.quantity ?? 1,
          n: i.n ?? i.name ?? 'Item',
          s: i.s ?? i.status ?? 'Sent',
        }));

        const pCount = pItems.reduce((sum, i) => sum + Number(i.q || 0), 0);

        const pCaptainName = pTable.captainName || staffMap[pTable.captainId] || 'Staff';

        

        return (

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in duration-200" onClick={() => setActivePopupTableId(null)}>

            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>

               <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">

                  <div className="flex items-center gap-3">

                     <div className={`w-3 h-3 rounded-full ${pTable.status === 'Waiting Bill' ? 'bg-amber-500 animate-pulse' : pTable.status === 'Preparing' ? 'bg-orange-500' : 'bg-red-600'}`} />

                     <h3 className="font-black text-lg text-gray-900 tracking-tight">Table B{pTable.number ?? pTable.id}</h3>

                     <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-gray-200 text-gray-700">{pTable.status}</span>

                  </div>

                  <button onClick={() => setActivePopupTableId(null)} className="p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 rounded-lg transition-colors">

                     <X size={18} />

                  </button>

               </div>

               

               <div className="p-5">

                  <div className="flex items-center justify-between mb-5">

                     <div className="flex flex-col gap-0.5">

                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Assigned Captain</span>

                        <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><User size={14} className="text-gray-400"/> {pCaptainName}</span>

                     </div>

                     <div className="flex gap-4 text-right">

                        <div className="flex flex-col gap-0.5">

                           <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Guests</span>

                           <span className="text-sm font-bold text-gray-900 flex items-center gap-1 justify-end"><Users size={14} className="text-gray-400"/> {pTable.guests || 0}</span>

                        </div>

                        <div className="flex flex-col gap-0.5">

                           <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Duration</span>

                           <span className="text-sm font-bold text-gray-900 flex items-center gap-1 justify-end"><Clock size={14} className="text-gray-400"/> {formatTableTime(pTable.time)}</span>

                        </div>

                     </div>

                  </div>



                  <div className="mb-5">

                     <div className="flex items-center justify-between mb-2">

                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Active Order ({pCount} Items)</span>

                        <span className="text-[10px] font-black uppercase text-green-600 tracking-widest">{(pTable.kotHistory || []).length} KOTs</span>

                     </div>

                     

                     <div className="bg-gray-50 border border-gray-100 rounded-xl p-1 max-h-48 overflow-y-auto custom-scrollbar">

                        {pItems.length > 0 ? pItems.map((item, idx) => (

                           <div key={idx} className="flex items-center justify-between p-2 hover:bg-white rounded-lg transition-colors border-b border-transparent hover:border-gray-100">

                              <div className="flex items-center gap-3">

                                 <div className="w-6 h-6 rounded bg-white border border-gray-200 flex items-center justify-center text-[10px] font-black text-gray-700">{item.q}x</div>

                                 <span className="text-[12px] font-bold text-gray-800">{item.n}</span>

                              </div>

                              <span className="text-[10px] font-black uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{item.s || 'Sent'}</span>

                           </div>

                        )) : (

                           <div className="text-center py-4 text-xs font-bold text-gray-400">No items submitted yet</div>

                        )}

                     </div>

                  </div>



                  <div className="pt-4 border-t border-gray-100 flex items-end justify-between">

                     <div className="flex flex-col gap-1">

                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Live Running Total</span>

                        <span className="text-xs font-bold text-gray-500">Including Taxes (5% GST)</span>

                     </div>

                     <span className="text-2xl font-black text-[#E53935] tracking-tight">₹{pTable.currentBill || 0}</span>

                  </div>

               </div>

            </div>

          </div>

        );

      })()}

    </div>

  );

}



export function BarMenuPage() {

  const { menuItems: legacyMenuItems, loading: legacyLoading, error: legacyError, refreshMenu: legacyRefreshMenu } = useBarMenuSync();

  const { restaurant } = useAuth();

  const [unifiedMenu, setUnifiedMenu] = useState(null);

  const [unifiedLoading, setUnifiedLoading] = useState(true);

  const [barMenuTab, setBarMenuTab] = useState('food');

  const [activeVenueId, setActiveVenueId] = useState(null);

  const [filter, setFilter] = useState('');

  const [showUploadModal, setShowUploadModal] = useState(false);

  const [showHiddenVenueItems, setShowHiddenVenueItems] = useState(false);

  const [uploadSessionId] = useState(() => crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));



  // ── Dynamic categories for bar menu ────────────────────────────────────

  const [dbCategories, setDbCategories] = useState([]);

  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [showAddNewCatInline, setShowAddNewCatInline] = useState(false);

  const [newCatInline, setNewCatInline] = useState('');



  const fetchBarCategories = useCallback(async () => {

    try {

      setCategoriesLoading(true);

      const res = await fetch(`${API_BASE}/api/menu/categories`);

      if (!res.ok) throw new Error('Failed to fetch categories');

      const data = await res.json();

      setDbCategories(Array.isArray(data) ? data.filter(c => c.isActive !== false) : []);

    } catch (err) {

      console.error('[BarMenuPage] Failed to load categories:', err);

    } finally {

      setCategoriesLoading(false);

    }

  }, []);



  useEffect(() => {

    Promise.resolve().then(() => fetchBarCategories());

  }, [fetchBarCategories]);



  const handleAddNewCatInline = async () => {

    if (!newCatInline.trim()) return;

    try {

      const res = await fetch(`${API_BASE}/api/menu/categories`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify({ name: newCatInline.trim() }),

      });

      if (!res.ok) {

        const err = await res.json();

        throw new Error(err.error || 'Failed to create category');

      }

      const created = await res.json();

      await fetchBarCategories();

      setAddCategory(created.name);

      setShowAddNewCatInline(false);

      setNewCatInline('');

    } catch (err) {

      alert(err.message);

    }

  };



  // ── Venue/section resolution from actual tenant venues (bar-only) ──

  const { venueColumns } = useVenueSections('bar');



  useEffect(() => {

    if (venueColumns.length === 0) return;

    const exists = venueColumns.some((c) => c.id === activeVenueId);

    if (!exists) Promise.resolve().then(() => setActiveVenueId(venueColumns[0].id));

  }, [venueColumns, activeVenueId]);



  // Fetch unified menu for bar

  useEffect(() => {

    Promise.resolve().then(() => setUnifiedLoading(true));

    fetchUnifiedMenu('bar')

      .then(data => {

        setUnifiedMenu(data);

        setUnifiedLoading(false);

      })

      .catch(err => {

        console.error('[BarMenuPage] Failed to fetch unified menu:', err);

        setUnifiedLoading(false);

      });

  }, []);



  const refreshMenu = useCallback(() => {

    setUnifiedLoading(true);

    fetchUnifiedMenu('bar')

      .then(data => {

        setUnifiedMenu(data);

        setUnifiedLoading(false);

      })

      .catch(err => {

        console.error('[BarMenuPage] Failed to refresh unified menu:', err);

        setUnifiedLoading(false);

        legacyRefreshMenu();

      });

  }, [legacyRefreshMenu]);



  // Listen for menu update events to refresh admin panel

  useEffect(() => {

    const handleMenuUpdate = () => {

      console.log('[BarMenuPage] Received menu-item-updated, refreshing...');

      refreshMenu();

    };



    window.addEventListener('menu-item-updated', handleMenuUpdate);

    return () => {

      window.removeEventListener('menu-item-updated', handleMenuUpdate);

    };

  }, [refreshMenu]);



  // Derive menu items from unified menu

  const menuItems = useMemo(() => {

    if (unifiedMenu && unifiedMenu.categories) {

      const items = [];

      unifiedMenu.categories.forEach(cat => {

        cat.items.forEach(item => {

          items.push({

            id: item.id,

            n: item.name,

            p: Math.round(item.price),

            c: item.category,

            t: item.isVeg ? 'veg' : 'non',

            img: item.image || '/placeholder.svg',

            desc: item.description || '',

            menuType: item.menuType,

            isAvailable: item.isActive,

            variants: item.variants?.map(v => ({...v, price: Number(v.price)})),

            printerTarget: item.printerTarget,

            unit: item.unit,

            mlPerUnit: item.mlPerUnit,

            venuePrices: item.venuePrices || {}

          });

        });

      });

      return items;

    }

    return legacyMenuItems;

  }, [unifiedMenu, legacyMenuItems]);



  const loading = unifiedLoading || legacyLoading;

  const error = legacyError;



  // Edit modal state

  const [editItem, setEditItem] = useState(null);

  const [editName, setEditName] = useState('');

  const [editType, setEditType] = useState('veg');

  const [editPrice, setEditPrice] = useState('');

  const [editImg, setEditImg] = useState(null);

  const [editSaving, setEditSaving] = useState(false);

  const [editVenuePrices, setEditVenuePrices] = useState({});



  // Add modal state

  const [showAdd, setShowAdd] = useState(false);

  const [addName, setAddName] = useState('');

  const [addCategory, setAddCategory] = useState('');

  const [addType, setAddType] = useState('veg');

  const [addPrice, setAddPrice] = useState('');

  const [addMenuType, setAddMenuType] = useState('FOOD');

  const [addImg, setAddImg] = useState(null);        // raw File object

  const [addImgPreview, setAddImgPreview] = useState(''); // object URL for preview

  const [addUploading, setAddUploading] = useState(false); // true while Cloudinary upload in-flight

  const [addSaving, setAddSaving] = useState(false);

  const [addVenuePrices, setAddVenuePrices] = useState({});



  // Delete state

  const [deleteTarget, setDeleteTarget] = useState(null);

  const [deleteWorking, setDeleteWorking] = useState(false);



  // Toast

  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {

    setToast({ msg, type });

    setTimeout(() => setToast(null), 2800);

  };



  const filteredItems = useMemo(() => {

    const typeFilter = barMenuTab === 'food' ? 'FOOD' : 'LIQUOR';

    return menuItems.filter(

      (item) =>

        item.menuType === typeFilter &&

        (!filter || item.n.toLowerCase().includes(filter.toLowerCase())) &&

        (venueColumns.length <= 1 || showHiddenVenueItems || Number(item.venuePrices?.[activeVenueId] || 0) > 0)

    );

  }, [menuItems, barMenuTab, filter, venueColumns, activeVenueId, showHiddenVenueItems]);



  // Image resize helper (canvas → base64)

  const compressImage = (file, cb) => {

    const reader = new FileReader();

    reader.onload = (e) => {

      const img = new window.Image();

      img.onload = () => {

        const MAX = 400;

        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);

        const canvas = document.createElement('canvas');

        canvas.width = img.width * ratio;

        canvas.height = img.height * ratio;

        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        cb(canvas.toDataURL('image/jpeg', 0.7));

      };

      img.src = e.target.result;

    };

    reader.readAsDataURL(file);

  };



  // Open edit modal

  const openEdit = (item) => {

    setEditItem(item);

    setEditName(item.n);

    setEditType(item.t || 'veg');

    setEditPrice(item.variants.length === 1 ? String(item.variants[0].price) : '');

    setEditImg(item.img || null);

    setEditVenuePrices({ ...(item.venuePrices || {}) });

  };






  const saveEdit = async () => {

    if (!editName.trim()) return;

    setEditSaving(true);



    let imageUrl = undefined;

    if (editImg && editImg.startsWith('data:')) {

      // New local file picked — upload to Cloudinary first

      try {

        imageUrl = await uploadImageToCloudinary(editImg, editName);

      } catch {

        showToast('Image upload failed', 'error');

        setEditSaving(false);

        return;

      }

    }

    // If editImg is an existing https URL — skip (don't re-upload)

    // If editImg is null — skip (don't touch imageUrl)



    const patch = { n: editName.trim(), t: editType };

    if (editPrice !== '') patch.p = Number(editPrice);

    if (imageUrl !== undefined) patch.img = imageUrl;

    patch.venuePrices = Object.fromEntries(

      venueColumns.map((venue) => [venue.id, Number(editVenuePrices[venue.id] || 0)])

    );



    updateBarMenuItem(editItem.id, patch, API_BASE);

    setEditSaving(false);

    setEditItem(null);

    showToast('Item updated');

  };





  // Availability toggle

  const toggleAvailability = (item) => {

    const hasMultiVenue = venueColumns.length > 1 && activeVenueId;

    const venueAvail = item.venueAvailabilities?.[activeVenueId] !== false;

    const isVenueScope = hasMultiVenue && item.isAvailable !== false;

    toggleBarMenuAvailability(

      item.id,

      API_BASE,

      () => showToast((isVenueScope ? !venueAvail : item.isAvailable === false) ? 'Item enabled' : 'Item disabled'),

      () => showToast('Toggle failed', 'error'),

      isVenueScope ? activeVenueId : null

    );

  };



  // Delete

  const confirmDelete = async () => {

    if (!deleteTarget || deleteWorking) return; // guard double-tap

    setDeleteWorking(true);

    try {

      const res = await fetch(`${API_BASE}/api/bar/menu/items/${deleteTarget.id}`, { method: 'DELETE', headers: getAuthHeaders() });

      if (res.ok) { showToast('Item deleted'); refreshMenu(); }

      else showToast('Delete failed', 'error');

    } catch { showToast('Delete failed', 'error'); }

    setDeleteWorking(false);

    setDeleteTarget(null);

  };



  // Add item

  const resetAddModal = () => {

    setShowAdd(false);

    setAddName('');

    setAddCategory('');

    setAddPrice('');

    setAddImg(null);

    setAddImgPreview('');

    setAddVenuePrices({});

  };



  const saveAdd = async () => {

    if (!addName.trim() || !addPrice) return;

    setAddSaving(true);

    try {

      // Step 1: if a file was picked, compress then upload to Cloudinary via backend proxy

      let imageUrl = '';

      if (addImg) {

        setAddUploading(true);

        try {

          // Compress to base64 first (reuse existing helper)

          const base64 = await new Promise((resolve) => {

            compressImage(addImg, (b64) => resolve(b64));

          });

          // Upload via backend proxy (same as Edit modal)

          imageUrl = await uploadImageToCloudinary(base64, addName);

        } catch {

          showToast('Image upload failed', 'error');

          setAddUploading(false);

          setAddSaving(false);

          return;

        }

        setAddUploading(false);

      }



      // Step 2: POST with the CDN imageUrl (or empty string if no image)

      const body = {

        name: addName.trim(),

        category: addCategory.trim() || 'General',

        isVeg: addType === 'veg',

        price: Number(addPrice),

        menuType: addMenuType,

        ...(imageUrl ? { imageUrl } : {}),

        venuePrices: Object.fromEntries(

          venueColumns.map((venue) => [venue.id, Number(addVenuePrices[venue.id] || 0)])

        ),

      };

      const res = await fetch(`${API_BASE}/api/bar/menu/items`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },

        body: JSON.stringify(body),

      });

      if (res.ok) { showToast('Item added'); refreshMenu(); resetAddModal(); }

      else showToast('Add failed', 'error');

    } catch { showToast('Add failed', 'error'); }

    setAddSaving(false);

  };



  if (loading) return (

    <div className="flex items-center justify-center py-20">

      <div className="w-6 h-6 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />

    </div>

  );



  return (

    <div className="space-y-4 font-sans">

      {/* Toast */}

      {toast && (

        <div className={`fixed top-4 right-4 z-[9999] px-4 py-2 rounded-xl text-white text-[12px] font-bold shadow-lg transition-all ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>

          {toast.msg}

        </div>

      )}



      {/* Header */}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        <h3 className="font-semibold">Bar Menu</h3>

        <div className="flex items-center gap-2 flex-wrap">

          <div className="flex rounded-lg border border-gray-200 overflow-hidden">

            {['food', 'liquor'].map((tab) => (

              <button

                key={tab}

                onClick={() => setBarMenuTab(tab)}

                className={`px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${

                  barMenuTab === tab ? 'bg-[#E53935] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'

                }`}

              >

                {tab}

              </button>

            ))}

          </div>

          <input

            value={filter}

            onChange={(e) => setFilter(e.target.value)}

            placeholder="Search..."

            className="border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] font-bold w-40 focus:outline-none focus:border-[#E53935]"

          />

          <button

            onClick={() => setShowAdd(true)}

            className="px-3 py-1.5 bg-[#E53935] text-white text-[12px] font-bold rounded-xl hover:bg-red-700 transition"

          >

            + Add Item

          </button>

          <button

            onClick={() => setShowUploadModal(true)}

            className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[12px] font-bold rounded-xl hover:bg-gray-50 transition flex items-center gap-1.5"

          >

            <Upload size={14} className="text-gray-500" /> Upload Menu

          </button>

        </div>

      </div>





      {venueColumns.length > 1 && (

        <div className="mb-3 flex flex-col gap-2">

          <div className="flex flex-wrap gap-2">

            {venueColumns.map((venue) => (

              <button

                key={venue.id}

                type="button"

                onClick={() => setActiveVenueId(venue.id)}

                className={`rounded-lg border px-3 py-2 text-xs font-black uppercase transition ${

                  activeVenueId === venue.id

                    ? 'border-[#E53935] bg-[#E53935] text-white'

                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'

                }`}

              >

                {venue.label}

              </button>

            ))}

          </div>

          <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500">

            <input

              type="checkbox"

              checked={showHiddenVenueItems}

              onChange={(e) => setShowHiddenVenueItems(e.target.checked)}

              className="accent-[#E53935]"

            />

            Show items hidden from {venueColumns.find(v => v.id === activeVenueId)?.label || 'this venue'}

          </label>

        </div>

      )}



      {error && (

        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[12px] text-red-600 font-bold">

          {error} — <button onClick={refreshMenu} className="underline">Retry</button>

        </div>

      )}



      {/* Item list */}

      <div className="space-y-1">

        {filteredItems.map((item) => (

          <div

            key={item.id}

            className={`flex items-center justify-between p-3 bg-white rounded-xl border transition ${(() => {
              const venueAvail = venueColumns.length > 1
                ? (item.isAvailable !== false && item.venueAvailabilities?.[activeVenueId] !== false)
                : item.isAvailable !== false;
              return venueAvail ? 'border-gray-100' : 'border-gray-200 opacity-60';
            })()}`}

          >

            {/* Left */}

            <div className="flex items-center gap-3">

              {item.img ? (

                <img src={item.img} alt={item.n} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />

              ) : item.menuType === 'FOOD' ? (

                <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${item.t === 'veg' ? 'border-green-600 bg-green-100' : 'border-red-600 bg-red-100'}`} />

              ) : (

                <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-150 flex items-center justify-center flex-shrink-0">

                  <GlassWater size={16} className="text-gray-400" />

                </div>

              )}

              <div>

                <p className="text-[13px] font-bold text-gray-900">{item.n}</p>

                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{item.c}</p>

              </div>

            </div>



            {/* Right */}

            <div className="flex items-center gap-2">

              {item.variants.length === 1 ? (

                <p className="text-[13px] font-black text-gray-900">

                  {venueColumns.length > 1 && Number(item.venuePrices?.[activeVenueId] || 0) > 0

                    ? `₹${item.venuePrices[activeVenueId]}`

                    : `₹${item.variants[0].price}`}

                </p>

              ) : (

                <div className="flex flex-wrap gap-1 justify-end max-w-[140px]">

                  {item.variants.map((v) => (

                    <span key={v.id} className="text-[10px] font-bold bg-gray-100 px-2 py-0.5 rounded-full text-gray-700">

                      {v.name}: ₹{v.price}

                    </span>

                  ))}

                </div>

              )}



              {/* Availability toggle */}

              {(() => {

                const venueAvail = venueColumns.length > 1

                  ? (item.isAvailable !== false && item.venueAvailabilities?.[activeVenueId] !== false)

                  : item.isAvailable !== false;

                return (

                  <button

                    onClick={() => toggleAvailability(item)}

                    title={venueAvail ? 'Mark unavailable' : 'Mark available'}

                    className={`text-[11px] px-2 py-0.5 rounded-full font-bold border transition ${venueAvail ? 'border-green-300 text-green-700 bg-green-50' : 'border-gray-300 text-gray-400 bg-gray-50'}`}

                  >

                    {venueAvail ? 'On' : 'Off'}

                  </button>

                );

              })()}



              {/* Edit */}

              <button

                onClick={() => openEdit(item)}

                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition"

                title="Edit"

              >

                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />

                </svg>

              </button>



              {/* Delete */}

              <button

                onClick={() => setDeleteTarget(item)}

                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"

                title="Delete"

              >

                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1m-4 0h10" />

                </svg>

              </button>

            </div>

          </div>

        ))}



        {filteredItems.length === 0 && (

          <p className="text-center text-[12px] text-gray-400 font-bold py-8">No items found</p>

        )}

      </div>



      {/* ── EDIT MODAL ── */}

      {editItem && (

        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">

          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">

            <h4 className="font-bold text-[14px]">Edit Item</h4>



            {/* Image */}

            <div className="flex items-center gap-3">

              {editImg ? (

                <img src={editImg} alt="" className="w-14 h-14 rounded-xl object-cover border" />

              ) : (

                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">

                  {editItem.menuType === 'FOOD' ? <Utensils size={24} /> : <GlassWater size={24} />}

                </div>

              )}

              <label className="cursor-pointer px-3 py-1.5 border border-gray-300 rounded-xl text-[11px] font-bold text-gray-600 hover:border-[#E53935] transition">

                Change Photo

                <input type="file" accept="image/*" className="hidden" onChange={(e) => {

                  if (e.target.files[0]) compressImage(e.target.files[0], setEditImg);

                }} />

              </label>

            </div>



            {/* Name */}

            <div>

              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Name</label>

              <input

                value={editName}

                onChange={(e) => setEditName(e.target.value)}

                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"

              />

            </div>



            {/* Type (food items only) */}

            {editItem.menuType === 'FOOD' && (

              <div>

                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Type</label>

                <div className="flex gap-2 mt-1">

                  {['veg', 'non'].map((t) => (

                    <button

                      key={t}

                      onClick={() => setEditType(t)}

                      className={`flex-1 py-1.5 rounded-xl text-[12px] font-bold border transition ${editType === t ? (t === 'veg' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700') : 'border-gray-200 text-gray-500'}`}

                    >

                      {t === 'veg' ? '🟢 Veg' : '🔴 Non-Veg'}

                    </button>

                  ))}

                </div>

              </div>

            )}



            {/* Price (single-variant only) */}

            {editItem.variants.length === 1 && (

              <div>

                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Base Price (₹)</label>

                <input

                  type="number"

                  value={editPrice}

                  onChange={(e) => setEditPrice(e.target.value)}

                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"

                />

              </div>

            )}



            {editItem.variants.length > 1 && (

              <p className="text-[11px] text-gray-400 font-bold">Multi-variant base pricing — edit from backend. Venue prices below still apply.</p>

            )}



            {/* Venue-specific prices */}

            {venueColumns.length > 1 && (

              <div>

                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Venue Prices (₹)</label>

                <div className="grid grid-cols-2 gap-2 mt-1">

                  {venueColumns.map((venue) => (

                    <div key={venue.id}>

                      <label className="block text-[9px] font-black uppercase text-gray-400 mb-0.5">{venue.label}</label>

                      <input

                        type="number"

                        placeholder="0"

                        value={editVenuePrices[venue.id] ?? ''}

                        onChange={(e) => setEditVenuePrices(prev => ({ ...prev, [venue.id]: e.target.value }))}

                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] font-bold focus:outline-none focus:border-[#E53935]"

                      />

                    </div>

                  ))}

                </div>

                <p className="text-[10px] text-gray-400 mt-1">Set 0 to hide item from a venue.</p>

              </div>

            )}



            <div className="flex gap-2 pt-1">

              <button onClick={() => setEditItem(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-[12px] font-bold text-gray-600 hover:bg-gray-50 transition">Cancel</button>

              <button

                onClick={saveEdit}

                disabled={editSaving || !editName.trim()}

                className="flex-1 py-2 bg-[#E53935] text-white rounded-xl text-[12px] font-bold hover:bg-red-700 disabled:opacity-50 transition"

              >

                {editSaving ? 'Saving...' : 'Save'}

              </button>

            </div>

          </div>

        </div>

      )}



      {/* ── ADD MODAL ── */}

      {showAdd && (

        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">

          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">

            <h4 className="font-bold text-[14px]">Add Bar Item</h4>



            {/* Image */}

            <div className="flex items-center gap-3">

              {addImgPreview ? (

                <img src={addImgPreview} alt="" className="w-14 h-14 rounded-xl object-cover border" />

              ) : (

                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold">Photo</div>

              )}

              <label className="cursor-pointer px-3 py-1.5 border border-gray-300 rounded-xl text-[11px] font-bold text-gray-600 hover:border-[#E53935] transition">

                Upload Photo

                <input type="file" accept="image/*" className="hidden" onChange={(e) => {

                  const file = e.target.files[0];

                  if (file) {

                    setAddImg(file);                               // store raw File for upload

                    setAddImgPreview(URL.createObjectURL(file));   // object URL for instant preview

                  }

                }} />

              </label>

            </div>



            {/* Menu type toggle */}

            <div>

              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Menu Section</label>

              <div className="flex gap-2 mt-1">

                {['FOOD', 'LIQUOR'].map((mt) => (

                  <button key={mt} onClick={() => setAddMenuType(mt)}

                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[12px] font-bold border transition ${addMenuType === mt ? 'border-[#E53935] bg-red-50 text-[#E53935]' : 'border-gray-200 text-gray-500'}`}>

                    {mt === 'FOOD' ? (

                      <>

                        <Utensils size={14} /> Food

                      </>

                    ) : (

                      <>

                        <GlassWater size={14} /> Liquor

                      </>

                    )}

                  </button>

                ))}

              </div>

            </div>



            <div>

              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Name *</label>

              <input value={addName} onChange={(e) => setAddName(e.target.value)}

                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"

                placeholder="e.g. Chicken Tikka" />

            </div>



            <div>

              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Category</label>

              <select

                value={addCategory}

                onChange={(e) => {

                  if (e.target.value === '__new__') {

                    setShowAddNewCatInline(true);

                  } else {

                    setAddCategory(e.target.value);

                    setShowAddNewCatInline(false);

                  }

                }}

                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935] bg-white"

                disabled={categoriesLoading}

              >

                <option value="">{categoriesLoading ? 'Loading...' : 'Select a category'}</option>

                {dbCategories.map(cat => (

                  <option key={cat.id} value={cat.name}>{cat.name}</option>

                ))}

                <option value="__new__">+ Add new category…</option>

              </select>

              {showAddNewCatInline && (

                <div className="mt-2 flex items-center gap-2">

                  <input

                    autoFocus

                    value={newCatInline}

                    onChange={(e) => setNewCatInline(e.target.value)}

                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddNewCatInline(); }}

                    placeholder="New category name..."

                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"

                  />

                  <button

                    onClick={handleAddNewCatInline}

                    disabled={!newCatInline.trim()}

                    className="px-3 py-2 bg-[#E53935] text-white rounded-xl text-xs font-bold hover:bg-[#B71C1C] disabled:opacity-50"

                  >

                    Add

                  </button>

                </div>

              )}

            </div>



            {addMenuType === 'FOOD' && (

              <div>

                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Type</label>

                <div className="flex gap-2 mt-1">

                  {['veg', 'non'].map((t) => (

                    <button key={t} onClick={() => setAddType(t)}

                      className={`flex-1 py-1.5 rounded-xl text-[12px] font-bold border transition ${addType === t ? (t === 'veg' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700') : 'border-gray-200 text-gray-500'}`}>

                      {t === 'veg' ? '🟢 Veg' : '🔴 Non-Veg'}

                    </button>

                  ))}

                </div>

              </div>

            )}



            <div>

              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Price (₹) *</label>

              <input type="number" value={addPrice} onChange={(e) => setAddPrice(e.target.value)}

                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"

                placeholder="0" />

            </div>



            {/* Venue-specific prices */}

            {venueColumns.length > 1 && (

              <div>

                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Venue Prices (₹)</label>

                <div className="grid grid-cols-2 gap-2 mt-1">

                  {venueColumns.map((venue) => (

                    <div key={venue.id}>

                      <label className="block text-[9px] font-black uppercase text-gray-400 mb-0.5">{venue.label}</label>

                      <input

                        type="number"

                        placeholder="0"

                        value={addVenuePrices[venue.id] ?? ''}

                        onChange={(e) => setAddVenuePrices(prev => ({ ...prev, [venue.id]: e.target.value }))}

                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] font-bold focus:outline-none focus:border-[#E53935]"

                      />

                    </div>

                  ))}

                </div>

                <p className="text-[10px] text-gray-400 mt-1">Set 0 to hide item from a venue.</p>

              </div>

            )}



            <div className="flex gap-2 pt-1">

              <button onClick={resetAddModal} disabled={addSaving || addUploading} className="flex-1 py-2 border border-gray-200 rounded-xl text-[12px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition">Cancel</button>

              <button onClick={saveAdd} disabled={addSaving || addUploading || !addName.trim() || !addPrice}

                className="flex-1 py-2 bg-[#E53935] text-white rounded-xl text-[12px] font-bold hover:bg-red-700 disabled:opacity-50 transition">

                {addUploading ? 'Uploading image...' : addSaving ? 'Adding...' : 'Add Item'}

              </button>

            </div>

          </div>

        </div>

      )}



      {/* ── DELETE CONFIRM ── */}

      {deleteTarget && (

        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">

          <div className="bg-white rounded-2xl p-5 w-full max-w-xs space-y-4 shadow-2xl text-center">

            <div className="text-3xl">🗑️</div>

            <p className="font-bold text-[14px]">Remove "{deleteTarget.n}"?</p>

            <p className="text-[12px] text-gray-500">This item will be hidden from all menus.</p>

            <div className="flex gap-2">

              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-[12px] font-bold text-gray-600 hover:bg-gray-50 transition">Cancel</button>

              <button onClick={confirmDelete} disabled={deleteWorking}

                className="flex-1 py-2 bg-red-600 text-white rounded-xl text-[12px] font-bold hover:bg-red-700 disabled:opacity-50 transition">

                {deleteWorking ? 'Deleting...' : 'Delete'}

              </button>

            </div>

          </div>

        </div>

      )}

      {showUploadModal && (

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in">

          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">

            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">

              <h3 className="font-black text-lg text-gray-900 tracking-tight">Upload Bar Menu (PDF / Excel / CSV)</h3>

              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>

            </div>

            <div className="p-5 overflow-y-auto">

              <MenuUpload

                onboardingMode={false}

                restaurantType={restaurant?.restaurantType}

                existingCategories={dbCategories.map(c => c.name)}

                sessionId={uploadSessionId}

                targetVenueId={activeVenueId}

                onImported={() => { refreshMenu(); setShowUploadModal(false); }}

              />

            </div>

          </div>

        </div>

      )}

    </div>

  );

}



export function StaffManagement({ role }) {

  const isManagerReadOnly = role === 'manager';

  const DESIGNATIONS = [
    'helper', 'cleaning', 'master', 'assistant', 'family cleaning', 'washroom cleaning', 'supervisor',
    'delivery and supervisor', 'arcel counter', 'store', 'family counter', 'bar counter', 'pick up', 'kitchen',
    'parcel counter', 'accountans', 'manager', 'security', 'site security', 'purchase', 'electrician', 'counter',
    'waiter', 'family', 'bar', 'bar cleaning'
  ];

  const [staff, setStaff] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);

  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({ name: '', role: 'CAPTAIN', designation: '', pin: '', email: '', password: '', baseSalary: '', permissions: {} });

  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [editedProposed, setEditedProposed] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');



  const fetchStaff = useCallback(async () => {

    setLoading(true);

    try {

      const data = await apiFetch('/api/auth/staff');

      setStaff(data || []);

    } catch (err) {

      setError(err.message || 'Failed to load staff');

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    Promise.resolve().then(() => fetchStaff());

  }, [fetchStaff]);



  const resetForm = () => {

    setForm({ name: '', role: 'CAPTAIN', designation: '', pin: '', email: '', password: '', baseSalary: '', permissions: {} });

    setEditing(null);

    setModalOpen(false);

  };

  const handleAccessDenied = () => alert('You don\'t have access, contact admin');

  const handleEdit = (member) => {
    if (isManagerReadOnly) return handleAccessDenied();
    setEditing(member);
    setForm({ name: member.name, role: member.role, designation: member.designation || member.role, pin: '', permissions: member.permissions || {} });
    setModalOpen(true);
  };

  const handleDeactivateWithCheck = (id) => {
    if (isManagerReadOnly) return handleAccessDenied();
    handleDeactivate(id);
  };



  const handleSave = async () => {

    if (!form.name.trim()) return;
    if (form.role !== 'OWNER' && form.pin && form.pin.length !== 4) return;
    if (form.role === 'OWNER' && form.email?.trim() && !form.password?.trim()) return;

    setSaving(true);

    try {

      const path = `/api/auth/staff${editing ? `/${editing.id}` : ''}`;

      const method = editing ? 'PATCH' : 'POST';

      const body = editing

        ? { name: form.name, designation: form.designation, ...(form.pin ? { pin: form.pin } : {}), permissions: { onlineOrders: !!form.permissions?.onlineOrders } }

        : form.role === 'OWNER'

        ? { name: form.name, role: form.role, email: form.email, password: form.password, baseSalary: form.baseSalary ? Number(form.baseSalary) : 0, designation: form.designation }

        : { name: form.name, role: form.role, pin: form.pin, baseSalary: form.baseSalary ? Number(form.baseSalary) : 0, designation: form.designation };

      await apiFetch(path, { method, body: JSON.stringify(body) });

      fetchStaff();

      resetForm();

    } catch (err) {

      setError(err.message || 'Failed to save');

    } finally {

      setSaving(false);

    }

  };



  const handleDeactivate = async (id) => {

    if (!confirm('Deactivate this staff member?')) return;

    try {

      await apiFetch(`/api/auth/staff/${id}`, { method: 'DELETE' });

      fetchStaff();

    } catch (err) {

      setError(err.message || 'Failed to deactivate');

    }

  };

  const downloadStaffImportTemplate = () => {
    const csv = 'S.NO,NAME,DESIGNATION,SALARY\n1,Manas Kumar,Master,30000\n2,Jitendra,Master,20000\n3,Krishna,Assistant,13000';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStaffImportPreview = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportError('');
    setImportPreview(null);
    setEditedProposed([]);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch(`${API_BASE}/api/payroll/import/preview`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData,
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setImportPreview(data);
      setEditedProposed(data.proposed || []);
    } catch (err) {
      console.error('[Staff] Import preview failed:', err);
      setImportError(err.message || 'Failed to preview import');
    } finally {
      setImportLoading(false);
    }
  };

  const handleStaffImportCommit = async () => {
    const unresolved = editedProposed.filter((r) => r.action === 'ambiguous' || r.action === 'needsReview');
    if (unresolved.length > 0) {
      setImportError(`Please resolve ${unresolved.length} row(s) marked for review before committing.`);
      return;
    }
    setImporting(true);
    setImportError('');
    try {
      const res = await fetch(`${API_BASE}/api/payroll/import/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ rows: editedProposed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Commit failed');
      setImportModalOpen(false);
      setImportFile(null);
      setImportPreview(null);
      setEditedProposed([]);
      fetchStaff();
      alert(`Import complete: ${data.created} created, ${data.updated} updated${data.errors.length ? `, ${data.errors.length} errors` : ''}`);
    } catch (err) {
      console.error('[Staff] Import commit failed:', err);
      setImportError(err.message || 'Failed to commit import');
    } finally {
      setImporting(false);
    }
  };

  const updateProposedRow = (index, field, value) => {
    setEditedProposed((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      if (field === 'baseSalary') row.baseSalary = parseFloat(value) || 0;
      else if (field === 'role') row.role = value;
      else if (field === 'name') row.name = value;
      else if (field === 'staffCode') row.staffCode = value;
      else if (field === 'action') row.action = value;
      next[index] = row;
      return next;
    });
  };



  if (loading) return (

    <div className="flex items-center justify-center py-20">

      <div className="w-6 h-6 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />

    </div>

  );



  return (

    <div className="space-y-4 font-sans">

      {error && (

        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-[12px] font-bold">

          {error}

        </div>

      )}



      <div className="flex items-center justify-between">

        <h3 className="font-semibold">Staff Management</h3>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search by name or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-[12px] font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 w-48"
          />
          {!isManagerReadOnly && (
          <button
            onClick={() => setImportModalOpen(true)}
            className="px-3 py-1.5 bg-gray-900 text-white text-[12px] font-bold rounded-xl hover:bg-gray-800 transition flex items-center gap-1"
          >
            <Upload size={14} />
            Import Staff
          </button>
          )}
          <button
            onClick={() => isManagerReadOnly ? handleAccessDenied() : setModalOpen(true)}
            className={`px-3 py-1.5 text-white text-[12px] font-bold rounded-xl transition ${isManagerReadOnly ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#E53935] hover:bg-red-700'}`}
          >
            + Add Staff
          </button>
        </div>

      </div>



      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

        <table className="w-full text-[12px]">

          <thead className="bg-gray-50">

            <tr>

              <th className="px-4 py-2 text-left font-bold text-gray-500">Name</th>

              <th className="px-4 py-2 text-left font-bold text-gray-500">Role</th>

              <th className="px-4 py-2 text-left font-bold text-gray-500">PIN</th>

              <th className="px-4 py-2 text-right font-bold text-gray-500">Actions</th>

            </tr>

          </thead>

          <tbody>

            {staff.filter(member => {
              if (!searchQuery.trim()) return true;
              const q = searchQuery.toLowerCase();
              return (member.name || '').toLowerCase().includes(q) || (member.designation || '').toLowerCase().includes(q) || (member.role || '').toLowerCase().includes(q);
            }).map((member) => (

              <tr key={member.id} className="border-t border-gray-100 hover:bg-gray-50">

                <td className="px-4 py-3 font-bold text-gray-900">{member.name}</td>

                <td className="px-4 py-3 text-gray-600">

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${member.role === 'CAPTAIN' ? 'bg-blue-100 text-blue-700' : member.role === 'OWNER' ? 'bg-purple-100 text-purple-700' : member.role === 'MANAGER' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>

                    {member.designation || member.role}

                  </span>

                </td>

                <td className="px-4 py-3 text-gray-600">

                  {member.role === 'OWNER' ? (
                    <span className="text-[10px] font-bold text-gray-400">—</span>
                  ) : member.hasPin ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-green-100 text-green-700">Set</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700">Not Set</span>
                  )}

                </td>

                <td className="px-4 py-3 text-right">

                  <button

                    onClick={() => handleEdit(member)}

                    className="text-[10px] font-bold text-gray-500 hover:text-[#E53935] mr-3"

                  >

                    Edit

                  </button>

                  <button

                    onClick={() => handleDeactivateWithCheck(member.id)}

                    className="text-[10px] font-bold text-red-500 hover:text-red-700"

                  >

                    Deactivate

                  </button>

                </td>

              </tr>

            ))}

            {staff.length === 0 && (

              <tr>

                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-[12px] font-bold">

                  No staff members found.

                </td>

              </tr>

            )}

          </tbody>

        </table>

      </div>



      {modalOpen && (

        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">

          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">

            <h4 className="font-black text-[14px]">{editing ? 'Edit Staff' : 'Add Staff'}</h4>

            <div>

              <label className="text-[10px] font-bold text-gray-500 uppercase">Name</label>

              <input

                value={form.name}

                onChange={(e) => setForm({ ...form, name: e.target.value })}

                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"

                placeholder="Staff name"

              />

            </div>

            {editing && (
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Designation</label>
                <select
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
                >
                  <option value="">Select designation</option>
                  {form.designation && !DESIGNATIONS.includes(form.designation) && (
                    <option value={form.designation}>{form.designation}</option>
                  )}
                  {DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {!editing && (

              <div>

                <label className="text-[10px] font-bold text-gray-500 uppercase">Role</label>

                <select

                  value={form.role}

                  onChange={(e) => setForm({ ...form, role: e.target.value })}

                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"

                >

                  <option value="CAPTAIN">Captain</option>

                  <option value="CASHIER">Cashier</option>

                  <option value="MANAGER">Manager</option>

                  <option value="OWNER">Owner</option>

                </select>

              </div>

            )}

            {!editing && (
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Designation</label>
                <select
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
                >
                  <option value="">Select designation</option>
                  {DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {!editing && form.role === 'OWNER' && (
              <>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
                    placeholder="owner@restaurant.com"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
                    placeholder="Password"
                  />
                </div>
              </>
            )}

            {(!editing ? form.role !== 'OWNER' : true) && (
            <div>

              <label className="text-[10px] font-bold text-gray-500 uppercase">{editing ? 'New PIN (4 digits)' : 'PIN (4 digits)'}</label>

              <input

                value={form.pin}

                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}

                maxLength={4}

                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"

                placeholder="0000"

              />

            </div>
            )}

            {editing && editing.role === 'CASHIER' && (

              <div className="flex items-center justify-between">

                <label className="text-[10px] font-bold text-gray-500 uppercase">Can view online orders</label>

                <button

                  type="button"

                  onClick={() => setForm({ ...form, permissions: { ...form.permissions, onlineOrders: !form.permissions?.onlineOrders } })}

                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${form.permissions?.onlineOrders ? 'bg-[#E53935]' : 'bg-gray-300'}`}

                >

                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${form.permissions?.onlineOrders ? 'translate-x-5' : 'translate-x-1'}`} />

                </button>

              </div>

            )}

            <div className="flex gap-2 pt-1">

              <button onClick={resetForm} className="flex-1 py-2 border border-gray-200 rounded-xl text-[12px] font-bold text-gray-600 hover:bg-gray-50 transition">Cancel</button>

              <button

                onClick={handleSave}

                disabled={saving || !form.name.trim() || (form.role !== 'OWNER' && form.pin.length > 0 && form.pin.length !== 4) || (form.role === 'OWNER' && form.email?.trim() && !form.password?.trim())}

                className="flex-1 py-2 bg-[#E53935] text-white rounded-xl text-[12px] font-bold hover:bg-red-700 disabled:opacity-50 transition"

              >

                {saving ? 'Saving...' : 'Save'}

              </button>

            </div>

          </div>

        </div>

      )}

      {importModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setImportModalOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-black text-[14px]">Import Staff</h4>
              <button onClick={() => setImportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">
                {importError}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={downloadStaffImportTemplate} className="text-xs font-bold text-blue-600 hover:text-blue-800 underline">
                <Download size={14} className="inline mr-1" />
                Download template
              </button>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors">
              <input
                type="file"
                id="staff-import-file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  setImportFile(e.target.files[0]);
                  setImportPreview(null);
                  setEditedProposed([]);
                  setImportError('');
                }}
              />
              <label htmlFor="staff-import-file" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload size={32} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-700">
                  {importFile ? importFile.name : 'Click or drag file here'}
                </span>
                <span className="text-xs text-gray-500">Supports .csv, .xlsx, .xls</span>
              </label>
            </div>

            <button
              onClick={handleStaffImportPreview}
              disabled={!importFile || importLoading}
              className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {importLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader size={16} className="animate-spin" />
                  Parsing file...
                </span>
              ) : (
                'Preview Import'
              )}
            </button>

            {importPreview && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-900">
                  Preview ({importPreview.parsedRows?.length || 0} rows found)
                </p>

                {importPreview.warnings?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg text-xs space-y-1">
                    {importPreview.warnings.map((w, i) => (
                      <p key={i}>⚠ {w}</p>
                    ))}
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[40vh]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-black text-gray-500">S.No</th>
                          <th className="px-3 py-2 font-black text-gray-500">Name</th>
                          <th className="px-3 py-2 font-black text-gray-500">Designation</th>
                          <th className="px-3 py-2 font-black text-gray-500">Salary</th>
                          <th className="px-3 py-2 font-black text-gray-500">Action</th>
                          <th className="px-3 py-2 font-black text-gray-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {editedProposed.map((row, idx) => (
                          <tr key={idx} className={`${row.action === 'ambiguous' || row.action === 'needsReview' ? 'bg-amber-50' : ''}`}>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.staffCode || ''}
                                onChange={(e) => updateProposedRow(idx, 'staffCode', e.target.value)}
                                className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.name}
                                onChange={(e) => updateProposedRow(idx, 'name', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.role}
                                onChange={(e) => updateProposedRow(idx, 'role', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                value={row.baseSalary}
                                onChange={(e) => updateProposedRow(idx, 'baseSalary', e.target.value)}
                                className="w-24 border border-gray-200 rounded px-2 py-1 text-xs text-right"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.action}
                                onChange={(e) => updateProposedRow(idx, 'action', e.target.value)}
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                              >
                                <option value="create">Create</option>
                                <option value="update">Update</option>
                                <option value="ambiguous">Ambiguous</option>
                                <option value="needsReview">Needs Review</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              {row.action === 'create' && <span className="text-[10px] font-black text-green-600">NEW</span>}
                              {row.action === 'update' && (
                                <span className="text-[10px] font-black text-blue-600">
                                  UPDATE {row.oldBaseSalary !== row.baseSalary && ` ₹${row.oldBaseSalary} → ₹${row.baseSalary}`}
                                </span>
                              )}
                              {row.action === 'ambiguous' && <span className="text-[10px] font-black text-amber-600">AMBIGUOUS</span>}
                              {row.action === 'needsReview' && <span className="text-[10px] font-black text-red-600">REVIEW</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setImportPreview(null);
                      setEditedProposed([]);
                      setImportFile(null);
                    }}
                    disabled={importing}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl font-bold text-sm disabled:opacity-50"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleStaffImportCommit}
                    disabled={importing}
                    className="flex-1 py-2.5 bg-[#B71C1C] text-white rounded-xl font-bold text-sm hover:bg-[#8E1414] disabled:opacity-50"
                  >
                    {importing ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader size={16} className="animate-spin" />
                        Importing...
                      </span>
                    ) : (
                      `Import ${editedProposed.filter((r) => r.action !== 'ambiguous' && r.action !== 'needsReview').length} Staff`
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>

  );

}



export function Attendance() {

  const today = new Date().toISOString().split("T")[0];
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'range'
  const [date, setDate] = useState(today);
  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(today);

  const [employees, setEmployees] = useState([]);

  const [attendance, setAttendance] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [markingIds, setMarkingIds] = useState(new Set());

  const [deletingId, setDeletingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('All');



  const loadData = useCallback(async () => {

    setLoading(true);

    setError('');

    try {
      const [empData, attData] = await Promise.all([
        apiFetch('/api/payroll/employees'),
        viewMode === 'range'
          ? getAttendanceRange(rangeStart, rangeEnd)
          : getAttendance(date),
      ]);

      setEmployees(empData || []);

      setAttendance(attData.attendance || []);

    } catch (err) {

      setError(err.message || 'Failed to load attendance');

    } finally {

      setLoading(false);

    }

  }, [date, rangeStart, rangeEnd, viewMode]);



  useEffect(() => {

    Promise.resolve().then(() => loadData());

  }, [loadData]);



  const getStatus = (employeeId) => {

    const record = attendance.find(a => a.employeeId === employeeId);

    return record?.status || 'NOT_MARKED';

  };



  const getRecordId = (employeeId) => {

    return attendance.find(a => a.employeeId === employeeId)?.id || null;

  };



  const updateAttendanceRecord = (employeeId, status, checkInTime = null, checkOutTime = null) => {
    setAttendance(prev => {
      const idx = prev.findIndex(a => a.employeeId === employeeId);
      const now = new Date().toISOString();
      const updated = {
        employeeId,
        date,
        status,
        checkInTime: checkInTime === undefined ? (prev[idx]?.checkInTime || null) : checkInTime,
        checkOutTime: checkOutTime === undefined ? (prev[idx]?.checkOutTime || null) : checkOutTime,
        updatedAt: now,
        employee: prev[idx]?.employee || employees.find(e => e.id === employeeId),
        // Preserve a real id if we have one; otherwise use a temp placeholder
        id: prev[idx]?.id || `temp-${employeeId}`,
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...prev[idx], ...updated };
        return next;
      }
      return [...prev, updated];
    });
  };

  const markStatus = async (employeeId, status) => {
    setMarkingIds(prev => new Set(prev).add(employeeId));
    setError('');

    // Optimistic update: immediately show new status (and auto-check-in time if PRESENT)
    const nowIso = status === 'PRESENT' ? new Date().toISOString() : undefined;
    updateAttendanceRecord(employeeId, status, nowIso);

    try {
      await markAttendance({ employeeId, date, status });
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to mark attendance');
      loadData();
    } finally {
      setMarkingIds(prev => {
        const next = new Set(prev);
        next.delete(employeeId);
        return next;
      });
    }
  };

  const bulkMarkStatus = async (status) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setMarkingIds(prev => new Set([...prev, ...ids]));
    setError('');

    const nowIso = status === 'PRESENT' ? new Date().toISOString() : undefined;
    ids.forEach(id => updateAttendanceRecord(id, status, nowIso));

    try {
      const items = ids.map(employeeId => ({ employeeId, status }));
      await markAttendanceBulk({ date, items });
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to mark attendance for selected employees');
      loadData();
    } finally {
      setMarkingIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  const toggleSelection = (employeeId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredEmployees.length && filteredEmployees.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmployees.map(e => e.id)));
    }
  };

  const handleCheckIn = async (employeeId) => {

    const id = getRecordId(employeeId);

    if (!id) return;

    try {

      await checkIn(id);

      loadData();

    } catch (err) {

      setError(err.message || 'Failed to check in');

    }

  };



  const handleCheckOut = async (employeeId) => {

    const id = getRecordId(employeeId);

    if (!id) return;

    try {

      await checkOut(id);

      loadData();

    } catch (err) {

      setError(err.message || 'Failed to check out');

    }

  };



  const handleDelete = async (employeeId) => {

    if (!window.confirm('Delete this staff member? This will permanently remove their payroll records, attendance, and staff access.')) return;

    setDeletingId(employeeId);
    setError('');

    try {

      await apiFetch(`/api/payroll/employees/${employeeId}`, { method: 'DELETE' });

      loadData();

    } catch (err) {

      setError(err.message || 'Failed to delete staff');

    } finally {

      setDeletingId(null);

    }

  };



  const presentCount = attendance.filter(a => a.status === 'PRESENT' || a.status === 'HALF_DAY').length;

  const totalCount = employees.length;

  const categories = useMemo(() => {
    const list = [...new Set(employees.map(e => (e.designation || e.role || 'Uncategorized').trim()).filter(Boolean))].sort();
    return ['All', ...list];
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesName = !searchTerm || (emp.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const category = (emp.designation || emp.role || '').trim();
      const matchesCategory = categoryFilter === 'All' || category === categoryFilter;
      return matchesName && matchesCategory;
    });
  }, [employees, searchTerm, categoryFilter]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter((rec) => {
      const matchesName = !searchTerm || (rec.employee?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const category = (rec.employee?.designation || rec.employee?.role || '').trim();
      const matchesCategory = categoryFilter === 'All' || category === categoryFilter;
      return matchesName && matchesCategory;
    });
  }, [attendance, searchTerm, categoryFilter]);



  if (loading) return (

    <div className="flex items-center justify-center py-20">

      <div className="w-6 h-6 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />

    </div>

  );



  return (

    <div className="space-y-4 font-sans">

      {error && (

        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-[12px] font-bold">

          {error}

        </div>

      )}



      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        <div>

          <h3 className="font-semibold">Staff Attendance</h3>

          <p className="text-[12px] text-gray-500">
            {viewMode === 'range'
              ? `Showing ${filteredAttendance.length} of ${attendance.length} record(s) from ${rangeStart} to ${rangeEnd}`
              : `Present today: ${presentCount}/${totalCount}`}
          </p>

        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold ${viewMode === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('range')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold ${viewMode === 'range' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Range
            </button>
          </div>

          {viewMode === 'day' ? (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
            />
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
              />
              <span className="text-xs font-bold text-gray-500">to</span>
              <input
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
              />
            </div>
          )}
        </div>

      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg bg-white">
            <Search size={14} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="outline-none text-[12px] font-bold text-gray-900 placeholder-gray-400 w-40"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="text-[10px] text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-[12px] font-bold text-gray-900 focus:outline-none focus:border-[#E53935]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>
            ))}
          </select>
          <span className="text-[11px] text-gray-500 font-bold">
            {filteredEmployees.length} shown
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
          >
            {selectedIds.size === filteredEmployees.length && filteredEmployees.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          <span className="text-[11px] text-gray-500 font-bold">
            {selectedIds.size} selected
          </span>
        </div>
        {selectedIds.size > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <button onClick={() => bulkMarkStatus('PRESENT')} disabled={markingIds.size > 0} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">Mark Present</button>
            <button onClick={() => bulkMarkStatus('ABSENT')} disabled={markingIds.size > 0} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">Mark Absent</button>
            <button onClick={() => bulkMarkStatus('LEAVE')} disabled={markingIds.size > 0} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">Mark Leave</button>
            <button onClick={() => bulkMarkStatus('HALF_DAY')} disabled={markingIds.size > 0} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50">Mark Half-Day</button>
          </>
        )}
      </div>


      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

        {viewMode === 'range' ? (
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-bold text-gray-500">Date</th>
                <th className="px-4 py-2 text-left font-bold text-gray-500">Employee</th>
                <th className="px-4 py-2 text-left font-bold text-gray-500">Role</th>
                <th className="px-4 py-2 text-left font-bold text-gray-500">Status</th>
                <th className="px-4 py-2 text-left font-bold text-gray-500">Check In</th>
                <th className="px-4 py-2 text-left font-bold text-gray-500">Check Out</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-[12px] font-bold">
                    {attendance.length === 0 ? 'No attendance records found for this range.' : 'No records match your search or category.'}
                  </td>
                </tr>
              ) : (
                filteredAttendance.map((record) => (
                  <tr key={record.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-900">{record.date}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{record.employee?.name || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{record.employee?.designation || record.employee?.role || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        record.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                        record.status === 'HALF_DAY' ? 'bg-yellow-100 text-yellow-700' :
                        record.status === 'ABSENT' ? 'bg-red-100 text-red-700' :
                        record.status === 'LEAVE' ? 'bg-gray-100 text-gray-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {record.status === 'NOT_MARKED' ? 'Not Marked' : record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[12px]">

          <thead className="bg-gray-50">

            <tr>

              <th className="px-2 py-2 text-left font-bold text-gray-500 w-10">
                <input
                  type="checkbox"
                  checked={filteredEmployees.length > 0 && selectedIds.size === filteredEmployees.length}
                  onChange={toggleSelectAll}
                  className="accent-[#E53935]"
                />
              </th>

              <th className="px-4 py-2 text-left font-bold text-gray-500">Employee</th>

              <th className="px-4 py-2 text-left font-bold text-gray-500">Role</th>

              <th className="px-4 py-2 text-left font-bold text-gray-500">Status</th>

              <th className="px-4 py-2 text-left font-bold text-gray-500">Check In</th>

              <th className="px-4 py-2 text-left font-bold text-gray-500">Check Out</th>

              <th className="px-4 py-2 text-right font-bold text-gray-500">Actions</th>

            </tr>

          </thead>

          <tbody>

            {filteredEmployees.map((emp) => {

              const status = getStatus(emp.id);

              const record = attendance.find(a => a.employeeId === emp.id);
              const isMarking = markingIds.has(emp.id);

              return (

                <tr key={emp.id} className={`border-t border-gray-100 hover:bg-gray-50 ${isMarking ? 'opacity-70' : ''}`}>

                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(emp.id)}
                      onChange={() => toggleSelection(emp.id)}
                      className="accent-[#E53935]"
                    />
                  </td>

                  <td className="px-4 py-3 font-bold text-gray-900">{emp.name}</td>

                  <td className="px-4 py-3 text-gray-600">{emp.designation || emp.role || '-'}</td>

                  <td className="px-4 py-3">

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${

                      status === 'PRESENT' ? 'bg-green-100 text-green-700' :

                      status === 'HALF_DAY' ? 'bg-yellow-100 text-yellow-700' :

                      status === 'ABSENT' ? 'bg-red-100 text-red-700' :

                      status === 'LEAVE' ? 'bg-gray-100 text-gray-700' :

                      'bg-blue-50 text-blue-700'

                    }`}>

                      {status === 'NOT_MARKED' ? 'Not Marked' : status}

                    </span>

                  </td>

                  <td className="px-4 py-3 text-gray-600">

                    {record?.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-'}

                  </td>

                  <td className="px-4 py-3 text-gray-600">

                    {record?.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-'}

                  </td>

                  <td className="px-4 py-3 text-right">

                    <div className="flex items-center justify-end gap-1 flex-wrap">

                      <button onClick={() => markStatus(emp.id, 'PRESENT')} disabled={isMarking} className="px-2 py-1 rounded text-[10px] font-bold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">P</button>

                      <button onClick={() => markStatus(emp.id, 'ABSENT')} disabled={isMarking} className="px-2 py-1 rounded text-[10px] font-bold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">A</button>

                      <button onClick={() => markStatus(emp.id, 'LEAVE')} disabled={isMarking} className="px-2 py-1 rounded text-[10px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">L</button>

                      <button onClick={() => markStatus(emp.id, 'HALF_DAY')} disabled={isMarking} className="px-2 py-1 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50">H</button>

                      {status === 'PRESENT' && !record?.checkOutTime && (

                        <>

                          <button onClick={() => handleCheckIn(emp.id)} disabled={isMarking} className="px-2 py-1 rounded text-[10px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50">In</button>

                          <button onClick={() => handleCheckOut(emp.id)} disabled={isMarking} className="px-2 py-1 rounded text-[10px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50">Out</button>

                        </>

                      )}

                      <button
                        onClick={() => handleDelete(emp.id)}
                        disabled={deletingId === emp.id}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                        title="Delete staff"
                      >
                        Del
                      </button>

                    </div>

                  </td>

                </tr>

              );

            })}

            {filteredEmployees.length === 0 && (

              <tr>

                <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-[12px] font-bold">

                  {employees.length === 0 ? 'No employees found. Add employees in Payroll first.' : 'No employees match your search or category.'}

                </td>

              </tr>

            )}

          </tbody>

        </table>
        )}

      </div>

    </div>

  );

}



