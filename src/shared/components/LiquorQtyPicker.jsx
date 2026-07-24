// ─────────────────────────────────────────────────────────────────────────────
// QuantityPicker — Typeable quantity input modal for any menu item
// ─────────────────────────────────────────────────────────────────────────────
// Opens when a menu item is clicked. The input starts empty so the user can
// type immediately. If left blank and Add/Enter is pressed, it defaults to 1.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Minus } from 'lucide-react';

export default function QuantityPicker({ isOpen, itemName, onSelect, onClose }) {
  const [quantity, setQuantity] = useState('1');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuantity('1');
      // Focus the input after the modal animates in so the user can type immediately
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = () => {
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    onSelect(qty);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') onClose();
  };

  const adjust = (delta) => {
    setQuantity((prev) => {
      const n = Number(prev) || 0;
      const next = n + delta;
      return next > 0 ? String(next) : '';
    });
  };

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

        {/* Quantity Input */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => adjust(-1)}
              className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <Minus size={18} />
            </button>
            <input
              ref={inputRef}
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-24 h-12 text-center text-xl font-black text-gray-900 border-2 border-amber-200 rounded-xl focus:border-amber-500 focus:outline-none"
            />
            <button
              onClick={() => adjust(1)}
              className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-black uppercase hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="flex-1 py-3 rounded-xl bg-[#E53935] text-white text-sm font-black uppercase hover:bg-red-700 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
