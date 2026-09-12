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
import { updateInventoryItem, adjustStock, getOrCreateRequestId, clearRequestId } from '../../services/barInventoryApi';
import { updateKitchenItem } from '../../services/kitchenInventoryApi';

const OTHER = '__other__';
const STANDARD_BOTTLE_SIZES = ['90', '180', '250', '275', '330', '375', '500', '650', '750', '1000'];
const DEFAULT_BAR_CATEGORIES = ['Whisky', 'Brandy', 'Rum', 'Vodka', 'Gin', 'Beer', 'Wine', 'Liqueur', 'Cool Drinks', 'Liquor'];

// Dropdown of known values with an "Other…" escape that swaps to a free input.
// The current value is always offered even if it isn't in the option list.
function SelectOrCustom({ value, onChange, options, placeholder, type = 'text' }) {
  const [custom, setCustom] = useState(false);
  if (custom) {
    return (
      <div className="flex gap-2">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
        />
        <button
          type="button"
          onClick={() => setCustom(false)}
          className="px-3 py-2.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50"
        >
          List
        </button>
      </div>
    );
  }
  const opts = value !== '' && !options.includes(value) ? [value, ...options] : options;
  return (
    <select
      value={value}
      onChange={(e) => (e.target.value === OTHER ? setCustom(true) : onChange(e.target.value))}
      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
    >
      {value === '' && <option value="" disabled>{placeholder}</option>}
      {opts.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
      <option value={OTHER}>Other…</option>
    </select>
  );
}

export function EditItemModal({ open, item, items, tab, date, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Bar master fields (new single-pool model — no stock movement here)
  const [displayName, setDisplayName] = useState('');
  const [brand, setBrand] = useState('');
  const [barCategory, setBarCategory] = useState('');
  const [bottleSize, setBottleSize] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [sellingPriceBtl, setSellingPriceBtl] = useState(''); // entered per bottle, stored per ml
  const [isHiddenFromReport, setIsHiddenFromReport] = useState(false);

  // Optional opening stock entry (bar only) — creates an OPENING movement for
  // the modal's date after the master fields are saved. Empty = skip.
  const [openingStock, setOpeningStock] = useState('');
  const [openingUnit, setOpeningUnit] = useState('btl'); // 'btl' or 'ml'

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
        // Stored per-ml; entered per bottle in the UI.
        const sizeMl = Number(item.bottleSizeMl) || 0;
        setSellingPriceBtl(item.sellingPricePerMl != null
          ? (sizeMl > 0
              ? String(Math.round(Number(item.sellingPricePerMl) * sizeMl * 100) / 100)
              : String(item.sellingPricePerMl))
          : '');
        setIsHiddenFromReport(item.isHiddenFromReport === true);
        setOpeningStock('');
        setOpeningUnit('btl');
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
          // UI enters ₹/bottle; the ledger/report math needs ₹/ml.
          sellingPricePerMl: sellingPriceBtl !== ''
            ? (bottleSizeNum > 0 ? Number(sellingPriceBtl) / bottleSizeNum : Number(sellingPriceBtl))
            : null,
          isHiddenFromReport,
        });

        // Optional opening stock entry — creates an OPENING movement for the
        // modal's date. This is an absolute override (latest OPENING wins).
        const openingNum = Number(openingStock);
        if (openingStock !== '' && !Number.isNaN(openingNum) && openingNum > 0) {
          const movementDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          const sizeMl = Number(item.bottleSizeMl) || bottleSizeNum || 0;
          const openingMl = openingUnit === 'btl' && sizeMl > 0
            ? Math.round(openingNum * sizeMl * 100) / 100
            : openingNum;
          const actionKey = `bar-edit-opening:${item.id}:${openingMl}:${movementDate}`;
          await adjustStock({
            itemId: item.id,
            adjustmentType: 'OPENING',
            quantityMl: openingMl,
            date: movementDate,
            requestId: getOrCreateRequestId(actionKey),
          });
          clearRequestId(actionKey);
        }
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

  const bottleSizeNum = Number(bottleSize) || 0;
  const brandOptions = [...new Set((items || []).map((i) => i.brand).filter(Boolean))].sort();
  const categoryOptions = [...new Set([...(items || []).map((i) => i.category).filter(Boolean), ...DEFAULT_BAR_CATEGORIES])].sort();

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
                  Opening stock below creates an OPENING movement for the modal's date. */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Current Stock</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">
                  {Number(item.currentStockMl || item.systemClosingMl || 0).toFixed(2)}
                  <span className="text-sm font-normal text-gray-500 ml-1">ml</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Enter opening stock below to set today's starting stock. Sales auto-deduct from it.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Opening Stock <span className="text-gray-400 font-normal text-xs">(optional)</span>
                  </label>
                  {bottleSizeNum > 0 && (
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => { setOpeningUnit('btl'); setOpeningStock(''); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          openingUnit === 'btl' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Bottles
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpeningUnit('ml'); setOpeningStock(''); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          openingUnit === 'ml' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        ml
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  placeholder={openingUnit === 'btl' && bottleSizeNum > 0 ? 'e.g. 12' : 'e.g. 9000'}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 ${
                    openingStock !== '' ? 'border-purple-300 bg-purple-50' : 'border-gray-200'
                  }`}
                />
                {openingStock !== '' && Number(openingStock) > 0 && bottleSizeNum > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {openingUnit === 'btl'
                      ? `= ${Math.round(Number(openingStock) * bottleSizeNum).toLocaleString('en-IN')} ml (${bottleSizeNum} ml per bottle)`
                      : `= ${(Number(openingStock) / bottleSizeNum).toFixed(2)} bottles (${bottleSizeNum} ml per bottle)`}
                  </p>
                )}
                {openingStock !== '' && Number(openingStock) > 0 && (
                  <p className="text-xs text-purple-600 mt-1">
                    Sets opening for {date || 'today'} — overrides previous day's closing.
                  </p>
                )}
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
                <SelectOrCustom
                  value={brand}
                  onChange={setBrand}
                  options={brandOptions}
                  placeholder="Select brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <SelectOrCustom
                  value={barCategory}
                  onChange={setBarCategory}
                  options={categoryOptions}
                  placeholder="Select category"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bottle Size (ml)</label>
                <SelectOrCustom
                  value={bottleSize}
                  onChange={setBottleSize}
                  options={STANDARD_BOTTLE_SIZES}
                  placeholder="Select size"
                  type="number"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Selling Price (₹ per {bottleSizeNum > 0 ? 'bottle' : 'ml'})
                </label>
                <input
                  type="number"
                  value={sellingPriceBtl}
                  onChange={(e) => setSellingPriceBtl(e.target.value)}
                  placeholder={bottleSizeNum > 0 ? 'e.g. 1200' : 'e.g. 2.5'}
                  step="0.01"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {bottleSizeNum > 0 && sellingPriceBtl !== ''
                    ? `= ₹${(Number(sellingPriceBtl) / bottleSizeNum).toFixed(2)} per ml — used in the Liquor Stock & Sales Report`
                    : 'Set a bottle size to enter the price per bottle.'}
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
