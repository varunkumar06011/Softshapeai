import React, { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateDisplay } from '../utils/dateFormat';

export default function DateInputButton({
  value,
  max,
  onChange,
  className = '',
}) {
  const inputRef = useRef(null);

  const openPicker = () => {
    if (typeof inputRef.current?.showPicker === 'function') {
      inputRef.current.showPicker();
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.click();
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={openPicker}
        className="px-3 py-2 rounded-xl text-[11px] font-black border border-gray-200 bg-white text-gray-700 outline-none focus:border-[#E53935] transition-colors shadow-sm cursor-pointer flex items-center gap-2 min-w-[122px] justify-between"
      >
        <span>{formatDateDisplay(value)}</span>
        <CalendarDays size={14} className="text-gray-400" />
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
