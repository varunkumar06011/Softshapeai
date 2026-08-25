// ─────────────────────────────────────────────────────────────────────────────
// EditItemModal — edit item metadata and opening stock
// ─────────────────────────────────────────────────────────────────────────────
// Bar: bottle size, reorder level, cost per bottle, opening stock (with reason)
// Kitchen: name, category, unit, rate, low-stock threshold
// Opening Stock is editable for bar items — changing it updates currentStock
// and creates an ADJUSTMENT transaction with the optional reason for audit.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { updateInventoryItem } from '../../services/barInventoryApi';
import { updateKitchenItem } from '../../services/kitchenInventoryApi';

export function EditItemModal({ open, item, tab, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Bar fields
  const [bottleSize, setBottleSize] = useState(750);
  const [reorderLevel, setReorderLevel] = useState(0);
  const [costPerBottle, setCostPerBottle] = useState(0);
  const [openingStock, setOpeningStock] = useState(0);
  const [openingStockReason, setOpeningStockReason] = useState('');
  const [originalOpeningStock, setOriginalOpeningStock] = useState(0);

  // Kitchen fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('gm');
  const [rate, setRate] = useState(0);
  const [lowStockThreshold, setLowStockThreshold] = useState(0);

  useEffect(() => {
    if (item && open) {
      if (tab === 'bar') {
        setBottleSize(Number(item.bottleSize) || 750);
        setReorderLevel(Number(item.reorderLevel) || 0);
        setCostPerBottle(Number(item.costPerBottle) || 0);
        // Opening stock: use todayEntry.openingStock if available, otherwise currentStock
        const todayOpening = Number(item.todayEntry?.openingStock) || Number(item.openingStock) || Number(item.currentStock) || 0;
        setOpeningStock(todayOpening);
        setOriginalOpeningStock(todayOpening);
        setOpeningStockReason('');
      } else {
        setName(item.name || '');
        setCategory(item.category || '');
        setUnit(item.unit || 'gm');
        setRate(Number(item.price) || 0);
        setLowStockThreshold(Number(item.reorderLevel) || 0);
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
        const payload = {
          bottleSize,
          reorderLevel,
          costPerBottle,
        };
        // Only send openingStock if it changed
        if (Math.abs(openingStock - originalOpeningStock) > 0.01) {
          payload.openingStock = openingStock;
          payload.notes = openingStockReason.trim() || undefined;
        }
        await updateInventoryItem(item.id, payload);
      } else {
        await updateKitchenItem(item.id, {
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim(),
          price: rate,
          reorderLevel: lowStockThreshold,
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
            Edit {tab === 'bar' ? 'Bar' : 'Kitchen'} Item
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

          {/* Read-only display of current stock */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Current Stock</div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">
              {Number(item.currentStock || 0).toFixed(2)}
              <span className="text-sm font-normal text-gray-500 ml-1">
                {tab === 'bar' ? 'ml' : item.unit}
              </span>
            </div>
            {tab !== 'bar' && (
              <p className="text-xs text-gray-400 mt-1">
                To correct stock, use Stock Adjustment.
              </p>
            )}
          </div>

          {tab === 'bar' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bottle Size (ml)</label>
                <input
                  type="number"
                  value={bottleSize}
                  onChange={(e) => setBottleSize(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level (bottles)</label>
                <input
                  type="number"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Bottle (₹)</label>
                <input
                  type="number"
                  value={costPerBottle}
                  onChange={(e) => setCostPerBottle(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opening Stock (ml)
                  {Math.abs(openingStock - originalOpeningStock) > 0.01 && (
                    <span className="text-red-500 ml-1">•</span>
                  )}
                </label>
                <input
                  type="number"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
                {Math.abs(openingStock - originalOpeningStock) > 0.01 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Changing opening stock will update current stock from {originalOpeningStock.toFixed(2)}ml to {(openingStock + (Number(item.todayEntry?.addedStock) || 0) - (Number(item.todayEntry?.consumedStock) || 0)).toFixed(2)}ml.
                  </p>
                )}
              </div>
              {Math.abs(openingStock - originalOpeningStock) > 0.01 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={openingStockReason}
                    onChange={(e) => setOpeningStockReason(e.target.value)}
                    placeholder="e.g. Corrected after physical count"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                  />
                </div>
              )}
            </>
          ) : (
            <>
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
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
                <input
                  type="number"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(Number(e.target.value))}
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
