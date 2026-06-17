/**
 * VenueDashboard.jsx
 *
 * Venue outlet panel for the Cashier, displayed when outlet === 'venue'.
 * Supports: Conference Hall, PDR, Rooms, Owner(vijay).
 *
 * Features:
 * - Section tabs (Conference Hall / PDR / Rooms / Owner)
 * - Table selection per section
 * - Menu with venue-specific pricing
 * - KOT send (food → kitchen printer)
 * - Final bill print + settlement
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, ShoppingCart, Printer, CheckCircle2, X, Plus, Minus,
  Trash2, CreditCard, Banknote, Smartphone, Search, ChefHat, Package,
  ArrowRight, Loader2, Tag
} from 'lucide-react';
import { useVenueTableSync } from '../services/venueTableSyncService';
import { fetchVenueMenu, updateVenueTableSession } from '../services/venueTableApi';
import { VENUE_ID, VENUE_SUB_IDS } from '../services/venueApiConfig';
import { createOrder, updateOrderItems } from '../services/orderApi';
import { getSocket } from '../hooks/useSocket';
import { calculateOrderTotal, getTableItems } from '../shared/utils/billing';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SECTION_ORDER = ['Conference Hall', 'PDR', 'Rooms', 'Owner(vijay)'];
const SECTION_COLORS = {
  'Conference Hall':   { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700', active: 'bg-[#4527A0]' },
  'PDR':              { bg: 'bg-teal-50',   border: 'border-teal-300',   text: 'text-teal-700',   active: 'bg-[#00695C]' },
  'Rooms':            { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-700', active: 'bg-[#6A1B9A]' },
  'Owner(vijay)':    { bg: 'bg-amber-50',  border: 'border-amber-300',  text: 'text-amber-700',  active: 'bg-[#E65100]' },
};

function getVenueId(sectionName) {
  return VENUE_SUB_IDS[sectionName] || 'venue-conference1';
}

function getTableLabel(sectionName, tableNumber) {
  if (sectionName === 'Conference Hall') return 'C1';
  if (sectionName === 'PDR') return 'PDR';
  if (sectionName === 'Rooms') return `R${tableNumber}`;
  if (sectionName === 'Owner(vijay)') return 'P1';
  return `V${tableNumber}`;
}

// ─── VenueDashboard ──────────────────────────────────────────────────────────

export default function VenueDashboard({ addNotification, activeRestaurantId }) {
  const { tables: venueTables, setTables: setVenueTables, isSyncing } = useVenueTableSync();

  // ── Section / table selection ──
  const [activeSection, setActiveSection] = useState('Conference Hall');
  const [selectedTable, setSelectedTable] = useState(null);

  // ── Menu ──
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategory, setMenuCategory] = useState('All');

  // ── Cart ──
  const [cart, setCart] = useState([]);

  // ── Billing ──
  const [showPayModal, setShowPayModal] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [isSendingKot, setIsSendingKot] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const [settledOrderIds] = useState(() => new Set());

  // ── Group tables by section ──
  const tablesBySection = useMemo(() => {
    const map = {};
    for (const sec of SECTION_ORDER) map[sec] = [];
    for (const t of venueTables) {
      const secName = t.sectionName || t.section?.name || '';
      if (map[secName]) map[secName].push(t);
    }
    // Sort PDR tables by number
    for (const key of Object.keys(map)) {
      map[key] = map[key].sort((a, b) => Number(a.number) - Number(b.number));
    }
    return map;
  }, [venueTables]);

  const sectionTables = tablesBySection[activeSection] || [];

  // ── Keep selectedTable fresh from live state ──
  useEffect(() => {
    if (!selectedTable?.backendId) return;
    const live = venueTables.find((t) => t.backendId === selectedTable.backendId);
    if (live) setSelectedTable(live);
  }, [venueTables, selectedTable?.backendId]);

  // ── Clear cart when table changes ──
  useEffect(() => {
    setCart([]);
  }, [selectedTable?.backendId]);

  // ── Load venue menu when section changes ──
  useEffect(() => {
    const venueId = getVenueId(activeSection);
    setMenuLoading(true);
    setMenuItems([]);
    setMenuCategory('All');
    fetchVenueMenu(venueId, activeRestaurantId)
      .then((items) => setMenuItems(Array.isArray(items) ? items : []))
      .catch((err) => {
        console.error('[VenueDashboard] Menu load failed:', err);
        setMenuItems([]);
      })
      .finally(() => setMenuLoading(false));
  }, [activeSection, activeRestaurantId]);

  // ── Menu categories ──
  const categories = useMemo(() => {
    const cats = menuItems.map((i) => i.category).filter(Boolean);
    return ['All', ...new Set(cats)];
  }, [menuItems]);

  // ── Filtered menu items ──
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = menuCategory === 'All' || item.category === menuCategory;
      const q = menuSearch.trim().toLowerCase();
      const matchSearch = !q || (item.name || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [menuItems, menuCategory, menuSearch]);

  // ── Cart helpers ──
  const addToCart = (item) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], q: next[idx].q + 1 };
        return next;
      }
      return [...prev, { id: item.id, n: item.name, p: item.price, q: 1, menuType: item.menuType || 'FOOD' }];
    });
  };

  const changeQty = (id, delta) => {
    setCart((prev) => {
      const next = prev
        .map((c) => (c.id === id ? { ...c, q: c.q + delta } : c))
        .filter((c) => c.q > 0);
      return next;
    });
  };

  const { subtotal, taxes, total } = calculateOrderTotal(cart);

  // ── Existing order items for selected table ──
  const existingItems = useMemo(() => {
    if (!selectedTable) return [];
    return getTableItems(selectedTable).filter((i) => !i.removedFromBill);
  }, [selectedTable]);

  const { subtotal: orderSubtotal, taxes: orderTaxes, total: orderTotal } = useMemo(
    () => calculateOrderTotal([...existingItems, ...cart]),
    [existingItems, cart]
  );

  // ─── Send KOT ────────────────────────────────────────────────────────────────
  const handleSendKot = async () => {
    if (!selectedTable?.backendId) {
      addNotification?.('No Table', 'Please select a table first.', 'error');
      return;
    }
    if (cart.length === 0) {
      addNotification?.('Empty Cart', 'Add items to cart first.', 'error');
      return;
    }

    setIsSendingKot(true);
    const requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      let orderId = selectedTable.activeOrder?.id;

      if (!orderId) {
        const order = await createOrder({
          tableId: selectedTable.backendId,
          tableNumber: selectedTable.id || selectedTable.number,
          items: cart,
          restaurantId: VENUE_ID,
          requestId,
        });
        orderId = order.id;
        setVenueTables((prev) =>
          prev.map((t) =>
            t.backendId === selectedTable.backendId
              ? { ...t, activeOrder: order, status: 'Occupied' }
              : t
          )
        );
      } else {
        const lastUpdatedAt = selectedTable.activeOrder?.updatedAt;
        await updateOrderItems(orderId, cart, requestId, null, false, null, lastUpdatedAt);
      }

      // Build KOT entry
      const kotId = `KOT-${Date.now()}`;
      const kotEntry = {
        id: kotId,
        time: new Date().toISOString(),
        createdAt: Date.now(),
        status: 'Incoming',
        type: 'FOOD',
        items: cart.map((i) => ({ n: i.n, q: i.q, p: i.p, menuType: 'FOOD' })),
      };

      // Update local table kotHistory (optimistic)
      setVenueTables((prev) =>
        prev.map((t) => {
          if (t.backendId !== selectedTable.backendId) return t;
          const currentHistory = t.kotHistory || [];
          const exists = currentHistory.some(k => String(k.id) === String(kotEntry.id));
          const history = exists ? currentHistory : [...currentHistory, kotEntry];
          const { total: billTotal } = calculateOrderTotal([...existingItems, ...cart]);
          return {
            ...t,
            kotHistory: history,
            status: 'Occupied',
            currentBill: billTotal,
            time: t.time || new Date().toISOString(),
          };
        })
      );

      // Wait for physical print confirmation from PrintStation (max 15s)
      const socket = getSocket();
      const printResult = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          socket.off('kot:printed', handler);
          resolve('timeout');
        }, 15000);
        const handler = ({ requestId: ackRequestId, status }) => {
          if (ackRequestId === requestId) {
            clearTimeout(timeout);
            socket.off('kot:printed', handler);
            resolve(status || 'success');
          }
        };
        socket.on('kot:printed', handler);
      });

      // Clear cart and notify after print confirmation or timeout
      setCart([]);
      if (printResult === 'timeout') {
        addNotification?.('KOT Saved — Print delayed', `KOT saved for ${getTableLabel(activeSection, selectedTable.number)}`, 'warning');
      } else {
        addNotification?.('KOT Printed', `KOT printed for ${getTableLabel(activeSection, selectedTable.number)}`, 'success');
      }
    } catch (err) {
      console.error('[VenueDashboard] KOT error:', err);
      addNotification?.('KOT Failed', err.message || 'Failed to send KOT', 'error');
    } finally {
      setIsSendingKot(false);
    }
  };

  // ─── Settle ──────────────────────────────────────────────────────────────────
  const handleSettle = async (method) => {
    if (!selectedTable?.backendId) return;
    const orderId = selectedTable.activeOrder?.id;
    if (!orderId) {
      addNotification?.('No Order', 'No active order to settle.', 'error');
      return;
    }
    if (settledOrderIds.has(orderId)) {
      addNotification?.('Already Settled', 'This order was already settled.', 'error');
      return;
    }

    const amount = Number(orderTotal > 0 ? orderTotal : selectedTable.currentBill || 0);
    if (amount <= 0) {
      addNotification?.('Empty Bill', 'Bill amount is ₹0.', 'error');
      return;
    }

    setIsSettling(true);
    try {
      // Call backend print-bill endpoint first - emits FINAL_BILL socket event to PrintStation
      await fetch(
        `${import.meta.env.VITE_API_URL}/api/orders/${orderId}/print-bill?restaurantId=${VENUE_ID}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      // Settle on backend
      const settleRes = await fetch(
        `${import.meta.env.VITE_API_URL}/api/orders/${orderId}/settle?restaurantId=${VENUE_ID}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMethod: method }),
        }
      );
      if (!settleRes.ok) {
        const err = await settleRes.json().catch(() => ({}));
        throw new Error(err.error || 'Settlement failed');
      }

      settledOrderIds.add(orderId);

      // Free table locally
      setVenueTables((prev) =>
        prev.map((t) =>
          t.backendId === selectedTable.backendId
            ? { ...t, status: 'Free', activeOrder: null, kotHistory: [], currentBill: 0, guests: 0, time: null }
            : t
        )
      );

      setShowPayModal(false);
      setSelectedTable(null);
      setCart([]);
      addNotification?.('Settled', `₹${amount.toFixed(0)} via ${method}`, 'success');
    } catch (err) {
      console.error('[VenueDashboard] Settle error:', err);
      addNotification?.('Settle Failed', err.message, 'error');
    } finally {
      setIsSettling(false);
    }
  };

  // ─── Terminate ───────────────────────────────────────────────────────────────
  const terminateTableSession = async () => {
    if (!selectedTable) return;
    if (isTerminating) return;

    const tableSnap = selectedTable;
    setIsTerminating(true);

    // Step 1: Optimistically free the table in local state
    setVenueTables(prev => prev.map(t =>
      t.id === tableSnap.id || t.backendId === tableSnap.backendId
        ? { ...t, status: 'Free', workflowStatus: 'Free', activeOrder: null, orders: [], items: [], captainId: null, kotHistory: [], currentBill: 0, guests: 0, time: null }
        : t
    ));

    setSelectedTable(null);
    setCart([]);

    const resetSessionPayload = {
      status: 'Free',
      kotHistory: [],
      currentBill: 0,
      captainId: null,
      guests: 0,
    };

    if (tableSnap?.backendId) {
      // Use the venue/restaurant terminate endpoint
      const resId = tableSnap.section?.restaurantId || activeRestaurantId;
      const terminateUrl = `${import.meta.env.VITE_API_URL}/api/orders/terminate-table/${tableSnap.backendId}?restaurantId=${resId}`;

      try {
        const response = await fetch(terminateUrl, { method: 'POST' });

        if (!response.ok) throw new Error('Backend sync failed');

        // Background cleanup - use the venue table API
        updateVenueTableSession(tableSnap.backendId, resetSessionPayload)
          .catch(err => console.warn('[Terminate] resetTableSession failed:', err.message));

        addNotification('Session Terminated', `Table ${getTableLabel(activeSection, tableSnap.number)} freed`, 'info');
      } catch (err) {
        console.warn('[Terminate] order cancel failed:', err.message);
        addNotification('Error', 'Termination failed. Table state rolled back.', 'error');
        // Rollback optimistic update
        setVenueTables(prev => prev.map(t =>
          t.id === tableSnap.id || t.backendId === tableSnap.backendId
            ? tableSnap
            : t
        ));
      } finally {
        setIsTerminating(false);
      }
    } else {
      addNotification('Session Terminated', `Table ${getTableLabel(activeSection, tableSnap.number)} freed`, 'info');
      setIsTerminating(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  const colors = SECTION_COLORS[activeSection] || SECTION_COLORS['Conference Hall'];

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <Building2 size={22} className="text-[#4527A0]" />
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Venue</h2>
        {isSyncing && <Loader2 size={14} className="animate-spin text-gray-400 ml-auto" />}
      </div>

      {/* Section Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 shrink-0 overflow-x-auto">
        {SECTION_ORDER.map((sec) => {
          const c = SECTION_COLORS[sec];
          const isActive = activeSection === sec;
          const busyCount = (tablesBySection[sec] || []).filter(
            (t) => t.status && t.status !== 'Free' && t.status !== 'AVAILABLE'
          ).length;
          return (
            <button
              key={sec}
              onClick={() => { setActiveSection(sec); setSelectedTable(null); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                isActive ? `${c.active} text-white shadow-sm` : `bg-gray-100 text-gray-500 hover:bg-gray-200`
              }`}
            >
              {sec}
              {busyCount > 0 && (
                <span className={`w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center ${isActive ? 'bg-white/20 text-white' : 'bg-red-500 text-white'}`}>
                  {busyCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: Tables + Menu */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Table grid */}
          <div className="bg-white border-b border-gray-100 p-3 shrink-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">{activeSection}</p>
            <div className="flex gap-2 flex-wrap">
              {sectionTables.length === 0 && !isSyncing && (
                <p className="text-[10px] text-gray-400 font-bold italic">No tables found</p>
              )}
              {sectionTables.map((table) => {
                const isFree = !table.status || table.status === 'Free' || table.status === 'AVAILABLE';
                const isBilling = table.status === 'Waiting Bill';
                const isSelected = selectedTable?.backendId === table.backendId;

                let cls = 'bg-gray-50 border-gray-200 text-gray-500';
                if (isSelected) cls = `${colors.bg} ${colors.border} ${colors.text} ring-2 ring-current/30`;
                else if (isBilling) cls = 'bg-amber-50 border-amber-400 text-amber-700 animate-pulse';
                else if (!isFree) cls = `${colors.bg} ${colors.border} ${colors.text}`;

                return (
                  <button
                    key={table.backendId}
                    onClick={() => setSelectedTable(isSelected ? null : table)}
                    className={`border-2 rounded-xl px-3 py-2 text-center min-w-[64px] transition-all hover:scale-105 active:scale-95 ${cls}`}
                  >
                    <div className="text-[11px] font-black leading-tight">
                      {getTableLabel(activeSection, table.number)}
                    </div>
                    <div className="text-[8px] font-bold uppercase mt-0.5 opacity-70">
                      {isBilling ? 'Bill Req' : isFree ? 'Free' : 'Active'}
                    </div>
                    {!isFree && table.currentBill > 0 && (
                      <div className="text-[8px] font-black mt-0.5">₹{Number(table.currentBill).toFixed(0)}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Search + filter */}
            <div className="bg-white px-3 py-2 border-b border-gray-100 shrink-0 flex gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Search menu..."
                  className="w-full pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold placeholder-gray-400 focus:outline-none focus:border-[#4527A0]"
                />
              </div>
            </div>
            {/* Category chips */}
            <div className="bg-white px-3 pb-2 flex gap-1.5 overflow-x-auto shrink-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMenuCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                    menuCategory === cat ? 'bg-[#4527A0] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Items grid */}
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 content-start">
              {menuLoading && (
                <div className="col-span-full flex items-center justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-[#4527A0]" />
                </div>
              )}
              {!menuLoading && filteredItems.length === 0 && (
                <div className="col-span-full text-center py-10 text-gray-400 text-xs font-bold">
                  No items found
                </div>
              )}
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className={`border rounded-xl p-2.5 text-left transition-all hover:scale-[1.02] active:scale-[0.98] text-[11px] relative ${
                      inCart
                        ? `${colors.bg} ${colors.border} ${colors.text}`
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                      {item.hasVenuePrice && <Tag size={8} className="text-amber-500 shrink-0" />}
                    </div>
                    <p className="font-black leading-tight line-clamp-2">{item.name}</p>
                    <p className="text-[10px] font-black mt-1">₹{item.price}</p>
                    {inCart && (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#4527A0] text-white text-[8px] font-black rounded-full flex items-center justify-center">
                        {inCart.q}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Cart + Order Summary */}
        <div className="w-64 xl:w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
          {/* Selected table info */}
          {selectedTable ? (
            <>
              <div className={`px-3 py-2.5 border-b border-gray-100 ${colors.bg} shrink-0`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-500">Selected</p>
                    <p className={`text-sm font-black ${colors.text}`}>
                      {getTableLabel(activeSection, selectedTable.number)}
                    </p>
                  </div>
                  <button onClick={() => { setSelectedTable(null); setCart([]); }}
                    className="text-gray-400 hover:text-gray-600 bg-white rounded-full p-1">
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* Existing order items */}
              {existingItems.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-100 shrink-0">
                  <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Current Order</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {existingItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-[10px] font-bold text-gray-700">
                        <span className="truncate mr-1">{item.n || item.name}</span>
                        <span className="shrink-0 text-gray-500">×{item.q || item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cart */}
              <div className="flex-1 overflow-y-auto px-3 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1.5">New Items</p>
                {cart.length === 0 ? (
                  <p className="text-[10px] text-gray-400 text-center py-4">No items in cart</p>
                ) : (
                  <div className="space-y-2">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black truncate">{item.n}</p>
                          <p className="text-[9px] text-gray-500 font-bold">₹{item.p}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => changeQty(item.id, -1)}
                            className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100">
                            <Minus size={8} />
                          </button>
                          <span className="text-[10px] font-black w-4 text-center">{item.q}</span>
                          <button onClick={() => changeQty(item.id, 1)}
                            className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100">
                            <Plus size={8} />
                          </button>
                          <button onClick={() => setCart((prev) => prev.filter((c) => c.id !== item.id))}
                            className="w-5 h-5 rounded-full border border-red-200 text-red-400 flex items-center justify-center hover:bg-red-50 ml-0.5">
                            <Trash2 size={8} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 shrink-0 text-[10px]">
                <div className="flex justify-between font-bold text-gray-600">
                  <span>Subtotal</span><span>₹{orderSubtotal.toFixed(0)}</span>
                </div>
                {orderTaxes > 0 && (
                  <div className="flex justify-between font-bold text-gray-500">
                    <span>GST (5%)</span><span>₹{orderTaxes.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-gray-900 text-[11px] mt-1 pt-1 border-t border-gray-200">
                  <span>Total</span><span>₹{orderTotal.toFixed(0)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="p-2 flex flex-col gap-1.5 shrink-0 border-t border-gray-100">
                {cart.length > 0 && (
                  <button
                    onClick={handleSendKot}
                    disabled={isSendingKot}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-black transition-colors disabled:opacity-50"
                  >
                    {isSendingKot ? <Loader2 size={12} className="animate-spin" /> : <ChefHat size={12} />}
                    Send KOT
                  </button>
                )}
                {existingItems.length > 0 && (
                  <button
                    onClick={() => setShowPayModal(true)}
                    className={`w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors text-white ${colors.active}`}
                  >
                    <CreditCard size={12} />
                    Settle Bill · ₹{(orderTotal > 0 ? orderTotal : selectedTable.currentBill || 0).toFixed(0)}
                  </button>
                )}
                {selectedTable.status && selectedTable.status !== 'Free' && (
                  <button
                    type="button"
                    onClick={() => setShowTerminateModal(true)}
                    disabled={isTerminating}
                    className={`w-full py-2 rounded-lg border border-red-200 bg-red-50 text-red-800 text-[9px] font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-1 ${isTerminating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-100/60 cursor-pointer'}`}
                  >
                    {isTerminating ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                    {isTerminating ? 'Ending...' : 'Terminate'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <Building2 size={32} className="text-gray-200 mb-3" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No Table Selected</p>
              <p className="text-[10px] text-gray-300 mt-1 font-bold">Select a table from {activeSection}</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPayModal && selectedTable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
            >
              <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black text-gray-900">₹{(orderTotal > 0 ? orderTotal : selectedTable.currentBill || 0).toFixed(0)}</h2>
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider mt-0.5">
                    Settle {getTableLabel(activeSection, selectedTable.number)}
                  </p>
                </div>
                <button onClick={() => setShowPayModal(false)} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-3">Select Payment Method</p>
                {[
                  { label: 'Cash', value: 'CASH', icon: Banknote, color: 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' },
                  { label: 'UPI', value: 'UPI', icon: Smartphone, color: 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100' },
                  { label: 'Card', value: 'CARD', icon: CreditCard, color: 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => handleSettle(value)}
                    disabled={isSettling}
                    className={`w-full flex items-center gap-3 px-4 py-3 border rounded-xl font-black text-sm transition-all disabled:opacity-50 ${color}`}
                  >
                    {isSettling ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                    {label}
                    <ArrowRight size={14} className="ml-auto" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TERMINATE CONFIRMATION MODAL */}
      {showTerminateModal && selectedTable && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in border border-gray-200">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase text-red-500 tracking-wider">Terminate Session</p>
                <p className="text-base font-black text-gray-900 mt-0.5">
                  Table {getTableLabel(activeSection, selectedTable.number)}
                </p>
              </div>
              <button
                onClick={() => setShowTerminateModal(false)}
                className="p-2.5 text-gray-400 hover:text-gray-900 bg-white border border-gray-150 rounded-xl shadow-sm transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-700 font-semibold">
                This will remove all items and free the table. Are you sure?
              </p>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                type="button"
                onClick={() => setShowTerminateModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-black text-gray-500 hover:bg-gray-200 transition-colors uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTerminateModal(false);
                  terminateTableSession();
                }}
                disabled={isTerminating}
                className={`flex-1 py-3 rounded-xl text-sm font-black bg-red-600 text-white hover:bg-red-700 transition-colors uppercase tracking-widest ${isTerminating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isTerminating ? 'Ending...' : 'Terminate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
