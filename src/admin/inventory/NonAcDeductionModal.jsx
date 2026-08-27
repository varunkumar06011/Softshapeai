// ─────────────────────────────────────────────────────────────────────────────
// NonAcDeductionModal — admin enters Non-AC deduction for an item
// ─────────────────────────────────────────────────────────────────────────────
// Formula: closing = opening + received - adminDeduction
// Validation: closing cannot be negative
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export function NonAcDeductionModal({ open, onClose, item, date, onSaved }) {
  const [deduction, setDeduction] = useState('');
  const [received, setReceived] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && item) {
      setDeduction(item.adminDeduction ? String(item.adminDeduction) : '');
      setReceived(item.receivedBottles ? String(item.receivedBottles) : '');
      setReason(item.reason || '');
      setError(null);
    }
  }, [open, item]);

  if (!open || !item) return null;

  const opening = Number(item.openingBottles) || 0;
  const deductVal = parseFloat(deduction) || 0;
  const receivedVal = parseFloat(received) || 0;
  const closing = opening + receivedVal - deductVal;

  const handleSave = async () => {
    if (closing < 0) {
      setError(`Deduction exceeds available stock. Opening=${opening} + Received=${receivedVal} - Deduction=${deductVal} = ${closing}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { recordNonAcDeduction } = await import('../../services/barInventoryApi');
      await recordNonAcDeduction({
        itemId: item.id || item.nonAcItemId,
        adminDeduction: deductVal,
        receivedBottles: receivedVal,
        date,
        reason: reason || undefined,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save deduction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Non-AC Deduction</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Item</label>
            <div className="mt-1 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-900">
              {item.itemName} ({item.category} · {item.bottleSize}ml)
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Opening Non-AC (bottles)</label>
            <div className="mt-1 px-3 py-2 bg-blue-50 rounded-lg text-sm font-semibold text-blue-900">
              {opening.toFixed(2)}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Received / Purchase (bottles)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={received}
              onChange={e => setReceived(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Admin Deduction (bottles)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={deduction}
              onChange={e => setDeduction(e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Reason / Notes</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div className={`px-3 py-2 rounded-lg text-sm font-semibold ${closing < 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            Closing = {opening.toFixed(2)} + {receivedVal.toFixed(2)} - {deductVal.toFixed(2)} = {closing.toFixed(2)} bottles
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || closing < 0}
            className="flex-1 py-2 rounded-lg bg-[#E53935] text-white text-sm font-medium hover:bg-[#D32F2F] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Deduction'}
          </button>
        </div>
      </div>
    </div>
  );
}
