import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import PortalSelection from "./shared/components/PortalSelection";
import LoginScreen from "./shared/components/LoginScreen";
import AdminDashboard from "./admin/AdminDashboard";
import CashierDashboard from "./cashier/CashierDashboard";
import CaptainApp from "./captain/CaptainApp";
import { MENU_DATA } from "./data/menuData";
import { ChefHat, Zap, Clock, ArrowLeft } from "lucide-react";

// specialized Kitchen View
const KitchenView = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white p-8 font-sans">
       <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
             <button onClick={() => navigate('/')} className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-white/40 hover:text-white">
                <ArrowLeft size={20} />
             </button>
             <div className="flex items-center gap-3">
                <ChefHat size={32} className="text-[#E53935]" />
                <h1 className="text-3xl font-black uppercase tracking-tighter">Kitchen Display System</h1>
             </div>
          </div>
          <div className="text-right">
             <p className="text-sm font-black text-white/40 uppercase tracking-widest mb-1">Live Feed • Jubilee Hills</p>
             <div className="flex items-center gap-2 justify-end">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <p className="text-sm font-black tabular-nums">{new Date().toLocaleTimeString()}</p>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { id: '1042', table: 'T12', time: '8:45', items: ['Chicken Biryani x2', 'Paneer Tikka x1'], status: 'Urgent' },
            { id: '2456', table: 'SWIGGY', time: '4:12', items: ['Butter Chicken x1', 'Butter Naan x3'], status: 'New' },
            { id: '1043', table: 'T05', time: '12:20', items: ['Mango Lassi x4', 'Gulab Jamun x2'], status: 'Preparing' },
            { id: '9812', table: 'ZOMATO', time: '2:10', items: ['Veg Noodles x1'], status: 'New' },
          ].map(order => (
            <div key={order.id} className={`p-8 rounded-[40px] border-2 transition-all ${
              order.status === 'Urgent' ? 'bg-[#E53935]/10 border-[#E53935]' : 'bg-white/5 border-white/10'
            }`}>
               <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-4xl font-black mb-1">{order.table}</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">ORDER #{order.id}</p>
                  </div>
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    order.status === 'Urgent' ? 'bg-[#E53935] text-white' : 'bg-white/10 text-white/60'
                  }`}>
                    {order.status}
                  </div>
               </div>
               <div className="space-y-4 mb-8">
                  {order.items.map(item => (
                    <p key={item} className="text-lg font-bold text-white/90">{item}</p>
                  ))}
               </div>
               <div className="flex items-center justify-between pt-6 border-t border-white/10">
                  <div className="flex items-center gap-2 text-[#E53935] font-black text-xl">
                    <Clock size={20} /> {order.time}
                  </div>
                  <button className="px-6 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-[#E53935] hover:text-white transition-all">Mark Ready</button>
               </div>
            </div>
          ))}
       </div>
    </div>
  );
};

// Root Component
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PortalSelectionWrapper />} />
        <Route path="/admin" element={<AdminLoginWrapper />} />
        <Route path="/admin/dashboard/*" element={<AdminDashboardWrapper />} />
        <Route path="/cashier" element={<CashierLoginWrapper />} />
        <Route path="/cashier/dashboard" element={<CashierDashboardWrapper />} />
        <Route path="/captain/*" element={<CaptainApp 
          onLogout={() => { localStorage.removeItem('captain_auth'); window.location.href = '/'; }} 
        />} />
        <Route path="/kitchen" element={<KitchenView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function PortalSelectionWrapper() {
  const navigate = useNavigate();
  return <PortalSelection onSelect={(role) => navigate(`/${role}`)} />;
}

function AdminLoginWrapper() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('admin_auth') === 'true');
  if (isLoggedIn) return <Navigate to="/admin/dashboard" replace />;
  return (
    <LoginScreen role="admin" onLogin={() => { localStorage.setItem('admin_auth', 'true'); setIsLoggedIn(true); }} onBack={() => navigate('/')} />
  );
}

function AdminDashboardWrapper() {
  const navigate = useNavigate();
  if (localStorage.getItem('admin_auth') !== 'true') return <Navigate to="/admin" replace />;
  return <AdminDashboard onLogout={() => { localStorage.removeItem('admin_auth'); navigate('/admin'); }} />;
}

function CashierLoginWrapper() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('cashier_auth') === 'true');
  if (isLoggedIn) return <Navigate to="/cashier/dashboard" replace />;
  return (
    <LoginScreen role="cashier" onLogin={() => { localStorage.setItem('cashier_auth', 'true'); setIsLoggedIn(true); }} onBack={() => navigate('/')} />
  );
}

function CashierDashboardWrapper() {
  const navigate = useNavigate();
  if (localStorage.getItem('cashier_auth') !== 'true') return <Navigate to="/cashier" replace />;
  return <CashierDashboard onLogout={() => { localStorage.removeItem('cashier_auth'); navigate('/cashier'); }} />;
}

function CaptainLoginWrapper() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('captain_auth') === 'true');
  if (isLoggedIn) return <Navigate to="/captain/dashboard" replace />;
  return (
    <LoginScreen role="captain" onLogin={() => { localStorage.setItem('captain_auth', 'true'); setIsLoggedIn(true); }} onBack={() => navigate('/')} />
  );
}

function CaptainAppWrapper() {
  const navigate = useNavigate();
  if (localStorage.getItem('captain_auth') !== 'true') return <Navigate to="/captain" replace />;
  return (
    <CaptainApp 
      captains={[]} 
      menuData={MENU_DATA} 
      onLogout={() => { localStorage.removeItem('captain_auth'); navigate('/captain'); }} 
    />
  );
}

export default App;
