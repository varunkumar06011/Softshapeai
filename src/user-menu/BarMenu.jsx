import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ShoppingBag, Plus, Minus, Bell, Star, Flame, Clock, X, Heart, TrendingUp, Sparkles, CheckCircle2 } from 'lucide-react';
import { validateAndCreateWaiterCall } from '../services/customerSessionService';
import { broadcastWaiterEvent, initSocket, useWaiterCalls } from '../services/waiterCallService';
import { fetchBarTables } from '../services/barTableApi';
import { createOrder, updateOrderItems } from '../services/orderApi';
import { apiUrl } from '../services/apiConfig';
import VariantPicker from '../shared/components/VariantPicker';
import { motion, AnimatePresence } from 'framer-motion';

const DEFAULT_FOOD_IMG = "https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop";
const DEFAULT_LIQUOR_IMG = "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=450&fit=crop";

const flattenSections = (payload) => {
  if (!Array.isArray(payload)) return [];
  if (payload.length > 0 && Array.isArray(payload[0]?.tables)) {
    return payload.flatMap((section) => section.tables || []);
  }
  return payload;
};

export default function BarMenu({ tableId }) {
  const getEngagement = (id, name) => {
    const hash = String(id || name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const purchases = (hash * 17) % 4800 + 200; // range: 200 to 5000
    const wishlist = (hash * 31) % 5800 + 200;  // range: 200 to 6000

    const formatVal = (val) => {
      if (val >= 1000) {
        return `${(val / 1000).toFixed(1).replace('.0', '')}K+`;
      }
      return String(val);
    };

    return {
      purchases: formatVal(purchases),
      wishlist: formatVal(wishlist)
    };
  };

  const getLiquorImage = (name = "") => {
    const lower = name.toLowerCase();
    if (lower.includes("beer") || lower.includes("corona") || lower.includes("budweiser") || lower.includes("heineken") || lower.includes("draught")) {
      return "https://images.unsplash.com/photo-1567696911980-2eed69a4604e?w=600&h=450&fit=crop";
    }
    if (lower.includes("whiskey") || lower.includes("whisky") || lower.includes("scotch") || lower.includes("bourbon") || lower.includes("glenfiddich") || lower.includes("black label") || lower.includes("jack daniel")) {
      return "https://images.unsplash.com/photo-1527061011665-3652c757a4d4?w=600&h=450&fit=crop";
    }
    if (lower.includes("vodka") || lower.includes("grey goose") || lower.includes("absolut") || lower.includes("smirnoff")) {
      return "https://images.unsplash.com/photo-1550985543-f47f38aeee65?w=600&h=450&fit=crop";
    }
    if (lower.includes("wine") || lower.includes("champagne") || lower.includes("prosecco") || lower.includes("cabernet") || lower.includes("chardonnay") || lower.includes("merlot")) {
      return "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&h=450&fit=crop";
    }
    if (lower.includes("cocktail") || lower.includes("mojito") || lower.includes("margarita") || lower.includes("gin") || lower.includes("rum") || lower.includes("tequila") || lower.includes("martini") || lower.includes("tonic")) {
      return "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&h=450&fit=crop";
    }
    return "https://images.unsplash.com/photo-1597290282695-edc43d0e7129?w=600&h=450&fit=crop";
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoriesData, setCategoriesData] = useState([]);
  const [flatItems, setFlatItems] = useState([]);
  const [tableBackendId, setTableBackendId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuType, setActiveMenuType] = useState('liquor'); // 'food' or 'liquor'
  const [activeCategory, setActiveCategory] = useState('All');
  const [dietFilter, setDietFilter] = useState('All'); // All, Veg, Non-Veg
  const [cart, setCart] = useState([]);

  // Modals state
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [variantPickerItem, setVariantPickerItem] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Waiter Call State
  const { activeCalls } = useWaiterCalls();
  const [callCooldown, setCallCooldown] = useState(0);

  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const lastScrollTop = useRef(0);

  const handleScroll = (e) => {
    const scrollTop = e.currentTarget.scrollTop;
    const diff = scrollTop - lastScrollTop.current;

    if (scrollTop <= 10) {
      setIsScrolledDown(false);
    } else if (Math.abs(diff) > 5) {
      if (diff > 0 && scrollTop > 50) {
        setIsScrolledDown(true);
      } else if (diff < 0) {
        setIsScrolledDown(false);
      }
    }
    lastScrollTop.current = scrollTop;
  };

  const myCall = activeCalls.find(c => String(c.tableId) === String(tableId));
  const isAccepted = myCall && myCall.status === 'accepted';
  const acceptedCaptainName = isAccepted ? myCall.acceptedBy?.name : null;

  useEffect(() => {
    let timer;
    if (callCooldown > 0) {
      timer = setInterval(() => setCallCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [callCooldown]);

  useEffect(() => {
    initSocket();
  }, []);

  // Fetch menu data and resolve table details
  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        const [posViewRes, itemsRes, tablesRes] = await Promise.all([
          fetch(apiUrl("/api/bar/menu/pos-view"), { cache: "no-store" }),
          fetch(apiUrl("/api/bar/menu/items"), { cache: "no-store" }),
          fetchBarTables()
        ]);

        if (!posViewRes.ok) throw new Error(`POS-view failed: ${posViewRes.status}`);
        if (!itemsRes.ok) throw new Error(`Items failed: ${itemsRes.status}`);

        const posViewData = await posViewRes.json();
        const itemsData = await itemsRes.json();
        const flatTables = flattenSections(tablesRes);

        if (active) {
          // Filter out unavailable items from both data sources
          const filteredPosView = (posViewData || []).map(cat => ({
            ...cat,
            items: (cat.items || []).filter(item => item.isAvailable !== false)
          })).filter(cat => cat.items.length > 0);

          const filteredItems = (itemsData || []).filter(item => item.isAvailable !== false);

          setCategoriesData(filteredPosView);
          setFlatItems(filteredItems);

          // Resolve backend table ID
          const matchNumber = String(tableId).match(/(\d+)/)?.[1] || tableId;
          const matchedTable = flatTables.find(t => String(t.number) === String(matchNumber) || String(t.id) === String(matchNumber));
          if (matchedTable) {
            setTableBackendId(matchedTable.id);
          }

          setLoading(false);
        }
      } catch (err) {
        if (active) {
          console.error("Bar menu loading error:", err);
          setError(err.message || "Failed to load bar menu.");
          setLoading(false);
        }
      }
    }
    loadData();
    return () => { active = false; };
  }, [tableId]);

  // Helper to extract item price safely
  const getItemPrice = (item) => {
    if (item.price !== undefined) return item.price;
    if (item.defaultPrice !== undefined) return item.defaultPrice;
    if (item.default_price !== undefined) return item.default_price;
    if (item.variants && item.variants.length > 0) {
      const defVariant = item.variants.find(v => v.isDefault) || item.variants[0];
      return defVariant ? defVariant.price : 0;
    }
    return 0;
  };

  // Filter Categories by Food vs Liquor
  const filteredCategories = useMemo(() => {
    if (!categoriesData) return [];
    return categoriesData.map(cat => {
      const items = (cat.items || []).filter(item => {
        const type = (item.menuType || 'FOOD').toUpperCase();
        const targetType = activeMenuType.toUpperCase();
        return type === targetType;
      });
      return { ...cat, items };
    }).filter(cat => cat.items.length > 0);
  }, [categoriesData, activeMenuType]);

  // Tab Categories list
  const displayCategories = useMemo(() => {
    return ['All', ...filteredCategories.map(c => c.name)];
  }, [filteredCategories]);

  // Filter items to render
  const itemsToDisplay = useMemo(() => {
    let items = [];

    // If search query is active, search globally on flatItems matching menuType
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      items = flatItems.filter(item =>
        item.name?.toLowerCase().includes(q) &&
        (item.menuType || 'FOOD').toUpperCase() === activeMenuType.toUpperCase()
      ).map(item => ({
        ...item,
        c: item.category || 'Bar'
      }));
    } else {
      // Use pos-view nested categories
      if (activeCategory === 'All') {
        items = filteredCategories.flatMap(c => c.items.map(item => ({ ...item, c: c.name })));
      } else {
        const targetCat = filteredCategories.find(c => c.name === activeCategory);
        if (targetCat) {
          items = targetCat.items.map(item => ({ ...item, c: targetCat.name }));
        }
      }
    }

    // Apply Veg/Non-Veg filter
    if (dietFilter === 'Veg') {
      items = items.filter(item => item.isVeg === true || item.t === 'veg');
    } else if (dietFilter === 'Non-Veg') {
      items = items.filter(item => item.isVeg === false || item.t === 'non');
    }

    return items.map(item => {
      const isLiquor = (item.menuType || '').toUpperCase() === 'LIQUOR';
      let finalImg = item.imageUrl || item.img;
      const foodPlaceholder = "https://images.unsplash.com/photo-1546069901-ba9599a1e2c2?w=600&h=450&fit=crop";

      if (isLiquor && (!finalImg || finalImg === foodPlaceholder)) {
        finalImg = getLiquorImage(item.name || item.n);
      } else if (!finalImg) {
        finalImg = DEFAULT_FOOD_IMG;
      }

      return {
        ...item,
        n: item.name || item.n,
        p: getItemPrice(item),
        t: item.isVeg ? 'veg' : 'non',
        img: finalImg
      };
    });
  }, [filteredCategories, flatItems, activeCategory, dietFilter, searchQuery, activeMenuType]);

  // Cart actions
  const addToCart = (item, variant = null, e = null) => {
    if (e) e.stopPropagation();

    // Prompt for variant if not specified and item has multiple variants
    if (item.variants && item.variants.length > 1 && !variant) {
      setVariantPickerItem(item);
      return;
    }

    const selectedVariant = variant || (item.variants && item.variants[0]) || null;
    const finalName = selectedVariant ? `${item.n || item.name} (${selectedVariant.name})` : (item.n || item.name);
    const finalPrice = selectedVariant ? selectedVariant.price : (item.p ?? getItemPrice(item));

    setCart(prev => {
      const existing = prev.find(i => i.n === finalName);
      if (existing) {
        if (existing.q >= 6) return prev;
        return prev.map(i => i.n === finalName ? { ...i, q: i.q + 1 } : i);
      }
      return [...prev, {
        id: item.id,
        n: finalName,
        p: finalPrice,
        q: 1,
        t: item.t || (item.isVeg ? 'veg' : 'non'),
        c: item.c || item.category || 'Bar',
        img: item.img || item.imageUrl || (activeMenuType === 'liquor' ? DEFAULT_LIQUOR_IMG : DEFAULT_FOOD_IMG),
        menuType: item.menuType
      }];
    });
  };

  const removeFromCart = (item, e = null) => {
    if (e) e.stopPropagation();
    setCart(prev => {
      const existing = prev.find(i => i.n === item.n);
      if (existing && existing.q > 1) {
        return prev.map(i => i.n === item.n ? { ...i, q: i.q - 1 } : i);
      }
      return prev.filter(i => i.n !== item.n);
    });
  };

  const handleVariantSelect = (item, variant) => {
    addToCart(item, variant);
    setVariantPickerItem(null);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.p * item.q), 0);
  const total = subtotal; // Bar menu has direct pricing without default gamified discount

  // Call Waiter handler
  const handleCallWaiter = () => {
    if (callCooldown > 0) return;
    const validation = validateAndCreateWaiterCall(tableId, 'bar');

    if (validation.success) {
      broadcastWaiterEvent('customer:call_waiter', {
        tableId,
        callId: validation.callId,
        timestamp: Date.now(),
        source: 'bar'
      });
      setCallCooldown(15);
    } else {
      setCallCooldown(validation.retryAfter);
    }
  };

  // Place Order integration
  const handleConfirmOrder = async () => {
    if (cart.length === 0) return;
    if (!tableBackendId) {
      alert("Table session is not fully synchronized yet. Please try again in a few seconds.");
      return;
    }

    setIsPlacingOrder(true);
    try {
      // 1. Fetch latest table state to verify activeOrder
      const tablesRes = await fetchBarTables();
      const flatTables = flattenSections(tablesRes);
      const matched = flatTables.find(t => String(t.id) === String(tableBackendId));

      if (!matched) {
        throw new Error("Could not verify table session on server.");
      }

      const activeOrderId = matched.orders?.[0]?.id || matched.activeOrder?.id;

      // Format items for POS api compatibility
      const apiItems = cart.map(i => ({
        menuItemId: String(i.id),
        name: i.n,
        price: Number(i.p),
        quantity: Number(i.q),
        notes: null,
        menuType: (i.menuType || 'FOOD').toUpperCase() === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
      }));

      if (activeOrderId) {
        await updateOrderItems(activeOrderId, apiItems);
      } else {
        await createOrder({
          tableId: tableBackendId,
          restaurantId: "bar-001",
          items: apiItems
        });
      }

      setCart([]);
      setIsOrderModalOpen(false);
      setShowSuccessModal(true);
    } catch (err) {
      console.error("Order placement failed:", err);
      alert(`Failed to place order: ${err.message || err}`);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FFF5F5] text-[#B71C1C]">
        <div className="w-10 h-10 rounded-full border-4 border-t-[#B71C1C] border-red-100 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#FFF5F5] text-red-700 p-6 text-center">
        <p className="text-lg font-bold mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-[#B71C1C] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#FFF5F5] text-gray-900 font-['Inter',sans-serif] overflow-hidden relative">

      {/* Background Decor */}
      <div className={`absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b ${activeMenuType === 'liquor' ? 'from-amber-500/10' : 'from-red-500/10'} to-transparent pointer-events-none transition-all duration-500`} />

      {/* Header */}
      <header className={`px-4 sm:px-6 transition-all duration-300 ease-in-out shrink-0 relative z-20 ${isScrolledDown ? 'pt-3 pb-2 bg-[#FFF5F5] border-b border-red-100/30' : 'pt-6 sm:pt-10 pb-4'
        }`}>
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isScrolledDown ? 'h-0 opacity-0 mb-0 pointer-events-none' : 'h-16 opacity-100 mb-3'
          }`}>
          <div className="flex justify-between items-start">
            <div className="animate-in fade-in slide-in-from-left-4">
              <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">BAR TABLE {tableId.replace('table-', '')}</h1>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${activeMenuType === 'liquor' ? 'bg-amber-600 animate-pulse' : 'bg-[#FF4D4F] animate-pulse'}`} />
                Premium Lounge Experience
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className={`relative group shadow-[0_10px_30px_rgba(183,28,28,0.04)] rounded-xl sm:rounded-2xl transition-all hover:shadow-[0_10px_30px_rgba(183,28,28,0.08)] transition-all duration-300 ${isScrolledDown ? 'mb-2' : 'mb-3 sm:mb-4'
          }`}>
          <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-red-300 group-focus-within:text-[#B71C1C] transition-colors" size={16} />
          <input
            type="search"
            placeholder={activeMenuType === 'liquor' ? "Search fine spirits & drinks..." : "Search bar appetizers & food..."}
            className={`w-full bg-white border border-red-50 pl-10 sm:pl-12 pr-4 text-xs sm:text-sm font-bold outline-none focus:border-[#B71C1C]/30 focus:ring-4 focus:ring-red-50/50 transition-all text-gray-800 placeholder-gray-400 transition-all duration-300 ${isScrolledDown ? 'py-2 rounded-xl' : 'py-3.5 sm:py-4 rounded-2xl'
              }`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Menu Type Selector */}
        <div className={`flex items-center bg-white/80 border border-red-50 rounded-xl sm:rounded-2xl p-0.5 sm:p-1 gap-1 shadow-sm max-w-xs mx-auto transition-all duration-300`}>
          <button
            onClick={() => { setActiveMenuType('food'); setActiveCategory('All'); }}
            className={`flex-1 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${isScrolledDown ? 'py-1.5' : 'py-2.5 sm:py-3'
              } ${activeMenuType === 'food'
                ? 'bg-gradient-to-r from-[#FF6B6B] to-[#FF4D4F] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            🍗 Food
          </button>
          <button
            onClick={() => { setActiveMenuType('liquor'); setActiveCategory('All'); }}
            className={`flex-1 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${isScrolledDown ? 'py-1.5' : 'py-2.5 sm:py-3'
              } ${activeMenuType === 'liquor'
                ? 'bg-gradient-to-r from-[#B71C1C] to-[#E53935] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            🥃 Liquor
          </button>
        </div>
      </header>

      {/* Filters & Categories */}
      <div className="shrink-0 relative z-10 sticky top-0 bg-[#FFF5F5]/90 backdrop-blur-xl border-b border-red-50 pb-1.5 sm:pb-2">
        {/* Diet Toggle */}
        <div className={`px-4 sm:px-6 flex gap-1.5 sm:gap-2 transition-all duration-300 ease-in-out overflow-hidden ${isScrolledDown ? 'h-0 opacity-0 py-0 mb-0 pointer-events-none' : 'h-10 py-2'
          }`}>
          {['All', 'Veg', 'Non-Veg'].map(diet => (
            <button
              key={diet}
              onClick={() => setDietFilter(diet)}
              className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${dietFilter === diet
                  ? (diet === 'Veg' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : diet === 'Non-Veg' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-200 text-gray-800 border border-gray-300')
                  : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'
                }`}
            >
              {diet === 'All' ? 'Any' : diet}
            </button>
          ))}
        </div>

        {/* Category Tab Scroll */}
        <div className={`px-4 sm:px-6 overflow-x-auto scrollbar-hide flex gap-2 sm:gap-3 transition-all duration-300 ease-in-out ${isScrolledDown ? 'py-1' : 'py-1.5 sm:py-2'
          }`}>
          {displayCategories.map(cat => {
            const isSelected = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`transition-all duration-300 shrink-0 border flex items-center gap-1 sm:gap-1.5 ${isScrolledDown
                    ? 'px-4 py-1.5 text-[9px] rounded-full'
                    : 'px-5 sm:px-6 py-2.5 sm:py-3 text-[10px] rounded-full'
                  } ${isSelected
                    ? activeMenuType === 'liquor'
                      ? 'bg-gradient-to-r from-[#B71C1C] to-[#E53935] text-white border-transparent shadow-[0_10px_20px_rgba(183,28,28,0.2)] scale-105'
                      : 'bg-gradient-to-r from-[#FF4D4F] to-[#FF6B6B] text-white border-transparent shadow-[0_10px_20px_rgba(255,77,79,0.2)] scale-105'
                    : 'bg-white border-red-50 text-gray-500 hover:bg-red-50/50 hover:text-gray-900 shadow-sm'
                  }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu List */}
      <div
        onScroll={handleScroll}
        className="flex-grow overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-36 sm:pb-40 space-y-5 scroll-smooth z-0"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {itemsToDisplay.map(item => {
            const qty = cart.find(i => i.n.startsWith(item.name || item.n))?.q || 0;
            return (
              <div
                key={item.id}
                onClick={() => setPreviewItem(item)}
                className="cursor-pointer bg-white border border-red-50 rounded-2xl xs:rounded-[28px] p-3 xs:p-4 flex gap-3 xs:gap-5 items-center group hover:shadow-[0_15px_30px_rgba(183,28,28,0.06)] transition-all duration-300 shadow-[0_5px_15px_rgba(0,0,0,0.02)] hover:border-red-100"
              >
                <div className="w-20 h-20 xs:w-24 xs:h-24 sm:w-28 sm:h-28 rounded-xl xs:rounded-[20px] sm:rounded-[24px] overflow-hidden shrink-0 relative shadow-inner">
                  <img src={item.img} alt={item.n} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />

                  {/* Veg/Non indicator */}
                  <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm p-1 rounded-md shadow-sm">
                    <div className={`w-2 h-2 xs:w-2.5 xs:h-2.5 rounded-full ${item.t === 'veg' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  </div>
                </div>

                <div className="flex-grow min-w-0 py-1">
                  <div className="flex items-center gap-1.5 xs:gap-2 mb-1">
                    <span className="text-[9px] font-bold text-red-500/80 uppercase tracking-wider truncate">{item.c}</span>
                    {item.menuType === 'LIQUOR' && (
                      <span className="text-[7px] xs:text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-200/50 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                        🥃 Liquor
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-sm sm:text-base text-gray-800 tracking-tight leading-snug mb-1 pr-2">{item.n}</h3>

                  {/* Stats */}
                  <div className="flex items-center gap-1.5 mb-1.5 xs:mb-2 text-[8px] xs:text-[9px] font-bold text-gray-400">
                    <span className="flex items-center gap-0.5"><TrendingUp size={9} className="text-emerald-500" /> {getEngagement(item.id, item.n).purchases}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5"><Heart size={9} className="text-[#B71C1C]" /> {getEngagement(item.id, item.n).wishlist}</span>
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    <div>
                      <span className="text-sm xs:text-lg font-black text-[#B71C1C]">₹{item.p}</span>
                      {item.variants && item.variants.length > 1 && (
                        <span className="text-[8px] xs:text-[9px] font-bold text-gray-400 ml-1 xs:ml-1.5 shrink-0">({item.variants.length} Opt)</span>
                      )}
                    </div>

                    {/* Add to Cart Actions */}
                    {qty > 0 ? (
                      <div className="flex items-center gap-1 xs:gap-2 bg-red-50 rounded-full px-1.5 xs:px-2 py-1 xs:py-1.5 border border-red-100">
                        {/* If it's a simple item without multiple variants, show quick controls, else click to manage */}
                        {item.variants && item.variants.length > 1 ? (
                          <span className="text-[8px] xs:text-[9px] font-black px-1.5 xs:px-2 text-gray-500 uppercase tracking-widest">Added</span>
                        ) : (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); const cartItem = cart.find(i => i.id === item.id); if (cartItem) removeFromCart(cartItem); }} className="w-6 h-6 xs:w-7 xs:h-7 rounded-full bg-white text-[#B71C1C] flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm">
                              <Minus size={12} />
                            </button>
                            <span className="text-xs font-black w-4 text-center text-gray-900">{qty}</span>
                            <button onClick={(e) => addToCart(item, null, e)} className="w-6 h-6 xs:w-7 xs:h-7 rounded-full bg-[#B71C1C] text-white flex items-center justify-center hover:bg-[#E53935] transition-colors shadow-sm">
                              <Plus size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={(e) => addToCart(item, null, e)}
                        className="px-3.5 xs:px-5 py-2 xs:py-2.5 rounded-full bg-white border border-red-100 text-[9px] xs:text-[10px] font-black uppercase tracking-widest text-[#B71C1C] hover:bg-[#B71C1C] hover:text-white transition-all shadow-sm group-hover:border-[#B71C1C]"
                      >
                        Add
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Call Waiter Button */}
      <div
        className={`absolute right-4 sm:right-6 z-50 transition-all duration-300 ease-in-out ${cart.length > 0
            ? 'bottom-[84px] xs:bottom-[92px] sm:bottom-[100px]'
            : 'bottom-6 sm:bottom-8'
          }`}
      >
        {isAccepted ? (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-[0_12px_30px_rgba(16,185,129,0.3)] bg-gradient-to-r from-emerald-500 to-green-500 text-white animate-in slide-in-from-bottom-5 zoom-in pointer-events-auto max-w-[180px] sm:max-w-[220px]">
            <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center shrink-0">
              <Star size={12} className="text-yellow-300 fill-yellow-300" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] font-bold text-emerald-100 uppercase tracking-widest leading-none mb-0.5">Captain</span>
              <span className="text-[11px] font-black uppercase tracking-wider leading-none truncate">
                {acceptedCaptainName}
              </span>
            </div>
          </div>
        ) : (
          <button
            onClick={handleCallWaiter}
            disabled={callCooldown > 0}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-[0_10px_25px_rgba(183,28,28,0.25)] transition-all duration-300 pointer-events-auto cursor-pointer focus:outline-none hover:scale-105 active:scale-95 ${callCooldown > 0
                ? 'bg-white border border-gray-200 text-gray-400 cursor-not-allowed shadow-sm'
                : 'bg-gradient-to-r from-[#B71C1C] to-[#E53935] text-white animate-[pulse-glow_2s_infinite]'
              }`}
          >
            {callCooldown > 0 ? (
              <>
                <Clock size={14} className="shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider">Wait {callCooldown}s</span>
              </>
            ) : (
              <>
                <Bell size={14} className="animate-wiggle shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider">Call Waiter</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Sticky Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full z-40 px-4 pb-4 pt-8 bg-gradient-to-t from-[#FFF5F5] via-[#FFF5F5]/90 to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto bg-white border border-red-50 p-3 sm:p-3.5 rounded-2xl sm:rounded-3xl shadow-[0_15px_40px_rgba(183,28,28,0.12)] flex items-center justify-between animate-in slide-in-from-bottom-10">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-50 flex items-center justify-center relative shadow-inner border border-red-100 shrink-0">
                <ShoppingBag size={18} className="text-[#B71C1C]" />
                <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#B71C1C] text-white text-[8px] sm:text-[10px] font-black flex items-center justify-center shadow-md">
                  {cart.reduce((s, i) => s + i.q, 0)}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Your Bar Order</p>
                <div className="flex items-baseline gap-1 sm:gap-2">
                  <span className="text-base sm:text-xl font-black leading-none text-gray-900">₹{total}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="px-5 sm:px-8 py-2.5 sm:py-3.5 rounded-full bg-gray-900 text-white text-[9px] sm:text-[11px] font-black uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
            >
              View Order
            </button>
          </div>
        </div>
      )}

      {/* Quick Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setPreviewItem(null)}>
          <div className="bg-white rounded-[40px] w-full max-w-sm overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.2)] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="h-64 w-full relative">
              <img src={previewItem.img} alt={previewItem.n} className="w-full h-full object-cover" />
              <button
                onClick={() => setPreviewItem(null)}
                className="absolute top-4 right-4 w-10 h-10 bg-black/50 backdrop-blur-md rounded-full text-white flex items-center justify-center hover:bg-black/70 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${previewItem.t === 'veg' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-900">{previewItem.t}</span>
              </div>
            </div>

            <div className="p-8">
              <h2 className="text-2xl font-black text-gray-900 mb-2 leading-tight">{previewItem.n}</h2>
              <p className="text-sm font-bold text-gray-500 mb-4">{previewItem.c}</p>

              <div className="bg-red-50/50 rounded-2xl p-4 mb-6">
                <p className="text-xs font-semibold text-gray-600 leading-relaxed">
                  Enjoy our premium lounge curation. Crafted with absolute precision for your tasting pleasure.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-black text-[#B71C1C] uppercase tracking-widest">
                  <Flame size={12} /> Fine Select
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-3xl font-black text-[#B71C1C]">₹{previewItem.p}</span>
                </div>

                {previewItem.variants && previewItem.variants.length > 1 ? (
                  <button
                    onClick={() => { setVariantPickerItem(previewItem); setPreviewItem(null); }}
                    className="px-6 py-3.5 rounded-full bg-gradient-to-r from-[#B71C1C] to-[#E53935] text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md"
                  >
                    Select Option
                  </button>
                ) : (
                  cart.find(i => i.n === previewItem.n) ? (
                    <div className="flex items-center gap-4 bg-red-50 rounded-full px-3 py-2 border border-red-100">
                      <button onClick={() => removeFromCart(previewItem)} className="w-10 h-10 rounded-full bg-white text-[#B71C1C] flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm">
                        <Minus size={18} />
                      </button>
                      <span className="text-base font-black w-6 text-center text-gray-900">{cart.find(i => i.n === previewItem.n).q}</span>
                      <button onClick={() => addToCart(previewItem)} className="w-10 h-10 rounded-full bg-[#B71C1C] text-white flex items-center justify-center hover:bg-[#E53935] transition-colors shadow-sm">
                        <Plus size={18} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(previewItem)}
                      className="px-8 py-4 rounded-full bg-gradient-to-r from-[#B71C1C] to-[#E53935] text-white text-[12px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_rgba(183,28,28,0.2)]"
                    >
                      Add to Cart
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Variant Picker Modal */}
      {variantPickerItem && (
        <VariantPicker
          item={variantPickerItem}
          onSelect={handleVariantSelect}
          onClose={() => setVariantPickerItem(null)}
        />
      )}

      {/* View Order Modal (Cart Drawer) */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsOrderModalOpen(false)}>
          <div className="bg-white rounded-t-[40px] w-full max-h-[85vh] flex flex-col overflow-hidden shadow-[0_-40px_80px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom-full duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-black text-gray-900">Your Bar Order</h2>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Ready to sync with POS</p>
              </div>
              <button
                onClick={() => setIsOrderModalOpen(false)}
                className="w-10 h-10 bg-gray-100 rounded-full text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              {cart.map(item => (
                <div key={item.n} className="flex items-center gap-4">
                  <img src={item.img} alt={item.n} className="w-16 h-16 rounded-2xl object-cover shadow-sm" />
                  <div className="flex-grow min-w-0">
                    <h3 className="font-black text-sm text-gray-900 truncate">{item.n}</h3>
                    <p className="text-sm font-black text-[#B71C1C] mt-1">₹{item.p * item.q}</p>
                  </div>

                  <div className="flex items-center gap-3 bg-gray-50 rounded-full px-2 py-1 border border-gray-200">
                    <button onClick={() => removeFromCart(item)} className="w-8 h-8 rounded-full bg-white text-gray-600 flex items-center justify-center hover:bg-gray-100 transition-colors shadow-sm">
                      <Minus size={14} />
                    </button>
                    <span className="text-xs font-black w-4 text-center text-gray-900">{item.q}</span>
                    <button onClick={() => addToCart(item)} className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 transition-colors shadow-sm">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 shrink-0">
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-gray-900 uppercase tracking-widest">Total Amount</span>
                  <span className="text-3xl font-black text-gray-900">₹{total}</span>
                </div>
              </div>

              <button
                onClick={handleConfirmOrder}
                disabled={isPlacingOrder}
                className="w-full py-4.5 rounded-full bg-gradient-to-r from-[#B71C1C] to-[#E53935] text-white text-sm font-black uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-[0_15px_30px_rgba(183,28,28,0.2)] mt-2 flex items-center justify-center disabled:opacity-50"
              >
                {isPlacingOrder ? "Placing Order..." : "Confirm & Send to POS"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Order Confirmation Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden"
            >
              <div className="w-20 h-20 mx-auto bg-gradient-to-r from-emerald-500 to-green-500 rounded-full flex items-center justify-center mb-6 shadow-md">
                <CheckCircle2 className="text-white w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tighter uppercase">Order Confirmed!</h2>
              <p className="text-sm font-bold text-gray-500 mb-6">
                Your order has been sent to the POS and is being prepared by our bartenders.
              </p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-4 rounded-full bg-gray-900 text-white font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
              >
                Back to Menu
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
