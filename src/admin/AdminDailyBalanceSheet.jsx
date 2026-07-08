import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Store, Loader2, Lock, Unlock,
  Plus, Minus, Trash2, Save, Send, CheckCircle, TrendingUp, Wallet,
  ArrowRight, Edit3, X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { apiFetch } from '../services/apiConfig';
import { useAuth } from '../context/AuthContext';

// ── Pure client-side calculation (mirrors backend calculateRunningBalance) ────
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calculateBalance(openingBalance, sales, totalExpenditures, adjustments) {
  const ob = round2(openingBalance);
  
  // Cash sales (in-hand cash)
  const cashSales = round2(sales.acBar) + round2(sales.nonAcBar) + round2(sales.familyWing) + round2(sales.parcel);
  
  // Aggregator sales (settled later, not cash-in-hand)
  const swiggy = round2(sales.swiggy);
  const zomato = round2(sales.zomato);
  const aggregatorSales = round2(swiggy + zomato);
  
  // Total sales for display (includes aggregators)
  const totalSales = round2(cashSales + aggregatorSales);

  // Step-by-step calculation:
  // 1. Opening Balance + Total Sales
  const afterTotalSales = round2(ob + totalSales);
  // 2. Minus Aggregator Sales (Swiggy + Zomato)
  const afterAggregatorDeduction = round2(afterTotalSales - aggregatorSales);
  // 3. Minus Expenditures
  const afterExpenditures = round2(afterAggregatorDeduction - totalExpenditures);

  const sorted = [...adjustments].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const steps = [
    { label: 'Opening Balance', value: ob },
    { label: `+ Total Sales (₹${totalSales.toLocaleString('en-IN')})`, value: afterTotalSales },
    { label: `- Swiggy + Zomato (₹${aggregatorSales.toLocaleString('en-IN')})`, value: afterAggregatorDeduction },
    { label: `- Expenditures (₹${totalExpenditures.toLocaleString('en-IN')})`, value: afterExpenditures },
  ];

  let running = afterExpenditures;
  for (const adj of sorted) {
    const amt = round2(Number(adj.amount) || 0);
    if (adj.sign === 'PLUS') running = round2(running + amt);
    else running = round2(running - amt);
    steps.push({ label: `${adj.sign === 'PLUS' ? '+' : '−'} ${adj.label} (₹${amt.toLocaleString('en-IN')})`, value: running });
  }

  return { afterSales: afterAggregatorDeduction, afterExpenditures, closingBalance: running, steps };
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

function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.955L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

async function loadImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load image: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function shareOrDownloadPDF(blob, filename) {
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

  if (isNative) {
    // Capacitor native app: write PDF to cache and open native share dialog
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    const fileUri = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });
    await Share.share({
      title: 'Daily Balance Sheet',
      text: `Daily Balance Sheet Report - ${filename}`,
      url: fileUri.uri,
      dialogTitle: 'Share via',
    });
    return;
  }

  // Web / PWA fallback: trigger browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
    let numVal = localValue === '' ? null : Number(localValue);
    if (numVal != null && numVal < 0) numVal = 0; // no negative sales
    if (isManual) {
      // Manual fields stay manual; empty means 0
      onChange(numVal ?? 0);
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
        {isManual && !hasOverride && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-600">MANUAL</span>
        )}
        {hasOverride && (
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">OVERRIDE</span>
        )}
      </div>
      <input
        type="number"
        min="0"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
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
          min="0"
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
  const [today, setToday] = useState(getTodayIST);
  const [selectedDate, setSelectedDate] = useState(today);
  const [outletId, setOutletId] = useState('all');

  // Refresh "today" periodically so the next-day arrow stays accurate in long-lived sessions
  useEffect(() => {
    setToday(getTodayIST());
    const timer = setInterval(() => setToday(getTodayIST()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  const [sheet, setSheet] = useState(null);
  const [expenditures, setExpenditures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expendituresLoading, setExpendituresLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showAddAdj, setShowAddAdj] = useState(false);
  const [newAdj, setNewAdj] = useState({ label: '', amount: '', sign: 'MINUS' });
  const [statusLoading, setStatusLoading] = useState(false);
  const [logoBase64, setLogoBase64] = useState(null);
  const saveTimerRef = useRef(null);
  const dragItemRef = useRef(null);
  const saveSeqRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);

  // Preload logo for PDF branding
  useEffect(() => {
    loadImageAsBase64('/logo softshape.ai.png')
      .then((data) => setLogoBase64(data))
      .catch(() => setLogoBase64(null));
  }, []);

  const accessibleOutlets = useMemo(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);

  const isLocked = sheet?.status === 'LOCKED';
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const isAllOutlets = outletId === 'all' && accessibleOutlets.length > 1;

  // VGrand admin: replace Submit with "Send to WhatsApp" (PDF share)
  const isVGrand = useMemo(() => {
    const name = (restaurant?.name || '').toLowerCase();
    return name.includes('vgrand') || name.includes('v-grand') || name.includes('vgrand lounge');
  }, [restaurant?.name]);

  const ADMIN_WHATSAPP_NUMBER = '919550237788';

  const ADJUSTMENT_PRESETS = [
    { label: 'Daily Expenses', sign: 'MINUS' },
    { label: 'Cash Shortage', sign: 'MINUS' },
    { label: 'Cash Excess', sign: 'PLUS' },
    { label: 'Miscellaneous Income', sign: 'PLUS' },
    { label: 'Salary Advance', sign: 'MINUS' },
  ];

  // ── Load balance sheet ─────────────────────────────────────────────────────
  const loadSheet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('outletId', outletId);
      const data = await apiFetch(`/api/balance-sheet/${selectedDate}?${params.toString()}`);
      setSheet(data);
    } catch (err) {
      setError(err.message || 'Failed to load balance sheet');
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, outletId]);

  // ── Load expenditures for the date ─────────────────────────────────────────
  const loadExpenditures = useCallback(async () => {
    setExpendituresLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate, limit: '500', outletId });
      const data = await apiFetch(`/api/expenditures?${params.toString()}`);
      setExpenditures(data || []);
    } catch {
      setExpenditures([]);
    } finally {
      setExpendituresLoading(false);
    }
  }, [selectedDate, outletId]);

  useEffect(() => { loadSheet(); }, [loadSheet]);
  useEffect(() => { loadExpenditures(); }, [loadExpenditures]);

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
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!sheet) return;

    // Detect whether this sheet update came from our own save response
    const isSaveResponse = sheet.__saveSeq !== undefined;
    // Ignore stale save responses (a newer save was issued before this one resolved)
    if (isSaveResponse && sheet.__saveSeq < saveSeqRef.current) {
      return;
    }
    lastAppliedSeqRef.current = saveSeqRef.current;

    setOverrides({
      openingBalance: Number(sheet.openingBalance) || 0,
      acBarSaleOverride: sheet.acBarSaleOverride != null ? Number(sheet.acBarSaleOverride) : null,
      nonAcBarSaleOverride: sheet.nonAcBarSaleOverride != null ? Number(sheet.nonAcBarSaleOverride) : 0,
      familyWingSaleOverride: sheet.familyWingSaleOverride != null ? Number(sheet.familyWingSaleOverride) : null,
      parcelSaleOverride: sheet.parcelSaleOverride != null ? Number(sheet.parcelSaleOverride) : 0,
      swiggySale: sheet.swiggySale != null ? Number(sheet.swiggySale) : 0,
      zomatoSale: sheet.zomatoSale != null ? Number(sheet.zomatoSale) : 0,
    });
    // Only overwrite local adjustments from server data on fresh fetches
    // (date change, initial load, external refresh) — not from our own save echoes.
    if (!isSaveResponse) {
      setAdjustments(sheet.adjustments || []);
      setDirty(false);
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

  const totalSales = round2(
    computedSales.acBar +
    computedSales.nonAcBar +
    computedSales.familyWing +
    computedSales.parcel +
    computedSales.swiggy +
    computedSales.zomato
  );

  const totalExpenditures = Number(sheet?.totalExpenditures) || 0;

  // ── Live balance calculation ───────────────────────────────────────────────
  const balanceCalc = useMemo(() => {
    return calculateBalance(overrides.openingBalance, computedSales, totalExpenditures, adjustments);
  }, [overrides.openingBalance, computedSales, totalExpenditures, adjustments]);

  // ── Manual save ────────────────────────────────────────────────────────────
  const doSave = useCallback(async () => {
    if (isLocked || !sheet) return;
    setSaving(true);
    const thisSeq = ++saveSeqRef.current;
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
        expectedUpdatedAt: sheet?.updatedAt,
      };
      const updated = await apiFetch(`/api/balance-sheet/${selectedDate}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      // Only apply if no newer save has been issued since this one started
      if (thisSeq === saveSeqRef.current) {
        if (outletId === 'all') {
          // All-Outlets view is an aggregate; the backend saves against the active outlet,
          // so reload the aggregate to keep the view consistent.
          await loadSheet();
        } else {
          setSheet({ ...updated, __saveSeq: thisSeq });
        }
        setDirty(false);
      }
    } catch (err) {
      console.error('[BalanceSheet] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [isLocked, sheet, overrides, adjustments, selectedDate, outletId, loadSheet]);

  const handleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    doSave();
  };

  const handleFieldChange = (field, value) => {
    setOverrides((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  // ── Adjustment handlers ────────────────────────────────────────────────────
  const handleAddAdjustment = () => {
    if (!newAdj.label.trim() || !newAdj.amount) return;
    const adj = {
      id: `temp-${Date.now()}`,
      label: newAdj.label.trim(),
      amount: Math.max(0, Number(newAdj.amount)),
      sign: newAdj.sign,
      sortOrder: adjustments.length,
    };
    const updated = [...adjustments, adj];
    setAdjustments(updated);
    setNewAdj({ label: '', amount: '', sign: 'MINUS' });
    setShowAddAdj(false);
    setDirty(true);
  };

  const applyAdjustmentPreset = (preset) => {
    setNewAdj({ label: preset.label, amount: '', sign: preset.sign });
    setShowAddAdj(true);
  };

  const handleEditAdjustment = (updated) => {
    const safe = { ...updated, amount: Math.max(0, Number(updated.amount)) };
    const next = adjustments.map((a) => (a.id === safe.id ? safe : a));
    setAdjustments(next);
    setDirty(true);
  };

  const handleDeleteAdjustment = (adj) => {
    const next = adjustments.filter((a) => a.id !== adj.id);
    setAdjustments(next);
    setDirty(true);
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
    setDirty(true);
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

  // ── Expenditure grouping ──────────────────────────────────────────────────
  const expenditureGroups = useMemo(() => {
    const groups = {};
    for (const v of expenditures) {
      if (v.status === 'VOIDED') continue;
      const cat = v.category || v.paidToType || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(v);
    }
    return groups;
  }, [expenditures]);

  const expenditureSubtotal = useMemo(() => {
    return expenditures.filter((v) => v.status !== 'VOIDED').reduce((sum, v) => sum + Number(v.amount), 0);
  }, [expenditures]);

  // ── Generate PDF in admin panel theme ────────────────────────────────────────
  const generateBalanceSheetPDF = useCallback((logoDataUrl) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const primary = [229, 57, 53]; // #E53935
    const dark = [17, 24, 39]; // #111827

    // Logo (centered at top, 100mm x 40mm)
    if (logoDataUrl) {
      const logoWidth = 100;
      const logoHeight = 40;
      const logoX = (pageWidth - logoWidth) / 2;
      try {
        doc.addImage(logoDataUrl, 'PNG', logoX, 10, logoWidth, logoHeight);
      } catch {
        // Logo failed to embed; continue without it
      }
    }

    // Header bar
    doc.setFillColor(...primary);
    doc.rect(0, 56, pageWidth, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Daily Balance Sheet', margin, 72);

    // Meta
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const outletName = accessibleOutlets.find((o) => o.id === outletId)?.name || restaurant?.name || 'Unknown Outlet';
    doc.text(`Outlet: ${outletName}`, margin, 88);
    doc.text(`Date: ${selectedDate}`, margin, 94);
    doc.text(`Status: ${sheet?.status || 'DRAFT'}`, margin, 100);

    let y = 108;

    // Venue Sales
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...dark);
    doc.text('Venue Sales', margin, y);
    y += 6;

    const salesRows = [
      ['Lounge Sales', `₹${computedSales.acBar.toLocaleString('en-IN')}`],
      ['Non-AC Bar', `₹${computedSales.nonAcBar.toLocaleString('en-IN')}`],
      ['Family', `₹${computedSales.familyWing.toLocaleString('en-IN')}`],
      ['Parcel Counter', `₹${computedSales.parcel.toLocaleString('en-IN')}`],
      ['Swiggy', `₹${computedSales.swiggy.toLocaleString('en-IN')}`],
      ['Zomato', `₹${computedSales.zomato.toLocaleString('en-IN')}`],
    ];

    doc.autoTable({
      startY: y,
      head: [['Venue', 'Amount']],
      body: salesRows,
      theme: 'grid',
      headStyles: { fillColor: primary, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 2 },
      margin: { left: margin, right: margin },
    });
    y = (doc.lastAutoTable?.finalY || y) + 8;

    // Expenditures
    if (expenditures.length > 0) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Expenditures', margin, y);
      y += 6;

      const expenditureRows = Object.entries(expenditureGroups).map(([cat, vlist]) => [
        cat,
        `₹${vlist.reduce((s, v) => s + Number(v.amount), 0).toLocaleString('en-IN')}`,
      ]);
      doc.autoTable({
        startY: y,
        head: [['Category', 'Amount']],
        body: expenditureRows,
        theme: 'grid',
        headStyles: { fillColor: primary, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 2 },
        margin: { left: margin, right: margin },
      });
      y = (doc.lastAutoTable?.finalY || y) + 8;
    }

    // Adjustments
    if (adjustments.length > 0) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Adjustments', margin, y);
      y += 6;

      const adjustmentRows = adjustments.map((a) => [
        `${a.sign === 'PLUS' ? '+' : '-'} ${a.label}`,
        `₹${Number(a.amount).toLocaleString('en-IN')}`,
      ]);

      doc.autoTable({
        startY: y,
        head: [['Description', 'Amount']],
        body: adjustmentRows,
        theme: 'grid',
        headStyles: { fillColor: primary, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 2 },
        margin: { left: margin, right: margin },
      });
      y = (doc.lastAutoTable?.finalY || y) + 8;
    }

    // Closing Balance bar
    doc.setFillColor(...dark);
    doc.rect(margin, y, pageWidth - margin * 2, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Closing Balance', margin + 4, y + 9);
    doc.text(`₹${balanceCalc.closingBalance.toLocaleString('en-IN')}`, pageWidth - margin - 4, y + 9, { align: 'right' });

    // Footer — right after closing balance
    y += 22;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Softshape AI — Software that shapes your business from Day 1.', margin, y);
    doc.setTextColor(120);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Softshape AI can make mistakes. Please cross-check important information before relying on it.', margin, y + 5);

    return doc;
  }, [restaurant?.name, outletId, accessibleOutlets, selectedDate, sheet?.status, computedSales, expenditures.length, expenditureGroups, adjustments, balanceCalc.closingBalance]);

  // ── WhatsApp share: open chat immediately, then generate PDF ───────────────
  const handleWhatsAppShare = async () => {
    setStatusLoading(true);
    setError(null);
    try {
      const outletName = accessibleOutlets.find((o) => o.id === outletId)?.name || restaurant?.name || 'Unknown Outlet';
      const message = `Daily Balance Sheet Report\nDate: ${selectedDate}\nOutlet: ${outletName}\nClosing Balance: ₹${balanceCalc.closingBalance.toLocaleString('en-IN')}\n\nPDF downloaded. Please attach the downloaded file here.`;
      const whatsappUrl = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
      const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

      // Open WhatsApp first (before async PDF work) so the browser does not block the popup
      if (!isNative) {
        const whatsappWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        if (!whatsappWindow || whatsappWindow.closed || typeof whatsappWindow.closed === 'undefined') {
          setError('WhatsApp was blocked by the browser. Please allow popups for this site, or use the downloaded PDF to share manually.');
        }
      }

      let logoDataUrl = logoBase64;
      if (!logoDataUrl) {
        try {
          logoDataUrl = await loadImageAsBase64('/logo softshape.ai.png');
          setLogoBase64(logoDataUrl);
        } catch {
          logoDataUrl = null;
        }
      }
      const doc = generateBalanceSheetPDF(logoDataUrl);
      const blob = doc.output('blob');
      const filename = `Daily-Balance-Sheet-${selectedDate}.pdf`;

      // Share / download the PDF
      await shareOrDownloadPDF(blob, filename);
    } catch (err) {
      setError(err.message || 'Failed to generate PDF for WhatsApp');
    } finally {
      setStatusLoading(false);
    }
  };

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="relative flex-1">
            <Calendar size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={today}
              className="w-full rounded-lg border border-gray-200 pl-8 pr-2 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
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
          <div className="flex items-center gap-1 ml-1">
            <input
              type="month"
              value={selectedDate.slice(0, 7)}
              onChange={(e) => {
                const ym = e.target.value;
                if (!ym) return;
                const firstOfMonth = ym + '-01';
                const todayIst = getTodayIST();
                if (firstOfMonth > todayIst) return;
                const lastDay = new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(5, 7)), 0).getDate();
                const lastOfMonth = ym + '-' + String(lastDay).padStart(2, '0');
                setSelectedDate(lastOfMonth > todayIst ? todayIst : lastOfMonth);
              }}
              max={today.slice(0, 7)}
              className="rounded-lg border border-gray-200 px-2 py-2 text-xs font-bold outline-none focus:border-[#E53935]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {accessibleOutlets.length > 1 && (
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935] sm:w-auto"
            >
              <option value="all">All Outlets</option>
              {accessibleOutlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          {dirty && !isLocked && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              Unsaved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || isLocked || !dirty}
            className="flex items-center gap-1 rounded-lg bg-[#E53935] px-3 py-2 text-sm font-bold text-white hover:bg-[#C62828] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
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
        {isAllOutlets && (
          <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
            All Outlets
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SalesTile
            label="Lounge Sales"
            computedValue={Number(sheet?.acBarSaleComputed) || 0}
            overrideValue={overrides.acBarSaleOverride}
            isManual={overrides.acBarSaleOverride != null}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('acBarSaleOverride', v)}
          />
          <SalesTile
            label="Non-AC Bar"
            computedValue={null}
            overrideValue={overrides.nonAcBarSaleOverride}
            isManual={true}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('nonAcBarSaleOverride', v)}
          />
          <SalesTile
            label="Family"
            computedValue={Number(sheet?.familyWingSaleComputed) || 0}
            overrideValue={overrides.familyWingSaleOverride}
            isManual={overrides.familyWingSaleOverride != null}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('familyWingSaleOverride', v)}
          />
          <SalesTile
            label="Parcel Counter"
            computedValue={null}
            overrideValue={overrides.parcelSaleOverride}
            isManual={true}
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
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700">Total Sales</span>
            <span className="text-lg font-black text-gray-900">
              ₹{totalSales.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* ── Swiggy + Zomato Deduction Breakdown ────────────────────────────── */}
      <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
        <div className="mb-2">
          <h4 className="text-xs font-bold text-orange-700 uppercase tracking-wider">Aggregator Sales (to be deducted)</h4>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-orange-800">Swiggy</span>
            <span className="font-bold text-orange-900">₹{computedSales.swiggy.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-orange-800">Zomato</span>
            <span className="font-bold text-orange-900">₹{computedSales.zomato.toLocaleString('en-IN')}</span>
          </div>
          <div className="mt-2 pt-2 border-t border-orange-300">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-orange-700">Total Aggregator Sales</span>
              <span className="text-lg font-black text-orange-900">
                ₹{(computedSales.swiggy + computedSales.zomato).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-2 text-xs text-orange-600">
          These sales are settled later by aggregators and not cash-in-hand
        </div>
      </div>

      {/* ── Clear step-by-step calculation breakdown ──────────────────────── */}
      <div className="rounded-xl bg-gray-900 p-4">
        <div className="mb-3">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Balance Calculation</h4>
        </div>
        <div className="space-y-3">
          {balanceCalc.steps.map((step, i) => {
            const isLastStep = i === balanceCalc.steps.length - 1;
            const isClosingBalance = isLastStep;
            const showEquals = i > 0 && (step.label.startsWith('-') || step.label.startsWith('+'));
            
            return (
              <div key={i}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${isClosingBalance ? 'text-white' : 'text-gray-300'}`}>
                    {step.label}
                  </span>
                  <span className={`font-black ${isClosingBalance ? 'text-xl text-white' : 'text-lg text-gray-200'}`}>
                    ₹{Number(step.value).toLocaleString('en-IN')}
                  </span>
                </div>
                {showEquals && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-px bg-gray-600 flex-1" />
                    <span className="text-xs text-gray-500">= Balance after this step</span>
                    <div className="h-px bg-gray-600 flex-1" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t-2 border-gray-700 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-300">Final Closing Balance</span>
            <span className="text-2xl font-black text-green-400">
              ₹{balanceCalc.closingBalance.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Amount left after all deductions
          </div>
        </div>
      </div>

      {/* ── Expenditures section ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-black text-gray-800">Expenditures</h3>
          <span className="text-sm font-bold text-gray-500">
            Total: ₹{expenditureSubtotal.toLocaleString('en-IN')}
          </span>
        </div>
        {expendituresLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" /> Loading expenditures...
          </div>
        ) : Object.keys(expenditureGroups).length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
            No expenditures for this date
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(expenditureGroups).map(([cat, vlist]) => (
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
                      <span>
                        {v.expenditureNo}. {v.paidToName}
                        {v.narration ? ` — ${v.narration}` : ''}
                      </span>
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
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1">
              {ADJUSTMENT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyAdjustmentPreset(preset)}
                  disabled={isLocked}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-[#FFEBEE] hover:text-[#B71C1C] disabled:opacity-40 disabled:cursor-not-allowed"
                  title={isLocked ? 'Unlock sheet to add' : `Add ${preset.label}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddAdj(!showAddAdj)}
              disabled={isLocked}
              className="flex items-center gap-1 rounded-lg bg-[#FFEBEE] px-2 py-1 text-xs font-bold text-[#B71C1C] hover:bg-[#FFCDD2] disabled:opacity-40 disabled:cursor-not-allowed"
              title={isLocked ? 'Unlock sheet to add adjustments' : 'Add adjustment'}
            >
              <Plus size={14} /> Add Adjustment
            </button>
          </div>
        </div>

        {showAddAdj && (
          <div className="mb-2 flex flex-col gap-2 rounded-lg border border-blue-300 bg-blue-50 p-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={newAdj.label}
              onChange={(e) => setNewAdj({ ...newAdj, label: e.target.value })}
              placeholder="Label (e.g. Daily expenses)"
              className="w-full flex-1 rounded border border-gray-300 px-2 py-1 text-sm outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNewAdj({ ...newAdj, sign: newAdj.sign === 'PLUS' ? 'MINUS' : 'PLUS' })}
                className={`rounded px-2 py-1 text-sm font-bold ${newAdj.sign === 'PLUS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {newAdj.sign === 'PLUS' ? '+' : '−'}
              </button>
              <input
                type="number"
                min="0"
                value={newAdj.amount}
                onChange={(e) => setNewAdj({ ...newAdj, amount: e.target.value })}
                placeholder="Amount"
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none sm:w-24"
              />
              <button onClick={handleAddAdjustment} className="rounded bg-[#E53935] px-3 py-1 text-sm font-bold text-white hover:bg-[#C62828]">
                Add
              </button>
              <button onClick={() => setShowAddAdj(false)} className="rounded bg-gray-200 px-2 py-1 text-sm text-gray-600">
                Cancel
              </button>
            </div>
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

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        {isLocked ? (
          isAdmin && (
            <button
              onClick={handleUnlock}
              disabled={statusLoading}
              className="flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
            >
              {statusLoading ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
              Unlock to Edit
            </button>
          )
        ) : (
          <>
            <button
              onClick={handleWhatsAppShare}
              disabled={statusLoading}
              className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {statusLoading ? <Loader2 size={16} className="animate-spin" /> : <WhatsAppIcon size={16} />}
              Send to WhatsApp
            </button>
            {isAdmin && !isVGrand && (
              <button
                onClick={handleSubmit}
                disabled={statusLoading || sheet?.status === 'SUBMITTED'}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {statusLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sheet?.status === 'SUBMITTED' ? 'Submitted' : 'Submit'}
              </button>
            )}
            {isAdmin && sheet?.status === 'SUBMITTED' && (
              <button
                onClick={handleLock}
                disabled={statusLoading}
                className="flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
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
