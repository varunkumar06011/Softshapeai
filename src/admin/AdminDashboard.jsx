// ─────────────────────────────────────────────────────────────────────────────
// AdminDashboard — Main admin dashboard with tabbed navigation for all modules
// ─────────────────────────────────────────────────────────────────────────────
// Root component for the admin portal. Provides tabbed navigation between:
//   - Dashboard (overview stats, live orders, revenue charts)
//   - Tables (table management, QR codes, floor/section layout)
//   - Menu (menu items, categories, bulk import, AI parsing)
//   - Orders (live order tracking, KOT management)
//   - Billing (transactions, settlement, GST)
//   - Reports (sales, GST, captain, section, payment reports with PDF/Excel export)
//   - Today's Specials (special items, captain targets)
//   - Surveillance (camera monitoring — TODO WIP)
//   - Inventory (kitchen and bar inventory)
//   - AI Tools (AI dish creation, creative engine — TODO WIP)
//   - Settings (restaurant profile, GST, printer config, app downloads)
//
// Accessible to ADMIN and OWNER roles only. Uses Framer Motion for transitions.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  Bot,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  AlertCircle,
  Store,
  ChevronDown,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import OfflineStatusBar from '../shared/components/OfflineStatusBar';
import { apiFetch } from '../services/apiConfig';
import AIDishCreationModal from './AIDishCreationModal';
import { useSocket } from '../hooks/useSocket';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { modalBackdropVariants, modalContentVariants, springs, useMotionConfig } from '../shared/animations';
import { useTableSync } from '../services/tableSyncService';
import { authService } from '../services/authService';
import { reconnectSocket } from '../hooks/useSocket';
import { sendSpireMessage } from '../services/spireAgent';

import { adminRoutes, managerRoutes, isRouteEnabled, getInventoryLabel, preloadAdminSections } from './adminRoutes.jsx';
import AdminRouteGuard from './AdminRouteGuard';

const AdminDashboard = ({ role: roleProp = 'admin', onLogout }) => {
  const role = roleProp?.toLowerCase() || 'admin';
  const { shouldReduce } = useMotionConfig();
  const location = useLocation();
  const navigate = useNavigate();

  // Derive current section from URL — the URL is the single source of truth.
  // No more useState + localStorage for active tab.
  const page = useMemo(() => {
    const subPath = location.pathname.replace('/admin/dashboard/', '').replace('/admin/dashboard', '');
    return subPath.split('/')[0] || 'dashboard';
  }, [location.pathname]);

  // Preload the shared AdminComponents chunk in the background so Menu,
  // Tables, Dashboard, etc. don't hit the network on first click.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [spireOpen, setSpireOpen] = useState(false);
  const [spireMessages, setSpireMessages] = useState([]);
  const [spireInput, setSpireInput] = useState('');
  const [spireLoading, setSpireLoading] = useState(false);
  const [spireVoiceEnabled, setSpireVoiceEnabled] = useState(true);
  const [spireSpeechSupported, setSpireSpeechSupported] = useState(false);
  const [spireListening, setSpireListening] = useState(false);
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [showOutletSwitcher, setShowOutletSwitcher] = useState(false);
  const spireMessagesEndRef = useRef(null);

  useEffect(() => {
    preloadAdminSections();
  }, []);

  useEffect(() => {
    if (spireOpen) {
      const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
      setSpireSpeechSupported(!!supported);
    }
  }, [spireOpen]);

  useEffect(() => {
    if (spireMessagesEndRef.current) {
      spireMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [spireMessages, spireLoading]);
  const accessibleOutlets = authService.getAccessibleOutlets();

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
  const { restaurant, setRestaurant, setAuth } = useAuth();
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
      const todayISO = new Date().toISOString().slice(0, 10);
      const res = await apiFetch(`/api/reports/daily-sales?startDate=${todayISO}&endDate=${todayISO}`);
      const data = await res.json();
      setRevenue(Math.round(data.summary?.totalRevenue ?? 0));
      setOrdersCount(data.summary?.totalTransactions ?? 0);
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

  // Build visible routes from the single adminRoutes config — drives both
  // the sidebar nav buttons and the nested <Route> definitions.
  const visibleRoutes = useMemo(() => {
    return adminRoutes
      .map(r => r.key === 'kitchen-inventory' ? { ...r, label: getInventoryLabel(enabledModules) } : r)
      .filter(r => {
        if (role === 'manager' && !managerRoutes.includes(r.key)) return false;
        return isRouteEnabled(r.key, enabledModules);
      });
  }, [enabledModules, role]);

  const title = visibleRoutes.find((r) => r.key === page)?.label ?? "Dashboard";

  // Helper passed to SettingsPage instead of raw setPage — child components
  // never construct URL paths themselves.
  const goToSection = useCallback((key) => {
    navigate(`/admin/dashboard/${key}`);
  }, [navigate]);

  // Context object for passing props to route elements via cloneElement.
  // Built once per render, consumed by routes that declare a props function.
  const routeCtx = useMemo(() => ({
    revenue, ordersCount, activityLog, statsLoading,
    activeOutlet, loadStats,
    onAddDish: () => setDishModalOpen(true),
    goToSection,
    mUpload, setMUpload, mUploadRef, mGenerated, setMGenerated, mPosted, setMPosted,
  }), [revenue, ordersCount, activityLog, statsLoading, activeOutlet, loadStats,
       goToSection, mUpload, mGenerated, mPosted]);

  const handleQuickSwitch = async (outletId) => {
    setShowOutletSwitcher(false);
    try {
      const { token, user, restaurant: newRestaurant } = await authService.switchOutlet(outletId);
      setAuth({ token, user, restaurant: newRestaurant });
      reconnectSocket(token);
      // Stay on current section — URL is source of truth, section re-mounts
      // with new outlet's data. If section is not enabled for new outlet,
      // AdminRouteGuard redirects to dashboard synchronously.
      if (page === 'dashboard') loadStats();
    } catch (err) {
      alert(err.message || 'Failed to switch outlet');
    }
  };

  const trialDaysLeft = restaurant?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(restaurant.trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // ── Spire AI handlers ─────────────────────────────────────────────────────
  const handleSpireSubmit = useCallback(async (e, overrideText) => {
    e?.preventDefault();
    const text = (overrideText || spireInput).trim();
    if (!text) return;

    const userMessage = { role: 'user', text };
    setSpireMessages(prev => [...prev, userMessage]);
    setSpireInput('');
    setSpireLoading(true);

    try {
      const reply = await sendSpireMessage(text);
      const assistantMessage = { role: 'assistant', text: reply.answer, language: reply.language };
      setSpireMessages(prev => [...prev, assistantMessage]);
      if (spireVoiceEnabled) {
        speakSpireReply(reply.answer, reply.language);
      }
    } catch (err) {
      const errorMessage = { role: 'assistant', text: `Sorry, I couldn't fetch that: ${err.message}`, isError: true };
      setSpireMessages(prev => [...prev, errorMessage]);
    } finally {
      setSpireLoading(false);
    }
  }, [spireInput, spireVoiceEnabled]);

  const sendSpireQuickAction = useCallback((text) => {
    handleSpireSubmit({ preventDefault: () => {} }, text);
  }, [handleSpireSubmit]);

  const speakSpireReply = useCallback((text, language) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'te' ? 'te-IN' : 'en-IN';

    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.lang === utterance.lang);
      if (match) utterance.voice = match;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = trySpeak;
    } else {
      trySpeak();
    }
  }, []);

  const startSpireListening = useCallback(() => {
    if (!spireSpeechSupported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'te-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setSpireListening(true);
    recognition.onend = () => setSpireListening(false);
    recognition.onerror = () => setSpireListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSpireInput(transcript);
      setTimeout(() => {
        handleSpireSubmit({ preventDefault: () => {} });
      }, 0);
    };

    recognition.start();
  }, [spireSpeechSupported, handleSpireSubmit]);

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
            {visibleRoutes.map((r) => (
              <button key={r.key} onClick={() => { navigate(`/admin/dashboard/${r.key}`); setIsSidebarOpen(false); }} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${page === r.key ? "bg-white text-[#B71C1C]" : "text-white hover:bg-white/10"}`}>
                <r.icon size={16} /> {r.label}
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
            {/* Outlet Switcher Dropdown */}
            {accessibleOutlets.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowOutletSwitcher(!showOutletSwitcher)}
                  className="flex items-center gap-2 rounded-lg border border-[#FFCDD2] bg-[#FFEBEE] px-3 py-1.5 text-xs font-bold text-[#B71C1C] hover:bg-[#FFCDD2] transition-colors"
                >
                  <Store size={14} />
                  <span className="hidden sm:inline max-w-[120px] truncate">{restaurant?.name}</span>
                  <ChevronDown size={14} />
                </button>
                {showOutletSwitcher && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowOutletSwitcher(false)} />
                    <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-[#FFCDD2] bg-white shadow-xl z-50 py-1">
                      {accessibleOutlets.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => handleQuickSwitch(o.id)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[#FFF5F5] ${
                            o.id === restaurant?.id ? 'font-bold text-[#B71C1C]' : 'text-gray-700'
                          }`}
                        >
                          {o.id === restaurant?.id && <CheckCircle size={14} className="text-[#B71C1C]" />}
                          <span className="truncate">{o.name}</span>
                        </button>
                      ))}
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={() => { setShowOutletSwitcher(false); navigate('/admin/dashboard/outlets-overview'); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-[#B71C1C]"
                        >
                          <ArrowRight size={14} /> Manage all outlets
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="h-8 w-8 rounded-full bg-[#B71C1C] text-white flex items-center justify-center text-sm font-black">
              {(restaurant?.name?.[0] || 'A').toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-grow overflow-y-auto p-4 md:p-6 bg-[#FFF5F5]">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3">
              <div className="w-8 h-8 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-gray-400">Loading section…</span>
            </div>
          }>
            <Routes>
              <Route index element={<Navigate to="dashboard" replace search={location.search} />} />
              {adminRoutes.map((r) => {
                const elementWithProps = r.props
                  ? React.cloneElement(r.element, r.props(routeCtx))
                  : r.element;
                return (
                  <Route key={r.key} path={r.key} element={
                    <AdminRouteGuard
                      allowedRoles={r.roles}
                      role={role}
                      routeKey={r.key}
                      enabledModules={enabledModules}
                      isRouteEnabledFn={isRouteEnabled}
                    >
                      {elementWithProps}
                    </AdminRouteGuard>
                  } />
                );
              })}
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Routes>
          </Suspense>
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
            <div className="bg-[#B71C1C] text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Bot size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight leading-none">Spire.ai Assistant</h3>
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1">Operational Intelligence</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSpireVoiceEnabled(v => !v)}
                  className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  title={spireVoiceEnabled ? 'Mute voice replies' : 'Enable voice replies'}
                >
                  {spireVoiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
                <button onClick={() => setSpireOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">✕</button>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto p-5 space-y-4 bg-[#FFF9F9]">
              {spireMessages.length === 0 && (
                <div className="text-center text-sm text-gray-500 py-8">
                  Ask about sales, items, attendance, purchases, or top sellers.
                </div>
              )}

              {spireMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-[#B71C1C] text-white rounded-tr-none'
                        : msg.isError
                        ? 'bg-red-50 text-red-700 border border-red-100 rounded-tl-none'
                        : 'bg-white text-gray-700 border border-red-50 rounded-tl-none shadow-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {spireLoading && (
                <div className="flex justify-start">
                  <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-red-50 shadow-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#B71C1C] rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-[#B71C1C] rounded-full animate-bounce delay-75" />
                    <div className="w-2 h-2 bg-[#B71C1C] rounded-full animate-bounce delay-150" />
                  </div>
                </div>
              )}

              <div ref={spireMessagesEndRef} />

              <div className="flex flex-wrap gap-2 pt-2">
                {[
                  { label: 'Today sales', text: 'today sales' },
                  { label: 'Today attendance', text: 'today attendance' },
                  { label: 'Top selling', text: 'top selling items today' },
                  { label: 'This week discounts', text: 'this week discounts' },
                  { label: 'Chicken sales', text: 'today chicken sales' },
                  { label: 'Purchases', text: 'this week purchases' },
                ].map((chip) => (
                  <button
                    key={chip.text}
                    onClick={() => sendSpireQuickAction(chip.text)}
                    className="px-3 py-1.5 bg-white border border-red-100 rounded-full text-xs font-semibold text-[#B71C1C] hover:bg-red-50 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 bg-white border-t border-gray-100">
              <form onSubmit={handleSpireSubmit} className="flex gap-3">
                <div className="flex-grow relative flex items-center gap-2">
                  <input
                    className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-red-100 pr-12"
                    placeholder="Ask Spire anything..."
                    value={spireInput}
                    onChange={(e) => setSpireInput(e.target.value)}
                  />
                  {spireSpeechSupported && (
                    <button
                      type="button"
                      onClick={startSpireListening}
                      disabled={spireListening}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
                        spireListening ? 'bg-red-100 text-[#B71C1C]' : 'hover:bg-gray-100 text-gray-500'
                      }`}
                      title={spireListening ? 'Listening...' : 'Voice input'}
                    >
                      {spireListening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={spireLoading || !spireInput.trim()}
                  className="h-14 w-14 bg-[#B71C1C] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-red-100 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={24} />
                </button>
              </form>
              {spireListening && (
                <p className="text-xs text-[#B71C1C] mt-2 text-center">Listening...</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
