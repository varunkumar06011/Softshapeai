// ─────────────────────────────────────────────────────────────────────────────
// LiquorQtyPicker — Quick quantity selection modal for non-beer liquor items
// ─────────────────────────────────────────────────────────────────────────────
// Shows predefined quantity pills (1, 2, 3, 6, 12, 25) when a non-beer liquor
// item is clicked. Clicking a pill instantly adds that quantity to cart/session
// and closes the modal. Does NOT open or expand the cart.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { X } from 'lucide-react';

const PREDEFINED_QTYS = [1, 2, 3, 6, 12, 25];

export default function LiquorQtyPicker({ isOpen, itemName, onSelect, onClose }) {
  if (!isOpen) return null;

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
          <div>
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
              Select Quantity
            </h3>
            <p className="text-xs text-amber-700 font-bold mt-0.5 truncate max-w-[200px]">
              {itemName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quantity Pills */}
        <div className="p-5">
          <div className="grid grid-cols-3 gap-3">
            {PREDEFINED_QTYS.map((qty) => (
              <button
                key={qty}
                onClick={() => onSelect(qty)}
                className="py-3.5 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-800 text-sm font-black uppercase tracking-wider hover:bg-amber-500 hover:text-white hover:border-amber-500 active:scale-95 transition-all shadow-sm"
              >
                {qty} {qty === 1 ? 'pc' : 'pcs'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
