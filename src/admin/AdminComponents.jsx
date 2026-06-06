import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  Clock,
  ChevronRight,
  Filter,
  Star,
  ArrowRightLeft,
  GlassWater,
  Utensils,
  Trash2,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Edit2
} from 'lucide-react';
import { 
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart 
} from 'recharts';
import { useMenu } from '../context/MenuContext';
import { useOutlet } from '../context/OutletContext';
import UnifiedOrdersDashboard from './UnifiedOrdersDashboard';
import { getSmartRecommendation } from '../services/pricingEngine';
import { STYLES, generateRandomConfig } from '../services/creativeEngine';
import CreativeCanvas from '../shared/components/CreativeCanvas';
import { calculateOrderTotal } from '../shared/utils/billing';
import { filterMenuItems, menuItemMatchesSearch } from '../shared/utils/menuSearch';
import { useTableSync } from '../services/tableSyncService';
import { useBarTableSync } from '../services/barTableSyncService';
import { useBarMenuSync, updateBarMenuItem, toggleBarMenuAvailability } from '../services/barMenuSyncService';
import { API_BASE, apiUrl } from '../services/apiConfig';
import { fetchUnifiedMenu } from '../services/unifiedMenuService';
import { fetchTransactions } from '../services/orderApi';
import { RESTAURANT_ID } from '../services/tableApi';
import { BAR_ID } from '../services/barApiConfig';
import { VENUE_PRICE_COLUMNS, BAR_VENUE_PRICE_COLUMNS, RESTAURANT_VENUE_PRICE_COLUMNS } from '../services/venueApiConfig';
import BarMenuToggle from '../shared/components/BarMenuToggle';
import { fetchBarInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, adjustStock, recordPurchase, fetchLowStockItems, fetchTransactions as fetchBarTransactions } from '../services/barInventoryApi';
import { useSocket } from '../hooks/useSocket';

const BAR_UNIT_ML = 30;
const FULL_BOTTLE_ML = 750;
const BAR_FULL_BOTTLE_MULTIPLIER = 25;

// Helper function to determine ml per unit for liquor items based on item name
function getLiquorMlPerUnit(itemName, bottleSize) {
  if (itemName.endsWith('Full Bottle')) return FULL_BOTTLE_ML;
  if (itemName.endsWith('30ml')) return BAR_UNIT_ML;
  // Bottle items (Beer, Soft drinks) — use stored bottleSize
  return bottleSize || FULL_BOTTLE_ML;
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

export function Dashboard({ revenue, ordersCount, activityLog }) {
  const { tables } = useTableSync();
  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);

  const occupiedCount = tables.filter(t => t.status && t.status !== 'Free' && t.status !== 'available').length;
  const totalTables = tables.length;
  const liveOrdersCount = tables.filter(t => t.status && t.status !== 'Free' && t.status !== 'available').length;

  useEffect(() => {
    let cancelled = false;

    const loadSalesData = async () => {
      try {
        // Fetch from both outlets
        const [restaurantTxns, barTxns] = await Promise.allSettled([
          fetchTransactions(RESTAURANT_ID, 500),
          fetchTransactions(BAR_ID, 500),
        ]);

        const allTransactions = [
          ...(restaurantTxns.status === 'fulfilled' ? restaurantTxns.value : []),
          ...(barTxns.status === 'fulfilled' ? barTxns.value : []),
        ];

        // Calculate last 7 days (today going back 6 days)
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        // Filter transactions for last 7 days
        const recentTxns = allTransactions.filter(txn => {
          const txnDate = new Date(txn.paidAt || txn.createdAt);
          return txnDate >= sevenDaysAgo && txnDate <= today;
        });

        // Aggregate by day of week
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dailyData = days.map(d => ({ day: d, revenue: 0 }));

        recentTxns.forEach(txn => {
          const txnDate = new Date(txn.paidAt || txn.createdAt);
          const dayIdx = txnDate.getDay(); // 0 = Sunday, 6 = Saturday
          dailyData[dayIdx].revenue += Number(txn.amount || 0);
        });

        // Reorder to start from Monday (chart format)
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
    const interval = setInterval(loadSalesData, 300000); // Refresh every 5 minutes

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
  return <div className="space-y-4 font-sans">
    <div className="rounded-[10px] border border-[#EF9A9A] bg-[#FFEBEE] p-4 text-sm md:text-base animate-fade-in flex items-center gap-3">
      <span className="text-xl">✨</span>
      <p className="font-medium">Live Operational Insight: <span className="font-bold text-[#B71C1C]">Chicken Dum Biryani</span> is moving 15% faster than usual. Average prep time is 12 mins.</p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {[
        { label: "Today's Revenue", value: `₹${revenue.toLocaleString()}`, sub: "↑12%", color: "text-[#2E7D32]" },
        { label: "Total Orders", value: liveOrdersCount || ordersCount, sub: "live", color: "text-[#1A1A1A]" },
        { label: "Tables Occupied", value: `${occupiedCount}/${totalTables}`, sub: "active", color: "text-[#1A1A1A]" },
        { label: "Staff Present", value: "18/21", sub: "today", color: "text-[#1A1A1A]" },
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
      <div className={card + " p-4 lg:col-span-2 flex flex-col"}>
        <h3 className="mb-4 font-bold text-sm md:text-base flex items-center gap-2">
          <ChartNoAxesCombined size={18} className="text-[#E53935]" />
          Sales Attribution - Last 7 days
        </h3>
        <div className="flex-grow h-[250px] w-full min-h-[250px]" style={{ minWidth: 0 }}>
          <ResponsiveContainer width="99%" height="100%">
            <BarChart data={sales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="d" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#FFEBEE' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="v" fill="#E53935" radius={[6, 6, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className={card + " p-0 overflow-hidden flex flex-col h-[320px] lg:h-auto"}>
        <div className="p-4 border-b border-[#FFCDD2] bg-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-sm md:text-base flex items-center gap-2">
            <ClipboardList size={18} className="text-[#E53935]" />
            Live Activity
          </h3>
          <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
        </div>
        <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {activityLog.map((log) => (
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
          ))}
        </div>
      </div>
    </div>
  </div>;
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
            <div className="flex justify-between text-xs text-[#6B6B6B]"><span>GST (5%)</span><span>₹{gst.toFixed(2)}</span></div>
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

const CAPTAINS = [
  { id: 'C1', name: 'Ajay Kumar' },
  { id: 'C2', name: 'Raja Behera' },
  { id: 'C3', name: 'Sagar' },
  { id: 'C4', name: 'Durga Prasad' },
  { id: 'C5', name: 'Subbaiah' },
  { id: 'C6', name: 'Happy' },
];

export function Tables({ onOpen }) {
  const [activePopupTableId, setActivePopupTableId] = useState(null);
  const { tables } = useTableSync();

  return <div className="space-y-4 font-sans">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <h3 className="font-semibold">Floor Plan — Main Hall</h3>
      <select className={input + " w-full sm:max-w-52"}><option>Main Hall</option><option>Terrace</option></select>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {tables.map((t) => {
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
        const captainName = CAPTAINS.find(c => c.id === t.captainId)?.name || t.captainId || 'Staff';

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
      const pTable = tables.find(t => t.id === activePopupTableId);
      if (!pTable || !pTable.status || pTable.status === 'Free' || pTable.status === 'available') {
         setTimeout(() => setActivePopupTableId(null), 0);
         return null;
      }
      
      const pItems = (pTable.kotHistory && pTable.kotHistory.length > 0) ? pTable.kotHistory.flatMap(k => k.items || []) : (pTable.items || []);
      const pCount = pItems.reduce((sum, i) => sum + i.q, 0);
      const pCaptainName = CAPTAINS.find(c => c.id === pTable.captainId)?.name || pTable.captainId || 'Staff';
      
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in duration-200" onClick={() => setActivePopupTableId(null)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
             <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                   <div className={`w-3 h-3 rounded-full ${pTable.status === 'Waiting Bill' ? 'bg-amber-500 animate-pulse' : pTable.status === 'Preparing' ? 'bg-orange-500' : 'bg-red-600'}`} />
                   <h3 className="font-black text-lg text-gray-900 tracking-tight">Table {pTable.id}</h3>
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
  const [filter, setFilter] = useState("");
  const [activeVenueId, setActiveVenueId] = useState(BAR_VENUE_PRICE_COLUMNS[0].id);
  const [showHiddenVenueItems, setShowHiddenVenueItems] = useState(false);

  // ── Admin items: fetched from admin endpoint (includes unavailable) ───
  const [adminItems, setAdminItems] = useState([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [activeOutlet, setActiveOutlet] = useState('restaurant'); // 'restaurant' | 'bar'

  const currentVenueColumns = activeOutlet === 'bar' ? BAR_VENUE_PRICE_COLUMNS : RESTAURANT_VENUE_PRICE_COLUMNS;

  const fetchAdminItems = useCallback(async () => {
    try {
      setAdminLoading(true);
      let url;
      if (activeOutlet === 'bar') {
        url = `${API_BASE}/api/bar/menu/items?restaurantId=bar-001`;
      } else {
        url = `${API_BASE}/api/menu/items/admin?restaurantId=restaurant-001`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Admin fetch failed');
      const data = await res.json();
      // Map to POS shape, preserving isAvailable
      const DEFAULT_IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop';
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
    setActiveVenueId(currentVenueColumns[0].id);
    fetchAdminItems(); // Refetch when outlet changes
  }, [activeOutlet, fetchAdminItems]);

  const items = useMemo(() => {
    return adminItems
      .filter((x) => {
        // Apply venue filtering for both bar and restaurant outlets
        return showHiddenVenueItems || Number(x.venuePrices?.[activeVenueId] || 0) > 0;
      })
      .filter((x) => menuItemMatchesSearch(x, filter));
  }, [filter, adminItems, activeVenueId, showHiddenVenueItems]);

  const activeVenue = currentVenueColumns.find((venue) => venue.id === activeVenueId) || currentVenueColumns[0];

  const [editingItem, setEditingItem] = useState(null);
  const [addingItem, setAddingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  // ── Availability toggle with optimistic update ─────────────────────────
  const handleToggleAvailability = useCallback(async (item) => {
    if (togglingId) return;
    const newValue = !item.isAvailable;
    setTogglingId(item.id);

    // Optimistic UI update
    setAdminItems(prev =>
      prev.map(i => i.id === item.id ? { ...i, isAvailable: newValue } : i)
    );

    try {
      const endpoint = activeOutlet === 'bar'
        ? `${API_BASE}/api/bar/menu/items/${item.id}/availability`
        : `${API_BASE}/api/menu/items/${item.id}/availability`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error('Toggle failed');
      // Backend confirmed — also refresh the shared POS menu so unavailable items disappear
      refreshMenu().catch(() => {});
    } catch (err) {
      console.error('[MenuPage] Availability toggle failed:', err);
      // Revert on error
      setAdminItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, isAvailable: !newValue } : i)
      );
      alert('Could not update availability. Please try again.');
    } finally {
      setTogglingId(null);
    }
  }, [togglingId, refreshMenu]);

  // ── Dynamic categories ────────────────────────────────────────────────
  const [dbCategories, setDbCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true);
        const res = await fetch(`${API_BASE}/api/menu/categories`);
        if (!res.ok) throw new Error('Failed to fetch categories');
        const data = await res.json();
        setDbCategories(Array.isArray(data) ? data.filter(c => c.isActive !== false) : []);
      } catch (err) {
        console.error('[MenuPage] Failed to load categories:', err);
      } finally {
        setCategoriesLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const handleEdit = (item) => setEditingItem({
    originalName: item.n,
    ...item,
    basePrice: item.p,
    venuePrice: Number(item.venuePrices?.[activeVenueId] || 0),
    categoryPrinterTarget: item.categoryPrinterTarget,
  });
  const handleDeleteClick = (item) => setDeletingItem(item);

  // ── Cloudinary direct upload (bypasses backend proxy — 2-4s vs 10-15s) ────
  const uploadImageToCloudinary = async (base64DataUri, itemName = '') => {
    // Convert base64 data URI → Blob for multipart/form-data upload
    const base64Data = base64DataUri.includes(',') ? base64DataUri.split(',')[1] : base64DataUri;
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    const formData = new FormData();
    formData.append('file', blob, 'image.jpg');
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'softshape-vgrand-menu');
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
      });
      if (res.ok) {
        // Optimistic update: remove item from local state immediately
        setGlobalMenu(prev => prev.filter(i => i.id !== deletingItem.id));
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
        ...(activeOutlet === 'restaurant' && editingItem.categoryPrinterTarget !== undefined
          ? { categoryPrinterTarget: editingItem.categoryPrinterTarget }
          : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      };

      const endpoint = activeOutlet === 'bar'
        ? `${API_BASE}/api/bar/menu/items/${editingItem.id}`
        : `${API_BASE}/api/menu/items/${editingItem.id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const serverItem = await res.json();
        // Build optimistic POS-shaped item from backend response
        const DEFAULT_IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop';
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
        };
        // Apply optimistic update instantly — no loading flash
        setGlobalMenu(prev => prev.map(i => i.id === editingItem.id ? optimisticItem : i));
        setAdminItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...optimisticItem, isAvailable: editingItem.isAvailable } : i));
        window.dispatchEvent(new CustomEvent('softshape_venue_prices_updated'));
        setEditingItem(null);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addingItem.n,
          category: addingItem.c,
          isVeg: addingItem.t === 'veg',
          price: Number(addingItem.p),
          menuType: addingItem.menuType || 'FOOD',
          venuePrices: Object.fromEntries(
            currentVenueColumns.map((venue) => [venue.id, Number(addingItem.venuePrices?.[venue.id] || 0)])
          ),
          ...(activeOutlet === 'restaurant' && addingItem.categoryPrinterTarget !== undefined
            ? { categoryPrinterTarget: addingItem.categoryPrinterTarget }
            : {}),
          ...(imageUrl ? { imageUrl } : {}),
        }),
      });

      if (res.ok) {
        const serverItem = await res.json();
        // Map backend item to POS shape for optimistic insert
        const DEFAULT_IMG = 'https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop';
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
        };
        // Append new item instantly — no loading flash
        setGlobalMenu(prev => [...prev, optimisticItem]);
        setAdminItems(prev => [...prev, { ...optimisticItem, isAvailable: true }]);
        window.dispatchEvent(new CustomEvent('softshape_venue_prices_updated'));
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
            const defaultPrinterTarget = firstCat?.printerTarget || (
              activeOutlet === 'restaurant' &&
              /water|drinks|beverages|soft drinks|soda|juice|liquor|beer/i.test(firstCat?.name || '')
                ? 'BAR_PRINTER'
                : 'KOT_PRINTER'
            );
            setAddingItem({
              n: '',
              c: firstCat?.name ?? '',
              p: '',
              t: 'veg',
              img: null,
              venuePrices: Object.fromEntries(currentVenueColumns.map((venue) => [venue.id, venue.id === activeVenueId ? '' : 0])),
              categoryPrinterTarget: activeOutlet === 'restaurant' ? defaultPrinterTarget : undefined,
              menuType: 'FOOD',
            });
          }}
        >
          <span className="text-gray-400 font-black">+</span> Add Item
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
    <p className="text-xs text-[#6B6B6B] mb-3">
      Showing {items.length} item{items.length !== 1 ? "s" : ""}
      {filter ? ` matching "${filter}"` : ""} · synced from backend
    </p>

    {/* Outlet Selector */}
    <div className="mb-4 flex gap-2">
      <button
        onClick={() => setActiveOutlet('restaurant')}
        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
          activeOutlet === 'restaurant'
            ? 'bg-blue-500 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
      >
        🍽️ Restaurant
      </button>
      <button
        onClick={() => setActiveOutlet('bar')}
        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
          activeOutlet === 'bar'
            ? 'bg-purple-500 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
      >
        🍺 Bar
      </button>
    </div>

    {/* Venue-specific tabs - shown for both bar and restaurant outlets */}
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
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  item.isAvailable
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {item.isAvailable ? 'Available' : 'Unavailable'}
                </span>
              </td>
              <td className="px-4 py-2 flex items-center gap-2">
                <button
                  onClick={() => handleToggleAvailability(item)}
                  disabled={togglingId === item.id}
                  title={item.isAvailable ? 'Mark Unavailable' : 'Mark Available'}
                  className={`text-xs font-bold px-2 py-1 rounded-md border transition-all ${
                    item.isAvailable
                      ? 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'
                      : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {togglingId === item.id ? '…' : item.isAvailable ? 'Disable' : 'Enable'}
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
        <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-black text-lg text-gray-900 tracking-tight">Edit Item</h3>
            <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>
          </div>
          <div className="p-5 space-y-4">
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
            <div className="grid grid-cols-2 gap-4">
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
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{activeVenue.label} Price (₹)</label>
                  <input type="number" value={editingItem.venuePrice} onChange={e => setEditingItem({...editingItem, venuePrice: e.target.value})} className={input + " w-full bg-gray-50"} />
               </div>
            </div>
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
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">KOT Destination</label>
              <div className="flex gap-2">
                {activeOutlet === 'restaurant'
                  ? [
                      { value: 'KOT_PRINTER', label: '🍽 Food', sub: 'Prints to KOT Family' },
                      { value: 'BAR_PRINTER', label: '🥤 Drinks', sub: 'Prints to Dine in Bill' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditingItem({ ...editingItem, categoryPrinterTarget: opt.value })}
                        className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all text-left ${
                          (editingItem.categoryPrinterTarget || 'KOT_PRINTER') === opt.value
                            ? opt.value === 'KOT_PRINTER'
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <div>{opt.label}</div>
                        <div className="text-[9px] font-bold mt-0.5 opacity-60">{opt.sub}</div>
                      </button>
                    ))
                  : [
                      { value: 'FOOD', label: '🍽 Food', sub: 'Prints to Kitchen KOT' },
                      { value: 'LIQUOR', label: '🥃 Bar / Drinks', sub: 'Prints to Bar KOT' },
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
                        <div className="text-[9px] font-bold mt-0.5 opacity-60">{opt.sub}</div>
                      </button>
                    ))}
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50">
            <button onClick={() => setEditingItem(null)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={handleSaveEdit} disabled={saving} className="px-6 py-2 text-sm font-black text-white bg-[#E53935] hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-md">{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    )}

    {/* ADD MODAL */}
    {addingItem && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-black text-lg text-gray-900 tracking-tight">Add New Item</h3>
            <button onClick={() => setAddingItem(null)} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>
          </div>
          <div className="p-5 space-y-4">
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
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Category</label>
                  <select
                    value={addingItem.c}
                    onChange={e => {
                      const newCatName = e.target.value;
                      const cat = dbCategories.find(c => c.name === newCatName);
                      const derivedTarget = activeOutlet === 'restaurant'
                        ? (cat?.printerTarget || (
                            /water|drinks|beverages|soft drinks|soda|juice|liquor|beer/i.test(newCatName || '')
                              ? 'BAR_PRINTER'
                              : 'KOT_PRINTER'
                          ))
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
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Base Price (₹)</label>
                  <input type="number" placeholder="0.00" value={addingItem.p} onChange={e => setAddingItem({...addingItem, p: e.target.value})} className={input + " w-full bg-gray-50"} />
               </div>
            </div>
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
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">KOT Destination</label>
              <div className="flex gap-2">
                {activeOutlet === 'restaurant'
                  ? [
                      { value: 'KOT_PRINTER', label: '🍽 Food', sub: 'Prints to KOT Family' },
                      { value: 'BAR_PRINTER', label: '🥤 Drinks', sub: 'Prints to Dine in Bill' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAddingItem({ ...addingItem, categoryPrinterTarget: opt.value })}
                        className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all text-left ${
                          (addingItem.categoryPrinterTarget || 'KOT_PRINTER') === opt.value
                            ? opt.value === 'KOT_PRINTER'
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <div>{opt.label}</div>
                        <div className="text-[9px] font-bold mt-0.5 opacity-60">{opt.sub}</div>
                      </button>
                    ))
                  : [
                      { value: 'FOOD', label: '🍽 Food', sub: 'Prints to Kitchen KOT' },
                      { value: 'LIQUOR', label: '🥃 Bar / Drinks', sub: 'Prints to Bar KOT' },
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
                        <div className="text-[9px] font-bold mt-0.5 opacity-60">{opt.sub}</div>
                      </button>
                    ))}
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50">
            <button onClick={() => setAddingItem(null)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
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
  </div>;
}

export function Orders() {
  const { tables } = useTableSync();
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
  const staff = [
    { name: "Rahul Sharma", role: "Head Chef", salary: 35000, absent: 2, deduction: 2333, bonus: 5000, status: "Paid" },
    { name: "Meena Kumari", role: "Sr. Captain", salary: 22000, absent: 0, deduction: 0, bonus: 2500, status: "Paid" },
    { name: "Suresh Babu", role: "Chef de Partie", salary: 28000, absent: 4, deduction: 3733, bonus: 0, status: "Pending" },
    { name: "Lakshmi Rao", role: "Cashier", salary: 18000, absent: 1, deduction: 600, bonus: 1000, status: "Paid" },
    { name: "Kiran Kumar", role: "Captain", salary: 16000, absent: 3, deduction: 1600, bonus: 1200, status: "Paid" },
    { name: "Ananya Singh", role: "Waitstaff", salary: 14000, absent: 0, deduction: 0, bonus: 800, status: "Pending" }
  ];

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tighter">Staff Payroll & Attendance</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">May 2024 Operating Cycle</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-10">
          <div className="text-left sm:text-right">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Payable</p>
            <p className="text-3xl font-black text-[#B71C1C] tracking-tighter">₹1,38,434</p>
          </div>
          <button className="w-full sm:w-auto bg-[#B71C1C] text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#8E1414] transition-all shadow-xl shadow-red-100 active:scale-95">
             Run Payroll
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Employee Details</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Base Salary</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Absent Days</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Deductions</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Bonus/Inc.</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Final Payable</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.map((emp, i) => {
                const final = emp.salary - emp.deduction + emp.bonus;
                return (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-red-50 flex items-center justify-center text-xs font-black text-[#B71C1C]">{emp.name.split(' ').map(n => n[0]).join('')}</div>
                        <div>
                          <p className="font-black text-gray-900">{emp.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{emp.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-700">₹{emp.salary.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${emp.absent > 2 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                        {emp.absent} Days
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-red-600">₹{emp.deduction.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-green-600">₹{emp.bonus.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-black text-gray-900">₹{final.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${emp.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700 animate-pulse'}`}>
                        {emp.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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
          apiUrl(`/api/analytics/items-sold?restaurantId=bar-001&startDate=${filters.startDate}&endDate=${filters.endDate}`)
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
                  const category = item.category || item.menuItem?.category || '';
                  const isBeer = String(category || '').toLowerCase() === 'beer';
                  const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';
                  const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : (isBeer ? 650 : 750);
                  const bottlesNeeded = bottleSize > 0 ? Math.ceil(restockQty / bottleSize) : 0;
                  const restockValue = bottlesNeeded * (parseFloat(item.costPerBottle) || 0);
                  const currentBottles = bottleSize > 0 ? Math.floor(current / bottleSize) : 0;
                  const reorderBottles = bottleSize > 0 ? Math.ceil(reorder / bottleSize) : 0;
                  const currentBottlesDisplay = Math.floor(current / FULL_BOTTLE_ML);
                  const currentMlRemainder = current % FULL_BOTTLE_ML;
                  const reorderBottlesDisplay = Math.floor(reorder / FULL_BOTTLE_ML);
                  const reorderMlRemainder = reorder % FULL_BOTTLE_ML;

                  return (
                    <tr key={item.id || idx} className="border-b border-gray-100 hover:bg-[#FFF5F5] transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        {item.menuItem?.name || item.name || 'Unknown Item'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {item.category || item.menuItem?.category || 'N/A'}
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
          fetch(apiUrl(`/api/analytics/items-sold?restaurantId=bar-001&startDate=${ranges.period1.start.toISOString().slice(0, 10)}&endDate=${ranges.period1.end.toISOString().slice(0, 10)}`)),
          fetch(apiUrl(`/api/analytics/items-sold?restaurantId=bar-001&startDate=${ranges.period2.start.toISOString().slice(0, 10)}&endDate=${ranges.period2.end.toISOString().slice(0, 10)}`))
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
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    const loadTopPerformers = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          apiUrl(`/api/analytics/items-sold?restaurantId=bar-001&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`)
        );

        if (!response.ok) throw new Error('Failed to fetch sales data');

        const data = await response.json();
        const itemsArray = data.items || [];

        const processedData = itemsArray.map(item => {
          const itemName = item.itemName || item.name || '';
          const quantity = item.quantity || 0;
          const revenue = item.revenue || 0;
          const sellingPrice = quantity > 0 ? revenue / quantity : 0;

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
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });
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

  const setPresetDateRange = (preset) => {
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
  };

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
  const { outlet } = useOutlet();
  const [inventory, setInventory] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeTab, setActiveTab] = useState('inventory');
  const socket = useSocket('bar-001');
  const [popup, setPopup] = useState(null);

  // Loading states for action buttons
  const [isCreating, setIsCreating] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isRecordingPurchase, setIsRecordingPurchase] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState(null);

  // Edit modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const showNotification = (message, type = 'info') => {
    setPopup({ message, type });
  };

  const closePopup = () => {
    setPopup(null);
  };

  useEffect(() => {
    if (outlet === 'bar') {
      loadInventory();
      loadLowStockItems();
      loadBarMenu();
    } else {
      setLoading(false);
    }
  }, [outlet]);

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
      loadLowStockItems();
    };

    const handleLowStock = (data) => {
      // Validate data structure
      if (!data || !data.item) {
        console.warn('[Inventory] Invalid low stock alert data:', data);
        return;
      }

      const { item } = data;
      showNotification(`Low Stock Alert: ${item.name || item.menuItem?.name || 'Unknown Item'}`, 'warning');
      loadLowStockItems();
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

  const loadBarMenu = async () => {
    try {
      const res = await fetch(apiUrl('/api/bar/menu/items?restaurantId=bar-001'));
      const data = await res.json();
      const liquorItems = Array.isArray(data)
        ? data.filter(item => item && item.id && item.menuType === 'LIQUOR')
        : [];
      setMenuItems(liquorItems);
    } catch (err) {
      console.error('[Inventory] Menu load failed:', err);
      setMenuItems([]);
    }
  };

  const loadInventory = async () => {
    try {
      const data = await fetchBarInventory();
      setInventory(Array.isArray(data) ? data.filter(item => item && item.id) : []);
    } catch (err) {
      console.error('[Inventory] Load failed:', err);
      showNotification('Failed to load inventory', 'error');
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLowStockItems = async () => {
    try {
      const data = await fetchLowStockItems();
      setLowStockItems(Array.isArray(data) ? data.filter(item => item && item.id) : []);
    } catch (err) {
      console.error('[Inventory] Low stock check failed:', err);
      setLowStockItems([]);
    }
  };

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
    if (!confirm('Are you sure you want to delete this inventory item?')) return;
    if (deletingItemId) return;

    setDeletingItemId(itemId);
    try {
      await deleteInventoryItem(itemId);
      setInventory(prev => prev.filter(i => i.id !== itemId));
      showNotification('Inventory item deleted successfully', 'success');
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
    const category = item.category || item.menuItem?.category || '';
    const isBeer = String(category || '').toLowerCase() === 'beer';
    const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';
    const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : (isBeer ? 650 : 750);
    const reorderLevel = parseFloat(item.reorderLevel) || 0;
    const bottles = Math.floor(currentStock / bottleSize);
    const reorderBottles = Math.ceil(reorderLevel / bottleSize);

    if (currentStock <= 0) return { status: 'out', label: 'Out of Stock', color: 'text-red-600' };
    if (currentStock <= reorderLevel) return { status: 'low', label: 'Low Stock', color: 'text-amber-600' };
    return { status: 'ok', label: 'In Stock', color: 'text-green-600' };
  };

  // Merge menu items with inventory - show all menu items with their inventory status
  const displayItems = menuItems
    .filter(menuItem => menuItem && menuItem.id) // Filter out invalid items
    .map(menuItem => {
      const existingInventory = inventory.find(inv => inv && inv.menuItemId === menuItem.id);
      if (existingInventory) {
        return existingInventory;
      }
      // Create virtual inventory item with 0 stock
      const isBeer = String(menuItem.category || '').toLowerCase() === 'beer';
      return {
        id: `virtual-${menuItem.id}`,
        menuItemId: menuItem.id,
        menuItem: menuItem,
        bottleSize: isBeer ? 650 : 750,
        currentStock: 0,
        reorderLevel: 5000,
        costPerBottle: 0,
        unitOfMeasure: 'ml',
        isVirtual: true, // Flag to indicate this needs to be created
      };
    });

  const filteredInventory = displayItems.filter(item => {
    if (!item) return false;
    const itemName = item.name || item.menuItem?.name || '';
    const matchesSearch = itemName.toLowerCase().includes(searchTerm.toLowerCase());
    const stockStatus = getStockStatus(item).status;
    const matchesFilter = filterStatus === 'all' || stockStatus === filterStatus;
    return matchesSearch && matchesFilter;
  });

  // Show "Coming Soon" for restaurant outlet
  if (outlet === 'restaurant') {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-[0.2em]">Bar Inventory</h2>
          <p className="text-sm text-gray-600 mt-1">Manage liquor stock levels and purchases</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-xs uppercase hover:scale-105 active:scale-95 transition-all"
          >
            + Record Purchase
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-[#E53935] text-white rounded-xl font-bold text-xs uppercase hover:scale-105 active:scale-95 transition-all"
          >
            + Add Item
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-3 font-bold text-sm transition-all ${
            activeTab === 'inventory'
              ? 'border-b-2 border-[#E53935] text-[#E53935]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Inventory
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-3 font-bold text-sm transition-all ${
            activeTab === 'transactions'
              ? 'border-b-2 border-[#E53935] text-[#E53935]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Transactions
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-3 font-bold text-sm transition-all ${
            activeTab === 'reports'
              ? 'border-b-2 border-[#E53935] text-[#E53935]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Sales Reports
        </button>
      </div>

      {activeTab === 'inventory' && (
        <>
          {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-500 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="text-amber-600" size={20} />
            <h3 className="font-black text-amber-900 uppercase text-sm tracking-wide">
              {lowStockItems.length} Item{lowStockItems.length !== 1 ? 's' : ''} Need Attention
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.filter(item => item && item.id).map(item => {
              const currentStock = parseFloat(item.currentStock) || 0;
              const category = item.category || item.menuItem?.category || '';
              const isBeer = String(category || '').toLowerCase() === 'beer';
              const rawBottleSize = item.bottleSize || item.menuItem?.bottleSize || '';
              const bottleSize = (rawBottleSize && rawBottleSize !== 'undefined' && rawBottleSize !== '') ? parseInt(rawBottleSize) : (isBeer ? 650 : 750);
              return (
                <span key={item.id} className="px-3 py-1 bg-amber-200 text-amber-900 rounded-full text-xs font-bold">
                  {item.name || item.menuItem?.name || 'Unknown Item'} ({Math.floor(currentStock / bottleSize)} bottles)
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search inventory..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none"
        >
          <option value="all">All Items</option>
          <option value="ok">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      <div className="space-y-3">
        {filteredInventory.map(item => {
          if (!item) return null;
          const stockStatus = getStockStatus(item);
          const currentStock = parseFloat(item.currentStock) || 0;
          const category = item.category || item.menuItem?.category || '';
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
            <div key={item.id} className="bg-white rounded-2xl shadow-lg p-5 border-2 border-gray-100 hover:border-[#E53935] transition-all">
              <div className="flex items-center justify-between gap-4">
                {/* Left: Item Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-black text-base uppercase tracking-wide truncate">{item.name || item.menuItem?.name || 'Unknown Item'}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${stockStatus.color} bg-gray-100 whitespace-nowrap`}>
                      {stockStatus.label}
                    </span>
                  </div>

                  {/* Stock Progress Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">Stock Level</span>
                      <span className="font-bold">{bottles} bottles ({currentStock.toFixed(0)} ml)</span>
                    </div>
                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          stockStatus.status === 'out' ? 'bg-red-600' :
                          stockStatus.status === 'low' ? 'bg-amber-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${stockPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="flex gap-4 text-xs text-gray-600">
                    <span>Reorder: <strong className="text-gray-800">{reorderBottles} bottles</strong></span>
                    <span>Size: <strong className="text-gray-800">{bottleSize} ml</strong></span>
                    {item.costPerBottle > 0 && (
                      <span>Cost: <strong className="text-gray-800">₹{parseFloat(item.costPerBottle).toFixed(2)}</strong></span>
                    )}
                  </div>
                </div>

                {/* Right: Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedItem(item);
                      setShowAdjustModal(true);
                    }}
                    className="px-4 py-2 bg-[#E53935] text-white rounded-xl font-bold text-xs uppercase tracking-wide hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
                  >
                    {item.isVirtual ? 'Add Stock' : 'Adjust'}
                  </button>
                  {!item.isVirtual && (
                    <>
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setShowEditModal(true);
                        }}
                        className="px-3 py-2 bg-blue-100 text-blue-700 rounded-xl font-bold text-xs hover:bg-blue-600 hover:text-white hover:scale-105 active:scale-95 transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={deletingItemId === item.id}
                        className="px-3 py-2 bg-gray-200 text-gray-700 rounded-xl font-bold text-xs hover:bg-red-600 hover:text-white hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                      >
                        {deletingItemId === item.id ? <ButtonSpinner /> : <Trash2 size={16} />}
                      </button>
                    </>
                  )}
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
        </>
      )}

      {activeTab === 'transactions' && (
        <TransactionsTab />
      )}

      {activeTab === 'reports' && (
        <SalesReportsTab inventory={inventory} />
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
    fetch(apiUrl('/api/bar/menu/items?restaurantId=bar-001'))
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
  const category = item.category || item.menuItem?.category || '';
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
    fetch(apiUrl('/api/bar/menu/items?restaurantId=bar-001'))
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
  const [caption, setCaption] = useState("✨ Savor the perfection in every bite! Our chef's latest creation is here to redefine your dining experience. Handcrafted with authentic spices and passion. 🥘❤️\n\n#VGrand #SoftshapeAI #GourmetExperience #FoodArt");
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
                          <p className="text-[9px] font-black">vgrand_restaurants</p>
                          <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">Ongole, India</p>
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

export function SettingsPage() {
  return <div className="p-6 bg-white border rounded-xl font-sans">
    <h2 className="text-xl font-bold mb-4">Global Settings</h2>
    <p className="text-sm text-gray-600">Configure outlet details, printers, and user permissions.</p>
  </div>;
}

export function BarTables() {
  const [activePopupTableId, setActivePopupTableId] = useState(null);
  const { tables } = useBarTableSync();

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
        
        const pItems = (pTable.kotHistory && pTable.kotHistory.length > 0) ? pTable.kotHistory.flatMap(k => k.items || []) : (pTable.items || []);
        const pCount = pItems.reduce((sum, i) => sum + i.q, 0);
        const pCaptainName = CAPTAINS.find(c => c.id === pTable.captainId)?.name || pTable.captainId || 'Staff';
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40 animate-in fade-in duration-200" onClick={() => setActivePopupTableId(null)}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
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
  const [unifiedMenu, setUnifiedMenu] = useState(null);
  const [unifiedLoading, setUnifiedLoading] = useState(true);
  const [barMenuTab, setBarMenuTab] = useState('food');
  const [activeVenueId, setActiveVenueId] = useState(BAR_VENUE_PRICE_COLUMNS[0].id);
  const [filter, setFilter] = useState('');

  // Fetch unified menu for bar
  useEffect(() => {
    setUnifiedLoading(true);
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

  const refreshMenu = () => {
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
  };

  // Listen for menu update events to refresh admin panel
  useEffect(() => {
    const handleMenuUpdate = (event) => {
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
            img: item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop',
            desc: item.description || '',
            menuType: item.menuType,
            isAvailable: item.isActive,
            variants: item.variants?.map(v => ({...v, price: Number(v.price)})),
            printerTarget: item.printerTarget,
            unit: item.unit,
            mlPerUnit: item.mlPerUnit
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
        (!filter || item.n.toLowerCase().includes(filter.toLowerCase()))
    );
  }, [menuItems, barMenuTab, filter]);

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
  };

  // Cloudinary direct upload — bypasses backend proxy for 2-4s vs 10-15s latency
  const uploadImageToCloudinary = async (base64DataUri, itemName = '') => {
    // Convert base64 data URI → Blob for multipart/form-data upload
    const [, b64] = base64DataUri.split(',');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    const formData = new FormData();
    formData.append('file', blob, 'image.jpg');
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'softshape-vgrand-menu');
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
    patch.venuePrices = editItem.venuePrices || {};   // updateBarMenuItem maps patch.img → body.imageUrl

    updateBarMenuItem(editItem.id, patch, API_BASE);
    setEditSaving(false);
    setEditItem(null);
    showToast('Item updated');
  };


  // Availability toggle
  const toggleAvailability = (item) => {
    toggleBarMenuAvailability(
      item.id,
      API_BASE,
      () => showToast(item.isAvailable === false ? 'Item enabled' : 'Item disabled'),
      () => showToast('Toggle failed', 'error')
    );
  };

  // Delete
  const confirmDelete = async () => {
    if (!deleteTarget || deleteWorking) return; // guard double-tap
    setDeleteWorking(true);
    try {
      const res = await fetch(`${API_BASE}/api/bar/menu/items/${deleteTarget.id}`, { method: 'DELETE' });
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
          const base64 = await new Promise((resolve, reject) => {
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
      };
      const res = await fetch(`${API_BASE}/api/bar/menu/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          <BarMenuToggle active={barMenuTab} onChange={setBarMenuTab} variant="admin" />
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
        </div>
      </div>


      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {BAR_VENUE_PRICE_COLUMNS.map((venue) => (
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
      </div>

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
            className={`flex items-center justify-between p-3 bg-white rounded-xl border transition ${item.isAvailable === false ? 'border-gray-200 opacity-60' : 'border-gray-100'}`}
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
                <p className="text-[13px] font-black text-gray-900">₹{item.variants[0].price}</p>
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
              <button
                onClick={() => toggleAvailability(item)}
                title={item.isAvailable === false ? 'Mark available' : 'Mark unavailable'}
                className={`text-[11px] px-2 py-0.5 rounded-full font-bold border transition ${item.isAvailable === false ? 'border-gray-300 text-gray-400 bg-gray-50' : 'border-green-300 text-green-700 bg-green-50'}`}
              >
                {item.isAvailable === false ? 'Off' : 'On'}
              </button>

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
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Price (₹)</label>
                <input
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
                />
              </div>
            )}

            {editItem.variants.length > 1 && (
              <p className="text-[11px] text-gray-400 font-bold">Multi-variant pricing — edit from backend</p>
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
              <input value={addCategory} onChange={(e) => setAddCategory(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-bold focus:outline-none focus:border-[#E53935]"
                placeholder="e.g. Starters" />
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
    </div>
  );
}

