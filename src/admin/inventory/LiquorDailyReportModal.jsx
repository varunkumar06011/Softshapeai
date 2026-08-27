// ─────────────────────────────────────────────────────────────────────────────
// LiquorDailyReportModal — "PDF to Admin" item-wise liquor report
// ─────────────────────────────────────────────────────────────────────────────
// Contains ONLY two detailed item-wise reports:
//   1. Non-AC Detailed Item-wise Report (admin-entered · database-driven · editable)
//   2. AC Bar Detailed Item-wise Report (POS billing · database-driven · editable)
//
// Both tables have columns: S.No | Item Name | Qty (ml) | Sale (btl) | Purchase Cost
//   | Consumption | Selling Price | Sale Amount | Profit
//
// Every row is editable in the admin preview. Calculated fields auto-recalculate:
//   Consumption = Sale × Purchase Cost
//   Sale Amount = Sale × Selling Price
//   Profit = Sale Amount − Consumption
//
// Save & Generate PDF:
//   - Non-AC edits persist to non_ac_inventory_items + non_ac_daily_entries
//   - AC edits persist to ac_report_adjustments (separate from POS data)
//   - PDF contains only the two item-wise tables
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Printer, AlertTriangle, FileText, Save, CheckCircle } from 'lucide-react';
import { apiUrl, getAuthHeaders } from '../../services/apiConfig';

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
}

function fmtPct(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(1)}%`;
}

const SAFE_DIV = (a, b) => (b > 0 ? a / b * 100 : 0);

export default function LiquorDailyReportModal({ open, date, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Editable entries: { [categoryName]: { acSales, acLandingCost, nonAcSales, nonAcLandingCost } }
  const [edits, setEdits] = useState({});
  // Editable summary overrides
  const [summaryEdits, setSummaryEdits] = useState({});
  // Item-wise edits for Non-AC: { [itemId]: { qty, sale, purchaseCost, sellingPrice } }
  const [nonAcItemEdits, setNonAcItemEdits] = useState({});
  // Item-wise edits for AC: { [itemId]: { qty, sale, purchaseCost, sellingPrice } }
  const [acItemEdits, setAcItemEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const loadData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      const res = await fetch(apiUrl(`/api/bar/inventory/liquor-daily-report?${params.toString()}`), {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const json = await res.json();
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
      const nonAcInit = {};
      for (const item of (json.nonAcItems || [])) {
        nonAcInit[item.itemId] = {
          qty: item.qty ?? 0,
          sale: item.sale ?? 0,
          purchaseCost: item.purchaseCost ?? 0,
          sellingPrice: item.sellingPrice ?? 0,
        };
      }
      setNonAcItemEdits(nonAcInit);

      const acInit = {};
      for (const item of (json.acItems || [])) {
        acInit[item.itemId] = {
          qty: item.qty ?? 0,
          sale: item.sale ?? 0,
          purchaseCost: item.purchaseCost ?? 0,
          sellingPrice: item.sellingPrice ?? 0,
        };
      }
      setAcItemEdits(acInit);

      // Restore summary overrides from the response (already applied to summary by backend)
      // We don't set summaryEdits here because the backend already applied them to summary values.
      // The inputs will show the backend-provided values (which include overrides).
    } catch (err) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [open, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Live recalculation with AC + Non-AC edits ──
  const computed = useMemo(() => {
    if (!data) return null;
    const cats = (data.categories || []).map((c) => {
      const edit = edits[c.categoryName] || { acSales: c.acRevenue, acLandingCost: c.acConsumptionCost, nonAcSales: 0, nonAcLandingCost: 0 };
      const acRevenue = Number(edit.acSales) || 0;
      const acConsumptionCost = Number(edit.acLandingCost) || 0;
      const nonAcSales = Number(edit.nonAcSales) || 0;
      const nonAcLandingCost = Number(edit.nonAcLandingCost) || 0;
      const totalSales = acRevenue + nonAcSales;
      const acProfit = acRevenue - acConsumptionCost;
      const nonAcProfit = nonAcSales - nonAcLandingCost;
      const totalProfit = acProfit + nonAcProfit;
      return {
        ...c,
        acRevenue,
        acConsumptionCost,
        nonAcRevenue: nonAcSales,
        nonAcConsumptionCost: nonAcLandingCost,
        sales: totalSales,
        acProfit: Math.round(acProfit * 100) / 100,
        nonAcProfit: Math.round(nonAcProfit * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        acProfitPct: Math.round(SAFE_DIV(acProfit, acRevenue) * 100) / 100,
        nonAcProfitPct: Math.round(SAFE_DIV(nonAcProfit, nonAcSales) * 100) / 100,
        totalProfitPct: Math.round(SAFE_DIV(totalProfit, totalSales) * 100) / 100,
      };
    });

    // Add categories that only exist in edits (not in POS)
    for (const [catName, edit] of Object.entries(edits)) {
      if (!cats.find(c => c.categoryName === catName) && (Number(edit.nonAcSales) > 0 || Number(edit.nonAcLandingCost) > 0 || Number(edit.acSales) > 0)) {
        const acRevenue = Number(edit.acSales) || 0;
        const acConsumptionCost = Number(edit.acLandingCost) || 0;
        const nonAcSales = Number(edit.nonAcSales) || 0;
        const nonAcLandingCost = Number(edit.nonAcLandingCost) || 0;
        const totalSales = acRevenue + nonAcSales;
        const acProfit = acRevenue - acConsumptionCost;
        const nonAcProfit = nonAcSales - nonAcLandingCost;
        cats.push({
          categoryName: catName,
          openingMl: 0, purchasedMl: 0, closingMl: 0,
          physicalConsumptionMl: 0, systemConsumptionMl: 0, varianceMl: 0,
          stockValue: 0,
          acRevenue, acConsumptionCost,
          nonAcRevenue: nonAcSales, nonAcConsumptionCost: nonAcLandingCost,
          sales: totalSales,
          acProfit: Math.round(acProfit * 100) / 100,
          nonAcProfit: Math.round(nonAcProfit * 100) / 100,
          totalProfit: Math.round((acProfit + nonAcProfit) * 100) / 100,
          acProfitPct: Math.round(SAFE_DIV(acProfit, acRevenue) * 100) / 100,
          nonAcProfitPct: Math.round(SAFE_DIV(nonAcProfit, nonAcSales) * 100) / 100,
          totalProfitPct: Math.round(SAFE_DIV(acProfit + nonAcProfit, totalSales) * 100) / 100,
        });
      }
    }

    const totalAcRevenue = cats.reduce((s, c) => s + c.acRevenue, 0);
    const totalNonAcRevenue = cats.reduce((s, c) => s + c.nonAcRevenue, 0);
    const totalAcConsumptionCost = cats.reduce((s, c) => s + c.acConsumptionCost, 0);
    const totalNonAcConsumptionCost = cats.reduce((s, c) => s + c.nonAcConsumptionCost, 0);
    const totalAcProfit = Math.round((totalAcRevenue - totalAcConsumptionCost) * 100) / 100;
    const totalNonAcProfit = Math.round((totalNonAcRevenue - totalNonAcConsumptionCost) * 100) / 100;
    const totalProfit = totalAcProfit + totalNonAcProfit;
    const netSales = totalAcRevenue + totalNonAcRevenue;

    // Apply summary overrides — every business position card is editable.
    // If a field has been edited, use the edited value; otherwise use computed.
    const s = summaryEdits;
    const pick = (field, fallback) => (s[field] != null && s[field] !== '' && !Number.isNaN(Number(s[field]))) ? Number(s[field]) : fallback;

    const summary = {
      ...data.summary,
      totalOpeningStockValue: Math.round(pick('totalOpeningStockValue', data.summary.totalOpeningStockValue) * 100) / 100,
      totalPurchasesValue: Math.round(pick('totalPurchasesValue', data.summary.totalPurchasesValue) * 100) / 100,
      totalClosingStockValue: Math.round(pick('totalClosingStockValue', data.summary.totalClosingStockValue) * 100) / 100,
      totalGrossSales: Math.round(pick('totalGrossSales', data.summary.totalGrossSales) * 100) / 100,
      totalDiscounts: Math.round(pick('totalDiscounts', data.summary.totalDiscounts) * 100) / 100,
      totalPhysicalConsumption: Math.round(pick('totalPhysicalConsumption', data.summary.totalPhysicalConsumption) * 100) / 100,
      totalSystemConsumption: Math.round(pick('totalSystemConsumption', data.summary.totalSystemConsumption) * 100) / 100,
      totalConsumptionCost: Math.round(pick('totalConsumptionCost', totalAcConsumptionCost + totalNonAcConsumptionCost) * 100) / 100,
      netSales: Math.round(pick('netSales', netSales) * 100) / 100,
      totalGrossProfit: Math.round(pick('totalGrossProfit', totalProfit) * 100) / 100,
      totalAcRevenue: Math.round(pick('totalAcRevenue', totalAcRevenue) * 100) / 100,
      totalNonAcRevenue: Math.round(pick('totalNonAcRevenue', totalNonAcRevenue) * 100) / 100,
      totalAcConsumptionCost: Math.round(pick('totalAcConsumptionCost', totalAcConsumptionCost) * 100) / 100,
      totalNonAcConsumptionCost: Math.round(pick('totalNonAcConsumptionCost', totalNonAcConsumptionCost) * 100) / 100,
      totalAcProfit: Math.round(pick('totalAcProfit', totalAcProfit) * 100) / 100,
      totalNonAcProfit: Math.round(pick('totalNonAcProfit', totalNonAcProfit) * 100) / 100,
      totalProfit: Math.round(pick('totalProfit', totalProfit) * 100) / 100,
      totalAcProfitPct: Math.round(pick('totalAcProfitPct', SAFE_DIV(totalAcProfit, totalAcRevenue)) * 100) / 100,
      totalNonAcProfitPct: Math.round(pick('totalNonAcProfitPct', SAFE_DIV(totalNonAcProfit, totalNonAcRevenue)) * 100) / 100,
      totalProfitPct: Math.round(pick('totalProfitPct', SAFE_DIV(totalProfit, netSales)) * 100) / 100,
      totalVarianceMl: Math.round(pick('totalVarianceMl', pick('totalPhysicalConsumption', data.summary.totalPhysicalConsumption) - pick('totalSystemConsumption', data.summary.totalSystemConsumption)) * 100) / 100,
    };

    return { ...data, categories: cats, summary };
  }, [data, edits, summaryEdits]);

  // ── Computed item-wise values with live recalculation from edits ──
  // For each item: Consumption = Sale × Purchase Cost, Sale Amount = Sale × Selling Price, Profit = Sale Amount − Consumption
  const computedNonAcItems = useMemo(() => {
    if (!data) return [];
    return (data.nonAcItems || []).map((item) => {
      const edit = nonAcItemEdits[item.itemId] || { qty: item.qty, sale: item.sale, purchaseCost: item.purchaseCost, sellingPrice: item.sellingPrice };
      const sale = Number(edit.sale) || 0;
      const purchaseCost = Number(edit.purchaseCost) || 0;
      const sellingPrice = Number(edit.sellingPrice) || 0;
      const qty = Number(edit.qty) || 0;
      const consumption = Math.round(sale * purchaseCost * 100) / 100;
      const saleAmount = Math.round(sale * sellingPrice * 100) / 100;
      const profit = Math.round((saleAmount - consumption) * 100) / 100;
      return {
        ...item,
        qty,
        sale,
        purchaseCost,
        sellingPrice,
        consumption,
        saleAmount,
        profit,
        hasMissingPrice: purchaseCost <= 0,
        hasMissingSellingPrice: sellingPrice <= 0,
      };
    });
  }, [data, nonAcItemEdits]);

  const computedAcItems = useMemo(() => {
    if (!data) return [];
    return (data.acItems || []).map((item) => {
      const edit = acItemEdits[item.itemId] || { qty: item.qty, sale: item.sale, purchaseCost: item.purchaseCost, sellingPrice: item.sellingPrice };
      const sale = Number(edit.sale) || 0;
      const purchaseCost = Number(edit.purchaseCost) || 0;
      const sellingPrice = Number(edit.sellingPrice) || 0;
      const qty = Number(edit.qty) || 0;
      // AC uses 30ML cost logic: Consumption = Sale × Purchase Cost (mathematically equivalent to pegs × 30ML_cost)
      const consumption = Math.round(sale * purchaseCost * 100) / 100;
      const saleAmount = Math.round(sale * sellingPrice * 100) / 100;
      const profit = Math.round((saleAmount - consumption) * 100) / 100;
      return {
        ...item,
        qty,
        sale,
        purchaseCost,
        sellingPrice,
        consumption,
        saleAmount,
        profit,
        hasMissingPrice: purchaseCost <= 0,
        hasMissingBottleSize: qty <= 0,
      };
    });
  }, [data, acItemEdits]);

  // Item-wise totals (recalculated from edited values)
  const computedNonAcTotals = useMemo(() => {
    const consumption = Math.round(computedNonAcItems.reduce((s, i) => s + i.consumption, 0) * 100) / 100;
    const saleAmount = Math.round(computedNonAcItems.reduce((s, i) => s + i.saleAmount, 0) * 100) / 100;
    const profit = Math.round(computedNonAcItems.reduce((s, i) => s + i.profit, 0) * 100) / 100;
    const profitMarginPct = consumption > 0 ? Math.round(profit / consumption * 100 * 100) / 100 : 0;
    return { consumption, saleAmount, profit, profitMarginPct };
  }, [computedNonAcItems]);

  const computedAcTotals = useMemo(() => {
    const consumption = Math.round(computedAcItems.reduce((s, i) => s + i.consumption, 0) * 100) / 100;
    const saleAmount = Math.round(computedAcItems.reduce((s, i) => s + i.saleAmount, 0) * 100) / 100;
    const profit = Math.round(computedAcItems.reduce((s, i) => s + i.profit, 0) * 100) / 100;
    const profitMarginPct = consumption > 0 ? Math.round(profit / consumption * 100 * 100) / 100 : 0;
    return { consumption, saleAmount, profit, profitMarginPct };
  }, [computedAcItems]);

  // ── Save item-wise edits to backend + summary overrides ──
  // Returns true on success, false on failure
  const handleSave = async () => {
    if (!data) return false;
    setSaving(true);
    setSavedMsg(false);
    setError(null);
    try {
      // Build item-wise payloads from edits
      const nonAcItemsPayload = computedNonAcItems.map((item) => ({
        itemId: item.itemId,
        bottleSize: Number(nonAcItemEdits[item.itemId]?.qty ?? item.qty) || 0,
        sale: Number(nonAcItemEdits[item.itemId]?.sale ?? item.sale) || 0,
        purchaseRate: Number(nonAcItemEdits[item.itemId]?.purchaseCost ?? item.purchaseCost) || 0,
        sellingPrice: Number(nonAcItemEdits[item.itemId]?.sellingPrice ?? item.sellingPrice) || 0,
      }));
      const acAdjustmentsPayload = computedAcItems.map((item) => ({
        itemId: item.itemId,
        adjustedSaleBtl: Number(acItemEdits[item.itemId]?.sale ?? item.sale) || 0,
        adjustedPurchaseCost: Number(acItemEdits[item.itemId]?.purchaseCost ?? item.purchaseCost) || 0,
        adjustedSellingPrice: Number(acItemEdits[item.itemId]?.sellingPrice ?? item.sellingPrice) || 0,
        adjustedConsumption: item.consumption,
        adjustedSaleAmount: item.saleAmount,
        adjustedProfit: item.profit,
      }));

      // Save item-wise edits (Non-AC to inventory + daily entries, AC to adjustment table)
      const itemWiseRes = await fetch(apiUrl('/api/bar/inventory/liquor-report-item-wise'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ date, nonAcItems: nonAcItemsPayload, acAdjustments: acAdjustmentsPayload }),
      });
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
      // Reload data to reflect saved state
      loadData();
      return true;
    } catch (err) {
      setError(err.message || 'Failed to save data');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Save & Generate PDF: save to backend first, then generate PDF ──
  const handleSaveAndPrint = async () => {
    if (!computed) return;
    const success = await handleSave();
    if (!success) return;
    const html = buildPrintHtml({
      ...computed,
      nonAcItems: computedNonAcItems,
      acItems: computedAcItems,
      nonAcItemTotals: computedNonAcTotals,
      acItemTotals: computedAcTotals,
    });
    const printWin = window.open('', '_blank', 'width=1200,height=800');
    if (!printWin) {
      alert('Please allow pop-ups to generate the PDF.');
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = () => {
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 300);
    };
    setTimeout(() => {
      try {
        printWin.focus();
        printWin.print();
      } catch { /* already printed or closed */ }
    }, 1000);
  };

  const handleSummaryChange = (field, value) => {
    setSummaryEdits(prev => ({ ...prev, [field]: value === '' ? '' : Math.max(0, Number(value) || 0) }));
  };

  // Item-wise edit handlers — editable fields: qty, sale, purchaseCost, sellingPrice
  // Calculated fields (consumption, saleAmount, profit) auto-recalculate via useMemo
  const handleNonAcItemChange = (itemId, field, value) => {
    setNonAcItemEdits(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { qty: 0, sale: 0, purchaseCost: 0, sellingPrice: 0 }),
        [field]: value === '' ? '' : Math.max(0, Number(value) || 0),
      },
    }));
  };

  const handleAcItemChange = (itemId, field, value) => {
    setAcItemEdits(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { qty: 0, sale: 0, purchaseCost: 0, sellingPrice: 0 }),
        [field]: value === '' ? '' : Math.max(0, Number(value) || 0),
      },
    }));
  };

  if (!open) return null;

  const outletName = data?.outletName || 'Outlet';
  const outletWing = data?.outletWing || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-6xl mx-4 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={20} className="text-purple-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">Liquor Stock & Sales Report</h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {outletName} — Wing: {outletWing} — {date}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>
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

              {/* Business Position — Stock first, then Sales/Profit */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Business Position
                  <span className="ml-2 text-xs font-normal text-gray-500">(all editable in preview)</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {/* Stock Position */}
                  <EditableSummaryCard label="Opening Stock Value" field="totalOpeningStockValue" value={computed.summary.totalOpeningStockValue} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Purchase Value" field="totalPurchasesValue" value={computed.summary.totalPurchasesValue} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Consumption / Landing Cost" field="totalConsumptionCost" value={computed.summary.totalConsumptionCost} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Closing Stock Value" field="totalClosingStockValue" value={computed.summary.totalClosingStockValue} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  {/* Sales / Profitability */}
                  <EditableSummaryCard label="Total Liquor Sales (Gross)" field="totalGrossSales" value={computed.summary.totalGrossSales} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Discounts" field="totalDiscounts" value={computed.summary.totalDiscounts} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Net Sales (AC + Non-AC)" field="netSales" value={computed.summary.netSales} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Gross Profit After Liquor Cost" field="totalGrossProfit" value={computed.summary.totalGrossProfit} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="AC Sales" field="totalAcRevenue" value={computed.summary.totalAcRevenue} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" badge="AC" />
                  <EditableSummaryCard label="Non-AC Sales" field="totalNonAcRevenue" value={computed.summary.totalNonAcRevenue} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" badge="Manual" />
                  <EditableSummaryCard label="AC Profit" field="totalAcProfit" value={computed.summary.totalAcProfit} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Non-AC Profit" field="totalNonAcProfit" value={computed.summary.totalNonAcProfit} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Total Profit" field="totalProfit" value={computed.summary.totalProfit} edits={summaryEdits} onChange={handleSummaryChange} suffix="₹" />
                  <EditableSummaryCard label="Total Profit %" field="totalProfitPct" value={computed.summary.totalProfitPct} edits={summaryEdits} onChange={handleSummaryChange} suffix="%" />
                  {/* Consumption ML */}
                  <EditableSummaryCard label="Physical Consumption" field="totalPhysicalConsumption" value={computed.summary.totalPhysicalConsumption} edits={summaryEdits} onChange={handleSummaryChange} suffix="ml" />
                  <EditableSummaryCard label="System Consumption" field="totalSystemConsumption" value={computed.summary.totalSystemConsumption} edits={summaryEdits} onChange={handleSummaryChange} suffix="ml" />
                  <EditableSummaryCard label="Variance" field="totalVarianceMl" value={computed.summary.totalVarianceMl} edits={summaryEdits} onChange={handleSummaryChange} suffix="ml" />
                </div>
              </div>

              {/* ── Item-wise Non-AC Table (editable rows) ── */}
              {computedNonAcItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-orange-700 mb-3">
                    Non-AC Detailed Item-wise Report
                    <span className="ml-2 text-xs font-normal text-gray-500">(admin-entered · database-driven · editable rows)</span>
                  </h3>
                  <div className="overflow-x-auto border border-gray-100 rounded-lg">
                    <table className="w-full text-xs min-w-[900px]">
                      <thead className="bg-orange-50">
                        <tr>
                          <th className="text-center px-2 py-2 font-bold text-orange-700 uppercase tracking-wide w-10">S.No</th>
                          <th className="text-left px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Item Name</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Qty (ml)</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Sale (btl)</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Purchase Cost</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Consumption</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Selling Price</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Sale Amount</th>
                          <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {computedNonAcItems.map((item) => (
                          <tr key={`nonac-${item.itemId}`} className="border-t border-gray-50 hover:bg-orange-50/30">
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
                            {/* Sale (btl) — editable */}
                            <td className="px-3 py-2 text-right bg-orange-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={nonAcItemEdits[item.itemId]?.sale ?? ''}
                                onChange={(e) => handleNonAcItemChange(item.itemId, 'sale', e.target.value)}
                                className="w-20 text-right text-xs px-1 py-0.5 border border-orange-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                                placeholder="0"
                              />
                            </td>
                            {/* Purchase Cost — editable */}
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
                            {/* Consumption — auto-calculated: Sale × Purchase Cost */}
                            <td className="px-3 py-2 text-right text-gray-700">{fmtInr(item.consumption)}</td>
                            {/* Selling Price — editable */}
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
                            {/* Sale Amount — auto-calculated: Sale × Selling Price */}
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(item.saleAmount)}</td>
                            {/* Profit — auto-calculated: Sale Amount − Consumption */}
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(item.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-orange-200 bg-orange-50 font-bold">
                          <td colSpan={5} className="px-3 py-2 text-gray-900">TOTAL</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedNonAcTotals.consumption)}</td>
                          <td className="px-3 py-2 text-right text-gray-400"></td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedNonAcTotals.saleAmount)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedNonAcTotals.profit)}</td>
                        </tr>
                        <tr className="bg-orange-50/50">
                          <td colSpan={8} className="px-3 py-1 text-right text-xs text-gray-500 font-medium">Profit Margin %</td>
                          <td className="px-3 py-1 text-right text-xs text-gray-900 font-bold">{fmtPct(computedNonAcTotals.profitMarginPct)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Item-wise AC Bar Table (editable rows) ── */}
              {computedAcItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-blue-700 mb-3">
                    AC Bar Detailed Item-wise Report
                    <span className="ml-2 text-xs font-normal text-gray-500">(POS billing · database-driven · editable rows)</span>
                  </h3>
                  <div className="overflow-x-auto border border-gray-100 rounded-lg">
                    <table className="w-full text-xs min-w-[900px]">
                      <thead className="bg-blue-50">
                        <tr>
                          <th className="text-center px-2 py-2 font-bold text-blue-700 uppercase tracking-wide w-10">S.No</th>
                          <th className="text-left px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Item Name</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Qty (ml)</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Sale (btl)</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Purchase Cost</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Consumption</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Selling Price</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Sale Amount</th>
                          <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {computedAcItems.map((item) => (
                          <tr key={`ac-${item.itemId}`} className="border-t border-gray-50 hover:bg-blue-50/30">
                            <td className="px-2 py-2 text-center text-gray-500">{item.sno}</td>
                            <td className="px-3 py-2 text-gray-800 font-medium">
                              {item.itemName}
                              {item.hasMissingPrice && <span className="ml-1 text-[9px] text-red-500" title="Missing purchase cost">⚠</span>}
                              {item.hasMissingBottleSize && <span className="ml-1 text-[9px] text-red-500" title="Missing bottle size">⚠</span>}
                            </td>
                            {/* Qty (ml) — editable */}
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
                            {/* Sale (btl) — editable */}
                            <td className="px-3 py-2 text-right bg-blue-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={acItemEdits[item.itemId]?.sale ?? ''}
                                onChange={(e) => handleAcItemChange(item.itemId, 'sale', e.target.value)}
                                className="w-20 text-right text-xs px-1 py-0.5 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                            {/* Consumption — auto-calculated: Sale × Purchase Cost (30ML cost logic) */}
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
                            {/* Sale Amount — auto-calculated: Sale × Selling Price */}
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(item.saleAmount)}</td>
                            {/* Profit — auto-calculated: Sale Amount − Consumption */}
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(item.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-blue-200 bg-blue-50 font-bold">
                          <td colSpan={5} className="px-3 py-2 text-gray-900">TOTAL</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedAcTotals.consumption)}</td>
                          <td className="px-3 py-2 text-right text-gray-400"></td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedAcTotals.saleAmount)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computedAcTotals.profit)}</td>
                        </tr>
                        <tr className="bg-blue-50/50">
                          <td colSpan={8} className="px-3 py-1 text-right text-xs text-gray-500 font-medium">Profit Margin %</td>
                          <td className="px-3 py-1 text-right text-xs text-gray-900 font-bold">{fmtPct(computedAcTotals.profitMarginPct)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EditableSummaryCard({ label, field, value, edits, onChange, suffix, badge }) {
  const editValue = edits[field];
  const displayVal = editValue != null ? editValue : value;
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
  const { outletName, outletWing, date, nonAcItems, acItems, nonAcItemTotals, acItemTotals } = data;

  const fmtInrP = (n) => n == null ? '—' : `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
  const fmtPctP = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;

  const fmtQtyP = (n) => n == null || n <= 0 ? '—' : `${Number(n).toFixed(0)} ml`;
  const fmtBtlP = (n) => n == null || n <= 0 ? '—' : Number(n).toFixed(2);

  // ── Item-wise Non-AC rows ──
  const nonAcItemRows = (nonAcItems || []).map((item) => `
    <tr>
      <td class="num">${item.sno}</td>
      <td class="cat">${escapeHtml(item.itemName)}${item.hasMissingPrice ? ' <span class="warn">⚠</span>' : ''}${item.hasMissingSellingPrice ? ' <span class="warn">⚠</span>' : ''}</td>
      <td class="num">${fmtQtyP(item.qty)}</td>
      <td class="num">${fmtBtlP(item.sale)}</td>
      <td class="num">${item.purchaseCost > 0 ? fmtInrP(item.purchaseCost) : '—'}</td>
      <td class="num">${fmtInrP(item.consumption)}</td>
      <td class="num">${item.sellingPrice > 0 ? fmtInrP(item.sellingPrice) : '—'}</td>
      <td class="num bold">${fmtInrP(item.saleAmount)}</td>
      <td class="num bold">${fmtInrP(item.profit)}</td>
    </tr>
  `).join('');

  // ── Item-wise AC rows (30ML Cost column removed — matches exact column spec) ──
  const acItemRows = (acItems || []).map((item) => `
    <tr>
      <td class="num">${item.sno}</td>
      <td class="cat">${escapeHtml(item.itemName)}${item.hasMissingPrice ? ' <span class="warn">⚠</span>' : ''}${item.hasMissingBottleSize ? ' <span class="warn">⚠</span>' : ''}</td>
      <td class="num">${fmtQtyP(item.qty)}</td>
      <td class="num">${fmtBtlP(item.sale)}</td>
      <td class="num">${item.purchaseCost > 0 ? fmtInrP(item.purchaseCost) : '—'}</td>
      <td class="num">${fmtInrP(item.consumption)}</td>
      <td class="num">${item.sellingPrice > 0 ? fmtInrP(item.sellingPrice) : '—'}</td>
      <td class="num bold">${fmtInrP(item.saleAmount)}</td>
      <td class="num bold">${fmtInrP(item.profit)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Liquor Stock & Sales Report — ${escapeHtml(outletName)} — ${date}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 10mm 8mm 12mm 8mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1a1a1a;
    font-size: 9px;
    line-height: 1.3;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 5px;
    margin-bottom: 8px;
  }
  .header h1 { font-size: 15px; font-weight: 800; }
  .header .sub { font-size: 10px; color: #555; margin-top: 1px; }
  .header .date { font-size: 9px; color: #777; margin-top: 1px; }

  .info-banner {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 3px;
    padding: 4px 8px;
    margin-bottom: 8px;
    font-size: 8px;
    color: #1e40af;
  }

  .section-title {
    font-size: 11px;
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
    font-size: 7.5px;
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
    padding: 3px 4px;
    font-size: 8.5px;
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
  .warn { color: #dc2626; font-size: 7px; }

  tfoot td {
    background: #f3f4f6;
    font-weight: 800;
    color: #111827;
    border-top: 2px solid #9ca3af;
  }

  .page-break { page-break-before: always; }

  .footer {
    margin-top: 10px;
    padding-top: 5px;
    border-top: 1px solid #d1d5db;
    font-size: 7.5px;
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
  <div class="date">Report Date: ${date}</div>
</div>

<div class="info-banner">
  Non-AC = admin-entered, database-driven · AC Bar = POS billing, database-driven.
  All values reflect the latest saved database data.
</div>

${/* ── Item-wise Non-AC Table (FIRST) ── */ ''}
<div class="section-title first">Non-AC Detailed Item-wise Report</div>
${(nonAcItems && nonAcItems.length > 0) ? `
<table>
  <colgroup>
    <col style="width: 4%">
    <col style="width: 18%">
    <col style="width: 8%">
    <col style="width: 8%">
    <col style="width: 10%">
    <col style="width: 11%">
    <col style="width: 11%">
    <col style="width: 11%">
    <col style="width: 11%">
  </colgroup>
  <thead>
    <tr>
      <th>S.No</th>
      <th class="cat">Item Name</th>
      <th>Qty (ml)</th>
      <th>Sale (btl)</th>
      <th>Purchase Cost</th>
      <th>Consumption</th>
      <th>Selling Price</th>
      <th>Sale Amount</th>
      <th>Profit</th>
    </tr>
  </thead>
  <tbody>
    ${nonAcItemRows}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="5" class="cat">TOTAL</td>
      <td class="num">${fmtInrP(nonAcItemTotals?.consumption || 0)}</td>
      <td class="num"></td>
      <td class="num">${fmtInrP(nonAcItemTotals?.saleAmount || 0)}</td>
      <td class="num">${fmtInrP(nonAcItemTotals?.profit || 0)}</td>
    </tr>
    <tr>
      <td colspan="8" class="num" style="text-align:right;font-size:7.5px;color:#666;">Profit Margin %</td>
      <td class="num" style="font-weight:700;">${fmtPctP(nonAcItemTotals?.profitMarginPct || 0)}</td>
    </tr>
  </tfoot>
</table>
` : '<p style="font-size:8px;color:#999;padding:6px 0;">No Non-AC items with activity on this date.</p>'}

${/* ── Item-wise AC Bar Table (SECOND) ── */ ''}
<div class="section-title" style="margin-top:12px;">AC Bar Detailed Item-wise Report</div>
${(acItems && acItems.length > 0) ? `
<table>
  <colgroup>
    <col style="width: 4%">
    <col style="width: 18%">
    <col style="width: 8%">
    <col style="width: 8%">
    <col style="width: 10%">
    <col style="width: 11%">
    <col style="width: 11%">
    <col style="width: 11%">
    <col style="width: 11%">
  </colgroup>
  <thead>
    <tr>
      <th>S.No</th>
      <th class="cat">Item Name</th>
      <th>Qty (ml)</th>
      <th>Sale (btl)</th>
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
      <td colspan="5" class="cat">TOTAL</td>
      <td class="num">${fmtInrP(acItemTotals?.consumption || 0)}</td>
      <td class="num"></td>
      <td class="num">${fmtInrP(acItemTotals?.saleAmount || 0)}</td>
      <td class="num">${fmtInrP(acItemTotals?.profit || 0)}</td>
    </tr>
    <tr>
      <td colspan="8" class="num" style="text-align:right;font-size:7.5px;color:#666;">Profit Margin %</td>
      <td class="num" style="font-weight:700;">${fmtPctP(acItemTotals?.profitMarginPct || 0)}</td>
    </tr>
  </tfoot>
</table>
` : '<p style="font-size:8px;color:#999;padding:6px 0;">No AC items with sales on this date.</p>'}

<div class="footer">
  Non-AC: Consumption = Sale × Purchase Cost · Sale Amount = Sale × Selling Price · Profit = Sale Amount − Consumption<br>
  AC Bar: Consumption = Sale × Purchase Cost (30ML cost logic) · Sale Amount = Sale × Selling Price · Profit = Sale Amount − Consumption<br>
  Profit Margin % = (Total Profit ÷ Total Consumption) × 100 · ⚠ = missing data (purchase cost, selling price, or bottle size)<br>
  All values reflect the latest saved database data. AC adjustments are stored separately from POS billing data.
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
