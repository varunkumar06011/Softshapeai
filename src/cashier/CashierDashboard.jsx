import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Table2, ClipboardList, ShoppingCart, Settings, LogOut, Bell, Search, 
  ChevronDown, Clock, CheckCircle2, AlertCircle, User, MoreVertical, Plus, Minus, 
  Trash2, CreditCard, Banknote, Smartphone, Split, History, ChefHat, Monitor, 
  Printer, X, Check, Zap, ArrowRight, Filter, Layers, ArrowUpRight, Loader2, Timer,
  TrendingUp, Users, Package, Wallet, ArrowRightLeft, Activity
} from 'lucide-react';
import { useMenuSync } from '../hooks/useMenuSync';
import { calculateOrderTotal, calculateSessionBill } from '../shared/utils/billing';

const CashierDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeDiet, setActiveDiet] = useState('All');
  const [cart, setCart] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [isKotSending, setIsKotSending] = useState(false);
  const [isKotSuccess, setIsKotSuccess] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isCartMinimized, setIsCartMinimized] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [pastTransactions, setPastTransactions] = useState(() => {
    const saved = localStorage.getItem('softshape_transactions');
    return saved ? JSON.parse(saved) : [
      { id: 'TXN-98245', kot: 'KOT-8812', amount: 2450, time: '14:22', date: '15/05/26', items: 4, method: 'UPI' },
      { id: 'TXN-98246', kot: 'KOT-8813', amount: 560, time: '14:45', date: '15/05/26', items: 2, method: 'CASH' },
      { id: 'TXN-98247', kot: 'KOT-8814', amount: 1290, time: '15:10', date: '15/05/26', items: 3, method: 'CARD' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('softshape_transactions', JSON.stringify(pastTransactions));
  }, [pastTransactions]);

  const { subtotal, taxes, total } = calculateOrderTotal(cart);
  const activeOrderCalc = selectedTable ? calculateSessionBill(selectedTable, cart) : { subtotal, taxes, total };
  const activeSubtotal = activeOrderCalc.subtotal;
  const activeTaxes = activeOrderCalc.taxes;
  const activeTotal = activeOrderCalc.total;

  const handleSettlement = (method = 'UPI') => {
    const txnAmount = activeTotal || 0;
    if (txnAmount === 0) return;

    const itemsList = selectedTable && selectedTable.kotHistory 
      ? selectedTable.kotHistory.flatMap(k => k.items || []) 
      : cart;

    const newTransaction = {
      id: `TXN-${Math.floor(10000 + Math.random() * 90000)}`,
      kot: `KOT-${Math.floor(1000 + Math.random() * 9000)}`,
      amount: txnAmount,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-GB'),
      timestamp: Date.now(),
      items: itemsList.length,
      itemsList: itemsList,
      captainId: selectedTable?.captainId || 'CASHIER',
      method: method
    };
    
    setPastTransactions(prev => {
      const updated = [newTransaction, ...prev];
      localStorage.setItem('softshape_transactions', JSON.stringify(updated));
      window.dispatchEvent(new Event('softshape_transactions_updated'));
      return updated;
    });

    if (selectedTable && selectedTable.id) {
      setTables(prev => {
         const newTables = prev.map(t => {
           if (t.id === selectedTable.id) {
             return { ...t, status: 'Free', captainId: null, kotHistory: [], currentBill: 0, guests: 0, time: null };
           }
           return t;
         });
         localStorage.setItem('softshape_tables', JSON.stringify(newTables));
         window.dispatchEvent(new Event('softshape_tables_updated'));
         return newTables;
      });
    }

    setCart([]);
    setSelectedTable(null);
    setShowPaymentModal(false);
    addNotification("Payment Success", `Transaction ${newTransaction.id} logged.`, 'success');
  };

  const { menuItems, categories, loading: menuLoading } = useMenuSync();

  const [tables, setTables] = useState(() => {
    const saved = localStorage.getItem('softshape_tables');
    if (saved) return JSON.parse(saved);
    return Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      status: i % 5 === 0 ? 'Occupied' : 'Free',
      guests: i % 5 === 0 ? 4 : 0,
      time: i % 5 === 0 ? '24m' : null,
      captainId: i % 5 === 0 ? 'C1' : null,
      kotHistory: [],
      currentBill: i % 5 === 0 ? 1020 : 0
    }));
  });

  useEffect(() => {
    localStorage.setItem('softshape_tables', JSON.stringify(tables));
  }, [tables]);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'softshape_tables' && e.newValue) {
        setTables(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const filteredMenu = useMemo(() => {
    return menuItems.filter(item => {
      const matchesSearch = item.n.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || item.c === selectedCategory;
      const matchesDiet = activeDiet === 'All' || item.t === activeDiet;
      return matchesSearch && matchesCategory && matchesDiet;
    });
  }, [searchQuery, selectedCategory, activeDiet, menuItems]);



  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.n === item.n);
      if (existing) return prev.map(i => i.n === item.n ? { ...i, q: i.q + 1 } : i);
      return [...prev, { ...item, q: 1, id: Date.now() }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.q + delta);
        return newQty === 0 ? null : { ...item, q: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const orders = [
    { id: 'T12', type: 'Dine-In', customer: 'Rahul Sharma', amount: 1450, status: 'Preparing', time: '12m ago', items: 4 },
    { id: 'SW245', type: 'Swiggy', customer: 'Amit K.', amount: 560, status: 'Ready', time: '5m ago', items: 2 },
    { id: 'T05', type: 'Dine-In', customer: 'Priya M.', amount: 2890, status: 'Served', time: '35m ago', items: 7 },
    { id: 'ZM981', type: 'Zomato', customer: 'Kiran T.', amount: 890, status: 'Billing Pending', time: '2m ago', items: 3 },
  ];

  const onlineOrders = [
    { id: 'SW-9812', platform: 'Swiggy', items: ['Chicken Biryani x2', 'Coke x2'], amount: 960, status: 'Preparing', time: '4m ago' },
    { id: 'ZM-4521', platform: 'Zomato', items: ['Paneer Tikka x1', 'Butter Naan x3'], amount: 540, status: 'Ready', time: '12m ago' },
    { id: 'SW-9815', platform: 'Swiggy', items: ['Veg Noodles x2'], amount: 480, status: 'Incoming', time: 'Just now' },
  ];

  const paymentFeed = [
    { id: 'TXN-45920', method: 'UPI', amount: 2450, status: 'Success', time: '2m ago' },
    { id: 'TXN-45921', method: 'CASH', amount: 560, status: 'Success', time: '8m ago' },
    { id: 'TXN-45922', method: 'CARD', amount: 1290, status: 'Success', time: '15m ago' },
    { id: 'TXN-45923', method: 'UPI', amount: 890, status: 'Success', time: '22m ago' },
  ];

  const handleSendKOT = () => {
    if (cart.length === 0) return;
    setIsKotSending(true);
    setIsKotSuccess(false);
    
    // Simulate real kitchen API call
    setTimeout(() => {
      setIsKotSending(false);
      setIsKotSuccess(true);
      addNotification("KOT Pushed", `Order for Table ${selectedOrder?.id || 'Walk-in'} sent to kitchen.`, 'success');
      
      // Reset success icon after 2 seconds
      setTimeout(() => setIsKotSuccess(false), 2000);
    }, 1200);
  };

  const stats = [
    { label: "Today's Sale", value: "₹42,850", change: "+12%", icon: Wallet, color: "text-green-600", bg: "bg-green-50" },
    { label: "Active Tables", value: "14/24", change: "58% Occupancy", icon: Table2, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Pending KOTs", value: "08", change: "Avg 12m prep", icon: ChefHat, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Online Orders", value: "26", change: "12 Swiggy, 14 Zomato", icon: Monitor, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="flex h-screen bg-[#FFF5F5] font-sans overflow-hidden text-[#1A1A1A]">
      {/* SIDEBAR */}
      <aside className="w-16 lg:w-60 bg-white border-r border-[#FFCDD2] flex flex-col z-30 transition-all shrink-0">
        <div className="p-2 lg:p-6 border-b border-[#FFCDD2] flex items-center justify-center shrink-0 bg-white">
          <div className="bg-white p-1 lg:p-3 rounded-xl lg:rounded-[32px] shadow-lg lg:shadow-xl border border-gray-50 aspect-square w-10 lg:w-36 flex items-center justify-center">
            <img 
              src="/logo softshape.ai.png" 
              alt="Softshape.ai" 
              className="w-full h-full object-contain" 
            />
          </div>
        </div>

        <nav className="flex-grow p-2 space-y-0.5 mt-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'pos', label: 'POS Billing', icon: ShoppingCart },
            { id: 'tables', label: 'Tables', icon: Table2 },
            { id: 'history', label: 'Past Transactions', icon: History },
            { id: 'online', label: 'Online Orders', icon: Monitor },
            { id: 'kitchen', label: 'Kitchen Status', icon: ChefHat },
            { id: 'payments', label: 'Payments', icon: CreditCard },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-3 w-full p-2.5 rounded-xl transition-all group relative ${
                activeTab === item.id 
                ? 'bg-[#E53935] text-white font-bold shadow-md shadow-red-100' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon size={18} className={activeTab === item.id ? 'text-white' : 'group-hover:scale-110 transition-transform'} />
              <span className="hidden lg:block text-xs uppercase tracking-tight">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-gray-100 mt-auto pb-8">
          <button onClick={onLogout} className="flex items-center gap-3 w-full p-2.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all">
            <LogOut size={18} />
            <span className="hidden lg:block text-xs font-bold uppercase tracking-tight">Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN VIEW */}
      <div className="flex-grow flex flex-col min-w-0 overflow-hidden">
        {/* COMPACT TOP BAR */}
        <header className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-100">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <span className="text-[10px] font-black text-gray-700 uppercase tracking-wider">Jubilee Hills</span>
              <ChevronDown size={12} className="text-gray-400" />
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Clock size={14} />
              <span className="text-[10px] font-black tabular-nums">{currentTime.toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="hidden sm:flex items-center gap-1.5 bg-red-50 px-2 py-0.5 rounded-md border border-red-100 text-[#E53935]">
                <Activity size={12} />
                <span className="text-[9px] font-black uppercase tracking-wider">Live Op-Feed</span>
             </div>
             <button className="p-1.5 text-gray-500 hover:bg-gray-50 rounded-lg relative">
                <Bell size={16} />
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#E53935] text-white text-[7px] font-bold flex items-center justify-center rounded-full">2</span>
             </button>
             <div className="h-6 w-[1px] bg-gray-200 mx-1" />
             <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-black leading-none">Kiran Kumar</p>
                  <p className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">Head Cashier</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm shadow-inner">🤵</div>
             </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="flex-grow overflow-hidden flex flex-col">
          {activeTab === 'dashboard' ? (
            <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar bg-gray-50">
               {/* Stats Row */}
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {stats.map((stat, i) => (
                    <div key={i} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                       <div className={`w-9 h-9 ${stat.bg} ${stat.color} rounded-lg flex items-center justify-center shrink-0`}>
                          <stat.icon size={18} />
                       </div>
                       <div className="min-w-0">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate">{stat.label}</p>
                          <p className="text-lg font-black text-gray-900 leading-none mt-1">{stat.value}</p>
                       </div>
                    </div>
                  ))}
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* LIVE ORDERS FEED */}
                  <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                     <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                           <History size={12} className="text-[#E53935]" />
                           Active Order Registry
                        </h3>
                        <button className="text-[9px] font-bold text-[#E53935] uppercase hover:underline">Full Log</button>
                     </div>
                     <div className="flex-grow overflow-x-auto">
                        <table className="w-full text-left">
                           <thead className="bg-white border-b border-gray-50">
                              <tr>
                                 <th className="px-3 py-2 text-[8px] font-black uppercase text-gray-400">Table/Cust</th>
                                 <th className="px-3 py-2 text-[8px] font-black uppercase text-gray-400">Category</th>
                                 <th className="px-3 py-2 text-[8px] font-black uppercase text-gray-400">Status</th>
                                 <th className="px-3 py-2 text-[8px] font-black uppercase text-gray-400 text-right">Bill</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-50">
                              {orders.map(o => (
                                <tr key={o.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                                   <td className="px-3 py-2">
                                      <div className="flex items-center gap-2">
                                         <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-[9px] font-black shrink-0">{o.id}</div>
                                         <div className="min-w-0">
                                            <p className="text-[10px] font-bold text-gray-900 leading-none truncate">{o.customer}</p>
                                            <p className="text-[8px] text-gray-400 font-bold uppercase mt-0.5 whitespace-nowrap">{o.time}</p>
                                         </div>
                                      </div>
                                   </td>
                                   <td className="px-3 py-2 text-[9px] font-bold text-gray-500 uppercase">{o.type}</td>
                                   <td className="px-3 py-2">
                                      <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                         o.status === 'Ready' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                      }`}>{o.status}</span>
                                   </td>
                                   <td className="px-3 py-2 text-right">
                                      <p className="text-[10px] font-black text-gray-900">₹{o.amount}</p>
                                   </td>
                                </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>

                  {/* KITCHEN QUEUE */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
                     <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                        <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                           <ChefHat size={12} className="text-[#E53935]" />
                           Kitchen Workload
                        </h3>
                     </div>
                     <div className="p-2 space-y-2 overflow-y-auto max-h-[300px] custom-scrollbar">
                        {[1, 2, 3].map(i => (
                           <div key={i} className="p-2 rounded-lg border border-gray-100 bg-gray-50/50 hover:border-red-100 transition-all cursor-pointer">
                              <div className="flex justify-between items-start mb-1">
                                 <span className="text-[8px] font-black text-gray-400 uppercase">KOT-942{i}</span>
                                 <span className="text-[8px] font-black text-orange-600 flex items-center gap-1">
                                    <Timer size={10} /> 0{i+4}:22
                                 </span>
                              </div>
                              <p className="text-[10px] font-black text-gray-900 leading-tight">Table 0{i+2} • {i+1} Items</p>
                              <div className="mt-1 flex gap-1 flex-wrap">
                                 <span className="text-[7px] font-bold bg-white border border-gray-100 px-1 rounded">Chicken Biryani</span>
                                 <span className="text-[7px] font-bold bg-white border border-gray-100 px-1 rounded">Naan</span>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                  {/* PENDING ONLINE */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                     <div className="px-3 py-2 border-b border-gray-100 bg-orange-50/50">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-orange-600 flex items-center gap-2">
                           <Monitor size={12} />
                           Pending Online
                        </h3>
                     </div>
                     <div className="p-2 space-y-2">
                        <div className="p-2 rounded-lg border-2 border-orange-200 bg-orange-50 animate-pulse cursor-pointer">
                           <div className="flex justify-between mb-1">
                              <span className="text-[7px] font-black bg-orange-500 text-white px-1 py-0.5 rounded">SWIGGY</span>
                              <span className="text-[8px] font-black text-orange-600">04:32</span>
                           </div>
                           <p className="text-[10px] font-black text-gray-900">#SW-2456 • 2 Items</p>
                        </div>
                     </div>
                  </div>

                  {/* FLOOR PLAN MINI */}
                  <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
                     <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                           <Table2 size={12} className="text-[#E53935]" />
                           Live Floor Status
                        </h3>
                        <div className="flex gap-2">
                           <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-[8px] font-bold text-gray-400 uppercase">Busy</span></div>
                           <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /><span className="text-[8px] font-bold text-gray-400 uppercase">Bill</span></div>
                           <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-[8px] font-bold text-gray-400 uppercase">Free</span></div>
                        </div>
                     </div>
                     <div className="p-2 grid grid-cols-6 sm:grid-cols-12 lg:grid-cols-12 gap-1.5">
                        {tables.map((table, i) => {
                           const status = table?.status || 'Free';
                           const colorClass = 
                              status === 'Free' ? 'bg-green-50 border-green-200 text-green-600' :
                              status === 'Waiting Bill' ? 'bg-amber-50 border-amber-200 text-amber-600 animate-pulse' :
                              status === 'Preparing' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                              'bg-red-50 border-red-200 text-red-600';
                           return (
                             <div key={i} className={`h-8 rounded-md border flex items-center justify-center transition-all cursor-pointer ${colorClass}`}>
                                <span className="text-[9px] font-black">{table.id}</span>
                             </div>
                           );
                        })}
                     </div>
                  </div>
               </div>
            </div>
          ) : activeTab === 'pos' ? (
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">
               {/* COMPACT MENU */}
               <div className={`flex-grow flex flex-col bg-white border-b lg:border-b-0 lg:border-r border-gray-200 min-w-0 ${isCartMinimized ? 'h-full lg:h-auto' : 'h-1/2 lg:h-auto'} transition-all duration-300`}>
                  <div className="px-3 py-2 border-b border-gray-100 flex flex-col gap-2">
                     <div className="flex items-center gap-2">
                        <div className="relative flex-grow">
                           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                           <input 
                              type="text" 
                              placeholder="Search item..." 
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-4 py-1 text-[10px] font-medium outline-none focus:border-[#E53935]"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                           />
                        </div>
                  <div className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide py-1">
                     <div className="flex gap-1">
                        {categories.map(cat => (
                           <button 
                              key={cat}
                              onClick={() => setSelectedCategory(cat)}
                              className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all border shrink-0 ${
                                 selectedCategory === cat ? 'bg-[#E53935] border-[#E53935] text-white' : 'bg-white border-gray-200 text-gray-500'
                              }`}
                           >
                              {cat}
                           </button>
                        ))}
                     </div>
                     <div className="flex gap-1 bg-gray-50 p-0.5 rounded-lg border border-gray-200 shrink-0">
                        {['All', 'veg', 'non'].map(diet => (
                           <button 
                              key={diet}
                              onClick={() => setActiveDiet(diet)}
                              className={`px-2 py-1 rounded-[4px] text-[8px] font-black uppercase transition-all ${
                                 activeDiet === diet ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                              }`}
                           >
                              {diet === 'All' ? 'All' : diet === 'veg' ? 'Veg' : 'Non'}
                           </button>
                        ))}
                     </div>
                  </div>
                     </div>
                  </div>

                  <div className="flex-grow overflow-y-auto p-2 bg-gray-50/30 custom-scrollbar">
                     {menuLoading ? (
                        <p className="text-center text-xs text-gray-400 py-8 font-bold uppercase tracking-widest">Syncing menu…</p>
                     ) : (
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                        {filteredMenu.map((item, idx) => (
                           <div 
                              key={idx}
                              onClick={() => addToCart(item)}
                              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-[#E53935] hover:shadow transition-all cursor-pointer flex flex-col group"
                           >
                              <div className="h-20 w-full overflow-hidden relative">
                                 <img src={item.img} alt={item.n} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                 <div className="absolute top-1.5 right-1.5 p-0.5 rounded-sm backdrop-blur-md shadow-sm bg-white/80 border border-white/50">
                                    <div className={`w-2.5 h-2.5 rounded-[2px] border flex items-center justify-center ${item.t === 'veg' ? 'border-green-600' : 'border-red-600'}`}>
                                       <div className={`w-1 h-1 rounded-full ${item.t === 'veg' ? 'bg-green-600' : 'bg-red-600'}`} />
                                    </div>
                                 </div>
                              </div>
                              <div className="p-1.5 flex flex-col flex-grow">
                                 <h4 className="text-[9px] font-black text-gray-900 leading-tight mb-1 line-clamp-1">{item.n}</h4>
                                 <div className="flex items-center justify-between mt-auto">
                                    <p className="text-[10px] font-black text-gray-900">₹{item.p}</p>
                                    <div className="w-5 h-5 rounded-md bg-gray-100 border border-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-[#E53935] group-hover:text-white">
                                       <Plus size={12} />
                                    </div>
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                     )}
                  </div>
               </div>

               {/* COMPACT CART */}
               <div className={`w-full lg:w-80 ${isCartMinimized ? 'h-14 lg:h-auto overflow-hidden' : 'h-1/2 lg:h-auto'} bg-white flex flex-col shadow-xl z-20 shrink-0 transition-all duration-300`}>
                  <div 
                    className="p-3 border-b border-gray-100 bg-gray-50/50 cursor-pointer lg:cursor-default shrink-0 flex items-center justify-between"
                    onClick={() => setIsCartMinimized(!isCartMinimized)}
                  >
                     <div className="flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                           <h2 className="font-black text-[10px] uppercase tracking-widest text-gray-900 flex items-center gap-2">
                              <ShoppingCart size={14} className="text-[#E53935]" />
                              Cart Log
                           </h2>
                           <button onClick={(e) => { e.stopPropagation(); setCart([]); }} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-2 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-red-50 flex items-center justify-center text-[#E53935] font-black text-sm">T8</div>
                          <div className="flex-grow min-w-0">
                             <p className="text-[10px] font-black text-gray-900 truncate">Rahul Sharma</p>
                             <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest leading-none">Dine-In Serving</p>
                          </div>
                       </div>
                     </div>
                     <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex lg:hidden items-center justify-center text-gray-400 shrink-0 ml-4">
                         <ChevronDown size={16} className={`transition-transform duration-300 ${isCartMinimized ? 'rotate-180' : ''}`} />
                     </div>
                  </div>

                  <div className="flex-grow overflow-y-auto p-2 space-y-2 custom-scrollbar">
                     {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-30">
                           <Package size={24} className="mb-1" />
                           <p className="text-[8px] font-black uppercase">Pending Items</p>
                        </div>
                     ) : (
                        cart.map((item) => (
                           <div key={item.id} className="flex gap-2 pb-2 border-b border-gray-50">
                              <div className="flex-grow min-w-0">
                                 <div className="flex justify-between items-start mb-0.5">
                                    <p className="text-[9px] font-bold text-gray-900 truncate">{item.n}</p>
                                    <p className="text-[9px] font-black text-gray-900">₹{item.p * item.q}</p>
                                 </div>
                                 <div className="flex items-center justify-between">
                                    <div className="flex items-center bg-gray-100 rounded-md p-0.5">
                                       <button onClick={() => updateQty(item.id, -1)} className="p-1 text-gray-500"><Minus size={8} /></button>
                                       <span className="w-5 text-center text-[9px] font-black">{item.q}</span>
                                       <button onClick={() => updateQty(item.id, 1)} className="p-1 text-gray-500"><Plus size={8} /></button>
                                    </div>
                                    <button className="text-[7px] font-black text-[#E53935] uppercase">Edit</button>
                                 </div>
                              </div>
                           </div>
                        ))
                     )}
                  </div>

                  <div className="p-3 border-t border-gray-100 bg-gray-50/50 space-y-2">
                     <div className="space-y-0.5">
                        <div className="flex justify-between text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                           <span>Subtotal</span>
                           <span>₹{subtotal}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                           <span className="text-[9px] font-black text-gray-900">NET TOTAL</span>
                           <span className="text-xl font-black text-[#E53935]">₹{total.toFixed(0)}</span>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-1.5">
                        <button 
                           onClick={handleSendKOT}
                           disabled={isKotSending || cart.length === 0}
                           className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all ${
                             isKotSuccess ? 'bg-green-500 border-green-500 text-white' : 
                             isKotSending ? 'bg-amber-50 border-amber-200 text-amber-600' :
                             'bg-white border-gray-200 text-gray-600 hover:border-[#E53935] hover:text-[#E53935]'
                           }`}
                        >
                           {isKotSuccess ? <Check size={14} /> : isKotSending ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                           <span className="text-[7px] font-black uppercase mt-0.5">{isKotSuccess ? 'Pushed' : isKotSending ? 'Pushing' : 'KOT'}</span>
                        </button>
                        <button className="flex flex-col items-center justify-center p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600">
                           <History size={14} />
                           <span className="text-[7px] font-black uppercase mt-0.5">Draft</span>
                        </button>
                        <button 
                           onClick={() => setShowPaymentModal(true)}
                           disabled={cart.length === 0}
                           className="col-span-2 py-2.5 bg-[#E53935] text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg shadow-red-100 disabled:opacity-50 disabled:shadow-none"
                        >
                           Settle Transaction
                        </button>
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            <div className="flex-grow p-3 overflow-y-auto custom-scrollbar bg-gray-50/50">
               <div className="max-w-6xl mx-auto space-y-3">
                  <div className="flex items-center justify-between">
                     <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">{activeTab.replace('-', ' ')} Feed</h2>
                     <button className="px-3 py-1.5 bg-[#E53935] text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm">Sync Now</button>
                  </div>

                  {activeTab === 'tables' && (
                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-2">
                        {tables.map((table, i) => {
                         const isFree = table.status === 'Free' || !table.status;
                         const isWaitingBill = table.status === 'Waiting Bill';
                         const isBusy = !isFree && !isWaitingBill;
                         
                         let containerClass = 'bg-white border-gray-100 text-gray-400 hover:border-gray-300';
                         let statusText = 'Open';
                         
                         if (isWaitingBill) {
                           containerClass = 'bg-amber-50 border-amber-400 text-amber-600 shadow-sm shadow-amber-50 animate-pulse';
                           statusText = 'Billing Requested';
                         } else if (isBusy) {
                           containerClass = 'bg-red-50 border-[#E53935] text-[#E53935] shadow-sm shadow-red-50';
                           statusText = 'Busy';
                         }

                         return (
                           <div 
                              key={i} 
                              onClick={() => !isFree && setSelectedTable(table)}
                              className={`aspect-square border rounded-2xl flex flex-col items-center justify-center text-center p-1 cursor-pointer transition-all hover:scale-105 active:scale-95 ${containerClass}`}
                           >
                              <span className="text-xl font-black">{table.id}</span>
                              <span className="text-[7px] font-black uppercase tracking-tighter leading-tight mt-0.5">{statusText}</span>
                           </div>
                         );
                        })}
                     </div>
                  )}

                  {activeTab === 'history' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                       <div className="overflow-x-auto scrollbar-hide">
                          <table className="w-full text-left">
                             <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                   <th className="p-3 text-[9px] font-black uppercase text-gray-400">TXN ID / KOT</th>
                                   <th className="p-3 text-[9px] font-black uppercase text-gray-400">Date/Time</th>
                                   <th className="p-3 text-[9px] font-black uppercase text-gray-400">Method</th>
                                   <th className="p-3 text-[9px] font-black uppercase text-gray-400 text-right">Amount</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-50">
                                {pastTransactions.map(txn => (
                                  <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                                     <td className="p-3">
                                        <div className="flex flex-col">
                                           <span className="text-[10px] font-black text-gray-900">{txn.id}</span>
                                           <span className="text-[8px] font-bold text-[#E53935] uppercase">{txn.kot}</span>
                                        </div>
                                     </td>
                                     <td className="p-3">
                                        <div className="flex flex-col">
                                           <span className="text-[9px] font-bold text-gray-700">{txn.date}</span>
                                           <span className="text-[8px] text-gray-400">{txn.time}</span>
                                        </div>
                                     </td>
                                     <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${
                                          txn.method === 'CASH' ? 'bg-green-100 text-green-700' :
                                          txn.method === 'UPI' ? 'bg-blue-100 text-blue-700' :
                                          'bg-purple-100 text-purple-700'
                                        }`}>{txn.method}</span>
                                     </td>
                                     <td className="p-3 text-right">
                                        <p className="text-[10px] font-black text-gray-900">₹{txn.amount}</p>
                                        <p className="text-[8px] text-gray-400 font-bold uppercase">{txn.items} Items</p>
                                     </td>
                                  </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                       {pastTransactions.length === 0 && (
                         <div className="p-12 text-center flex flex-col items-center">
                            <History size={32} className="text-gray-200 mb-2" />
                            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No Recent Transactions</p>
                         </div>
                       )}
                    </div>
                  )}

                  {activeTab === 'kitchen' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       {['Incoming', 'Preparing', 'Ready'].map((status) => (
                         <div key={status} className="flex flex-col gap-3">
                            <h3 className="font-black text-[10px] uppercase tracking-widest text-gray-900 border-b-2 border-red-100 pb-1">{status}</h3>
                            <div className="space-y-2">
                               {[1, 2].map(j => (
                                 <div key={j} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-[#E53935] transition-all cursor-pointer">
                                    <div className="flex justify-between items-start mb-2">
                                       <span className="text-[8px] font-black text-gray-400 uppercase">KOT-942{j}</span>
                                       <span className="text-[8px] font-black text-orange-600">0{j+4}:22</span>
                                    </div>
                                    <p className="text-[11px] font-black text-gray-900">Table 0{j+4}</p>
                                    <div className="mt-2 space-y-0.5 text-[9px] text-gray-500 font-bold">
                                       <div className="flex justify-between"><span>Chicken Biryani</span><span>x2</span></div>
                                       <div className="flex justify-between"><span>Paneer Tikka</span><span>x1</span></div>
                                    </div>
                                 </div>
                               ))}
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {activeTab === 'online' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                       {onlineOrders.map(order => (
                         <div key={order.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:border-[#E53935] transition-all">
                            <div className="flex justify-between items-start mb-3">
                               <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${
                                 order.platform === 'Swiggy' ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'
                               }`}>{order.platform}</span>
                               <span className="text-[9px] font-black text-gray-400">{order.time}</span>
                            </div>
                            <h3 className="text-[11px] font-black text-gray-900 mb-1">{order.id}</h3>
                            <div className="space-y-0.5 mb-4">
                               {order.items.map(item => <p key={item} className="text-[9px] text-gray-500 font-bold">{item}</p>)}
                            </div>
                            <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                               <span className="text-[10px] font-black text-gray-900">₹{order.amount}</span>
                               <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                 order.status === 'Ready' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                               }`}>{order.status}</span>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {activeTab === 'payments' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                       <div className="p-3 border-b border-gray-100 bg-gray-50/50">
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-900">Live Transaction Stream</h3>
                       </div>
                       <div className="divide-y divide-gray-50">
                          {paymentFeed.map(payment => (
                            <div key={payment.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                               <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                    payment.method === 'UPI' ? 'bg-blue-50 text-blue-600' : 
                                    payment.method === 'CASH' ? 'bg-green-50 text-green-600' : 
                                    'bg-purple-50 text-purple-600'
                                  }`}>
                                     {payment.method === 'UPI' ? <Smartphone size={20} /> : 
                                      payment.method === 'CASH' ? <Banknote size={20} /> : <CreditCard size={20} />}
                                  </div>
                                  <div>
                                     <p className="text-[10px] font-black text-gray-900">{payment.id}</p>
                                     <p className="text-[8px] font-bold text-gray-400 uppercase">{payment.time} • via {payment.method}</p>
                                  </div>
                               </div>
                               <div className="text-right">
                                  <p className="text-[11px] font-black text-gray-900">₹{payment.amount}</p>
                                  <div className="flex items-center gap-1 justify-end">
                                     <div className="w-1 h-1 rounded-full bg-green-500" />
                                     <span className="text-[8px] font-black text-green-600 uppercase">Settled</span>
                                  </div>
                               </div>
                            </div>
                          ))}
                       </div>
                    </div>
                  )}
               </div>
            </div>
          )}
        </main>
      </div>

      {/* TABLE DETAILS MODAL */}
      {selectedTable && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
           <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#E53935] text-white flex items-center justify-center font-black text-xl">T{selectedTable.id}</div>
                    <div>
                       <h2 className="text-[10px] font-black uppercase text-gray-400 leading-none">Active Session</h2>
                       <p className="text-sm font-black text-gray-900 mt-1">{selectedTable.guests} Guests • {selectedTable.time}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedTable(null)} className="p-2 text-gray-400 hover:text-gray-900 bg-white rounded-lg border border-gray-100"><X size={18} /></button>
              </div>
              <div className="p-4 bg-white">
                 <div className="space-y-3 mb-6">
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-[#E53935] border-b border-red-50 pb-1">Order Summary</h3>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                       {(selectedTable.kotHistory ? selectedTable.kotHistory.flatMap(k => k.items || []) : selectedTable.items || []).map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                             <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded bg-gray-50 flex items-center justify-center text-[9px] font-black text-gray-500">{item.q}x</span>
                                <span className="text-[11px] font-bold text-gray-800">{item.n}</span>
                             </div>
                             <span className="text-[11px] font-black text-gray-900">₹{item.p * item.q}</span>
                          </div>
                       ))}
                    </div>
                 </div>
                 
                 <div className="bg-gray-50 rounded-xl p-3 space-y-1 mb-6 border border-gray-100">
                    <div className="flex justify-between text-[9px] font-bold text-gray-400 uppercase"><span>Subtotal</span><span>₹{activeSubtotal}</span></div>
                    <div className="flex justify-between text-[9px] font-bold text-gray-400 uppercase"><span>Taxes (18%)</span><span>₹{activeTaxes.toFixed(0)}</span></div>
                    <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-1">
                       <span className="text-[10px] font-black text-gray-900 uppercase">Running Total</span>
                       <span className="text-2xl font-black text-[#E53935]">₹{activeTotal.toFixed(0)}</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                    <button 
                       onClick={() => { setActiveTab('pos'); setSelectedTable(null); }}
                       className="py-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50"
                    >
                       Add Items
                    </button>
                    <button 
                       onClick={() => { setShowPaymentModal(true); }}
                       className="py-3 rounded-xl bg-[#E53935] text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-100"
                    >
                       Settlement
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* COMPACT SETTLEMENT */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
           <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-slide-in">
              <div className="md:w-1/3 p-6 bg-gray-50 border-r border-gray-100">
                 <button onClick={() => { setShowPaymentModal(false); setSelectedTable(null); }} className="text-gray-400 hover:text-gray-900 mb-6"><X size={18} /></button>
                 <h2 className="text-[9px] font-black uppercase text-gray-400 mb-1">Bill Amount</h2>
                 <p className="text-4xl font-black text-gray-900 mb-6 tabular-nums">₹{activeTotal.toFixed(0)}</p>
                 <div className="space-y-3">
                    <div className="flex justify-between border-b border-gray-200 pb-1">
                       <span className="text-[8px] font-black text-gray-400 uppercase">Order ID</span>
                       <span className="text-[8px] font-black text-gray-900">#POS-45920</span>
                    </div>
                 </div>
              </div>
              <div className="md:w-2/3 p-8 flex flex-col gap-4">
                 <h3 className="text-[10px] font-black uppercase text-center tracking-widest">Settle Transaction</h3>
                 <div className="grid grid-cols-2 gap-3">
                    {['UPI', 'CARD', 'CASH', 'SPLIT'].map(method => (
                      <div key={method} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 cursor-pointer ${method === 'UPI' ? 'border-[#E53935] bg-red-50 text-[#E53935]' : 'border-gray-50 bg-gray-50 text-gray-400'}`}>
                         <CreditCard size={20} />
                         <span className="text-[8px] font-black uppercase">{method}</span>
                      </div>
                    ))}
                 </div>
                 <button 
                  onClick={() => handleSettlement('UPI')}
                  className="mt-2 py-3 bg-[#10B981] text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#059669]"
                 >
                    Authorize Settlement
                 </button>
              </div>
           </div>
        </div>
      )}
      {/* NOTIFICATIONS OVERLAY */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="pointer-events-auto flex items-center gap-3 bg-white border-l-4 border-l-[#E53935] p-3 rounded-lg shadow-2xl animate-slide-in min-w-[240px]">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-[#E53935]">
               {n.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            </div>
            <div>
               <p className="text-[10px] font-black text-gray-900 uppercase tracking-tight">{n.title}</p>
               <p className="text-[9px] text-gray-500 font-medium leading-none mt-0.5">{n.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CashierDashboard;
