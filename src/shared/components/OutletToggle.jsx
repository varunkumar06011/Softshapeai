import React from 'react';
import { useOutlet } from '../../context/OutletContext';

export default function OutletToggle({ className = '' }) {
  const { outlet, switchOutlet } = useOutlet();

  return (
    <div className={`flex items-center bg-gray-100 rounded-full p-1 gap-1 shrink-0 ${className}`}>
      <button
        onClick={() => switchOutlet('restaurant')}
        className={`px-2.5 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
          outlet === 'restaurant'
            ? 'bg-[#E53935] text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <span className="text-base sm:text-lg">🍽</span>
        <span className="hidden xs:inline">Restaurant</span>
      </button>
      <button
        onClick={() => switchOutlet('bar')}
        className={`px-2.5 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
          outlet === 'bar'
            ? 'bg-[#B71C1C] text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <span className="text-base sm:text-lg">🍺</span>
        <span className="hidden xs:inline">Bar</span>
      </button>
    </div>
  );
}
