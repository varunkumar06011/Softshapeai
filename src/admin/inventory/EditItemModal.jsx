// ─────────────────────────────────────────────────────────────────────────────
// EditItemModal — edit item metadata and inventory fields
// ─────────────────────────────────────────────────────────────────────────────
// Three modes:
//   1. Non-AC edit (item.hasNonAc + item.nonAcItemId): edit Non-AC Opening, Sale, Closing
//      → persists to non_ac_daily_entries via PUT /non-ac/entry
//   2. AC bar edit (tab='bar', no Non-AC): bottle size, reorder, cost, opening stock
//      → persists to inventory_items via updateInventoryItem
//   3. Kitchen edit (tab='kitchen'): name, category, unit, rate, low-stock
//      → persists to kitchen items via updateKitchenItem
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { updateInventoryItem, updateNonAcEntry } from '../../services/barInventoryApi';
import { updateKitchenItem } from '../../services/kitchenInventoryApi';

export function EditItemModal({ open, item, tab, date, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Detect Non-AC edit mode (from combined table)
  const isNonAcEdit = tab === 'bar' && item?.hasNonAc && item?.nonAcItemId;

  // Non-AC fields
  const [naOpening, setNaOpening] = useState('');
  const [naSale, setNaSale] = useState('');
  const [naClosing, setNaClosing] = useState('');
  const [naReceived, setNaReceived] = useState('');
  const [naReason, setNaReason] = useState('');

  // Bar (AC) fields
  const [bottleSize, setBottleSize] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [costPerBottle, setCostPerBottle] = useState('');
  const [openingStock, setOpeningStock] = useState('');
  const [openingStockReason, setOpeningStockReason] = useState('');
  const [originalOpeningStock, setOriginalOpeningStock] = useState(0);
  const [acSellingPrice, setAcSellingPrice] = useState('');
  const [isHiddenFromReport, setIsHiddenFromReport] = useState(false);

  // Kitchen fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('gm');
  const [rate, setRate] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');

  useEffect(() => {
    if (item && open) {
      if (isNonAcEdit) {
        // Non-AC edit mode — populate from combined table item
        setNaOpening(item.openingNonAc != null ? String(item.openingNonAc) : '');
        setNaSale(item.nonAcDeduction != null ? String(item.nonAcDeduction) : '');
        setNaClosing(item.nonAcClosing != null ? String(item.nonAcClosing) : '');
        setNaReceived(item.nonAcReceived != null ? String(item.nonAcReceived) : '');
        setNaReason('');
      } else if (tab === 'bar') {
        setBottleSize(item.bottleSize != null ? String(item.bottleSize) : '');
        setReorderLevel(item.reorderLevel != null ? String(item.reorderLevel) : '');
        // Combined items use 'purchaseRate', basic items use 'costPerBottle'
        const costVal = item.costPerBottle != null ? item.costPerBottle : item.purchaseRate;
        setCostPerBottle(costVal != null ? String(costVal) : '');
        // Combined items use 'acClosing' (ml), basic items use 'currentStock'/'todayEntry'
        const todayOpening = Number(item.todayEntry?.openingStock) || Number(item.acClosing) || Number(item.currentStock) || 0;
        setOpeningStock(String(todayOpening));
        setOriginalOpeningStock(todayOpening);
        setOpeningStockReason('');
        setAcSellingPrice(item.acSellingPrice != null ? String(item.acSellingPrice) : '');
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
  }, [item, open, tab, isNonAcEdit]);

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      if (isNonAcEdit) {
        // Save Non-AC entry edit to database
        await updateNonAcEntry({
          itemId: item.nonAcItemId,
          date: date || undefined,
          openingBottles: naOpening !== '' ? Number(naOpening) : undefined,
          saleBottles: naSale !== '' ? Number(naSale) : undefined,
          closingBottles: naClosing !== '' ? Number(naClosing) : undefined,
          receivedBottles: naReceived !== '' ? Number(naReceived) : 0,
          reason: naReason.trim() || undefined,
        });
      } else if (tab === 'bar') {
        const payload = {
          bottleSize: bottleSize !== '' ? Number(bottleSize) : undefined,
          reorderLevel: reorderLevel === '' ? 0 : Number(reorderLevel),
          costPerBottle: costPerBottle !== '' ? Number(costPerBottle) : null,
          acSellingPrice: acSellingPrice !== '' ? Number(acSellingPrice) : null,
          isHiddenFromReport,
        };
        const openingStockNum = openingStock === '' ? 0 : Number(openingStock);
        if (Math.abs(openingStockNum - originalOpeningStock) > 0.01) {
          payload.openingStock = openingStockNum;
          payload.notes = openingStockReason.trim() || undefined;
        }
        await updateInventoryItem(item.acItemId || item.id, payload);
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

  // Compute live closing for Non-AC mode
  const naOpeningVal = parseFloat(naOpening) || 0;
  const naSaleVal = parseFloat(naSale) || 0;
  const naReceivedVal = parseFloat(naReceived) || 0;
  const naClosingVal = parseFloat(naClosing) || 0;
  const naComputedClosing = naOpeningVal + naReceivedVal - naSaleVal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isNonAcEdit ? 'Edit Non-AC Inventory' : tab === 'bar' ? 'Edit Bar Item' : 'Edit Kitchen Item'}
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

          {isNonAcEdit ? (
            <>
              {/* Non-AC edit mode */}
              <div className="bg-orange-50 rounded-lg p-3">
                <div className="text-xs text-orange-600 uppercase tracking-wide font-medium">Non-AC Item (Admin Controlled)</div>
                <div className="text-sm font-bold text-gray-900 mt-0.5">{item.itemName}</div>
                <div className="text-xs text-gray-500">{item.category} · {item.bottleSize ? `${item.bottleSize}ml` : ''}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Non-AC Opening (bottles)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={naOpening}
                  onChange={(e) => setNaOpening(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Non-AC Received / Purchase (bottles)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={naReceived}
                  onChange={(e) => setNaReceived(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Non-AC Sale / Deduction (bottles)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={naSale}
                  onChange={(e) => setNaSale(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Non-AC Closing (bottles)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={naClosing}
                  onChange={(e) => setNaClosing(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Formula: Opening ({naOpeningVal.toFixed(2)}) + Received ({naReceivedVal.toFixed(2)}) − Sale ({naSaleVal.toFixed(2)}) = {naComputedClosing.toFixed(2)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason / Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={naReason}
                  onChange={(e) => setNaReason(e.target.value)}
                  placeholder="e.g. Corrected after physical count"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>

              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                Changes persist to the database and recalculate all dependent values.
                Previous day's closing becomes next day's opening automatically.
              </div>
            </>
          ) : tab === 'bar' ? (
            <>
              {/* AC bar edit mode */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Current Stock</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">
                  {Number(item.currentStock || item.acClosing || 0).toFixed(2)}
                  <span className="text-sm font-normal text-gray-500 ml-1">ml</span>
                </div>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Bottle (₹)</label>
                <input
                  type="number"
                  value={costPerBottle}
                  onChange={(e) => setCostPerBottle(e.target.value)}
                  placeholder="enter cost"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">AC Selling Price (₹ per bottle)</label>
                <input
                  type="number"
                  value={acSellingPrice}
                  onChange={(e) => setAcSellingPrice(e.target.value)}
                  placeholder="enter selling price"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Persistent selling price used in the Liquor Stock &amp; Sales Report. Saved once, reused on all future reports.
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opening Stock (ml)
                  {Math.abs((openingStock === '' ? 0 : Number(openingStock)) - originalOpeningStock) > 0.01 && (
                    <span className="text-red-500 ml-1">•</span>
                  )}
                </label>
                <input
                  type="number"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
                {Math.abs((openingStock === '' ? 0 : Number(openingStock)) - originalOpeningStock) > 0.01 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Changing opening stock will update current stock from {originalOpeningStock.toFixed(2)}ml to {((openingStock === '' ? 0 : Number(openingStock)) + (Number(item.todayEntry?.addedStock) || 0) - (Number(item.todayEntry?.consumedStock) || 0)).toFixed(2)}ml.
                  </p>
                )}
              </div>
              {Math.abs((openingStock === '' ? 0 : Number(openingStock)) - originalOpeningStock) > 0.01 && (
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
