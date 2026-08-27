// ─────────────────────────────────────────────────────────────────────────────
// AddItemModal — two distinct creation flows:
//   Bar: menu-item picker (LIQUOR MenuItems not yet linked to inventory)
//   Kitchen: freestanding form (name, category, unit, rate, opening, threshold)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { createInventoryItem } from '../../services/barInventoryApi';
import { createKitchenItem, createKitchenEntry } from '../../services/kitchenInventoryApi';
import { apiUrl, getAuthHeaders } from '../../services/apiConfig';
import { getCurrentRestaurantId } from '../../utils/getCurrentRestaurantId';

export function AddItemModal({ open, onClose, tab, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Bar-specific state
  const [menuItems, setMenuItems] = useState([]);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [bottleSize, setBottleSize] = useState('');
  const [openingStock, setOpeningStock] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(0);
  const [costPerBottle, setCostPerBottle] = useState('');

  // Kitchen-specific state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('gm');
  const [rate, setRate] = useState('');
  const [kitchenOpening, setKitchenOpening] = useState(0);
  const [lowStockThreshold, setLowStockThreshold] = useState(0);
  const [image, setImage] = useState('');

  // Fetch unlinked LIQUOR menu items for bar
  useEffect(() => {
    if (open && tab === 'bar') {
      fetchUnlinkedMenuItems();
    }
  }, [open, tab]);

  const fetchUnlinkedMenuItems = async () => {
    try {
      const rId = getCurrentRestaurantId();
      const res = await fetch(apiUrl(`/api/bar/menu?restaurantId=${rId}`), {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      // Filter to LIQUOR items that don't have inventory linked
      const items = Array.isArray(data) ? data : (data?.items || []);
      setMenuItems(items.filter((m) => m.menuType === 'LIQUOR' || m.menuType === 'BAR'));
    } catch {
      setMenuItems([]);
    }
  };

  const resetForm = () => {
    setSelectedMenuItemId('');
    setBottleSize('');
    setOpeningStock(0);
    setReorderLevel(0);
    setCostPerBottle('');
    setAcSellingPerMl('');
    setNonAcSellingPerMl('');
    setName('');
    setCategory('');
    setUnit('gm');
    setRate('');
    setKitchenOpening(0);
    setLowStockThreshold(0);
    setImage('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSaveBar = async () => {
    if (!selectedMenuItemId) {
      setError('Please select a menu item');
      return;
    }
    if (bottleSize <= 0) {
      setError('Bottle size must be greater than 0');
      return;
    }
    if (openingStock < 0 || reorderLevel < 0) {
      setError('Stock values must be non-negative');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createInventoryItem({
        menuItemId: selectedMenuItemId,
        unitOfMeasure: 'ml',
        bottleSize: Number(bottleSize),
        openingStockBottles: openingStock,
        reorderLevel,
        ...(costPerBottle !== '' && { costPerBottle: Number(costPerBottle) }),
      });
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
    if ((rate !== '' && Number(rate) < 0) || kitchenOpening < 0 || lowStockThreshold < 0) {
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
        reorderLevel: lowStockThreshold,
        currentStock: 0,
        image: image || undefined,
      });

      // Set opening stock via a daily entry
      if (kitchenOpening > 0 && created?.id) {
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
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
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
              {/* Bar: menu-item picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Menu Item *</label>
                <select
                  value={selectedMenuItemId}
                  onChange={(e) => setSelectedMenuItemId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                >
                  <option value="">Select a liquor menu item...</option>
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {menuItems.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    No unlinked liquor menu items found. All items may already have inventory.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bottle Size (ml) *</label>
                <input
                  type="number"
                  value={bottleSize}
                  onChange={(e) => setBottleSize(e.target.value)}
                  placeholder="e.g. 750"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Stock (bottles)</label>
                <input
                  type="number"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(Number(e.target.value))}
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
                  onChange={(e) => setCostPerBottle(e.target.value)}
                  placeholder="enter cost"
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
                  onChange={(e) => setKitchenOpening(Number(e.target.value))}
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
            onClick={handleClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
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
