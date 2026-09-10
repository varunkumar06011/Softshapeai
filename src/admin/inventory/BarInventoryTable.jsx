// ─────────────────────────────────────────────────────────────────────────────
// BarInventoryTable — Bar inventory table (single stock pool, one row per bottle SKU)
// ─────────────────────────────────────────────────────────────────────────────
// Replaces CombinedBarTable. Reads rows already shaped by the backend
// (GET /api/bar/inventory/items) — all values come from BarDailyRecord.
//
// Columns:
//   S.No | Item | Brand | Category | Bottle Size | Opening | Purchases |
//   Total Stock | AC Sold | Non-AC Sold | Closing | Closing Value | Low Stock | Actions
//
// Features:
//   - Group-by-Brand toggle (collapses per-size rows into brand rows)
//   - Inline closing edit → physical count (PUT /physical-count)
//   - All Items / Non-AC Only filter
//   - Edit button opens EditItemModal (always reachable)
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { setItemStock, getOrCreateRequestId, clearRequestId } from '../../services/barInventoryApi';
import { isBeerItem as isBeerRow } from './inventoryConstants';

function fmtQty(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  const v = Number(n);
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// Beers are never poured — display whole-bottle counts only.
function fmtMlAsBottles(ml, bottleSizeMl, isBeer = false) {
  const totalMl = Number(ml) || 0;
  const size = Number(bottleSizeMl) || 0;
  if (size <= 0) return `${fmtQty(totalMl)} ml`;
  if (isBeer) return `${fmtQty(Math.trunc(totalMl / size))} btl`;
  const bottles = totalMl / size;
  return `${fmtQty(Math.round(bottles * 100) / 100)} btl`;
}

// Group key: brand (or name) with size words stripped + case normalized, so
// "100 PIPERS", "100 Pipers 750ml" etc. collapse into one brand group.
function brandKey(item) {
  const base = String(item?.brand || item?.name || 'other')
    .toLowerCase()
    .replace(/\s*\d+\s*(?:ml|l(?:tr|itre|iter)?|l)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base || 'other';
}

export function BarInventoryTable({ items, search, onNonAcDeduct, onEdit, onView, onRefresh, date, onDelete, onEditStock }) {
  const [showNonAcOnly, setShowNonAcOnly] = useState(false);
  const [groupByBrandMode, setGroupByBrandMode] = useState(false);
  const [expandedBrands, setExpandedBrands] = useState(new Set());
  const [editingClosing, setEditingClosing] = useState(null); // item.id being edited
  const [closingInput, setClosingInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ── Filtering ────────────────────────────────────────────────────────────
  const searchFiltered = useMemo(() => {
    if (!search?.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.brand || '').toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const filtered = useMemo(
    () => (showNonAcOnly ? searchFiltered.filter((i) => Number(i.nonAcSaleMl) > 0) : searchFiltered),
    [searchFiltered, showNonAcOnly],
  );

  // ── Group by brand ───────────────────────────────────────────────────────
  const brandGroups = useMemo(() => {
    if (!groupByBrandMode) return null;
    const groups = new Map();
    for (const item of filtered) {
      const key = brandKey(item);
      if (!groups.has(key)) {
        groups.set(key, { brand: item.brand || item.name || 'Other', category: item.category, items: [], sizeCounts: new Map(), totals: { opening: 0, purchased: 0, acSale: 0, nonAcSale: 0, wastage: 0, closing: 0, closingValue: 0 } });
      }
      const g = groups.get(key);
      g.items.push(item);
      const size = Number(item.bottleSizeMl) || 0;
      g.sizeCounts.set(size, (g.sizeCounts.get(size) || 0) + (Number(item.systemClosingMl) || 0));
      g.totals.opening += Number(item.openingMl) || 0;
      g.totals.purchased += Number(item.purchasedMl) || 0;
      g.totals.acSale += Number(item.acSaleMl) || 0;
      g.totals.nonAcSale += Number(item.nonAcSaleMl) || 0;
      g.totals.wastage += Number(item.wastageMl) || 0;
      g.totals.closing += Number(item.systemClosingMl) || 0;
      g.totals.closingValue += Number(item.stockValue) || 0;
    }
    return Array.from(groups.values()).sort((a, b) => a.brand.localeCompare(b.brand));
  }, [filtered, groupByBrandMode]);

  const toggleBrand = (brand) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

  // ── Inline closing edit → physical count ─────────────────────────────────
  const handleStartEdit = (item) => {
    setEditingClosing(item.id);
    const currentBtl = item.bottleSizeMl > 0 ? Number(item.systemClosingMl) / item.bottleSizeMl : Number(item.systemClosingMl);
    setClosingInput(String((Math.round(currentBtl * 100) / 100)));
  };

  const handleSaveClosing = async (item) => {
    const newBottles = Number(closingInput);
    if (Number.isNaN(newBottles) || newBottles < 0) {
      alert('Enter a valid bottle count');
      return;
    }
    const physicalMl = Math.round(newBottles * item.bottleSizeMl);
    setSaving(true);
    try {
      const key = `bar-physical:${item.id}:${date || 'today'}:${physicalMl}`;
      await setItemStock(item.id, physicalMl, { date, notes: 'Physical count (inline edit)', requestId: getOrCreateRequestId(key) });
      clearRequestId(key);
      setEditingClosing(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      alert('Failed to save physical count: ' + (e.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    setDeleting(true);
    try {
      await onDelete(item);
      setDeleteConfirm(null);
    } catch (e) {
      alert('Failed to delete item: ' + (e.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  // ── Row renderer ─────────────────────────────────────────────────────────
  const renderRow = (item, sno, indent = false) => {
    const isEditing = editingClosing === item.id;
    const beer = isBeerRow(item);
    return (
      <tr key={item.id} className={`border-b border-gray-100 hover:bg-gray-50 ${indent ? 'bg-gray-50/50' : ''}`}>
        <td className="px-3 py-2 text-sm text-gray-500">{sno}</td>
        <td className={`px-3 py-2 text-sm font-medium text-gray-800 ${indent ? 'pl-8' : ''}`}>
          {item.name}
        </td>
        <td className="px-3 py-2 text-sm text-gray-600">{item.brand}</td>
        <td className="px-3 py-2 text-sm text-gray-600">{item.category}</td>
        <td className="px-3 py-2 text-sm text-gray-600">{item.bottleSizeMl}ml</td>
        <td className="px-3 py-2 text-sm text-right text-gray-700">{fmtMlAsBottles(item.openingMl, item.bottleSizeMl, beer)}</td>
        <td className="px-3 py-2 text-sm text-right text-green-700">{fmtMlAsBottles(item.purchasedMl, item.bottleSizeMl, beer)}</td>
        <td className="px-3 py-2 text-sm text-right text-gray-700">{fmtMlAsBottles(item.totalStockMl, item.bottleSizeMl, beer)}</td>
        <td className="px-3 py-2 text-sm text-right text-blue-700">{fmtMlAsBottles(item.acSaleMl, item.bottleSizeMl, beer)}</td>
        <td className="px-3 py-2 text-sm text-right text-purple-700">{fmtMlAsBottles(item.nonAcSaleMl, item.bottleSizeMl, beer)}</td>
        <td className="px-3 py-2 text-sm text-right font-semibold text-gray-800">
          {isEditing ? (
            <div className="flex items-center gap-1 justify-end">
              <input
                type="number"
                step="0.01"
                min="0"
                value={closingInput}
                onChange={(e) => setClosingInput(e.target.value)}
                className="w-20 px-1.5 py-0.5 text-sm border border-gray-300 rounded text-right"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveClosing(item);
                  if (e.key === 'Escape') setEditingClosing(null);
                }}
              />
              <button
                onClick={() => handleSaveClosing(item)}
                disabled={saving}
                className="px-1.5 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >✓</button>
              <button
                onClick={() => setEditingClosing(null)}
                className="px-1.5 py-0.5 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => handleStartEdit(item)}
              className="hover:underline"
              title="Click to enter physical count"
            >
              {fmtMlAsBottles(item.systemClosingMl, item.bottleSizeMl, beer)}
              {item.varianceMl != null && Number(item.varianceMl) !== 0 && (
                <span className={`ml-1 text-xs ${Number(item.varianceMl) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ({Number(item.varianceMl) > 0 ? '+' : ''}{fmtMlAsBottles(item.varianceMl, item.bottleSizeMl, beer)})
                </span>
              )}
            </button>
          )}
        </td>
        <td className="px-3 py-2 text-sm text-right text-gray-700">{fmtInr(item.stockValue)}</td>
        <td className="px-3 py-2 text-center">
          {item.isLowStock ? (
            <span className="inline-block px-1.5 py-0.5 text-xs font-bold text-red-700 bg-red-100 rounded">LOW</span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-sm text-right whitespace-nowrap">
          <button onClick={() => onView?.(item)} className="px-1.5 py-0.5 text-xs text-blue-600 hover:underline" title="Details">View</button>
          <button onClick={() => onEdit?.(item)} className="px-1.5 py-0.5 text-xs text-indigo-600 hover:underline" title="Edit item">Edit</button>
          {onNonAcDeduct && (
            <button onClick={() => onNonAcDeduct(item)} className="px-1.5 py-0.5 text-xs text-purple-600 hover:underline" title="Non-AC sale">Non-AC</button>
          )}
          {onEditStock && (
            <button onClick={() => onEditStock(item)} className="px-1.5 py-0.5 text-xs text-amber-600 hover:underline" title="Edit total stock">Stock</button>
          )}
          {onDelete && (
            <button onClick={() => setDeleteConfirm(item)} className="px-1.5 py-0.5 text-xs text-red-600 hover:underline" title="Delete item">Del</button>
          )}
        </td>
      </tr>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────
  let sno = 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={groupByBrandMode}
            onChange={(e) => setGroupByBrandMode(e.target.checked)}
            className="rounded border-gray-300"
          />
          Group by Brand
        </label>
        <button
          onClick={() => setShowNonAcOnly(!showNonAcOnly)}
          className={`px-2.5 py-1 text-xs font-medium rounded ${showNonAcOnly ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {showNonAcOnly ? 'Non-AC Only' : 'All Items'}
        </button>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500">#</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500">Item</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500">Brand</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500">Category</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500">Size</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Opening</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Purchases</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Total Stock</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">AC Sold</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Non-AC</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Closing</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Value</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-center">Low</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No bar inventory items found. Add an item to get started.
                </td>
              </tr>
            ) : groupByBrandMode && brandGroups ? (
              brandGroups.map((g) => {
                const expanded = expandedBrands.has(g.brand);
                return (
                  <FragmentGroup
                    key={g.brand}
                    group={g}
                    expanded={expanded}
                    onToggle={() => toggleBrand(g.brand)}
                    renderRow={renderRow}
                    snoRef={{ value: sno, increment: () => ++sno }}
                  />
                );
              })
            ) : (
              filtered.map((item) => renderRow(item, ++sno))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-2">Delete Item?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Deactivate <strong>{deleteConfirm.name}</strong>? Its history is preserved; menu links are removed.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="px-4 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Brand group row with expandable per-size detail rows
function FragmentGroup({ group, expanded, onToggle, renderRow, snoRef }) {
  const t = group.totals;
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer"
      >
        <td className="px-3 py-2 text-sm text-gray-500">{expanded ? '▾' : '▸'}</td>
        <td className="px-3 py-2 text-sm font-bold text-gray-800" colSpan={2}>{group.brand}</td>
        <td className="px-3 py-2 text-sm text-gray-600">{group.category}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1" title={`${group.items.length} size${group.items.length !== 1 ? 's' : ''}`}>
            {[...group.sizeCounts.entries()].sort((a, b) => a[0] - b[0]).map(([size, ml]) => (
              <span key={size} className="px-1 py-0.5 text-xs bg-gray-100 text-gray-700 rounded whitespace-nowrap">
                {size}ml: {fmtQty(Math.trunc(ml / size))} btl
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-2 text-sm text-right text-gray-500">{fmtQty(t.opening)} ml</td>
        <td className="px-3 py-2 text-sm text-right text-green-700">{fmtQty(t.purchased)} ml</td>
        <td className="px-3 py-2 text-sm text-right text-gray-500">{fmtQty(t.opening + t.purchased)} ml</td>
        <td className="px-3 py-2 text-sm text-right text-blue-700">{fmtQty(t.acSale)} ml</td>
        <td className="px-3 py-2 text-sm text-right text-purple-700">{fmtQty(t.nonAcSale)} ml</td>
        <td className="px-3 py-2 text-sm text-right font-semibold text-gray-800">{fmtQty(t.closing)} ml</td>
        <td className="px-3 py-2 text-sm text-right text-gray-700">{fmtInr(t.closingValue)}</td>
        <td colSpan={2}></td>
      </tr>
      {expanded && group.items.map((item) => {
        snoRef.increment();
        return renderRow(item, snoRef.value, true);
      })}
    </>
  );
}
