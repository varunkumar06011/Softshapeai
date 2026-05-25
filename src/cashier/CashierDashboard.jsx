import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard, Table2, ClipboardList, ShoppingCart, Settings, LogOut, Bell, Search,
  ChevronDown, Clock, CheckCircle2, AlertCircle, User, MoreVertical, Plus, Minus,
  Trash2, CreditCard, Banknote, Smartphone, Split, History, ChefHat, Monitor,
  Printer, X, Check, Zap, ArrowRight, Filter, Layers, ArrowUpRight, Loader2, Timer,
  TrendingUp, Users, Package, Wallet, ArrowRightLeft, Activity
} from 'lucide-react';
import { useMenu } from '../context/MenuContext';
import { useTableSync } from '../services/tableSyncService';
import { markOrderPaid, saveTransaction, fetchTransactions, createOrder, updateOrderItems, updateOrderStatus } from '../services/orderApi';
import { printBillQZ } from '../services/printService';
import { calculateOrderTotal, calculateSessionBill, calculateTableBill, getTableItems } from '../shared/utils/billing';
import { filterMenuItems } from '../shared/utils/menuSearch';
import { useSocket } from '../hooks/useSocket';
import LiveTimer from '../shared/components/LiveTimer';
import { RESTAURANT_ID } from '../services/tableApi';
import { useOutlet } from '../context/OutletContext';
import OutletToggle from '../shared/components/OutletToggle';
import BarMenuToggle from '../shared/components/BarMenuToggle';
import VariantPicker from '../shared/components/VariantPicker';
import { useBarTableSync } from '../services/barTableSyncService';
import { useBarMenuSync } from '../services/barMenuSyncService';
import { BAR_ID } from '../services/barApiConfig';

const CashierDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('cashier_active_tab') || 'dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeDiet, setActiveDiet] = useState('All');
  const [cart, setCart] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [isKotSending, setIsKotSending] = useState(false);
  const [isKotSuccess, setIsKotSuccess] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('UPI');
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isPrintingBill, setIsPrintingBill] = useState(false);
  const [isCartMinimized, setIsCartMinimized] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { outlet } = useOutlet();
  const TX_CACHE_KEY = `softshape_transactions_${outlet}_${new Date().toLocaleDateString('en-CA')}`;

  const [pastTransactions, setPastTransactions] = useState(() => {
    // Start with localStorage cache for instant display
    try {
      const saved = localStorage.getItem(TX_CACHE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [txnsLoading, setTxnsLoading] = useState(false);

  const { menuItems, categories, loading: menuLoading } = useMenu();
  const { tables, setTables } = useTableSync();

  const { tables: barTables, setTables: setBarTables } = useBarTableSync();
  const { menuItems: barMenuItems } = useBarMenuSync();
  const [barMenuTab, setBarMenuTab] = useState('food');
  const [variantPickerItem, setVariantPickerItem] = useState(null);

  // Derived — restaurant or bar depending on outlet
  const activeTables = outlet === 'bar' ? barTables : tables;
  const setActiveTables = outlet === 'bar' ? setBarTables : setTables;
  const activeRestaurantId = outlet === 'bar' ? BAR_ID : RESTAURANT_ID;

  const socket = useSocket(activeRestaurantId);

  const loadTransactions = useCallback(async () => {
    setTxnsLoading(true);
    try {
      const todayStr = new Date().toLocaleDateString('en-CA');
      const dbTxns = await fetchTransactions(activeRestaurantId, 100, todayStr);
      const mapped = dbTxns.map(txn => ({
        id: txn.id,
        kot: txn.orderId ? `ORD-${txn.orderId.slice(-6).toUpperCase()}` : '—',
        amount: txn.amount,
        time: new Date(txn.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date(txn.paidAt).toLocaleDateString('en-GB'),
        timestamp: new Date(txn.paidAt).getTime(),
        items: txn.itemCount || 0,
        itemsList: txn.items || [],
        captainId: txn.captainId || 'CASHIER',
        method: txn.method || 'UPI',
        tableNumber: txn.tableNumber || null,
      }));
      localStorage.setItem(TX_CACHE_KEY, JSON.stringify(mapped));
      setPastTransactions(mapped);
    } catch (err) {
      console.warn('[Transactions] DB fetch failed, using cache:', err.message);
    } finally {
      setTxnsLoading(false);
    }
  }, [TX_CACHE_KEY, activeRestaurantId]);

  // Real-time billing alert state
  const [billingAlerts, setBillingAlerts] = useState([]);

  const addNotification = (title, desc, type = 'success') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, title, desc, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };


  useEffect(() => {
    const onBillingRequested = (payload) => {
      const { table, order } = payload;
      if (!table) return;

      // Add to billing alerts queue for cashier attention
      setBillingAlerts(prev => {
        const exists = prev.find(a => a.tableBackendId === table.id);
        if (exists) return prev;
        return [...prev, {
          tableBackendId: table.id,
          tableNumber: table.number,
          orderId: order?.id,
          totalAmount: order?.totalAmount ?? 0,
          requestedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }];
      });

      addNotification(
        "Bill Requested",
        `Table ${table.number} is requesting the bill`,
        'warning'
      );
    };

    const onOrderCreated = (payload) => {
      const { order } = payload;
      if (!order?.tableId) return;
      // useTableSync already updates table state via table:updated event.
      // Here we just ensure the activeOrder reference on selectedTable stays fresh.
      if (selectedTable?.backendId === order.tableId) {
        setSelectedTable(prev => prev ? { ...prev, activeOrder: order } : prev);
      }
    };

    const onOrderUpdated = (payload) => {
      const { order } = payload;
      if (!order?.tableId) return;
      if (selectedTable?.backendId === order.tableId) {
        setSelectedTable(prev => prev ? { ...prev, activeOrder: order } : prev);
      }
    };

    const onOrderPaid = (payload) => {
      const { tableId } = payload;
      // Remove from billing alerts
      setBillingAlerts(prev => prev.filter(a => a.tableBackendId !== tableId));
      // Clear selectedTable if it was the paid one
      if (selectedTable?.backendId === tableId) {
        setSelectedTable(null);
        setCart([]);
        setShowPaymentModal(false);
      }
      loadTransactions();
    };

    socket.on('billing:requested', onBillingRequested);
    socket.on('order:created', onOrderCreated);
    socket.on('order:updated', onOrderUpdated);
    socket.on('order:paid', onOrderPaid);

    return () => {
      socket.off('billing:requested', onBillingRequested);
      socket.off('order:created', onOrderCreated);
      socket.off('order:updated', onOrderUpdated);
      socket.off('order:paid', onOrderPaid);
    };
  }, [socket, selectedTable?.backendId, loadTransactions]);

  // ── Load transactions from DB ──────────────────────────────────────────
  useEffect(() => {
    loadTransactions();
    return () => { };
  }, [loadTransactions, outlet]);

  useEffect(() => {
    if (!selectedTable?.backendId) return;
    const liveTable = activeTables.find((table) => table.backendId === selectedTable.backendId);
    if (!liveTable || liveTable.status === 'Free') {
      setSelectedTable(null);
      setShowPaymentModal(false);
      setSelectedPaymentMethod('UPI');
      return;
    }
    setSelectedTable(liveTable);
  }, [activeTables, selectedTable?.backendId]);

  const activeTableOrders = useMemo(() => {
    return activeTables
      .filter((table) => table.status && table.status !== 'Free')
      .map((table) => {
        const items = getTableItems(table);
        const bill = calculateTableBill(table);
        return {
          id: `T${table.id}`,
          type: 'Dine-In',
          customer: `Table ${table.id}`,
          amount: table.currentBill || bill.subtotal,
          status: table.status,
          time: table.time || 'Live',
          items: items.length,
          kotCount: (table.kotHistory || []).length,
          table,
        };
      })
      .sort((a, b) => {
        if (a.status === 'Waiting Bill' && b.status !== 'Waiting Bill') return -1;
        if (a.status !== 'Waiting Bill' && b.status === 'Waiting Bill') return 1;
        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      });
  }, [activeTables]);

  const liveKotQueue = useMemo(() => {
    return activeTableOrders.flatMap((order) =>
      (order.table.kotHistory || []).map((kot) => ({
        id: kot.id,
        table: order.table,
        tableLabel: order.id,
        time: kot.time || order.time,
        status: kot.status || 'Incoming',
        createdAt: kot.createdAt || Date.now(),
        itemsReady: kot.itemsReady || 0,
        items: kot.items || [],
      }))
    );
  }, [activeTableOrders]);

  const todaysSales = useMemo(() => {
    return pastTransactions.reduce((sum, txn) => sum + (txn.amount || 0), 0);
  }, [pastTransactions]);

  const { subtotal, taxes, total } = calculateOrderTotal(cart);
  const activeOrderCalc = selectedTable ? calculateSessionBill(selectedTable, cart) : { subtotal, taxes, total };
  const activeSubtotal = activeOrderCalc.subtotal;
  const activeTaxes = activeOrderCalc.taxes;
  const activeTotal = activeOrderCalc.total;
  const fallbackTotal = selectedTable?.currentBill || selectedTable?.activeOrder?.totalAmount || 0;

  const printBill = async (table, total, subtotal, taxes, method) => {
    const tableItems = getTableItems(table);
    const items = tableItems.length > 0 ? tableItems : cart;
    await printBillQZ({ table, items, subtotal, taxes, total, method });
  };

  const handlePayment = async (method) => {
    const txnAmount = activeTotal > 0 ? activeTotal : fallbackTotal;
    if (txnAmount === 0) {
      addNotification(
        'Cannot Settle',
        'Bill amount is ₹0. Ensure KOT was sent before settling.',
        'error'
      );
      setShowMethodPicker(false);
      return;
    }

    // Capture all needed state before any async/state-clearing
    const tableSnap = selectedTable;
    const subtotalSnap = activeSubtotal;
    const taxesSnap = activeTaxes;

    const tableItems = getTableItems(tableSnap);
    const itemsList = tableItems.length > 0 ? tableItems : cart;

    // Step 1: Show loading on button
    setIsPrintingBill(true);

    // Step 2: Print bill (mock resolves instantly)
    try {
      await printBill(tableSnap, txnAmount, subtotalSnap, taxesSnap, method);
    } catch (err) {
      console.warn('[Settlement] Print failed (non-blocking):', err.message);
    }

    setIsPrintingBill(false);

    // Step 3: Close modals + clear UI state
    setShowMethodPicker(false);
    setSelectedMethod(null);
    setSelectedTable(null);
    setShowPaymentModal(false);
    setSelectedPaymentMethod('UPI');
    setCart([]);

    // Step 4: Optimistic local state update
    const newTransaction = {
      id: `TXN-${Math.floor(10000 + Math.random() * 90000)}`,
      amount: txnAmount,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-GB'),
      timestamp: Date.now(),
      items: itemsList.length,
      itemsList: itemsList,
      captainId: tableSnap?.captainId || 'CASHIER',
      method: method,
      tableNumber: tableSnap?.id || null,
    };

    setPastTransactions(prev => {
      const updated = [newTransaction, ...prev];
      localStorage.setItem(TX_CACHE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('softshape_transactions_updated'));
      return updated;
    });

    if (tableSnap?.id) {
      // Fix billing alert cleanup — use tableBackendId, not tableId
      setBillingAlerts(prev => prev.filter(a => a.tableBackendId !== tableSnap.backendId));
      setActiveTables(prev => prev.map(t =>
        t.id === tableSnap.id
          ? { ...t, status: 'Free', captainId: null, kotHistory: [], currentBill: 0, guests: 0, time: null }
          : t
      ));
    }

    addNotification('Payment Success', `${method} • ₹${txnAmount.toFixed(0)} collected`, 'success');

    // Step 5: Fire background API calls — no await, non-blocking
    if (tableSnap?.activeOrder?.id) {
      markOrderPaid(tableSnap.activeOrder.id)
        .catch(err => console.warn('[BG] markOrderPaid failed:', err.message));
    }

    saveTransaction({
      restaurantId: activeRestaurantId,
      orderId: tableSnap?.activeOrder?.id || null,
      tableNumber: tableSnap?.id || null,
      captainId: tableSnap?.captainId || null,
      amount: txnAmount,
      method: method,
      itemCount: itemsList.length,
      items: itemsList,
    }).catch(err => console.warn('[BG] saveTransaction failed:', err.message));

    // Step 6: Reset table session in DB (clear kotHistory, currentBill, status → Free)
    const resetSessionPayload = {
      status: 'Free',
      kotHistory: [],
      currentBill: 0,
      captainId: null,
      guests: 0,
    };
    if (tableSnap?.backendId) {
      if (outlet === 'bar') {
        import('../services/barTableApi').then(({ updateBarTableSession }) => {
          updateBarTableSession(tableSnap.backendId, resetSessionPayload)
            .catch(err => console.warn('[BG] resetBarSession failed:', err.message));
        });
      } else {
        import('../services/tableApi').then(({ updateTableSession }) => {
          updateTableSession(tableSnap.backendId, resetSessionPayload)
            .catch(err => console.warn('[BG] resetTableSession failed:', err.message));
        });
      }
    }
  };

  const activeCategories = useMemo(() => {
    if (outlet === 'restaurant') return categories;
    const items = barMenuItems.filter(i => i.menuType === (barMenuTab === 'food' ? 'FOOD' : 'LIQUOR') && i.isAvailable !== false);
    const cats = items.map(i => i.category || i.c).filter(Boolean);
    return ['All', ...new Set(cats)];
  }, [outlet, categories, barMenuItems, barMenuTab]);

  const activeMenuItems = useMemo(() => {
    let itemsToFilter = [];
    if (outlet === 'restaurant') {
      itemsToFilter = menuItems.filter(item => item.menuType === 'FOOD');
    } else {
      itemsToFilter = barMenuItems.filter(
        (i) => i.menuType === (barMenuTab === 'food' ? 'FOOD' : 'LIQUOR') && i.isAvailable !== false
      );
    }

    return filterMenuItems(itemsToFilter, {
      query: searchQuery,
      category: selectedCategory,
      diet: activeDiet,
    });
  }, [outlet, menuItems, barMenuItems, barMenuTab, searchQuery, selectedCategory, activeDiet]);

  const handleAddItem = (item) => {
    if (outlet === 'bar' && item.variants && item.variants.length > 1) {
      setVariantPickerItem(item);
    } else {
      addToCart(item);
    }
  };

  const handleVariantSelect = (item, variant) => {
    addToCart({ ...item, n: `${item.n} (${variant.name})`, p: variant.price });
    setVariantPickerItem(null);
  };



  const updateKotStatus = (tableId, kotId, newStatus) => {
    setActiveTables(prev => prev.map(t => {
      if (t.id === tableId || t.backendId === tableId) {
        let allReady = true;
        const updatedKotHistory = (t.kotHistory || []).map(kot => {
          if (kot.id === kotId) {
            const updated = { ...kot, status: newStatus };
            if (newStatus !== 'Ready') allReady = false;
            return updated;
          }
          if (kot.status !== 'Ready') allReady = false;
          return kot;
        });

        let newTableStatus = t.status;
        if (newStatus === 'Ready' && allReady && updatedKotHistory.length > 0) {
          newTableStatus = 'Waiting Bill';
          addNotification("Order Ready", `All items ready for Table ${t.id}`, "success");
        } else if (newStatus === 'Preparing') {
          newTableStatus = 'Preparing';
        } else if (newStatus === 'Incoming' && t.status !== 'Waiting Bill') {
          newTableStatus = 'Occupied';
        }

        return { ...t, status: newTableStatus, kotHistory: updatedKotHistory };
      }
      return t;
    }));

    // Find the active orderId for this table from current state
    const targetTable = activeTables.find(t => t.id === tableId || t.backendId === tableId);
    const orderId = targetTable?.activeOrder?.id || targetTable?.orderId;
    const statusMap = { Incoming: 'PENDING', Preparing: 'PREPARING', Ready: 'READY' };
    const backendStatus = statusMap[newStatus];
    if (orderId && backendStatus) {
      updateOrderStatus(orderId, backendStatus).catch(err =>
        console.warn('[KOT Status] sync failed:', err.message)
      );
    }
  };

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.n === item.n);
      if (existing) return prev.map(i => i.n === item.n ? { ...i, q: i.q + 1 } : i);
      return [...prev, { ...item, q: 1, id: Date.now() }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          return { ...item, q: item.q + delta };
        }
        return item;
      });
      return updated.filter(item => item.q > 0);
    });
  };

  const onlineOrders = [
    { id: 'SW-9812', platform: 'Swiggy', items: ['Chicken Biryani x2', 'Coke x2'], amount: 960, status: 'Preparing', time: '4m ago' },
    { id: 'ZM-4521', platform: 'Zomato', items: ['Paneer Tikka x1', 'Butter Naan x3'], amount: 540, status: 'Ready', time: '12m ago' },
    { id: 'SW-9815', platform: 'Swiggy', items: ['Veg Noodles x2'], amount: 480, status: 'Incoming', time: 'Just now' },
  ];



  const handleSendKOT = () => {
    if (cart.length === 0) return;
    setIsKotSending(true);
    setIsKotSuccess(false);

    // Build local KOT for instant UI feedback
    const newKot = {
      id: Math.floor(1000 + Math.random() * 9000).toString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      items: cart.map(i => ({ ...i, s: 'KOT Sent' })),
      status: 'Incoming',
      createdAt: Date.now(),
      itemsReady: 0,
    };

    // Format items for API
    const apiItems = cart.map(i => ({
      menuItemId: String(i.id || i.menuItemId || i.n || i.name),
      name: i.n || i.name,
      price: Number(i.p ?? i.price ?? 0),
      quantity: Number(i.q ?? i.quantity ?? 1),
      notes: i.notes || null,
    }));

    // 1. Update UI instantly — fire and forget
    if (selectedTable) {
      const newTotalBill = calculateSessionBill(selectedTable, cart).subtotal;
      setActiveTables(prev => prev.map(t => {
        if (t.id === selectedTable.id) {
          return {
            ...t,
            status: t.status === 'Free' ? 'Occupied' : t.status,
            kotHistory: [...(t.kotHistory || []), newKot],
            currentBill: newTotalBill,
          };
        }
        return t;
      }));
    }

    setCart([]);
    setIsKotSending(false);
    setIsKotSuccess(true);
    addNotification('KOT Pushed', `Order for Table ${selectedTable?.id || 'Walk-in'} sent to kitchen.`, 'success');
    setTimeout(() => setIsKotSuccess(false), 2000);

    // 2. Fire API in background — no await, no blocking
    if (selectedTable?.backendId) {
      if (selectedTable.activeOrder?.id) {
        updateOrderItems(selectedTable.activeOrder.id, apiItems)
          .catch(err => console.warn('[BG] updateOrderItems failed:', err.message));
      } else {
        createOrder({
          tableId: selectedTable.backendId,
          restaurantId: activeRestaurantId,
          items: apiItems,
        }).catch(err => console.warn('[BG] createOrder failed:', err.message));
      }
    }
  };

  const stats = [
    { label: "Today's Sale", value: `₹${todaysSales.toFixed(0)}`, change: `${pastTransactions.length} txns`, icon: Wallet, color: "text-green-600", bg: "bg-green-50" },
    { label: "Active Tables", value: `${activeTableOrders.length}/${tables.length}`, change: "Live floor", icon: Table2, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Pending KOTs", value: String(liveKotQueue.length).padStart(2, '0'), change: `${activeTableOrders.filter(o => o.status === 'Waiting Bill').length} billing`, icon: ChefHat, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Online Orders", value: "26", change: "12 Swiggy, 14 Zomato", icon: Monitor, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="flex flex-col-reverse sm:flex-row h-[100dvh] bg-[#FFF5F5] font-sans overflow-hidden text-[#1A1A1A]">
      {/* SIDEBAR / BOTTOM BAR */}
      <aside className="w-full sm:w-16 lg:w-60 h-16 sm:h-auto bg-white border-t sm:border-t-0 sm:border-r border-[#FFCDD2] flex sm:flex-col z-30 transition-all shrink-0">
        <div className="hidden sm:flex p-2 lg:p-6 border-b border-[#FFCDD2] items-center justify-center shrink-0 bg-white">
          <div className="bg-white p-1 lg:p-3 rounded-xl lg:rounded-[32px] shadow-lg lg:shadow-xl border border-gray-50 aspect-square w-10 lg:w-36 flex items-center justify-center">
            <img
              src="/logo softshape.ai.png"
              alt="Softshape.ai"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <nav className="flex-1 sm:flex-grow flex sm:flex-col items-center sm:items-stretch overflow-x-auto sm:overflow-visible p-2 sm:space-y-0.5 sm:mt-2 gap-2 sm:gap-0 scrollbar-hide">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'pos', label: 'POS Billing', icon: ShoppingCart },
            { id: 'tables', label: 'Tables', icon: Table2 },
            { id: 'history', label: 'Past Transactions', icon: History },
            { id: 'online', label: 'Online Orders', icon: Monitor },
            { id: 'kitchen', label: 'Kitchen Status', icon: ChefHat },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); localStorage.setItem('cashier_active_tab', item.id); }}
              className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 px-4 sm:px-2.5 py-1.5 sm:py-2.5 rounded-xl transition-all group relative shrink-0 min-w-[70px] sm:min-w-0 ${activeTab === item.id
                  ? 'bg-[#E53935] text-white font-bold shadow-md shadow-red-100'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <item.icon size={18} className={activeTab === item.id ? 'text-white' : 'group-hover:scale-110 transition-transform'} />
              <span className="text-[9px] sm:hidden font-bold leading-none mt-0.5">{item.label.split(' ')[0]}</span>
              <span className="hidden lg:block text-xs uppercase tracking-tight">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="hidden sm:block p-2 border-t border-gray-100 mt-auto pb-8">
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

            <div className="flex items-center gap-2 text-gray-400">
              <Clock size={14} />
              <span className="text-[10px] font-black tabular-nums">{currentTime.toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <OutletToggle className="flex" />
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
              <button onClick={onLogout} className="sm:hidden ml-2 p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:text-red-600 hover:bg-red-50"><LogOut size={16} /></button>
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="flex-grow overflow-hidden flex flex-col">
          {/* Billing Alert Banner */}
          {billingAlerts.length > 0 && (
            <div className="mx-4 mt-3 flex flex-col gap-2">
              {billingAlerts.map(alert => (
                <div
                  key={alert.tableBackendId}
                  className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:bg-amber-100 transition-all"
                  onClick={() => {
                    // Find and select the table so cashier can process payment
                    const t = activeTables.find(tbl => tbl.backendId === alert.tableBackendId);
                    if (t) {
                      setSelectedTable(t);
                      setShowPaymentModal(true);
                      setActiveTab('tables');
                      localStorage.setItem('cashier_active_tab', 'tables');
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 bg-amber-500 rounded-full animate-pulse" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">
                        Table {alert.tableNumber} — Billing Requested
                      </p>
                      <p className="text-xs text-amber-700">
                        ₹{alert.totalAmount.toFixed(2)} • {alert.requestedAt}
                      </p>
                    </div>
                  </div>
                  <button className="text-xs font-bold text-amber-700 bg-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-300 transition">
                    Collect →
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'dashboard' ? (
            <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar bg-gray-50">
              {/* Stats Row */}
              <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto scrollbar-hide snap-x pb-1 sm:pb-0">
                {stats.map((stat, i) => (
                  <div key={i} className="min-w-[75vw] sm:min-w-0 snap-start shrink-0 bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
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
                        {activeTableOrders.map(o => (
                          <tr key={o.id} onClick={() => setSelectedTable(o.table)} className="hover:bg-gray-50 transition-colors cursor-pointer">
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
                              <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${o.status === 'Ready' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>{o.status}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <p className="text-[10px] font-black text-gray-900">₹{o.amount}</p>
                            </td>
                          </tr>
                        ))}
                        {activeTableOrders.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-8 text-center text-[10px] font-black uppercase tracking-widest text-gray-300">
                              No live table orders
                            </td>
                          </tr>
                        )}
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
                    {liveKotQueue.map((kot) => (
                      <div key={kot.id} className="p-2 rounded-lg border border-gray-100 bg-gray-50/50 hover:border-red-100 transition-all cursor-pointer">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[8px] font-black text-gray-400 uppercase">KOT-{kot.id}</span>
                          <span className="text-[8px] font-black text-orange-600 flex items-center gap-1">
                            <Timer size={10} /> {kot.time}
                          </span>
                        </div>
                        <p className="text-[10px] font-black text-gray-900 leading-tight">{kot.tableLabel} • {kot.items.length} Items</p>
                        <div className="mt-1 flex gap-1 flex-wrap">
                          {kot.items.slice(0, 3).map((item, idx) => (
                            <span key={`${kot.id}-${idx}`} className="text-[7px] font-bold bg-white border border-gray-100 px-1 rounded">{item.n} x{item.q}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {liveKotQueue.length === 0 && (
                      <div className="p-6 text-center text-[9px] font-black uppercase tracking-widest text-gray-300">
                        No live KOTs
                      </div>
                    )}
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
                  <div className="p-2 grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-8 lg:grid-cols-12 gap-1.5">
                    {activeTables.map((table, i) => {
                      const status = table?.status || 'Free';
                      const colorClass =
                        status === 'Free' ? 'bg-green-50 border-green-200 text-green-600' :
                          status === 'Waiting Bill' ? 'bg-amber-50 border-amber-200 text-amber-600 animate-pulse' :
                            status === 'Preparing' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                              'bg-red-50 border-red-200 text-red-600';
                      return (
                        <div key={i} className={`h-8 rounded-md border flex flex-col items-center justify-center transition-all cursor-pointer ${colorClass}`}>
                          <span className="text-[9px] font-black leading-none">{table.id}</span>
                          {table.captainName && <span className="text-[5px] font-black uppercase tracking-tighter mt-0.5 text-blue-600 truncate px-1 max-w-full">{table.captainName.split(' ')[0]}</span>}
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
                  {outlet === 'bar' && (
                    <BarMenuToggle active={barMenuTab} onChange={setBarMenuTab} />
                  )}
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
                    <input
                      type="search"
                      placeholder="Search by name, category, price, or ID..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-4 py-2 text-[11px] font-medium outline-none focus:border-[#E53935] focus:bg-white"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide py-1">
                    <div className="flex gap-1">
                      {activeCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all border shrink-0 ${selectedCategory === cat ? 'bg-[#E53935] border-[#E53935] text-white' : 'bg-white border-gray-200 text-gray-500'
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
                          className={`px-2 py-1 rounded-[4px] text-[8px] font-black uppercase transition-all ${activeDiet === diet ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                          {diet === 'All' ? 'All' : diet === 'veg' ? 'Veg' : 'Non'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex-grow overflow-y-auto p-2 bg-gray-50/30 custom-scrollbar">
                  {menuLoading ? (
                    <p className="text-center text-xs text-gray-400 py-8 font-bold uppercase tracking-widest">Syncing menu…</p>
                  ) : activeMenuItems.length === 0 ? (
                    <p className="text-center text-xs text-gray-500 py-8 font-bold col-span-full">
                      {searchQuery.trim()
                        ? `No items found for "${searchQuery.trim()}"`
                        : "No items in this category."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {activeMenuItems.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleAddItem(item)}
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
                      <div className="w-7 h-7 rounded-md bg-red-50 flex items-center justify-center text-[#E53935] font-black text-sm">
                        {selectedTable ? `T${selectedTable.id}` : 'POS'}
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-[10px] font-black text-gray-900 truncate">{selectedTable ? `Table ${selectedTable.id}` : 'Walk-in Order'}</p>
                        <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest leading-none">{selectedTable ? selectedTable.status : 'POS Draft'}</p>
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
                      className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all ${isKotSuccess ? 'bg-green-500 border-green-500 text-white' :
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
                      onClick={() => {
                        if (cart.length === 0) return;
                        setShowMethodPicker(true);
                      }}
                      disabled={!selectedTable && cart.length === 0}
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
                    {activeTables.map((table, i) => {
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
                          className={`aspect-square border rounded-2xl flex flex-col items-center justify-center text-center p-1 cursor-pointer transition-all hover:scale-105 active:scale-95 relative ${containerClass}`}
                        >
                          {table.captainName && (
                            <div className="absolute top-1 right-1 bg-blue-100 text-blue-600 px-1 py-0.5 rounded-[4px] text-[6px] font-black uppercase tracking-widest max-w-[80%] truncate shadow-sm">
                              {table.captainName.split(' ')[0]}
                            </div>
                          )}
                          <span className="text-xl font-black">{outlet === 'bar' ? `B${table.number ?? table.id}` : table.id}</span>
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
                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${txn.method === 'CASH' ? 'bg-green-100 text-green-700' :
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
                    {txnsLoading && pastTransactions.length === 0 && (
                      <div className="p-12 text-center flex flex-col items-center">
                        <div className="w-6 h-6 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Loading Transactions...</p>
                      </div>
                    )}
                    {!txnsLoading && pastTransactions.length === 0 && (
                      <div className="p-12 text-center flex flex-col items-center">
                        <History size={32} className="text-gray-200 mb-2" />
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No Recent Transactions</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'kitchen' && (
                  <div className="flex flex-col gap-4 h-full">
                    {/* Smart Summary Header */}
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 bg-white p-3 rounded-xl border border-gray-100 shadow-sm shrink-0">
                      <div className="text-center">
                        <p className="text-[9px] font-black uppercase text-gray-400">Incoming</p>
                        <p className="text-lg font-black text-gray-900">{liveKotQueue.filter(k => k.status === 'Incoming' || (!['Preparing', 'Ready'].includes(k.status))).length}</p>
                      </div>
                      <div className="text-center border-l border-gray-100">
                        <p className="text-[9px] font-black uppercase text-gray-400">Preparing</p>
                        <p className="text-lg font-black text-amber-600">{liveKotQueue.filter(k => k.status === 'Preparing').length}</p>
                      </div>
                      <div className="text-center border-l border-gray-100">
                        <p className="text-[9px] font-black uppercase text-gray-400">Ready</p>
                        <p className="text-lg font-black text-green-600">{liveKotQueue.filter(k => k.status === 'Ready').length}</p>
                      </div>
                      <div className="text-center border-l border-gray-100 hidden md:block">
                        <p className="text-[9px] font-black uppercase text-gray-400">Delayed</p>
                        <p className="text-lg font-black text-[#E53935]">
                          {liveKotQueue.filter(k => k.status !== 'Ready' && Date.now() - k.createdAt > 600000).length}
                        </p>
                      </div>
                      <div className="text-center border-l border-gray-100 hidden md:block">
                        <p className="text-[9px] font-black uppercase text-gray-400">Avg Time</p>
                        <p className="text-lg font-black text-gray-900">8m</p>
                      </div>
                      <div className="text-center border-l border-gray-100 hidden md:block">
                        <p className="text-[9px] font-black uppercase text-gray-400">Active Tables</p>
                        <p className="text-lg font-black text-gray-900">{activeTableOrders.length}</p>
                      </div>
                    </div>

                    {/* Kanban Board */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow min-h-0 overflow-y-auto pb-6">
                      {['Incoming', 'Preparing', 'Ready'].map((status) => (
                        <div key={status} className="flex flex-col gap-3 bg-gray-50/50 rounded-xl p-2 h-full border border-gray-100">
                          <div className="flex justify-between items-center px-1">
                            <h3 className="font-black text-[10px] uppercase tracking-widest text-gray-900">{status}</h3>
                            <span className="bg-white text-[9px] font-black px-2 py-0.5 rounded-md border border-gray-200">
                              {liveKotQueue.filter(k => k.status === status || (status === 'Incoming' && !['Preparing', 'Ready'].includes(k.status))).length}
                            </span>
                          </div>
                          <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-grow">
                            {liveKotQueue
                              .filter((kot) => {
                                if (status === 'Incoming') return kot.status === 'Incoming' || (!['Preparing', 'Ready'].includes(kot.status));
                                return kot.status === status;
                              })
                              .map((kot) => (
                                <div key={`${status}-${kot.id}`} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 group relative overflow-hidden transition-all hover:shadow-md">
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">{kot.tableLabel}</span>
                                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">KOT-{kot.id}</span>
                                    </div>
                                    <LiveTimer startTime={kot.createdAt} status={kot.status} />
                                  </div>

                                  <div className="mb-3">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">Capt. {kot.table.captainName?.split(' ')[0] || 'Walk-in'}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[9px] font-black text-[#E53935] uppercase">{kot.items.length} Items</span>
                                      <div className="w-1 h-1 rounded-full bg-gray-300" />
                                      <span className="text-[9px] font-black text-gray-500">{kot.itemsReady || 0}/{kot.items.length} Ready</span>
                                    </div>
                                  </div>

                                  <div className="space-y-1 text-[9px] text-gray-600 font-bold border-t border-gray-50 pt-2 mb-3">
                                    {kot.items.map((item, idx) => (
                                      <div key={`${kot.id}-${idx}`} className="flex justify-between items-center">
                                        <div className="flex items-center gap-1.5">
                                          <div className={`w-1.5 h-1.5 rounded-full ${item.t === 'veg' ? 'bg-green-500' : 'bg-red-500'}`} />
                                          <span className="truncate max-w-[120px]">{item.n}</span>
                                        </div>
                                        <span>x{item.q}</span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Actions */}
                                  <div className="flex gap-2 mt-2">
                                    {status === 'Incoming' && (
                                      <button onClick={() => updateKotStatus(kot.table.id, kot.id, 'Preparing')} className="flex-1 bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors">Start Prep</button>
                                    )}
                                    {status === 'Preparing' && (
                                      <button onClick={() => updateKotStatus(kot.table.id, kot.id, 'Ready')} className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors">Mark Ready</button>
                                    )}
                                    {status === 'Ready' && (
                                      <div className="flex-1 bg-gray-50 text-gray-400 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-center border border-gray-100">Waiting Pickup</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'online' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {onlineOrders.map(order => (
                      <div key={order.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:border-[#E53935] transition-all">
                        <div className="flex justify-between items-start mb-3">
                          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${order.platform === 'Swiggy' ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'
                            }`}>{order.platform}</span>
                          <span className="text-[9px] font-black text-gray-400">{order.time}</span>
                        </div>
                        <h3 className="text-[11px] font-black text-gray-900 mb-1">{order.id}</h3>
                        <div className="space-y-0.5 mb-4">
                          {order.items.map(item => <p key={item} className="text-[9px] text-gray-500 font-bold">{item}</p>)}
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                          <span className="text-[10px] font-black text-gray-900">₹{order.amount}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${order.status === 'Ready' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>{order.status}</span>
                        </div>
                      </div>
                    ))}
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
                <div className="w-10 h-10 rounded-xl bg-[#E53935] text-white flex items-center justify-center font-black text-xl">{outlet === 'bar' ? `B${selectedTable.number ?? selectedTable.id}` : `T${selectedTable.id}`}</div>
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
                  {((selectedTable.kotHistory && selectedTable.kotHistory.length > 0) ? selectedTable.kotHistory.flatMap(k => k.items || []) : (selectedTable.items || [])).map((item, idx) => (
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
                <div className="flex justify-between text-[9px] font-bold text-gray-400 uppercase"><span>Subtotal</span><span>₹{(activeSubtotal > 0 ? activeSubtotal : (fallbackTotal ? fallbackTotal / 1.18 : 0)).toFixed(0)}</span></div>
                <div className="flex justify-between text-[9px] font-bold text-gray-400 uppercase"><span>Taxes (18%)</span><span>₹{(activeTaxes > 0 ? activeTaxes : (fallbackTotal ? (fallbackTotal / 1.18) * 0.18 : 0)).toFixed(0)}</span></div>
                <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-1">
                  <span className="text-[10px] font-black text-gray-900 uppercase">Running Total</span>
                  <span className="text-2xl font-black text-[#E53935]">
                    ₹{(activeTotal > 0 ? activeTotal : fallbackTotal).toFixed(0)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setActiveTab('pos'); localStorage.setItem('cashier_active_tab', 'pos'); setSelectedTable(null); }}
                  className="py-3 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50"
                >
                  Add Items
                </button>
                <button
                  onClick={() => { setShowMethodPicker(true); }}
                  className="py-3 rounded-xl bg-[#E53935] text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-100"
                >
                  Settlement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT METHOD PICKER */}
      {showMethodPicker && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-100">

            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Settle Table {outlet === 'bar' ? `B${selectedTable?.number ?? selectedTable?.id}` : `T${selectedTable?.id}`}</p>
                <p className="text-2xl font-black text-gray-900 mt-1">₹{(activeTotal > 0 ? activeTotal : fallbackTotal).toFixed(0)}</p>
              </div>
              <button
                onClick={() => { setShowMethodPicker(false); setSelectedMethod(null); }}
                className="p-2 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-3">Select Payment Method</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { id: 'UPI', label: 'UPI', sub: 'GPay / PhonePe / Paytm' },
                  { id: 'CARD', label: 'Card', sub: 'Debit / Credit' },
                  { id: 'CASH', label: 'Cash', sub: 'Physical currency' },
                  { id: 'OTHER', label: 'Other', sub: 'Voucher / Mixed' },
                ].map(({ id, label, sub }) => (
                  <button
                    key={id}
                    onClick={() => setSelectedMethod(id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${selectedMethod === id
                        ? 'border-[#E53935] bg-red-50'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                      }`}
                  >
                    <p className={`text-sm font-black ${selectedMethod === id ? 'text-[#E53935]' : 'text-gray-700'}`}>{label}</p>
                    <p className="text-[9px] text-gray-400 font-medium mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>

              <button
                onClick={() => selectedMethod && !isPrintingBill && handlePayment(selectedMethod)}
                disabled={!selectedMethod || isPrintingBill}
                className={`w-full py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${selectedMethod && !isPrintingBill
                    ? 'bg-[#E53935] text-white shadow-lg shadow-red-100 hover:bg-[#c62828]'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
              >
                {isPrintingBill
                  ? 'Printing Bill...'
                  : selectedMethod
                    ? `Confirm ${selectedMethod} Payment`
                    : 'Select a Method'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* COMPACT SETTLEMENT */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-slide-in">
            <div className="md:w-1/3 p-6 bg-gray-50 border-r border-gray-100">
              <button onClick={() => { setShowPaymentModal(false); setSelectedTable(null); setSelectedPaymentMethod('UPI'); }} className="text-gray-400 hover:text-gray-900 mb-6"><X size={18} /></button>
              <h2 className="text-[9px] font-black uppercase text-gray-400 mb-1">Bill Amount</h2>
              <p className="text-4xl font-black text-gray-900 mb-6 tabular-nums">₹{(activeTotal > 0 ? activeTotal : fallbackTotal).toFixed(0)}</p>
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
                  <div
                    key={method}
                    onClick={() => setSelectedPaymentMethod(method)}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 cursor-pointer transition-all ${selectedPaymentMethod === method
                        ? 'border-[#E53935] bg-red-50 text-[#E53935]'
                        : 'border-gray-50 bg-gray-50 text-gray-400'
                      }`}
                  >
                    <CreditCard size={20} />
                    <span className="text-[8px] font-black uppercase">{method}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => handlePayment(selectedPaymentMethod)}
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
      <VariantPicker
        item={variantPickerItem}
        onSelect={handleVariantSelect}
        onClose={() => setVariantPickerItem(null)}
      />
    </div>
  );
};

export default CashierDashboard;
