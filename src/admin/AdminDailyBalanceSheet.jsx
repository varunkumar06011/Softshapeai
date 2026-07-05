import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Store, Loader2, Lock, Unlock,
  Plus, Minus, Trash2, Save, Send, CheckCircle, TrendingUp, Wallet,
  ArrowRight, Edit3, X,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { useAuth } from '../context/AuthContext';

// ── Pure client-side calculation (mirrors backend calculateRunningBalance) ────
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calculateBalance(openingBalance, sales, totalVouchers, adjustments) {
  const ob = round2(openingBalance);
  const totalSales = round2(sales.acBar) + round2(sales.nonAcBar) + round2(sales.familyWing) + round2(sales.parcel) + round2(sales.swiggy) + round2(sales.zomato);
  const afterSales = round2(ob + totalSales);
  const afterVouchers = round2(afterSales - totalVouchers);

  const sorted = [...adjustments].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const steps = [
    { label: 'Opening Balance', value: ob },
    { label: '+ Total Sales', value: afterSales },
    { label: '- Vouchers', value: afterVouchers },
  ];

  let running = afterVouchers;
  for (const adj of sorted) {
    const amt = round2(Number(adj.amount) || 0);
    if (adj.sign === 'PLUS') running = round2(running + amt);
    else running = round2(running - amt);
    steps.push({ label: `${adj.sign === 'PLUS' ? '+' : '−'} ${adj.label}`, value: running });
  }

  return { openingBalance: ob, afterSales, afterVouchers, closingBalance: running, steps };
}

// ── Helper: get today's date in IST ───────────────────────────────────────────
function getTodayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Sales Tile component ─────────────────────────────────────────────────────
function SalesTile({ label, computedValue, overrideValue, isManual, isLocked, onChange }) {
  const [localValue, setLocalValue] = useState('');
  const isAuto = !isManual && computedValue != null;

  useEffect(() => {
    if (isManual) {
      setLocalValue(overrideValue != null ? String(overrideValue) : '');
    } else {
      setLocalValue(computedValue != null ? String(computedValue) : '');
    }
  }, [computedValue, overrideValue, isManual]);

  const hasOverride = isManual && overrideValue != null && overrideValue !== '';

  const handleBlur = () => {
    if (isLocked) return;
    const numVal = localValue === '' ? null : Number(localValue);
    if (isManual) {
      onChange(numVal);
    } else {
      // For auto tiles: if user typed something different from computed, it becomes an override
      if (numVal != null && numVal !== round2(Number(computedValue) || 0)) {
        onChange(numVal);
      } else if (numVal == null) {
        onChange(null);
      }
    }
  };

  return (
    <div className={`rounded-xl border p-3 ${hasOverride ? 'border-blue-300 bg-blue-50' : isAuto ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-gray-600">{label}</span>
        {isAuto && !hasOverride && (
          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">AUTO</span>
        )}
        {hasOverride && (
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">OVERRIDE</span>
        )}
      </div>
      <input
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        disabled={isLocked}
        placeholder={isAuto ? String(computedValue || 0) : '0'}
        className={`w-full bg-transparent text-lg font-black text-gray-900 outline-none ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
      />
    </div>
  );
}

// ── Adjustment Pill component ────────────────────────────────────────────────
function AdjustmentPill({ adj, isLocked, onEdit, onDelete, onDragStart, onDragOver, onDrop }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(adj.label);
  const [amount, setAmount] = useState(String(adj.amount));
  const [sign, setSign] = useState(adj.sign);

  useEffect(() => {
    setLabel(adj.label);
    setAmount(String(adj.amount));
    setSign(adj.sign);
  }, [adj]);

  const handleSave = () => {
    onEdit({ ...adj, label: label.trim(), amount: Number(amount) || 0, sign });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 p-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm outline-none"
          placeholder="Label"
        />
        <button
          onClick={() => setSign(sign === 'PLUS' ? 'MINUS' : 'PLUS')}
          className={`rounded px-2 py-1 text-sm font-bold ${sign === 'PLUS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
        >
          {sign === 'PLUS' ? '+' : '−'}
        </button>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm outline-none"
        />
        <button onClick={handleSave} className="rounded bg-[#E53935] p-1 text-white hover:bg-[#C62828]">
          <CheckCircle size={16} />
        </button>
        <button onClick={() => setEditing(false)} className="rounded bg-gray-200 p-1 text-gray-600 hover:bg-gray-300">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      draggable={!isLocked}
      onDragStart={() => onDragStart(adj)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(adj)}
      className={`flex items-center gap-2 rounded-lg border p-2 ${adj.sign === 'PLUS' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'} ${isLocked ? 'cursor-default' : 'cursor-move'}`}
    >
      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${adj.sign === 'PLUS' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
        {adj.sign === 'PLUS' ? '+' : '−'}
      </div>
      <div className="flex-1">
        <div className="text-sm font-bold text-gray-800">{adj.label}</div>
        <div className="text-xs text-gray-500">₹{Number(adj.amount).toLocaleString('en-IN')}</div>
      </div>
      {!isLocked && (
        <>
          <button onClick={() => setEditing(true)} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700">
            <Edit3 size={14} />
          </button>
          <button onClick={() => onDelete(adj)} className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600">
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AdminDailyBalanceSheet() {
  const { restaurant, user } = useAuth();
  const today = getTodayIST();
  const [selectedDate, setSelectedDate] = useState(today);
  const [outletId, setOutletId] = useState('all');
  const [sheet, setSheet] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showAddAdj, setShowAddAdj] = useState(false);
  const [newAdj, setNewAdj] = useState({ label: '', amount: '', sign: 'MINUS' });
  const [statusLoading, setStatusLoading] = useState(false);
  const saveTimerRef = useRef(null);
  const dragItemRef = useRef(null);

  const accessibleOutlets = useMemo(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);

  const isLocked = sheet?.status === 'LOCKED';
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  // ── Load balance sheet ─────────────────────────────────────────────────────
  const loadSheet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletId !== 'all') params.set('outletId', outletId);
      const data = await apiFetch(`/api/balance-sheet/${selectedDate}?${params.toString()}`);
      setSheet(data);
    } catch (err) {
      setError(err.message || 'Failed to load balance sheet');
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, outletId]);

  // ── Load vouchers for the date ─────────────────────────────────────────────
  const loadVouchers = useCallback(async () => {
    setVouchersLoading(true);
    try {
      const data = await apiFetch(`/api/vouchers?date=${selectedDate}&limit=500`);
      setVouchers(data || []);
    } catch {
      setVouchers([]);
    } finally {
      setVouchersLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { loadSheet(); }, [loadSheet]);
  useEffect(() => { loadVouchers(); }, [loadVouchers]);

  // ── Local state mirrors for editable fields ────────────────────────────────
  const [overrides, setOverrides] = useState({
    openingBalance: 0,
    acBarSaleOverride: null,
    nonAcBarSaleOverride: null,
    familyWingSaleOverride: null,
    parcelSaleOverride: null,
    swiggySale: null,
    zomatoSale: null,
  });
  const [adjustments, setAdjustments] = useState([]);

  useEffect(() => {
    if (sheet) {
      setOverrides({
        openingBalance: Number(sheet.openingBalance) || 0,
        acBarSaleOverride: sheet.acBarSaleOverride != null ? Number(sheet.acBarSaleOverride) : null,
        nonAcBarSaleOverride: sheet.nonAcBarSaleOverride != null ? Number(sheet.nonAcBarSaleOverride) : null,
        familyWingSaleOverride: sheet.familyWingSaleOverride != null ? Number(sheet.familyWingSaleOverride) : null,
        parcelSaleOverride: sheet.parcelSaleOverride != null ? Number(sheet.parcelSaleOverride) : null,
        swiggySale: sheet.swiggySale != null ? Number(sheet.swiggySale) : null,
        zomatoSale: sheet.zomatoSale != null ? Number(sheet.zomatoSale) : null,
      });
      setAdjustments(sheet.adjustments || []);
    }
  }, [sheet]);

  // ── Computed sales values (from the sheet, frozen if saved) ────────────────
  const computedSales = {
    acBar: overrides.acBarSaleOverride != null ? overrides.acBarSaleOverride : Number(sheet?.acBarSaleComputed) || 0,
    nonAcBar: overrides.nonAcBarSaleOverride != null ? overrides.nonAcBarSaleOverride : Number(sheet?.nonAcBarSaleComputed) || 0,
    familyWing: overrides.familyWingSaleOverride != null ? overrides.familyWingSaleOverride : Number(sheet?.familyWingSaleComputed) || 0,
    parcel: overrides.parcelSaleOverride != null ? overrides.parcelSaleOverride : Number(sheet?.parcelSaleComputed) || 0,
    swiggy: overrides.swiggySale || 0,
    zomato: overrides.zomatoSale || 0,
  };

  const totalVouchers = Number(sheet?.totalVouchers) || 0;

  // ── Live balance calculation ───────────────────────────────────────────────
  const balanceCalc = useMemo(() => {
    return calculateBalance(overrides.openingBalance, computedSales, totalVouchers, adjustments);
  }, [overrides, computedSales, totalVouchers, adjustments]);

  // ── Debounced autosave ─────────────────────────────────────────────────────
  const triggerSave = useCallback(() => {
    if (isLocked || !sheet) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const body = {
          openingBalance: overrides.openingBalance,
          acBarSaleOverride: overrides.acBarSaleOverride,
          nonAcBarSaleOverride: overrides.nonAcBarSaleOverride,
          familyWingSaleOverride: overrides.familyWingSaleOverride,
          parcelSaleOverride: overrides.parcelSaleOverride,
          swiggySale: overrides.swiggySale,
          zomatoSale: overrides.zomatoSale,
          adjustments: adjustments.map((a, i) => ({
            label: a.label,
            amount: Number(a.amount),
            sign: a.sign,
            sortOrder: a.sortOrder ?? i,
          })),
        };
        const updated = await apiFetch(`/api/balance-sheet/${selectedDate}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        setSheet(updated);
      } catch (err) {
        console.error('[BalanceSheet] Save failed:', err);
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [isLocked, sheet, overrides, adjustments, selectedDate]);

  const handleFieldChange = (field, value) => {
    setOverrides((prev) => ({ ...prev, [field]: value }));
    triggerSave();
  };

  // ── Adjustment handlers ────────────────────────────────────────────────────
  const handleAddAdjustment = async () => {
    if (!newAdj.label.trim() || !newAdj.amount) return;
    const adj = {
      id: `temp-${Date.now()}`,
      label: newAdj.label.trim(),
      amount: Number(newAdj.amount),
      sign: newAdj.sign,
      sortOrder: adjustments.length,
    };
    const updated = [...adjustments, adj];
    setAdjustments(updated);
    setNewAdj({ label: '', amount: '', sign: 'MINUS' });
    setShowAddAdj(false);
    triggerSave();
  };

  const handleEditAdjustment = (updated) => {
    setAdjustments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    triggerSave();
  };

  const handleDeleteAdjustment = (adj) => {
    setAdjustments((prev) => prev.filter((a) => a.id !== adj.id));
    triggerSave();
  };

  // ── Drag reorder ───────────────────────────────────────────────────────────
  const handleDragStart = (item) => { dragItemRef.current = item; };
  const handleDrop = (target) => {
    const dragged = dragItemRef.current;
    if (!dragged || dragged.id === target.id) return;
    const reordered = [...adjustments];
    const dragIdx = reordered.findIndex((a) => a.id === dragged.id);
    const targetIdx = reordered.findIndex((a) => a.id === target.id);
    if (dragIdx === -1 || targetIdx === -1) return;
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const reindexed = reordered.map((a, i) => ({ ...a, sortOrder: i }));
    setAdjustments(reindexed);
    dragItemRef.current = null;
    triggerSave();
  };

  // ── Status transitions ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setStatusLoading(true);
    try {
      const updated = await apiFetch(`/api/balance-sheet/${selectedDate}/submit`, { method: 'POST' });
      setSheet(updated);
    } catch (err) { setError(err.message); }
    finally { setStatusLoading(false); }
  };

  const handleLock = async () => {
    if (!confirm('Lock this balance sheet? It cannot be edited after locking.')) return;
    setStatusLoading(true);
    try {
      const updated = await apiFetch(`/api/balance-sheet/${selectedDate}/lock`, { method: 'POST' });
      setSheet(updated);
    } catch (err) { setError(err.message); }
    finally { setStatusLoading(false); }
  };

  const handleUnlock = async () => {
    if (!confirm('Unlock this balance sheet? It will become editable again.')) return;
    setStatusLoading(true);
    try {
      const updated = await apiFetch(`/api/balance-sheet/${selectedDate}/unlock`, { method: 'POST' });
      setSheet(updated);
    } catch (err) { setError(err.message); }
    finally { setStatusLoading(false); }
  };

  // ── Voucher grouping ───────────────────────────────────────────────────────
  const voucherGroups = useMemo(() => {
    const groups = {};
    for (const v of vouchers) {
      if (v.status === 'VOIDED') continue;
      const cat = v.category || v.paidToType || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(v);
    }
    return groups;
  }, [vouchers]);

  const voucherSubtotal = useMemo(() => {
    return vouchers.filter((v) => v.status !== 'VOIDED').reduce((sum, v) => sum + Number(v.amount), 0);
  }, [vouchers]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-[#E53935]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      {/* ── Header: Date navigator + outlet selector ─────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="relative">
            <Calendar size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={today}
              className="rounded-lg border border-gray-200 pl-8 pr-2 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
            />
          </div>
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            disabled={selectedDate >= today}
            className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
          {selectedDate === today && (
            <span className="rounded-full bg-[#FFEBEE] px-2 py-0.5 text-[10px] font-bold text-[#B71C1C]">TODAY</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {accessibleOutlets.length > 1 && (
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
            >
              <option value="all">All Outlets</option>
              {accessibleOutlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          {saving && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Loader2 size={12} className="animate-spin" /> Saving...
            </span>
          )}
        </div>
      </div>

      {/* ── Status badge ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${
          sheet?.status === 'LOCKED' ? 'bg-gray-800 text-white' :
          sheet?.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          {sheet?.status || 'DRAFT'}
        </span>
        {isLocked && (
          <span className="flex items-center gap-1 text-xs font-bold text-gray-600">
            <Lock size={12} /> Locked
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Sales tiles ───────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-black text-gray-800 mb-2">Venue Sales</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SalesTile
            label="AC Bar"
            computedValue={Number(sheet?.acBarSaleComputed) || 0}
            overrideValue={overrides.acBarSaleOverride}
            isManual={overrides.acBarSaleOverride != null}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('acBarSaleOverride', v)}
          />
          <SalesTile
            label="Non-AC Bar"
            computedValue={Number(sheet?.nonAcBarSaleComputed) || 0}
            overrideValue={overrides.nonAcBarSaleOverride}
            isManual={overrides.nonAcBarSaleOverride != null}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('nonAcBarSaleOverride', v)}
          />
          <SalesTile
            label="Family Wing"
            computedValue={Number(sheet?.familyWingSaleComputed) || 0}
            overrideValue={overrides.familyWingSaleOverride}
            isManual={overrides.familyWingSaleOverride != null}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('familyWingSaleOverride', v)}
          />
          <SalesTile
            label="Parcel"
            computedValue={Number(sheet?.parcelSaleComputed) || 0}
            overrideValue={overrides.parcelSaleOverride}
            isManual={overrides.parcelSaleOverride != null}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('parcelSaleOverride', v)}
          />
          <SalesTile
            label="Swiggy"
            computedValue={null}
            overrideValue={overrides.swiggySale}
            isManual={true}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('swiggySale', v)}
          />
          <SalesTile
            label="Zomato"
            computedValue={null}
            overrideValue={overrides.zomatoSale}
            isManual={true}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('zomatoSale', v)}
          />
        </div>
      </div>

      {/* ── Opening balance ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-600">Opening Balance</span>
          <input
            type="number"
            value={overrides.openingBalance}
            onChange={(e) => handleFieldChange('openingBalance', Number(e.target.value) || 0)}
            disabled={isLocked}
            className="text-right text-lg font-black text-gray-900 bg-transparent outline-none w-32 disabled:opacity-60"
          />
        </div>
      </div>

      {/* ── Vouchers section ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-black text-gray-800">Vouchers</h3>
          <span className="text-sm font-bold text-gray-500">
            Total: ₹{voucherSubtotal.toLocaleString('en-IN')}
          </span>
        </div>
        {vouchersLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" /> Loading vouchers...
          </div>
        ) : Object.keys(voucherGroups).length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
            No vouchers for this date
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(voucherGroups).map(([cat, vlist]) => (
              <div key={cat} className="rounded-lg border border-gray-200 p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-gray-600">{cat}</span>
                  <span className="text-xs font-bold text-gray-500">
                    ₹{vlist.reduce((s, v) => s + Number(v.amount), 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="space-y-1">
                  {vlist.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-xs text-gray-600">
                      <span>{v.voucherNo}. {v.paidToName}</span>
                      <span>₹{Number(v.amount).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Adjustments section ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-black text-gray-800">Adjustments</h3>
          {!isLocked && (
            <button
              onClick={() => setShowAddAdj(!showAddAdj)}
              className="flex items-center gap-1 rounded-lg bg-[#FFEBEE] px-2 py-1 text-xs font-bold text-[#B71C1C] hover:bg-[#FFCDD2]"
            >
              <Plus size={14} /> Add
            </button>
          )}
        </div>

        {showAddAdj && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 p-2">
            <input
              type="text"
              value={newAdj.label}
              onChange={(e) => setNewAdj({ ...newAdj, label: e.target.value })}
              placeholder="Label (e.g. Daily expenses)"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm outline-none"
            />
            <button
              onClick={() => setNewAdj({ ...newAdj, sign: newAdj.sign === 'PLUS' ? 'MINUS' : 'PLUS' })}
              className={`rounded px-2 py-1 text-sm font-bold ${newAdj.sign === 'PLUS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
            >
              {newAdj.sign === 'PLUS' ? '+' : '−'}
            </button>
            <input
              type="number"
              value={newAdj.amount}
              onChange={(e) => setNewAdj({ ...newAdj, amount: e.target.value })}
              placeholder="Amount"
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm outline-none"
            />
            <button onClick={handleAddAdjustment} className="rounded bg-[#E53935] px-3 py-1 text-sm font-bold text-white hover:bg-[#C62828]">
              Add
            </button>
            <button onClick={() => setShowAddAdj(false)} className="rounded bg-gray-200 px-2 py-1 text-sm text-gray-600">
              Cancel
            </button>
          </div>
        )}

        <div className="space-y-2">
          {adjustments.length === 0 && !showAddAdj && (
            <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-sm text-gray-400">
              No adjustments
            </div>
          )}
          {adjustments.map((adj) => (
            <AdjustmentPill
              key={adj.id}
              adj={adj}
              isLocked={isLocked}
              onEdit={handleEditAdjustment}
              onDelete={handleDeleteAdjustment}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          ))}
        </div>
      </div>

      {/* ── Running total strip ───────────────────────────────────────────── */}
      <div className="rounded-xl bg-gray-900 p-4">
        <div className="space-y-1">
          {balanceCalc.steps.map((step, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className={`font-bold ${i === 0 ? 'text-gray-300' : 'text-gray-400'}`}>{step.label}</span>
              <span className={`font-black ${i === balanceCalc.steps.length - 1 ? 'text-white text-lg' : 'text-gray-200'}`}>
                ₹{Number(step.value).toLocaleString('en-IN')}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-gray-700 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-300">Closing Balance</span>
            <span className="text-2xl font-black text-white">
              ₹{Number(balanceCalc.closingBalance).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {isLocked ? (
          isAdmin && (
            <button
              onClick={handleUnlock}
              disabled={statusLoading}
              className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
            >
              {statusLoading ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
              Unlock to Edit
            </button>
          )
        ) : (
          <>
            <button
              onClick={handleSubmit}
              disabled={statusLoading || sheet?.status === 'SUBMITTED'}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {statusLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {sheet?.status === 'SUBMITTED' ? 'Submitted' : 'Submit'}
            </button>
            {isAdmin && sheet?.status === 'SUBMITTED' && (
              <button
                onClick={handleLock}
                disabled={statusLoading}
                className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
              >
                {statusLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                Lock
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
