// ─────────────────────────────────────────────────────────────────────────────
// LiquorDailyReportModal — "PDF to Admin" daily liquor report (redesigned)
// ─────────────────────────────────────────────────────────────────────────────
// Data source: GET /api/bar/inventory/liquor-daily-report?date=YYYY-MM-DD
//   → { date, items, manualItems, businessPosition, missingPhysicalCount }
// Each item row is a permanent BarDailyRecord (single stock pool).
//
// Editable cells (append-only on the backend):
//   - Non-AC Sale (ml) → POST /non-ac-sale  (first entry = NON_AC_SALE,
//     re-edits = CORRECTION movements; originals are never modified)
//   - Physical Closing (ml) → PUT /physical-count (sets physicalClosingMl,
//     computes varianceMl, triggers sequential rebuild date → today)
//   - Hide toggle → PATCH /items/:id (isHiddenFromReport)
//   - Manual PDF-only rows → POST /manual-report-items
//
// "Save" persists all pending edits; "Save & Generate PDF" saves first,
// refetches, then prints so the PDF always reflects the database.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { X, Printer, AlertTriangle, Save, CheckCircle, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  fetchLiquorDailyReport,
  recordNonAcSale,
  setItemStock,
  updateInventoryItem,
  saveManualReportItems,
} from '../../services/barInventoryApi';
import { getKolkataDateString } from '../../shared/utils/dateFormat';

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMl(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// Format ml as bottles + remainder for readability
function fmtBtl(ml, size) {
  const v = Number(ml) || 0;
  const s = Number(size) || 0;
  if (s <= 0) return `${Math.round(v)}ml`;
  const b = v / s;
  return `${b % 1 === 0 ? b : b.toFixed(2)} btl`;
}

function numEq(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.round(Number(a) * 100) / 100 === Math.round(Number(b) * 100) / 100;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Printable HTML for the report ────────────────────────────────────────────
function buildPrintHtml({ date, items, manualItems, businessPosition }) {
  const visible = items.filter((i) => !i.isHiddenFromReport);
  const rows = visible.map((r, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td class="left">${escapeHtml(r.name)}${r.brand ? ` <span class="muted">(${escapeHtml(r.brand)})</span>` : ''}</td>
      <td>${r.bottleSizeMl}ml</td>
      <td class="num">${fmtMl(r.openingMl)}</td>
      <td class="num">${fmtMl(r.purchasedMl)}</td>
      <td class="num">${fmtMl(r.acSaleMl)}</td>
      <td class="num">${fmtMl(r.nonAcSaleMl)}</td>
      <td class="num">${fmtMl(r.wastageMl)}</td>
      <td class="num">${fmtMl(r.systemClosingMl)}</td>
      <td class="num">${r.physicalClosingMl != null ? fmtMl(r.physicalClosingMl) : '—'}</td>
      <td class="num">${r.varianceMl != null ? fmtMl(r.varianceMl) : '—'}</td>
      <td class="num">${fmtInr(r.stockValue)}</td>
      <td class="num">${fmtInr(r.totalRevenue)}</td>
      <td class="num">${fmtInr(r.profit)}</td>
    </tr>`).join('');

  const manualRows = (manualItems || []).filter((m) => !m.isHidden).map((m) => `
    <tr>
      <td></td>
      <td class="left">${escapeHtml(m.itemName)} <span class="muted">[manual]</span></td>
      <td>${m.qty ? `${m.qty}` : '—'}</td>
      <td class="num">${m.opening ?? '—'}</td>
      <td class="num">${m.received ?? '—'}</td>
      <td class="num">${m.sale ?? '—'}</td>
      <td class="num">—</td>
      <td class="num">—</td>
      <td class="num">${m.closing ?? '—'}</td>
      <td class="num">—</td>
      <td class="num">—</td>
      <td class="num">${m.purchaseCost ? fmtInr(m.purchaseCost) : '—'}</td>
      <td class="num">${m.saleAmount ? fmtInr(m.saleAmount) : '—'}</td>
      <td class="num">${m.profit ? fmtInr(m.profit) : '—'}</td>
    </tr>`).join('');

  const bp = businessPosition || {};
  return `<!doctype html><html><head><meta charset="utf-8"><title>Liquor Report ${date}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 16px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .muted { color: #777; }
  .bp { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0; padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
  .bp div { min-width: 130px; }
  .bp .lbl { font-size: 9px; text-transform: uppercase; color: #666; }
  .bp .val { font-weight: bold; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; }
  th { background: #f3f4f6; font-size: 10px; }
  td.left, th.left { text-align: left; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .section { margin-top: 14px; font-weight: bold; font-size: 12px; }
</style></head><body>
  <h1>Daily Liquor Stock &amp; Sales Report — ${escapeHtml(date)}</h1>
  <div class="bp">
    <div><div class="lbl">Opening Stock Value</div><div class="val">${fmtInr(bp.openingStockValue)}</div></div>
    <div><div class="lbl">Purchases Value</div><div class="val">${fmtInr(bp.purchases)}</div></div>
    <div><div class="lbl">Total Available</div><div class="val">${fmtInr(bp.totalAvailable)}</div></div>
    <div><div class="lbl">AC Sales</div><div class="val">${fmtInr(bp.acSales)}</div></div>
    <div><div class="lbl">Non-AC Sales</div><div class="val">${fmtInr(bp.nonAcSales)}</div></div>
    <div><div class="lbl">Total Revenue</div><div class="val">${fmtInr(bp.totalRevenue)}</div></div>
    <div><div class="lbl">Consumption Cost</div><div class="val">${fmtInr(bp.consumptionCost)}</div></div>
    <div><div class="lbl">Closing Stock Value</div><div class="val">${fmtInr(bp.closingStockValue)}</div></div>
    <div><div class="lbl">Profit</div><div class="val">${fmtInr(bp.profit)}</div></div>
  </div>
  <div class="section">Item-wise Report (ml columns are in ml)</div>
  <table>
    <thead><tr>
      <th>#</th><th class="left">Item</th><th>Size</th><th>Opening</th><th>Purchases</th>
      <th>AC Sale</th><th>Non-AC Sale</th><th>Wastage</th><th>Sys. Closing</th>
      <th>Phys. Closing</th><th>Variance</th><th>Stock Value</th><th>Sale Amount</th><th>Profit</th>
    </tr></thead>
    <tbody>${rows}${manualRows}</tbody>
  </table>
</body></html>`;
}

export default function LiquorDailyReportModal({ open, date, onClose, onSaved }) {
  const [reportDate, setReportDate] = useState(date || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // Pending edits (ml values): applied on Save
  const [nonAcEdits, setNonAcEdits] = useState({});      // { itemId: ml }
  const [physicalEdits, setPhysicalEdits] = useState({}); // { itemId: ml }
  // Manual PDF-only rows
  const [manualItems, setManualItems] = useState([]);

  useEffect(() => {
    if (open) {
      setReportDate(date || getKolkataDateString());
      setNonAcEdits({});
      setPhysicalEdits({});
      setManualItems([]);
      setError(null);
      setSavedMsg(false);
    }
  }, [open, date]);

  const loadData = useCallback(async (d) => {
    const target = d || reportDate;
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const json = await fetchLiquorDailyReport(target);
      setData(json);
      setManualItems((json.manualItems || []).map((m) => ({ ...m })));
      setNonAcEdits({});
      setPhysicalEdits({});
    } catch (err) {
      setError(err.message || 'Failed to load report');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  useEffect(() => {
    if (open && reportDate) loadData(reportDate);
  }, [open, reportDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items || [];
  const bp = data?.businessPosition || {};

  const hasPendingChanges = Object.keys(nonAcEdits).length > 0
    || Object.keys(physicalEdits).length > 0
    || manualItems.length !== (data?.manualItems?.length ?? 0)
    || manualItems.some((m) => m.id == null || m._dirty);

  // ── Edit handlers ──────────────────────────────────────────────────────────
  const handleNonAcEdit = (itemId, value) => {
    setNonAcEdits((prev) => {
      const next = { ...prev };
      const item = items.find((i) => i.id === itemId);
      const current = Number(item?.nonAcSaleMl) || 0;
      if (value === '' || numEq(Number(value), current)) delete next[itemId];
      else next[itemId] = Number(value);
      return next;
    });
  };

  const handlePhysicalEdit = (itemId, value) => {
    setPhysicalEdits((prev) => {
      const next = { ...prev };
      const item = items.find((i) => i.id === itemId);
      const current = item?.physicalClosingMl;
      if (value === '' || numEq(Number(value), current)) delete next[itemId];
      else next[itemId] = Number(value);
      return next;
    });
  };

  const handleToggleHide = async (item) => {
    try {
      await updateInventoryItem(item.id, { isHiddenFromReport: !item.isHiddenFromReport });
      setData((prev) => prev ? {
        ...prev,
        items: prev.items.map((i) => i.id === item.id ? { ...i, isHiddenFromReport: !i.isHiddenFromReport } : i),
      } : prev);
    } catch (err) {
      setError(err.message || 'Failed to update visibility');
    }
  };

  const handleAddManualItem = () => {
    setManualItems((prev) => [...prev, {
      id: null, section: 'AC', itemName: '', categoryName: '',
      qty: 0, sale: 0, purchaseCost: 0, sellingPrice: 0,
      consumption: 0, saleAmount: 0, profit: 0,
      opening: 0, received: 0, closing: 0, isHidden: false,
    }]);
  };

  const handleManualItemChange = (idx, field, value) => {
    setManualItems((prev) => prev.map((m, i) => {
      if (i !== idx) return m;
      const next = { ...m, [field]: value, _dirty: true };
      next.consumption = (Number(next.sale) || 0) * (Number(next.purchaseCost) || 0);
      next.saleAmount = (Number(next.sale) || 0) * (Number(next.sellingPrice) || 0);
      next.profit = next.saleAmount - next.consumption;
      return next;
    }));
  };

  const handleRemoveManualItem = (idx) => {
    setManualItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Save: persist all pending edits (each triggers a backend rebuild) ──────
  const handleSave = async () => {
    if (!reportDate) return null;
    setSaving(true);
    setError(null);
    setSavedMsg(false);
    try {
      // 1. Non-AC sale edits → NON_AC_SALE / CORRECTION movements
      for (const [itemId, ml] of Object.entries(nonAcEdits)) {
        if (!(Number(ml) >= 0)) continue;
        await recordNonAcSale({ itemId, date: reportDate, quantityMl: Number(ml) });
      }
      // 2. Physical closing edits → physical-count endpoint
      for (const [itemId, ml] of Object.entries(physicalEdits)) {
        if (!(Number(ml) >= 0)) continue;
        await setItemStock(itemId, Number(ml), { date: reportDate, notes: 'Physical count (report edit)' });
      }
      // 3. Manual PDF-only rows
      await saveManualReportItems({ date: reportDate, items: manualItems });

      // Refetch — the backend already ran sequential rebuilds
      const json = await fetchLiquorDailyReport(reportDate);
      setData(json);
      setManualItems((json.manualItems || []).map((m) => ({ ...m })));
      setNonAcEdits({});
      setPhysicalEdits({});
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
      onSaved?.();
      return json;
    } catch (err) {
      setError(err.message || 'Failed to save report');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndPrint = async () => {
    const fresh = await handleSave();
    if (!fresh) return; // save failed — error already shown
    const html = buildPrintHtml({
      date: fresh.date,
      items: fresh.items || [],
      manualItems: fresh.manualItems || [],
      businessPosition: fresh.businessPosition || {},
    });
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) {
      setError('Popup blocked — please allow popups to print the report.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  if (!open) return null;

  const visibleItems = items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-7xl mx-4 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Daily Liquor Report — PDF to Admin</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Permanent daily records. Past-date edits write correction movements and rebuild all following days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading report...</div>
          ) : !data ? (
            <div className="p-12 text-center text-gray-400">Select a date to load the report.</div>
          ) : (
            <>
              {/* Business Position summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  ['Opening Value', bp.openingStockValue],
                  ['Purchases', bp.purchases],
                  ['Total Available', bp.totalAvailable],
                  ['AC Sales', bp.acSales],
                  ['Non-AC Sales', bp.nonAcSales],
                  ['Total Revenue', bp.totalRevenue],
                  ['Consumption Cost', bp.consumptionCost],
                  ['Closing Value', bp.closingStockValue],
                  ['Profit', bp.profit],
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
                    <div className="text-sm font-bold text-gray-900 mt-0.5">{fmtInr(val)}</div>
                  </div>
                ))}
                {data.missingPhysicalCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-amber-600 uppercase tracking-wide">Missing Physical Count</div>
                    <div className="text-sm font-bold text-amber-700 mt-0.5">{data.missingPhysicalCount} items</div>
                  </div>
                )}
              </div>

              {/* Item-wise table */}
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Item</th>
                      <th className="px-2 py-2 text-right">Opening</th>
                      <th className="px-2 py-2 text-right">Purchases</th>
                      <th className="px-2 py-2 text-right">AC Sale</th>
                      <th className="px-2 py-2 text-right">Non-AC Sale (ml)</th>
                      <th className="px-2 py-2 text-right">Wastage</th>
                      <th className="px-2 py-2 text-right">Sys. Closing</th>
                      <th className="px-2 py-2 text-right">Phys. Closing (ml)</th>
                      <th className="px-2 py-2 text-right">Variance</th>
                      <th className="px-2 py-2 text-right">Stock Value</th>
                      <th className="px-2 py-2 text-right">Sale Amt</th>
                      <th className="px-2 py-2 text-right">Profit</th>
                      <th className="px-2 py-2 text-center">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleItems.map((r, idx) => {
                      const nonAcVal = nonAcEdits[r.id] !== undefined ? nonAcEdits[r.id] : r.nonAcSaleMl;
                      const physVal = physicalEdits[r.id] !== undefined ? physicalEdits[r.id] : (r.physicalClosingMl ?? '');
                      const edited = nonAcEdits[r.id] !== undefined || physicalEdits[r.id] !== undefined;
                      return (
                        <tr key={r.id} className={r.isHiddenFromReport ? 'opacity-40' : ''}>
                          <td className="px-2 py-1.5 text-gray-400">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium text-gray-900">{r.name}</div>
                            <div className="text-gray-400">{r.brand} · {r.bottleSizeMl}ml</div>
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmtMl(r.openingMl)}</td>
                          <td className="px-2 py-1.5 text-right text-green-700">{fmtMl(r.purchasedMl)}</td>
                          <td className="px-2 py-1.5 text-right">{fmtMl(r.acSaleMl)}</td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min="0"
                              value={nonAcVal ?? ''}
                              onChange={(e) => handleNonAcEdit(r.id, e.target.value)}
                              className={`w-20 px-1.5 py-1 text-right rounded border text-xs ${nonAcEdits[r.id] !== undefined ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                            />
                            <div className="text-[9px] text-gray-400">{fmtBtl(nonAcVal, r.bottleSizeMl)}</div>
                          </td>
                          <td className="px-2 py-1.5 text-right text-orange-600">{fmtMl(r.wastageMl)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{fmtMl(r.systemClosingMl)}</td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min="0"
                              value={physVal}
                              onChange={(e) => handlePhysicalEdit(r.id, e.target.value)}
                              placeholder="—"
                              className={`w-20 px-1.5 py-1 text-right rounded border text-xs ${physicalEdits[r.id] !== undefined ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
                            />
                            <div className="text-[9px] text-gray-400">{physVal !== '' ? fmtBtl(physVal, r.bottleSizeMl) : ''}</div>
                          </td>
                          <td className={`px-2 py-1.5 text-right ${Number(r.varianceMl) !== 0 && r.varianceMl != null ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                            {r.varianceMl != null ? fmtMl(r.varianceMl) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmtInr(r.stockValue)}</td>
                          <td className="px-2 py-1.5 text-right">{fmtInr(r.totalRevenue)}</td>
                          <td className={`px-2 py-1.5 text-right ${Number(r.profit) < 0 ? 'text-red-600' : ''}`}>{fmtInr(r.profit)}</td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => handleToggleHide(r)}
                              className="text-gray-400 hover:text-gray-700"
                              title={r.isHiddenFromReport ? 'Show in PDF' : 'Hide from PDF'}
                            >
                              {r.isHiddenFromReport ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                          {edited && <td className="hidden" />}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Manual PDF-only rows */}
              <div className="border border-dashed border-gray-300 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Manual PDF-only Items</div>
                    <div className="text-xs text-gray-400">Report rows not tied to inventory stock.</div>
                  </div>
                  <button
                    onClick={handleAddManualItem}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                </div>
                {manualItems.length > 0 && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left px-1 py-1">Item</th>
                        <th className="text-left px-1 py-1">Category</th>
                        <th className="px-1 py-1">Qty</th>
                        <th className="px-1 py-1">Sale</th>
                        <th className="px-1 py-1">Cost</th>
                        <th className="px-1 py-1">Price</th>
                        <th className="px-1 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {manualItems.map((m, idx) => (
                        <tr key={m.id || `new-${idx}`}>
                          <td className="px-1 py-1">
                            <input value={m.itemName} onChange={(e) => handleManualItemChange(idx, 'itemName', e.target.value)}
                              className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" placeholder="Item name" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={m.categoryName || ''} onChange={(e) => handleManualItemChange(idx, 'categoryName', e.target.value)}
                              className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs" placeholder="Category" />
                          </td>
                          {['qty', 'sale', 'purchaseCost', 'sellingPrice'].map((f) => (
                            <td key={f} className="px-1 py-1">
                              <input type="number" min="0" value={m[f] ?? 0} onChange={(e) => handleManualItemChange(idx, f, Number(e.target.value))}
                                className="w-16 px-1.5 py-1 border border-gray-200 rounded text-xs text-right" />
                            </td>
                          ))}
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => handleRemoveManualItem(idx)} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-5 border-t border-gray-100">
          <div className="text-xs text-gray-400">
            {savedMsg && (
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <CheckCircle className="w-4 h-4" /> Saved — all following days rebuilt.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasPendingChanges || !data}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleSaveAndPrint}
              disabled={saving || !data}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#E53935] text-white text-sm font-semibold hover:bg-[#B71C1C] disabled:opacity-50 transition-colors"
            >
              <Printer className="w-4 h-4" /> {saving ? 'Saving...' : 'Save & Generate PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
