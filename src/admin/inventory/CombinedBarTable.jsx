// ─────────────────────────────────────────────────────────────────────────────
// CombinedBarTable — Bar inventory table (STOCK → PURCHASE → SALE → CONSUMPTION → PROFIT)
// ─────────────────────────────────────────────────────────────────────────────
// Columns:
//   S.No | Item | Purchase Rate | Opening Stock | Purchases | Total Stock |
//   AC Sale | Non-AC Sale | Closing Stock | Closing Value
//
// Opening Stock  = single physical opening stock (bottles) — NOT AC+Non-AC summed
// Purchases      = single physical purchases (bottles) — NOT summed
// Total Stock    = Opening Stock + Purchases
// AC Sale        = POS liquor sales (bottles) — from Vgrand Lounge POS only
// Non-AC Sale    = Admin-entered Non-AC sales (bottles) — NOT from POS
// Closing Stock  = Total Stock − AC Sale − Non-AC Sale (EDITABLE by Admin)
// Closing Value  = Closing Stock × Purchase Rate
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { updateInventoryItem, adjustStock, updateNonAcEntry, saveItemWiseEdits, setItemStock } from '../../services/barInventoryApi';

function fmtQty(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  const v = Number(n);
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// Normalize an item name to its base product name (without size suffixes).
function normalizeProductBaseName(name) {
  if (!name) return '';
  return String(name).toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*\d+\s*(?:ml|l(?:tr|itre|iter)?|l)\b/gi, ' ')
    .replace(/\s*(full\s+bottle|bottle|tin|can)\s*/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Group bar inventory items by normalized base name and aggregate per-bottle-size stock.
function groupByBrand(items) {
  const groups = new Map();
  for (const item of items) {
    const name = item.itemName || '';
    const base = normalizeProductBaseName(name);
    if (!base) continue;
    // Skip peg items (30/60/90ml) — they're not bottle-size stock items
    const mlMatch = name.match(/(\d+)\s*ml/i);
    if (mlMatch && [30, 60, 90].includes(parseInt(mlMatch[1], 10))) continue;
    if (!groups.has(base)) {
      groups.set(base, { brand: base, displayName: name, sizes: {}, totalStock: 0, totalBottles: 0 });
    }
    const g = groups.get(base);
    const bottleSize = Number(item.bottleSize) || 0;
    const closingBtl = Number(item.acClosingBottles) || (bottleSize > 0 ? (Number(item.acClosing) || 0) / bottleSize : 0);
    const closingMl = bottleSize > 0 ? closingBtl * bottleSize : 0;
    const sizeKey = `${bottleSize}ml`;
    // Use acItemId (real inventory item ID) for stock editing
    const itemId = item.acItemId || item.id;
    if (!g.sizes[sizeKey]) {
      g.sizes[sizeKey] = { bottleSize, stockMl: 0, bottles: 0, itemId };
    }
    g.sizes[sizeKey].stockMl += closingMl;
    g.sizes[sizeKey].bottles += closingBtl;
    g.totalStock += closingMl;
    g.totalBottles += closingBtl;
    // Use the shortest non-peg name as display name
    if (name.length < g.displayName.length || /\b(30|60|90)\s*ml/i.test(g.displayName)) {
      g.displayName = name;
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.brand.localeCompare(b.brand));
}

export function CombinedBarTable({ items, search, onNonAcDeduct, onEdit, onView, onRefresh, date }) {
  const [showNonAcOnly, setShowNonAcOnly] = useState(false);
  const [editingClosing, setEditingClosing] = useState(null); // item.id being edited
  const [closingInput, setClosingInput] = useState('');
  const [saving, setSaving] = useState(false);
  // Grouped-by-brand view state
  const [groupByBrandMode, setGroupByBrandMode] = useState(false);
  const [expandedBrand, setExpandedBrand] = useState(null);
  const [editingStock, setEditingStock] = useState({}); // { [itemId]: bottleCount }
  const [savingStock, setSavingStock] = useState(null); // itemId being saved

  // Handle save of edited stock for a specific size
  async function handleSaveStock(itemId, bottleSize) {
    const bottleCount = editingStock[itemId];
    if (bottleCount === undefined || bottleSize <= 0) return;
    const stockMl = Math.round(Number(bottleCount) * bottleSize);
    setSavingStock(itemId);
    try {
      await setItemStock(itemId, stockMl, `Per-size edit: ${bottleSize}ml × ${bottleCount} btl`);
      setEditingStock(prev => { const next = { ...prev }; delete next[itemId]; return next; });
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Failed to save stock:', e);
      alert('Failed to save stock. Please try again.');
    } finally {
      setSavingStock(null);
    }
  }

  // Apply search filter (case-insensitive, partial match on item name)
  const searchFiltered = search?.trim()
    ? items.filter(i => (i.itemName || '').toLowerCase().includes(search.trim().toLowerCase()))
    : items;
  const filtered = showNonAcOnly ? searchFiltered.filter(i => i.hasNonAc) : searchFiltered;

  const handleStartEdit = (item) => {
    const btlSize = Number(item.bottleSize) || 0;
    // Closing = Opening + Purchases - AC Sale - Non-AC Sale (single physical stock)
    const openingBtl = Number(item.openingStockBottles) || 0;
    const purchasesBtl = Number(item.purchasesBottles) || 0;
    const acSaleBtl = Number(item.acSaleBottles) || (btlSize > 0 ? (Number(item.acSale) || 0) / btlSize : 0);
    const nonAcSaleBtl = Number(item.nonAcDeduction) || 0;
    const currentClosing = openingBtl + purchasesBtl - acSaleBtl - nonAcSaleBtl;
    setEditingClosing(item.id);
    setClosingInput(String(currentClosing.toFixed(2)));
  };

  const handleSaveClosing = async (item) => {
    const newClosingBtl = Number(closingInput) || 0;
    const btlSize = Number(item.bottleSize) || 0;
    // Use single physical stock values
    const openingBtl = Number(item.openingStockBottles) || 0;
    const purchasesBtl = Number(item.purchasesBottles) || 0;
    const totalStockBtl = openingBtl + purchasesBtl;
    const acSaleBtl = Number(item.acSaleBottles) || (btlSize > 0 ? (Number(item.acSale) || 0) / btlSize : 0);
    const nonAcSaleBtl = Number(item.nonAcDeduction) || 0;
    const currentClosingBtl = totalStockBtl - acSaleBtl - nonAcSaleBtl;
    if (Math.abs(newClosingBtl - currentClosingBtl) < 0.01) {
      setEditingClosing(null);
      return;
    }
    setSaving(true);
    try {
      // Calculate new total sold = Total Stock - New Closing
      // This ensures both snapshot.sold and snapshot.closing are updated,
      // so the PDF preview (which calculates closing = totalStock - sold)
      // shows the same value as the Inventory page.
      const newTotalSoldBtl = Math.max(0, Math.round((totalStockBtl - newClosingBtl) * 100) / 100);

      if (item.hasNonAc && item.nonAcItemId) {
        // Non-AC item: calculate new Non-AC deduction = Total Sold - AC Sale
        // (AC sale stays the same, Non-AC deduction absorbs the difference)
        const newNonAcSold = Math.max(0, Math.round((newTotalSoldBtl - acSaleBtl) * 100) / 100);
        const nonAcOpening = Number(item.openingStockBottles) || 0;
        const nonAcReceived = Number(item.purchasesBottles) || 0;
        await updateNonAcEntry({
          itemId: item.nonAcItemId,
          date,
          openingBottles: nonAcOpening,
          saleBottles: newNonAcSold,
          closingBottles: newClosingBtl,
          receivedBottles: nonAcReceived,
          reason: 'Admin closing stock edit',
        });
        // Also sync AC snapshot if this item has both AC + Non-AC
        if (item.hasAc && item.acItemId) {
          await saveItemWiseEdits({
            date,
            acAdjustments: [{
              itemId: item.acItemId,
              adjustedSaleBtl: acSaleBtl,
              adjustedClosingBtl: newClosingBtl,
            }],
          });
        }
      } else if (item.hasAc && item.acItemId) {
        // AC item only: use the same item-wise endpoint as PDF preview
        // This updates both sold and closing in the snapshot, ensuring sync
        await saveItemWiseEdits({
          date,
          acAdjustments: [{
            itemId: item.acItemId,
            adjustedSaleBtl: newTotalSoldBtl,
            adjustedClosingBtl: newClosingBtl,
          }],
        });
      }
      setEditingClosing(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      alert('Failed to save closing stock: ' + (e.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100">
        <button
          onClick={() => setShowNonAcOnly(false)}
          className={`px-3 py-1 rounded-lg text-xs font-medium ${!showNonAcOnly ? 'bg-[#E53935] text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          All Items
        </button>
        <button
          onClick={() => setShowNonAcOnly(true)}
          className={`px-3 py-1 rounded-lg text-xs font-medium ${showNonAcOnly ? 'bg-[#E53935] text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Non-AC Only
        </button>
        <button
          onClick={() => setGroupByBrandMode(!groupByBrandMode)}
          className={`px-3 py-1 rounded-lg text-xs font-medium ${groupByBrandMode ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Group by Brand
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> AC (POS)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Non-AC (Admin)</span>
        </div>
      </div>

      {/* ── Grouped by Brand view (expandable rows with per-size editing) ── */}
      {groupByBrandMode ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-purple-50 text-gray-600 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Brand</th>
                {[750, 375, 180].map(s => <th key={s} className="text-right px-4 py-3 font-semibold">{s}ml (btl / ml)</th>)}
                <th className="text-right px-4 py-3 font-semibold">Other (btl / ml)</th>
                <th className="text-right px-4 py-3 font-semibold">Total (btl / ml)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(() => {
                const grouped = groupByBrand(items);
                const SIZES = [750, 375, 180];
                if (grouped.length === 0) {
                  return <tr><td colSpan={SIZES.length + 3} className="text-center py-12 text-gray-400">No items found</td></tr>;
                }
                return grouped.flatMap((g) => {
                  const isExpanded = expandedBrand === g.brand;
                  const rows = [
                    <tr
                      key={g.brand}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedBrand(isExpanded ? null : g.brand)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span className="inline-flex items-center gap-2">
                          <span className={`text-gray-400 transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                          {g.displayName}
                        </span>
                      </td>
                      {SIZES.map(s => {
                        const sz = g.sizes[`${s}ml`];
                        return (
                          <td key={s} className="px-4 py-3 text-right text-gray-600">
                            {sz ? (
                              <>
                                {sz.bottles.toFixed(2)}
                                <span className="text-xs text-gray-400 ml-1">({sz.stockMl.toFixed(0)} ml)</span>
                              </>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {Object.entries(g.sizes).filter(([k]) => !SIZES.includes(parseInt(k))).map(([k, v]) => (
                          <div key={k}>{k}: {v.bottles.toFixed(2)} ({v.stockMl.toFixed(0)} ml)</div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-700">
                        {g.totalBottles.toFixed(2)}
                        <span className="text-xs text-gray-400 ml-1">({g.totalStock.toFixed(0)} ml)</span>
                      </td>
                    </tr>,
                  ];
                  if (isExpanded) {
                    rows.push(
                      <tr key={`${g.brand}-expanded`} className="bg-amber-50">
                        <td colSpan={SIZES.length + 3} className="px-4 py-4">
                          <div className="flex flex-wrap gap-6 items-end">
                            {SIZES.map(s => {
                              const sz = g.sizes[`${s}ml`];
                              const itemId = sz?.itemId;
                              const isEditing = itemId && editingStock[itemId] !== undefined;
                              const isSaving = savingStock === itemId;
                              const currentBottles = sz ? sz.bottles.toFixed(2) : '0.00';
                              const editValue = isEditing ? editingStock[itemId] : currentBottles;
                              return (
                                <div key={s} className="flex flex-col gap-1">
                                  <label className="text-xs font-bold text-gray-600 uppercase">{s}ml Stock (bottles)</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                      value={editValue}
                                      onChange={(e) => setEditingStock(prev => ({ ...prev, [itemId]: e.target.value }))}
                                      placeholder={currentBottles}
                                      disabled={!itemId || isSaving}
                                    />
                                    <span className="text-xs text-gray-400">
                                      {sz ? `= ${Math.round(Number(editValue || 0) * s)} ml` : 'no item'}
                                    </span>
                                    {itemId && isEditing && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleSaveStock(itemId, s); }}
                                        disabled={isSaving}
                                        className="px-2 py-1 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                                      >
                                        {isSaving ? 'Saving...' : 'Save'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            <div className="text-xs text-gray-500 ml-auto">
                              Total: {g.totalBottles.toFixed(2)} btl ({g.totalStock.toFixed(0)} ml)
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                });
              })()}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <th className="text-center px-2 py-3 font-semibold w-10">S.No</th>
              <th className="text-left px-3 py-3 font-semibold">Item</th>
              <th className="text-right px-3 py-3 font-semibold">Purchase Rate</th>
              <th className="text-right px-3 py-3 font-semibold">Opening Stock</th>
              <th className="text-right px-3 py-3 font-semibold">Opening Value</th>
              <th className="text-right px-3 py-3 font-semibold">Purchases</th>
              <th className="text-right px-3 py-3 font-semibold">Total Stock</th>
              <th className="text-right px-3 py-3 font-semibold text-blue-600">AC Sale</th>
              <th className="text-right px-3 py-3 font-semibold text-orange-600">Non-AC Sale</th>
              <th className="text-right px-3 py-3 font-semibold">Closing Stock</th>
              <th className="text-right px-3 py-3 font-semibold">Closing Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-400">No items found</td>
              </tr>
            ) : (
              filtered.map((item, idx) => {
                const btlSize = Number(item.bottleSize) || 0;
                const purchaseRate = Number(item.purchaseRate) || 0;
                // SINGLE physical opening stock — NOT summed AC + Non-AC.
                // AC and Non-AC share the same physical inventory.
                const openingBtl = Number(item.openingStockBottles) || 0;
                // SINGLE purchases value — NOT summed
                const purchasesBtl = Number(item.purchasesBottles) || 0;
                // Total Stock = Opening + Purchases
                const totalStockBtl = openingBtl + purchasesBtl;
                // AC Sale = POS liquor sales (bottles) — separate sales channel
                const acSaleBtl = Number(item.acSaleBottles) || (btlSize > 0 ? (Number(item.acSale) || 0) / btlSize : 0);
                // Non-AC Sale = Admin-entered (bottles) — separate sales channel
                const nonAcSaleBtl = Number(item.nonAcDeduction) || 0;
                // Closing Stock = Total Stock − AC Sale − Non-AC Sale
                const closingBtl = totalStockBtl - acSaleBtl - nonAcSaleBtl;
                // Closing Value = Closing Stock × Purchase Rate
                const closingValue = closingBtl * purchaseRate;
                // Opening Stock Value = Opening Stock (bottles) × Purchase Rate
                const openingValue = openingBtl * purchaseRate;
                const isEditing = editingClosing === item.id;

                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    {/* S.No */}
                    <td className="px-2 py-2 text-center text-gray-500 text-xs">{idx + 1}</td>
                    {/* Item */}
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {item.itemName}
                      {item.needsConfirmation && (
                        <span className="ml-1 text-[10px] text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded-full" title={item.notes}>
                          ⚠ Confirm
                        </span>
                      )}
                    </td>
                    {/* Purchase Rate */}
                    <td className="px-3 py-2 text-right text-gray-600 text-xs">
                      {purchaseRate > 0 ? fmtInr(purchaseRate) : '—'}
                    </td>
                    {/* Opening Stock */}
                    <td className="px-3 py-2 text-right text-gray-700 text-xs">
                      {fmtQty(openingBtl)}
                      <span className="text-[10px] text-gray-400 ml-1">btl</span>
                    </td>
                    {/* Opening Value */}
                    <td className="px-3 py-2 text-right text-gray-600 text-xs">
                      {openingValue > 0 ? fmtInr(openingValue) : '—'}
                    </td>
                    {/* Purchases */}
                    <td className="px-3 py-2 text-right text-gray-700 text-xs">
                      {fmtQty(purchasesBtl)}
                      <span className="text-[10px] text-gray-400 ml-1">btl</span>
                    </td>
                    {/* Total Stock */}
                    <td className="px-3 py-2 text-right text-gray-700 font-medium text-xs">
                      {fmtQty(totalStockBtl)}
                      <span className="text-[10px] text-gray-400 ml-1">btl</span>
                    </td>
                    {/* AC Sale (POS) */}
                    <td className="px-3 py-2 text-right text-blue-700 text-xs">
                      {item.hasAc && acSaleBtl > 0 ? (
                        <span>
                          {fmtQty(acSaleBtl)}
                          <span className="text-[10px] text-gray-400 ml-1">btl</span>
                        </span>
                      ) : '—'}
                    </td>
                    {/* Non-AC Sale (Admin) */}
                    <td className="px-3 py-2 text-right text-orange-700 text-xs">
                      {item.hasNonAc && nonAcSaleBtl > 0 ? (
                        <span>
                          {fmtQty(nonAcSaleBtl)}
                          <span className="text-[10px] text-gray-400 ml-1">btl</span>
                        </span>
                      ) : '—'}
                    </td>
                    {/* Closing Stock — EDITABLE */}
                    <td className="px-3 py-2 text-right font-medium text-xs">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={closingInput}
                            onChange={(e) => setClosingInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveClosing(item);
                              if (e.key === 'Escape') setEditingClosing(null);
                            }}
                            className="w-20 text-right text-xs px-1 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            autoFocus
                            disabled={saving}
                          />
                          <button
                            onClick={() => handleSaveClosing(item)}
                            disabled={saving}
                            className="text-green-600 hover:bg-green-50 p-0.5 rounded"
                            title="Save"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setEditingClosing(null)}
                            disabled={saving}
                            className="text-gray-400 hover:bg-gray-100 p-0.5 rounded"
                            title="Cancel"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="text-gray-900 hover:text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors"
                          title="Click to edit closing stock"
                        >
                          {fmtQty(closingBtl)}
                          <span className="text-[10px] text-gray-400 ml-1">btl</span>
                          <svg className="w-3 h-3 inline ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </td>
                    {/* Closing Value */}
                    <td className="px-3 py-2 text-right text-gray-700 font-medium text-xs">
                      {fmtInr(closingValue)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
