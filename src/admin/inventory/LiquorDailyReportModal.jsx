// ─────────────────────────────────────────────────────────────────────────────
// LiquorDailyReportModal — "PDF to Admin" category-wise liquor report
// ─────────────────────────────────────────────────────────────────────────────
// Shows a category-wise summary (not item-wise) with:
//   - Category table: Opening, Purchases, Closing, Consumption, System
//     Consumption, Variance, Stock Value, Sales
//   - Business Summary: Stock values, Sales, Consumption, Profitability
//   - No-physical-count banner if applicable
//
// Print/PDF uses a dedicated print window (like StockSheetPrintModal) with
// landscape A4, proper pagination, and repeating table headers — NOT
// window.print() which captures the whole page.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { X, Printer, AlertTriangle, FileText } from 'lucide-react';
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

export default function LiquorDailyReportModal({ open, date, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    } catch (err) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [open, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Print: open a dedicated window with proper A4 landscape CSS ──
  // This avoids the viewport-clipping issue with window.print() and
  // ensures the full report is captured with pagination + repeating headers.
  const handlePrint = () => {
    if (!data) return;
    const html = buildPrintHtml(data);
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
    // Fallback if onload already fired
    setTimeout(() => {
      try {
        printWin.focus();
        printWin.print();
      } catch (_) { /* already printed or closed */ }
    }, 1000);
  };

  if (!open) return null;

  const outletName = data?.outletName || 'Outlet';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl mx-4 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={20} className="text-purple-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">PDF to Admin — Liquor Report</h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {outletName} — {date}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              disabled={loading || !!error}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Printer size={14} /> <span className="hidden sm:inline">Generate PDF</span><span className="sm:hidden">PDF</span>
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

          {loading ? (
            <div className="space-y-3">
              <div className="h-8 bg-gray-100 rounded animate-pulse" />
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : data ? (
            <>
              {/* No physical count banner */}
              {!data.hasAnyPhysicalCount && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">No physical count taken on this date</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Variance shown is wastage-adjusted only (Physical Consumption − System Consumption).
                      A physical count is required to detect shrinkage/theft.
                    </p>
                  </div>
                </div>
              )}

              {/* Business Summary */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Business Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  <SummaryCard label="Opening Stock Value" value={fmtInr(data.summary.totalOpeningStockValue)} />
                  <SummaryCard label="Purchases Value" value={fmtInr(data.summary.totalPurchasesValue)} />
                  <SummaryCard label="Closing Stock Value" value={fmtInr(data.summary.totalClosingStockValue)} />
                  <SummaryCard label="Total Liquor Sales" value={fmtInr(data.summary.totalLiquorSales)} />
                  <SummaryCard label="Physical Consumption" value={fmtMl(data.summary.totalPhysicalConsumption)} />
                  <SummaryCard label="System Consumption" value={fmtMl(data.summary.totalSystemConsumption)} />
                  <SummaryCard label="Variance" value={fmtMl(data.summary.totalVarianceMl)} />
                  <SummaryCard label="Consumption Cost" value={fmtInr(data.summary.totalConsumptionCost)} />
                  <SummaryCard label="Gross Profit" value={fmtInr(data.summary.totalGrossProfit)} />
                  <SummaryCard label="Gross Margin" value={fmtPct(data.summary.totalGrossMarginPct)} />
                </div>
              </div>

              {/* Category-wise table (Req #5) */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Category-wise Summary</h3>
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs min-w-[800px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Category</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Opening Stock</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Purchases</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Closing Stock</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Consumption</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">System Consumption</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Variance</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Stock Value</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!data.categories || data.categories.length === 0) ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-gray-400">No categories with activity on this date.</td>
                        </tr>
                      ) : (
                        data.categories.map((c) => (
                          <tr key={c.categoryName} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800 font-medium">{c.categoryName}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtMl(c.openingMl)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtMl(c.purchasedMl)}</td>
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtMl(c.closingMl)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtMl(c.physicalConsumptionMl)}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtMl(c.systemConsumptionMl)}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={Math.abs(c.varianceMl) > 1 ? 'text-red-600 font-bold' : 'text-gray-700'}>
                                {fmtMl(c.varianceMl)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{fmtInr(c.stockValue)}</td>
                            <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(c.sales)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {data.categories && data.categories.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                          <td className="px-3 py-2 text-gray-900">TOTAL</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(data.categories.reduce((s, c) => s + c.openingMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(data.categories.reduce((s, c) => s + c.purchasedMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(data.categories.reduce((s, c) => s + c.closingMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(data.categories.reduce((s, c) => s + c.physicalConsumptionMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(data.categories.reduce((s, c) => s + c.systemConsumptionMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtMl(data.categories.reduce((s, c) => s + c.varianceMl, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(data.summary.totalClosingStockValue)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(data.summary.totalLiquorSales)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Category-wise Sales & Profitability */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Category-wise Sales & Profitability</h3>
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Category</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Sales</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">AC Revenue</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Non-AC Revenue</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Consumption Cost</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Gross Profit</th>
                        <th className="text-right px-3 py-2 font-bold text-gray-600 uppercase tracking-wide">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.categories && data.categories.map((c) => (
                        <tr key={c.categoryName} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800 font-medium">{c.categoryName}</td>
                          <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(c.sales)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{fmtInr(c.acRevenue)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{fmtInr(c.nonAcRevenue)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{fmtInr(c.consumptionCost)}</td>
                          <td className="px-3 py-2 text-right text-gray-900 font-bold">{fmtInr(c.grossProfit)}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{fmtPct(c.grossMarginPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {data.categories && data.categories.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                          <td className="px-3 py-2 text-gray-900">TOTAL</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(data.summary.totalLiquorSales)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(data.categories.reduce((s, c) => s + c.acRevenue, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(data.categories.reduce((s, c) => s + c.nonAcRevenue, 0))}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(data.summary.totalConsumptionCost)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtInr(data.summary.totalGrossProfit)}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{fmtPct(data.summary.totalGrossMarginPct)}</td>
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

function SummaryCard({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 min-w-0">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold truncate">{label}</div>
      <div className="text-sm sm:text-lg font-black text-gray-900 mt-1 truncate">{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Print HTML — A4 landscape, proper pagination, repeating table headers
// ─────────────────────────────────────────────────────────────────────────────
function buildPrintHtml(data) {
  const { outletName, date, summary, categories, hasAnyPhysicalCount } = data;

  const fmtInrP = (n) => n == null ? '—' : `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
  const fmtMlP = (n) => n == null ? '—' : `${Number(n).toFixed(0)} ml`;
  const fmtPctP = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;

  const categoryRows = (categories || []).map((c) => `
    <tr>
      <td class="cat">${escapeHtml(c.categoryName)}</td>
      <td class="num">${fmtMlP(c.openingMl)}</td>
      <td class="num">${fmtMlP(c.purchasedMl)}</td>
      <td class="num bold">${fmtMlP(c.closingMl)}</td>
      <td class="num">${fmtMlP(c.physicalConsumptionMl)}</td>
      <td class="num">${fmtMlP(c.systemConsumptionMl)}</td>
      <td class="num ${Math.abs(c.varianceMl) > 1 ? 'variance-warn' : ''}">${fmtMlP(c.varianceMl)}</td>
      <td class="num">${fmtInrP(c.stockValue)}</td>
      <td class="num bold">${fmtInrP(c.sales)}</td>
    </tr>
  `).join('');

  const totalOpening = (categories || []).reduce((s, c) => s + c.openingMl, 0);
  const totalPurchases = (categories || []).reduce((s, c) => s + c.purchasedMl, 0);
  const totalClosing = (categories || []).reduce((s, c) => s + c.closingMl, 0);
  const totalPhysCons = (categories || []).reduce((s, c) => s + c.physicalConsumptionMl, 0);
  const totalSysCons = (categories || []).reduce((s, c) => s + c.systemConsumptionMl, 0);
  const totalVariance = (categories || []).reduce((s, c) => s + c.varianceMl, 0);
  const totalAcRev = (categories || []).reduce((s, c) => s + c.acRevenue, 0);
  const totalNonAcRev = (categories || []).reduce((s, c) => s + c.nonAcRevenue, 0);

  const profitRows = (categories || []).map((c) => `
    <tr>
      <td class="cat">${escapeHtml(c.categoryName)}</td>
      <td class="num bold">${fmtInrP(c.sales)}</td>
      <td class="num">${fmtInrP(c.acRevenue)}</td>
      <td class="num">${fmtInrP(c.nonAcRevenue)}</td>
      <td class="num">${fmtInrP(c.consumptionCost)}</td>
      <td class="num bold">${fmtInrP(c.grossProfit)}</td>
      <td class="num">${fmtPctP(c.grossMarginPct)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Liquor Report — ${escapeHtml(outletName)} — ${date}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 12mm 10mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1a1a1a;
    font-size: 11px;
    line-height: 1.4;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .header h1 { font-size: 18px; font-weight: 800; }
  .header .sub { font-size: 12px; color: #555; margin-top: 2px; }
  .header .date { font-size: 11px; color: #777; margin-top: 1px; }

  .banner {
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 4px;
    padding: 6px 10px;
    margin-bottom: 10px;
    font-size: 10px;
    color: #92400e;
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    margin: 14px 0 6px 0;
    color: #1a1a1a;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }
  .summary-card {
    background: #f5f5f5;
    border-radius: 4px;
    padding: 6px 8px;
  }
  .summary-card .label {
    font-size: 8px;
    text-transform: uppercase;
    font-weight: 700;
    color: #666;
    letter-spacing: 0.5px;
  }
  .summary-card .value {
    font-size: 14px;
    font-weight: 800;
    color: #1a1a1a;
    margin-top: 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th {
    background: #f3f4f6;
    text-align: right;
    padding: 5px 6px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    color: #4b5563;
    border: 1px solid #e5e7eb;
    letter-spacing: 0.3px;
  }
  th.cat { text-align: left; }
  td {
    padding: 4px 6px;
    font-size: 10px;
    border: 1px solid #e5e7eb;
    color: #374151;
  }
  td.cat { text-align: left; font-weight: 600; }
  td.num { text-align: right; }
  td.bold { font-weight: 700; color: #111827; }
  .variance-warn { color: #dc2626; font-weight: 700; }

  tfoot td {
    background: #f3f4f6;
    font-weight: 800;
    color: #111827;
    border-top: 2px solid #9ca3af;
  }

  .footer {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #d1d5db;
    font-size: 9px;
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
  <h1>Liquor Daily Stock Report — Admin</h1>
  <div class="sub">${escapeHtml(outletName)}</div>
  <div class="date">Date: ${date}</div>
</div>

${!hasAnyPhysicalCount ? '<div class="banner">⚠ No physical count taken on this date. Variance shown is wastage-adjusted only (Physical Consumption − System Consumption).</div>' : ''}

<div class="section-title">Business Summary</div>
<div class="summary-grid">
  <div class="summary-card"><div class="label">Opening Stock Value</div><div class="value">${fmtInrP(summary.totalOpeningStockValue)}</div></div>
  <div class="summary-card"><div class="label">Purchases Value</div><div class="value">${fmtInrP(summary.totalPurchasesValue)}</div></div>
  <div class="summary-card"><div class="label">Closing Stock Value</div><div class="value">${fmtInrP(summary.totalClosingStockValue)}</div></div>
  <div class="summary-card"><div class="label">Total Liquor Sales</div><div class="value">${fmtInrP(summary.totalLiquorSales)}</div></div>
  <div class="summary-card"><div class="label">Gross Profit</div><div class="value">${fmtInrP(summary.totalGrossProfit)}</div></div>
  <div class="summary-card"><div class="label">Physical Consumption</div><div class="value">${fmtMlP(summary.totalPhysicalConsumption)}</div></div>
  <div class="summary-card"><div class="label">System Consumption</div><div class="value">${fmtMlP(summary.totalSystemConsumption)}</div></div>
  <div class="summary-card"><div class="label">Variance</div><div class="value">${fmtMlP(summary.totalVarianceMl)}</div></div>
  <div class="summary-card"><div class="label">Consumption Cost</div><div class="value">${fmtInrP(summary.totalConsumptionCost)}</div></div>
  <div class="summary-card"><div class="label">Gross Margin</div><div class="value">${fmtPctP(summary.totalGrossMarginPct)}</div></div>
</div>

<div class="section-title">Category-wise Stock, Consumption & Sales</div>
<table>
  <thead>
    <tr>
      <th class="cat">Category</th>
      <th>Opening Stock</th>
      <th>Purchases</th>
      <th>Closing Stock</th>
      <th>Consumption</th>
      <th>System Consumption</th>
      <th>Variance</th>
      <th>Stock Value</th>
      <th>Sales</th>
    </tr>
  </thead>
  <tbody>
    ${categoryRows || '<tr><td colspan="9" style="text-align:center;color:#999;padding:16px;">No categories with activity on this date.</td></tr>'}
  </tbody>
  ${categories && categories.length > 0 ? `
  <tfoot>
    <tr>
      <td class="cat">TOTAL</td>
      <td class="num">${fmtMlP(totalOpening)}</td>
      <td class="num">${fmtMlP(totalPurchases)}</td>
      <td class="num">${fmtMlP(totalClosing)}</td>
      <td class="num">${fmtMlP(totalPhysCons)}</td>
      <td class="num">${fmtMlP(totalSysCons)}</td>
      <td class="num">${fmtMlP(totalVariance)}</td>
      <td class="num">${fmtInrP(summary.totalClosingStockValue)}</td>
      <td class="num">${fmtInrP(summary.totalLiquorSales)}</td>
    </tr>
  </tfoot>` : ''}
</table>

<div class="section-title">Category-wise Sales & Profitability</div>
<table>
  <thead>
    <tr>
      <th class="cat">Category</th>
      <th>Sales</th>
      <th>AC Revenue</th>
      <th>Non-AC Revenue</th>
      <th>Consumption Cost</th>
      <th>Gross Profit</th>
      <th>Margin</th>
    </tr>
  </thead>
  <tbody>
    ${profitRows || '<tr><td colspan="7" style="text-align:center;color:#999;padding:16px;">No data.</td></tr>'}
  </tbody>
  ${categories && categories.length > 0 ? `
  <tfoot>
    <tr>
      <td class="cat">TOTAL</td>
      <td class="num">${fmtInrP(summary.totalLiquorSales)}</td>
      <td class="num">${fmtInrP(totalAcRev)}</td>
      <td class="num">${fmtInrP(totalNonAcRev)}</td>
      <td class="num">${fmtInrP(summary.totalConsumptionCost)}</td>
      <td class="num">${fmtInrP(summary.totalGrossProfit)}</td>
      <td class="num">${fmtPctP(summary.totalGrossMarginPct)}</td>
    </tr>
  </tfoot>` : ''}
</table>

<div class="footer">
  Generated from actual POS billing data, inventory ledger, and purchase records.<br>
  Gross Profit = Sales Revenue − Consumption Cost · Gross Margin % = Gross Profit ÷ Sales Revenue × 100
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
