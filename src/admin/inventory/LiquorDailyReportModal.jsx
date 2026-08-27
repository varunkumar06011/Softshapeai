// ─────────────────────────────────────────────────────────────────────────────
// LiquorDailyReportModal — "PDF to Admin" category-wise liquor report
// ─────────────────────────────────────────────────────────────────────────────
// AC = System/POS data (read-only, automatically populated)
// Non-AC = Manual admin entry (editable, for outlets without our POS)
//
// The admin can:
//   1. Review the report preview with AC (system) + Non-AC (manual) data
//   2. Edit Non-AC values (sales, landing cost) per category
//   3. See live recalculation of profits, totals, percentages
//   4. Save Non-AC changes (stored separately, NOT in POS/billing)
//   5. Download the final PDF
//
// Print/PDF uses a dedicated print window with landscape A4, proper pagination.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Printer, AlertTriangle, FileText, Save, CheckCircle } from 'lucide-react';
import { apiUrl, getAuthHeaders } from '../../services/apiConfig';

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
}

function fmtMl(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(0)} ml`;
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

  // ── Save entries (Non-AC stored in DB; AC edits are preview-only) ──
  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setSavedMsg(false);
    try {
      // Save Non-AC category entries
      const entries = Object.entries(edits)
        .filter(([_, v]) => Number(v.nonAcSales) > 0 || Number(v.nonAcLandingCost) > 0)
        .map(([categoryName, v]) => ({
          categoryName,
          nonAcSales: Number(v.nonAcSales) || 0,
          nonAcLandingCost: Number(v.nonAcLandingCost) || 0,
        }));
      // Save summary overrides (all editable business position fields)
      const summaryOverrides = { ...summaryEdits };
      const res = await fetch(apiUrl('/api/bar/inventory/liquor-report-non-ac'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ date, entries, summaryOverrides }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save data');
    } finally {
      setSaving(false);
    }
  };

  // ── Print: open a dedicated window with proper A4 landscape CSS ──
  const handlePrint = () => {
    if (!computed) return;
    const html = buildPrintHtml(computed);
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
      } catch (_) { /* already printed or closed */ }
    }, 1000);
  };

  const handleChange = (catName, field, value) => {
    setEdits(prev => ({
      ...prev,
      [catName]: {
        ...(prev[catName] || { acSales: 0, acLandingCost: 0, nonAcSales: 0, nonAcLandingCost: 0 }),
        [field]: value === '' ? '' : Math.max(0, Number(value) || 0),
      },
    }));
  };

  const handleSummaryChange = (field, value) => {
    setSummaryEdits(prev => ({ ...prev, [field]: value === '' ? '' : Math.max(0, Number(value) || 0) }));
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
              <Save size={14} /> <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save'}</span><span className="sm:hidden">Save</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={loading || !!error}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Printer size={14} /> <span className="hidden sm:inline">Download PDF</span><span className="sm:hidden">PDF</span>
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
              <span className="font-bold">AC (System)</span> = from POS billing (editable in preview for adjustments).
              {' '}
              <span className="font-bold">Non-AC (Manual)</span> = admin-entered for outlets without our POS (editable).
              Only Non-AC values are saved to the separate manual store. AC edits are preview-only and do NOT modify POS, Total Sales, AOV, billing, or inventory.
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

              {/* Category-wise Stock, Consumption & Sales */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Category-wise Stock, Consumption & Sales</h3>
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs min-w-[800px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Category</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Opening Stock</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Purchases</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Consumption</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Closing Stock</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">System Consumption</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Variance</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Closing Stock Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!computed.categories || computed.categories.length === 0) ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-8 text-center text-gray-400">No categories with activity on this date.</td>
                        </tr>
                      ) : (
                        computed.categories.map((c) => (
                          <tr key={c.categoryName} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800 font-medium">{c.categoryName}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtMl(c.openingMl)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtMl(c.purchasedMl)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtMl(c.physicalConsumptionMl)}</td>
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtMl(c.closingMl)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtMl(c.systemConsumptionMl)}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={Math.abs(c.varianceMl) > 1 ? 'text-red-600 font-bold' : 'text-gray-700'}>
                                {fmtMl(c.varianceMl)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtInr(c.stockValue)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {computed.categories && computed.categories.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                          <td className="px-3 py-2 text-gray-900">TOTAL</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(computed.categories.reduce((s, c) => s + c.openingMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(computed.categories.reduce((s, c) => s + c.purchasedMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(computed.categories.reduce((s, c) => s + c.physicalConsumptionMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(computed.categories.reduce((s, c) => s + c.closingMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(computed.categories.reduce((s, c) => s + c.systemConsumptionMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(computed.categories.reduce((s, c) => s + c.varianceMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computed.summary.totalClosingStockValue)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Category-wise Sales & Profitability — AC + Non-AC editable */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Category-wise Sales & Profitability
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    (AC + Non-AC editable in preview · Only Non-AC is saved to manual store)
                  </span>
                </h3>
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs min-w-[1100px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Category</th>
                        <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">AC Sales</th>
                        <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">AC Landing Cost</th>
                        <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Non-AC Sales</th>
                        <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Non-AC Landing Cost</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Total Sales</th>
                        <th className="text-right px-3 py-2 font-bold text-blue-700 uppercase tracking-wide">AC Profit</th>
                        <th className="text-right px-3 py-2 font-bold text-orange-700 uppercase tracking-wide">Non-AC Profit</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Total Profit</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Total Profit %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computed.categories && computed.categories.map((c) => (
                        <tr key={c.categoryName} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800 font-medium">{c.categoryName}</td>
                          {/* AC Sales — editable */}
                          <td className="px-3 py-2 text-right bg-blue-50/50">
                            <input
                              type="number"
                              min="0"
                              value={edits[c.categoryName]?.acSales ?? ''}
                              onChange={(e) => handleChange(c.categoryName, 'acSales', e.target.value)}
                              className="w-24 text-right text-xs px-1 py-0.5 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                              placeholder="0"
                            />
                          </td>
                          {/* AC Landing Cost — editable */}
                          <td className="px-3 py-2 text-right bg-blue-50/50">
                            <input
                              type="number"
                              min="0"
                              value={edits[c.categoryName]?.acLandingCost ?? ''}
                              onChange={(e) => handleChange(c.categoryName, 'acLandingCost', e.target.value)}
                              className="w-24 text-right text-xs px-1 py-0.5 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                              placeholder="0"
                            />
                          </td>
                          {/* Non-AC Sales — editable */}
                          <td className="px-3 py-2 text-right bg-orange-50/50">
                            <input
                              type="number"
                              min="0"
                              value={edits[c.categoryName]?.nonAcSales ?? ''}
                              onChange={(e) => handleChange(c.categoryName, 'nonAcSales', e.target.value)}
                              className="w-24 text-right text-xs px-1 py-0.5 border border-orange-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                              placeholder="0"
                            />
                          </td>
                          {/* Non-AC Landing Cost — editable */}
                          <td className="px-3 py-2 text-right bg-orange-50/50">
                            <input
                              type="number"
                              min="0"
                              value={edits[c.categoryName]?.nonAcLandingCost ?? ''}
                              onChange={(e) => handleChange(c.categoryName, 'nonAcLandingCost', e.target.value)}
                              className="w-24 text-right text-xs px-1 py-0.5 border border-orange-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                              placeholder="0"
                            />
                          </td>
                          {/* Computed fields */}
                          <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(c.sales)}</td>
                          <td className="px-3 py-2 text-right text-blue-700 font-bold">{fmtInr(c.acProfit)}</td>
                          <td className="px-3 py-2 text-right text-orange-700 font-bold">{fmtInr(c.nonAcProfit)}</td>
                          <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(c.totalProfit)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{fmtPct(c.totalProfitPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {computed.categories && computed.categories.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                          <td className="px-3 py-2 text-gray-900">TOTAL</td>
                          <td className="px-3 py-2 text-right text-blue-700">{fmtInr(computed.summary.totalAcRevenue)}</td>
                          <td className="px-3 py-2 text-right text-blue-700">{fmtInr(computed.summary.totalAcConsumptionCost)}</td>
                          <td className="px-3 py-2 text-right text-orange-700">{fmtInr(computed.summary.totalNonAcRevenue)}</td>
                          <td className="px-3 py-2 text-right text-orange-700">{fmtInr(computed.summary.totalNonAcConsumptionCost)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computed.summary.netSales)}</td>
                          <td className="px-3 py-2 text-right text-blue-700">{fmtInr(computed.summary.totalAcProfit)}</td>
                          <td className="px-3 py-2 text-right text-orange-700">{fmtInr(computed.summary.totalNonAcProfit)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(computed.summary.totalProfit)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtPct(computed.summary.totalProfitPct)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, badge }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 min-w-0">
      <div className="flex items-center gap-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold truncate">{label}</div>
        {badge && (
          <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${badge === 'POS' || badge === 'AC' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-sm sm:text-lg font-black text-gray-900 mt-1 truncate">{value}</div>
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
  const { outletName, outletWing, date, summary, categories, hasAnyPhysicalCount } = data;

  const fmtInrP = (n) => n == null ? '—' : `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
  const fmtMlP = (n) => n == null ? '—' : `${Number(n).toFixed(0)} ml`;
  const fmtPctP = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;

  const categoryRows = (categories || []).map((c) => `
    <tr>
      <td class="cat">${escapeHtml(c.categoryName)}</td>
      <td class="num">${fmtMlP(c.openingMl)}</td>
      <td class="num">${fmtMlP(c.purchasedMl)}</td>
      <td class="num">${fmtMlP(c.physicalConsumptionMl)}</td>
      <td class="num bold">${fmtMlP(c.closingMl)}</td>
      <td class="num">${fmtMlP(c.systemConsumptionMl)}</td>
      <td class="num ${Math.abs(c.varianceMl) > 1 ? 'variance-warn' : ''}">${fmtMlP(c.varianceMl)}</td>
      <td class="num">${fmtInrP(c.stockValue)}</td>
    </tr>
  `).join('');

  const totalOpening = (categories || []).reduce((s, c) => s + c.openingMl, 0);
  const totalPurchases = (categories || []).reduce((s, c) => s + c.purchasedMl, 0);
  const totalClosing = (categories || []).reduce((s, c) => s + c.closingMl, 0);
  const totalPhysCons = (categories || []).reduce((s, c) => s + c.physicalConsumptionMl, 0);
  const totalSysCons = (categories || []).reduce((s, c) => s + c.systemConsumptionMl, 0);
  const totalVariance = (categories || []).reduce((s, c) => s + c.varianceMl, 0);

  const profitRows = (categories || []).map((c) => `
    <tr>
      <td class="cat">${escapeHtml(c.categoryName)}</td>
      <td class="num ac">${fmtInrP(c.acRevenue)}</td>
      <td class="num ac">${fmtInrP(c.acConsumptionCost)}</td>
      <td class="num nonac">${fmtInrP(c.nonAcRevenue)}</td>
      <td class="num nonac">${fmtInrP(c.nonAcConsumptionCost)}</td>
      <td class="num bold">${fmtInrP(c.sales)}</td>
      <td class="num ac bold">${fmtInrP(c.acProfit)}</td>
      <td class="num nonac bold">${fmtInrP(c.nonAcProfit)}</td>
      <td class="num bold">${fmtInrP(c.totalProfit)}</td>
      <td class="num">${fmtPctP(c.totalProfitPct)}</td>
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

  .banner {
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 3px;
    padding: 4px 8px;
    margin-bottom: 8px;
    font-size: 8px;
    color: #92400e;
  }

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

  .stock-position {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-bottom: 6px;
  }
  .stock-card {
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 3px;
    padding: 5px 7px;
  }
  .stock-card .label {
    font-size: 7px;
    text-transform: uppercase;
    font-weight: 700;
    color: #4338ca;
    letter-spacing: 0.4px;
  }
  .stock-card .value {
    font-size: 13px;
    font-weight: 800;
    color: #1a1a1a;
    margin-top: 1px;
  }

  .sales-position {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    margin-bottom: 8px;
  }
  .sales-card {
    background: #f5f5f5;
    border-radius: 3px;
    padding: 4px 6px;
  }
  .sales-card .label {
    font-size: 7px;
    text-transform: uppercase;
    font-weight: 700;
    color: #666;
    letter-spacing: 0.4px;
  }
  .sales-card .value {
    font-size: 11px;
    font-weight: 800;
    color: #1a1a1a;
    margin-top: 1px;
  }
  .sales-card.highlight { background: #ecfdf5; border: 1px solid #a7f3d0; }
  .sales-card.highlight .label { color: #065f46; }
  .sales-card.ac { background: #eff6ff; border: 1px solid #bfdbfe; }
  .sales-card.ac .label { color: #1e40af; }
  .sales-card.nonac { background: #fff7ed; border: 1px solid #fed7aa; }
  .sales-card.nonac .label { color: #9a3412; }

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
  AC (System) = automatically from POS billing · Non-AC (Manual) = admin-entered for outlets without our POS.
  Non-AC data is NOT included in official POS Total Sales, AOV, billing, or inventory.
</div>

${!hasAnyPhysicalCount ? '<div class="banner">⚠ No physical count taken on this date. Variance shown is wastage-adjusted only (Physical Consumption − System Consumption).</div>' : ''}

<div class="section-title first">Business Position — Stock</div>
<div class="stock-position">
  <div class="stock-card"><div class="label">Opening Stock Value</div><div class="value">${fmtInrP(summary.totalOpeningStockValue)}</div></div>
  <div class="stock-card"><div class="label">Purchase Value</div><div class="value">${fmtInrP(summary.totalPurchasesValue)}</div></div>
  <div class="stock-card"><div class="label">Consumption / Landing Cost</div><div class="value">${fmtInrP(summary.totalConsumptionCost)}</div></div>
  <div class="stock-card"><div class="label">Closing Stock Value</div><div class="value">${fmtInrP(summary.totalClosingStockValue)}</div></div>
</div>

<div class="section-title">Business Position — Sales &amp; Profitability</div>
<div class="sales-position">
  <div class="sales-card"><div class="label">Total Liquor Sales (Gross)</div><div class="value">${fmtInrP(summary.totalGrossSales)}</div></div>
  <div class="sales-card"><div class="label">Discounts</div><div class="value">${fmtInrP(summary.totalDiscounts)}</div></div>
  <div class="sales-card"><div class="label">Net Sales (AC + Non-AC)</div><div class="value">${fmtInrP(summary.netSales)}</div></div>
  <div class="sales-card highlight"><div class="label">Gross Profit After Liquor Cost</div><div class="value">${fmtInrP(summary.totalGrossProfit)}</div></div>
  <div class="sales-card ac"><div class="label">AC Sales (System)</div><div class="value">${fmtInrP(summary.totalAcRevenue)}</div></div>
  <div class="sales-card nonac"><div class="label">Non-AC Sales (Manual)</div><div class="value">${fmtInrP(summary.totalNonAcRevenue)}</div></div>
  <div class="sales-card ac"><div class="label">AC Profit</div><div class="value">${fmtInrP(summary.totalAcProfit)}</div></div>
  <div class="sales-card nonac"><div class="label">Non-AC Profit</div><div class="value">${fmtInrP(summary.totalNonAcProfit)}</div></div>
  <div class="sales-card highlight"><div class="label">Total Profit</div><div class="value">${fmtInrP(summary.totalProfit)}</div></div>
  <div class="sales-card"><div class="label">Physical Consumption</div><div class="value">${fmtMlP(summary.totalPhysicalConsumption)}</div></div>
  <div class="sales-card"><div class="label">System Consumption</div><div class="value">${fmtMlP(summary.totalSystemConsumption)}</div></div>
  <div class="sales-card"><div class="label">Variance</div><div class="value">${fmtMlP(summary.totalVarianceMl)}</div></div>
</div>

<div class="section-title">Category-wise Stock, Consumption &amp; Sales</div>
<table>
  <colgroup>
    <col style="width: 14%">
    <col style="width: 11%">
    <col style="width: 11%">
    <col style="width: 13%">
    <col style="width: 12%">
    <col style="width: 13%">
    <col style="width: 11%">
    <col style="width: 15%">
  </colgroup>
  <thead>
    <tr>
      <th class="cat">Category</th>
      <th>Opening Stock</th>
      <th>Purchases</th>
      <th>Consumption</th>
      <th>Closing Stock</th>
      <th>System Consumption</th>
      <th>Variance</th>
      <th>Closing Stock Value</th>
    </tr>
  </thead>
  <tbody>
    ${categoryRows || '<tr><td colspan="8" style="text-align:center;color:#999;padding:12px;">No categories with activity on this date.</td></tr>'}
  </tbody>
  ${categories && categories.length > 0 ? `
  <tfoot>
    <tr>
      <td class="cat">TOTAL</td>
      <td class="num">${fmtMlP(totalOpening)}</td>
      <td class="num">${fmtMlP(totalPurchases)}</td>
      <td class="num">${fmtMlP(totalPhysCons)}</td>
      <td class="num">${fmtMlP(totalClosing)}</td>
      <td class="num">${fmtMlP(totalSysCons)}</td>
      <td class="num">${fmtMlP(totalVariance)}</td>
      <td class="num">${fmtInrP(summary.totalClosingStockValue)}</td>
    </tr>
  </tfoot>` : ''}
</table>

<div class="section-title">Category-wise Sales &amp; Profitability</div>
<table>
  <colgroup>
    <col style="width: 11%">
    <col style="width: 9%">
    <col style="width: 9%">
    <col style="width: 9%">
    <col style="width: 9%">
    <col style="width: 9%">
    <col style="width: 9%">
    <col style="width: 9%">
    <col style="width: 9%">
    <col style="width: 7%">
  </colgroup>
  <thead>
    <tr>
      <th class="cat">Category</th>
      <th class="ac">AC Sales</th>
      <th class="ac">AC Landing Cost</th>
      <th class="nonac">Non-AC Sales</th>
      <th class="nonac">Non-AC Landing Cost</th>
      <th>Total Sales</th>
      <th class="ac">AC Profit</th>
      <th class="nonac">Non-AC Profit</th>
      <th>Total Profit</th>
      <th>Total Profit %</th>
    </tr>
  </thead>
  <tbody>
    ${profitRows || '<tr><td colspan="10" style="text-align:center;color:#999;padding:12px;">No data.</td></tr>'}
  </tbody>
  ${categories && categories.length > 0 ? `
  <tfoot>
    <tr>
      <td class="cat">TOTAL</td>
      <td class="num ac">${fmtInrP(summary.totalAcRevenue)}</td>
      <td class="num ac">${fmtInrP(summary.totalAcConsumptionCost)}</td>
      <td class="num nonac">${fmtInrP(summary.totalNonAcRevenue)}</td>
      <td class="num nonac">${fmtInrP(summary.totalNonAcConsumptionCost)}</td>
      <td class="num">${fmtInrP(summary.netSales)}</td>
      <td class="num ac">${fmtInrP(summary.totalAcProfit)}</td>
      <td class="num nonac">${fmtInrP(summary.totalNonAcProfit)}</td>
      <td class="num">${fmtInrP(summary.totalProfit)}</td>
      <td class="num">${fmtPctP(summary.totalProfitPct)}</td>
    </tr>
  </tfoot>` : ''}
</table>

<div class="footer">
  AC (System) = automatically from POS billing · Non-AC (Manual) = admin-entered for outlets without our POS.<br>
  AC Profit = AC Sales − AC Landing Cost · Non-AC Profit = Non-AC Sales − Non-AC Landing Cost · Total Profit = AC Profit + Non-AC Profit<br>
  Non-AC data is NOT included in official POS Total Sales, AOV, billing, or inventory.
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
