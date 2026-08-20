// ─────────────────────────────────────────────────────────────────────────────
// RecordPurchaseModal — simplified purchase form with idempotency
// ─────────────────────────────────────────────────────────────────────────────
// Generates a requestId (UUID) on first submit, persists it in sessionStorage
// across retries, disables submit while in-flight to prevent double-clicks.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { recordPurchase, getOrCreateRequestId, clearRequestId } from '../../services/barInventoryApi';
import { createKitchenEntry } from '../../services/kitchenInventoryApi';

export function RecordPurchaseModal({ open, item, tab, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(0);
  const [purchaseBottles, setPurchaseBottles] = useState(0);
  const [costPerBottle, setCostPerBottle] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (item && open) {
      setQuantity(0);
      setPurchaseBottles(0);
      setCostPerBottle(tab === 'bar' ? Number(item.costPerBottle) || 0 : 0);
      setNotes('');
      setError(null);
    }
  }, [item, open, tab]);

  const handleSave = async () => {
    if (!item) return;

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

    // Idempotency: generate requestId persisted in sessionStorage, reused on retry
    const actionKey = `bar-purchase:${item.id}`;
    const requestId = tab === 'bar' ? getOrCreateRequestId(actionKey) : undefined;

    try {
      if (tab === 'bar') {
        const body = {
          itemId: item.id,
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
        // Kitchen: use entries endpoint with addStock
        await createKitchenEntry({
          itemId: item.id,
          addStock: quantity,
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

  if (!open || !item) return null;

  const itemName = tab === 'bar' ? item.menuItem?.name : item.name;
  const currentStock = Number(item.currentStock) || 0;
  const unit = tab === 'bar' ? 'ml' : item.unit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Record Purchase</h2>
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
                  onChange={(e) => setPurchaseBottles(Number(e.target.value))}
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
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  placeholder="0"
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
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity ({unit})</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              />
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
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Record Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}
