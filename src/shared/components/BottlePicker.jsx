// ─────────────────────────────────────────────────────────────────────────────
// BottlePicker — Bottle-size selection modal for liquor pegs (30/60/90ml)
// ─────────────────────────────────────────────────────────────────────────────
// Opens after quantity selection when a liquor peg is added to the cart.
// Lets the captain/cashier pick which physical bottle the drink is poured from.
// "Skip" falls back to the current largest-bottle-first deduction logic.
// No stock quantities are shown to the captain/cashier.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { X, Wine } from 'lucide-react';

export default function BottlePicker({ isOpen, itemName, quantity, bottles, onSelect, onSkip, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setLoading(!bottles || bottles.length === 0);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId);
    } else {
      onSkip();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onClose();
  };

  const hasBottles = bottles && bottles.length > 0;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Wine size={18} className="text-amber-600" />
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                Select Bottle
              </h3>
              <p className="text-xs text-amber-700 font-bold mt-0.5 truncate max-w-[200px]">
                {itemName}{quantity > 1 ? ` × ${quantity}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Bottle options */}
        <div className="p-5 space-y-3" onKeyDown={handleKeyDown}>
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm font-bold">
              Loading bottles…
            </div>
          ) : !hasBottles ? (
            <div className="text-center py-8 text-gray-400 text-sm font-bold">
              No bottles configured for this item
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                Pour from which bottle?
              </p>
              <div className="space-y-2">
                {bottles.map((bottle) => (
                  <button
                    key={bottle.inventoryItemId}
                    onClick={() => setSelectedId(bottle.inventoryItemId)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${
                      selectedId === bottle.inventoryItemId
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-200 bg-white hover:border-amber-200'
                    }`}
                  >
                    <span className={`text-sm font-black ${selectedId === bottle.inventoryItemId ? 'text-amber-700' : 'text-gray-700'}`}>
                      {bottle.label}
                    </span>
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedId === bottle.inventoryItemId
                          ? 'border-amber-500 bg-amber-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedId === bottle.inventoryItemId && (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onSkip}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-black uppercase hover:bg-gray-50 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleConfirm}
              disabled={!hasBottles || loading}
              className={`flex-1 py-3 rounded-xl text-white text-sm font-black uppercase transition-colors ${
                hasBottles && !loading
                  ? 'bg-[#E53935] hover:bg-red-700'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
