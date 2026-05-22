import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, ShoppingCart, LogOut, ChevronRight, Clock, Plus, Minus, 
  Send, CheckCircle2, Search, ArrowLeft, Users, ChefHat, Timer, 
  UtensilsCrossed, MessageSquare, Check, X, AlertCircle, Loader2, Zap,
  FileText, History, Bell, RefreshCw, Star, Info, Flame, ChevronLeft, Edit2, Image as ImageIcon
} from 'lucide-react';
import { useMenuSync } from '../hooks/useMenuSync';
import { calculateSessionBill, calculateOrderTotal } from '../shared/utils/billing';
import { filterMenuItems } from '../shared/utils/menuSearch';

const TABLE_STATUS = {
  FREE: 'Free',
  OCCUPIED: 'Occupied',
  PREPARING: 'Preparing',
  READY: 'Ready',
  BILLING: 'Waiting Bill'
};

const CAPTAINS = [
  { id: 'C1', name: 'Ajay Kumar', pin: '1997', initials: 'AK', color: 'bg-[#EFF6FF] text-[#1D4ED8]' },
  { id: 'C2', name: 'Ravi Behar', pin: '2002', initials: 'RB', color: 'bg-[#EEF2FF] text-[#4338CA]' },
  { id: 'C3', name: 'Sagar', pin: '2000', initials: 'S', color: 'bg-[#ECFDF5] text-[#047857]' },
  { id: 'C4', name: 'Durga Prasad', pin: '1998', initials: 'DP', color: 'bg-[#FFF1F2] text-[#BE123C]' },
  { id: 'C5', name: 'Subbaiah', pin: '1977', initials: 'SU', color: 'bg-[#FEF3C7] text-[#D97706]' },
  { id: 'C6', name: 'Happy', pin: '1996', initials: 'H', color: 'bg-[#F3E8FF] text-[#7E22CE]' },
];

export default function CaptainApp({ onLogout }) {
  const [currentCaptain, setCurrentCaptain] = useState(() => {
    const saved = localStorage.getItem('active_captain');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoginView, setIsLoginView] = useState(() => {
    const auth = localStorage.getItem('captain_auth_v2') === 'true';
    const hasCaptain = !!localStorage.getItem('active_captain');
    return !(auth && hasCaptain);
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pin, setPin] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [view, setView] = useState('tables'); // tables, session
  const [activeTableId, setActiveTableId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeDiet, setActiveDiet] = useState('All');
  const [notifications, setNotifications] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [isCartMinimized, setIsCartMinimized] = useState(true);
  const [removedItem, setRemovedItem] = useState(null);
  const removeTimeoutRef = useRef(null);
  
  const [todaySpecials, setTodaySpecials] = useState(() => {
    const saved = localStorage.getItem('softshape_specials');
    return saved ? JSON.parse(saved) : [];
  });
  
  const { menuItems, setMenuItems, categories, loading: menuLoading } = useMenuSync();

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'softshape_tables' && e.newValue) {
        setTables(JSON.parse(e.newValue));
        setIsSyncing(true);
        setTimeout(() => setIsSyncing(false), 800);
      }
      if (e.key === 'softshape_specials' && e.newValue) {
        setTodaySpecials(JSON.parse(e.newValue));
        setIsSyncing(true);
        setTimeout(() => setIsSyncing(false), 800);
      }
    };
    const onMenuUpdated = () => {
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 800);
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('softshape_menu_updated', onMenuUpdated);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('softshape_menu_updated', onMenuUpdated);
    };
  }, []);

  // SHARED STATE PERSISTENCE
  const [tables, setTables] = useState(() => {
    const saved = localStorage.getItem('softshape_tables');
    if (saved) return JSON.parse(saved);
    return Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      status: i % 5 === 0 ? TABLE_STATUS.OCCUPIED : TABLE_STATUS.FREE,
      guests: i % 5 === 0 ? 4 : 0,
      time: i % 5 === 0 ? '24m' : null,
      captainId: i % 5 === 0 ? 'C1' : null,
      kotHistory: i % 5 === 0 ? [
        { 
          id: '1001', 
          time: '12:15 PM', 
          items: [
            { n: 'Chicken Biryani', q: 2, p: 450, s: 'Served' },
            { n: 'Coke', q: 2, p: 60, s: 'Served' }
          ] 
        }
      ] : [],
      currentBill: i % 5 === 0 ? 1020 : 0
    }));
  });

  useEffect(() => {
    localStorage.setItem('softshape_tables', JSON.stringify(tables));
    setIsSyncing(true);
    const timer = setTimeout(() => setIsSyncing(false), 800);
    return () => clearTimeout(timer);
  }, [tables]);

  const [currentSessionItems, setCurrentSessionItems] = useState([]); 

  const activeTable = useMemo(() => tables.find(t => t.id === activeTableId), [tables, activeTableId]);

  const filteredMenu = useMemo(
    () =>
      filterMenuItems(menuItems, {
        query: searchQuery,
        category: activeCategory,
        diet: activeDiet,
      }),
    [searchQuery, activeCategory, activeDiet, menuItems]
  );

  const suggestedSpecials = useMemo(() => {
    if (currentSessionItems.length === 0) return [];
    
    let hasSoup = false, hasBiryani = false, hasStarter = false;
    currentSessionItems.forEach(item => {
      const name = item.n.toLowerCase();
      if (name.includes('soup')) hasSoup = true;
      if (name.includes('biryani')) hasBiryani = true;
      if (item.c === 'Starters') hasStarter = true;
    });

    let suggestions = [];
    if (hasSoup && !hasBiryani) {
      suggestions = menuItems.filter(m => m.n.toLowerCase().includes('biryani') || m.n === 'Chicken 65');
    } else if (hasBiryani) {
      suggestions = menuItems.filter(m => m.c === 'Drinks' || m.c === 'Desserts' || m.n === 'Chicken Lollipop');
    } else if (hasStarter) {
      suggestions = menuItems.filter(m => m.c === 'Main Course' || m.c === 'Drinks');
    } else {
      suggestions = menuItems.filter(m => m.c === 'Desserts' || m.c === 'Drinks');
    }
    
    // Filter out items already in the cart
    suggestions = suggestions.filter(s => !currentSessionItems.find(i => i.n === s.n));
    return suggestions.slice(0, 4);
  }, [currentSessionItems, menuItems]);

  const displaySpecials = useMemo(() => {
    const activeAdminSpecials = todaySpecials.filter(s => s.available);
    if (activeAdminSpecials.length > 0) {
      return activeAdminSpecials.filter(s => !currentSessionItems.find(i => i.n === s.n)).slice(0, 4);
    }
    return suggestedSpecials;
  }, [todaySpecials, suggestedSpecials, currentSessionItems]);

  const addNotification = (title, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, title, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const handleImageUpload = (e, item) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 450;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const base64String = canvas.toDataURL('image/jpeg', 0.7); // Compress to prevent localStorage crash
        
        setMenuItems(prev => prev.map(m => m.n === item.n ? { ...m, img: base64String } : m));
        setEditingItem(null);
        addNotification(`${item.n} image updated globally`, 'success');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSelect = (profile) => {
    setSelectedProfile(profile);
    setPin('');
  };

  const handlePinInput = (num) => {
    setPinError(false);
    if (pin.length < 4 && !isAuthenticating) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        setIsAuthenticating(true);
        setTimeout(() => {
          if (newPin === selectedProfile.pin) {
            setCurrentCaptain(selectedProfile);
            setIsLoginView(false);
            localStorage.setItem('captain_auth_v2', 'true');
            localStorage.setItem('active_captain', JSON.stringify(selectedProfile));
          } else {
            setPin('');
            setPinError(true);
          }
          setIsAuthenticating(false);
        }, 600);
      }
    }
  };

  const openTableSession = (table) => {
    if (table.status !== TABLE_STATUS.FREE && table.captainId && currentCaptain && table.captainId !== currentCaptain.id) {
      addNotification(`Table already in progress by ${CAPTAINS.find(c => c.id === table.captainId)?.name || 'another captain'}`, 'error');
      return;
    }
    setActiveTableId(table.id);
    setCurrentSessionItems([]);
    setView('session');
  };

  const addItemToSession = (item) => {
    if (currentSessionItems.length === 0) {
      setTables(currentTables => currentTables.map(t => {
        if (t.id === activeTableId && t.status === TABLE_STATUS.FREE) {
          return { ...t, status: TABLE_STATUS.OCCUPIED, captainId: currentCaptain?.id };
        }
        return t;
      }));
    }

    setCurrentSessionItems(prev => {
      const existing = prev.find(i => i.n === item.n);
      if (existing) {
        return prev.map(i => i.n === item.n ? { ...i, q: i.q + 1 } : i);
      }
      return [...prev, { ...item, q: 1, s: 'Pending' }];
    });
    addNotification(`${item.n} added`, 'success');
  };

  const cancelSession = () => {
    setCurrentSessionItems([]);
    if (activeTable && (!activeTable.kotHistory || activeTable.kotHistory.length === 0)) {
      setTables(currentTables => currentTables.map(t => {
        if (t.id === activeTable.id) {
          return { ...t, status: TABLE_STATUS.FREE, captainId: null };
        }
        return t;
      }));
    }
    setView('tables');
  };

  const updateDraftQty = (name, delta) => {
    setCurrentSessionItems(prev => {
      const itemToUpdate = prev.find(i => i.n === name);
      if (itemToUpdate && itemToUpdate.q + delta <= 0) {
        setRemovedItem(itemToUpdate);
        if (removeTimeoutRef.current) clearTimeout(removeTimeoutRef.current);
        removeTimeoutRef.current = setTimeout(() => {
          setRemovedItem(null);
        }, 5000);
      }
      return prev.map(i => {
        if (i.n === name) return { ...i, q: i.q + delta };
        return i;
      }).filter(i => i.q > 0);
    });
  };

  const undoRemove = () => {
    if (removedItem) {
      setCurrentSessionItems(prev => {
        if (prev.find(i => i.n === removedItem.n)) return prev;
        return [...prev, removedItem];
      });
      setRemovedItem(null);
      if (removeTimeoutRef.current) clearTimeout(removeTimeoutRef.current);
    }
  };

  const sendIncrementalKOT = () => {
    try {
      if (currentSessionItems.length === 0) return;
      if (!currentCaptain) {
        setIsLoginView(true);
        return;
      }
      
      const newKOT = {
        id: Math.floor(1000 + Math.random() * 9000).toString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        items: currentSessionItems.map(i => ({ ...i, s: 'KOT Sent' }))
      };

      const newTotalBill = calculateSessionBill(activeTable, currentSessionItems).total;

      setTables(prev => prev.map(t => {
        if (t.id === activeTableId) {
          return {
            ...t,
            status: TABLE_STATUS.PREPARING,
            time: t.time || '1m',
            captainId: currentCaptain.id,
            kotHistory: [...(t.kotHistory || []), newKOT],
            currentBill: newTotalBill
          };
        }
        return t;
      }));

      setCurrentSessionItems([]);
      addNotification(`KOT #${newKOT.id} Sent`, 'success');
    } catch (err) {
      addNotification("Submission Failed", "error");
    }
  };

  const requestFinalBill = () => {
    setTables(prev => prev.map(t => {
      if (t.id === activeTableId) return { ...t, status: TABLE_STATUS.BILLING };
      return t;
    }));
    addNotification("Billing Requested", 'success');
    setView('tables');
    setActiveTableId(null);
  };

  if (isLoginView) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F4F5] p-6 font-['Inter',sans-serif]">
        <div className="w-full max-w-lg bg-white rounded-[40px] p-10 shadow-[0_40px_80px_rgba(0,0,0,0.06)] border border-gray-100">
          <div className="text-center mb-10">
            <div className="flex flex-col items-center justify-center mb-6 gap-2">
              <img 
                src="/logo softshape.ai.png" 
                alt="Softshape.ai" 
                className="h-16 w-auto object-contain" 
              />
            </div>
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Operational Terminal</h2>
            <p className="text-lg font-black text-gray-900">Sign in to Session</p>
          </div>

          {!selectedProfile ? (
            <div className="grid grid-cols-2 gap-4">
              {CAPTAINS.map(p => (
                <button 
                  key={p.id}
                  onClick={() => handleProfileSelect(p)}
                  className="flex flex-col items-center gap-4 p-6 rounded-[24px] border border-gray-100 bg-white hover:border-gray-300 hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
                >
                  <div className={`w-14 h-14 rounded-2xl ${p.color} flex items-center justify-center text-xl font-black tracking-tight shadow-sm group-hover:scale-110 transition-transform`}>
                    {p.initials}
                  </div>
                  <span className="text-[13px] font-bold text-gray-800 tracking-tight">{p.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setSelectedProfile(null)} className="p-2 text-gray-400 hover:text-gray-900 transition-colors"><ArrowLeft size={20} /></button>
                <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-[20px] border border-gray-100 shadow-sm">
                  <div className={`w-8 h-8 rounded-xl ${selectedProfile.color} flex items-center justify-center text-xs font-black tracking-tight`}>
                    {selectedProfile.initials}
                  </div>
                  <span className="text-sm font-bold text-gray-900 tracking-tight">{selectedProfile.name}</span>
                </div>
              </div>
              <div className="space-y-6">
                <div className="flex justify-center gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${pin.length > i ? 'bg-[#E53935] scale-125 shadow-lg shadow-red-200' : 'bg-gray-200'}`} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '←'].map(n => (
                    <button 
                      key={n}
                      disabled={isAuthenticating}
                      onClick={() => {
                        if (n === 'C') setPin('');
                        else if (n === '←') setPin(prev => prev.slice(0, -1));
                        else handlePinInput(n.toString());
                      }}
                      className="w-full aspect-square rounded-2xl border border-gray-100 text-xl font-black text-gray-900 hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {isAuthenticating && (
                  <div className="flex items-center justify-center gap-2 text-[#E53935]">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Validating PIN...</span>
                  </div>
                )}
                {pinError && !isAuthenticating && (
                  <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                    <p className="text-sm font-bold text-[#E53935]">plz enter right password</p>
                    <p className="text-sm font-bold text-[#E53935] mt-1">దయచేసి సరైన పాస్వర్డ్ను నమోదు చేయండి.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-white overflow-hidden font-['Inter',sans-serif] text-[#1A1A1A]">
      {/* GLOBAL HEADER */}
      <header className="h-14 bg-white border-b border-gray-100 px-6 flex items-center justify-between shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img 
              src="/logo softshape.ai.png" 
              alt="Softshape.ai" 
              className="h-12 sm:h-16 w-auto object-contain shrink-0" 
            />
            <div className="hidden sm:flex flex-col border-l-2 border-gray-100 pl-3 justify-center">
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Terminal</span>
              <span className="text-[11px] font-black text-gray-900 tracking-tight leading-none">{currentCaptain?.name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <div className={`flex items-center gap-2 transition-opacity duration-500 ${isSyncing ? 'opacity-100' : 'opacity-20'}`}>
             <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
             <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Live Sync</span>
          </div>
          <button onClick={() => {
            localStorage.removeItem('captain_auth_v2');
            localStorage.removeItem('active_captain');
            setIsLoginView(true);
          }} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><LogOut size={18} /></button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-grow flex flex-col overflow-hidden relative">
        {view === 'tables' ? (
          <div className="flex-grow overflow-y-auto p-6 scroll-smooth bg-gray-50/50">
            <div className="max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8">
                 <div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">Floor Overview</h2>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      Active Operations • Floor Rank #1
                    </p>
                 </div>
                 <div className="flex gap-2">
                    <div className="px-4 py-2 bg-white rounded-xl border border-gray-200 flex items-center gap-2">
                       <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                       <span className="text-[10px] font-black uppercase text-gray-600">14 Free</span>
                    </div>
                    <div className="px-4 py-2 bg-white rounded-xl border border-gray-200 flex items-center gap-2">
                       <div className="w-1.5 h-1.5 bg-[#E53935] rounded-full" />
                       <span className="text-[10px] font-black uppercase text-gray-600">10 Busy</span>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {tables.map(table => (
                  <button 
                    key={table.id}
                    onClick={() => openTableSession(table)}
                    className={`aspect-square p-4 rounded-3xl border-2 transition-all flex flex-col items-center justify-between group relative overflow-hidden active:scale-95 ${
                      table.status === TABLE_STATUS.FREE ? 'bg-white border-gray-100 hover:border-gray-300' :
                      table.status === TABLE_STATUS.BILLING ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-lg shadow-amber-100' :
                      table.status === TABLE_STATUS.READY ? 'bg-green-50 border-green-200 text-green-700' :
                      'bg-red-50 border-red-100 text-red-600'
                    }`}
                  >
                    <div className="w-full flex justify-between items-start">
                       <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-600 transition-colors">T{table.id}</span>
                       {table.time && (
                         <div className="flex items-center gap-1 text-[9px] font-black opacity-40">
                           <Clock size={10} /> {table.time}
                         </div>
                       )}
                    </div>
                    
                    <span className="text-3xl font-black leading-none">{table.id}</span>
                    
                    <div className="w-full flex flex-col items-center gap-1.5">
                       <div className={`w-full py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 ${
                          table.status === TABLE_STATUS.FREE ? 'bg-gray-100 text-gray-400' :
                          table.status === TABLE_STATUS.BILLING ? 'bg-amber-500 text-white animate-pulse' :
                          table.status === TABLE_STATUS.READY ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                       }`}>
                         {table.status}
                       </div>
                       {table.status !== TABLE_STATUS.FREE && (
                         <span className="text-[10px] font-black opacity-60">₹{table.currentBill}</span>
                       )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col overflow-hidden bg-white">
            {/* STICKY SESSION HEADER */}
            <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 shrink-0 z-40 shadow-sm">
               <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
                  <button onClick={() => setView('tables')} className="p-2.5 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-xl border border-gray-100 transition-all"><ChevronLeft size={20} /></button>
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                       <h2 className="text-lg font-black tracking-tight uppercase leading-none">Table {activeTable?.id}</h2>
                       <div className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest border border-blue-100 shrink-0">Live Session #10{activeTable?.id}</div>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                       <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Users size={10} /> {activeTable?.guests || 0} Pax</span>
                       <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Timer size={10} /> {activeTable?.time || '1m'}</span>
                       <span className="text-[9px] font-black text-[#E53935] uppercase tracking-widest flex items-center gap-1"><History size={10} /> {(activeTable?.kotHistory || []).length} KOTs</span>
                    </div>
                  </div>
               </div>
               <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={requestFinalBill} className="flex-grow sm:flex-grow-0 px-6 py-2.5 bg-amber-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-100 hover:scale-105 active:scale-95 transition-all text-center">Request Billing</button>
                  <button className="p-2.5 bg-red-50 text-[#E53935] rounded-xl border border-red-100 shrink-0"><Bell size={18} /></button>
               </div>
            </div>

            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">
               {/* MENU INTERFACE */}
               <div className={`flex-grow flex flex-col overflow-hidden bg-gray-50/30 ${isCartMinimized ? 'h-full lg:h-auto' : 'h-1/2 lg:h-auto'} border-b lg:border-b-0 lg:border-r border-gray-100 transition-all duration-300`}>
                  {/* STICKY MENU BAR */}
                  <div className="px-6 py-4 bg-white border-b border-gray-100 flex flex-col gap-4 shrink-0 z-30">
                     <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E53935] transition-colors" size={16} />
                        <input
                           type="search"
                           placeholder="Search by name, category, price, or ID..."
                           className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-[13px] font-bold outline-none focus:bg-white focus:border-[#E53935] focus:ring-4 focus:ring-red-50 transition-all"
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           autoComplete="off"
                        />
                     </div>
                     <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 xl:gap-0">
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                           {categories.map(cat => (
                              <button 
                                 key={cat}
                                 onClick={() => setActiveCategory(cat)}
                                 className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shrink-0 ${
                                    activeCategory === cat ? 'bg-[#E53935] border-[#E53935] text-white shadow-md shadow-red-100' : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'
                                 }`}
                              >
                                 {cat}
                              </button>
                           ))}
                        </div>
                        
                        {/* Dietary Filter */}
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 shrink-0">
                           {['All', 'veg', 'non'].map(diet => (
                              <button 
                                 key={diet}
                                 onClick={() => setActiveDiet(diet)}
                                 className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    activeDiet === diet 
                                       ? 'bg-white text-gray-900 shadow-sm' 
                                       : 'text-gray-400 hover:text-gray-600'
                                 }`}
                              >
                                 {diet === 'All' ? 'All' : diet === 'veg' ? 'Veg' : 'Non-Veg'}
                              </button>
                           ))}
                        </div>
                     </div>
                  </div>

                  {/* SCROLLABLE MENU GRID */}
                  <div className="flex-grow overflow-y-auto p-6 scroll-smooth">
                     {menuLoading ? (
                        <p className="text-center text-xs text-gray-400 py-12 font-black uppercase tracking-widest">Syncing menu…</p>
                     ) : filteredMenu.length === 0 ? (
                        <p className="text-center text-sm text-gray-500 py-12 font-bold">
                           {searchQuery.trim()
                             ? `No dishes found for "${searchQuery.trim()}"`
                             : "No items in this category."}
                        </p>
                     ) : (
                     <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
                        {filteredMenu.map((item, idx) => (
                           <div 
                              key={idx}
                              className="bg-white rounded-3xl border border-gray-100 overflow-hidden hover:border-[#E53935] hover:shadow-2xl transition-all cursor-pointer flex flex-col group active:scale-98 relative"
                              onClick={() => setPreviewItem(item)}
                           >


                              <div className="h-40 w-full overflow-hidden relative">
                                 <img src={item.img} alt={item.n} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                 <div className={`absolute top-3 right-3 p-1 rounded-md backdrop-blur-md shadow-sm bg-white/80 border border-white/50`}>
                                    <div className={`w-3.5 h-3.5 rounded-[3px] border-2 flex items-center justify-center ${item.t === 'veg' ? 'border-green-600' : 'border-red-600'}`}>
                                       <div className={`w-1.5 h-1.5 rounded-full ${item.t === 'veg' ? 'bg-green-600' : 'bg-red-600'}`} />
                                    </div>
                                 </div>
                                 <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4 z-10">
                                    <span className="text-[10px] font-black text-white uppercase flex items-center gap-1.5"><Info size={12} /> Show Customer</span>
                                 </div>
                              </div>
                              <div className="p-4 flex flex-col flex-grow">
                                 <h4 className="text-[12px] font-black text-gray-900 leading-tight mb-3 flex-grow">{item.n}</h4>
                                 <div className="flex items-center justify-between mt-auto">
                                    <span className="text-sm font-black text-gray-900 tracking-tight">₹{item.p}</span>
                                    <button 
                                       onClick={(e) => { e.stopPropagation(); addItemToSession(item); }}
                                       className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-[#E53935] hover:bg-[#E53935] hover:text-white transition-all shadow-sm"
                                    >
                                       <Plus size={18} strokeWidth={3} />
                                    </button>
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                     )}
                  </div>
               </div>

               {/* SESSION ORDER PANEL */}
               <div className={`w-full lg:w-[420px] ${isCartMinimized ? 'h-16 lg:h-auto overflow-hidden' : 'fixed inset-0 z-[100] lg:relative lg:inset-auto lg:h-auto lg:z-40'} bg-white flex flex-col shrink-0 shadow-[0_0_100px_rgba(0,0,0,0.04)] transition-all duration-300 ${!isCartMinimized ? 'animate-in fade-in slide-in-from-bottom-12 lg:animate-none' : ''}`}>
                  <div 
                    className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0 cursor-pointer lg:cursor-default"
                    onClick={() => {
                      if (isCartMinimized || window.innerWidth >= 1024) {
                        setIsCartMinimized(!isCartMinimized);
                      }
                    }}
                  >
                     <div className="flex items-center gap-3">
                        {!isCartMinimized && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setIsCartMinimized(true); }}
                            className="lg:hidden p-2 -ml-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center"
                          >
                            <ArrowLeft size={20} />
                          </button>
                        )}
                        <History size={18} className={`text-[#E53935] ${!isCartMinimized ? 'hidden lg:block' : ''}`} />
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">T{activeTable?.id} Activity</h3>
                     </div>
                     <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-gray-900">₹{calculateSessionBill(activeTable, currentSessionItems).total}</span>
                        {isCartMinimized && (
                          <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex lg:hidden items-center justify-center text-gray-400">
                             <ChevronLeft size={16} className="rotate-90" />
                          </div>
                        )}
                        <div className="hidden lg:flex w-8 h-8 rounded-full bg-white border border-gray-200 items-center justify-center text-gray-400">
                           <ChevronLeft size={16} className={`transition-transform duration-300 ${isCartMinimized ? 'rotate-90' : '-rotate-90'}`} />
                        </div>
                     </div>
                  </div>

                  <div className="flex-grow overflow-y-auto p-6 space-y-8 custom-scrollbar min-h-0">
                     {/* KOT LOGS */}
                     {(activeTable?.kotHistory || []).map((kot) => (
                        <div key={kot.id} className="space-y-4">
                           <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">KOT #{kot.id}</span>
                              <span className="text-[9px] font-black text-gray-400 uppercase">{kot.time}</span>
                           </div>
                           <div className="space-y-3">
                              {kot.items.map((item, iIdx) => (
                                 <div key={iIdx} className="flex justify-between items-center group">
                                    <div className="flex items-center gap-3">
                                       <div className="w-6 h-6 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-600">{item.q}x</div>
                                       <p className="text-[11px] font-bold text-gray-700">{item.n}</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-[8px] font-black uppercase tracking-widest border border-green-100">{item.s}</span>
                                 </div>
                              ))}
                           </div>
                        </div>
                     ))}

                     {/* ACTIVE DRAFT */}
                     <div className="space-y-5 pt-6 border-t-2 border-dashed border-gray-100">
                        <div className="flex items-center justify-between">
                           <h4 className="text-[11px] font-black uppercase tracking-widest text-[#E53935] flex items-center gap-2"><ShoppingCart size={16} /> New KOT Draft</h4>
                           {(currentSessionItems.length > 0 || (activeTable?.captainId === currentCaptain?.id && (!activeTable?.kotHistory || activeTable.kotHistory.length === 0))) && (
                             <button onClick={cancelSession} className="text-[9px] font-black text-[#E53935] uppercase hover:text-red-700 transition-colors bg-red-50 px-2 py-1 rounded-md border border-red-100">Cancel Session</button>
                           )}
                        </div>

                        {currentSessionItems.length === 0 ? (
                           <div className="py-12 text-center border-2 border-dashed border-gray-50 rounded-[32px] flex flex-col items-center bg-gray-50/30">
                              <UtensilsCrossed size={32} className="text-gray-200 mb-3" />
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-relaxed">Menu is open.<br/>Add items to start KOT.</p>
                           </div>
                        ) : (
                           <div className="space-y-3">
                              {currentSessionItems.map((item, idx) => (
                                 <div key={idx} className="bg-red-50/50 p-4 rounded-3xl border border-red-100/30 animate-in slide-in-from-right-4">
                                    <div className="flex justify-between items-start mb-3">
                                       <p className="text-[11px] font-black text-gray-900 uppercase pr-8 leading-tight">{item.n}</p>
                                       <button onClick={() => updateDraftQty(item.n, -item.q)} className="text-gray-300 hover:text-red-500 transition-colors"><X size={16} /></button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                       <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border border-red-50">
                                          <button onClick={() => updateDraftQty(item.n, -1)} className="w-8 h-8 flex items-center justify-center text-[#E53935] hover:bg-red-50 rounded-lg transition-colors"><Minus size={14} strokeWidth={3} /></button>
                                          <span className="w-8 text-center text-xs font-black">{item.q}</span>
                                          <button onClick={() => updateDraftQty(item.n, 1)} className="w-8 h-8 flex items-center justify-center text-[#E53935] hover:bg-red-50 rounded-lg transition-colors"><Plus size={14} strokeWidth={3} /></button>
                                       </div>
                                       <span className="text-sm font-black text-gray-900">₹{item.p * item.q}</span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>

                     {/* TODAY SPECIALS SMART SUGGESTIONS */}
                     {currentSessionItems.length > 0 && displaySpecials.length > 0 && (
                        <div className="pt-8 border-t-2 border-dashed border-gray-100">
                           <div className="flex items-center gap-2 mb-4">
                              <Star size={16} className="text-amber-500 fill-amber-500" />
                              <h4 className="text-[11px] font-black uppercase tracking-widest text-[#E53935]">Today Specials</h4>
                           </div>
                           <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x custom-scrollbar">
                              {displaySpecials.map((item, idx) => (
                                 <div 
                                    key={idx} 
                                    onClick={() => setPreviewItem(item)}
                                    className="min-w-[150px] w-[150px] bg-amber-50/30 border border-amber-100 rounded-2xl p-3 shadow-sm shrink-0 snap-start flex flex-col relative overflow-hidden group cursor-pointer hover:border-amber-300 transition-colors"
                                 >
                                    <p className="text-[11px] font-bold text-gray-900 leading-tight mb-3 pr-2">{item.n}</p>
                                    <div className="flex items-center justify-between mt-auto">
                                       <span className="text-[11px] font-black text-gray-500">₹{item.p}</span>
                                       <button 
                                          onClick={(e) => { e.stopPropagation(); addItemToSession(item); }}
                                          className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors"
                                       >
                                          <Plus size={16} strokeWidth={3} />
                                       </button>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>

                  <div className="p-8 bg-white border-t border-gray-100 space-y-6 shrink-0 shadow-[0_-20px_50px_rgba(0,0,0,0.03)] relative z-10">
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col gap-1">
                           <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{currentSessionItems.length > 0 ? 'Updating' : 'Grand Total'}</span>
                           <p className="text-3xl font-black text-gray-900 tracking-tighter leading-none">₹{calculateSessionBill(activeTable, currentSessionItems).total}</p>
                        </div>
                        <div className="text-right flex flex-col gap-1">
                           <span className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em]">KOT Draft</span>
                           <span className="text-lg font-black text-gray-400">₹{calculateOrderTotal(currentSessionItems).total}</span>
                        </div>
                     </div>
                     <button 
                        onClick={sendIncrementalKOT}
                        disabled={currentSessionItems.length === 0}
                        className="w-full py-5 bg-[#E53935] text-white rounded-2xl font-black text-xs uppercase tracking-[0.25em] shadow-xl shadow-red-100 active:scale-98 transition-all flex items-center justify-center gap-3 disabled:opacity-20 disabled:shadow-none relative group overflow-hidden"
                     >
                        <Send size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        Send KOT to Kitchen
                     </button>
                  </div>
               </div>
            </div>
          </div>
        )}
      </main>

      {/* EDIT ITEM MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 backdrop-blur-xl bg-black/40 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[40px] overflow-hidden shadow-2xl p-8 animate-in zoom-in-95 duration-500 relative">
              <button onClick={() => setEditingItem(null)} className="absolute top-6 right-6 w-10 h-10 bg-gray-50 hover:bg-red-50 hover:text-red-500 rounded-full flex items-center justify-center transition-all"><X size={20} /></button>
              
              <div className="mb-8">
                 <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-none mb-2">Update Asset</h3>
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{editingItem.n}</p>
              </div>
              
              <div className="space-y-6">
                 <div className="h-48 w-full rounded-[24px] overflow-hidden border-2 border-dashed border-gray-200 relative group flex items-center justify-center bg-gray-50">
                    {editingItem.img ? (
                       <img src={editingItem.img} className="w-full h-full object-cover opacity-80 group-hover:opacity-40 transition-opacity" />
                    ) : (
                       <ImageIcon className="text-gray-300" size={48} />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <label className="cursor-pointer px-6 py-3 bg-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl border border-gray-100 hover:scale-105 active:scale-95 transition-transform flex items-center gap-2">
                          <ImageIcon size={14} className="text-[#E53935]" />
                          Upload Photo
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, editingItem)} />
                       </label>
                    </div>
                 </div>
                 
                 <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 py-3 rounded-2xl border border-green-100">
                    <RefreshCw size={14} className="animate-spin-slow" />
                    <p className="text-[9px] font-black uppercase tracking-[0.1em]">Syncs instantly to all terminals</p>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* CUSTOMER ITEM PREVIEW MODAL */}
      {previewItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/40 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-4xl rounded-3xl sm:rounded-[48px] overflow-hidden shadow-[0_100px_150px_rgba(0,0,0,0.3)] flex flex-col md:flex-row animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto custom-scrollbar">
              <div className="w-full md:w-1/2 h-[200px] sm:h-[300px] md:h-auto relative shrink-0">
                 <img src={previewItem.img} alt={previewItem.n} className="w-full h-full object-cover" />
                 <button onClick={() => setPreviewItem(null)} className="absolute top-4 left-4 sm:top-6 sm:left-6 w-10 h-10 sm:w-12 sm:h-12 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-2xl flex items-center justify-center text-white transition-all"><X size={24} /></button>
                 <div className="absolute bottom-8 left-8 flex gap-3">
                    <div className={`px-4 py-2 rounded-xl backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-widest ${previewItem.t === 'veg' ? 'bg-green-500/80' : 'bg-red-500/80'}`}>
                       {previewItem.t === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}
                    </div>
                    {previewItem.spice > 0 && (
                      <div className="px-4 py-2 rounded-xl backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-widest bg-orange-500/80 flex items-center gap-2">
                        <Flame size={14} /> Spicy Lvl {previewItem.spice}
                      </div>
                    )}
                 </div>
              </div>
              <div className="w-full md:w-1/2 p-6 sm:p-12 flex flex-col justify-between">
                 <div>
                    <h3 className="text-2xl sm:text-4xl font-black tracking-tight text-gray-900 mb-2 sm:mb-4 leading-tight">{previewItem.n}</h3>
                    <p className="text-sm sm:text-base text-gray-500 font-medium leading-relaxed mb-6 sm:mb-8">{previewItem.desc}</p>
                    
                    <div className="space-y-4 sm:space-y-6">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-[#E53935]"><CheckCircle2 size={20} /></div>
                          <p className="text-sm font-black uppercase tracking-tight text-gray-700">Premium Chef Special Recommendation</p>
                       </div>
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-[#E53935]"><ChefHat size={20} /></div>
                          <p className="text-sm font-black uppercase tracking-tight text-gray-700">Freshly prepared in our high-speed kitchen</p>
                       </div>
                    </div>
                 </div>

                 <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-100 flex items-center justify-between gap-4">
                    <div className="flex flex-col shrink-0">
                       <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest">A-la-Carte Price</span>
                       <span className="text-2xl sm:text-3xl font-black text-gray-900">₹{previewItem.p}</span>
                    </div>
                    <button 
                       onClick={() => { addItemToSession(previewItem); setPreviewItem(null); }}
                       className="px-6 py-4 sm:px-10 sm:py-5 w-full bg-[#E53935] text-white rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] shadow-xl shadow-red-100 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-3"
                    >
                       <Plus size={20} strokeWidth={3} />
                       Add to Session
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* UNDO NOTIFICATION */}
      {removedItem && (
        <div 
          className="fixed bottom-24 right-6 z-[130] pointer-events-auto flex items-center justify-between gap-6 bg-gray-900 text-white px-5 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right-4 min-w-[280px] transition-transform"
          onTouchStart={e => e.currentTarget.dataset.startX = e.touches[0].clientX}
          onTouchMove={e => {
            const startX = parseFloat(e.currentTarget.dataset.startX);
            const currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;
            if (deltaX > 0) {
              e.currentTarget.style.transform = `translateX(${deltaX}px)`;
              e.currentTarget.style.opacity = 1 - (deltaX / 200);
            }
          }}
          onTouchEnd={e => {
            const startX = parseFloat(e.currentTarget.dataset.startX);
            const currentX = e.changedTouches[0].clientX;
            if (currentX - startX > 50) {
              setRemovedItem(null);
            } else {
              e.currentTarget.style.transform = '';
              e.currentTarget.style.opacity = '';
            }
          }}
        >
          <div>
             <p className="text-[11px] font-black uppercase tracking-tight leading-none">{removedItem.n} Removed</p>
             <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase">Item removed from draft</p>
          </div>
          <button 
            onClick={undoRemove}
            className="text-[10px] font-black text-amber-400 hover:text-amber-300 uppercase tracking-widest px-4 py-2 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {/* OPERATIONAL NOTIFICATIONS */}
      <div className="fixed bottom-6 right-6 z-[120] flex flex-col gap-3 pointer-events-none">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className="pointer-events-auto flex items-center gap-4 bg-white border border-gray-100 p-4 rounded-[24px] shadow-[0_20px_40px_rgba(0,0,0,0.1)] animate-in slide-in-from-right-4 min-w-[280px] transition-transform"
            onTouchStart={e => e.currentTarget.dataset.startX = e.touches[0].clientX}
            onTouchMove={e => {
              const startX = parseFloat(e.currentTarget.dataset.startX);
              const currentX = e.touches[0].clientX;
              const deltaX = currentX - startX;
              if (deltaX > 0) {
                e.currentTarget.style.transform = `translateX(${deltaX}px)`;
                e.currentTarget.style.opacity = 1 - (deltaX / 200);
              }
            }}
            onTouchEnd={e => {
              const startX = parseFloat(e.currentTarget.dataset.startX);
              const currentX = e.changedTouches[0].clientX;
              if (currentX - startX > 50) {
                setNotifications(prev => prev.filter(notif => notif.id !== n.id));
              } else {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.opacity = '';
              }
            }}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-[#E53935]'}`}>
               {n.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            </div>
            <div>
               <p className="text-[11px] font-black text-gray-900 uppercase tracking-tight leading-none">{n.title}</p>
               <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase">Cloud Synchronized</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
