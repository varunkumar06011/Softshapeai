// ─────────────────────────────────────────────────────────────────────────────
// AddItemModal — two distinct creation flows:
//   Bar: menu-item picker (LIQUOR MenuItems not yet linked to inventory)
//   Kitchen: freestanding form (name, category, unit, rate, opening, threshold)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { createInventoryItem, fetchUnlinkedItems, getOrCreateRequestId, clearRequestId } from '../../services/barInventoryApi';
import { createKitchenItem, createKitchenEntry } from '../../services/kitchenInventoryApi';

// Dropdown with an "Add new…" option. Selecting it reveals a text input so the
// user can enter a value not yet in the system. "Back to list" returns to the
// dropdown of existing values.
function DropdownOrNew({ label, options, mode, setMode, picked, setPicked, newVal, setNewVal, placeholder, inputType = 'text', required = false }) {
  const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400';
  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === '__add_new__') { setMode('new'); setNewVal(''); }
    else { setPicked(v); }
  };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && ' *'}</label>
      {mode === 'new' ? (
        <div className="flex gap-2">
          <input
            type={inputType}
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => { setMode('pick'); setNewVal(''); }}
            className="px-3 py-2.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 shrink-0"
            title="Back to list"
          >
            List
          </button>
        </div>
      ) : (
        <select
          value={picked}
          onChange={handleSelect}
          className={inputClass}
        >
          <option value="">— Select —</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          <option value="__add_new__">+ Add new…</option>
        </select>
      )}
    </div>
  );
}

export function AddItemModal({ open, onClose, tab, onSaved, existingItems = [] }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Bar-specific state
  const [menuItems, setMenuItems] = useState([]);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [brand, setBrand] = useState('');
  const [barCategory, setBarCategory] = useState('');
  const [bottleSize, setBottleSize] = useState('');
  const [openingStock, setOpeningStock] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [costPerBottle, setCostPerBottle] = useState('');
  const [sellingPricePerMl, setSellingPricePerMl] = useState('');

  // "Add new..." toggle state for each dropdown field
  const [brandMode, setBrandMode] = useState('pick');   // 'pick' | 'new'
  const [categoryMode, setCategoryMode] = useState('pick');
  const [sizeMode, setSizeMode] = useState('pick');
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newBottleSize, setNewBottleSize] = useState('');

  // Derive unique sorted option lists from existing bar inventory items
  const brandOptions = useMemo(() => {
    const set = new Set();
    for (const it of existingItems) {
      const v = (it.brand || '').trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [existingItems]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const it of existingItems) {
      const v = (it.category || '').trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [existingItems]);

  const sizeOptions = useMemo(() => {
    const set = new Set();
    for (const it of existingItems) {
      const v = Number(it.bottleSizeMl);
      if (v > 0) set.add(v);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [existingItems]);

  // Kitchen-specific state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('gm');
  const [rate, setRate] = useState('');
  const [kitchenOpening, setKitchenOpening] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [image, setImage] = useState('');

  // Fetch unlinked LIQUOR menu items for bar
  useEffect(() => {
    if (open && tab === 'bar') {
      fetchUnlinkedMenuItems();
    }
  }, [open, tab]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open]);

  // Auto-fill brand + bottle size from the selected menu item name.
  // If the derived value is not already in the dropdown options, switch that
  // field to "new" mode so the value is visible in the text input.
  useEffect(() => {
    if (!selectedMenuItemId) return;
    const mi = menuItems.find((m) => m.id === selectedMenuItemId);
    if (!mi) return;
    const miName = mi.name || '';
    if (!displayName) setDisplayName(miName);
    if (brandMode === 'pick' && !brand) {
      const base = miName.toLowerCase()
        .replace(/\s*\d+\s*(?:ml|l(?:tr|itre|iter)?|l)\b/gi, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const derived = base.split(' ').map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
      if (derived && !brandOptions.includes(derived)) {
        setBrandMode('new');
        setNewBrand(derived);
      } else {
        setBrand(derived);
      }
    }
    if (categoryMode === 'pick' && !barCategory) {
      const catName = mi.category?.name || '';
      if (catName && !categoryOptions.includes(catName)) {
        setCategoryMode('new');
        setNewCategory(catName);
      } else {
        setBarCategory(catName);
      }
    }
    if (sizeMode === 'pick' && !bottleSize) {
      const mlMatch = miName.match(/(\d+)\s*ml\b/i);
      const ltrMatch = miName.match(/(\d+)\s*l(?:tr|itre|iter)?\b/i);
      let derivedSize = '';
      if (mlMatch) derivedSize = mlMatch[1];
      else if (ltrMatch) derivedSize = String(Number(ltrMatch[1]) * 1000);
      else derivedSize = '750';
      const asNum = Number(derivedSize);
      if (asNum > 0 && !sizeOptions.includes(asNum)) {
        setSizeMode('new');
        setNewBottleSize(derivedSize);
      } else {
        setBottleSize(derivedSize);
      }
    }
  }, [selectedMenuItemId, menuItems]);

  const fetchUnlinkedMenuItems = async () => {
    try {
      const data = await fetchUnlinkedItems();
      setMenuItems(data?.items || []);
    } catch {
      setMenuItems([]);
    }
  };

  const resetForm = () => {
    setSelectedMenuItemId('');
    setDisplayName('');
    setBrand('');
    setBarCategory('');
    setBottleSize('');
    setOpeningStock('');
    setReorderLevel('');
    setCostPerBottle('');
    setSellingPricePerMl('');
    setBrandMode('pick');
    setCategoryMode('pick');
    setSizeMode('pick');
    setNewBrand('');
    setNewCategory('');
    setNewBottleSize('');
    setName('');
    setCategory('');
    setUnit('gm');
    setRate('');
    setKitchenOpening('');
    setLowStockThreshold('');
    setImage('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSaveBar = async () => {
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }
    // Resolve final brand / category / bottle size from pick or "add new" mode
    const finalBrand = brandMode === 'new' ? newBrand.trim() : brand.trim();
    const finalCategory = categoryMode === 'new' ? newCategory.trim() : barCategory.trim();
    const finalBottleSize = sizeMode === 'new' ? newBottleSize : bottleSize;
    if (Number(finalBottleSize) <= 0) {
      setError('Bottle size must be greater than 0');
      return;
    }
    const openingStockNum = openingStock === '' ? 0 : Number(openingStock);
    const reorderLevelNum = reorderLevel === '' ? 0 : Number(reorderLevel);
    if (openingStockNum < 0 || reorderLevelNum < 0) {
      setError('Stock values must be non-negative');
      return;
    }

    setSaving(true);
    setError(null);
    // Idempotency key tied to the item identity + payload — retries reuse it,
    // a corrected create (different size/opening) gets a fresh one.
    const actionKey = `bar-item-create:${selectedMenuItemId || displayName.trim().toLowerCase()}:${finalBottleSize}:${openingStockNum}`;
    try {
      await createInventoryItem({
        menuItemId: selectedMenuItemId || undefined,
        name: displayName.trim(),
        brand: finalBrand || displayName.trim(),
        category: finalCategory || 'Liquor',
        bottleSizeMl: Number(finalBottleSize),
        openingStockBottles: openingStockNum,
        reorderLevelBottles: reorderLevelNum,
        requestId: getOrCreateRequestId(actionKey),
        ...(costPerBottle !== '' && { purchaseRate: Number(costPerBottle) }),
        ...(sellingPricePerMl !== '' && { sellingPricePerMl: Number(sellingPricePerMl) }),
      });
      clearRequestId(actionKey);
      onSaved?.();
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to create item');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKitchen = async () => {
    if (!name.trim()) {
      setError('Item name is required');
      return;
    }
    if (!category.trim()) {
      setError('Category is required');
      return;
    }
    if (!unit.trim()) {
      setError('Unit is required');
      return;
    }
    const kitchenOpeningNum = kitchenOpening === '' ? 0 : Number(kitchenOpening);
    const lowStockThresholdNum = lowStockThreshold === '' ? 0 : Number(lowStockThreshold);
    if ((rate !== '' && Number(rate) < 0) || kitchenOpeningNum < 0 || lowStockThresholdNum < 0) {
      setError('Values must be non-negative');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Create the item (currentStock defaults to 0)
      const created = await createKitchenItem({
        name: name.trim(),
        category: category.trim(),
        unit: unit.trim(),
        price: rate !== '' ? Number(rate) : 0,
        reorderLevel: lowStockThresholdNum,
        currentStock: 0,
        image: image || undefined,
      });

      // Set opening stock via a daily entry
      if (kitchenOpeningNum > 0 && created?.id) {
        await createKitchenEntry({
          itemId: created.id,
          openingStock: kitchenOpening,
          replace: true,
        });
      }

      onSaved?.();
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to create item');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            Add {tab === 'bar' ? 'Bar' : 'Kitchen'} Item
          </h2>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600">
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
              {/* Bar: one stock pool per bottle SKU — optional menu link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link Menu Item (optional)</label>
                <select
                  value={selectedMenuItemId}
                  onChange={(e) => setSelectedMenuItemId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                >
                  <option value="">— No menu link (standalone stock item) —</option>
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {menuItems.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    No unlinked liquor menu items found. You can still create a standalone stock item.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name *</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Royal Stag 750ml"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <DropdownOrNew
                label="Brand"
                options={brandOptions}
                mode={brandMode}
                setMode={setBrandMode}
                picked={brand}
                setPicked={setBrand}
                newVal={newBrand}
                setNewVal={setNewBrand}
                placeholder="e.g. Royal Stag"
              />
              <DropdownOrNew
                label="Category"
                options={categoryOptions}
                mode={categoryMode}
                setMode={setCategoryMode}
                picked={barCategory}
                setPicked={setBarCategory}
                newVal={newCategory}
                setNewVal={setNewCategory}
                placeholder="e.g. Whisky, Beer, Vodka"
              />
              <DropdownOrNew
                label="Bottle Size (ml)"
                options={sizeOptions}
                mode={sizeMode}
                setMode={setSizeMode}
                picked={bottleSize}
                setPicked={setBottleSize}
                newVal={newBottleSize}
                setNewVal={setNewBottleSize}
                placeholder="e.g. 750"
                inputType="number"
                required
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Stock (bottles)</label>
                <input
                  type="number"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  placeholder="0"
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
                  value={costPerBottle}
                  onChange={(e) => setCostPerBottle(e.target.value)}
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
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
            </>
          ) : (
            <>
              {/* Kitchen: freestanding form */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Chicken, Onion, Cooking Oil"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Meat, Vegetables, Spices"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Stock</label>
                <input
                  type="number"
                  value={kitchenOpening}
                  onChange={(e) => setKitchenOpening(e.target.value)}
                  placeholder="0"
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
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={tab === 'bar' ? handleSaveBar : handleSaveKitchen}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg bg-[#E53935] text-white text-sm font-semibold hover:bg-[#B71C1C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
