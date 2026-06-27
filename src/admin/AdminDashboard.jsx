import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Table2,
  UtensilsCrossed,
  ClipboardList,
  Receipt,
  ChartNoAxesCombined,
  DollarSign,
  Megaphone,
  Camera,
  Package,
  Sparkles,
  Settings,
  LogOut,
  Bot,
  Send,
  Star,
  AlertCircle,
  Printer,
  Users,
  QrCode,
  Tag,
  Store
} from 'lucide-react';
import {
  Dashboard, Tables, MenuPage, Orders, Reports, Payroll, Marketing, Pricing, Inventory, BarTables, BarMenuPage, KitchenInventory, StaffManagement
} from './AdminComponents';
import SettingsPage from './components/SettingsPage';
import { useAuth } from '../context/AuthContext';
import OfflineStatusBar from '../shared/components/OfflineStatusBar';
import { apiFetch } from '../services/apiConfig';
import SurveillanceDashboard from './SurveillanceDashboard';
import AIDishCreationModal from './AIDishCreationModal';
import TodaySpecials from './TodaySpecials';
import AdminTransactions from './AdminTransactions';
import { useSocket } from '../hooks/useSocket';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { getTenantScopedKey } from '../utils/cacheKeys';
import { modalBackdropVariants, modalContentVariants, springs, useMotionConfig } from '../shared/animations';
import { useTableSync } from '../services/tableSyncService';
import { fetchTransactions } from '../services/orderApi';

import CaptainPerformanceDashboard from '../captain/CaptainPerformanceDashboard';
import PrinterSettingsPage from './printers/PrinterSettingsPage';
import TableQRCodes from './TableQRCodes';
import PriceProfilesPage from './PriceProfilesPage';
import OutletsOverview from './OutletsOverview';

const navItems = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["tables", "Tables", Table2],
  ["menu", "Menu", UtensilsCrossed],
  ["specials", "Today Specials", Star],
  ["orders", "Online Orders", ClipboardList],
  ["transactions", "Transactions", Receipt],
  ["reports", "Reports", ChartNoAxesCombined],
  ["staff", "Staff", Users],
  ["captains", "Captain Analytics", ChartNoAxesCombined],
  ["payroll", "Payroll", DollarSign],
  ["kitchen-inventory", "Kitchen/Bar Inventory", UtensilsCrossed],
  ["marketing", "Marketing AI", Megaphone],
  ["surveillance", "Surveillance", Camera],
  ["pricing", "Pricing", Sparkles],
  ["price-profiles", "Price Profiles", Tag],
  ["settings", "Settings", Settings],
  ["printers", "Printers", Printer],
  ["qr-codes", "QR Codes", QrCode],
  ["outlets-overview", "My Outlets", Store],
];

function getInventoryLabel(enabledModules) {
  if (enabledModules?.bar && enabledModules?.food) return "Kitchen/Bar Inventory";
  if (enabledModules?.bar) return "Bar Inventory";
  if (enabledModules?.food) return "Kitchen Inventory";
  return "Inventory";
}

const AdminDashboard = ({ role = 'admin', onLogout }) => {
  const { shouldReduce } = useMotionConfig();
  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem(getTenantScopedKey('admin_active_tab'));
    if (role === 'manager' && saved !== 'tables' && saved !== 'captains') return 'tables';
    if (saved === 'pos') return 'dashboard';
    return saved || (role === 'manager' ? 'tables' : 'dashboard');
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
  const [activityLog, setActivityLog] = useState([]);
  const [kitchenLowStockAlerts, setKitchenLowStockAlerts] = useState([]);

  const { setTables } = useTableSync();
  const { restaurant, setRestaurant } = useAuth();
  const enabledModules = restaurant?.enabledModules || {};
  const activeOutlet = enabledModules.bar && enabledModules.food ? 'both'
    : enabledModules.bar && !enabledModules.food ? 'bar'
    : 'restaurant';
  const socket = useSocket(getCurrentRestaurantId());

  // ── Hydrate restaurant config on mount and sync into AuthContext so the
  // header, theme, plan badge, and receipts all read live tenant data. ──
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/restaurant/me')
      .then((data) => {
        if (cancelled || !data?.restaurant) return;
        setRestaurant(data.restaurant);
      })
      .catch((err) => console.warn('[AdminDashboard] restaurant/me failed:', err.message));
    return () => { cancelled = true; };
  }, [setRestaurant]);

  // Fallback: refresh enabledModules for existing sessions
  useEffect(() => {
    if (!restaurant?.enabledModules) {
      apiFetch('/api/auth/me')
        .then(data => {
          if (data?.restaurant?.enabledModules) {
            setRestaurant(prev => ({ ...prev, ...data.restaurant }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const [restaurantTxns] = await Promise.allSettled([
        fetchTransactions(getCurrentRestaurantId(), 500),
      ]);
      const transactions = [
        ...(restaurantTxns.status === 'fulfilled' ? restaurantTxns.value : []),
      ];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayTxns = transactions.filter(txn => {
        const txnDate = new Date(txn.paidAt || txn.createdAt);
        return txnDate >= todayStart;
      });

      setRevenue(Math.round(todayTxns.reduce((sum, txn) => sum + Number(txn.grandTotal ?? txn.amount ?? 0), 0)));
      setOrdersCount(todayTxns.length);
    } catch (err) {
      console.warn('[AdminStats] Failed to load stats:', err.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

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
      pushLog(`Table ${table.number} â†’ ${table.workflowStatus || table.status}`, "info");
    };

    socket.on("order:created", onOrderCreated);
    socket.on("order:updated", onOrderUpdated);
    socket.on("billing:requested", onBillingRequested);
    socket.on("order:paid", onOrderPaid);
    socket.on("table:updated", onTableUpdated);

    // Listen for menu update events (from other admin sessions or other panels)
    const onMenuItemUpdated = (payload) => {
      console.log('[AdminDashboard] Received menu-item-updated:', payload);
      // Dispatch window event for menuSyncService/barMenuSyncService to pick up
      window.dispatchEvent(new CustomEvent('menu-item-updated', { detail: payload }));
    };
    socket.on('menu-item-updated', onMenuItemUpdated);

    // Kitchen low-stock alerts (Phase 5)
    const onKitchenLowStock = (payload) => {
      console.log('[AdminDashboard] Kitchen low-stock:', payload);
      setKitchenLowStockAlerts((prev) => {
        const filtered = prev.filter((a) => a.ingredientId !== payload.ingredientId);
        return [...filtered, { ...payload, timestamp: Date.now() }];
      });
    };
    socket.on('kitchen:low-stock', onKitchenLowStock);

    return () => {
      socket.off("order:created", onOrderCreated);
      socket.off("order:updated", onOrderUpdated);
      socket.off("billing:requested", onBillingRequested);
      socket.off("order:paid", onOrderPaid);
      socket.off("table:updated", onTableUpdated);
      socket.off('menu-item-updated', onMenuItemUpdated);
      socket.off('kitchen:low-stock', onKitchenLowStock);
    };
  }, [socket, setTables]);

  // â”€â”€ Real stats fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    let cancelled = false;

    const loadStatsEffect = async () => {
      await loadStats();
      if (cancelled) return;
    };

    loadStatsEffect();
    const interval = setInterval(loadStatsEffect, 60000);

    const onOrderPaidRefresh = () => loadStatsEffect();
    if (socket) socket.on('order:paid', onOrderPaidRefresh);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (socket) socket.off('order:paid', onOrderPaidRefresh);
    };
  }, [socket, activeOutlet, loadStats]);

  const moduleGatedNavItems = navItems
    .map(([key, label, Icon]) => {
      if (key === 'kitchen-inventory') {
        return [key, getInventoryLabel(enabledModules), Icon];
      }
      return [key, label, Icon];
    })
    .filter(([key]) => {
      if (key === 'specials') return true;
      if (key === 'surveillance') return enabledModules.surveillance === true;
      if (key === 'pricing') return enabledModules.pricing !== false;
      if (key === 'tables') return enabledModules.tables !== false || enabledModules.food !== false;
      if (key === 'menu') return enabledModules.food !== false || enabledModules.bar !== false;
      if (key === 'orders') return enabledModules.food !== false || enabledModules.bar !== false;
      if (key === 'transactions') return true;
      if (key === 'reports') return true;
      if (key === 'captains') return enabledModules.tables !== false;
      if (key === 'payroll') return enabledModules.payroll !== false;
      if (key === 'marketing') return enabledModules.marketing !== false;
      if (key === 'kitchen-inventory') return enabledModules.food !== false || enabledModules.bar_inventory === true || enabledModules.bar !== false;
      if (key === 'settings') return true;
      if (key === 'printers') return true;
      if (key === 'outlets-overview') return restaurant?.outletCount > 1;
      return enabledModules[key] !== false;
    });

  const displayNavItems = role === 'manager'
    ? moduleGatedNavItems.filter(item => item[0] === 'tables' || item[0] === 'captains')
    : moduleGatedNavItems;

  const title = displayNavItems.find((x) => x[0] === page)?.[1] ?? "Dashboard";

  const trialDaysLeft = restaurant?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(restaurant.trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-[#FFF5F5] text-[#1A1A1A] font-sans">
      <OfflineStatusBar />
      {/* Trial banner */}
      {restaurant?.billingStatus === 'trialing' && trialDaysLeft !== null && (
        <div className={`sticky top-0 z-[70] px-4 py-2 text-center text-xs font-black uppercase tracking-widest ${trialDaysLeft <= 7 ? 'bg-red-600 text-white' : 'bg-yellow-400 text-yellow-900'}`}>
          {trialDaysLeft <= 0
            ? 'Your trial has expired. Please upgrade to continue.'
            : `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}. Upgrade now to keep full access.`}
        </div>
      )}

      {/* Suspension overlay */}
      {restaurant?.billingStatus === 'suspended' && (
        <div className="fixed inset-0 z-[100] bg-white/95 flex flex-col items-center justify-center p-8">
          <AlertCircle size={64} className="text-red-600 mb-6" />
          <h2 className="text-2xl font-black text-gray-900 mb-2">Account Suspended</h2>
          <p className="text-gray-600 mb-8 text-center max-w-md">
            Your subscription has been suspended. Please contact support to reactivate your account.
          </p>
          <a
            href="https://wa.me/919999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-[#E53935] text-white rounded-xl font-black uppercase tracking-widest hover:bg-[#B71C1C] transition-colors"
          >
            Contact Support
          </a>
        </div>
      )}

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
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-white/80 hover:text-white">âœ•</button>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-white/90 flex-shrink-0 mb-2 mt-4">
            <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
            System Ready
          </div>

          <div className="mt-6 flex-grow overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {displayNavItems.map(([k, label, Icon]) => (
              <button key={k} onClick={() => { setPage(k); localStorage.setItem(getTenantScopedKey('admin_active_tab'), k); setIsSidebarOpen(false); }} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${page === k ? "bg-white text-[#B71C1C]" : "text-white hover:bg-white/10"}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-black/5 flex-shrink-0">
          <div className="flex items-center justify-between rounded-lg border border-white/20 p-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="h-7 w-7 rounded-full bg-white/20 flex-shrink-0" />
              <div className="text-[10px] font-bold truncate">{role === 'manager' ? 'Manager User' : 'Admin User'}</div>
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
            <div className="flex flex-col overflow-hidden">
              <div className="text-base md:text-xl font-black truncate tracking-tight">{title}</div>
              {restaurant?.name && (
                <div className="flex items-center gap-2 -mt-0.5">
                  <span className="text-[11px] font-bold text-gray-500 truncate">{restaurant.name}</span>
                  {restaurant.plan && (
                    <span className="rounded-full bg-[#FFEBEE] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#B71C1C]">
                      {restaurant.plan}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="hidden lg:block text-xs font-medium text-gray-500">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[#B71C1C] text-white flex items-center justify-center text-sm font-black">
              {(restaurant?.name?.[0] || 'A').toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-grow overflow-y-auto p-4 md:p-6 bg-[#FFF5F5]">
          {page === "dashboard" && <Dashboard revenue={revenue} ordersCount={ordersCount} activityLog={activityLog} statsLoading={statsLoading} />}
          {page === "tables" && (activeOutlet === 'restaurant' || activeOutlet === 'both') && <Tables onOpen={() => { }} />}
          {page === "tables" && activeOutlet === 'bar' && <BarTables />}
          {page === "menu" && (activeOutlet === 'restaurant' || activeOutlet === 'both') && <MenuPage onAddDish={() => setDishModalOpen(true)} />}
          {page === "menu" && activeOutlet === 'bar' && <BarMenuPage />}
          {page === "specials" && <TodaySpecials />}
          {page === "orders" && <Orders />}
          {page === "transactions" && <AdminTransactions onStatsRefresh={loadStats} />}
          {page === "reports" && <Reports />}
          {page === "captains" && (
            <CaptainPerformanceDashboard captains={[]} recentSoldItems={[]} />
          )}
          {page === "payroll" && <Payroll onPayslip={() => { }} />}
          {page === "kitchen-inventory" && <KitchenInventory />}
          {page === "marketing" && <Marketing upload={mUpload} setUpload={setMUpload} uploadRef={mUploadRef} generated={mGenerated} setGenerated={setMGenerated} posted={mPosted} setPosted={setMPosted} />}
          {page === "surveillance" && <SurveillanceDashboard onIncident={() => { }} />}
          {page === "inventory" && <Inventory />}
          {page === "pricing" && <Pricing />}
          {page === "price-profiles" && <PriceProfilesPage />}
          {page === "settings" && <SettingsPage onNavigate={setPage} />}
          {page === "printers" && <PrinterSettingsPage />}
          {page === "qr-codes" && <TableQRCodes />}
          {page === "staff" && <StaffManagement />}
          {page === "outlets-overview" && <OutletsOverview />}
        </main>
      </div>

      {role !== 'manager' && (
        <>
          <motion.button
            drag
            dragMomentum={false}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSpireOpen(true)}
            className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-[#E53935] px-4 py-2.5 text-white hover:bg-[#B71C1C] shadow-2xl font-black uppercase tracking-widest text-[10px] transition-colors group cursor-grab active:cursor-grabbing"
          >
            <Sparkles size={14} className="group-hover:rotate-12 transition-transform" /> Ask Spire âœ¨
          </motion.button>
          <AIDishCreationModal open={dishModalOpen} onClose={() => setDishModalOpen(false)} onSave={() => setDishModalOpen(false)} />
        </>
      )}

      {/* Kitchen low-stock toast notifications */}
      {kitchenLowStockAlerts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {kitchenLowStockAlerts.map((alert) => (
            <div
              key={alert.ingredientId}
              className="bg-amber-50 border border-amber-300 rounded-xl p-3 shadow-lg flex items-start gap-3"
            >
              <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">Low Stock: {alert.name}</p>
                <p className="text-xs text-amber-700">
                  {alert.currentStock} {alert.unit} left (reorder at {alert.reorderLevel} {alert.unit})
                </p>
              </div>
              <button
                onClick={() => setKitchenLowStockAlerts((prev) => prev.filter((a) => a.ingredientId !== alert.ingredientId))}
                className="text-amber-400 hover:text-amber-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
      {spireOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={modalBackdropVariants}
            transition={shouldReduce ? { duration: 0 } : { duration: 0.3 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={() => setSpireOpen(false)}
          />
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={shouldReduce ? { duration: 0 } : springs.gentle}
            className="relative w-full max-w-[450px] bg-white h-full shadow-2xl flex flex-col"
          >
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
              <button onClick={() => setSpireOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">âœ•</button>
            </div>

            <div className="flex-grow overflow-y-auto p-8 space-y-8 bg-[#FFF9F9]">
              <div className="flex justify-end">
                <div className="bg-white p-5 rounded-3xl rounded-tr-none border border-red-50 text-sm font-medium shadow-sm max-w-[85%] text-gray-700 leading-relaxed">
                  Where did my 50kg chicken go today?
                </div>
              </div>

              <div className="bg-white p-8 rounded-[40px] border border-red-100 shadow-sm space-y-6">
                <div className="flex items-center gap-2 text-[#B71C1C]">
                  <Sparkles size={18} />
                  <p className="text-[11px] font-black uppercase tracking-[0.2em]">Spire Intelligence</p>
                </div>
                <p className="text-base font-bold text-gray-900 leading-tight">
                  Analyzing sales, inventory logs, and camera feeds...
                </p>
                <ul className="space-y-3 text-sm font-bold text-gray-700">
                  <li className="flex gap-2"><span>â€¢</span> 12.5kg used in 50 Chicken Dum Biryani plates</li>
                  <li className="flex gap-2"><span>â€¢</span> 35kg remains in cold storage (Fridge 2)</li>
                  <li className="flex gap-2 text-[#E53935] font-black"><span>â€¢</span> 2.5kg discrepancy found.</li>
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
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
