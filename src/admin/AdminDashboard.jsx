import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { 
  LayoutDashboard, 
  Table2, 
  UtensilsCrossed, 
  ClipboardList, 
  ChartNoAxesCombined, 
  DollarSign, 
  Megaphone, 
  Camera, 
  Package, 
  Sparkles, 
  Settings, 
  LogOut, 
  Bell, 
  Search, 
  Bot,
  Send,
  Star
} from 'lucide-react';
import { 
  Dashboard, Tables, MenuPage, Orders, Reports, Payroll, Marketing, Pricing, SettingsPage, Inventory, BarTables, BarMenuPage
} from './AdminComponents';
import { useOutlet } from '../context/OutletContext';
import OutletToggle from '../shared/components/OutletToggle';
import SurveillanceDashboard from './SurveillanceDashboard';
import AIDishCreationModal from './AIDishCreationModal';
import TodaySpecials from './TodaySpecials';
import { useSocket } from '../hooks/useSocket';
import { RESTAURANT_ID } from '../services/tableApi';
import { BAR_ID } from '../services/barApiConfig';
import { useTableSync } from '../services/tableSyncService';
import { fetchTransactions } from '../services/orderApi';

const CaptainPerformanceDashboard = lazy(() => import("../captain/CaptainPerformanceDashboard"));

const navItems = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["tables", "Tables", Table2],
  ["menu", "Menu", UtensilsCrossed],
  ["specials", "Today Specials", Star],
  ["orders", "Orders", ClipboardList],
  ["reports", "Reports", ChartNoAxesCombined],
  ["captains", "Captain Analytics", ChartNoAxesCombined],
  ["payroll", "Payroll", DollarSign],
  ["marketing", "Marketing AI", Megaphone],
  ["surveillance", "Surveillance", Camera],
  ["inventory", "Inventory", Package],
  ["pricing", "Pricing", Sparkles],
  ["settings", "Settings", Settings],
];

const AdminDashboard = ({ onLogout }) => {
  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem('admin_active_tab');
    if (saved === 'pos') return 'dashboard';
    return saved || 'dashboard';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [spireOpen, setSpireOpen] = useState(false);
  const [dishModalOpen, setDishModalOpen] = useState(false);
  
  // Marketing AI State
  const [mUpload, setMUpload] = useState(null);
  const [mGenerated, setMGenerated] = useState(false);
  const [mPosted, setMPosted] = useState(false);
  const mUploadRef = useRef(null);
  
  // Shared State
  const [revenue, setRevenue] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activityLog, setActivityLog] = useState([
    { id: 1, text: "Raju closed Table 4 bill for ₹2,450", time: "2 min ago", type: "success" },
    { id: 2, text: "Lakshmi sent KOT for Table 12", time: "5 min ago", type: "info" },
  ]);
  const { setTables } = useTableSync();
  const { outlet } = useOutlet();
  const socket = useSocket(outlet === 'bar' ? BAR_ID : RESTAURANT_ID);

  useEffect(() => {
    const pushLog = (text, type = "info") => {
      setActivityLog((prev) => [
        { id: Date.now(), text, time: "Just now", type },
        ...prev,
      ].slice(0, 12));
    };

    const onOrderCreated = ({ order }) => pushLog(`New order for Table ${order?.table?.number || ''}`, "info");
    const onOrderUpdated = ({ order }) => pushLog(`Order ${order?.id?.slice(-6) || ''} updated`, "info");
    const onBillingRequested = ({ table }) => pushLog(`Billing requested for Table ${table?.number || ''}`, "warning");
    const onOrderPaid = ({ tableId }) => pushLog(`Payment completed for table ${tableId || ''}`, "success");
    
    const onTableUpdated = ({ table } = {}) => {
      if (!table) return;
      pushLog(`Table ${table.number} → ${table.workflowStatus || table.status}`, "info");
    };

    socket.on("order:created", onOrderCreated);
    socket.on("order:updated", onOrderUpdated);
    socket.on("billing:requested", onBillingRequested);
    socket.on("order:paid", onOrderPaid);
    socket.on("table:updated", onTableUpdated);

    return () => {
      socket.off("order:created", onOrderCreated);
      socket.off("order:updated", onOrderUpdated);
      socket.off("billing:requested", onBillingRequested);
      socket.off("order:paid", onOrderPaid);
      socket.off("table:updated", onTableUpdated);
    };
  }, [socket, setTables]);

  // ── Real stats fetch ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const [restaurantTxns, barTxns] = await Promise.allSettled([
          fetchTransactions(RESTAURANT_ID, 500),
          fetchTransactions(BAR_ID, 500),
        ]);
        const transactions = [
          ...(restaurantTxns.status === 'fulfilled' ? restaurantTxns.value : []),
          ...(barTxns.status === 'fulfilled' ? barTxns.value : []),
        ];
        if (cancelled) return;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayTxns = transactions.filter(txn => {
          const txnDate = new Date(txn.paidAt || txn.createdAt);
          return txnDate >= todayStart;
        });

        setRevenue(Math.round(todayTxns.reduce((sum, txn) => sum + (txn.amount || 0), 0)));
        setOrdersCount(todayTxns.length);
      } catch (err) {
        console.warn('[AdminStats] Failed to load stats:', err.message);
        // Keep at 0 on failure — don’t show stale fake data
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 60000);

    const onOrderPaidRefresh = () => loadStats();
    if (socket) socket.on('order:paid', onOrderPaidRefresh);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (socket) socket.off('order:paid', onOrderPaidRefresh);
    };
  }, [socket, outlet]);

  const title = navItems.find((x) => x[0] === page)?.[1] ?? "Dashboard";

  return (
    <div className="min-h-screen bg-[#FFF5F5] text-[#1A1A1A] font-sans">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed left-0 top-0 z-[60] flex h-[100dvh] w-[240px] flex-col bg-[#B71C1C] text-white transition-transform duration-300 md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col flex-grow overflow-hidden p-4">
          <div className="flex items-center justify-between flex-shrink-0 mb-2">
            <div className="bg-white p-4 rounded-[32px] shadow-2xl border border-white/10 aspect-square w-40 flex items-center justify-center">
              <img 
                src="/logo softshape.ai.png" 
                alt="Softshape.ai" 
                className="w-full h-full object-contain" 
              />
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-white/80 hover:text-white">✕</button>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-white/90 flex-shrink-0 mb-2 mt-4">
            <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
            System Ready
          </div>

          <div className="mt-6 flex-grow overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {navItems.map(([k, label, Icon]) => (
              <button key={k} onClick={() => { setPage(k); localStorage.setItem('admin_active_tab', k); setIsSidebarOpen(false); }} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${page === k ? "bg-white text-[#B71C1C]" : "text-white hover:bg-white/10"}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-black/5 flex-shrink-0">
          <div className="flex items-center justify-between rounded-lg border border-white/20 p-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="h-7 w-7 rounded-full bg-white/20 flex-shrink-0" />
              <div className="text-[10px] font-bold truncate">Admin User</div>
            </div>
            <LogOut size={14} className="flex-shrink-0 cursor-pointer hover:text-[#EF9A9A]" onClick={onLogout} />
          </div>
        </div>
      </aside>

      <div className="flex flex-col md:ml-[240px] h-[100dvh] overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#FFCDD2] bg-white px-4 md:px-6 shadow-sm">
            <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
              <button onClick={() => setIsSidebarOpen(true)} className="flex-shrink-0 rounded-md border border-[#FFCDD2] p-2 md:hidden">
                <LayoutDashboard size={18} />
              </button>
              <div className="text-base md:text-xl font-black truncate tracking-tight">{title}</div>
            </div>

            <div className="hidden lg:block text-xs font-medium text-gray-500">
               {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          <div className="flex items-center gap-3">
            <OutletToggle className="flex" />
            <button className="relative rounded-md border border-[#FFCDD2] p-2">
              <Bell size={16} />
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E53935] text-[9px] text-white">3</span>
            </button>
            <div className="h-8 w-8 rounded-full bg-[#FFEBEE]" />
          </div>
        </header>

        <main className="flex-grow overflow-y-auto p-4 md:p-6 bg-[#FFF5F5]">
          {page === "dashboard" && <Dashboard revenue={revenue} ordersCount={ordersCount} activityLog={activityLog} statsLoading={statsLoading} />}
          {page === "tables" && outlet === 'restaurant' && <Tables onOpen={() => {}} />}
          {page === "tables" && outlet === 'bar' && <BarTables />}
          {page === "menu" && outlet === 'restaurant' && <MenuPage onAddDish={() => setDishModalOpen(true)} />}
          {page === "menu" && outlet === 'bar' && <BarMenuPage />}
          {page === "specials" && <TodaySpecials />}
          {page === "orders" && <Orders />}
          {page === "reports" && <Reports />}
          {page === "captains" && (
            <Suspense fallback={<div className="p-4 bg-white border rounded-xl">Loading captain analytics...</div>}>
              <CaptainPerformanceDashboard captains={[]} recentSoldItems={[]} />
            </Suspense>
          )}
          {page === "payroll" && <Payroll onPayslip={() => {}} />}
          {page === "marketing" && <Marketing upload={mUpload} setUpload={setMUpload} uploadRef={mUploadRef} generated={mGenerated} setGenerated={setMGenerated} posted={mPosted} setPosted={setMPosted} />}
          {page === "surveillance" && <SurveillanceDashboard onIncident={() => {}} />}
          {page === "inventory" && <Inventory />}
          {page === "pricing" && <Pricing />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>

      <button onClick={() => setSpireOpen(true)} className="fixed bottom-6 right-6 z-30 flex items-center gap-3 rounded-full bg-[#E53935] px-6 py-4 text-white hover:bg-[#B71C1C] shadow-2xl font-black uppercase tracking-widest text-[11px] transition-all hover:scale-105 active:scale-95 group">
        <Sparkles size={18} className="group-hover:rotate-12 transition-transform" /> Ask Spire ✨
      </button>

      <AIDishCreationModal open={dishModalOpen} onClose={() => setDishModalOpen(false)} onSave={() => setDishModalOpen(false)} />

      {/* Spire.ai Assistant Side Drawer */}
      {spireOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setSpireOpen(false)} />
          <div className="relative w-full max-w-[450px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="bg-[#B71C1C] text-white p-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Bot size={24} />
                </div>
                <div>
                   <h3 className="text-xl font-black tracking-tight leading-none">Spire.ai Assistant</h3>
                   <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1">Operational Intelligence Active</p>
                </div>
              </div>
              <button onClick={() => setSpireOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">✕</button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-8 space-y-8 bg-[#FFF9F9]">
               <div className="flex justify-end">
                  <div className="bg-white p-5 rounded-3xl rounded-tr-none border border-red-50 text-sm font-medium shadow-sm max-w-[85%] text-gray-700 leading-relaxed">
                    Where did my 50kg chicken go today?
                  </div>
               </div>
               
               <div className="bg-white p-8 rounded-[40px] border border-red-100 shadow-sm space-y-6 animate-in zoom-in-95 duration-500">
                  <div className="flex items-center gap-2 text-[#B71C1C]">
                     <Sparkles size={18} />
                     <p className="text-[11px] font-black uppercase tracking-[0.2em]">Spire Intelligence</p>
                  </div>
                  <p className="text-base font-bold text-gray-900 leading-tight">
                    Analyzing sales, inventory logs, and camera feeds...
                  </p>
                  <ul className="space-y-3 text-sm font-bold text-gray-700">
                     <li className="flex gap-2"><span>•</span> 12.5kg used in 50 Chicken Dum Biryani plates</li>
                     <li className="flex gap-2"><span>•</span> 35kg remains in cold storage (Fridge 2)</li>
                     <li className="flex gap-2 text-[#E53935] font-black"><span>•</span> 2.5kg discrepancy found.</li>
                  </ul>
                  
                  <div className="relative aspect-[16/10] rounded-[32px] overflow-hidden bg-black group border-[3px] border-[#E53935] shadow-2xl">
                     <div className="absolute top-4 left-4 z-10 bg-[#E53935] text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">LIVE INCIDENT</div>
                     <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                     <div className="absolute inset-4 border-2 border-[#E53935]/30 rounded-2xl animate-pulse" />
                     
                     <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
                        <div>
                           <p className="text-xs font-black text-white">Unauthorized Access</p>
                           <p className="text-[9px] font-bold text-white/50">Zone: Cold Storage #2</p>
                        </div>
                        <p className="text-[10px] font-black text-white/70 tabular-nums">14:32:07</p>
                     </div>
                  </div>
               </div>
            </div>
            
            <div className="p-8 bg-white border-t border-gray-100">
               <div className="flex gap-3">
                  <div className="flex-grow relative">
                    <input className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-red-100" placeholder="Ask Spire anything..." />
                  </div>
                  <button className="h-14 w-14 bg-[#B71C1C] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-red-100 hover:scale-105 active:scale-95 transition-all"><Send size={24} /></button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
