// ─────────────────────────────────────────────────────────────────────────────
// RecordPurchaseModal — purchase form with item picker + idempotency
// ─────────────────────────────────────────────────────────────────────────────
// Two modes:
//   1. Pre-selected item (from drawer): skips straight to the quantity form.
//   2. No pre-selected item (from toolbar): shows an item search/select step
//      first, then the quantity form. This fixes the bug where the toolbar
//      button silently applied the purchase to inventory.items[0].
//
// Generates a requestId (UUID) on first submit, persists it in sessionStorage
// across retries, disables submit while in-flight to prevent double-clicks.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { recordPurchase, getOrCreateRequestId, clearRequestId } from '../../services/barInventoryApi';
import { createKitchenEntry } from '../../services/kitchenInventoryApi';
import { getUnitOptions, convertToBaseUnit, normalizeUnit } from '../../shared/utils/unitConversion';

export function RecordPurchaseModal({ open, item, items, tab, onClose, onSaved }) {
  // `selectedItem` is the item chosen in the picker step (or the pre-selected
  // `item` prop when launched from the drawer). It is the ONLY item whose stock
  // is updated — never falls back to items[0].
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemSearch, setItemSearch] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchaseBottles, setPurchaseBottles] = useState('');
  const [costPerBottle, setCostPerBottle] = useState('');
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset state whenever the modal opens. If a pre-selected `item` is provided
  // (drawer launch), use it directly and skip the picker step. Otherwise start
  // at the picker step with no item selected.
  useEffect(() => {
    if (open) {
      setSelectedItem(item ?? null);
      setItemSearch('');
      setQuantity('');
      setPurchaseBottles('');
      setCostPerBottle(tab === 'bar' ? Number(item?.costPerBottle) || 0 : '');
      setPurchaseUnit(tab === 'bar' ? 'ml' : normalizeUnit(item?.unit) || '');
      setNotes('');
      setError(null);
    }
  }, [item, open, tab]);

  // Filtered item list for the picker step. Searches by name (case-insensitive).
  const searchableItems = Array.isArray(items) ? items : [];
  const filteredPickerItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return searchableItems;
    return searchableItems.filter((it) => {
      const name = tab === 'bar' ? it.menuItem?.name : it.name;
      return name?.toLowerCase().includes(q);
    });
  }, [searchableItems, itemSearch, tab]);

  const handleSelectItem = (it) => {
    setSelectedItem(it);
    setItemSearch('');
    setQuantity('');
    setPurchaseBottles('');
    setCostPerBottle(tab === 'bar' ? Number(it.costPerBottle) || 0 : '');
    setPurchaseUnit(tab === 'bar' ? 'ml' : normalizeUnit(it.unit) || '');
    setError(null);
  };

  const handleBackToPicker = () => {
    setSelectedItem(null);
    setQuantity('');
    setPurchaseBottles('');
    setPurchaseUnit('');
    setNotes('');
    setError(null);
  };

  const handleSave = async () => {
    // Validation: item selection is mandatory — never allow saving without a
    // concrete selected item with a real id.
    if (!selectedItem || !selectedItem.id) {
      setError('Please select an inventory item first');
      return;
    }

    if (tab === 'bar') {
      if (quantity <= 0 && purchaseBottles <= 0) {
        setError('Enter either quantity (ml) or bottles');
        return;
      }
    } else {
      if (quantity <= 0) {
        setError('Quantity must be greater than 0');
        return;
      }
    }

    setSaving(true);
    setError(null);

    // Idempotency: generate requestId persisted in sessionStorage, reused on retry.
    // Keyed by the actual selected item id so retries never bleed across items.
    const actionKey = `bar-purchase:${selectedItem.id}`;
    const requestId = tab === 'bar' ? getOrCreateRequestId(actionKey) : undefined;

    try {
      if (tab === 'bar') {
        const body = {
          itemId: selectedItem.id,
          notes: notes || undefined,
          createdBy: 'Admin',
        };
        if (purchaseBottles > 0) {
          body.purchaseBottles = purchaseBottles;
        } else {
          body.quantity = quantity;
        }
        if (costPerBottle > 0) body.costPerBottle = costPerBottle;
        if (requestId) body.requestId = requestId;

        await recordPurchase(body);
        clearRequestId(actionKey);
      } else {
        // Kitchen: use entries endpoint with addStock — adds to today's entry,
        // which feeds opening stock for subsequent days and currentStock now.
        // Convert the entered quantity from the selected unit to the item's
        // base unit so stock is always stored consistently.
        const baseUnit = selectedItem.unit || purchaseUnit;
        const { effectiveQty } = convertToBaseUnit(quantity, purchaseUnit || baseUnit, baseUnit);
        await createKitchenEntry({
          itemId: selectedItem.id,
          addStock: effectiveQty,
          unit: baseUnit,
          notes: notes || undefined,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record purchase');
      // Do NOT clear requestId on error — reuse on retry
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // Picker step — shown when no item is pre-selected and none chosen yet.
  const showPicker = !selectedItem;

  // Derive display values for the form step from the selected item.
  const itemName = selectedItem
    ? (tab === 'bar' ? selectedItem.menuItem?.name : selectedItem.name)
    : '';
  const currentStock = Number(selectedItem?.currentStock) || 0;
  const unit = selectedItem
    ? (tab === 'bar' ? 'ml' : selectedItem.unit)
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {!showPicker && !item && (
              <button
                onClick={handleBackToPicker}
                disabled={saving}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                aria-label="Back to item selection"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-900">Record Purchase</h2>
          </div>
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

          {showPicker ? (
            // ── Step 1: Item search & select ─────────────────────────────────
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Item <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search items..."
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                  />
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              <div className="border border-gray-100 rounded-lg max-h-72 overflow-y-auto divide-y divide-gray-50">
                {filteredPickerItems.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">
                    {searchableItems.length === 0
                      ? 'No inventory items available. Add an item first.'
                      : 'No items match your search.'}
                  </div>
                ) : (
                  filteredPickerItems.map((it) => {
                    const name = tab === 'bar' ? it.menuItem?.name : it.name;
                    const stock = Number(it.currentStock) || 0;
                    const itUnit = tab === 'bar' ? 'ml' : it.unit;
                    return (
                      <button
                        key={it.id}
                        onClick={() => handleSelectItem(it)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Current: {stock.toFixed(2)} {itUnit}
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-gray-400">
                Item selection is required before entering a purchase quantity.
              </p>
            </>
          ) : (
            // ── Step 2: Quantity form ────────────────────────────────────────
            <>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Item</div>
                <div className="text-sm font-semibold text-gray-900 mt-0.5">{itemName}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Current: {currentStock.toFixed(2)} {unit}
                </div>
              </div>

              {tab === 'bar' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purchase (bottles)</label>
                    <input
                      type="number"
                      value={purchaseBottles}
                      onChange={(e) => setPurchaseBottles(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                    />
                  </div>
                  <div className="text-center text-xs text-gray-400">— or —</div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (ml)</label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Bottle (₹)</label>
                    <input
                      type="number"
                      value={costPerBottle}
                      onChange={(e) => setCostPerBottle(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                    />
                    <select
                      value={purchaseUnit}
                      onChange={(e) => setPurchaseUnit(e.target.value)}
                      className="w-28 px-2 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-white"
                    >
                      {getUnitOptions(unit).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  {purchaseUnit && unit && normalizeUnit(purchaseUnit) !== normalizeUnit(unit) && (
                    <p className="text-xs text-gray-400 mt-1">
                      Stored in {unit}. Entered in {purchaseUnit} will be converted automatically.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Invoice number, vendor name, etc."
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          {!showPicker && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Purchase'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
