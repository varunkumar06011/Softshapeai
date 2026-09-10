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
//
// PDF output: Only items that had activity that day (AC sale, Non-AC sale,
// wastage, or purchase) appear in the PDF. Zero-activity items are excluded.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { X, Printer, AlertTriangle, Save, CheckCircle, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  fetchLiquorDailyReport,
  recordNonAcSale,
  setItemStock,
  updateInventoryItem,
  saveManualReportItems,
  getOrCreateRequestId,
  clearRequestId,
} from '../../services/barInventoryApi';
import { getKolkataDateString } from '../../shared/utils/dateFormat';
import { isBeerItem, fmtBeerBottles } from './inventoryConstants';

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `\u20B9${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

// Beer rows display pure bottle counts; everything else stays in ml.
function fmtRowMl(r, v) {
  return isBeerItem(r) ? fmtBeerBottles(v, r.bottleSizeMl) : fmtMl(v);
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
// Shows ONLY items that had activity that day (AC sale, Non-AC sale, wastage, or purchase).
// Items with zero activity are excluded — the admin only sees what actually moved.
function buildPrintHtml({ date, items, manualItems, businessPosition }) {
  const visible = items.filter((i) => !i.isHiddenFromReport);

  // Only show items that had activity that day
  const soldItems = visible.filter((r) =>
    (Number(r.acSaleMl) || 0) > 0 ||
    (Number(r.nonAcSaleMl) || 0) > 0 ||
    (Number(r.wastageMl) || 0) > 0 ||
    (Number(r.purchasedMl) || 0) > 0
  );

  // Group by category for cleaner presentation
  const byCategory = {};
  for (const r of soldItems) {
    const cat = r.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(r);
  }

  let serialNum = 0;
  const categorySections = Object.keys(byCategory).sort().map((cat) => {
    const catRows = byCategory[cat].map((r) => {
      serialNum++;
      const acSale = Number(r.acSaleMl) || 0;
      const nonAcSale = Number(r.nonAcSaleMl) || 0;
      return `
    <tr>
      <td class="center">${serialNum}</td>
      <td class="left">${escapeHtml(r.name)}</td>
      <td class="center">${r.bottleSizeMl}ml</td>
      <td class="right">${fmtRowMl(r, r.openingMl)}</td>
      <td class="right">${(Number(r.purchasedMl) || 0) > 0 ? fmtRowMl(r, r.purchasedMl) : '\u2014'}</td>
      <td class="right">${acSale > 0 ? fmtRowMl(r, acSale) : '\u2014'}</td>
      <td class="right">${nonAcSale > 0 ? fmtRowMl(r, nonAcSale) : '\u2014'}</td>
      <td class="right">${(Number(r.wastageMl) || 0) > 0 ? fmtRowMl(r, r.wastageMl) : '\u2014'}</td>
      <td class="right bold">${fmtRowMl(r, r.systemClosingMl)}</td>
      <td class="right">${r.physicalClosingMl != null ? fmtRowMl(r, r.physicalClosingMl) : '\u2014'}</td>
      <td class="right ${Number(r.varianceMl) !== 0 && r.varianceMl != null ? 'neg' : 'muted'}">${r.varianceMl != null ? fmtRowMl(r, r.varianceMl) : '\u2014'}</td>
      <td class="right">${fmtInr(r.totalRevenue)}</td>
      <td class="right ${Number(r.profit) < 0 ? 'neg' : ''}">${fmtInr(r.profit)}</td>
    </tr>`;
    }).join('');

    return `
  <div class="cat-header">${escapeHtml(cat)} <span class="cat-count">(${byCategory[cat].length} ${byCategory[cat].length === 1 ? 'item' : 'items'})</span></div>
  <table>
    <thead><tr>
      <th>#</th><th class="left">Item</th><th>Bottle</th><th>Opening</th><th>Purchase</th>
      <th>AC Sale</th><th>Non-AC</th><th>Wastage</th><th>Closing</th>
      <th>Phys. Close</th><th>Variance</th><th>Sale Amt</th><th>Profit</th>
    </tr></thead>
    <tbody>${catRows}</tbody>
  </table>`;
  }).join('');

  const manualFiltered = (manualItems || []).filter((m) => !m.isHidden && m.itemName);
  const manualRows = manualFiltered.map((m, idx) => `
    <tr>
      <td class="center">${serialNum + idx + 1}</td>
      <td class="left">${escapeHtml(m.itemName)} <span class="muted">[manual]</span></td>
      <td class="center">${m.qty || '\u2014'}</td>
      <td class="right">${m.opening ?? '\u2014'}</td>
      <td class="right">${m.received ?? '\u2014'}</td>
      <td class="right">${m.sale ?? '\u2014'}</td>
      <td class="right">\u2014</td>
      <td class="right">\u2014</td>
      <td class="right">${m.closing ?? '\u2014'}</td>
      <td class="right">\u2014</td>
      <td class="right">\u2014</td>
      <td class="right">${m.saleAmount ? fmtInr(m.saleAmount) : '\u2014'}</td>
      <td class="right">${m.profit ? fmtInr(m.profit) : '\u2014'}</td>
    </tr>`).join('');

  const manualSection = manualRows ? `
  <div class="cat-header">Manual Items</div>
  <table>
    <thead><tr>
      <th>#</th><th class="left">Item</th><th>Qty</th><th>Opening</th><th>Received</th>
      <th>Sale</th><th>Non-AC</th><th>Wastage</th><th>Closing</th>
      <th>Phys. Close</th><th>Variance</th><th>Sale Amt</th><th>Profit</th>
    </tr></thead>
    <tbody>${manualRows}</tbody>
  </table>` : '';

  const bp = businessPosition || {};
  const totalItemsSold = soldItems.length + manualFiltered.length;
  const totalAcMl = soldItems.reduce((s, r) => s + (Number(r.acSaleMl) || 0), 0);
  const totalNonAcMl = soldItems.reduce((s, r) => s + (Number(r.nonAcSaleMl) || 0), 0);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Liquor Report ${date}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #E53935; padding-bottom: 12px; margin-bottom: 16px; }
  .header h1 { font-size: 20px; margin: 0; color: #1a1a1a; font-weight: 700; }
  .header .sub { font-size: 11px; color: #666; margin-top: 2px; }
  .header .date-box { text-align: right; }
  .header .date-box .lbl { font-size: 9px; text-transform: uppercase; color: #999; letter-spacing: 1px; }
  .header .date-box .val { font-size: 18px; font-weight: 700; color: #E53935; }
  .bp { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 18px; }
  .bp-card { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px 12px; }
  .bp-card .lbl { font-size: 8px; text-transform: uppercase; color: #6c757d; letter-spacing: 0.5px; font-weight: 600; }
  .bp-card .val { font-weight: 700; font-size: 14px; color: #1a1a1a; margin-top: 3px; }
  .bp-card.accent { border-left: 4px solid #E53935; }
  .bp-card.profit { border-left: 4px solid #43a047; }
  .bp-card.loss { border-left: 4px solid #e53935; }
  .summary-bar { display: flex; gap: 24px; background: #1a1a1a; color: #fff; border-radius: 8px; padding: 10px 16px; margin-bottom: 18px; font-size: 11px; }
  .summary-bar .item { display: flex; gap: 6px; align-items: center; }
  .summary-bar .item .lbl { color: #aaa; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
  .summary-bar .item .val { font-weight: 700; font-size: 13px; }
  .cat-header { background: #E53935; color: #fff; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 6px 6px 0 0; margin-top: 14px; }
  .cat-header .cat-count { font-weight: 400; font-size: 10px; opacity: 0.85; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 4px; }
  th, td { border: 1px solid #dee2e6; padding: 5px 8px; text-align: center; font-size: 10px; }
  th { background: #f1f3f5; font-weight: 600; color: #495057; text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px; }
  td.left, th.left { text-align: left; }
  td.right, th.right { text-align: right; font-variant-numeric: tabular-nums; }
  td.center, th.center { text-align: center; }
  td.bold { font-weight: 700; }
  td.neg { color: #e53935; font-weight: 600; }
  td.muted { color: #adb5bd; }
  .muted { color: #999; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #dee2e6; display: flex; justify-content: space-between; font-size: 9px; color: #999; }
  .no-sale { text-align: center; padding: 24px; color: #999; font-size: 13px; }
  @media print {
    body { padding: 12px; }
    .header { page-break-after: avoid; }
    .cat-header { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    thead { display: table-header-group; }
  }
</style></head><body>
  <div class="header">
    <div>
      <h1>Daily Liquor & Beer Report</h1>
      <div class="sub">Vgrand Lounge \u2014 Bar Inventory Summary</div>
    </div>
    <div class="date-box">
      <div class="lbl">Report Date</div>
      <div class="val">${escapeHtml(date)}</div>
    </div>
  </div>

  <div class="summary-bar">
    <div class="item"><span class="lbl">Items Sold</span><span class="val">${totalItemsSold}</span></div>
    <div class="item"><span class="lbl">AC Consumption</span><span class="val">${fmtMl(totalAcMl)} ml</span></div>
    <div class="item"><span class="lbl">Non-AC Consumption</span><span class="val">${fmtMl(totalNonAcMl)} ml</span></div>
    <div class="item"><span class="lbl">Total Revenue</span><span class="val">${fmtInr(bp.totalRevenue)}</span></div>
    <div class="item"><span class="lbl">Profit</span><span class="val">${fmtInr(bp.profit)}</span></div>
  </div>

  <div class="bp">
    <div class="bp-card accent"><div class="lbl">Opening Stock Value</div><div class="val">${fmtInr(bp.openingStockValue)}</div></div>
    <div class="bp-card"><div class="lbl">Purchases Value</div><div class="val">${fmtInr(bp.purchases)}</div></div>
    <div class="bp-card"><div class="lbl">Total Available</div><div class="val">${fmtInr(bp.totalAvailable)}</div></div>
    <div class="bp-card"><div class="lbl">Consumption Cost</div><div class="val">${fmtInr(bp.consumptionCost)}</div></div>
    <div class="bp-card accent"><div class="lbl">AC Sales</div><div class="val">${fmtInr(bp.acSales)}</div></div>
    <div class="bp-card accent"><div class="lbl">Non-AC Sales</div><div class="val">${fmtInr(bp.nonAcSales)}</div></div>
    <div class="bp-card"><div class="lbl">Closing Stock Value</div><div class="val">${fmtInr(bp.closingStockValue)}</div></div>
    <div class="bp-card ${Number(bp.profit) >= 0 ? 'profit' : 'loss'}"><div class="lbl">Net Profit</div><div class="val">${fmtInr(bp.profit)}</div></div>
  </div>

  ${soldItems.length === 0 && !manualRows ? '<div class="no-sale">No sales recorded for this date.</div>' : categorySections + manualSection}

  <div class="footer">
    <div>Generated by SoftShape POS \u2014 Bar Inventory System</div>
    <div>Report Date: ${escapeHtml(date)}</div>
  </div>
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
  const [nonAcPriceEdits, setNonAcPriceEdits] = useState({}); // { itemId: price per ml }
  const [physicalEdits, setPhysicalEdits] = useState({}); // { itemId: ml }
  const [showAllItems, setShowAllItems] = useState(false);
  // Manual PDF-only rows
  const [manualItems, setManualItems] = useState([]);

  useEffect(() => {
    if (open) {
      setReportDate(date || getKolkataDateString());
      setNonAcEdits({});
      setNonAcPriceEdits({});
      setPhysicalEdits({});
      setShowAllItems(false);
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
      setNonAcPriceEdits({});
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
    || Object.keys(nonAcPriceEdits).length > 0
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

  const handleNonAcPriceEdit = (itemId, value) => {
    setNonAcPriceEdits((prev) => {
      const next = { ...prev };
      const item = items.find((i) => i.id === itemId);
      const current = Number(item?.sellingPricePerMl) || 0;
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
      // 1. Non-AC prices are manual and independent of AC POS prices.
      for (const [itemId, pricePerMl] of Object.entries(nonAcPriceEdits)) {
        if (!(Number(pricePerMl) >= 0)) continue;
        await updateInventoryItem(itemId, {
          sellingPricePerMl: Number(pricePerMl),
          date: reportDate,
        });
      }
      // 2. Non-AC sale edits → NON_AC_SALE / CORRECTION movements
      //    Per-item requestId keeps retries/double-saves from double-applying.
      for (const [itemId, ml] of Object.entries(nonAcEdits)) {
        if (!(Number(ml) >= 0)) continue;
        const key = `bar-nonac:${itemId}:${reportDate}:${ml}`;
        await recordNonAcSale({ itemId, date: reportDate, quantityMl: Number(ml), requestId: getOrCreateRequestId(key) });
        clearRequestId(key);
      }
      // 3. Physical closing edits → physical-count endpoint
      for (const [itemId, ml] of Object.entries(physicalEdits)) {
        if (!(Number(ml) >= 0)) continue;
        const key = `bar-physical:${itemId}:${reportDate}:${ml}`;
        await setItemStock(itemId, Number(ml), { date: reportDate, notes: 'Physical count (report edit)', requestId: getOrCreateRequestId(key) });
        clearRequestId(key);
      }
      // 3. Manual PDF-only rows
      await saveManualReportItems({ date: reportDate, items: manualItems });

      // Refetch — the backend already ran sequential rebuilds
      const json = await fetchLiquorDailyReport(reportDate);
      setData(json);
      setManualItems((json.manualItems || []).map((m) => ({ ...m })));
      setNonAcEdits({});
      setNonAcPriceEdits({});
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

  const activityItems = items.filter((r) =>
    (Number(r.acSaleMl) || 0) > 0
    || (Number(r.nonAcSaleMl) || 0) > 0
    || (Number(r.purchasedMl) || 0) > 0
    || (Number(r.wastageMl) || 0) > 0,
  );
  const visibleItems = showAllItems ? items : activityItems;

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
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  {showAllItems ? `Showing all ${items.length} brands for Non-AC entry` : `Showing ${activityItems.length} brands with activity on this date`}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllItems((value) => !value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  {showAllItems ? 'Show activity only' : 'Show all brands'}
                </button>
              </div>
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
                      <th className="px-2 py-2 text-right">Non-AC Price (₹/ml)</th>
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
                      const nonAcPriceVal = nonAcPriceEdits[r.id] !== undefined ? nonAcPriceEdits[r.id] : (r.sellingPricePerMl ?? '');
                      const physVal = physicalEdits[r.id] !== undefined ? physicalEdits[r.id] : (r.physicalClosingMl ?? '');
                      const edited = nonAcEdits[r.id] !== undefined || nonAcPriceEdits[r.id] !== undefined || physicalEdits[r.id] !== undefined;
                      return (
                        <tr key={r.id} className={r.isHiddenFromReport ? 'opacity-40' : ''}>
                          <td className="px-2 py-1.5 text-gray-400">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium text-gray-900">{r.name}</div>
                            <div className="text-gray-400">{r.brand} · {r.bottleSizeMl}ml</div>
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmtRowMl(r, r.openingMl)}</td>
                          <td className="px-2 py-1.5 text-right text-green-700">{fmtRowMl(r, r.purchasedMl)}</td>
                          <td className="px-2 py-1.5 text-right">{fmtRowMl(r, r.acSaleMl)}</td>
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
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={nonAcPriceVal ?? ''}
                              onChange={(e) => handleNonAcPriceEdit(r.id, e.target.value)}
                              placeholder="₹/ml"
                              className={`w-20 px-1.5 py-1 text-right rounded border text-xs ${nonAcPriceEdits[r.id] !== undefined ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right text-orange-600">{fmtRowMl(r, r.wastageMl)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{fmtRowMl(r, r.systemClosingMl)}</td>
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
                            {r.varianceMl != null ? fmtRowMl(r, r.varianceMl) : '—'}
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
