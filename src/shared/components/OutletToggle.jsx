import React from 'react';
import { useOutlet } from '../../context/OutletContext';

export default function OutletToggle({ className = '' }) {
  const { outlet, switchOutlet } = useOutlet();

  return (
    <div className={`flex items-center bg-gray-100 rounded-full p-1 gap-1 ${className}`}>
      <button
        onClick={() => switchOutlet('restaurant')}
        className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
          outlet === 'restaurant'
            ? 'bg-[#E53935] text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        🍽 Restaurant
      </button>
      <button
        onClick={() => switchOutlet('bar')}
        className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
          outlet === 'bar'
            ? 'bg-[#B71C1C] text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        🍺 Bar
      </button>
    </div>
  );
}
