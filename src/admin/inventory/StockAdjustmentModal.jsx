// ─────────────────────────────────────────────────────────────────────────────
// StockAdjustmentModal — adjustment workflow with item picker + idempotency
// ─────────────────────────────────────────────────────────────────────────────
// Two modes:
//   1. Pre-selected item (from drawer): skips straight to the adjustment form.
//   2. No pre-selected item (from toolbar): shows an item search/select step
//      first, then the adjustment form. This fixes the bug where the toolbar
//      button silently adjusted inventory.items[0].
//
// Bar: calls adjustStock with requestId (idempotent via ProcessedRequest)
// Kitchen: calls createKitchenEntry with addStock/consumedStock
// Never directly overwrites currentStock — both endpoints create ledger entries.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { adjustStock, getOrCreateRequestId, clearRequestId, getOpeningPreview, updateNonAcEntry, recordNonAcDeduction } from '../../services/barInventoryApi';
import { createKitchenEntry } from '../../services/kitchenInventoryApi';

export function StockAdjustmentModal({ open, item, items, tab, onClose, onSaved }) {
  // `selectedItem` is the item chosen in the picker step (or the pre-selected
  // `item` prop when launched from the drawer). It is the ONLY item whose stock
  // is adjusted — never falls back to items[0].
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemSearch, setItemSearch] = useState('');
  const [adjustType, setAdjustType] = useState('+'); // '+' or '-' or 'opening'
  const [amount, setAmount] = useState('');
  const [openingUnit, setOpeningUnit] = useState('ml'); // 'ml' or 'btl' — unit for opening stock entry
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Opening stock live preview: today's sold/purchased/wastage for the selected item
  const [openingPreview, setOpeningPreview] = useState(null);
  const [openingPreviewLoading, setOpeningPreviewLoading] = useState(false);

  // Reset state whenever the modal opens. If a pre-selected `item` is provided
  // (drawer launch), use it directly and skip the picker step. Otherwise start
  // at the picker step with no item selected.
  useEffect(() => {
    if (open) {
      setSelectedItem(item ?? null);
      setItemSearch('');
      setAdjustType('+');
      setAmount('');
      setOpeningUnit(item && !item.acItemId && (item.nonAcItemId || (item.id || '').startsWith('nonac-')) ? 'btl' : 'ml');
      setReason('');
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
      const name = it.itemName || (tab === 'bar' ? it.menuItem?.name : it.name);
      return name?.toLowerCase().includes(q);
    });
  }, [searchableItems, itemSearch, tab]);

  const handleSelectItem = (it) => {
    setSelectedItem(it);
    setItemSearch('');
    setAdjustType('+');
    setAmount('');
    setOpeningUnit(!it.acItemId && (it.nonAcItemId || (it.id || '').startsWith('nonac-')) ? 'btl' : 'ml');
    setReason('');
    setNotes('');
    setError(null);
    setOpeningPreview(null);
  };

  // ── Fetch opening preview when an item is selected in bar tab ──
  // Shows today's sold/purchased/wastage so the admin can see the resulting
  // closing stock before saving the opening stock value.
  useEffect(() => {
    if (!open || tab !== 'bar' || !selectedItem?.acItemId) {
      setOpeningPreview(null);
      return;
    }
    let cancelled = false;
    setOpeningPreviewLoading(true);
    getOpeningPreview(selectedItem.acItemId)
      .then((data) => {
        if (!cancelled) setOpeningPreview(data);
      })
      .catch(() => {
        if (!cancelled) setOpeningPreview(null);
      })
      .finally(() => {
        if (!cancelled) setOpeningPreviewLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, tab, selectedItem?.acItemId]);

  const handleBackToPicker = () => {
    setSelectedItem(null);
    setAmount('');
    setReason('');
    setNotes('');
    setError(null);
  };

  const handleSave = async () => {
    // Validation: item selection is mandatory — never allow saving without a
    // concrete selected item with a real id.
    if (!selectedItem) {
      setError('Please select an inventory item first');
      return;
    }
    // For combined bar items, use acItemId (real InventoryItem ID) for adjustStock.
    // Standalone Non-AC items use updateNonAcEntry / recordNonAcDeduction instead.
    const isNonAcOnly = !selectedItem.acItemId && (selectedItem.nonAcItemId || (selectedItem.id || '').startsWith('nonac-'));
    const adjustItemId = selectedItem.acItemId || selectedItem.id;
    if (amountNum <= 0) {
      setError(adjustType === 'opening' ? 'Opening stock must be greater than 0' : 'Amount must be greater than 0');
      return;
    }
    if (!reason && adjustType !== 'opening') {
      setError('Reason is required');
      return;
    }

    setSaving(true);
    setError(null);

    // Idempotency key scoped to the actual selected item id.
    const actionKey = `bar-adjust:${adjustItemId}`;
    const requestId = tab === 'bar' ? getOrCreateRequestId(actionKey) : undefined;

    try {
      if (tab === 'bar') {
        if (isNonAcOnly) {
          // Standalone Non-AC item — use Non-AC APIs
          const nonAcItemId = selectedItem.nonAcItemId || selectedItem.id;
          if (adjustType === 'opening') {
            // Non-AC opening stock is in bottles
            const openingBottles = openingUnit === 'btl' ? amountNum : (Number(selectedItem.bottleSize) > 0 ? amountNum / Number(selectedItem.bottleSize) : amountNum);
            await updateNonAcEntry({
              itemId: nonAcItemId,
              openingBottles: Math.round(openingBottles * 100) / 100,
              reason: reason || undefined,
            });
          } else if (adjustType === '+') {
            // Add stock = received bottles
            const addBottles = openingUnit === 'btl' ? amountNum : (Number(selectedItem.bottleSize) > 0 ? amountNum / Number(selectedItem.bottleSize) : amountNum);
            await recordNonAcDeduction({
              itemId: nonAcItemId,
              receivedBottles: Math.round(addBottles * 100) / 100,
              adminDeduction: 0,
              reason: reason || undefined,
            });
          } else {
            // Remove stock = admin deduction
            const deductBottles = openingUnit === 'btl' ? amountNum : (Number(selectedItem.bottleSize) > 0 ? amountNum / Number(selectedItem.bottleSize) : amountNum);
            await recordNonAcDeduction({
              itemId: nonAcItemId,
              adminDeduction: Math.round(deductBottles * 100) / 100,
              receivedBottles: 0,
              reason: reason || undefined,
            });
          }
        } else {
          // AC item — use adjustStock
          // OPENING: set opening stock directly (positive amount = the opening stock value)
          // WASTAGE/ADJUSTMENT: + adds stock, - removes stock
          let quantityChange, type;
          if (adjustType === 'opening') {
            // Opening stock entry: set the absolute stock value
            // The backend OPENING type sets openingStock = stockAfter in the snapshot.
            // If the admin entered bottles, convert to ml using the item's bottleSize.
            const bottleSize = Number(selectedItem.bottleSize) || 0;
            if (openingUnit === 'btl' && bottleSize > 0) {
              quantityChange = Math.round(amountNum * bottleSize * 100) / 100; // bottles → ml
            } else {
              quantityChange = amountNum; // already in ml
            }
            type = 'OPENING';
          } else {
            quantityChange = adjustType === '+' ? amountNum : -amountNum;
            type = reason === 'wastage' || reason === 'breakage' ? 'WASTAGE' : 'ADJUSTMENT';
          }
          await adjustStock({
            itemId: adjustItemId,
            quantityChange,
            type,
            notes: `${reason}${notes ? ': ' + notes : ''}`,
            createdBy: 'Admin',
            requestId,
          });
          clearRequestId(actionKey);
        }
      } else {
        // Kitchen: use entries endpoint
        const kitchenItemId = selectedItem.id;
        if (adjustType === '+') {
          await createKitchenEntry({
            itemId: kitchenItemId,
            addStock: amountNum,
            notes: `${reason}${notes ? ': ' + notes : ''}`,
          });
        } else {
          await createKitchenEntry({
            itemId: kitchenItemId,
            consumedStock: amountNum,
            notes: `${reason}${notes ? ': ' + notes : ''}`,
          });
        }
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to adjust stock');
      // Do NOT clear requestId on error — reuse on retry
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // Picker step — shown when no item is pre-selected and none chosen yet.
  const showPicker = !selectedItem;

  // Derived display values for the form step from the selected item.
  const amountNum = amount === '' ? 0 : Number(amount);

  const itemName = selectedItem
    ? (selectedItem.itemName || (tab === 'bar' ? selectedItem.menuItem?.name : selectedItem.name))
    : '';
  const isNonAcOnlyItem = selectedItem && !selectedItem.acItemId && (selectedItem.nonAcItemId || (selectedItem.id || '').startsWith('nonac-'));
  const currentStock = isNonAcOnlyItem
    ? (Number(selectedItem?.nonAcClosing) || 0)
    : (Number(selectedItem?.currentStock || selectedItem?.acClosing) || 0);
  const bottleSize = Number(selectedItem?.bottleSize) || 0;
  const currentStockBtl = isNonAcOnlyItem ? currentStock : (bottleSize > 0 ? currentStock / bottleSize : 0);
  const unit = selectedItem
    ? (isNonAcOnlyItem ? 'btl' : (tab === 'bar' ? 'ml' : selectedItem.unit))
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
            <h2 className="text-lg font-bold text-gray-900">Stock Adjustment</h2>
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
                    const name = it.itemName || (tab === 'bar' ? it.menuItem?.name : it.name);
                    const stock = Number(it.currentStock || it.acClosing) || 0;
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
                Item selection is required before entering an adjustment amount.
              </p>
            </>
          ) : (
            // ── Step 2: Adjustment form ──────────────────────────────────────
            <>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Item</div>
                <div className="text-sm font-semibold text-gray-900 mt-0.5">{itemName}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Current: {currentStock.toFixed(2)} {unit}
                  {tab === 'bar' && bottleSize > 0 && (
                    <span className="ml-2 text-gray-400">
                      ({currentStockBtl.toFixed(2)} btl)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdjustType('+')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      adjustType === '+' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    + Add Stock
                  </button>
                  <button
                    onClick={() => setAdjustType('-')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      adjustType === '-' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    − Remove Stock
                  </button>
                  {tab === 'bar' && (
                    <button
                      onClick={() => setAdjustType('opening')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                        adjustType === 'opening' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Opening Stock
                    </button>
                  )}
                </div>
                {adjustType === 'opening' && (
                  <p className="text-xs text-purple-600 mt-1.5">
                    Enter the total opening stock for today. The system automatically deducts today's settled bills and shows the closing stock.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {adjustType === 'opening' ? `Opening Stock` : `Amount (${unit})`} <span className="text-red-500">*</span>
                  </label>
                  {adjustType === 'opening' && tab === 'bar' && bottleSize > 0 && (
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => { setOpeningUnit('ml'); setAmount(''); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          openingUnit === 'ml' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        ml
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOpeningUnit('btl'); setAmount(''); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          openingUnit === 'btl' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Bottles
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
                {adjustType === 'opening' && tab === 'bar' && bottleSize > 0 && amount !== '' && amountNum > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {openingUnit === 'btl'
                      ? `= ${Math.round(amountNum * bottleSize).toLocaleString('en-IN')} ml (${bottleSize} ml per bottle)`
                      : `= ${(amountNum / bottleSize).toFixed(2)} bottles (${bottleSize} ml per bottle)`}
                  </p>
                )}
                {adjustType === 'opening' && tab === 'bar' && (
                  <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-1.5">
                    {openingPreviewLoading ? (
                      <p className="text-xs text-purple-500">Loading today's activity...</p>
                    ) : openingPreview ? (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600 font-medium">Today's Sold (from settled bills):</span>
                          <span className="text-red-600 font-bold">{Number(openingPreview.todaySoldMl).toLocaleString('en-IN')} ml</span>
                        </div>
                        {Number(openingPreview.todayPurchasedMl) > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600 font-medium">Today's Purchases:</span>
                            <span className="text-green-600 font-bold">+{Number(openingPreview.todayPurchasedMl).toLocaleString('en-IN')} ml</span>
                          </div>
                        )}
                        {Number(openingPreview.todayWastageMl) > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600 font-medium">Today's Wastage:</span>
                            <span className="text-orange-600 font-bold">-{Number(openingPreview.todayWastageMl).toLocaleString('en-IN')} ml</span>
                          </div>
                        )}
                        {Number(openingPreview.todayAdjustedMl) !== 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600 font-medium">Today's Adjustments:</span>
                            <span className={`font-bold ${Number(openingPreview.todayAdjustedMl) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {Number(openingPreview.todayAdjustedMl) > 0 ? '+' : ''}{Number(openingPreview.todayAdjustedMl).toLocaleString('en-IN')} ml
                            </span>
                          </div>
                        )}
                        {amount !== '' && amountNum > 0 && (() => {
                          const openingMl = openingUnit === 'btl' && bottleSize > 0 ? amountNum * bottleSize : amountNum;
                          const closing = openingMl
                            + Number(openingPreview.todayPurchasedMl)
                            - Number(openingPreview.todaySoldMl)
                            - Number(openingPreview.todayWastageMl)
                            + Number(openingPreview.todayAdjustedMl);
                          return (
                            <div className="flex justify-between text-xs pt-1.5 border-t border-purple-200">
                              <span className="text-purple-700 font-bold">Closing Stock (for tomorrow):</span>
                              <span className={`font-bold ${closing < 0 ? 'text-red-600' : 'text-purple-700'}`}>
                                {closing.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ml
                                {bottleSize > 0 && (
                                  <span className="text-gray-400 font-normal ml-1">
                                    ({(closing / bottleSize).toFixed(2)} btl)
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Unable to load today's activity.</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason {adjustType === 'opening' ? '(optional)' : '*'}
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                >
                  <option value="">Select a reason...</option>
                  <option value="physical correction">Physical Correction</option>
                  <option value="breakage">Breakage</option>
                  <option value="wastage">Wastage</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional details..."
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
              className="px-4 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Apply Adjustment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
