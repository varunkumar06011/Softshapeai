// ─────────────────────────────────────────────────────────────────────────────
// InventorySummaryCards — 4 summary cards (Total Items, Low Stock, Stock Value,
// Today's Usage). Clicking Low Stock card filters the table.
// ─────────────────────────────────────────────────────────────────────────────

import { SUMMARY_CARDS } from './inventoryConstants';

export function InventorySummaryCards({ summary, filterStatus, setFilterStatus }) {
  const formatCurrency = (val) => {
    if (!val || val === 0) return '₹0';
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
    return `₹${Math.round(val)}`;
  };

  const values = {
    totalItems: summary.totalItems,
    lowStock: summary.lowStock,
    stockValue: formatCurrency(summary.stockValue),
    todayUsage: formatCurrency(summary.todayUsage),
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {SUMMARY_CARDS.map((card) => {
        const isActive = card.key === 'lowStock' && filterStatus === 'low';
        return (
          <button
            key={card.key}
            onClick={() => {
              if (card.key === 'lowStock') {
                setFilterStatus(isActive ? 'all' : 'low');
              }
            }}
            className={`bg-white rounded-xl shadow-sm border p-4 text-left transition-all hover:shadow-md ${
              isActive ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-100'
            } ${card.key !== 'lowStock' ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {card.label}
            </div>
            <div className={`text-2xl font-bold mt-1 ${card.color}`}>
              {values[card.key]}
            </div>
          </button>
        );
      })}
    </div>
  );
}
