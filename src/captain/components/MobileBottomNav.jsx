import React from 'react';
import { LayoutGrid, ClipboardList, Plus, UtensilsCrossed, Settings } from 'lucide-react';

export default function MobileBottomNav({ activeSection, onSectionChange, onFabClick }) {
  const items = [
    { id: 'floor', label: 'Floor', icon: LayoutGrid },
    { id: 'orders', label: 'Orders', icon: ClipboardList },
    { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white border-t border-gray-200 flex items-center justify-around h-16 px-2"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobile navigation"
    >
      {items.slice(0, 2).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSectionChange(id)}
          className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] rounded-lg transition-colors ${
            activeSection === id ? 'text-[#EF4444]' : 'text-gray-400'
          }`}
          aria-label={label}
          aria-current={activeSection === id}
        >
          <Icon size={22} />
          <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
        </button>
      ))}

      {/* Center FAB */}
      <button
        onClick={onFabClick}
        className="flex flex-col items-center justify-center w-14 h-14 rounded-full bg-[#EF4444] text-white shadow-lg -mt-6 active:scale-95 transition-transform min-w-[44px] min-h-[44px]"
        aria-label="New action"
      >
        <Plus size={26} strokeWidth={3} />
      </button>

      {items.slice(2).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSectionChange(id)}
          className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] rounded-lg transition-colors ${
            activeSection === id ? 'text-[#EF4444]' : 'text-gray-400'
          }`}
          aria-label={label}
          aria-current={activeSection === id}
        >
          <Icon size={22} />
          <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
        </button>
      ))}
    </nav>
  );
}
