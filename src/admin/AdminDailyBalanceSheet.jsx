import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Calendar, Store, Loader2, Lock, Unlock,
  Plus, Minus, Trash2, Save, Send, CheckCircle, TrendingUp, Wallet,
  ArrowRight, Edit3, X, ChevronDown, ChevronRight, Info, CreditCard,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { apiFetch } from '../services/apiConfig';
import { useAuth } from '../context/AuthContext';
import BalanceSheetReportTemplate from './components/BalanceSheetReportTemplate';

// ── Pure client-side calculation (mirrors backend calculateRunningBalance) ────
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calculateBalance(openingBalance, sales, totalExpenditures, adjustments, totalSalesOverride, totalExpendituresOverride) {
  const ob = round2(openingBalance);

  // Cash sales (in-hand cash)
  const cashSales = round2(sales.acBar) + round2(sales.nonAcBar) + round2(sales.familyWing) + round2(sales.parcel);

  // Aggregator sales (settled later, not cash-in-hand)
  const swiggy = round2(sales.swiggy);
  const zomato = round2(sales.zomato);
  const aggregatorSales = round2(swiggy + zomato);

  // Total sales for display (includes aggregators) — override if provided
  const totalSales = totalSalesOverride != null
    ? round2(totalSalesOverride)
    : round2(cashSales + aggregatorSales);

  // Net sales = Total Sales minus aggregator sales
  const netSales = round2(totalSales - aggregatorSales);

  // Effective expenditures — override if provided
  const effectiveExpenditures = totalExpendituresOverride != null
    ? round2(totalExpendituresOverride)
    : round2(totalExpenditures);

  const sorted = [...adjustments].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const minusAdjustments = sorted.filter(a => a.sign !== 'PLUS');
  const plusAdjustments = sorted.filter(a => a.sign === 'PLUS');
  const otherIncome = round2(plusAdjustments.reduce((sum, a) => sum + Number(a.amount), 0));

  // Steps show amounts only (no running balance after each step)
  const steps = [
    { label: 'Opening Balance', amount: ob },
    { label: '+ Gross Sales', amount: totalSales },
    { label: '\u2212 Swiggy', amount: swiggy },
    { label: '\u2212 Zomato', amount: zomato },
    { label: '= Net Sales', amount: netSales },
    { label: '\u2212 Expenditures', amount: effectiveExpenditures },
  ];

  for (const adj of minusAdjustments) {
    const amt = round2(Number(adj.amount) || 0);
    steps.push({ label: `\u2212 ${adj.label}`, amount: amt });
  }

  if (otherIncome > 0) {
    steps.push({ label: '+ Other Income', amount: otherIncome });
  }

  // Closing balance calculation (same logic as before)
  const afterTotalSales = round2(ob + totalSales);
  const afterAggregatorDeduction = round2(afterTotalSales - aggregatorSales);
  const afterExpenditures = round2(afterAggregatorDeduction - effectiveExpenditures);

  let running = afterExpenditures;
  for (const adj of sorted) {
    const amt = round2(Number(adj.amount) || 0);
    if (adj.sign === 'PLUS') running = round2(running + amt);
    else running = round2(running - amt);
  }

  return { afterSales: afterAggregatorDeduction, afterExpenditures, closingBalance: running, steps, effectiveExpenditures, netSales, totalSales, otherIncome };
}

// ── Helper: get today's date in IST ───────────────────────────────────────────
function getTodayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
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
  const [outletId, setOutletId] = useState(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      const outlets = raw ? JSON.parse(raw) : [];
      if (outlets.length > 1) return 'all';
      if (outlets.length === 1) return outlets[0].id;
    } catch {}
    const rid = user?.activeRestaurantId || user?.restaurantId || restaurant?.id;
    return rid || 'all';
  });

  // Refresh "today" periodically so the next-day arrow stays accurate in long-lived sessions
  useEffect(() => {
    setToday(getTodayIST());
    const timer = setInterval(() => setToday(getTodayIST()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep selectedDateRef in sync so doSave can detect date changes mid-save
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  const [sheet, setSheet] = useState(null);
  const [expenditures, setExpenditures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expendituresLoading, setExpendituresLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showAddAdj, setShowAddAdj] = useState(false);
  const [newAdj, setNewAdj] = useState({ label: '', amount: '', sign: 'MINUS' });
  const [statusLoading, setStatusLoading] = useState(false);
  const [ledgerActivity, setLedgerActivity] = useState(null);
  const [showLedgerActivity, setShowLedgerActivity] = useState(false);
  const [ledgerActivityLoading, setLedgerActivityLoading] = useState(false);
  const [logoBase64, setLogoBase64] = useState(null);
  const [allOutletsPaymentSummary, setAllOutletsPaymentSummary] = useState(null);
  const saveTimerRef = useRef(null);
  const dragItemRef = useRef(null);
  const saveSeqRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);
  const selectedDateRef = useRef(selectedDate);

  // Preload logo for PDF branding
  useEffect(() => {
    loadImageAsBase64('/logo softshape.ai.png')
      .then((data) => setLogoBase64(data))
      .catch(() => setLogoBase64(null));
  }, []);

  // Fetch aggregated payment-mode summary across all accessible outlets for the selected date.
  // The X report is per-outlet, so we use the reports/payment-methods endpoint with a
  // single-day range to get the all-outlet cash/card/upi totals and percentages.
  const loadAllOutletsPaymentSummary = useCallback(async () => {
    if (!selectedDate) {
      setAllOutletsPaymentSummary(null);
      return;
    }
    try {
      const params = new URLSearchParams({ startDate: selectedDate, endDate: selectedDate });
      const data = await apiFetch(`/api/reports/payment-methods?${params.toString()}`);
      const byMethod = (method) => data.methods.find((m) => m.method === method)?.amount || 0;
      const pctByMethod = (method) => data.methods.find((m) => m.method === method)?.percent || 0;
      setAllOutletsPaymentSummary({
        cash: byMethod('CASH'),
        card: byMethod('CARD'),
        upi: byMethod('UPI'),
        credit: byMethod('OTHER'),
        pctCash: pctByMethod('CASH'),
        pctCard: pctByMethod('CARD'),
        pctUpi: pctByMethod('UPI'),
        pctCredit: pctByMethod('OTHER'),
        totalAmount: data.summary?.totalAmount || 0,
      });
    } catch (err) {
      console.error('[BalanceSheet] Failed to load all-outlet payment summary:', err);
      setAllOutletsPaymentSummary(null);
    }
  }, [selectedDate]);

  useEffect(() => { loadAllOutletsPaymentSummary(); }, [loadAllOutletsPaymentSummary]);

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

  // ── Load ledger activity for the date ──────────────────────────────────────
  const loadLedgerActivity = useCallback(async () => {
    setLedgerActivityLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('outletId', outletId);
      const data = await apiFetch(`/api/balance-sheet/${selectedDate}/ledger-activity?${params.toString()}`);
      setLedgerActivity(data);
    } catch {
      setLedgerActivity(null);
    } finally {
      setLedgerActivityLoading(false);
    }
  }, [selectedDate, outletId]);

  useEffect(() => { loadSheet(); }, [loadSheet]);
  useEffect(() => { loadExpenditures(); }, [loadExpenditures]);
  useEffect(() => { loadLedgerActivity(); }, [loadLedgerActivity]);

  // ── Local state mirrors for editable fields ────────────────────────────────
  const [overrides, setOverrides] = useState({
    openingBalance: 0,
    acBarSaleOverride: null,
    nonAcBarSaleOverride: null,
    familyWingSaleOverride: null,
    parcelSaleOverride: null,
    totalSalesOverride: null,
    totalExpendituresOverride: null,
    swiggySale: null,
    zomatoSale: null,
  });
  const [adjustments, setAdjustments] = useState([]);
  const [dirty, setDirty] = useState(false);

  // Refs mirror the latest overrides/adjustments so doSave can read synchronous
  // values even when onBlur hasn't flushed a state update yet (e.g. user clicks
  // Save while still focused on an input).
  const overridesRef = useRef(overrides);
  const adjustmentsRef = useRef(adjustments);

  useEffect(() => {
    if (!sheet) return;

    // Detect whether this sheet update came from our own save response
    const isSaveResponse = sheet.__saveSeq !== undefined;
    // Ignore stale save responses (a newer save was issued before this one resolved)
    if (isSaveResponse && sheet.__saveSeq < saveSeqRef.current) {
      return;
    }
    lastAppliedSeqRef.current = saveSeqRef.current;

    const freshOverrides = {
      openingBalance: Number(sheet.openingBalance) || 0,
      acBarSaleOverride: sheet.acBarSaleOverride != null ? Number(sheet.acBarSaleOverride) : null,
      nonAcBarSaleOverride: sheet.nonAcBarSaleOverride != null ? Number(sheet.nonAcBarSaleOverride) : null,
      familyWingSaleOverride: sheet.familyWingSaleOverride != null ? Number(sheet.familyWingSaleOverride) : null,
      parcelSaleOverride: sheet.parcelSaleOverride != null ? Number(sheet.parcelSaleOverride) : null,
      totalSalesOverride: sheet.totalSalesOverride != null ? Number(sheet.totalSalesOverride) : null,
      totalExpendituresOverride: sheet.totalExpendituresOverride != null ? Number(sheet.totalExpendituresOverride) : null,
      swiggySale: sheet.swiggySale != null ? Number(sheet.swiggySale) : null,
      zomatoSale: sheet.zomatoSale != null ? Number(sheet.zomatoSale) : null,
    };
    // Only overwrite local state from server data on fresh fetches
    // (date change, initial load, external refresh) — not from our own save
    // echoes.  This prevents a save response from wiping out edits the user
    // made while the save was in flight.
    if (!isSaveResponse) {
      overridesRef.current = freshOverrides;
      setOverrides(freshOverrides);
      const freshAdjustments = sheet.adjustments || [];
      adjustmentsRef.current = freshAdjustments;
      setAdjustments(freshAdjustments);
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

  const computedTotalSales = round2(
    computedSales.acBar +
    computedSales.nonAcBar +
    computedSales.familyWing +
    computedSales.parcel +
    computedSales.swiggy +
    computedSales.zomato
  );

  const totalSales = overrides.totalSalesOverride != null
    ? round2(overrides.totalSalesOverride)
    : computedTotalSales;

  const totalExpenditures = Number(sheet?.totalExpenditures) || 0;
  const effectiveTotalExpenditures = overrides.totalExpendituresOverride != null
    ? round2(overrides.totalExpendituresOverride)
    : round2(totalExpenditures);

  // ── Live balance calculation ───────────────────────────────────────────────
  const balanceCalc = useMemo(() => {
    return calculateBalance(overrides.openingBalance, computedSales, totalExpenditures, adjustments, overrides.totalSalesOverride, overrides.totalExpendituresOverride);
  }, [overrides.openingBalance, computedSales, totalExpenditures, adjustments, overrides.totalSalesOverride, overrides.totalExpendituresOverride]);

  // ── Manual save ────────────────────────────────────────────────────────────
  const doSave = useCallback(async () => {
    if (isLocked || !sheet) return;
    setSaving(true);
    const thisSeq = ++saveSeqRef.current;
    const saveDate = selectedDate;
    try {
      const curOverrides = overridesRef.current;
    const curAdjustments = adjustmentsRef.current;
    const body = {
        openingBalance: curOverrides.openingBalance,
        acBarSaleOverride: curOverrides.acBarSaleOverride,
        nonAcBarSaleOverride: curOverrides.nonAcBarSaleOverride,
        familyWingSaleOverride: curOverrides.familyWingSaleOverride,
        parcelSaleOverride: curOverrides.parcelSaleOverride,
        totalSalesOverride: curOverrides.totalSalesOverride,
        totalExpendituresOverride: curOverrides.totalExpendituresOverride,
        swiggySale: curOverrides.swiggySale,
        zomatoSale: curOverrides.zomatoSale,
        adjustments: curAdjustments.map((a, i) => ({
          label: a.label,
          amount: Number(a.amount),
          sign: a.sign,
          sortOrder: a.sortOrder ?? i,
        })),
        expectedUpdatedAt: sheet?.updatedAt,
      };
      const params = new URLSearchParams();
      if (outletId && outletId !== 'all') params.set('outletId', outletId);
      const updated = await apiFetch(`/api/balance-sheet/${selectedDate}?${params.toString()}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      // Only apply if no newer save has been issued since this one started
      if (thisSeq === saveSeqRef.current && selectedDateRef.current === saveDate) {
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
      setError(err.message || 'Failed to save balance sheet');
    } finally {
      setSaving(false);
    }
  }, [isLocked, sheet, selectedDate, outletId, loadSheet]);

  const handleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    doSave();
  };

  const handleFieldChange = (field, value) => {
    const next = { ...overridesRef.current, [field]: value };
    overridesRef.current = next;
    setOverrides(next);
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
      sortOrder: adjustmentsRef.current.length,
    };
    const updated = [...adjustmentsRef.current, adj];
    adjustmentsRef.current = updated;
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
    const next = adjustmentsRef.current.map((a) => (a.id === safe.id ? safe : a));
    adjustmentsRef.current = next;
    setAdjustments(next);
    setDirty(true);
  };

  const handleDeleteAdjustment = (adj) => {
    const next = adjustmentsRef.current.filter((a) => a.id !== adj.id);
    adjustmentsRef.current = next;
    setAdjustments(next);
    setDirty(true);
  };

  // ── Drag reorder ───────────────────────────────────────────────────────────
  const handleDragStart = (item) => { dragItemRef.current = item; };
  const handleDrop = (target) => {
    const dragged = dragItemRef.current;
    if (!dragged || dragged.id === target.id) return;
    const reordered = [...adjustmentsRef.current];
    const dragIdx = reordered.findIndex((a) => a.id === dragged.id);
    const targetIdx = reordered.findIndex((a) => a.id === target.id);
    if (dragIdx === -1 || targetIdx === -1) return;
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const reindexed = reordered.map((a, i) => ({ ...a, sortOrder: i }));
    adjustmentsRef.current = reindexed;
    setAdjustments(reindexed);
    dragItemRef.current = null;
    setDirty(true);
  };

  // ── Status transitions ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setStatusLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletId && outletId !== 'all') params.set('outletId', outletId);
      const updated = await apiFetch(`/api/balance-sheet/${selectedDate}/submit?${params.toString()}`, { method: 'POST' });
      setSheet(updated);
    } catch (err) { setError(err.message); }
    finally { setStatusLoading(false); }
  };

  const handleLock = async () => {
    if (!confirm('Lock this balance sheet? It cannot be edited after locking.')) return;
    setStatusLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletId && outletId !== 'all') params.set('outletId', outletId);
      const updated = await apiFetch(`/api/balance-sheet/${selectedDate}/lock?${params.toString()}`, { method: 'POST' });
      setSheet(updated);
    } catch (err) { setError(err.message); }
    finally { setStatusLoading(false); }
  };

  const handleUnlock = async () => {
    if (!confirm('Unlock this balance sheet? It will become editable again.')) return;
    setStatusLoading(true);
    try {
      const params = new URLSearchParams();
      if (outletId && outletId !== 'all') params.set('outletId', outletId);
      const updated = await apiFetch(`/api/balance-sheet/${selectedDate}/unlock?${params.toString()}`, { method: 'POST' });
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

  // ── Helper: Convert number to words (Indian Rupees) ───────────────────────
  function numberToWords(num) {
    if (num === 0) return 'Zero Only';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    function convertLessThanThousand(n) {
      if (n === 0) return '';
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '');
    }
    
    function convert(n) {
      if (n === 0) return 'Zero';
      let result = '';
      if (Math.floor(n / 10000000) > 0) {
        result += convertLessThanThousand(Math.floor(n / 10000000)) + ' Crore ';
        n %= 10000000;
      }
      if (Math.floor(n / 100000) > 0) {
        result += convertLessThanThousand(Math.floor(n / 100000)) + ' Lakh ';
        n %= 100000;
      }
      if (Math.floor(n / 1000) > 0) {
        result += convertLessThanThousand(Math.floor(n / 1000)) + ' Thousand ';
        n %= 1000;
      }
      result += convertLessThanThousand(n);
      return result.trim();
    }
    
    return convert(Math.round(num)) + ' Only';
  }

  // ── Generate PDF using HTML-to-image pipeline ───────────────────────────
  const generateBalanceSheetPDF = useCallback(async () => {
    const outletName = accessibleOutlets.find((o) => o.id === outletId)?.name || restaurant?.name || 'Unknown Outlet';
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const now = new Date();
    const generatedOn = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' | ' + 
                      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Payment mode data aggregated across all accessible outlets for the day
    const paymentData = {
      cash: Number(allOutletsPaymentSummary?.cash) || 0,
      upi: Number(allOutletsPaymentSummary?.upi) || 0,
      card: Number(allOutletsPaymentSummary?.card) || 0,
      credit: Number(allOutletsPaymentSummary?.credit) || 0,
    };

    // Calculate gross balance (sales - expenditure)
    const grossBalance = totalSales - totalExpenditures;

    // Build template data
    const templateData = {
      outletName,
      date: dateStr,
      weekday,
      status: sheet?.status || 'DRAFT',
      generatedOn,
      generatedBy: user?.name || 'Admin',
      totalSales,
      netSales: balanceCalc.netSales,
      totalSalesSourcesCount: 5,
      totalExpenditure: totalExpenditures,
      totalExpenditureCategoriesCount: Object.keys(expenditureGroups).length,
      totalAdjustments: adjustments.filter(a => a.sign !== 'PLUS').reduce((sum, a) => sum + Number(a.amount), 0),
      totalAdjustmentsEntriesCount: adjustments.filter(a => a.sign !== 'PLUS').length,
      grossBalance,
      netClosingBalance: balanceCalc.closingBalance,
      otherIncome: adjustments.filter(a => a.sign === 'PLUS').reduce((sum, a) => sum + Number(a.amount), 0),
      amountInWords: numberToWords(balanceCalc.closingBalance),
      grossSales: totalSales,
      aggregatorSales: round2(computedSales.swiggy + computedSales.zomato),
      venueSales: [
        { icon: null, label: 'Lounge Sales', amount: computedSales.acBar, color: '#E63946' },
        { icon: null, label: 'Non-AC Bar', amount: computedSales.nonAcBar, color: '#F59E0B' },
        { icon: null, label: 'Family', amount: computedSales.familyWing, color: '#F59E0B' },
        { icon: null, label: 'Parcel Counter', amount: computedSales.parcel, color: '#3B82F6' },
      ],
      expenditures: Object.entries(expenditureGroups).map(([cat, vlist]) => ({
        label: cat,
        amount: vlist.reduce((s, v) => s + Number(v.amount), 0),
      })),
      adjustments: adjustments.filter(a => a.sign !== 'PLUS').map(a => ({
        label: a.label,
        amount: Number(a.amount),
      })),
      payment: paymentData,
    };

    // Create off-screen container
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '900px';
    container.style.background = 'white';
    document.body.appendChild(container);

    try {
      // Render template to container
      const { createRoot } = await import('react-dom/client');
      const root = createRoot(container);
      root.render(
        <BalanceSheetReportTemplate 
          data={templateData} 
          logoSrc={logoBase64 || '/logo softshape.ai.png'} 
        />
      );

      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 500));

      // Capture with html2canvas
      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Cleanup React root
      root.unmount();
      document.body.removeChild(container);

      // Convert to PDF
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190; // A4 width in mm (210mm - 20mm margin)
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      const doc = new jsPDF('p', 'mm', 'a4');
      doc.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      
      return doc;
    } catch (err) {
      if (container.parentNode) {
        document.body.removeChild(container);
      }
      throw err;
    }
  }, [accessibleOutlets, outletId, restaurant?.name, selectedDate, sheet?.status, totalSales, totalExpenditures, expenditureGroups, adjustments, balanceCalc.closingBalance, computedSales, allOutletsPaymentSummary, user?.name, logoBase64]);

  // ── WhatsApp share: generate PNG and share via Web Share API ───────────────
  const handleWhatsAppShare = async () => {
    setStatusLoading(true);
    setError(null);
    try {
      const outletName = accessibleOutlets.find((o) => o.id === outletId)?.name || restaurant?.name || 'Unknown Outlet';
      const message = `Daily Balance Sheet Report\nDate: ${selectedDate}\nOutlet: ${outletName}\nClosing Balance: ₹${balanceCalc.closingBalance.toLocaleString('en-IN')}`;

      // Generate PNG from the template
      const dateObj = new Date(selectedDate + 'T00:00:00');
      const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const now = new Date();
      const generatedOn = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' | ' + 
                        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const paymentData = {
        cash: Number(allOutletsPaymentSummary?.cash) || 0,
        upi: Number(allOutletsPaymentSummary?.upi) || 0,
        card: Number(allOutletsPaymentSummary?.card) || 0,
        credit: Number(allOutletsPaymentSummary?.credit) || 0,
      };

      const grossBalance = totalSales - totalExpenditures;

      const templateData = {
        outletName,
        date: dateStr,
        weekday,
        status: sheet?.status || 'DRAFT',
        generatedOn,
        generatedBy: user?.name || 'Admin',
        totalSales,
        netSales: balanceCalc.netSales,
        totalSalesSourcesCount: 5,
        totalExpenditure: totalExpenditures,
        totalExpenditureCategoriesCount: Object.keys(expenditureGroups).length,
        totalAdjustments: adjustments.filter(a => a.sign !== 'PLUS').reduce((sum, a) => sum + Number(a.amount), 0),
        totalAdjustmentsEntriesCount: adjustments.filter(a => a.sign !== 'PLUS').length,
        grossBalance,
        netClosingBalance: balanceCalc.closingBalance,
        otherIncome: adjustments.filter(a => a.sign === 'PLUS').reduce((sum, a) => sum + Number(a.amount), 0),
        amountInWords: numberToWords(balanceCalc.closingBalance),
        grossSales: totalSales,
        aggregatorSales: round2(computedSales.swiggy + computedSales.zomato),
        venueSales: [
          { icon: null, label: 'Lounge Sales', amount: computedSales.acBar, color: '#E63946' },
          { icon: null, label: 'Non-AC Bar', amount: computedSales.nonAcBar, color: '#F59E0B' },
          { icon: null, label: 'Family', amount: computedSales.familyWing, color: '#F59E0B' },
          { icon: null, label: 'Parcel Counter', amount: computedSales.parcel, color: '#3B82F6' },
        ],
        expenditures: Object.entries(expenditureGroups).map(([cat, vlist]) => ({
          label: cat,
          amount: vlist.reduce((s, v) => s + Number(v.amount), 0),
        })),
        adjustments: adjustments.filter(a => a.sign !== 'PLUS').map(a => ({
          label: a.label,
          amount: Number(a.amount),
        })),
        payment: paymentData,
      };

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '900px';
      container.style.background = 'white';
      document.body.appendChild(container);

      try {
        const { createRoot } = await import('react-dom/client');
        const root = createRoot(container);
        root.render(
          <BalanceSheetReportTemplate 
            data={templateData} 
            logoSrc={logoBase64 || '/logo softshape.ai.png'} 
          />
        );

        await new Promise(resolve => setTimeout(resolve, 500));

        const canvas = await html2canvas(container, {
          scale: 3,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        root.unmount();
        document.body.removeChild(container);

        // Convert canvas to PNG blob
        canvas.toBlob(async (blob) => {
          if (!blob) {
            throw new Error('Failed to generate PNG');
          }

          const file = new File([blob], `Daily-Balance-Sheet-${selectedDate}.png`, { type: 'image/png' });
          const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

          if (isNative) {
            // Capacitor native app: write PNG to cache and open native share dialog
            const base64 = await blobToBase64(blob);
            await Filesystem.writeFile({
              path: file.name,
              data: base64,
              directory: Directory.Cache,
              recursive: true,
            });
            const fileUri = await Filesystem.getUri({
              path: file.name,
              directory: Directory.Cache,
            });
            await Share.share({
              title: 'Daily Balance Sheet',
              text: message,
              url: fileUri.uri,
              dialogTitle: 'Share via',
            });
          } else if (navigator.share && navigator.canShare({ files: [file] })) {
            // Web: use Web Share API with file
            await navigator.share({
              title: 'Daily Balance Sheet',
              text: message,
              files: [file],
            });
          } else {
            // Fallback: download PNG and open WhatsApp with text
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const whatsappUrl = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
          }
        }, 'image/png');
      } catch (err) {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
        throw err;
      }
    } catch (err) {
      setError(err.message || 'Failed to generate image for WhatsApp');
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
          <div className="relative">
            <Calendar size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={today}
              className="w-full rounded-lg border border-gray-200 pl-8 pr-2 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
            />
          </div>
          {selectedDate === today && (
            <span className="rounded-full bg-[#FFEBEE] px-2 py-0.5 text-[10px] font-bold text-[#B71C1C]">TODAY</span>
          )}
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
        <div className="mt-3">
          <SalesTile
            label="Gross Sales"
            computedValue={computedTotalSales}
            overrideValue={overrides.totalSalesOverride}
            isManual={overrides.totalSalesOverride != null}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('totalSalesOverride', v)}
          />
        </div>
      </div>

      {/* ── Net Sales display ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-blue-700">Net Sales (after Swiggy + Zomato deduction)</span>
          <span className="text-lg font-black text-blue-900">
            ₹{balanceCalc.netSales.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* ── Balance Calculation (amounts only, no running balance) ──────── */}
      <div className="rounded-xl bg-gray-900 p-4">
        <div className="mb-3">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Balance Calculation</h4>
        </div>
        <div className="space-y-3">
          {balanceCalc.steps.map((step, i) => {
            const isNetSales = step.label.startsWith('= Net Sales');
            return (
              <div key={i}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${isNetSales ? 'text-blue-400' : 'text-gray-300'}`}>
                    {step.label}
                  </span>
                  <span className={`font-black ${isNetSales ? 'text-lg text-blue-400' : 'text-lg text-gray-200'}`}>
                    ₹{Number(step.amount).toLocaleString('en-IN')}
                  </span>
                </div>
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
        </div>
      </div>

      {/* ── Expenditures section ──────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-black text-gray-800 mb-2">Expenditures</h3>
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
        <div className="mt-3">
          <SalesTile
            label="Total Expenditures"
            computedValue={expenditureSubtotal}
            overrideValue={overrides.totalExpendituresOverride}
            isManual={overrides.totalExpendituresOverride != null}
            isLocked={isLocked}
            onChange={(v) => handleFieldChange('totalExpendituresOverride', v)}
          />
        </div>
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

      {/* ── Today's Ledger Activity (read-only informational panel) ──────── */}
      {ledgerActivity && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50">
          <button
            onClick={() => setShowLedgerActivity(!showLedgerActivity)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <div className="flex items-center gap-1.5">
              <Info size={14} className="text-blue-500" />
              <span className="text-xs font-black text-gray-700">Today's Ledger Activity</span>
              {(ledgerActivity.cashLiabilityPayments?.length > 0 || ledgerActivity.liabilitiesCreatedToday?.length > 0) && (
                <span className="ml-1 rounded-full bg-blue-200 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                  {ledgerActivity.cashLiabilityPayments.length + ledgerActivity.liabilitiesCreatedToday.length} item{ledgerActivity.cashLiabilityPayments.length + ledgerActivity.liabilitiesCreatedToday.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {showLedgerActivity ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          </button>

          {showLedgerActivity && (
            <div className="space-y-3 px-3 pb-3">
              {/* Grocery by category */}
              {ledgerActivity.groceryByCategory?.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-bold text-gray-500">Grocery Expenditures (included in total)</div>
                  <div className="space-y-1">
                    {ledgerActivity.groceryByCategory.map((g, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-white px-2 py-1 text-xs">
                        <span className="font-bold text-gray-700">{g.categoryName}</span>
                        <span className="font-bold text-gray-800">{round2(g.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash liability payments */}
              {ledgerActivity.cashLiabilityPayments?.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-bold text-gray-500">Cash Vendor Payments (included in total)</div>
                  <div className="space-y-1">
                    {ledgerActivity.cashLiabilityPayments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-white px-2 py-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Wallet size={10} className="text-green-600" />
                          <span className="font-bold text-gray-700">{p.vendorName}</span>
                        </div>
                        <span className="font-bold text-green-600">{round2(p.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Liabilities created (AP) — not a cash expense */}
              {ledgerActivity.liabilitiesCreatedToday?.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-gray-500">
                    <CreditCard size={10} />
                    Vendor Bills Created (AP — not a cash expense, does not affect today's till)
                  </div>
                  <div className="space-y-1">
                    {ledgerActivity.liabilitiesCreatedToday.map((l, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-white px-2 py-1 text-xs">
                        <span className="font-bold text-gray-500">{l.vendorName}</span>
                        <span className="font-bold text-gray-400">{round2(l.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {ledgerActivityLoading && (
                <div className="flex items-center justify-center py-2"><Loader2 size={14} className="animate-spin text-gray-400" /></div>
              )}
              {!ledgerActivityLoading &&
                !ledgerActivity.groceryByCategory?.length &&
                !ledgerActivity.cashLiabilityPayments?.length &&
                !ledgerActivity.liabilitiesCreatedToday?.length && (
                <div className="py-2 text-center text-xs text-gray-400">No ledger activity for this date.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        {isLocked ? (
          isAdmin ? (
            <button
              onClick={handleUnlock}
              disabled={statusLoading}
              className="flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
            >
              {statusLoading ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
              Unlock to Edit
            </button>
          ) : (
            <p className="text-[12px] font-bold text-gray-400">You don't have access, contact admin</p>
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
            {!isAdmin && (
              <p className="text-[12px] font-bold text-gray-400">You don't have access, contact admin</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
