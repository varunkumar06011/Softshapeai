// ─────────────────────────────────────────────────────────────────────────────
// LiquorDailyReportModal — "PDF to Admin" item-wise liquor report
// ─────────────────────────────────────────────────────────────────────────────
// Contains ONLY two detailed item-wise reports:
//   1. Non-AC Detailed Item-wise Report (admin-entered · database-driven · editable)
//   2. AC Bar Detailed Item-wise Report (POS billing · database-driven · editable)
//
// Both tables have columns: S.No | Item Name | Qty (ml) | Opening Stock | Purchases | Total Stock
//   | Sold | Closing | Purchase Cost | Consumption | Selling Price | Sale Amount | Profit
//
// Opening Stock, Purchases, Total Stock are read-only (from backend / Record Purchase).
// Sold is editable. Closing = Total Stock − Sold (auto-calc).
// Calculated fields auto-recalculate:
//   Consumption = Sold × Purchase Cost
//   Sale Amount = Sold × Selling Price
//   Profit = Sale Amount − Consumption
//
// Save & Generate PDF:
//   - Non-AC edits persist to non_ac_inventory_items + non_ac_daily_entries
//   - AC edits persist to ac_report_adjustments (separate from POS data)
//   - PDF contains only the two item-wise tables
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, AlertTriangle, FileText, Save, CheckCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { apiUrl, getAuthHeaders } from '../../services/apiConfig';
import { fetchCombinedInventory, toggleAcItemHide, toggleNonAcItemHide } from '../../services/barInventoryApi';

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(1)}%`;
}

// ── Pure function: compute report values from fresh backend JSON ──
// Used by handleSaveAndPrint to build the PDF from freshly fetched data
// (after save + refetch), avoiding stale React state.
// The json already reflects all saved edits (AC adjustments, Non-AC entries,
// summary overrides), so no edit overlay is needed.

// Helper: prefer backend summary value (includes saved overrides), fall back to computed.
function pickS(jsonData, field, fallback) {
  const v = jsonData?.summary?.[field];
  return (v != null && v !== '' && !Number.isNaN(Number(v))) ? Number(v) : fallback;
}

function computeReportFromJson(jsonData) {
  if (!jsonData) return null;

  const computedAcItems = (jsonData.acItems || [])
    .filter(i => !i.isHidden)
    .map(item => {
      const purchaseCost = Number(item.purchaseCost) || 0;
      const sellingPrice = Number(item.sellingPrice) || 0;
      const opening = Number(item.opening) || 0;
      const purchases = Number(item.received) || 0;
      const totalStock = opening + purchases;
      const sold = Number(item.sold) || 0;
      const displaySale = item.displaySale != null ? Number(item.displaySale) : sold;
      const sale = sold;
      const closing = totalStock - sold;
      // Use backend values directly — do not recalculate
      const consumption = Number(item.consumption) || 0;
      const saleAmount = Number(item.saleAmount) || 0;
      const profit = Number(item.profit) || 0;
      return { ...item, qty: Number(item.qty) || 0, sale, displaySale, purchaseCost, sellingPrice, consumption, saleAmount, profit, isHidden: false, hasMissingPrice: purchaseCost <= 0, hasMissingBottleSize: (Number(item.qty) || 0) <= 0, hasMissingSellingPrice: sellingPrice <= 0, opening, purchases, totalStock, sold, closing };
    });

  const computedNonAcItems = (jsonData.nonAcItems || [])
    .filter(i => !i.isHidden)
    .map(item => {
      const purchaseCost = Number(item.purchaseCost) || 0;
      const sellingPrice = Number(item.sellingPrice) || 0;
      const opening = Number(item.opening) || 0;
      const purchases = Number(item.received) || 0;
      const totalStock = opening + purchases;
      const sold = Number(item.sold) || 0;
      const sale = sold;
      // Use backend-provided closing (reflects saved admin override if any)
      const closing = Number(item.closing) != null && !Number.isNaN(Number(item.closing))
        ? Number(item.closing)
        : totalStock - sold;
      const consumption = sale * purchaseCost;
      const saleAmount = sale * sellingPrice;
      const profit = saleAmount - consumption;
      return { ...item, qty: Number(item.qty) || 0, sale, purchaseCost, sellingPrice, consumption, saleAmount, profit, isHidden: false, hasMissingPrice: purchaseCost <= 0, hasMissingSellingPrice: sellingPrice <= 0, opening, purchases, totalStock, sold, closing };
    });

  const mkTotals = (items) => {
    const consumption = items.reduce((s, i) => s + i.consumption, 0);
    const saleAmount = items.reduce((s, i) => s + i.saleAmount, 0);
    const profit = items.reduce((s, i) => s + i.profit, 0);
    const profitMarginPct = consumption > 0 ? (profit / consumption) * 100 : 0;
    const opening = items.reduce((s, i) => s + (Number(i.opening) || 0), 0);
    const purchases = items.reduce((s, i) => s + (Number(i.purchases) || 0), 0);
    const totalStock = items.reduce((s, i) => s + (Number(i.totalStock) || 0), 0);
    const sold = items.reduce((s, i) => s + (Number(i.sold) || 0), 0);
    const closing = items.reduce((s, i) => s + (Number(i.closing) || 0), 0);
    return { consumption, saleAmount, profit, profitMarginPct, opening, purchases, totalStock, sold, closing };
  };

  const acItemTotals = mkTotals(computedAcItems);
  const nonAcItemTotals = mkTotals(computedNonAcItems);

  const totalAcRevenue = acItemTotals.saleAmount;
  const totalNonAcRevenue = nonAcItemTotals.saleAmount;
  const totalAcConsumptionCost = acItemTotals.consumption;
  const totalNonAcConsumptionCost = nonAcItemTotals.consumption;
  const totalAcProfit = acItemTotals.profit;
  const totalNonAcProfit = nonAcItemTotals.profit;

  const computedOpeningStockValue = [...computedAcItems, ...computedNonAcItems].reduce((s, i) => s + (Number(i.opening) || 0) * (Number(i.purchaseCost) || 0), 0);
  const computedPurchaseValue = [...computedAcItems, ...computedNonAcItems].reduce((s, i) => s + (Number(i.purchases) || 0) * (Number(i.purchaseCost) || 0), 0);
  const computedConsumption = totalAcConsumptionCost + totalNonAcConsumptionCost;
  const computedClosingStockValue = [...computedAcItems, ...computedNonAcItems].reduce((s, i) => s + (Number(i.closing) || 0) * (Number(i.purchaseCost) || 0), 0);
  const computedAcProfitPct = totalAcRevenue > 0 ? (totalAcProfit / totalAcRevenue) * 100 : 0;
  const computedNonAcProfitPct = totalNonAcRevenue > 0 ? (totalNonAcProfit / totalNonAcRevenue) * 100 : 0;
  const computedTotalSales = totalAcRevenue + totalNonAcRevenue;
  const computedTotalProfit = totalAcProfit + totalNonAcProfit;
  const computedTotalProfitPct = computedTotalSales > 0 ? (computedTotalProfit / computedTotalSales) * 100 : 0;

  const summary = {
    ...jsonData.summary,
    // Prefer backend's summary values (which include saved admin overrides),
    // falling back to computed values only when backend doesn't provide them.
    openingStockValue: pickS(jsonData, 'openingStockValue', computedOpeningStockValue),
    purchaseValue: pickS(jsonData, 'purchaseValue', computedPurchaseValue),
    consumption: pickS(jsonData, 'consumption', computedConsumption),
    closingStockValue: pickS(jsonData, 'closingStockValue', computedClosingStockValue),
    acSales: pickS(jsonData, 'acSales', totalAcRevenue),
    acConsumption: pickS(jsonData, 'acConsumption', totalAcConsumptionCost),
    acProfit: pickS(jsonData, 'acProfit', totalAcProfit),
    acProfitPct: pickS(jsonData, 'acProfitPct', computedAcProfitPct),
    nonAcSales: pickS(jsonData, 'nonAcSales', totalNonAcRevenue),
    nonAcConsumption: pickS(jsonData, 'nonAcConsumption', totalNonAcConsumptionCost),
    nonAcProfit: pickS(jsonData, 'nonAcProfit', totalNonAcProfit),
    nonAcProfitPct: pickS(jsonData, 'nonAcProfitPct', computedNonAcProfitPct),
    totalSales: pickS(jsonData, 'totalSales', computedTotalSales),
    totalConsumption: pickS(jsonData, 'totalConsumption', computedConsumption),
    totalProfit: pickS(jsonData, 'totalProfit', computedTotalProfit),
    totalProfitPct: pickS(jsonData, 'totalProfitPct', computedTotalProfitPct),
  };

  return { ...jsonData, categories: jsonData.categories || [], summary, acItems: computedAcItems, nonAcItems: computedNonAcItems, acItemTotals, nonAcItemTotals };
}

// Format bottle quantity (e.g., 20, 20.5, 0)
function fmtQty(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  const v = Number(n);
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

// Number equality with tolerance for floating-point comparison
function numEq(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.round(Number(a) * 10000) / 10000 === Math.round(Number(b) * 10000) / 10000;
}

const SAFE_DIV = (a, b) => (b > 0 ? a / b * 100 : 0);

export default function LiquorDailyReportModal({ open, date, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Date range — endDate is optional. When set, the report aggregates across the range.
  const [endDate, setEndDate] = useState('');
  // Editable entries: { [categoryName]: { acSales, acLandingCost, nonAcSales, nonAcLandingCost } }
  const [edits, setEdits] = useState({});
  // Editable summary overrides
  const [summaryEdits, setSummaryEdits] = useState({});
  // Item-wise edits for Non-AC: { [itemId]: { qty, sale, purchaseCost, sellingPrice } }
  const [nonAcItemEdits, setNonAcItemEdits] = useState({});
  // Non-AC item hide/show flags: { [itemId]: boolean } — persisted on NonAcInventoryItem.isHiddenFromReport
  const [nonAcHiddenFlags, setNonAcHiddenFlags] = useState({});
  // Item-wise edits for AC: { [itemId]: { qty, sale, purchaseCost, sellingPrice } }
  const [acItemEdits, setAcItemEdits] = useState({});
  // AC item hide/show flags: { [itemId]: boolean } — persisted on InventoryItem.isHiddenFromReport
  const [acHiddenFlags, setAcHiddenFlags] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  // Track whether there are unsaved (pending) edits restored from localStorage
  const [hasPendingEdits, setHasPendingEdits] = useState(false);
  // Ref to prevent duplicate save submissions while one is in flight
  const saveInFlightRef = useRef(false);

  // ── localStorage persistence for failure-safe saves ──
  // Key: unique per date + restaurant. Stores ALL edit state so it survives
  // page refresh, timeout, network failure, or any other save failure.
  // Only cleared after a confirmed successful save.
  const pendingKey = open && date ? `liquorReportPending:${date}` : '';
  const savePendingToStorage = useCallback((state) => {
    if (!pendingKey) return;
    try {
      localStorage.setItem(pendingKey, JSON.stringify({
        ...state,
        savedAt: Date.now(),
      }));
      setHasPendingEdits(true);
    } catch { /* localStorage may be full or disabled */ }
  }, [pendingKey]);

  const clearPendingFromStorage = useCallback(() => {
    if (!pendingKey) return;
    try {
      localStorage.removeItem(pendingKey);
      setHasPendingEdits(false);
    } catch { /* ignore */ }
  }, [pendingKey]);

  const loadPendingFromStorage = useCallback(() => {
    if (!pendingKey) return null;
    try {
      const raw = localStorage.getItem(pendingKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Expire pending edits after 7 days to avoid stale data
      if (parsed.savedAt && Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(pendingKey);
        return null;
      }
      return parsed;
    } catch { return null; }
  }, [pendingKey]);

  const loadData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      if (endDate && endDate !== date) {
        params.set('endDate', endDate);
      }
      const res = await fetch(apiUrl(`/api/bar/inventory/liquor-daily-report?${params.toString()}`), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...getAuthHeaders() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const json = await res.json();

      // ── Also fetch the combined API (same as main Inventory screen) ──
      // This ensures the Business Position cards use the EXACT same calculation
      // as the main Inventory screen — one source of truth.
      try {
        const combinedOpts = endDate && endDate !== date
          ? { fromDate: date, toDate: endDate }
          : { fromDate: date, toDate: date };
        const combined = await fetchCombinedInventory(combinedOpts);
        if (combined?.summary) {
          // Merge the combined API's 16-field summary into the liquor report's summary
          // The combined API uses the correct field names (openingStockValue, acSales, etc.)
          json.summary = { ...json.summary, ...combined.summary };
          // Also store the combined items count for debugging
          json._combinedItemsCount = combined.items?.length || 0;
        }
      } catch (combinedErr) {
        // Non-fatal: if the combined API fails, fall back to liquor report data
        console.warn('[LiquorReport] Combined API fetch failed, using liquor report summary:', combinedErr);
      }

      setData(json);
      // Initialize edits from POS data + saved Non-AC entries
      const init = {};
      for (const c of (json.categories || [])) {
        init[c.categoryName] = {
          acSales: c.acRevenue || 0,
          acLandingCost: c.acConsumptionCost || 0,
          nonAcSales: c.nonAcRevenue || 0,
          nonAcLandingCost: c.nonAcConsumptionCost || 0,
        };
      }
      // Also include any saved entries for categories not in POS data
      for (const e of (json.nonAcEntries || [])) {
        if (e.categoryName !== 'TOTAL' && !init[e.categoryName]) {
          init[e.categoryName] = {
            acSales: 0,
            acLandingCost: 0,
            nonAcSales: e.nonAcSales || 0,
            nonAcLandingCost: e.nonAcLandingCost || 0,
          };
        }
      }
      setEdits(init);

      // Initialize item-wise edits from database data
      // Only editable fields: qty, sold, purchaseCost, sellingPrice, closingOverride
      // Opening Stock and Purchases are read-only (from backend)
      const nonAcInit = {};
      const nonAcHiddenInit = {};
      for (const item of (json.nonAcItems || [])) {
        // Detect if the saved closing is an admin override (differs from auto-calc)
        const autoClosing = Math.round(((Number(item.opening) || 0) + (Number(item.received) || 0) - (Number(item.sold) || 0)) * 100) / 100;
        const savedClosing = Math.round((Number(item.closing) || 0) * 100) / 100;
        const hasOverride = savedClosing !== autoClosing && Number(item.closing) != null;
        nonAcInit[item.itemId] = {
          qty: item.qty ?? 0,
          purchaseCost: item.purchaseCost ?? 0,
          sellingPrice: item.sellingPrice ?? 0,
          sold: item.sold ?? 0,
          // Restore closing override only if saved closing differs from auto-calc
          closingOverride: hasOverride ? savedClosing : undefined,
        };
        nonAcHiddenInit[item.itemId] = item.isHidden === true;
      }
      setNonAcItemEdits(nonAcInit);
      setNonAcHiddenFlags(nonAcHiddenInit);

      const acInit = {};
      const acHiddenInit = {};
      for (const item of (json.acItems || [])) {
        acInit[item.itemId] = {
          qty: item.qty ?? 0,
          purchaseCost: item.purchaseCost ?? 0,
          sellingPrice: item.sellingPrice ?? 0,
          // sold not initialized here — display falls through to item.displaySale (pegs)
          // allComputedAcItems uses itemEdit?.sold ?? item.sold, so when no edit,
          // it uses backend item.sold (bottles) for calculations and saving.
        };
        acHiddenInit[item.itemId] = item.isHidden === true;
      }
      setAcItemEdits(acInit);
      setAcHiddenFlags(acHiddenInit);

      // ── Restore pending edits from localStorage (failure-safe) ──
      // If a previous save failed or timed out, the admin's entered values
      // are still in localStorage. Restore them OVER the server data so the
      // admin sees their unsaved changes and can retry saving.
      const pending = loadPendingFromStorage();
      if (pending) {
        // Merge pending item edits over server-initialized edits
        if (pending.nonAcItemEdits) {
          for (const [itemId, vals] of Object.entries(pending.nonAcItemEdits)) {
            if (nonAcInit[itemId]) {
              nonAcInit[itemId] = { ...nonAcInit[itemId], ...vals };
            }
          }
          setNonAcItemEdits({ ...nonAcInit });
        }
        if (pending.acItemEdits) {
          for (const [itemId, vals] of Object.entries(pending.acItemEdits)) {
            if (acInit[itemId]) {
              // Exclude system-driven fields (sold, saleMl) — AC sold values
              // come from POS and must never be overwritten by stale cache.
              const { sold, saleMl, ...adminEditable } = vals;
              acInit[itemId] = { ...acInit[itemId], ...adminEditable };
            }
          }
          setAcItemEdits({ ...acInit });
        }
        if (pending.nonAcHiddenFlags) {
          setNonAcHiddenFlags(prev => ({ ...prev, ...pending.nonAcHiddenFlags }));
        }
        if (pending.acHiddenFlags) {
          setAcHiddenFlags(prev => ({ ...prev, ...pending.acHiddenFlags }));
        }
        if (pending.edits) {
          setEdits(prev => ({ ...prev, ...pending.edits }));
        }
        if (pending.summaryEdits) {
          setSummaryEdits(pending.summaryEdits);
        }
        setHasPendingEdits(true);
      } else {
        setHasPendingEdits(false);
      }

      // Restore summary overrides from the response (already applied to summary by backend)
      // We don't set summaryEdits here because the backend already applied them to summary values.
      // The inputs will show the backend-provided values (which include overrides).
      return json;
    } catch (err) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [open, date, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auto-save edit state to localStorage on every change ──
  // This ensures pending edits survive page refresh, timeout, or any failure.
  // Only runs after data is loaded (don't save empty initial state).
  useEffect(() => {
    if (!open || !data || !pendingKey) return;
    // Don't save if all edit states are empty (initial load before any edit)
    const hasAnyEdit =
      Object.keys(nonAcItemEdits).length > 0 ||
      Object.keys(acItemEdits).length > 0 ||
      Object.keys(edits).length > 0 ||
      Object.keys(summaryEdits).length > 0;
    if (!hasAnyEdit) return;
    savePendingToStorage({
      nonAcItemEdits,
      acItemEdits,
      nonAcHiddenFlags,
      acHiddenFlags,
      edits,
      summaryEdits,
    });
  }, [open, data, pendingKey, nonAcItemEdits, acItemEdits, nonAcHiddenFlags, acHiddenFlags, edits, summaryEdits, savePendingToStorage]);

  // ── Computed item-wise values with live recalculation from edits ──
  // For each item: Consumption = Sold × Purchase Cost, Sale Amount = Sold × Selling Price, Profit = Sale Amount − Consumption
  // Opening Stock, Purchases are read-only (from backend). Sold is editable.
  // Total Stock = Opening Stock + Purchases. Closing = Total Stock − Sold.
  // All Non-AC items (including hidden ones for data preservation)
  const allComputedNonAcItems = useMemo(() => {
    if (!data) return [];
    return (data.nonAcItems || []).map((item) => {
      const edit = nonAcItemEdits[item.itemId] || { qty: item.qty, purchaseCost: item.purchaseCost, sellingPrice: item.sellingPrice, sold: item.sold };
      const purchaseCost = Number(edit.purchaseCost) || 0;
      const sellingPrice = Number(edit.sellingPrice) || 0;
      const qty = Number(edit.qty) || 0;
      // Opening Stock and Purchases are read-only — always from backend
      const opening = Number(item.opening) || 0;
      const purchases = Number(item.received) || 0;
      const totalStock = opening + purchases;
      // Sold is the main editable field
      const sold = Number(edit.sold ?? item.sold) || 0;
      const sale = sold; // sale = sold (same value)
      // Closing: use admin override if provided, otherwise auto-calc Total Stock - Sold
      const autoClosing = totalStock - sold;
      const closing = edit.closingOverride != null && edit.closingOverride !== ''
        ? Number(edit.closingOverride)
        : autoClosing;
      const consumption = sale * purchaseCost;
      const saleAmount = sale * sellingPrice;
      const profit = saleAmount - consumption;
      const isHidden = nonAcHiddenFlags[item.itemId] === true;
      const hasClosingOverride = edit.closingOverride != null && edit.closingOverride !== '' && Number(edit.closingOverride) !== Math.round(autoClosing * 100) / 100;
      return {
        ...item,
        qty,
        sale,
        purchaseCost,
        sellingPrice,
        consumption,
        saleAmount,
        profit,
        isHidden,
        hasMissingPrice: purchaseCost <= 0,
        hasMissingSellingPrice: sellingPrice <= 0,
        opening,
        purchases,
        totalStock,
        sold,
        closing,
        hasClosingOverride,
      };
    });
  }, [data, nonAcItemEdits, nonAcHiddenFlags]);

  // Only visible (non-hidden) Non-AC items for display totals and PDF
  const computedNonAcItems = useMemo(() => {
    return allComputedNonAcItems.filter(i => !i.isHidden);
  }, [allComputedNonAcItems]);

  // All AC items — use backend values directly, no frontend recalculation.
  // The backend already computes consumption, saleAmount, profit correctly
  // (including 30ml peg logic for spirits). Frontend just displays them.
  const allComputedAcItems = useMemo(() => {
    if (!data) return [];
    return (data.acItems || []).map((item) => {
      const itemEdit = acItemEdits[item.itemId];
      // Editable fields: use user edit if present, else backend value
      const purchaseCost = Number(itemEdit?.purchaseCost ?? item.purchaseCost) || 0;
      const sellingPrice = Number(itemEdit?.sellingPrice ?? item.sellingPrice) || 0;
      const qty = Number(itemEdit?.qty ?? item.qty) || 0;
      const sold = Number(itemEdit?.sold ?? item.sold) || 0;
      // Read-only from backend
      const opening = Number(item.opening) || 0;
      const purchases = Number(item.received) || 0;
      const totalStock = opening + purchases;
      const closing = totalStock - sold;
      // Use backend computed values directly — do NOT recalculate in frontend
      const consumption = Number(item.consumption) || 0;
      const saleAmount = Number(item.saleAmount) || 0;
      const profit = Number(item.profit) || 0;
      const isHidden = acHiddenFlags[item.itemId] === true;
      return {
        ...item,
        qty,
        sale: sold,
        purchaseCost,
        sellingPrice,
        consumption,
        saleAmount,
        profit,
        isHidden,
        hasMissingPrice: purchaseCost <= 0,
        hasMissingBottleSize: qty <= 0,
        opening,
        purchases,
        totalStock,
        sold,
        closing,
      };
    });
  }, [data, acItemEdits, acHiddenFlags]);

  // Only visible (non-hidden) AC items for display and PDF
  const computedAcItems = useMemo(() => {
    return allComputedAcItems.filter(i => !i.isHidden);
  }, [allComputedAcItems]);

  // Item-wise totals (recalculated from edited values)
  const computedNonAcTotals = useMemo(() => {
    const consumption = computedNonAcItems.reduce((s, i) => s + i.consumption, 0);
    const saleAmount = computedNonAcItems.reduce((s, i) => s + i.saleAmount, 0);
    const profit = computedNonAcItems.reduce((s, i) => s + i.profit, 0);
    const profitMarginPct = consumption > 0 ? (profit / consumption) * 100 : 0;
    const opening = computedNonAcItems.reduce((s, i) => s + (Number(i.opening) || 0), 0);
    const purchases = computedNonAcItems.reduce((s, i) => s + (Number(i.purchases) || 0), 0);
    const totalStock = computedNonAcItems.reduce((s, i) => s + (Number(i.totalStock) || 0), 0);
    const sold = computedNonAcItems.reduce((s, i) => s + (Number(i.sold) || 0), 0);
    const closing = computedNonAcItems.reduce((s, i) => s + (Number(i.closing) || 0), 0);
    return { consumption, saleAmount, profit, profitMarginPct, opening, purchases, totalStock, sold, closing };
  }, [computedNonAcItems]);

  // AC totals — ONLY visible items (hidden items excluded from all calculations)
  const computedAcTotals = useMemo(() => {
    const consumption = computedAcItems.reduce((s, i) => s + i.consumption, 0);
    const saleAmount = computedAcItems.reduce((s, i) => s + i.saleAmount, 0);
    const profit = computedAcItems.reduce((s, i) => s + i.profit, 0);
    const profitMarginPct = consumption > 0 ? (profit / consumption) * 100 : 0;
    const opening = computedAcItems.reduce((s, i) => s + (Number(i.opening) || 0), 0);
    const purchases = computedAcItems.reduce((s, i) => s + (Number(i.purchases) || 0), 0);
    const totalStock = computedAcItems.reduce((s, i) => s + (Number(i.totalStock) || 0), 0);
    const sold = computedAcItems.reduce((s, i) => s + (Number(i.sold) || 0), 0);
    const closing = computedAcItems.reduce((s, i) => s + (Number(i.closing) || 0), 0);
    return { consumption, saleAmount, profit, profitMarginPct, opening, purchases, totalStock, sold, closing };
  }, [computedAcItems]);

  // ── Business Position — uses the SAME combined API summary as the main Inventory screen ──
  // The base values ALWAYS come from data.summary (fetched from /non-ac/combined —
  // the same endpoint the main Inventory screen uses). This ensures both screens show
  // identical Business Position values for the same outlet + date.
  //
  // The item-wise tables (AC/Non-AC) still update live when the admin edits rows,
  // but the Business Position cards reflect the saved database state (via combined API).
  // After Save, loadData() re-fetches the combined API and the cards update automatically.
  // Summary overrides (manual card edits) always take precedence.
  //
  // 16 fields per spec:
  //   Opening Stock Value, Purchase Value, Consumption, Closing Stock Value,
  //   AC Sales, AC Consumption, AC Profit, AC Profit %,
  //   Non-AC Sales, Non-AC Consumption, Non-AC Profit, Non-AC Profit %,
  //   AC + Non-AC Sales, AC + Non-AC Consumption, AC + Non-AC Profit, AC + Non-AC Profit %
  const computed = useMemo(() => {
    if (!data) return null;

    // The combined API summary (from /non-ac/combined — same as main Inventory screen)
    // This is the source of truth. It already includes all items with correct values.
    const combinedSummary = data.summary || {};

    // Apply summary overrides — every business position card is editable.
    // If a field has been manually edited via the card input, use the edited value.
    const s = summaryEdits;
    const pick = (field, fallback) => (s[field] != null && s[field] !== '' && !Number.isNaN(Number(s[field]))) ? Number(s[field]) : fallback;

    const summary = {
      ...combinedSummary,
      // ── 16 Business Position fields ──
      // Always use the combined API value as the base. The combined API computes
      // these from the same DailyInventorySnapshot + nonAcDailyEntry data that the
      // main Inventory screen uses, so the values are identical.
      openingStockValue: pick('openingStockValue', combinedSummary.openingStockValue ?? 0),
      purchaseValue: pick('purchaseValue', combinedSummary.purchaseValue ?? 0),
      consumption: pick('consumption', combinedSummary.consumption ?? 0),
      closingStockValue: pick('closingStockValue', combinedSummary.closingStockValue ?? 0),
      acSales: pick('acSales', combinedSummary.acSales ?? 0),
      acConsumption: pick('acConsumption', combinedSummary.acConsumption ?? 0),
      acProfit: pick('acProfit', combinedSummary.acProfit ?? 0),
      acProfitPct: pick('acProfitPct', combinedSummary.acProfitPct ?? 0),
      nonAcSales: pick('nonAcSales', combinedSummary.nonAcSales ?? 0),
      nonAcConsumption: pick('nonAcConsumption', combinedSummary.nonAcConsumption ?? 0),
      nonAcProfit: pick('nonAcProfit', combinedSummary.nonAcProfit ?? 0),
      nonAcProfitPct: pick('nonAcProfitPct', combinedSummary.nonAcProfitPct ?? 0),
      totalSales: pick('totalSales', combinedSummary.totalSales ?? 0),
      totalConsumption: pick('totalConsumption', combinedSummary.totalConsumption ?? 0),
      totalProfit: pick('totalProfit', combinedSummary.totalProfit ?? 0),
      totalProfitPct: pick('totalProfitPct', combinedSummary.totalProfitPct ?? 0),
    };

    return { ...data, categories: data.categories || [], summary };
  }, [data, summaryEdits]);

  // ── Save item-wise edits to backend + summary overrides ──
  // Returns fresh JSON on success, false on failure
  const handleSave = async () => {
    if (!data) return false;
    // Prevent duplicate submissions — if a save is already in flight, ignore
    if (saveInFlightRef.current) {
      return false;
    }
    saveInFlightRef.current = true;
    setSaving(true);
    setSavedMsg(false);
    setError(null);
    try {
      // Helper: convert edit value to number, or undefined if empty/invalid.
      // Sending undefined (instead of 0) ensures the backend does NOT overwrite
      // previously saved persistent values (purchaseCost, sellingPrice) with 0
      // when the admin hasn't entered anything for that field.
      const numOrUndef = (v) => {
        if (v == null || v === '') return undefined;
        const n = Number(v);
        return Number.isNaN(n) ? undefined : n;
      };

      // Build item-wise payloads from edits
      // OPTIMIZATION: Only send items that actually changed (dirty checking).
      // Compare ONLY base edit fields (qty, sold, purchaseCost, sellingPrice,
      // isHidden, closingOverride) against original server data.
      // DO NOT compare computed fields (consumption, saleAmount, profit, closing)
      // because the frontend doesn't round the same way as the backend —
      // floating-point differences would cause false positives and ALL items
      // would be sent every save, re-introducing the timeout.
      const nonAcItemsPayload = [];
      for (const item of allComputedNonAcItems) {
        const e = nonAcItemEdits[item.itemId] || {};
        const orig = data.nonAcItems?.find(i => i.itemId === item.itemId);
        if (!orig) continue;
        // Current values (with edits applied)
        const bottleSize = numOrUndef(e.qty ?? item.qty);
        const sale = numOrUndef(item.sold) ?? 0;
        const purchaseRate = numOrUndef(e.purchaseCost ?? item.purchaseCost);
        const sellingPrice = numOrUndef(e.sellingPrice ?? item.sellingPrice);
        const isHidden = nonAcHiddenFlags[item.itemId] === true;
        const closingOverride = (e.closingOverride != null && e.closingOverride !== '') ? Number(e.closingOverride) : undefined;
        // Compare ONLY base fields against original server values (with tolerance)
        const changed =
          (bottleSize != null && !numEq(bottleSize, orig.qty)) ||
          !numEq(sale, orig.sold ?? 0) ||
          (purchaseRate != null && !numEq(purchaseRate, orig.purchaseCost)) ||
          (sellingPrice != null && !numEq(sellingPrice, orig.sellingPrice)) ||
          (isHidden !== (orig.isHidden === true)) ||
          (closingOverride != null && !numEq(closingOverride, orig.closing));
        if (!changed) continue;
        nonAcItemsPayload.push({
          itemId: item.itemId,
          bottleSize,
          sale,
          purchaseRate,
          sellingPrice,
          isHidden,
          closingOverride,
        });
      }
      // AC adjustments payload — only send items where BASE fields changed
      const acAdjustmentsPayload = [];
      for (const item of allComputedAcItems) {
        const e = acItemEdits[item.itemId] || {};
        const orig = data.acItems?.find(i => i.itemId === item.itemId);
        if (!orig) continue;
        // Current base values (with edits applied)
        const adjustedSaleBtl = numOrUndef(item.sold) ?? 0;
        const adjustedPurchaseCost = numOrUndef(e.purchaseCost ?? item.purchaseCost);
        const adjustedSellingPrice = numOrUndef(e.sellingPrice ?? item.sellingPrice);
        const adjustedBottleSize = numOrUndef(e.qty ?? item.qty);
        const isHidden = acHiddenFlags[item.itemId] === true;
        // Compare ONLY base fields (NOT computed consumption/saleAmount/profit/closing
        // which have floating-point rounding differences vs the backend)
        const changed =
          !numEq(adjustedSaleBtl, orig.sold ?? 0) ||
          (adjustedPurchaseCost != null && !numEq(adjustedPurchaseCost, orig.purchaseCost)) ||
          (adjustedSellingPrice != null && !numEq(adjustedSellingPrice, orig.sellingPrice)) ||
          (adjustedBottleSize != null && !numEq(adjustedBottleSize, orig.qty)) ||
          (isHidden !== (orig.isHidden === true));
        if (!changed) continue;
        // Include computed fields for the backend to store (they'll be recalculated
        // correctly from the base fields on the backend side anyway)
        acAdjustmentsPayload.push({
          itemId: item.itemId,
          adjustedSaleBtl,
          adjustedPurchaseCost,
          adjustedSellingPrice,
          adjustedBottleSize,
          adjustedConsumption: item.consumption,
          adjustedSaleAmount: item.saleAmount,
          adjustedProfit: item.profit,
          isHidden,
          adjustedClosingBtl: Number(item.closing) || 0,
        });
      }

      // Save item-wise edits (Non-AC to inventory + daily entries, AC to adjustment table)
      // Use AbortController with a 60s timeout — with dirty checking, only changed
      // items are sent, so the save should complete in a few seconds. If it takes
      // longer than 60s, something is genuinely wrong.
      const saveController = new AbortController();
      const saveTimeout = setTimeout(() => saveController.abort(), 60000);
      let itemWiseRes;
      try {
        itemWiseRes = await fetch(apiUrl('/api/bar/inventory/liquor-report-item-wise'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ date, endDate: endDate && endDate !== date ? endDate : undefined, nonAcItems: nonAcItemsPayload, acAdjustments: acAdjustmentsPayload }),
          signal: saveController.signal,
        });
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          throw new Error('Save timed out — the server took too long. Your edits are preserved. The save may have completed on the server; please refresh the date to check before retrying.');
        }
        throw new Error('Network error during save — please check your connection and try again. Your edits are preserved.');
      } finally {
        clearTimeout(saveTimeout);
      }
      if (!itemWiseRes.ok) {
        const body = await itemWiseRes.json().catch(() => ({}));
        throw new Error(body.error || `Item-wise save failed (${itemWiseRes.status})`);
      }

      // Save summary overrides (Business Position cards)
      const summaryOverrides = { ...summaryEdits };
      const hasSummaryEdits = Object.values(summaryOverrides).some(v => v != null && v !== '' && !Number.isNaN(Number(v)));
      if (hasSummaryEdits) {
        const entries = Object.entries(edits)
          .filter(([, v]) => Number(v.nonAcSales) > 0 || Number(v.nonAcLandingCost) > 0)
          .map(([categoryName, v]) => ({
            categoryName,
            nonAcSales: Number(v.nonAcSales) || 0,
            nonAcLandingCost: Number(v.nonAcLandingCost) || 0,
          }));
        await fetch(apiUrl('/api/bar/inventory/liquor-report-non-ac'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ date, entries, summaryOverrides }),
        });
      }

      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
      // ── ONLY clear pending edits after confirmed successful save ──
      clearPendingFromStorage();
      // ── Clear ALL edit states so the auto-save useEffect doesn't re-fire ──
      // The saved values are now in the backend data (refetched below).
      // Without this, summaryEdits/nonAcItemEdits/acItemEdits remain populated
      // and the auto-save effect re-marks the report as "unsaved" immediately.
      setNonAcItemEdits({});
      setAcItemEdits({});
      setNonAcHiddenFlags({});
      setAcHiddenFlags({});
      setEdits({});
      setSummaryEdits({});
      // Reload data to reflect saved state and AWAIT it so the caller
      // (handleSaveAndPrint) gets the fresh data for PDF generation.
      const freshJson = await loadData();
      // Notify parent (original inventory screen) to refresh its data
      // so both screens stay synchronized.
      if (onSaved) onSaved();
      return freshJson;
    } catch (err) {
      // ── Save FAILED: do NOT clear pending edits ──
      // The admin's entered values are still in localStorage (auto-saved
      // on every change). They will be restored on page refresh.
      // The admin can click Save again to retry.
      setError(err.message || 'Failed to save data. Your changes are preserved — click Save to retry.');
      return false;
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  };

  // ── Save & Generate PDF: save to backend first, then generate a real PDF ──
  // No window.print(), no system print dialog, no popup dependency.
  // Flow: save edits → wait for success → render report HTML off-screen →
  // html2canvas capture → jsPDF → download .pdf directly.
  const handleSaveAndPrint = async () => {
    if (!computed) return;
    setSaving(true);
    setError(null);

    // 1. Persist current edits and WAIT for the save to complete.
    //    handleSave returns the fresh JSON from the refetch (or null on failure).
    const freshJson = await handleSave();
    if (!freshJson) {
      // Save failed — handleSave already set the error message.
      // Do NOT generate a PDF from failed/unpersisted data.
      setSaving(false);
      return;
    }

    try {
      // 2. Build the report HTML from the FRESH backend data (not stale React state).
      //    handleSave saved edits → awaited loadData() → fresh JSON now reflects
      //    all saved values including any new AC sales that posted since modal open.
      const freshComputed = computeReportFromJson(freshJson);
      const html = buildPrintHtml({
        ...freshComputed,
        nonAcItems: freshComputed.nonAcItems,
        acItems: freshComputed.acItems,
        nonAcItemTotals: freshComputed.nonAcItemTotals,
        acItemTotals: freshComputed.acItemTotals,
      });

      // 3. Render the HTML into an off-screen iframe so html2canvas can
      //    capture it at a controlled width without affecting the UI.
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = '700px';
      iframe.style.height = '500px';
      iframe.style.border = 'none';
      iframe.style.background = '#ffffff';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      // Wait for the iframe content (fonts/layout) to settle.
      await new Promise(resolve => setTimeout(resolve, 400));

      const targetEl = doc.body;

      // 4. Capture the rendered report with html2canvas.
      const canvas = await html2canvas(targetEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 700,
      });

      // Remove the off-screen iframe now that we have the canvas.
      document.body.removeChild(iframe);

      // 5. Convert the canvas to a real PDF with jsPDF (A6 landscape).
      //    A6 = 148mm × 105mm (landscape). Compact size for printing.
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 148;  // A6 landscape width in mm
      const pdfHeight = 105; // A6 landscape height in mm
      const margin = 3;
      const usableWidth = pdfWidth - 2 * margin;
      const imgHeight = (canvas.height * usableWidth) / canvas.width;

      const pdf = new jsPDF('l', 'mm', 'a6');
      if (imgHeight <= pdfHeight - 2 * margin) {
        pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, imgHeight);
      } else {
        // Multi-page: split the tall image across pages.
        let remainingHeight = imgHeight;
        let yOffset = 0;
        const pageContentHeight = pdfHeight - 2 * margin;
        while (remainingHeight > 0) {
          pdf.addImage(imgData, 'PNG', margin, margin - yOffset, usableWidth, imgHeight);
          remainingHeight -= pageContentHeight;
          if (remainingHeight > 0) {
            pdf.addPage();
            yOffset += pageContentHeight;
          }
        }
      }

      // 6. Download the generated PDF directly — no print dialog.
      const filename = `Liquor-Stock-Sales-Report-${date}.pdf`;
      pdf.save(filename);

      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      setError(err?.message || 'Failed to generate PDF. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSummaryChange = (field, value) => {
    setSummaryEdits(prev => ({ ...prev, [field]: value === '' ? '' : Math.max(0, Number(value) || 0) }));
  };

  // Item-wise edit handlers — editable fields: qty, sold, purchaseCost, sellingPrice
  // Opening Stock and Purchases are read-only (from backend).
  // Calculated fields (consumption, saleAmount, profit, totalStock, closing) auto-recalculate via useMemo
  const handleNonAcItemChange = (itemId, field, value) => {
    setNonAcItemEdits(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { qty: 0, purchaseCost: 0, sellingPrice: 0, sold: 0 }),
        [field]: value === '' ? '' : Math.max(0, Number(value) || 0),
      },
    }));
  };

  const handleAcItemChange = (itemId, field, value) => {
    setAcItemEdits(prev => {
      const item = (data?.acItems || []).find(i => i.itemId === itemId);
      const defaults = {
        qty: item?.qty ?? 0,
        purchaseCost: item?.purchaseCost ?? 0,
        sellingPrice: item?.sellingPrice ?? 0,
        sold: item?.sold ?? 0,
      };
      return {
        ...prev,
        [itemId]: {
          ...defaults,
          ...(prev[itemId] || {}),
          [field]: value === '' ? '' : Math.max(0, Number(value) || 0),
        },
      };
    });
  };

  // Toggle hide/show for an AC item — persists IMMEDIATELY to InventoryItem.isHiddenFromReport
  // The hidden status is stored on the item master (not per-date), so it persists
  // across all dates, refreshes, and logout/login cycles.
  const handleAcItemToggleHide = async (itemId) => {
    // Skip unmapped POS items — they have no InventoryItem record to update
    if (!itemId || itemId.startsWith('unmapped:')) {
      alert('This item has no inventory record. Create it in Main Inventory first.');
      return;
    }
    const newHidden = !acHiddenFlags[itemId];
    // Optimistic update: toggle immediately in UI
    setAcHiddenFlags(prev => ({ ...prev, [itemId]: newHidden }));
    try {
      await toggleAcItemHide(itemId, newHidden);
    } catch (err) {
      // Revert on failure
      console.error('[LiquorReport] Failed to persist AC hide toggle:', err);
      setAcHiddenFlags(prev => ({ ...prev, [itemId]: !newHidden }));
      alert('Failed to update hide status. Please try again.');
    }
  };

  // Toggle hide/show for a Non-AC item — persists IMMEDIATELY to NonAcInventoryItem.isHiddenFromReport
  const handleNonAcItemToggleHide = async (itemId) => {
    const newHidden = !nonAcHiddenFlags[itemId];
    // Optimistic update: toggle immediately in UI
    setNonAcHiddenFlags(prev => ({ ...prev, [itemId]: newHidden }));
    try {
      await toggleNonAcItemHide(itemId, newHidden);
    } catch (err) {
      // Revert on failure
      console.error('[LiquorReport] Failed to persist Non-AC hide toggle:', err);
      setNonAcHiddenFlags(prev => ({ ...prev, [itemId]: !newHidden }));
      alert('Failed to update hide status. Please try again.');
    }
  };

  if (!open) return null;

  const outletName = data?.outletName || 'Outlet';
  const outletWing = data?.outletWing || '—';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-auto max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={20} className="text-purple-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">Liquor Stock & Sales Report</h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {outletName} — Wing: {outletWing} — {date}{endDate && endDate !== date ? ` → ${endDate}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Date range picker */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
              <span className="text-xs text-gray-500 font-medium">Range:</span>
              <input
                type="date"
                value={date || ''}
                disabled
                className="text-xs text-gray-600 bg-transparent border-none outline-none w-[7rem]"
                title="Start date (set from main inventory date)"
              />
              <span className="text-xs text-gray-400">→</span>
              <input
                type="date"
                value={endDate}
                min={date || undefined}
                onChange={(e) => { setEndDate(e.target.value); setSavedMsg(false); }}
                className="text-xs text-gray-700 bg-transparent border-none outline-none w-[7rem] cursor-pointer"
                title="End date (optional — leave empty for single date)"
              />
              {endDate && (
                <button
                  onClick={() => { setEndDate(''); setSavedMsg(false); }}
                  className="text-xs text-gray-400 hover:text-red-500"
                  title="Clear end date"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {hasPendingEdits && !savedMsg && (
              <span className="flex items-center gap-1 text-xs text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-lg" title="You have unsaved changes. They are preserved even if you refresh the page.">
                <AlertTriangle size={14} /> Unsaved
              </span>
            )}
            {savedMsg && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-bold">
                <CheckCircle size={14} /> Saved
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={loading || !!error || saving}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Save size={14} /> <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Changes'}</span><span className="sm:hidden">Save</span>
            </button>
            <button
              onClick={handleSaveAndPrint}
              disabled={loading || !!error || saving}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Printer size={14} /> <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save & Generate PDF'}</span><span className="sm:hidden">PDF</span>
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="text-red-600 text-sm font-medium">{error}</div>
              {hasPendingEdits && (
                <div className="text-amber-700 text-xs mt-1.5 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Your entered values are preserved. Click <strong>Save Changes</strong> to retry. Changes will remain even if you refresh the page.
                </div>
              )}
            </div>
          )}

          {/* AC/Non-AC info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <div className="text-xs text-blue-800">
              <span className="font-bold">Non-AC</span> = admin-entered, database-driven (editable rows · saved to manual inventory store).
              {' '}
              <span className="font-bold">AC Bar</span> = POS billing, database-driven (editable rows · adjustments saved separately, POS data preserved).
              {' '}
              Edit any row directly — Consumption, Sale Amount, and Profit auto-recalculate. Click <span className="font-bold">Save &amp; Generate PDF</span> to persist changes to the database and generate the final PDF.
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-8 bg-gray-100 rounded animate-pulse" />
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : computed ? (
            <>
              {/* No physical count banner */}
              {!computed.hasAnyPhysicalCount && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">No physical count taken on this date</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Variance shown is wastage-adjusted only (Physical Consumption − System Consumption).
                    </p>
                  </div>
                </div>
              )}

              {/* Business Position — 16 cards per spec */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Business Position
                  <span className="ml-2 text-xs font-normal text-gray-500">(all editable in preview)</span>
                </h3>
                {/* Stock Position */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
                  <EditableSummaryCard label="Opening Stock Value" field="openingStockValue" value={computed.summary.openingStockValue} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Purchase Value" field="purchaseValue" value={computed.summary.purchaseValue} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Consumption" field="consumption" value={computed.summary.consumption} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Closing Stock Value" field="closingStockValue" value={computed.summary.closingStockValue} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                </div>
                {/* AC */}
                <div className="text-[10px] font-bold text-blue-400 uppercase mb-1">AC (POS)</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
                  <EditableSummaryCard label="AC Sales" field="acSales" value={computed.summary.acSales} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" badge="AC" />
                  <EditableSummaryCard label="AC Consumption" field="acConsumption" value={computed.summary.acConsumption} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="AC Profit" field="acProfit" value={computed.summary.acProfit} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="AC Profit %" field="acProfitPct" value={computed.summary.acProfitPct} edits={summaryEdits} onChange={handleSummaryChange} suffix="%" />
                </div>
                {/* Non-AC */}
                <div className="text-[10px] font-bold text-orange-400 uppercase mb-1">Non-AC (Admin)</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
                  <EditableSummaryCard label="Non-AC Sales" field="nonAcSales" value={computed.summary.nonAcSales} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" badge="Manual" />
                  <EditableSummaryCard label="Non-AC Consumption" field="nonAcConsumption" value={computed.summary.nonAcConsumption} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Non-AC Profit" field="nonAcProfit" value={computed.summary.nonAcProfit} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Non-AC Profit %" field="nonAcProfitPct" value={computed.summary.nonAcProfitPct} edits={summaryEdits} onChange={handleSummaryChange} suffix="%" />
                </div>
                {/* Total */}
                <div className="text-[10px] font-bold text-green-500 uppercase mb-1">AC + Non-AC</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <EditableSummaryCard label="AC + Non-AC Sales" field="totalSales" value={computed.summary.totalSales} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="AC + Non-AC Consumption" field="totalConsumption" value={computed.summary.totalConsumption} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="AC + Non-AC Profit" field="totalProfit" value={computed.summary.totalProfit} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="AC + Non-AC Profit %" field="totalProfitPct" value={computed.summary.totalProfitPct} edits={summaryEdits} onChange={handleSummaryChange} suffix="%" />
                </div>
              </div>

              {/* ── Item-wise Non-AC Table (editable rows) ── */}
              {allComputedNonAcItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-orange-700 mb-3">
                    Non-AC Detailed Item-wise Report
                    <span className="ml-2 text-xs font-normal text-gray-500">(admin-entered · database-driven · editable rows)</span>
                    {allComputedNonAcItems.some(i => i.isHidden) && (
                      <span className="ml-2 text-xs font-normal text-amber-600">
                        ({allComputedNonAcItems.filter(i => i.isHidden).length} hidden)
                      </span>
                    )}
                  </h3>
                  <div className="overflow-x-auto border border-gray-100 rounded-lg">
                    <table className="w-full text-xs min-w-[1100px]">
                      <thead className="bg-orange-50">
                        <tr>
                          <th className="text-center px-2 py-2 font-bold text-orange-700 uppercase tracking-wide w-10">S.No</th>
                          <th className="text-left px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Item Name</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Qty (ml)</th>
                          <th className="text-right px-2 py-2 font-bold text-orange-700 uppercase tracking-wide">Sold</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Selling Rate</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Sale Amount</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Purchase Rate</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Consumption</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Profit</th>
                          <th className="text-center px-2 py-2 font-bold text-orange-700 uppercase tracking-wide w-16">Hide</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allComputedNonAcItems.map((item) => (
                          <tr key={`nonac-${item.itemId}`} className={`border-t border-gray-50 hover:bg-orange-50/30 ${item.isHidden ? 'opacity-40 bg-gray-50' : ''}`}>
                            <td className="px-2 py-2 text-center text-gray-500">{item.sno}</td>
                            <td className="px-3 py-2 text-gray-800 font-medium">
                              {item.itemName}
                              {item.hasMissingPrice && <span className="ml-1 text-[9px] text-red-500" title="Missing purchase cost">⚠</span>}
                              {item.hasMissingSellingPrice && <span className="ml-1 text-[9px] text-red-500" title="Missing selling price">⚠</span>}
                            </td>
                            {/* Qty (ml) — editable */}
                            <td className="px-3 py-2 text-right bg-orange-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={nonAcItemEdits[item.itemId]?.qty ?? ''}
                                onChange={(e) => handleNonAcItemChange(item.itemId, 'qty', e.target.value)}
                                className="w-20 text-right text-xs px-1 py-0.5 border border-orange-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Sold — editable */}
                            <td className="px-2 py-2 text-right bg-orange-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={nonAcItemEdits[item.itemId]?.sold ?? ''}
                                onChange={(e) => handleNonAcItemChange(item.itemId, 'sold', e.target.value)}
                                className="w-16 text-right text-xs px-1 py-0.5 border border-orange-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Selling Rate — editable */}
                            <td className="px-3 py-2 text-right bg-orange-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={nonAcItemEdits[item.itemId]?.sellingPrice ?? ''}
                                onChange={(e) => handleNonAcItemChange(item.itemId, 'sellingPrice', e.target.value)}
                                className="w-24 text-right text-xs px-1 py-0.5 border border-orange-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Sale Amount — auto-calculated: Sold × Selling Rate */}
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(item.saleAmount)}</td>
                            {/* Purchase Rate — editable */}
                            <td className="px-3 py-2 text-right bg-orange-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={nonAcItemEdits[item.itemId]?.purchaseCost ?? ''}
                                onChange={(e) => handleNonAcItemChange(item.itemId, 'purchaseCost', e.target.value)}
                                className="w-24 text-right text-xs px-1 py-0.5 border border-orange-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Consumption — auto-calculated: Sold × Purchase Rate */}
                            <td className="px-3 py-2 text-right text-gray-700">{fmtInr(item.consumption)}</td>
                            {/* Profit — auto-calculated: Sale Amount − Consumption */}
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(item.profit)}</td>
                            {/* Hide/Show toggle — persists on NonAcInventoryItem.isHiddenFromReport */}
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleNonAcItemToggleHide(item.itemId)}
                                className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                                  item.isHidden
                                    ? 'bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-700'
                                    : 'bg-orange-100 text-orange-700 hover:bg-gray-200 hover:text-gray-600'
                                }`}
                                title={item.isHidden ? 'Click to show in PDF' : 'Click to hide from PDF'}
                              >
                                {item.isHidden ? 'Show' : 'Hide'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-orange-200 bg-orange-50 font-bold">
                          <td colSpan={3} className="px-3 py-2 text-gray-900">TOTAL (visible items only)</td>
                          <td className="px-2 py-2 text-right text-gray-700">{fmtQty(computedNonAcTotals.sold)}</td>
                          <td className="px-2 py-2 text-right text-gray-700">{fmtQty(computedNonAcTotals.closing)}</td>
                          <td className="px-3 py-2 text-right text-gray-400"></td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedNonAcTotals.saleAmount)}</td>
                          <td className="px-3 py-2 text-right text-gray-400"></td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedNonAcTotals.consumption)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedNonAcTotals.profit)}</td>
                          <td className="px-2 py-2"></td>
                        </tr>
                        <tr className="bg-orange-50/50">
                          <td colSpan={5} className="px-3 py-1 text-right text-xs text-gray-500 font-medium">Profit Margin %</td>
                          <td className="px-3 py-1 text-right text-xs text-gray-900 font-bold">{fmtPct(computedNonAcTotals.profitMarginPct)}</td>
                          <td className="px-2 py-1"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Item-wise AC Bar Table (editable rows) ── */}
              {allComputedAcItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-blue-700 mb-3">
                    AC Bar Detailed Item-wise Report
                    <span className="ml-2 text-xs font-normal text-gray-500">(POS billing · database-driven · editable rows)</span>
                    {allComputedAcItems.some(i => i.isHidden) && (
                      <span className="ml-2 text-xs font-normal text-amber-600">
                        ({allComputedAcItems.filter(i => i.isHidden).length} hidden)
                      </span>
                    )}
                  </h3>
                  <div className="overflow-x-auto border border-gray-100 rounded-lg">
                    <table className="w-full text-xs min-w-[1100px]">
                      <thead className="bg-blue-50">
                        <tr>
                          <th className="text-center px-2 py-2 font-bold text-blue-700 uppercase tracking-wide w-10">S.No</th>
                          <th className="text-left px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Item Name</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Qty</th>
                          <th className="text-right px-2 py-2 font-bold text-blue-700 uppercase tracking-wide">Sale</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Purchase Cost</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Consumption</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Selling Price</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Sale Amount</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Profit</th>
                          <th className="text-center px-2 py-2 font-bold text-blue-700 uppercase tracking-wide w-16">Hide</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allComputedAcItems.map((item) => (
                          <tr key={`ac-${item.itemId}`} className={`border-t border-gray-50 hover:bg-blue-50/30 ${item.isHidden ? 'opacity-40 bg-gray-50' : ''}`}>
                            <td className="px-2 py-2 text-center text-gray-500">{item.sno}</td>
                            <td className="px-3 py-2 text-gray-800 font-medium">
                              {item.itemName}
                              {item.hasMissingPrice && <span className="ml-1 text-[9px] text-red-500" title="Missing purchase cost">⚠</span>}
                              {item.hasMissingBottleSize && <span className="ml-1 text-[9px] text-red-500" title="Missing bottle size">⚠</span>}
                              {item.hasMissingSellingPrice && <span className="ml-1 text-[9px] text-red-500" title="No selling price set">⚠</span>}
                            </td>
                            {/* Qty — editable */}
                            <td className="px-3 py-2 text-right bg-blue-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={acItemEdits[item.itemId]?.qty ?? ''}
                                onChange={(e) => handleAcItemChange(item.itemId, 'qty', e.target.value)}
                                className="w-20 text-right text-xs px-1 py-0.5 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Sale — editable, shows displaySale (pegs/bottles) */}
                            <td className="px-2 py-2 text-right bg-blue-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={acItemEdits[item.itemId]?.sold != null ? acItemEdits[item.itemId].sold : (item.displaySale ?? item.sold ?? '')}
                                onChange={(e) => handleAcItemChange(item.itemId, 'sold', e.target.value)}
                                className="w-16 text-right text-xs px-1 py-0.5 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Purchase Cost — editable */}
                            <td className="px-3 py-2 text-right bg-blue-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={acItemEdits[item.itemId]?.purchaseCost ?? ''}
                                onChange={(e) => handleAcItemChange(item.itemId, 'purchaseCost', e.target.value)}
                                className="w-24 text-right text-xs px-1 py-0.5 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Consumption — auto-calculated */}
                            <td className="px-3 py-2 text-right text-gray-700">{fmtInr(item.consumption)}</td>
                            {/* Selling Price — editable */}
                            <td className="px-3 py-2 text-right bg-blue-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={acItemEdits[item.itemId]?.sellingPrice ?? ''}
                                onChange={(e) => handleAcItemChange(item.itemId, 'sellingPrice', e.target.value)}
                                className="w-24 text-right text-xs px-1 py-0.5 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Sale Amount — from backend */}
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(item.saleAmount)}</td>
                            {/* Profit — auto-calculated */}
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(item.profit)}</td>
                            {/* Hide/Show toggle — persists on InventoryItem.isHiddenFromReport */}
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleAcItemToggleHide(item.itemId)}
                                disabled={!item.itemId || item.itemId.startsWith('unmapped:')}
                                className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                                  item.isHidden
                                    ? 'bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-700'
                                    : 'bg-blue-100 text-blue-700 hover:bg-gray-200 hover:text-gray-600'
                                }`}
                                title={!item.itemId || item.itemId.startsWith('unmapped:') ? 'No inventory record — create in Main Inventory first' : (item.isHidden ? 'Click to show in PDF' : 'Click to hide from PDF')}
                              >
                                {item.isHidden ? 'Show' : 'Hide'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-blue-200 bg-blue-50 font-bold">
                          <td colSpan={3} className="px-3 py-2 text-gray-900">TOTAL (visible items only)</td>
                          <td className="px-2 py-2 text-right text-gray-700">{fmtQty(computedAcTotals.sold)}</td>
                          <td className="px-3 py-2 text-right text-gray-400"></td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedAcTotals.consumption)}</td>
                          <td className="px-3 py-2 text-right text-gray-400"></td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedAcTotals.saleAmount)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedAcTotals.profit)}</td>
                          <td className="px-2 py-2"></td>
                        </tr>
                        <tr className="bg-blue-50/50">
                          <td colSpan={9} className="px-3 py-1 text-right text-xs text-gray-500 font-medium">Profit Margin %</td>
                          <td className="px-3 py-1 text-right text-xs text-gray-900 font-bold">{fmtPct(computedAcTotals.profitMarginPct)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Per-Bottle Stock Summary section removed per admin request ── */}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

function EditableSummaryCard({ label, field, value, edits, onChange, suffix, badge }) {
  const editValue = edits[field];
  const rawVal = editValue != null ? editValue : value;
  const displayVal = (rawVal != null && rawVal !== '' && !Number.isNaN(Number(rawVal))) ? Math.ceil(Number(rawVal)) : rawVal;
  return (
    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 min-w-0 border border-gray-200">
      <div className="flex items-center gap-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold truncate">{label}</div>
        {badge && (
          <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${badge === 'AC' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1">
        {suffix === '₹' && <span className="text-xs text-gray-500 font-bold">₹</span>}
        <input
          type="number"
          min="0"
          step="any"
          value={displayVal ?? ''}
          onChange={(e) => onChange(field, e.target.value)}
          className="w-full text-sm sm:text-base font-black text-gray-900 bg-white border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
        />
        {suffix === 'ml' && <span className="text-[10px] text-gray-500 font-bold shrink-0">ml</span>}
        {suffix === '%' && <span className="text-[10px] text-gray-500 font-bold shrink-0">%</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Print HTML — A4 landscape, proper pagination, repeating table headers.
// AC = System/POS (blue), Non-AC = Manual (orange).
// ─────────────────────────────────────────────────────────────────────────────
function buildPrintHtml(data) {
  const { outletName, outletWing, date, endDate, nonAcItems, acItems, nonAcItemTotals, acItemTotals, summary } = data;

  const fmtInrP = (n) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPctP = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;

  const fmtQtyP = (n) => n == null || n <= 0 ? '—' : `${Number(n).toFixed(0)} ml`;
  const fmtBtlP = (n) => n == null || n <= 0 ? '—' : Number(n).toFixed(2);
  // Stock flow bottle quantity (show 0 explicitly, not —, for stock columns)
  const fmtStockP = (n) => n == null || Number.isNaN(Number(n)) ? '0' : Number(n).toFixed(2);

  // ── Business Position summary cards (matches the admin preview — 16 cards) ──
  const ceilVal = (v) => (v != null && !Number.isNaN(Number(v))) ? Math.ceil(Number(v)) : v;
  const summaryCard = (label, value, suffix, badge) => {
    const rv = ceilVal(value);
    return `
    <div class="bp-card${badge ? ` bp-${badge.toLowerCase()}` : ''}">
      <div class="bp-label">${label}${badge ? ` <span class="bp-badge bp-${badge.toLowerCase()}">${badge}</span>` : ''}</div>
      <div class="bp-value">${rv == null ? '—' : (suffix === '₹' ? `₹${Number(rv).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : (suffix === '%' ? `${Number(rv).toFixed(0)}%` : `${Number(rv).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`))}</div>
    </div>`;
  };

  const stockPositionHtml = summary ? `
<div class="section-title first">Business Position — Stock</div>
<div class="bp-grid">
  ${summaryCard('Opening Stock Value', summary.openingStockValue, '₹')}
  ${summaryCard('Purchase Value', summary.purchaseValue, '₹')}
  ${summaryCard('Consumption', summary.consumption, '₹')}
  ${summaryCard('Closing Stock Value', summary.closingStockValue, '₹')}
</div>` : '';

  const acPositionHtml = summary ? `
<div class="section-title">Business Position — AC (POS)</div>
<div class="bp-grid">
  ${summaryCard('AC Sales', summary.acSales, '₹', 'AC')}
  ${summaryCard('AC Consumption', summary.acConsumption, '₹')}
  ${summaryCard('AC Profit', summary.acProfit, '₹')}
  ${summaryCard('AC Profit %', summary.acProfitPct, '%')}
</div>` : '';

  const nonAcPositionHtml = summary ? `
<div class="section-title">Business Position — Non-AC (Admin)</div>
<div class="bp-grid">
  ${summaryCard('Non-AC Sales', summary.nonAcSales, '₹', 'Manual')}
  ${summaryCard('Non-AC Consumption', summary.nonAcConsumption, '₹')}
  ${summaryCard('Non-AC Profit', summary.nonAcProfit, '₹')}
  ${summaryCard('Non-AC Profit %', summary.nonAcProfitPct, '%')}
</div>` : '';

  const totalPositionHtml = summary ? `
<div class="section-title">Business Position — AC + Non-AC</div>
<div class="bp-grid">
  ${summaryCard('AC + Non-AC Sales', summary.totalSales, '₹')}
  ${summaryCard('AC + Non-AC Consumption', summary.totalConsumption, '₹')}
  ${summaryCard('AC + Non-AC Profit', summary.totalProfit, '₹')}
  ${summaryCard('AC + Non-AC Profit %', summary.totalProfitPct, '%')}
</div>` : '';

  const businessPositionHtml = [stockPositionHtml, acPositionHtml, nonAcPositionHtml, totalPositionHtml].join('\n');

  // ── Item-wise Non-AC rows ──
  const nonAcItemRows = (nonAcItems || []).map((item) => `
    <tr>
      <td class="num">${item.sno}</td>
      <td class="cat">${escapeHtml(item.itemName)}${item.hasMissingPrice ? ' <span class="warn">⚠</span>' : ''}${item.hasMissingSellingPrice ? ' <span class="warn">⚠</span>' : ''}</td>
      <td class="num">${fmtQtyP(item.qty)}</td>
      <td class="num">${fmtBtlP(item.sold)}</td>
      <td class="num">${item.sellingPrice > 0 ? fmtInrP(item.sellingPrice) : '—'}</td>
      <td class="num bold">${fmtInrP(item.saleAmount)}</td>
      <td class="num">${item.purchaseCost > 0 ? fmtInrP(item.purchaseCost) : '—'}</td>
      <td class="num">${fmtInrP(item.consumption)}</td>
      <td class="num bold">${fmtInrP(item.profit)}</td>
    </tr>
  `).join('\n');

  // ── Item-wise AC rows (matches exact image format) ──
  const acItemRows = (acItems || []).map((item) => `
    <tr>
      <td class="num">${item.sno}</td>
      <td class="cat">${escapeHtml(item.itemName)}${item.hasMissingPrice ? ' <span class="warn">⚠</span>' : ''}${item.hasMissingBottleSize ? ' <span class="warn">⚠</span>' : ''}${item.hasMissingSellingPrice ? ' <span class="warn">⚠</span>' : ''}</td>
      <td class="num">${fmtQtyP(item.qty)}</td>
      <td class="num">${item.displaySale != null ? fmtQty(item.displaySale) : fmtBtlP(item.sold)}</td>
      <td class="num">${item.purchaseCost > 0 ? fmtInrP(item.purchaseCost) : '—'}</td>
      <td class="num">${fmtInrP(item.consumption)}</td>
      <td class="num">${item.sellingPrice > 0 ? fmtInrP(item.sellingPrice) : '—'}</td>
      <td class="num bold">${fmtInrP(item.saleAmount)}</td>
      <td class="num bold">${fmtInrP(item.profit)}</td>
    </tr>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Liquor Stock & Sales Report — ${escapeHtml(outletName)} — ${date}</title>
<style>
  @page {
    size: A6 landscape;
    margin: 4mm 3mm 5mm 3mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1a1a1a;
    font-size: 6px;
    line-height: 1.2;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 5px;
    margin-bottom: 8px;
  }
  .header h1 { font-size: 10px; font-weight: 800; }
  .header .sub { font-size: 7px; color: #555; margin-top: 1px; }
  .header .date { font-size: 6px; color: #777; margin-top: 1px; }

  .info-banner {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 3px;
    padding: 4px 8px;
    margin-bottom: 8px;
    font-size: 5px;
    color: #1e40af;
  }

  .section-title {
    font-size: 8px;
    font-weight: 700;
    margin: 8px 0 4px 0;
    color: #1a1a1a;
    border-bottom: 1px solid #d1d5db;
    padding-bottom: 2px;
  }
  .section-title.first { margin-top: 0; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    table-layout: fixed;
  }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  tr { page-break-inside: avoid; }
  th {
    background: #f3f4f6;
    text-align: right;
    padding: 3px 4px;
    font-size: 5px;
    font-weight: 700;
    text-transform: uppercase;
    color: #4b5563;
    border: 1px solid #e5e7eb;
    letter-spacing: 0.2px;
  }
  th.cat { text-align: left; }
  th.ac { color: #1e40af; }
  th.nonac { color: #9a3412; }
  td {
    padding: 2px 3px;
    font-size: 6px;
    border: 1px solid #e5e7eb;
    color: #374151;
    word-wrap: break-word;
  }
  td.cat { text-align: left; font-weight: 600; }
  td.num { text-align: right; }
  td.bold { font-weight: 700; color: #111827; }
  td.ac { background: #eff6ff; color: #1e40af; }
  td.nonac { background: #fff7ed; color: #9a3412; }
  .variance-warn { color: #dc2626; font-weight: 700; }
  .warn { color: #dc2626; font-size: 5px; }

  tfoot td {
    background: #f3f4f6;
    font-weight: 800;
    color: #111827;
    border-top: 2px solid #9ca3af;
  }

  .page-break { page-break-before: always; }

  /* Keep both detailed item-wise tables together on one page,
     starting on a fresh page after the Business Position summary. */
  .detailed-section {
    page-break-before: always;
    page-break-inside: avoid;
  }

  /* Business Position summary cards */
  .bp-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-bottom: 8px;
  }
  .bp-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 3px;
    padding: 4px 6px;
  }
  .bp-card.bp-ac { background: #eff6ff; border-color: #bfdbfe; }
  .bp-card.bp-manual { background: #fff7ed; border-color: #fed7aa; }
  .bp-label {
    font-size: 4.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    color: #6b7280;
  }
  .bp-badge {
    display: inline-block;
    font-size: 4px;
    padding: 0 2px;
    border-radius: 2px;
    font-weight: 700;
    margin-left: 2px;
  }
  .bp-badge.bp-ac { background: #dbeafe; color: #1e40af; }
  .bp-badge.bp-manual { background: #ffedd5; color: #9a3412; }
  .bp-value {
    font-size: 7.5px;
    font-weight: 800;
    color: #111827;
    margin-top: 1px;
  }

  .footer {
    margin-top: 6px;
    padding-top: 3px;
    border-top: 1px solid #d1d5db;
    font-size: 5px;
    color: #6b7280;
    text-align: center;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>Liquor Stock &amp; Sales Report</h1>
  <div class="sub">${escapeHtml(outletName)} — Wing: ${escapeHtml(outletWing || '—')}</div>
  <div class="date">Report Date: ${date}${endDate && endDate !== date ? ` → ${endDate}` : ''}</div>
</div>

<div class="info-banner">
  Non-AC = admin-entered, database-driven · AC Bar = POS billing, database-driven.
  All values reflect the latest saved database data.
</div>

${/* ── Business Position summary (FIRST) ── */ ''}
${businessPositionHtml}

${/* ── Detailed Item-wise Tables (Non-AC + AC together on one page) ── */ ''}
<div class="detailed-section">
<div class="section-title">Non-AC Detailed Item-wise Report</div>
${(nonAcItems && nonAcItems.length > 0) ? `
<table>
  <colgroup>
    <col style="width: 5%">
    <col style="width: 20%">
    <col style="width: 8%">
    <col style="width: 8%">
    <col style="width: 12%">
    <col style="width: 13%">
    <col style="width: 11%">
    <col style="width: 12%">
    <col style="width: 11%">
  </colgroup>
  <thead>
    <tr>
      <th>S.No</th>
      <th class="cat">Item Name</th>
      <th>Qty (ml)</th>
      <th>Sold</th>
      <th>Selling Rate</th>
      <th>Sale Amount</th>
      <th>Purchase Rate</th>
      <th>Consumption</th>
      <th>Profit</th>
    </tr>
  </thead>
  <tbody>
    ${nonAcItemRows}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3" class="cat">TOTAL</td>
      <td class="num">${fmtStockP(nonAcItemTotals?.sold || 0)}</td>
      <td class="num"></td>
      <td class="num">${fmtInrP(nonAcItemTotals?.saleAmount || 0)}</td>
      <td class="num"></td>
      <td class="num">${fmtInrP(nonAcItemTotals?.consumption || 0)}</td>
      <td class="num">${fmtInrP(nonAcItemTotals?.profit || 0)}</td>
    </tr>
    <tr>
      <td colspan="8" class="num" style="text-align:right;font-size:5px;color:#666;">Profit Margin %</td>
      <td class="num" style="font-weight:700;">${fmtPctP(nonAcItemTotals?.profitMarginPct || 0)}</td>
    </tr>
  </tfoot>
</table>
` : '<p style="font-size:5px;color:#999;padding:4px 0;">No Non-AC items with activity on this date.</p>'}

${/* ── Item-wise AC Bar Table ── */ ''}
<div class="section-title" style="margin-top:12px;">AC Bar Detailed Item-wise Report</div>
${(acItems && acItems.length > 0) ? `
<table>
  <colgroup>
    <col style="width: 5%">
    <col style="width: 20%">
    <col style="width: 8%">
    <col style="width: 8%">
    <col style="width: 12%">
    <col style="width: 13%">
    <col style="width: 11%">
    <col style="width: 12%">
    <col style="width: 11%">
  </colgroup>
  <thead>
    <tr>
      <th>S.No</th>
      <th class="cat">Item Name</th>
      <th>Qty</th>
      <th>Sale</th>
      <th>Purchase Cost</th>
      <th>Consumption</th>
      <th>Selling Price</th>
      <th>Sale Amount</th>
      <th>Profit</th>
    </tr>
  </thead>
  <tbody>
    ${acItemRows}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3" class="cat">TOTAL</td>
      <td class="num">${fmtStockP(acItemTotals?.sold || 0)}</td>
      <td class="num"></td>
      <td class="num">${fmtInrP(acItemTotals?.consumption || 0)}</td>
      <td class="num"></td>
      <td class="num">${fmtInrP(acItemTotals?.saleAmount || 0)}</td>
      <td class="num bold">${fmtInrP(acItemTotals?.profit || 0)}</td>
    </tr>
    <tr>
      <td colspan="8" class="num" style="text-align:right;font-size:5px;color:#666;">Profit Margin %</td>
      <td class="num" style="font-weight:700;">${fmtPctP(acItemTotals?.profitMarginPct || 0)}</td>
    </tr>
  </tfoot>
</table>
` : '<p style="font-size:5px;color:#999;padding:4px 0;">No AC items with sales on this date.</p>'}
</div><!-- /.detailed-section -->

${/* ── Per-Bottle Stock Summary section removed per admin request ── */ ''}

<div class="footer">
  Stock Position: Opening Stock Value = Opening × Purchase Rate · Purchase Value = Purchases × Purchase Rate · Consumption = Sold × Purchase Rate<br>
  Profitability: AC Profit = AC Sales − AC Consumption · Non-AC Profit = Non-AC Sales − Non-AC Consumption · Total Profit = AC Profit + Non-AC Profit · Profit % = Profit ÷ Sales × 100<br>
  AC = POS billing (Vgrand Lounge) · Non-AC = Admin-entered · All values reflect the latest saved database data.
</div>

</body>
</html>`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
