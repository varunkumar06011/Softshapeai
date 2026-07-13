// ─────────────────────────────────────────────────────────────────────────────
// AdminTransactions — Transaction history viewer with date filtering and delete
// ─────────────────────────────────────────────────────────────────────────────
// Displays settled transactions (bills) with:
//   - Date and month filtering (IST timezone aware)
//   - Bill number display (formatTxnDisplayId: DD/MM/YY-NNN)
//   - Source detection (restaurant vs bar based on sectionTag)
//   - Payment method, amount, GST, discount breakdown
//   - Delete transaction (with confirmation)
//   - Auto-refresh support
//
// Used in the admin Billing tab to review and manage past transactions.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { History, Check, X, RefreshCw, RotateCcw, Eye } from 'lucide-react';
import { fetchTransactions, deleteTransaction, confirmPayment } from '../services/orderApi';
import { apiFetch, API_BASE, getAuthHeaders } from '../services/apiConfig';
import { authService } from '../services/authService';
import DateInputButton from '../shared/components/DateInputButton';
import { getKolkataDateString, getKolkataMonthString, shiftKolkataDate, KOLKATA_TIME_ZONE, formatTxnDisplayId } from '../shared/utils/dateFormat';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

function formatBillNumber(txnDate, txnNumber) {
  return formatTxnDisplayId(txnDate, txnNumber);
}

function resolveSource(txn) {
  const tag = (txn.sectionTag || '').toLowerCase();
  if (tag === 'venue-bar-ac-hall') return 'bar';
  if (tag === 'venue-bar-conference') return 'conference';
  if (tag === 'venue-bar-pdr') return 'pdr';
  if (tag === 'venue-bar-rooms') return 'rooms';
  if (tag === 'venue-bar-parcel' || tag === 'venue-bar-gobox') return 'gobox';
  if (tag === 'venue-restaurant-parcel') return 'r-parcel';
  if (tag === 'venue-family-restaurant') return 'family-restaurant';
  return 'venue';
}

function formatTxnTableLabel(tableNumber, sectionTag) {
  const tag = (sectionTag || '').toLowerCase();
  if (tag.includes('bar-conference')) return `CONF-${tableNumber}`;
  if (tag.includes('bar-pdr'))        return `PDR-${tableNumber}`;
  if (tag.includes('bar-rooms'))      return `R${tableNumber}`;
  if (tag.includes('bar-parcel'))     return `P${tableNumber}`;
  if (tag.includes('bar-gobox'))      return `GB${tableNumber}`;
  if (tag.includes('bar') || tag.includes('ac-hall')) return `B${tableNumber}`;
  if (tag.includes('family-restaurant')) return `T${tableNumber}`;
  if (tag.includes('restaurant-parcel')) return `P${tableNumber}`;
  return `T${tableNumber}`;
}

export default function AdminTransactions({ onStatsRefresh }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txnDateFilter, setTxnDateFilter] = useState('today');
  const [txnCustomDate, setTxnCustomDate] = useState('');
  const [txnMethodFilter, setTxnMethodFilter] = useState('all');
  const [txnSourceFilter, setTxnSourceFilter] = useState('all');
  const [txnSearch, setTxnSearch] = useState('');
  const [expandedTxnId, setExpandedTxnId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [txnStatusFilter, setTxnStatusFilter] = useState('all');
  const [confirmingId, setConfirmingId] = useState(null);
  const [fetchedSections, setFetchedSections] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [txnOutletFilter, setTxnOutletFilter] = useState('current');
  const [passwordModalTxn, setPasswordModalTxn] = useState(null);
  const [deleteStage, setDeleteStage] = useState('verify'); // 'verify' | 'confirm'
  const [revealedTxnId, setRevealedTxnId] = useState(null);
  const [staffMap, setStaffMap] = useState({});
  const [deletePassword, setDeletePassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/venue/sections`, { credentials: 'include', headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const sections = (Array.isArray(data) ? data : data.sections || []).map(s => ({
          ...s,
          sectionTag: s.sectionTag || s.tables?.[0]?.sectionTag || null,
        }));
        setFetchedSections(sections);
      })
      .catch(() => setFetchedSections([]));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/staff`, { headers: { ...getAuthHeaders() } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const map = {};
        (Array.isArray(data) ? data : []).forEach(s => { if (s.id && s.name) map[s.id] = s.name; });
        setStaffMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch('/api/restaurant/outlets-overview')
      .then(data => {
        if (data?.outlets && Array.isArray(data.outlets)) {
          setOutlets(data.outlets.map(o => ({ id: o.id, name: o.name })));
        }
      })
      .catch(() => {});
  }, []);

  const sourceFilterPills = useMemo(() => {
    const pills = [{ key: 'all', label: 'All' }];
    const seen = new Set(['all']);
    for (const section of fetchedSections) {
      const sourceKey = resolveSource({ sectionTag: section.sectionTag });
      if (!seen.has(sourceKey)) {
        seen.add(sourceKey);
        const label = section.name?.length > 8 ? section.name.slice(0, 6) : section.name || sourceKey;
        pills.push({ key: sourceKey, label });
      }
    }
    return pills;
  }, [fetchedSections]);

  const loadTransactions = useCallback(async (filter = 'today', customDate = '') => {
    setLoading(true);
    setTransactions([]);
    try {
      let dateParam = null;
      let monthParam = null;
      let limitParam = 200;

      if (filter === 'custom' && customDate) {
        dateParam = customDate;
      } else if (filter === 'today') {
        dateParam = getKolkataDateString();
      } else if (filter === 'yesterday') {
        dateParam = shiftKolkataDate(new Date(), -1);
      } else if (filter === 'month') {
        monthParam = getKolkataMonthString();
        limitParam = 500;
      } else {
        limitParam = 500;
      }

      const outletId = txnOutletFilter === 'all' ? 'all' : null;
      const allResults = await Promise.all([
        fetchTransactions(getCurrentRestaurantId(), limitParam, dateParam, monthParam, outletId).catch(() => []),
      ]);

      const allTxns = allResults.flatMap((txns, idx) => {
        const rid = [getCurrentRestaurantId()][idx];
        return txns.map(txn => ({ ...txn, restaurantId: txn.restaurantId || rid }));
      });

      const seen = new Set();
      const deduped = allTxns.filter(txn => {
        if (seen.has(txn.id)) return false;
        seen.add(txn.id);
        return true;
      });

      deduped.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

      const mapped = deduped.map(txn => ({
        id: txn.id,
        txnNumber: txn.txnNumber || null,
        displayId: formatBillNumber(txn.txnDate, txn.txnNumber),
        kot: txn.orderId ? `ORD-${txn.orderId.slice(-6).toUpperCase()}` : '—',
        amount: Number(txn.grandTotal ?? txn.amount ?? 0),
        grandTotal: txn.grandTotal != null ? Number(txn.grandTotal) : null,
        time: new Date(txn.paidAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: KOLKATA_TIME_ZONE }),
        date: new Date(txn.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: KOLKATA_TIME_ZONE }),
        timestamp: new Date(txn.paidAt).getTime(),
        items: txn.itemCount || 0,
        itemsList: txn.items || [],
        captainId: txn.captainId || 'CASHIER',
        captainName: txn.captainName || staffMap[txn.captainId] || (txn.captainId && txn.captainId !== 'CASHIER' ? txn.captainId : 'Head Cashier'),
        method: txn.method || 'OTHER',
        status: txn.status || 'COMPLETED',
        rawStatus: txn.status || 'COMPLETED',
        tipAmount: Number(txn.tipAmount ?? 0),
        tableNumber: txn.tableNumber ? formatTxnTableLabel(txn.tableNumber, txn.sectionTag) : null,
        source: (() => {
          const direct = resolveSource(txn);
          if (direct !== 'venue') return direct;
          const section = fetchedSections.find(s => s.id === txn.sectionId);
          return section ? resolveSource({ sectionTag: section.sectionTag }) || section.name : 'venue';
        })(),
        restaurantId: txn.restaurantId,
      }));

      setTransactions(mapped);
    } catch (err) {
      console.warn('[AdminTransactions] fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [txnOutletFilter]);

  React.useEffect(() => {
    loadTransactions(txnDateFilter, txnCustomDate);
  }, [loadTransactions, txnDateFilter, txnCustomDate]);

  const handleDelete = async (txn) => {
    setPasswordError('');
    setDeletePassword('');
    setPasswordModalTxn(txn);
    setDeleteStage('verify');
    setConfirmDeleteId(null);
  };

  const handleConfirmDelete = (txn) => {
    setPasswordError('');
    setDeletePassword('');
    setPasswordModalTxn(txn);
    setDeleteStage('confirm');
  };

  const submitDeletePassword = async () => {
    if (!passwordModalTxn || !deletePassword) return;
    const trimmedPassword = deletePassword.trim();
    setDeleting(true);
    setPasswordError('');
    try {
      const verifyRes = await fetch(`${API_BASE}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authService.getAuthHeader() },
        body: JSON.stringify({ password: trimmedPassword }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyData.valid) {
        setPasswordError(verifyData.error || 'Incorrect password');
        return;
      }
      if (deleteStage === 'verify') {
        setPasswordModalTxn(null);
        setDeletePassword('');
        setRevealedTxnId(passwordModalTxn.id);
        return;
      }
      await deleteTransaction(passwordModalTxn.id, passwordModalTxn.restaurantId, trimmedPassword);
      setTransactions(prev => prev.filter(t => t.id !== passwordModalTxn.id));
      setPasswordModalTxn(null);
      setDeletePassword('');
      setRevealedTxnId(null);
      if (onStatsRefresh) onStatsRefresh();
    } catch (err) {
      setPasswordError(err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmPayment = async (txn, paymentMethod = 'CASH') => {
    setConfirmingId(txn.id);
    try {
      const result = await confirmPayment(txn.id, { paymentMethod });
      if (result?.offline) {
        setTransactions(prev => prev.map(t => t.id === txn.id ? { ...t, status: 'COMPLETED', rawStatus: 'COMPLETED', method: paymentMethod } : t));
        alert('Payment confirm queued — will sync when online.');
      } else {
        const updatedTxn = result?.transaction;
        if (updatedTxn) {
          setTransactions(prev => prev.map(t => t.id === txn.id ? { ...t, status: updatedTxn.status || 'COMPLETED', rawStatus: updatedTxn.status || 'COMPLETED', method: updatedTxn.method || paymentMethod } : t));
        } else {
          setTransactions(prev => prev.map(t => t.id === txn.id ? { ...t, status: 'COMPLETED', rawStatus: 'COMPLETED', method: paymentMethod } : t));
        }
      }
      if (onStatsRefresh) onStatsRefresh();
    } catch (err) {
      alert('Confirm payment failed: ' + err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  const filtered = useMemo(() => {
    let list = transactions;
    if (txnSourceFilter !== 'all') list = list.filter(t => t.source === txnSourceFilter);
    if (txnStatusFilter !== 'all') list = list.filter(t => t.status === txnStatusFilter);
    if (txnMethodFilter !== 'all') list = list.filter(t => t.method === txnMethodFilter);
    if (txnSearch.trim()) {
      const q = txnSearch.trim().toLowerCase();
      list = list.filter(t =>
        (t.displayId || '').toLowerCase().includes(q) ||
        (t.captainName || '').toLowerCase().includes(q) ||
        String(t.tableNumber || '').includes(q) ||
        String(t.grandTotal ?? t.amount ?? '').includes(q)
      );
    }
    return list;
  }, [transactions, txnSourceFilter, txnMethodFilter, txnStatusFilter, txnSearch]);

  const resetFilters = (newDateFilter) => {
    setTxnDateFilter(newDateFilter);
    setTxnMethodFilter('all');
    setTxnSearch('');
    setTxnCustomDate('');
    setTxnSourceFilter('all');
    setTxnStatusFilter('all');
  };

  return (
    <div className="flex-grow p-4 overflow-y-auto custom-scrollbar bg-gray-50/50">
      <div className="max-w-6xl mx-auto space-y-3">
        <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">Transactions</h2>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="m-3 mb-2">
            <div className="bg-gradient-to-br from-[#E53935] to-[#B71C1C] rounded-xl p-4 flex flex-col gap-1 shadow-lg">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-100">Total Amount</span>
              <span className="text-3xl font-black text-white">
                ₹{filtered.filter(t => t.status === 'COMPLETED').reduce((sum, t) => sum + Number(t.grandTotal ?? t.amount ?? 0), 0).toFixed(2)}
              </span>
              <span className="text-[10px] font-bold text-red-100">{filtered.filter(t => t.status === 'COMPLETED').length} completed / {filtered.length} total</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mx-3 mb-3">
            {[
              { label: 'Cash', method: 'CASH', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
              { label: 'UPI', method: 'UPI', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
              { label: 'Card', method: 'CARD', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
              { label: 'Other', method: 'OTHER', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
            ].map(({ label, method, color, bg, border }) => {
              const total = filtered.filter(t => t.method === method && t.status === 'COMPLETED').reduce((sum, t) => sum + Number(t.grandTotal ?? t.amount ?? 0), 0);
              const count = filtered.filter(t => t.method === method && t.status === 'COMPLETED').length;
              return (
                <div key={method} className={`${bg} border ${border} rounded-xl p-3 flex flex-col gap-0.5`}>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${color}`}>{label}</span>
                  <span className="text-sm font-black text-gray-900">₹{total.toFixed(2)}</span>
                  <span className="text-[9px] font-bold text-gray-400">{count} txns</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
            {sourceFilterPills.map(f => (
              <button
                key={f.key}
                onClick={() => setTxnSourceFilter(f.key)}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] ${txnSourceFilter === f.key ? 'bg-[#E53935] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap border-b border-gray-100">
            {[
              { key: 'all', label: 'All Status' },
              { key: 'COMPLETED', label: 'Completed' },
              { key: 'PENDING', label: 'Pending' },
              { key: 'CANCELLED', label: 'Cancelled' },
              { key: 'FAILED', label: 'Failed' },
              { key: 'REFUNDED', label: 'Refunded' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setTxnStatusFilter(f.key)}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] ${txnStatusFilter === f.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 p-3 border-b border-gray-100 bg-gray-50 flex-wrap">
            {[
              { key: 'today', label: 'Today' },
              { key: 'yesterday', label: 'Yesterday' },
              { key: 'month', label: 'This Month' },
              { key: 'all', label: 'All Time' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => { resetFilters(f.key); loadTransactions(f.key, ''); }}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] ${txnDateFilter === f.key && !txnCustomDate ? 'bg-[#E53935] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {f.label}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-4">
              <button
                onClick={() => setTxnOutletFilter('current')}
                className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${txnOutletFilter === 'current' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                Current Outlet
              </button>
              {outlets.length > 1 && (
                <button
                  onClick={() => setTxnOutletFilter('all')}
                  className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${txnOutletFilter === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  All Outlets
                </button>
              )}
            </div>
            <button
              onClick={() => { loadTransactions(txnDateFilter, txnCustomDate); }}
              className="ml-auto px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:scale-[1.01] active:scale-[0.99] transition-all shadow-sm flex items-center gap-1"
            >
              <RefreshCw size={12} /> Sync
            </button>
            <DateInputButton
              value={txnCustomDate}
              max={getKolkataDateString()}
              onChange={(val) => {
                setTxnCustomDate(val);
                setTxnDateFilter('custom');
                if (val) loadTransactions('custom', val);
              }}
              className="ml-2"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap px-3 py-3 border-b border-gray-50">
            {[
              { key: 'all', label: 'All' },
              { key: 'CASH', label: 'Cash' },
              { key: 'UPI', label: 'UPI' },
              { key: 'CARD', label: 'Card' },
              { key: 'OTHER', label: 'Other' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setTxnMethodFilter(f.key)}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] ${txnMethodFilter === f.key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {f.label}
              </button>
            ))}
            <input
              type="text"
              value={txnSearch}
              onChange={e => setTxnSearch(e.target.value)}
              placeholder="Search bill, captain, table, amount..."
              autoComplete="off"
              className="ml-auto text-xs font-bold px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 placeholder-gray-400 outline-none focus:border-gray-400 w-52 shadow-inner transition-colors"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 text-xs font-black uppercase text-gray-500">TXN ID</th>
                  <th className="p-4 text-xs font-black uppercase text-gray-500">Source</th>
                  <th className="p-4 text-xs font-black uppercase text-gray-500">Table</th>
                  <th className="p-4 text-xs font-black uppercase text-gray-500">Captain</th>
                  <th className="p-4 text-xs font-black uppercase text-gray-500">Status</th>
                  <th className="p-4 text-xs font-black uppercase text-gray-500">Method</th>
                  <th className="p-4 text-xs font-black uppercase text-gray-500 text-right">Amount</th>
                  <th className="p-4 text-xs font-black uppercase text-gray-500 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-7 h-7 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading...</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center">
                      <History size={32} className="text-gray-300 mb-2 mx-auto" />
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No Transactions Found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(txn => (
                    <React.Fragment key={txn.id}>
                      <tr
                        onClick={() => setExpandedTxnId(expandedTxnId === txn.id ? null : txn.id)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer select-none"
                      >
                        <td className="p-4">
                          <span className="text-xs font-black text-gray-900">{txn.displayId || txn.id}</span>
                        </td>
                        <td className="p-4">
                          <span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-gray-100 text-gray-600">
                            {txn.source === 'bar' ? 'Bar' : txn.source === 'conference1' ? 'Conf 1' : txn.source === 'conference2' ? 'Conf 2' : txn.source === 'pdr' ? 'PDR' : txn.source === 'gobox' ? 'GoBox' : txn.source === 'r-parcel' ? 'GoBox' : txn.source}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-black text-gray-700">{txn.tableNumber || '—'}</span>
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-bold text-gray-500 uppercase">{txn.captainName}</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                            txn.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            txn.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                            txn.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                            txn.status === 'FAILED' ? 'bg-gray-200 text-gray-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {txn.status === 'COMPLETED' ? 'Done' : txn.status === 'PENDING' ? 'Pending' : txn.status === 'CANCELLED' ? 'Cancelled' : txn.status === 'FAILED' ? 'Failed' : txn.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${txn.method === 'CASH' ? 'bg-green-100 text-green-700' : txn.method === 'UPI' ? 'bg-blue-100 text-blue-700' : txn.method === 'CARD' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                            {txn.method}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-black text-gray-900">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(2)}</span>
                          <span className="block text-xs text-gray-400 font-bold">{txn.items} items</span>
                        </td>
                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {txn.status !== 'COMPLETED' && (
                              <button
                                onClick={() => handleConfirmPayment(txn, 'CASH')}
                                disabled={confirmingId === txn.id}
                                title="Confirm payment"
                                className="p-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                            {revealedTxnId === txn.id ? (
                              <button
                                onClick={() => handleConfirmDelete(txn)}
                                disabled={deleting}
                                title="Delete transaction"
                                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                Delete
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDelete(txn)}
                                disabled={deleting}
                                title="Reveal delete option"
                                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                <Eye size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedTxnId === txn.id && (
                        <tr key={`${txn.id}-detail`} className="bg-gray-50">
                          <td colSpan={8} className="px-6 pb-4 pt-2">
                            {txn.itemsList && txn.itemsList.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Order Items</p>
                                {txn.itemsList.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center bg-white rounded-xl px-4 py-2.5 border border-gray-100">
                                    <span className="text-xs font-bold text-gray-700">{item.name || item.n} × {item.quantity || item.q}</span>
                                    <span className="text-xs font-black text-gray-900">₹{Number((item.price || item.p || 0) * (item.quantity || item.q || 1)).toFixed(2)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between items-center px-4 pt-2 border-t border-gray-200 mt-2">
                                  <span className="text-xs font-black uppercase text-gray-500">Total</span>
                                  <span className="text-sm font-black text-[#E53935]">₹{Number(txn.grandTotal ?? txn.amount ?? 0).toFixed(2)}</span>
                                </div>
                                {Number(txn.tipAmount ?? 0) > 0 && (
                                <div className="flex justify-between items-center px-4 pt-2 border-t border-gray-200">
                                  <span className="text-xs font-black uppercase text-amber-600">Tip</span>
                                  <span className="text-sm font-black text-amber-700">₹{Number(txn.tipAmount).toFixed(2)}</span>
                                </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 py-3">No item details available.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {passwordModalTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-tight text-gray-900">
              {deleteStage === 'verify' ? 'Verify to Reveal Delete' : 'Confirm Transaction Delete'}
            </h3>
            <p className="text-xs text-gray-500">
              {deleteStage === 'verify'
                ? <>Enter your login password to reveal the delete option for <span className="font-bold text-gray-900">{passwordModalTxn.displayId || passwordModalTxn.id}</span>.</>
                : <>Enter your login password again to permanently delete <span className="font-bold text-gray-900">{passwordModalTxn.displayId || passwordModalTxn.id}</span>. This action cannot be undone.</>}
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={e => { setDeletePassword(e.target.value); setPasswordError(''); }}
              placeholder={deleteStage === 'verify' ? 'Your password' : 'Confirm your password'}
              autoComplete="current-password"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#E53935]"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') submitDeletePassword(); }}
            />
            {passwordError && (
              <p className="text-xs font-bold text-red-600">{passwordError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setPasswordModalTxn(null); setDeletePassword(''); setPasswordError(''); }}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitDeletePassword}
                disabled={!deletePassword || deleting}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
