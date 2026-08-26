// ─────────────────────────────────────────────────────────────────────────────
// StockSheetPrintModal — Daily Stock & Sales Summary (printable PDF)
// ─────────────────────────────────────────────────────────────────────────────
// Opens from the Inventory toolbar "Print / PDF" button. Lets the admin pick a
// date, fetches the stock sheet for that date (only items with relevant
// activity), previews it in the physical-sheet format, and prints/saves as PDF
// via the browser's print dialog (opened in a clean print window).
//
// The sheet format mirrors the physical stock sheet:
//   STOCK AND SALES SUMMARY — <WING> — DD.MM.YYYY
//   Outlet: <name>
//   Columns: # | Item | Opening | Received | Consumption | Additional | Closing
//   Grouped by category with category totals + grand totals.
//   "Additional" is left blank for manual write-in unless a real adjustment exists.
//
// Reconciliation discrepancies (opening != prev closing, or computed closing !=
// stored closing) are flagged so the admin can investigate before printing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { fetchBarStockSheet } from '../../services/barInventoryApi';
import { fetchKitchenStockSheet } from '../../services/kitchenInventoryApi';
import { getKolkataDateString } from '../../shared/utils/dateFormat';

export function StockSheetPrintModal({ open, tab, restaurant, defaultDate, onClose }) {
  const [date, setDate] = useState(defaultDate || getKolkataDateString());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Reset + fetch when opened
  useEffect(() => {
    if (open) {
      setDate(defaultDate || getKolkataDateString());
    }
  }, [open, defaultDate]);

  const loadSheet = useCallback(async (targetDate) => {
    if (!targetDate) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = tab === 'bar'
        ? await fetchBarStockSheet(targetDate)
        : await fetchKitchenStockSheet(targetDate);
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load stock sheet');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (open && date) loadSheet(date);
  }, [open, date, loadSheet]);

  if (!open) return null;

  const outletName = data?.outletName || restaurant?.name || 'Outlet';
  const wing = data?.wing || (tab === 'bar' ? 'BAR' : 'KITCHEN');
  const formattedDate = formatDateDDMMYYYY(date);

  const handlePrint = () => {
    const html = buildPrintHtml(data, { outletName, wing, formattedDate, tab });
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      alert('Please allow pop-ups to print the stock sheet.');
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    // Give the browser a moment to render before triggering print
    printWin.onload = () => {
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 250);
    };
    // Fallback if onload already fired
    setTimeout(() => {
      try {
        printWin.focus();
        printWin.print();
      } catch {}
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl mx-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-[#E53935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Print / PDF — Daily Stock &amp; Sales Summary</h2>
              <p className="text-xs text-gray-500">{tab === 'bar' ? 'Bar Inventory' : 'Kitchen Inventory'} · only items with activity on the selected date</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Date picker */}
        <div className="flex flex-wrap items-center gap-3 p-5 border-b border-gray-100 bg-gray-50/50">
          <label className="text-sm font-semibold text-gray-700">Sheet date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
          />
          <span className="text-xs text-gray-400">Historical sheets use the inventory state &amp; transactions for that date.</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => loadSheet(date)}
              disabled={loading || !date}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={handlePrint}
              disabled={loading || !data}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#E53935] hover:bg-[#B71C1C] disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading && (
            <div className="text-center py-12 text-gray-400">Loading stock sheet…</div>
          )}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-4 mb-4">{error}</div>
          )}
          {!loading && !error && data && (
            <StockSheetPreview data={data} outletName={outletName} wing={wing} formattedDate={formattedDate} tab={tab} />
          )}
          {!loading && !error && data && data.totalRelevantItems === 0 && (
            <div className="bg-yellow-50 text-yellow-700 text-sm rounded-lg p-4 mt-3">
              No items had any stock activity (sales, purchases, adjustments, or movements) on {formattedDate}. The sheet will be empty for this date.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview — mirrors the print layout inside the modal
// ─────────────────────────────────────────────────────────────────────────────
function StockSheetPreview({ data, outletName, wing, formattedDate, tab }) {
  const isBar = tab === 'bar';
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Sheet header */}
      <div className="text-center py-3 border-b-2 border-gray-800 bg-white">
        <div className="text-lg font-black tracking-wide uppercase">Stock AND SALES SUMMARY</div>
        <div className="text-sm font-semibold mt-0.5">{wing} WING — {formattedDate}</div>
        <div className="text-xs text-gray-600 mt-0.5">Outlet: {outletName}</div>
      </div>

      {/* Discrepancy banner */}
      {data.hasDiscrepancies && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-xs text-yellow-800">
          ⚠ {data.discrepancies.length} item(s) failed reconciliation (opening ≠ previous closing, or computed closing ≠ stored closing). Review before printing.
        </div>
      )}

      {/* Category sections */}
      {data.categories.map((section) => (
        <div key={section.category} className="border-b border-gray-200 last:border-b-0">
          <div className="bg-gray-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-700">
            {section.category}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <th className="text-center px-2 py-1.5 font-semibold w-8">#</th>
                <th className="text-left px-2 py-1.5 font-semibold">Item</th>
                <th className="text-right px-2 py-1.5 font-semibold w-20">Opening</th>
                {isBar && <th className="text-right px-2 py-1.5 font-semibold w-16">Op. Bottles</th>}
                <th className="text-right px-2 py-1.5 font-semibold w-20">Received</th>
                <th className="text-right px-2 py-1.5 font-semibold w-24">Consumption</th>
                <th className="text-right px-2 py-1.5 font-semibold w-20">Additional</th>
                <th className="text-right px-2 py-1.5 font-semibold w-20">Closing</th>
              </tr>
            </thead>
            <tbody>
              {section.items.map((item) => (
                <tr key={item.itemId} className="border-b border-gray-100">
                  <td className="text-center px-2 py-1.5 text-gray-500">{item.itemNumber}</td>
                  <td className="px-2 py-1.5 font-medium text-gray-900">
                    {item.itemName}
                    {!item.reconciled && (
                      <span className="ml-1 text-yellow-600" title="Reconciliation mismatch">⚠</span>
                    )}
                  </td>
                  <td className="text-right px-2 py-1.5 text-gray-700">{fmt(item.openingStock, isBar)}</td>
                  {isBar && (
                    <td className="text-right px-2 py-1.5 text-gray-700">
                      {fmtBottles(item.openingStock, item.bottleSize)}
                    </td>
                  )}
                  <td className="text-right px-2 py-1.5 text-gray-700">{fmt(item.received, isBar)}</td>
                  <td className="text-right px-2 py-1.5 text-gray-700">{fmt(item.consumption, isBar)}</td>
                  <td className="text-right px-2 py-1.5 text-gray-300">&nbsp;</td>
                  <td className="text-right px-2 py-1.5 font-semibold text-gray-900">{fmt(item.closingStock, isBar)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                <td colSpan={isBar ? 3 : 2} className="px-2 py-1.5 text-right text-gray-600 uppercase text-[10px]">Category Total</td>
                {isBar && <td className="text-right px-2 py-1.5 text-gray-300">&nbsp;</td>}
                <td className="text-right px-2 py-1.5 text-gray-800">{fmt(section.totals.received, isBar)}</td>
                <td className="text-right px-2 py-1.5 text-gray-800">{fmt(section.totals.consumption, isBar)}</td>
                <td className="text-right px-2 py-1.5 text-gray-300">&nbsp;</td>
                <td className="text-right px-2 py-1.5 text-gray-900">{fmt(section.totals.closingStock, isBar)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {/* Grand total */}
      {data.categories.length > 0 && (
        <div className="bg-gray-800 text-white">
          <table className="w-full text-xs">
            <tbody>
              <tr className="font-bold">
                <td className="px-2 py-2 uppercase text-[10px] tracking-wide">Grand Total ({data.totalRelevantItems} items)</td>
                <td className="text-right px-2 py-2 w-20">{fmt(data.grandTotals.openingStock, isBar)}</td>
                {isBar && <td className="text-right px-2 py-2 w-16 text-gray-400">&nbsp;</td>}
                <td className="text-right px-2 py-2 w-20">{fmt(data.grandTotals.received, isBar)}</td>
                <td className="text-right px-2 py-2 w-24">{fmt(data.grandTotals.consumption, isBar)}</td>
                <td className="text-right px-2 py-2 w-20 text-gray-400">&nbsp;</td>
                <td className="text-right px-2 py-2 w-20">{fmt(data.grandTotals.closingStock, isBar)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Sign-off line */}
      <div className="flex justify-between px-4 py-3 text-[10px] text-gray-500 border-t border-gray-200">
        <span>Prepared by: ____________________</span>
        <span>Verified by: ____________________</span>
        <span>Signature: ____________________</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateDDMMYYYY(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}.${m}.${y}`;
}

// Format a number for display. Bar items show ML-based values (e.g. "750 ml"
// or "2 bottles + 300 ml") when the backend provides display strings; numeric
// fallback otherwise. Kitchen items show plain numbers with unit suffix.
function fmt(value, isBar) {
  const n = Number(value) || 0;
  if (isBar) {
    // Bar values are in ML. Show compact ml; whole-bottle equivalents are in
    // the dedicated display fields on the backend, but for the sheet we keep
    // the raw ml quantity so the admin can verify against peg/bottle counts.
    return `${Math.round(n * 100) / 100}`;
  }
  return `${Math.round(n * 100) / 100}`;
}

// Format opening stock as bottle count for bar items.
// openingBottles = openingStock(ml) / bottleSize(ml), shown to 2 decimals.
function fmtBottles(openingMl, bottleSize) {
  const ml = Number(openingMl) || 0;
  const size = Number(bottleSize) || 750;
  if (size <= 0) return '';
  return `${Math.round((ml / size) * 100) / 100}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Print HTML — clean, print-optimized document opened in a new window
// ─────────────────────────────────────────────────────────────────────────────
function buildPrintHtml(data, { outletName, wing, formattedDate, tab }) {
  const isBar = tab === 'bar';
  const unitLabel = isBar ? '(ml)' : '';
  const bottlesHeader = isBar ? '<th class="num narrow">Op. Bottles</th>' : '';
  const bottlesTotalLabel = isBar ? '<td class="num narrow"></td>' : '';

  const categoryBlocks = (data?.categories || []).map((section) => {
    const itemRows = section.items.map((item) => {
      const bottlesCell = isBar
        ? `<td class="num narrow">${fmtBottles(item.openingStock, item.bottleSize)}</td>`
        : '';
      return `
      <tr>
        <td class="num">${item.itemNumber}</td>
        <td class="name">${escapeHtml(item.itemName)}${!item.reconciled ? ' <span class="warn">⚠</span>' : ''}</td>
        <td class="num">${fmt(item.openingStock, isBar)}</td>
        ${bottlesCell}
        <td class="num">${fmt(item.received, isBar)}</td>
        <td class="num">${fmt(item.consumption, isBar)}</td>
        <td class="num blank"></td>
        <td class="num closing">${fmt(item.closingStock, isBar)}</td>
      </tr>`;
    }).join('');

    return `
      <div class="category-block">
        <div class="category-header">${escapeHtml(section.category)}</div>
        <table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th class="name">Item</th>
              <th class="num">Opening ${unitLabel}</th>
              ${bottlesHeader}
              <th class="num">Received</th>
              <th class="num">Consumption</th>
              <th class="num">Additional</th>
              <th class="num">Closing ${unitLabel}</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
          <tfoot>
            <tr class="cat-total">
              <td colspan="2" class="label">Category Total</td>
              <td class="num">${fmt(section.totals.openingStock, isBar)}</td>
              ${bottlesTotalLabel}
              <td class="num">${fmt(section.totals.received, isBar)}</td>
              <td class="num">${fmt(section.totals.consumption, isBar)}</td>
              <td class="num"></td>
              <td class="num">${fmt(section.totals.closingStock, isBar)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }).join('');

  const grandTotal = data?.categories?.length ? `
    <table class="grand-total">
      <tbody>
        <tr>
          <td class="label">GRAND TOTAL (${data.totalRelevantItems} items)</td>
          <td class="num">${fmt(data.grandTotals.openingStock, isBar)}</td>
          ${isBar ? '<td class="num narrow"></td>' : ''}
          <td class="num">${fmt(data.grandTotals.received, isBar)}</td>
          <td class="num">${fmt(data.grandTotals.consumption, isBar)}</td>
          <td class="num"></td>
          <td class="num">${fmt(data.grandTotals.closingStock, isBar)}</td>
        </tr>
      </tbody>
    </table>` : '';

  const discrepancyNote = data?.hasDiscrepancies
    ? `<div class="discrepancy"><strong>⚠ Reconciliation warning:</strong> ${data.discrepancies.length} item(s) failed reconciliation (opening ≠ previous day closing, or computed closing ≠ stored closing). Please investigate before signing.</div>`
    : '';

  const emptyNote = data?.totalRelevantItems === 0
    ? `<div class="empty">No items had any stock activity (sales, purchases, adjustments, or movements) on ${formattedDate}.</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Stock and Sales Summary — ${escapeHtml(outletName)} — ${wing} — ${formattedDate}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #111;
    margin: 16mm 12mm;
    font-size: 11px;
  }
  .sheet-header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .sheet-header h1 { font-size: 16px; letter-spacing: 1px; margin: 0; text-transform: uppercase; }
  .sheet-header .wing { font-size: 13px; font-weight: bold; margin-top: 2px; }
  .sheet-header .outlet { font-size: 11px; color: #333; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; font-size: 10px; color: #444; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 3px 5px; }
  th { background: #eee; font-size: 10px; text-transform: uppercase; }
  td.num, th.num { text-align: right; width: 11%; }
  td.narrow, th.narrow { text-align: right; width: 8%; }
  td.name, th.name { text-align: left; width: 30%; }
  td.closing { font-weight: bold; }
  td.blank { color: #888; }
  .category-block { margin-bottom: 8px; page-break-inside: avoid; }
  .category-header { background: #ddd; font-weight: bold; padding: 3px 6px; border: 1px solid #999; border-bottom: none; font-size: 11px; text-transform: uppercase; }
  .cat-total td { background: #f3f3f3; font-weight: bold; }
  .cat-total td.label { text-align: right; font-size: 9px; text-transform: uppercase; }
  .grand-total { margin-top: 6px; }
  .grand-total td { background: #222; color: #fff; font-weight: bold; padding: 5px; border-color: #222; }
  .grand-total td.label { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .signoff { display: flex; justify-content: space-between; margin-top: 18px; font-size: 10px; color: #333; border-top: 1px solid #999; padding-top: 10px; }
  .discrepancy { background: #fff8e1; border: 1px solid #f0c000; padding: 6px 8px; margin: 8px 0; font-size: 10px; }
  .empty { background: #f5f5f5; padding: 12px; text-align: center; color: #555; border: 1px solid #ccc; }
  .warn { color: #c17900; }
  @media print {
    body { margin: 10mm 8mm; }
    .category-block { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="sheet-header">
    <h1>Stock and Sales Summary</h1>
    <div class="wing">${escapeHtml(wing)} WING — ${formattedDate}</div>
    <div class="outlet">Outlet: ${escapeHtml(outletName)}</div>
  </div>
  <div class="meta">
    <span>Generated: ${new Date().toLocaleString('en-GB')}</span>
    <span>Items with activity: ${data?.totalRelevantItems || 0}</span>
  </div>
  ${discrepancyNote}
  ${emptyNote}
  ${categoryBlocks}
  ${grandTotal}
  <div class="signoff">
    <span>Prepared by: ____________________</span>
    <span>Verified by: ____________________</span>
    <span>Signature: ____________________</span>
  </div>
  <script>
    window.onload = function() { setTimeout(function(){ window.focus(); window.print(); }, 200); };
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
