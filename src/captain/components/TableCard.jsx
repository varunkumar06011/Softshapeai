import React, { memo } from 'react';
import { UtensilsCrossed } from 'lucide-react';

const STATUS_CONFIG = {
  'Free': { color: '#22C55E', bg: 'bg-white', icon: UtensilsCrossed, label: 'Free' },
  'Occupied': { color: '#EF4444', bg: 'bg-red-50/50', icon: UtensilsCrossed, label: 'Occupied' },
};

const TableCard = memo(function TableCard({ table, onSelect, isSelected }) {
  const status = table.status || 'Free';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Free'];
  const Icon = cfg.icon;
  const bill = table.currentBill || table.bill;

  return (
    <button
      onClick={() => onSelect(table)}
      className={`relative aspect-square rounded-2xl border p-1.5 sm:p-3 flex flex-col items-center justify-center transition-all duration-150 hover:scale-[1.02] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${
        cfg.bg
      } ${isSelected ? 'ring-2 ring-[#EF4444] ring-offset-1' : 'border-gray-200 shadow-sm'}`}
      aria-label={`Table ${table.number || table.id}, ${cfg.label}`}
    >
      {/* Table number top-left */}
      <span className="absolute top-1.5 left-2 sm:top-2 sm:left-3 text-sm sm:text-lg font-black text-gray-900 leading-none">
        {table.number || table.id}
      </span>

      {/* Status icon circle */}
      <div
        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mb-1 sm:mb-1.5"
        style={{ backgroundColor: `${cfg.color}20` }}
      >
        <Icon size={16} className="sm:hidden" style={{ color: cfg.color }} />
        <Icon size={18} className="hidden sm:block" style={{ color: cfg.color }} />
      </div>

      {/* Status label */}
      <span
        className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide leading-none"
        style={{ color: cfg.color }}
      >
        {cfg.label}
      </span>

      {/* Bill amount for non-free tables */}
      {bill && status !== 'Free' && (
        <span className="text-xs sm:text-sm font-bold text-gray-700 mt-0.5 sm:mt-1 tabular-nums">
          ₹{bill}
        </span>
      )}
    </button>
  );
});

export default TableCard;
