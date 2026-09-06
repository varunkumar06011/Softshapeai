// ─────────────────────────────────────────────────────────────────────────────
// EditItemModal — edit item metadata (master fields only, no stock movements)
// ─────────────────────────────────────────────────────────────────────────────
// Two modes:
//   1. Bar edit (tab='bar'): name, brand, category, bottle size, reorder,
//      purchase rate, selling price per ml, hide-from-report
//      → persists to bar_inventory_items via updateInventoryItem
//      Stock changes use Stock Adjustment / Physical Count (append-only ledger).
//   2. Kitchen edit (tab='kitchen'): name, category, unit, rate, low-stock
//      → persists to kitchen items via updateKitchenItem
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { updateInventoryItem } from '../../services/barInventoryApi';
import { updateKitchenItem } from '../../services/kitchenInventoryApi';

export function EditItemModal({ open, item, tab, date, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Bar master fields (new single-pool model — no stock movement here)
  const [displayName, setDisplayName] = useState('');
  const [brand, setBrand] = useState('');
  const [barCategory, setBarCategory] = useState('');
  const [bottleSize, setBottleSize] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [sellingPricePerMl, setSellingPricePerMl] = useState('');
  const [isHiddenFromReport, setIsHiddenFromReport] = useState(false);

  // Kitchen fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('gm');
  const [rate, setRate] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');

  useEffect(() => {
    if (item && open) {
      if (tab === 'bar') {
        setDisplayName(item.name || '');
        setBrand(item.brand || '');
        setBarCategory(item.category || '');
        setBottleSize(item.bottleSizeMl != null ? String(item.bottleSizeMl) : '');
        setReorderLevel(item.reorderLevelBottles != null ? String(item.reorderLevelBottles) : '');
        setPurchaseRate(item.purchaseRate != null ? String(item.purchaseRate) : '');
        setSellingPricePerMl(item.sellingPricePerMl != null ? String(item.sellingPricePerMl) : '');
        setIsHiddenFromReport(item.isHiddenFromReport === true);
      } else {
        setName(item.name || '');
        setCategory(item.category || '');
        setUnit(item.unit || 'gm');
        setRate(item.price != null ? String(item.price) : '');
        setLowStockThreshold(item.reorderLevel != null ? String(item.reorderLevel) : '');
      }
      setError(null);
    }
  }, [item, open, tab]);

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      if (tab === 'bar') {
        if (!displayName.trim()) {
          setError('Display name is required');
          setSaving(false);
          return;
        }
        await updateInventoryItem(item.id, {
          name: displayName.trim(),
          brand: brand.trim() || displayName.trim(),
          category: barCategory.trim() || 'Liquor',
          bottleSizeMl: bottleSize !== '' ? Number(bottleSize) : undefined,
          reorderLevelBottles: reorderLevel === '' ? 0 : Number(reorderLevel),
          purchaseRate: purchaseRate !== '' ? Number(purchaseRate) : null,
          sellingPricePerMl: sellingPricePerMl !== '' ? Number(sellingPricePerMl) : null,
          isHiddenFromReport,
        });
      } else {
        await updateKitchenItem(item.id, {
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim(),
          price: rate !== '' ? Number(rate) : 0,
          reorderLevel: lowStockThreshold === '' ? 0 : Number(lowStockThreshold),
        });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update item');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {tab === 'bar' ? 'Edit Bar Item' : 'Edit Kitchen Item'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>
          )}

          {tab === 'bar' ? (
            <>
              {/* Bar item master edit — updates BarInventoryItem only (no stock movement).
                  To change stock, use Stock Adjustment or the inline closing edit. */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Current Stock</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">
                  {Number(item.currentStockMl || item.systemClosingMl || 0).toFixed(2)}
                  <span className="text-sm font-normal text-gray-500 ml-1">ml</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Stock changes happen via movements (Purchase, Adjustment, Non-AC sale, Physical count).</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name *</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={barCategory}
                  onChange={(e) => setBarCategory(e.target.value)}
                  placeholder="e.g. Whisky, Beer, Vodka"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bottle Size (ml)</label>
                <input
                  type="number"
                  value={bottleSize}
                  onChange={(e) => setBottleSize(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level (bottles)</label>
                <input
                  type="number"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Rate (₹ per bottle)</label>
                <input
                  type="number"
                  value={purchaseRate}
                  onChange={(e) => setPurchaseRate(e.target.value)}
                  placeholder="enter cost"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (₹ per ml)</label>
                <input
                  type="number"
                  value={sellingPricePerMl}
                  onChange={(e) => setSellingPricePerMl(e.target.value)}
                  placeholder="e.g. 2.5"
                  step="0.01"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Persistent per-ml selling price used in the Liquor Stock &amp; Sales Report.
                </p>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                <button
                  type="button"
                  onClick={() => setIsHiddenFromReport(!isHiddenFromReport)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isHiddenFromReport ? 'bg-orange-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isHiddenFromReport ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <div>
                  <div className="text-sm font-medium text-gray-700">Hide from Report</div>
                  <div className="text-xs text-gray-400">
                    {isHiddenFromReport ? 'Hidden from Liquor PDF report & totals' : 'Visible in Liquor PDF report'}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Kitchen edit mode */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Current Stock</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">
                  {Number(item.currentStock || 0).toFixed(2)}
                  <span className="text-sm font-normal text-gray-500 ml-1">{item.unit}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">To correct stock, use Stock Adjustment.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                >
                  <option value="gm">Grams (gm)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="piece">Pieces (piece)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="litre">Litres (litre)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate (₹ per unit)</label>
                <input
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="enter rate"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
                <input
                  type="number"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg bg-[#E53935] text-white text-sm font-semibold hover:bg-[#B71C1C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
