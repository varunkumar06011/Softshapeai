import React, { useMemo } from 'react';
import {
  LayoutGrid, ClipboardList, UtensilsCrossed, Settings
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'floor', label: 'Floor', icon: LayoutGrid },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({
  activeSection,
  onSectionChange,
  freeCount,
  busyCount,
  totalSales,
  totalBills,
  captainName,
  version = 'v2.0.0',
}) {
  const formattedSales = useMemo(() => {
    const n = Number(totalSales || 0);
    return n.toLocaleString('en-IN');
  }, [totalSales]);

  return (
    <aside
      className="hidden lg:flex flex-col w-[240px] shrink-0 bg-[#0F172A] text-white h-full overflow-y-auto"
      aria-label="Main navigation"
    >
      {/* Nav items */}
      <nav className="flex flex-col gap-1 p-3 flex-grow" role="tablist">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSectionChange(id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 ${
                isActive
                  ? 'bg-[#EF4444] text-white font-bold shadow-sm'
                  : 'text-gray-300 hover:bg-[#FEE2E2]/10 hover:text-white'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-white' : 'text-gray-400'} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Today's Summary card */}
      <div className="p-3 shrink-0">
        <div className="bg-[#1E293B] rounded-2xl p-4 space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Today's Summary
          </h3>
          <div className="space-y-2">
            <div>
              <p className="text-xl font-black text-white tabular-nums leading-none">
                ₹{formattedSales}
              </p>
              <p className="text-[10px] font-medium text-gray-400 mt-0.5">Total Sales</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white tabular-nums leading-none">
                {totalBills ?? 0}
              </p>
              <p className="text-[10px] font-medium text-gray-400 mt-0.5">Total Bills</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-green-500/10 rounded-lg px-2 py-1.5">
              <p className="text-sm font-bold text-green-400 tabular-nums leading-none">{freeCount ?? 0}</p>
              <p className="text-[9px] font-medium text-green-400/70 mt-0.5">Free Tables</p>
            </div>
            <div className="bg-red-500/10 rounded-lg px-2 py-1.5">
              <p className="text-sm font-bold text-red-400 tabular-nums leading-none">{busyCount ?? 0}</p>
              <p className="text-[9px] font-medium text-red-400/70 mt-0.5">Busy Tables</p>
            </div>
          </div>
        </div>
      </div>

      {/* Version + online status */}
      <div className="px-4 py-3 shrink-0 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] font-medium text-gray-500">
          Captain {version} · Online
        </span>
      </div>
    </aside>
  );
}
