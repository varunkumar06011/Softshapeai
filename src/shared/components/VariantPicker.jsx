import React from 'react';
import { X } from 'lucide-react';

export default function VariantPicker({ item, onSelect, onClose }) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-gray-900">{item.n}</h3>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
              Select variant
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          {item.variants.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelect(item, v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-gray-100 hover:border-[#E53935] hover:bg-[#FFF5F5] transition-all group"
            >
              <span className="text-sm font-black text-gray-800 group-hover:text-[#B71C1C]">
                {v.name}
              </span>
              <span className="text-sm font-black text-[#E53935]">
                ₹{v.price}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
