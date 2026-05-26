import React from 'react';
import { Utensils, GlassWater } from 'lucide-react';

export default function BarMenuToggle({ active, onChange, variant }) {
  const isAdmin = variant === 'admin';
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1.5 gap-2 w-full">
      <button
        onClick={() => onChange('food')}
        className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-xs md:text-sm font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.02] active:scale-98 ${
          active === 'food'
            ? 'bg-[#E53935] text-white shadow-md shadow-red-500/20 scale-[1.01]'
            : 'text-gray-500 hover:text-gray-800 bg-transparent'
        }`}
      >
        {isAdmin ? (
          <Utensils size={16} />
        ) : (
          <span className="text-sm md:text-base">🍗</span>
        )}
        Food
      </button>
      <button
        onClick={() => onChange('liquor')}
        className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-xs md:text-sm font-black uppercase tracking-widest transition-all duration-150 hover:scale-[1.02] active:scale-98 ${
          active === 'liquor'
            ? 'bg-[#B71C1C] text-white shadow-md shadow-red-900/20 scale-[1.01]'
            : 'text-gray-500 hover:text-gray-800 bg-transparent'
        }`}
      >
        {isAdmin ? (
          <GlassWater size={16} />
        ) : (
          <span className="text-sm md:text-base">🥃</span>
        )}
        Liquor
      </button>
    </div>
  );
}
