// ─────────────────────────────────────────────────────────────────────────────
// StockAdjustmentModal — dedicated adjustment workflow with idempotency
// ─────────────────────────────────────────────────────────────────────────────
// Bar: calls adjustStock with requestId (idempotent via ProcessedRequest)
// Kitchen: calls createKitchenEntry with addStock/consumedStock
// Never directly overwrites currentStock — both endpoints create ledger entries.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { adjustStock, getOrCreateRequestId, clearRequestId } from '../../services/barInventoryApi';
import { createKitchenEntry } from '../../services/kitchenInventoryApi';

export function StockAdjustmentModal({ open, item, tab, onClose, onSaved }) {
  const [adjustType, setAdjustType] = useState('+'); // '+' or '-'
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (item && open) {
      setAdjustType('+');
      setAmount(0);
      setReason('');
      setNotes('');
      setError(null);
    }
  }, [item, open]);

  const handleSave = async () => {
    if (!item) return;
    if (amount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }
    if (!reason) {
      setError('Reason is required');
      return;
    }

    setSaving(true);
    setError(null);

    const actionKey = `bar-adjust:${item.id}`;
    const requestId = tab === 'bar' ? getOrCreateRequestId(actionKey) : undefined;

    try {
      if (tab === 'bar') {
        const quantityChange = adjustType === '+' ? amount : -amount;
        const type = reason === 'wastage' || reason === 'breakage' ? 'WASTAGE' : 'ADJUSTMENT';
        await adjustStock({
          itemId: item.id,
          quantityChange,
          type,
          notes: `${reason}${notes ? ': ' + notes : ''}`,
          createdBy: 'Admin',
          requestId,
        });
        clearRequestId(actionKey);
      } else {
        // Kitchen: use entries endpoint
        if (adjustType === '+') {
          await createKitchenEntry({
            itemId: item.id,
            addStock: amount,
            notes: `${reason}${notes ? ': ' + notes : ''}`,
          });
        } else {
          await createKitchenEntry({
            itemId: item.id,
            consumedStock: amount,
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

  if (!open || !item) return null;

  const itemName = tab === 'bar' ? item.menuItem?.name : item.name;
  const currentStock = Number(item.currentStock) || 0;
  const unit = tab === 'bar' ? 'ml' : item.unit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Stock Adjustment</h2>
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
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ({unit})</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="0"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
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
            className="px-4 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Apply Adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
}
