import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Search, ShoppingBag, Plus, Minus, Bell, Star, Flame, Clock, X, Heart, TrendingUp, AlertTriangle } from 'lucide-react';
import { useMenuSync } from '../hooks/useMenuSync';
import { fetchPublicMenu } from '../services/unifiedMenuService';
import { filterMenuItems } from '../shared/utils/menuSearch';
import { generateCallId } from '../services/customerSessionService';
import { initPublicSocket, useWaiterCalls, API_BASE } from '../services/waiterCallService';
import { getPublicSocket } from '../hooks/useSocket';
import { apiUrl } from '../services/apiConfig';


export default function CustomerMenu({ slug, tableId, sig, isMenuOnly = false, discountPercentage = 0 }) {
  const { menuItems: legacyMenuItems, categories: legacyCategories, loading: legacyLoading } = useMenuSync();
  const [unifiedMenu, setUnifiedMenu] = useState(null);
  const [unifiedLoading, setUnifiedLoading] = useState(true);
  const [menuError, setMenuError] = useState(false);
  const [tableNumber, setTableNumber] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [dietFilter, setDietFilter] = useState('All'); // All, Veg, Non-Veg
  const [cart, setCart] = useState([]);

  // Fetch public menu by slug
  useEffect(() => {
    setUnifiedLoading(true);
    setMenuError(false);
    fetchPublicMenu(slug, 'family-restaurant', tableId, sig)
      .then(data => {
        if (!data.success || data.error) {
          setMenuError(true);
        }
        setUnifiedMenu(data);
        if (data.tableNumber) setTableNumber(data.tableNumber);
        setUnifiedLoading(false);
      })
      .catch(err => {
        console.error('[CustomerMenu] Failed to fetch public menu:', err);
        setMenuError(true);
        setUnifiedLoading(false);
      });
  }, [slug, tableId, sig]);

  // Derive menu items and categories from unified menu
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
            img: item.image || null,
            desc: item.description || '',
            menuType: item.menuType,
            isAvailable: item.isActive,
            variants: item.variants?.map(v => ({...v, price: Number(v.price)}))
          });
        });
      });
      return items;
    }
    return legacyMenuItems;
  }, [unifiedMenu, legacyMenuItems]);

  const categories = useMemo(() => {
    if (unifiedMenu && unifiedMenu.categories) {
      const visibleCats = unifiedMenu.categories;
      return ['All', ...visibleCats.map(cat => cat.name)].filter(Boolean);
    }
    return ['All', ...legacyCategories].filter(Boolean);
  }, [unifiedMenu, legacyCategories]);

  const loading = unifiedLoading || legacyLoading;

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

  const getEngagement = useCallback((id, name) => {
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
  }, []);

  // Modals state
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);

  // Waiter Call State
  const { activeCalls } = useWaiterCalls();
  const [callCooldown, setCallCooldown] = useState(0);

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
    // Only init public socket if we have table context (not menu-only mode)
    if (!isMenuOnly && slug && tableId && sig) {
      initPublicSocket(slug, tableId, sig);
    }

    // Listen for socket menu update events from admin panel
    const onMenuItemUpdated = (payload) => {
      console.log('[CustomerMenu] Received menu-item-updated:', payload);
      window.dispatchEvent(new CustomEvent('menu-item-updated', { detail: payload }));
    };

    // Use getPublicSocket directly instead of window.__softshape_public_socket
    // to avoid race condition where the global isn't set yet
    let socket = null;
    if (!isMenuOnly && slug && tableId && sig) {
      try {
        socket = getPublicSocket(slug, tableId, sig);
      } catch (e) {
        console.warn('[CustomerMenu] Failed to get public socket:', e.message);
      }
    } else {
      socket = window.__softshape_public_socket;
    }

    if (socket) {
      socket.on('menu-item-updated', onMenuItemUpdated);
    }

    return () => {
      if (socket) {
        socket.off('menu-item-updated', onMenuItemUpdated);
      }
    };
  }, [isMenuOnly, slug, tableId, sig]);

  const filteredMenu = useMemo(() => {
    if (!menuItems) return [];
    let items = filterMenuItems(menuItems, {
      query: searchQuery,
      category: activeCategory,
      diet: 'All',
    });

    // Apply Veg/Non-Veg filter locally without breaking existing logic
    if (dietFilter === 'Veg') items = items.filter(i => i.t === 'veg');
    if (dietFilter === 'Non-Veg') items = items.filter(i => i.t === 'non');

    // Sort: items with images first, no-image items last (preserve original order within each group)
    const withImage = items.filter(i => i.img);
    const withoutImage = items.filter(i => !i.img);
    items = [...withImage, ...withoutImage];

    return items;
  }, [searchQuery, activeCategory, dietFilter, menuItems]);

  const todaySpecials = useMemo(() => {
    let specials = menuItems.filter(i => i.isSpecial && i.active && (!i.expiresAt || Date.now() < i.expiresAt));
    if (dietFilter === 'Veg') specials = specials.filter(i => i.t === 'veg');
    if (dietFilter === 'Non-Veg') specials = specials.filter(i => i.t === 'non');
    return specials;
  }, [menuItems, dietFilter]);

  const addToCart = (item, e) => {
    if (e) e.stopPropagation(); // prevent opening preview modal

    setCart(prev => {
      const existing = prev.find(i => i.id === item.id || i.n === item.n);
      if (existing) {
        if (existing.q >= 6) return prev; // Limit max 6
        return prev.map(i => (i.id === item.id || i.n === item.n) ? { ...i, q: i.q + 1 } : i);
      }
      return [...prev, { ...item, q: 1 }];
    });
  };

  const removeFromCart = (item, e) => {
    if (e) e.stopPropagation();
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id || i.n === item.n);
      if (existing && existing.q > 1) {
        return prev.map(i => (i.id === item.id || i.n === item.n) ? { ...i, q: i.q - 1 } : i);
      }
      return prev.filter(i => (i.id !== item.id && i.n !== item.n));
    });
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.p * item.q), 0);

  // Future-proof Coupon Architecture
  const discountAmount = Math.floor(subtotal * (discountPercentage / 100));
  const total = subtotal - discountAmount;

  const handleCallWaiter = async () => {
    if (callCooldown > 0) return;
    
    console.log(`[CustomerMenu] Call Waiter clicked for table ${tableId}`);
    const callId = generateCallId();

    try {
      const res = await fetch(apiUrl('/api/public/call-waiter'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, tableId, sig, callId, source: 'restaurant' }),
      });
      const result = await res.json();

      if (result.success) {
        console.log('[CustomerMenu] Waiter call successful:', result);
        setCallCooldown(15);
      } else if (result.reason === 'COOLDOWN') {
        console.log(`[CustomerMenu] Call blocked — cooldown: ${result.retryAfter}s remaining`);
        setCallCooldown(result.retryAfter);
      } else {
        console.warn('[CustomerMenu] Waiter call failed:', result.error);
        setCallCooldown(5);
      }
    } catch (err) {
      console.error('[CustomerMenu] Failed to call waiter:', err);
      setCallCooldown(5);
    }
  };

  const displayCategories = ['All', 'Today Specials', ...categories.filter(c => c !== 'All')];

  // Skeleton components
  const CategorySkeleton = () => (
    <div className="px-4 sm:px-6 overflow-x-auto scrollbar-hide flex gap-2 sm:gap-3 py-1.5 sm:py-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-8 w-24 bg-gray-200 animate-pulse rounded-full shrink-0" />
      ))}
    </div>
  );

  const ItemsSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="bg-white border border-red-50 rounded-2xl p-4 flex gap-4 items-center">
          <div className="w-20 h-20 bg-gray-200 animate-pulse rounded-xl shrink-0" />
          <div className="flex-grow">
            <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded mb-2" />
            <div className="h-3 w-1/2 bg-gray-200 animate-pulse rounded mb-2" />
            <div className="h-4 w-1/4 bg-gray-200 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );

  if (menuError) {
    return (
      <div className="flex flex-col h-[100dvh] items-center justify-center bg-[#FFF5F5] p-6 font-['Inter',sans-serif]">
        <div className="bg-white rounded-[32px] p-8 sm:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.06)] max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} className="text-[#FF4D4F]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight mb-3">
            Menu Unavailable
          </h1>
          <p className="text-sm font-semibold text-gray-400 leading-relaxed mb-8">
            This menu link appears to be invalid or the restaurant may be temporarily unavailable.
            Please ask your server for assistance.
          </p>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B71C1C]/30">
            Powered by softshape.ai
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-[100dvh] bg-[#FFF5F5] font-['Inter',sans-serif] overflow-hidden">
        <div className="px-4 sm:px-6 pt-6 pb-4">
          <div className="h-8 w-40 bg-gray-200 animate-pulse rounded-lg mb-2" />
          <div className="h-3 w-56 bg-gray-100 animate-pulse rounded" />
        </div>
        <div className="px-4 sm:px-6 mb-3">
          <div className="h-12 w-full bg-gray-200 animate-pulse rounded-2xl" />
        </div>
        <CategorySkeleton />
        <div className="flex-grow px-4 sm:px-6 pt-4">
          <ItemsSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#FFF5F5] text-gray-900 font-['Inter',sans-serif] overflow-hidden relative">

      {/* Soft Background Decor */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-[#FFECEC] to-transparent pointer-events-none" />

      {/* Header */}
      <header className={`px-4 sm:px-6 transition-all duration-300 ease-in-out shrink-0 relative z-20 ${isScrolledDown ? 'pt-3 pb-2 bg-[#FFF5F5] border-b border-red-100/30' : 'pt-6 sm:pt-10 pb-4'
        }`}>
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isScrolledDown ? 'h-0 opacity-0 mb-0 pointer-events-none' : 'h-16 opacity-100 mb-4'
          }`}>
          <div className="flex justify-between items-start">
            <div className="animate-in fade-in slide-in-from-left-4">
              <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">TABLE {tableNumber || '—'}</h1>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D4F] animate-pulse" />
                Live Interactive Dining Experience
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative group shadow-[0_10px_30px_rgba(255,77,79,0.06)] rounded-xl sm:rounded-2xl transition-all hover:shadow-[0_10px_30px_rgba(255,77,79,0.12)]">
          <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-red-300 group-focus-within:text-[#FF4D4F] transition-colors" size={16} />
          <input
            type="search"
            placeholder="Search delicious dishes..."
            className={`w-full bg-white border border-red-50 pl-10 sm:pl-12 pr-4 text-xs sm:text-sm font-bold outline-none focus:border-[#FF4D4F]/30 focus:ring-4 focus:ring-red-50 transition-all text-gray-800 placeholder-gray-400 transition-all duration-300 ${isScrolledDown ? 'py-2 rounded-xl' : 'py-3.5 sm:py-4 rounded-2xl'
              }`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      {/* Filters & Categories */}
      <div className="shrink-0 relative z-10 sticky top-0 bg-[#FFF5F5]/90 backdrop-blur-xl border-b border-red-50 pb-1.5 sm:pb-2">
        {/* Veg / Non-Veg Toggle */}
        <div className="px-4 sm:px-6 flex gap-1.5 sm:gap-2 py-2">
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

        {/* Category Scroll */}
        <div className={`px-4 sm:px-6 overflow-x-auto scrollbar-hide flex gap-2 sm:gap-3 transition-all duration-300 ease-in-out ${isScrolledDown ? 'py-1' : 'py-1.5 sm:py-2'
          }`}>
          {displayCategories.map(cat => {
            const isSpecials = cat === 'Today Specials';
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`transition-all duration-300 shrink-0 border flex items-center gap-1 sm:gap-1.5 ${isScrolledDown
                    ? 'px-4 py-1.5 text-[9px] rounded-full'
                    : 'px-5 sm:px-6 py-2.5 sm:py-3 text-[10px] rounded-full'
                  } ${activeCategory === cat
                    ? isSpecials
                      ? 'bg-gradient-to-r from-[#FF4D4F] to-[#FF8787] text-white border-transparent shadow-[0_0_20px_rgba(255,77,79,0.4)] scale-105'
                      : 'bg-gradient-to-r from-[#FF4D4F] to-[#FF6B6B] text-white border-transparent shadow-[0_10px_20px_rgba(255,77,79,0.2)] scale-105'
                    : isSpecials
                      ? 'bg-white border-red-200 text-[#FF4D4F] shadow-[0_0_15px_rgba(255,77,79,0.2)] animate-pulse-slow hover:scale-105'
                      : 'bg-white border-red-50 text-gray-500 hover:bg-red-50/50 hover:text-gray-900 shadow-sm'
                  }`}
              >
                {isSpecials && <Flame size={isScrolledDown ? 10 : 12} className={activeCategory === cat ? 'animate-pulse text-white' : 'text-[#FF4D4F]'} />}
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu Items */}
      <div
        onScroll={handleScroll}
        className="flex-grow overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-44 sm:pb-48 space-y-6 sm:space-y-10 scroll-smooth z-0"
      >

        {/* Today's Specials */}
        {(activeCategory === 'All' || activeCategory === 'Today Specials') && !searchQuery && todaySpecials.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shadow-[0_0_15px_rgba(255,77,79,0.3)]">
                <Flame size={16} className="text-[#FF4D4F] animate-pulse" />
              </div>
              <h2 className="text-sm font-black uppercase tracking-[0.15em] text-gray-900">Chef's Recommendations</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pt-4 pb-6 scrollbar-hide snap-x -mx-6 px-6 -mt-4">
              {todaySpecials.map(item => {
                const qty = cart.find(i => i.n === item.n)?.q || 0;
                return (
                  <div
                    key={item.n}
                    onClick={() => setPreviewItem(item)}
                    className="cursor-pointer min-w-[260px] w-[260px] snap-center group relative pt-3 pb-2"
                  >
                    {/* Gradient Border Wrap */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[#FF4D4F] via-[#FF8787] to-[#FFE5E5] rounded-[34px] opacity-70 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500 blur-[2px]" />

                    <div className="relative bg-white rounded-[32px] overflow-hidden flex flex-col h-full shadow-[0_10px_30px_rgba(0,0,0,0.03)] group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_rgba(255,77,79,0.2)] transition-all duration-500">

                      <div className="h-40 w-full overflow-hidden relative">
                        {item.img ? (
                          <img src={item.img} alt={item.n} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100 text-4xl">
                            🍽️
                          </div>
                        )}

                        {/* Animated Badge */}
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-[0_5px_15px_rgba(0,0,0,0.1)] flex items-center gap-1 animate-[bounce_3s_infinite]">
                          <Star size={10} className="fill-[#FF4D4F] text-[#FF4D4F] animate-pulse" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#FF4D4F] to-[#FF8787]">Trending</span>
                        </div>
                      </div>

                      <div className="p-5 flex flex-col flex-grow">
                        <h3 className="user-special-title text-gray-800 tracking-tight leading-snug mb-1 line-clamp-2">{item.n}</h3>

                        {/* Compact Stats */}
                        <div className="flex items-center gap-2 mb-2 text-[9px] font-bold text-gray-400">
                          <span className="flex items-center gap-1"><TrendingUp size={10} className="text-emerald-500" /> {getEngagement(item.id, item.n).purchases} purchases</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Heart size={10} className="text-[#FF4D4F]" /> {getEngagement(item.id, item.n).wishlist} wishlist</span>
                        </div>

                        <div className="mt-auto">
                          {discountPercentage > 0 ? (
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-sm font-bold text-gray-400 line-through decoration-gray-300">₹{item.p}</span>
                              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF4D4F] to-[#FF8787] drop-shadow-[0_2px_10px_rgba(255,77,79,0.2)]">₹{Math.floor(item.p * (1 - discountPercentage / 100))}</span>
                            </div>
                          ) : (
                            <p className="text-2xl font-black text-[#FF4D4F]">₹{item.p}</p>
                          )}
                        </div>

                        {qty > 0 ? (
                          <div className="mt-4 flex items-center justify-between bg-red-50 rounded-2xl px-3 py-2 border border-red-100">
                            <button onClick={(e) => removeFromCart(item, e)} className="w-8 h-8 rounded-full bg-white text-[#FF4D4F] flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm">
                              <Minus size={14} />
                            </button>
                            <span className="text-sm font-black w-6 text-center text-gray-900">{qty}</span>
                            {qty < 6 ? (
                              <button onClick={(e) => addToCart(item, e)} className="w-8 h-8 rounded-full bg-[#FF4D4F] text-white flex items-center justify-center hover:bg-[#FF6B6B] transition-colors shadow-sm">
                                <Plus size={14} />
                              </button>
                            ) : (
                              <div className="w-8 h-8 flex items-center justify-center text-[9px] font-black text-red-300">MAX</div>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={(e) => addToCart(item, e)}
                            className="mt-4 w-full py-3.5 rounded-2xl bg-white border-2 border-red-50 text-[#FF4D4F] text-[11px] font-black uppercase tracking-widest hover:bg-[#FF4D4F] hover:border-transparent hover:text-white transition-all shadow-sm"
                          >
                            Add to Cart
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Regular Menu List */}
        {activeCategory !== 'Today Specials' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredMenu.map(item => {
              const qty = cart.find(i => i.n === item.n)?.q || 0;
              return (
                <div
                  key={item.n}
                  onClick={() => setPreviewItem(item)}
                  className="relative hover:z-10 cursor-pointer bg-white border border-red-50 rounded-2xl xs:rounded-[28px] p-3 xs:p-4 flex gap-3 xs:gap-5 items-center group hover:shadow-[0_15px_30px_rgba(255,77,79,0.08)] transition-all duration-300 shadow-[0_5px_15px_rgba(0,0,0,0.02)] hover:border-red-100"
                >
                  <div className="w-20 h-20 xs:w-24 xs:h-24 sm:w-28 sm:h-28 rounded-xl xs:rounded-[20px] sm:rounded-[24px] overflow-hidden shrink-0 relative shadow-inner">
                    {item.img ? (
                      <img src={item.img} alt={item.n} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-2xl">
                        🍽️
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm p-1 rounded-md shadow-sm">
                      <div className={`w-2 h-2 xs:w-2.5 xs:h-2.5 rounded-full ${item.t === 'veg' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    </div>
                  </div>
                  <div className="flex-grow min-w-0 py-1">
                    <p className="text-[9px] font-bold text-red-500/80 uppercase tracking-wider mb-1 truncate">{item.c}</p>
                    <h3 className="user-item-title text-gray-800 tracking-tight leading-snug mb-1 pr-2 line-clamp-2">{item.n}</h3>

                    {/* Compact Stats */}
                    <div className="flex items-center gap-1.5 mb-1.5 xs:mb-2 text-[8px] xs:text-[9px] font-bold text-gray-400">
                      <span className="flex items-center gap-0.5"><TrendingUp size={9} className="text-emerald-500" /> {getEngagement(item.id, item.n).purchases}</span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5"><Heart size={9} className="text-[#FF4D4F]" /> {getEngagement(item.id, item.n).wishlist}</span>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div>
                        {discountPercentage > 0 ? (
                          <div className="flex items-center gap-1 xs:gap-1.5">
                            <span className="text-[10px] xs:text-xs font-bold text-gray-400 line-through decoration-gray-300">₹{item.p}</span>
                            <span className="text-base xs:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF4D4F] to-[#FF8787] drop-shadow-[0_2px_10px_rgba(255,77,79,0.2)]">₹{Math.floor(item.p * (1 - discountPercentage / 100))}</span>
                          </div>
                        ) : (
                          <span className="text-sm xs:text-lg font-black text-[#FF4D4F]">₹{item.p}</span>
                        )}
                      </div>

                      {/* Quantity Controls */}
                      {qty > 0 ? (
                        <div className="flex items-center gap-1 xs:gap-2 bg-red-50 rounded-full px-1.5 xs:px-2 py-1 xs:py-1.5 border border-red-100">
                          <button onClick={(e) => removeFromCart(item, e)} className="w-6 h-6 xs:w-7 xs:h-7 rounded-full bg-white text-[#FF4D4F] flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm">
                            <Minus size={12} />
                          </button>
                          <span className="text-xs font-black w-4 text-center text-gray-900">{qty}</span>
                          {qty < 6 ? (
                            <button onClick={(e) => addToCart(item, e)} className="w-6 h-6 xs:w-7 xs:h-7 rounded-full bg-[#FF4D4F] text-white flex items-center justify-center hover:bg-[#FF6B6B] transition-colors shadow-sm">
                              <Plus size={12} />
                            </button>
                          ) : (
                            <div className="w-6 h-6 xs:w-7 xs:h-7 flex items-center justify-center text-[8px] font-black text-red-300">MAX</div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => addToCart(item, e)}
                          className="px-3.5 xs:px-5 py-2 xs:py-2.5 rounded-full bg-white border border-red-100 text-[9px] xs:text-[10px] font-black uppercase tracking-widest text-[#FF4D4F] hover:bg-[#FF4D4F] hover:text-white transition-all shadow-sm group-hover:border-[#FF4D4F]"
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
        )}
      </div>

      {/* Floating Call Waiter Button — hidden in menu-only mode */}
      {!isMenuOnly && (
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
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-[0_10px_25px_rgba(255,77,79,0.25)] transition-all duration-300 pointer-events-auto cursor-pointer focus:outline-none hover:scale-105 active:scale-95 ${callCooldown > 0
                ? 'bg-white border border-gray-200 text-gray-400 cursor-not-allowed shadow-sm'
                : 'bg-gradient-to-r from-[#FF6B6B] to-[#FF4D4F] text-white animate-[pulse-glow_2s_infinite]'
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
      )}

      {/* Sticky Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full z-40 px-4 pb-4 pt-8 bg-gradient-to-t from-[#FFF5F5]/60 to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto bg-white border border-red-50 p-3 sm:p-3.5 rounded-2xl sm:rounded-3xl shadow-[0_15px_40px_rgba(255,77,79,0.12)] flex items-center justify-between animate-in slide-in-from-bottom-10">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-50 flex items-center justify-center relative shadow-inner border border-red-100 shrink-0">
                <ShoppingBag size={18} className="text-[#FF4D4F]" />
                <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#FF4D4F] text-white text-[8px] sm:text-[10px] font-black flex items-center justify-center shadow-md">
                  {cart.reduce((s, i) => s + i.q, 0)}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Your Order</p>
                <div className="flex items-baseline gap-1 sm:gap-2">
                  <span className="text-base sm:text-xl font-black leading-none text-gray-900">₹{total}</span>
                </div>
              </div>
            </div>

            {/* View Order Modal Trigger */}
            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="px-5 sm:px-8 py-2.5 sm:py-3.5 rounded-full bg-[#1A1A1A] text-white text-[9px] sm:text-[11px] font-black uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
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
              {previewItem.img ? (
                <img src={previewItem.img} alt={previewItem.n} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-6xl">
                  🍽️
                </div>
              )}
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

              <div className="bg-red-50 rounded-2xl p-4 mb-6">
                <p className="text-xs font-semibold text-gray-600 leading-relaxed">
                  A delicious premium offering made with the finest ingredients, crafted perfectly for your tastebuds.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-black text-[#FF4D4F] uppercase tracking-widest">
                  <Flame size={12} /> Serves 1-2
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  {discountPercentage > 0 ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-bold text-gray-400 line-through decoration-gray-300">₹{previewItem.p}</span>
                      <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF4D4F] to-[#FF8787] drop-shadow-[0_4px_20px_rgba(255,77,79,0.3)]">₹{Math.floor(previewItem.p * (1 - discountPercentage / 100))}</span>
                    </div>
                  ) : (
                    <span className="text-3xl font-black text-[#FF4D4F]">₹{previewItem.p}</span>
                  )}
                </div>

                {cart.find(i => i.n === previewItem.n) ? (
                  <div className="flex items-center gap-4 bg-red-50 rounded-full px-3 py-2 border border-red-100">
                    <button onClick={() => removeFromCart(previewItem)} className="w-10 h-10 rounded-full bg-white text-[#FF4D4F] flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm">
                      <Minus size={18} />
                    </button>
                    <span className="text-base font-black w-6 text-center text-gray-900">{cart.find(i => i.n === previewItem.n).q}</span>
                    {cart.find(i => i.n === previewItem.n).q < 6 ? (
                      <button onClick={() => addToCart(previewItem)} className="w-10 h-10 rounded-full bg-[#FF4D4F] text-white flex items-center justify-center hover:bg-[#FF6B6B] transition-colors shadow-sm">
                        <Plus size={18} />
                      </button>
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center text-[10px] font-black text-red-300">MAX</div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => addToCart(previewItem)}
                    className="px-8 py-4 rounded-full bg-gradient-to-r from-[#FF4D4F] to-[#FF6B6B] text-white text-[12px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_rgba(255,77,79,0.2)]"
                  >
                    Add to Cart
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Order Modal */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsOrderModalOpen(false)}>
          <div className="bg-white rounded-t-[40px] w-full max-h-[85vh] flex flex-col overflow-hidden shadow-[0_-40px_80px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom-full duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-black text-gray-900">Your Order</h2>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Review your selections</p>
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
                  {item.img ? (
                    <img src={item.img} alt={item.n} loading="lazy" decoding="async" className="w-16 h-16 rounded-2xl object-cover shadow-sm" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gray-100 text-2xl shadow-sm">
                      🍽️
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <h3 className="font-black text-sm text-gray-900 truncate">{item.n}</h3>
                    <div className="mt-1">
                      {discountPercentage > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-gray-400 line-through decoration-gray-300">₹{item.p * item.q}</span>
                          <span className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF4D4F] to-[#FF8787]">₹{Math.floor(item.p * (1 - discountPercentage / 100)) * item.q}</span>
                        </div>
                      ) : (
                        <p className="text-sm font-black text-[#FF4D4F]">₹{item.p * item.q}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-gray-50 rounded-full px-2 py-1 border border-gray-200">
                    <button onClick={() => removeFromCart(item)} className="w-8 h-8 rounded-full bg-white text-gray-600 flex items-center justify-center hover:bg-gray-100 transition-colors shadow-sm">
                      <Minus size={14} />
                    </button>
                    <span className="text-xs font-black w-4 text-center text-gray-900">{item.q}</span>
                    {item.q < 6 ? (
                      <button onClick={() => addToCart(item)} className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-800 transition-colors shadow-sm">
                        <Plus size={14} />
                      </button>
                    ) : (
                      <div className="w-8 h-8 flex items-center justify-center text-[9px] font-black text-gray-400">MAX</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 shrink-0">

              <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center justify-between text-gray-500">
                  <span className="text-[10px] font-black uppercase tracking-widest">Subtotal</span>
                  <span className="text-sm font-black">₹{subtotal}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-[#FF4D4F]">
                    <span className="text-[10px] font-black uppercase tracking-widest">Discount</span>
                    <span className="text-sm font-black">-₹{discountAmount}</span>
                  </div>
                )}

                <div className="h-px w-full bg-gray-200 my-1" />

                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-gray-900 uppercase tracking-widest">Total Amount</span>
                  <span className="text-3xl font-black text-gray-900">₹{total}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsOrderModalOpen(false);
                  // Order placement logic can be added here
                }}
                className="w-full py-4.5 rounded-full bg-gradient-to-r from-[#FF4D4F] to-[#FF6B6B] text-white text-sm font-black uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shadow-[0_15px_30px_rgba(255,77,79,0.3)] mt-2"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
