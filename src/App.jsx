import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import PortalSelection from "./shared/components/PortalSelection";
import LoginScreen from "./shared/components/LoginScreen";
import AdminDashboard from "./admin/AdminDashboard";
import CashierDashboard from "./cashier/CashierDashboard";
import CaptainApp from "./captain/CaptainApp";
import UserMenuApp from "./user-menu/UserMenuApp";
import PrintStation from "./print-station/PrintStation";
import OnboardingWizard from "./onboarding/OnboardingWizard";
import { AuthProvider } from "./context/AuthContext";
import { ChefHat, Zap, Clock, ArrowLeft } from "lucide-react";
import { fetchOrders, updateOrderStatus } from "./services/orderApi";
import { getSocket } from "./hooks/useSocket";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
import { authService } from "./services/authService";


// ─── Live Kitchen Display System ──────────────────────────────────────────────
const KitchenView = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0); // force re-render every minute for elapsed times

  // Fetch all active (non-paid) orders from the backend
  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchOrders({ status: "ACTIVE" });
      setOrders(Array.isArray(data) ? data : data?.orders ?? []);
    } catch (err) {
      console.warn("[KDS] fetchOrders failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    // Re-tick every 60 s so elapsed timers update visually
    const tick = setInterval(() => setTick((n) => n + 1), 60_000);

    // Socket subscriptions for real-time updates
    let socket;
    try {
      socket = getSocket();
      const onOrderCreated = () => loadOrders();
      const onTableUpdated = () => loadOrders();
      socket.on("order:created", onOrderCreated);
      socket.on("table:updated", onTableUpdated);
      return () => {
        clearInterval(tick);
        socket.off("order:created", onOrderCreated);
        socket.off("table:updated", onTableUpdated);
      };
    } catch {
      return () => clearInterval(tick);
    }
  }, [loadOrders]);

  const markReady = async (orderId) => {
    try {
      await updateOrderStatus(orderId, "READY");
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      console.error("[KDS] markReady failed:", err.message);
    }
  };

  const elapsedMin = (createdAt) => {
    if (!createdAt) return 0;
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  };

  const formatElapsed = (min) => {
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white p-8 font-sans">
      <div className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-white/40 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <ChefHat size={32} className="text-[#E53935]" />
            <h1 className="text-3xl font-black uppercase tracking-tighter">
              Kitchen Display System
            </h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-white/40 uppercase tracking-widest mb-1">
            Live Feed • {orders.length} Active
          </p>
          <div className="flex items-center gap-2 justify-end">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <p className="text-sm font-black tabular-nums">
              {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-white/40 text-xl font-bold">
          Loading orders…
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-white/30">
          <Zap size={48} />
          <p className="text-2xl font-black uppercase tracking-widest">All Clear</p>
          <p className="text-sm font-bold">No active orders right now</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {orders.map((order) => {
            const mins = elapsedMin(order.createdAt);
            const isUrgent = mins >= 10;
            const tableLabel = order.tableNumber
              ? `T${order.tableNumber}`
              : order.table?.number
              ? `T${order.table.number}`
              : "—";
            const itemList = (order.items || []).map(
              (i) => `${i.name || i.menuItemId} x${i.quantity}`
            );

            return (
              <div
                key={order.id}
                className={`p-8 rounded-[40px] border-2 transition-all ${
                  isUrgent
                    ? "bg-[#E53935]/10 border-[#E53935]"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-4xl font-black mb-1">{tableLabel}</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      ORDER #{String(order.id).slice(-4).toUpperCase()}
                    </p>
                  </div>
                  <div
                    className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      isUrgent
                        ? "bg-[#E53935] text-white"
                        : "bg-white/10 text-white/60"
                    }`}
                  >
                    {isUrgent ? "Urgent" : order.status || "New"}
                  </div>
                </div>
                <div className="space-y-4 mb-8">
                  {itemList.length > 0 ? (
                    itemList.map((item) => (
                      <p key={item} className="text-lg font-bold text-white/90">
                        {item}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-white/30">No item details</p>
                  )}
                </div>
                <div className="flex items-center justify-between pt-6 border-t border-white/10">
                  <div className="flex items-center gap-2 text-[#E53935] font-black text-xl">
                    <Clock size={20} />
                    {formatElapsed(mins)}
                  </div>
                  <button
                    onClick={() => markReady(order.id)}
                    className="px-6 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-[#E53935] hover:text-white transition-all"
                  >
                    Mark Ready
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


// Root Component
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PortalSelectionWrapper />} />
            <Route path="/onboarding" element={<OnboardingWizard />} />
            <Route path="/admin" element={<AdminLoginWrapper />} />
            <Route path="/admin/dashboard/*" element={<AdminDashboardWrapper />} />
            <Route path="/cashier" element={<CashierLoginWrapper />} />
            <Route path="/cashier/dashboard" element={<CashierDashboardWrapper />} />
            <Route path="/captain/*" element={
              <ErrorBoundary
                showDetails={import.meta.env.DEV}
                onRetry={() => window.location.reload()}
              >
                <CaptainApp
                  key="captain-app"
                  onLogout={() => { localStorage.removeItem('captain_auth'); window.location.href = '/'; }}
                />
              </ErrorBoundary>
            } />
            <Route path="/kitchen" element={<KitchenView />} />
            <Route path="/print-station" element={<PrintStation />} />
            <Route path="/user-menu" element={<Navigate to="/user-menu/table-1" replace />} />
            <Route path="/user-menu/:tableId" element={<UserMenuApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function PortalSelectionWrapper() {
  const navigate = useNavigate();
  return <PortalSelection onSelect={(role) => navigate(`/${role}`)} />;
}

function AdminLoginWrapper() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(authService.isAuthenticated() && ['ADMIN','OWNER'].includes(authService.getUser()?.role));
  if (isLoggedIn) return <Navigate to="/admin/dashboard" replace />;
  return (
    <LoginScreen role="admin" onLogin={(roleType) => {
      setIsLoggedIn(true);
    }} onBack={() => navigate('/')} />
  );
}

function AdminDashboardWrapper() {
  const navigate = useNavigate();
  if (!(authService.isAuthenticated() && ['ADMIN','OWNER'].includes(authService.getUser()?.role))) return <Navigate to="/admin" replace />;
  const role = authService.getUser()?.role || 'admin';
  return <AdminDashboard role={role} onLogout={() => { authService.logout(); navigate('/admin'); }} />;
}

function CashierLoginWrapper() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(authService.isAuthenticated() && ['CASHIER','OWNER','ADMIN'].includes(authService.getUser()?.role));
  if (isLoggedIn) return <Navigate to="/cashier/dashboard" replace />;
  return (
    <LoginScreen role="cashier" onLogin={() => { setIsLoggedIn(true); }} onBack={() => navigate('/')} />
  );
}

function CashierDashboardWrapper() {
  const navigate = useNavigate();
  if (!(authService.isAuthenticated() && ['CASHIER','OWNER','ADMIN'].includes(authService.getUser()?.role))) return <Navigate to="/cashier" replace />;
  return <CashierDashboard onLogout={() => { authService.logout(); navigate('/cashier'); }} />;
}

function CaptainLoginWrapper() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(authService.isAuthenticated() && authService.getUser()?.role === 'CAPTAIN');
  if (isLoggedIn) return <Navigate to="/captain/dashboard" replace />;
  return (
    <LoginScreen role="captain" onLogin={() => { setIsLoggedIn(true); }} onBack={() => navigate('/')} />
  );
}

function CaptainAppWrapper() {
  const navigate = useNavigate();
  if (!(authService.isAuthenticated() && authService.getUser()?.role === 'CAPTAIN')) return <Navigate to="/captain" replace />;
  return (
    <CaptainApp
      onLogout={() => { authService.logout(); navigate('/captain'); }}
    />
  );
}

export default App;
