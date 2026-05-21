import React, { useState, useMemo, useEffect } from 'react';
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
  RefreshCw,
  TrendingUp,
  TrendingDown,
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
  ArrowRightLeft
} from 'lucide-react';
import { 
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart 
} from 'recharts';
import { MENU_DATA } from '../data/menuData';
import UnifiedOrdersDashboard from './UnifiedOrdersDashboard';
import { getSmartRecommendation } from '../services/pricingEngine';
import { STYLES, generateRandomConfig } from '../services/creativeEngine';
import CreativeCanvas from '../shared/components/CreativeCanvas';

// Shared Styles
const btn = "rounded-md bg-[#E53935] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#c62828]";
const cardBase = "rounded-[10px] border border-[#FFCDD2]";
const card = cardBase + " bg-white";
const input = "w-full rounded-[4px] border border-[#FFCDD2] bg-white px-3 py-2 text-sm outline-none focus:border-[#E53935]";

export function Dashboard({ revenue, ordersCount, activityLog }) {
  const [tables, setTables] = useState(() => {
    const saved = localStorage.getItem('softshape_tables');
    return saved ? JSON.parse(saved) : Array.from({ length: 24 }, (_, i) => ({ id: i + 1, status: 'Free' }));
  });

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'softshape_tables' && e.newValue) {
        setTables(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const occupiedCount = tables.filter(t => t.status && t.status !== 'Free' && t.status !== 'available').length;
  const totalTables = tables.length;

  const sales = [{ d: "Mon", v: 32 }, { d: "Tue", v: 41 }, { d: "Wed", v: 47 }, { d: "Thu", v: 38 }, { d: "Fri", v: 55 }, { d: "Sat", v: 62 }, { d: "Sun", v: 71 }];
  return <div className="space-y-4 font-sans">
    <div className="rounded-[10px] border border-[#EF9A9A] bg-[#FFEBEE] p-4 text-sm md:text-base animate-fade-in flex items-center gap-3">
      <span className="text-xl">✨</span>
      <p className="font-medium">Live Operational Insight: <span className="font-bold text-[#B71C1C]">Chicken Dum Biryani</span> is moving 15% faster than usual. Average prep time is 12 mins.</p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {[
        { label: "Today's Revenue", value: `₹${revenue.toLocaleString()}`, sub: "↑12%", color: "text-[#2E7D32]" },
        { label: "Total Orders", value: ordersCount, sub: "live", color: "text-[#1A1A1A]" },
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

export function Pos({ onOrderComplete, onKOTSend }) {
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [kotStatus, setKotStatus] = useState(null);
  const [table, setTable] = useState("8");
  
  const availableCategories = useMemo(() => {
    const cats = new Set(MENU_DATA.map(item => item.c));
    return ["All", ...Array.from(cats)];
  }, []);

  const items = useMemo(() => {
    let filtered = MENU_DATA;
    if (cat !== "All") {
      filtered = filtered.filter(x => x.c === cat);
    }
    if (search) {
      filtered = filtered.filter(x => 
        x.n.toLowerCase().includes(search.toLowerCase()) ||
        x.c.toLowerCase().includes(search.toLowerCase())
      );
    }
    return filtered.slice(0, 50);
  }, [cat, search]);

  const subtotal = cart.reduce((a, c) => a + c.p * c.q, 0);
  const gst = subtotal * 0.05;
  const total = subtotal + gst;

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
            <input className={input + " pl-10 h-11"} placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" size={18} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {availableCategories.map((x) => (
              <button key={x} onClick={() => setCat(x)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${cat === x ? "border-[#E53935] bg-[#E53935] text-white shadow-md shadow-red-100" : "border-[#FFCDD2] bg-white text-[#6B6B6B] hover:bg-[#FFF5F5]"}`}>{x}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          {items.map((x) => (
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

export function Tables({ onOpen }) {
  const [tables, setTables] = useState(() => {
    const saved = localStorage.getItem('softshape_tables');
    if (saved) return JSON.parse(saved);
    return Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      status: 'Free'
    }));
  });

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'softshape_tables' && e.newValue) {
        setTables(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
           bgClass = "bg-[#FFF8E1] text-[#F57F17] border-[#F57F17] animate-pulse";
        } else if (t.status === 'Preparing') {
           bgClass = "bg-[#FFF3E0] text-[#E65100] border-[#E65100]";
        } else if (!isFree && !isReserved) {
           bgClass = "bg-[#B71C1C] text-white border-[#B71C1C]";
        } else if (isReserved) {
           bgClass = "bg-[#FFF3E0] text-[#8D4E00]";
        }

        let details = "Available";
        if (!isFree && !isReserved) {
           details = `${t.guests || 0} guests — ₹${t.currentBill || 0}`;
        } else if (isReserved) {
           details = t.details || "Reserved";
        }
        
        const label = isFree ? "Available" : isReserved ? `Reserved — ${details}` : `${t.status} — ${details}`;
        
        return <button key={t.id} onClick={() => !isFree && onOpen({ 
           id: t.id, 
           items: t.kotHistory ? t.kotHistory.flatMap(k => k.items).map(i => `${i.n} x${i.q}`).join(', ') : "View items", 
           time: t.time || "Recently", 
           bill: `₹${t.currentBill || 0}` 
        })} className={`${cardBase} ${bgClass} min-h-[96px] p-3 text-left transition-transform active:scale-95`}><p className="text-lg font-extrabold">T{t.id}</p><p className="text-[10px] font-semibold leading-tight">{label}</p></button>;
      })}
    </div>
    <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-3 border border-[#FFCDD2] shadow-sm">
      <span className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">Status:</span>
      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#B71C1C]" /><span className="text-xs font-medium">Occupied</span></div>
      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#E8F5E9] border border-[#1B5E20]" /><span className="text-xs font-medium">Available</span></div>
      <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#FFF3E0] border border-[#8D4E00]" /><span className="text-xs font-medium">Reserved</span></div>
    </div>
  </div>;
}

export function MenuPage({ onAddDish }) {
  const [filter, setFilter] = useState("");
  const items = useMemo(() => MENU_DATA.filter(x => x.n.toLowerCase().includes(filter.toLowerCase()) || x.c.toLowerCase().includes(filter.toLowerCase())), [filter]);
  return <div className={card + " p-4 font-sans"}>
    <div className="mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <div className="flex items-center gap-4 w-full sm:w-auto">
        <h3 className="font-semibold text-lg">Menu Items</h3>
        <input className={input + " h-9 w-48"} placeholder="Search menu..." value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <button className={btn} onClick={onAddDish}>+ Add Item</button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead>
          <tr className="border-b border-[#FFCDD2]">
            <th className="px-4 py-2">Image</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Price</th>
            <th className="px-4 py-2">Veg/Non</th>
            <th className="px-4 py-2">Available</th>
            <th className="px-4 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 50).map((item) => (
            <tr key={item.n} className="border-b border-[#FFEBEE] hover:bg-[#FFF5F5]">
              <td className="px-4 py-2"><div className="h-10 w-10 rounded-md bg-[#EF9A9A]" /></td>
              <td className="px-4 py-2 font-medium">{item.n}</td>
              <td className="px-4 py-2">{item.c}</td>
              <td className="px-4 py-2">₹{item.p}</td>
              <td className="px-4 py-2">
                <span className={`inline-flex h-2 w-2 rounded-full mr-2 ${item.t === "veg" ? "bg-green-600" : "bg-red-600"}`} />
                {item.t === "veg" ? "Veg" : "Non-Veg"}
              </td>
              <td className="px-4 py-2"><span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Available</span></td>
              <td className="px-4 py-2">
                <button className="text-blue-600 mr-3">✏️</button>
                <button className="text-red-600">🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}

export function Orders() {
  const rows = [["#1043", "Dine-In", "Table 8", "3", "₹1,382", "Preparing", "5 min ago", "View"], ["#1042", "Dine-In", "Table 7", "4", "₹850", "Ready", "12 min ago", "View"], ["#1041", "Delivery", "Swiggy — Kiran", "2", "₹890", "Dispatched", "18 min ago", "Track"], ["#1040", "Takeaway", "Walk-in", "1", "₹309", "Ready", "22 min ago", "View"], ["#1039", "Dine-In", "Table 12", "6", "₹2,100", "Served", "35 min ago", "Bill"], ["#1038", "Delivery", "Zomato — Ananya", "3", "₹1,100", "Delivered", "45 min ago", "Done"]];
  return <div className="space-y-4 font-sans">
    <UnifiedOrdersDashboard />
    <div className="flex gap-2 overflow-x-auto pb-1">{["Dine-In (48)", "Takeaway (23)", "Delivery (18)", "All (89)"].map((x, i) => <button key={x} className={`whitespace-nowrap rounded-md border px-3 py-1 text-sm ${i === 0 ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{x}</button>)}</div>
    <div className={card + " overflow-x-auto"}>
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-[#FFEBEE]">
          <tr><th className="p-3">Order ID</th><th className="p-3">Type</th><th className="p-3">Customer/Table</th><th className="p-3">Items</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Time</th><th className="p-3">Action</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-[#FFEBEE] hover:bg-[#FFF5F5]">
              <td className="p-3 font-semibold">{r[0]}</td><td className="p-3">{r[1]}</td><td className="p-3">{r[2]}</td><td className="p-3">{r[3]} items</td><td className="p-3 font-bold">{r[4]}</td>
              <td className="p-3"><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-700">{r[5]}</span></td>
              <td className="p-3 text-[#6B6B6B]">{r[6]}</td><td className="p-3"><button className="font-semibold text-[#B71C1C] hover:underline">{r[7]}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}

export function Reports() {
  const [timeRange, setTimeRange] = useState('Today');
  
  const data = useMemo(() => {
    if (timeRange === 'Today') {
      return {
        revenue: "₹48,250",
        orders: "124",
        aov: "₹389",
        topItem: "Chicken Biryani",
        trend: Array.from({ length: 24 }).map((_, i) => ({ time: `${i}:00`, rev: 1000 + Math.random() * 5000 })),
        sources: [{ name: "Dine-In", value: 65 }, { name: "Zomato", value: 20 }, { name: "Swiggy", value: 15 }]
      };
    }
    if (timeRange === 'This Week') {
      return {
        revenue: "₹3,47,250",
        orders: "892",
        aov: "₹389",
        topItem: "Paneer Butter Masala",
        trend: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => ({ time: d, rev: 40000 + Math.random() * 20000 })),
        sources: [{ name: "Dine-In", value: 55 }, { name: "Zomato", value: 25 }, { name: "Swiggy", value: 20 }]
      };
    }
    return {
      revenue: "₹14,82,500",
      orders: "3,842",
      aov: "₹385",
      topItem: "Chicken Biryani",
      trend: Array.from({ length: 30 }).map((_, i) => ({ time: i + 1, rev: 45000 + Math.random() * 15000 })),
      sources: [{ name: "Dine-In", value: 50 }, { name: "Zomato", value: 30 }, { name: "Swiggy", value: 20 }]
    };
  }, [timeRange]);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-[#FFEBEE] flex items-center justify-center text-[#B71C1C] shadow-inner">
            <ChartNoAxesCombined size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">Executive Summary</h2>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-2">Real-time Operational Analytics</p>
          </div>
        </div>
        <div className="flex w-full sm:w-auto bg-[#F4F4F5] p-1.5 rounded-2xl">
          {['Today', 'This Week', 'This Month'].map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`flex-grow sm:flex-grow-0 px-5 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${timeRange === range ? 'bg-white text-[#B71C1C] shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: data.revenue, sub: "+12.5% vs last period", icon: DollarSign, color: "text-green-600" },
          { label: "Orders Count", value: data.orders, sub: "+8.2% vs last period", icon: Package, color: "text-blue-600" },
          { label: "Avg Order Value", value: data.aov, sub: "-2.1% vs last period", icon: TrendingUp, color: "text-amber-600" },
          { label: "Top Selling Item", value: data.topItem, sub: "High Margin", icon: Star, color: "text-purple-600" }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm relative overflow-hidden group">
            <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${stat.color}`}>
              <stat.icon size={48} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">{stat.label}</p>
            <p className="text-2xl font-black text-gray-900">{stat.value}</p>
            <p className={`text-[10px] font-bold mt-2 ${stat.sub.includes('+') ? 'text-green-600' : 'text-red-600'}`}>{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-gray-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-[#B71C1C]" />
              Revenue Growth
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#B71C1C]" /> Gross Sales</div>
              <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#EF9A9A]" /> Projections</div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="99%" height="100%">
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B71C1C" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#B71C1C" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
                  itemStyle={{ fontWeight: 'bold', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="rev" stroke="#B71C1C" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm flex flex-col">
          <h3 className="font-black text-gray-900 mb-8 flex items-center gap-2">
            <Layers size={18} className="text-[#B71C1C]" />
            Order Attribution
          </h3>
          <div className="flex-grow flex flex-col justify-center">
            <div className="h-[200px] w-full relative">
              <ResponsiveContainer width="99%" height="100%">
                <PieChart>
                  <Pie 
                    data={data.sources} 
                    dataKey="value" 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60} 
                    outerRadius={85} 
                    paddingAngle={8}
                    stroke="none"
                  >
                    {data.sources.map((_, i) => <Cell key={i} fill={["#B71C1C", "#E53935", "#EF9A9A"][i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px] font-black text-gray-400 uppercase">Total</p>
                <p className="text-xl font-black text-gray-900">{data.orders}</p>
              </div>
            </div>
            <div className="mt-8 space-y-3">
              {data.sources.map((source, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#F4F4F5]">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${["bg-[#B71C1C]", "bg-[#E53935]", "bg-[#EF9A9A]"][i]}`} />
                    <span className="text-xs font-bold text-gray-700">{source.name}</span>
                  </div>
                  <span className="text-xs font-black text-gray-900">{source.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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

export function Inventory() {
  const stock = [
    { name: "Chicken", opening: "50 kg", purchased: "0", used: "15.2 kg", current: "34.8 kg", status: "OK", reorder: "10 kg", color: "text-[#E53935]" },
    { name: "Basmati Rice", opening: "100 kg", purchased: "0", used: "20 kg", current: "80 kg", status: "OK", reorder: "20 kg", color: "text-[#E53935]" },
    { name: "Mutton", opening: "15 kg", purchased: "0", used: "3 kg", current: "12 kg", status: "LOW", reorder: "10 kg", color: "text-[#E53935]" },
    { name: "Prawns", opening: "10 kg", purchased: "0", used: "2 kg", current: "8 kg", status: "OK", reorder: "5 kg", color: "text-[#E53935]" },
    { name: "Refined Oil", opening: "50 L", purchased: "0", used: "10 L", current: "40 L", status: "OK", reorder: "5 kg", color: "text-[#E53935]" }
  ];

  return (
    <div className="space-y-6 font-sans max-w-7xl mx-auto">
      <div className="bg-[#FFF1F2] p-5 rounded-2xl border border-[#FFE4E6] text-gray-800 text-sm font-medium">
        Spire.ai tracks every ingredient — ask anything
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-grow bg-white border border-[#FFCDD2] rounded-3xl px-8 py-5 text-sm text-gray-500 shadow-sm flex items-center">
           <span className="opacity-60 italic">Where did my 50kg chicken go today?</span>
        </div>
        <button className="w-full sm:w-auto bg-[#E53935] text-white px-10 py-5 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#B71C1C] transition-all shadow-xl shadow-red-100 active:scale-95">
          Ask Spire 
          <ArrowRightLeft size={16} />
        </button>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-[#FFCDD2] shadow-sm space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <p className="text-sm font-medium text-gray-500">Analyzing your 50kg chicken stock for today...</p>
        <div className="space-y-3 text-sm font-bold text-gray-800 leading-relaxed">
          <p className="flex items-center gap-3">
             <span className="text-gray-400">→</span> 
             <span>12.5kg used in 50 Chicken Dum Biryani plates (<span className="text-gray-500 font-medium">₹15,450 revenue</span>)</span>
          </p>
          <p className="flex items-center gap-3">
             <span className="text-gray-400">→</span> 
             <span>3.2kg used in Chicken Fry Piece Biryani — 8 orders (<span className="text-gray-500 font-medium">₹2,472</span>)</span>
          </p>
          <p className="flex items-center gap-3">
             <span className="text-gray-400">→</span> 
             <span>35kg currently in cold storage (Fridge #2, Zone B)</span>
          </p>
          <p className="flex items-center gap-3 text-[#E53935] font-black">
             <span>→ 2.5kg UNACCOUNTED</span> 
             <AlertCircle size={16} /> 
             <span className="font-medium">— checking cameras...</span>
          </p>
          <p className="flex items-center gap-3">
             <span className="text-gray-400">→</span> 
             <span>Found: CAM-04 at 14:32 — suspicious activity flagged</span>
          </p>
        </div>
        <button className="bg-[#E53935] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#B71C1C] transition-all active:scale-95 shadow-md">
          View Camera Incident
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-[#FFCDD2] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#FFF1F2] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-8 py-5 text-xs font-black text-gray-900">Item</th>
                <th className="px-8 py-5 text-xs font-black text-gray-900 text-center">Opening</th>
                <th className="px-8 py-5 text-xs font-black text-gray-900 text-center">Purchased</th>
                <th className="px-8 py-5 text-xs font-black text-gray-900 text-center">Used</th>
                <th className="px-8 py-5 text-xs font-black text-gray-900 text-center">Current</th>
                <th className="px-8 py-5 text-xs font-black text-gray-900 text-center">Status</th>
                <th className="px-8 py-5 text-xs font-black text-gray-900 text-center">Reorder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stock.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-5 font-black text-gray-900">{item.name}</td>
                  <td className="px-8 py-5 text-center font-bold text-gray-500">{item.opening}</td>
                  <td className="px-8 py-5 text-center font-black text-green-600">{item.purchased}</td>
                  <td className="px-8 py-5 text-center font-black text-[#E53935]">{item.used}</td>
                  <td className="px-8 py-5 text-center font-black text-gray-900">{item.current}</td>
                  <td className="px-8 py-5 text-center">
                     <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${item.status === 'OK' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {item.status} {item.status === 'LOW' && '⚠'}
                     </span>
                  </td>
                  <td className="px-8 py-5 text-center font-black text-[#E53935] underline decoration-dotted underline-offset-4">{item.reorder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
