import React from 'react';

export default function BarMenuToggle({ active, onChange }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
      <button
        onClick={() => onChange('food')}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
          active === 'food'
            ? 'bg-[#E53935] text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        🍗 Food
      </button>
      <button
        onClick={() => onChange('liquor')}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
          active === 'liquor'
            ? 'bg-[#B71C1C] text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        🥃 Liquor
      </button>
    </div>
  );
}
