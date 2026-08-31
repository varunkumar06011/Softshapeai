import { useState, useEffect } from 'react';
import { adjustStock, getOrCreateRequestId, clearRequestId, updateNonAcEntry } from '../../services/barInventoryApi';

export function EditTotalStockModal({ open, item, date, onClose, onSaved }) {
  const [newOpeningInput, setNewOpeningInput] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setNewOpeningInput('');
      setReason('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open || !item) return null;

  const isNonAcOnly = !item.acItemId && (item.nonAcItemId || (item.id || '').startsWith('nonac-'));
  const itemName = item.itemName || '';
  const bottleSize = Number(item.bottleSize) || 0;
  const purchaseRate = Number(item.purchaseRate) || 0;
  const currentOpeningBtl = Number(item.openingStockBottles) || 0;
  const currentPurchasesBtl = Number(item.purchasesBottles) || 0;
  const currentTotalBtl = currentOpeningBtl + currentPurchasesBtl;
  const newOpeningBtl = newOpeningInput === '' ? currentOpeningBtl : Number(newOpeningInput);
  const newTotalBtl = newOpeningBtl + currentPurchasesBtl;
  const newOpeningValue = newOpeningBtl * purchaseRate;
  const hasChange = newOpeningInput !== '' && Math.abs(newOpeningBtl - currentOpeningBtl) > 0.001;
  const isDecrease = newOpeningBtl < currentOpeningBtl;

  const handleSave = async () => {
    if (newOpeningInput === '') {
      setError('Please enter a new opening stock value');
      return;
    }
    if (newOpeningBtl < 0) {
      setError('Opening stock cannot be negative');
      return;
    }
    if (!hasChange) {
      setError('New value is the same as current opening stock');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isNonAcOnly) {
        const nonAcItemId = item.nonAcItemId || item.id;
        await updateNonAcEntry({
          itemId: nonAcItemId,
          openingBottles: Math.round(newOpeningBtl * 100) / 100,
          reason: reason.trim() || `Edit Total Stock — set opening to ${newOpeningBtl} btl`,
        });
      } else {
        const acItemId = item.acItemId || item.id;
        const actionKey = `bar-edit-stock:${acItemId}`;
        const requestId = getOrCreateRequestId(actionKey);
        const newOpeningMl = bottleSize > 0
          ? Math.round(newOpeningBtl * bottleSize * 100) / 100
          : Math.round(newOpeningBtl * 100) / 100;

        await adjustStock({
          itemId: acItemId,
          quantityChange: newOpeningMl,
          type: 'OPENING',
          notes: reason.trim() || `Edit Total Stock — set opening to ${newOpeningBtl} btl`,
          createdBy: 'Admin',
          requestId,
          date,
        });
        clearRequestId(actionKey);
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update stock');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Edit Total Stock</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Item</div>
            <div className="text-sm font-bold text-gray-900">{itemName}</div>
            <div className="text-xs text-gray-500 mt-1">
              Bottle Size: {bottleSize > 0 ? `${bottleSize}ml` : '—'} · Purchase Rate: {purchaseRate > 0 ? `₹${purchaseRate}` : '—'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs text-blue-600 uppercase tracking-wide">Current Opening</div>
              <div className="text-lg font-bold text-gray-900 mt-1">
                {currentOpeningBtl.toFixed(2)} <span className="text-xs font-normal text-gray-500">btl</span>
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs text-blue-600 uppercase tracking-wide">Current Total</div>
              <div className="text-lg font-bold text-gray-900 mt-1">
                {currentTotalBtl.toFixed(2)} <span className="text-xs font-normal text-gray-500">btl</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Opening Stock (bottles) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newOpeningInput}
              onChange={(e) => setNewOpeningInput(e.target.value)}
              placeholder={String(currentOpeningBtl)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              Set the new absolute opening stock value. Can be higher or lower than current.
            </p>
          </div>

          {hasChange && (
            <div className={`border rounded-lg p-3 space-y-1.5 ${isDecrease ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">New Opening Stock:</span>
                <span className="font-bold text-gray-900">{newOpeningBtl.toFixed(2)} btl
                  {isDecrease && <span className="text-orange-600 ml-1">(−{(currentOpeningBtl - newOpeningBtl).toFixed(2)})</span>}
                  {!isDecrease && <span className="text-green-600 ml-1">(+{(newOpeningBtl - currentOpeningBtl).toFixed(2)})</span>}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">New Total Stock:</span>
                <span className="font-bold text-gray-900">{newTotalBtl.toFixed(2)} btl</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">New Opening Value:</span>
                <span className="font-bold text-gray-900">
                  {newOpeningValue > 0 ? `₹${newOpeningValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason / Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. New stock received"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChange}
            className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Opening Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}
