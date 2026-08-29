// ─────────────────────────────────────────────────────────────────────────────
// InventorySummaryCards — 16 Business Position cards
// ─────────────────────────────────────────────────────────────────────────────
// Cards:
//   1. Opening Stock Value     2. Purchase Value          3. Consumption
//   4. Closing Stock Value     5. AC Sales                6. AC Consumption
//   7. AC Profit               8. AC Profit %             9. Non-AC Sales
//  10. Non-AC Consumption     11. Non-AC Profit          12. Non-AC Profit %
//  13. AC + Non-AC Sales       14. AC + Non-AC Consumption 15. AC + Non-AC Profit
//  16. AC + Non-AC Profit %
//
// All values come from the backend summary (non-ac/combined endpoint) so the
// Inventory page and PDF-to-Admin preview use the exact same calculation logic.
// ─────────────────────────────────────────────────────────────────────────────

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '₹0';
  const v = Number(n);
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '0%';
  return `${Number(n).toFixed(1)}%`;
}

const CARDS = [
  // Stock Position
  { key: 'openingStockValue', label: 'Opening Stock Value', type: 'currency', group: 'stock' },
  { key: 'purchaseValue', label: 'Purchase Value', type: 'currency', group: 'stock' },
  { key: 'consumption', label: 'Consumption', type: 'currency', group: 'stock' },
  { key: 'closingStockValue', label: 'Closing Stock Value', type: 'currency', group: 'stock' },
  // AC
  { key: 'acSales', label: 'AC Sales', type: 'currency', group: 'ac' },
  { key: 'acConsumption', label: 'AC Consumption', type: 'currency', group: 'ac' },
  { key: 'acProfit', label: 'AC Profit', type: 'currency', group: 'ac' },
  { key: 'acProfitPct', label: 'AC Profit %', type: 'percent', group: 'ac' },
  // Non-AC
  { key: 'nonAcSales', label: 'Non-AC Sales', type: 'currency', group: 'nonac' },
  { key: 'nonAcConsumption', label: 'Non-AC Consumption', type: 'currency', group: 'nonac' },
  { key: 'nonAcProfit', label: 'Non-AC Profit', type: 'currency', group: 'nonac' },
  { key: 'nonAcProfitPct', label: 'Non-AC Profit %', type: 'percent', group: 'nonac' },
  // Total
  { key: 'totalSales', label: 'AC + Non-AC Sales', type: 'currency', group: 'total' },
  { key: 'totalConsumption', label: 'AC + Non-AC Consumption', type: 'currency', group: 'total' },
  { key: 'totalProfit', label: 'AC + Non-AC Profit', type: 'currency', group: 'total' },
  { key: 'totalProfitPct', label: 'AC + Non-AC Profit %', type: 'percent', group: 'total' },
];

const GROUP_STYLES = {
  stock: { border: 'border-gray-200', label: 'text-gray-500', value: 'text-gray-900' },
  ac: { border: 'border-blue-200', label: 'text-blue-500', value: 'text-blue-700' },
  nonac: { border: 'border-orange-200', label: 'text-orange-500', value: 'text-orange-700' },
  total: { border: 'border-green-200', label: 'text-green-600', value: 'text-green-700' },
};

export function InventorySummaryCards({ summary }) {
  const s = summary || {};
  return (
    <div className="space-y-3">
      {/* Stock Position */}
      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Stock Position</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CARDS.filter(c => c.group === 'stock').map(card => {
            const style = GROUP_STYLES[card.group];
            const val = s[card.key] || 0;
            return (
              <div key={card.key} className={`bg-white rounded-xl shadow-sm border ${style.border} p-4`}>
                <div className={`text-xs font-medium uppercase tracking-wide ${style.label}`}>{card.label}</div>
                <div className={`text-2xl font-bold mt-1 ${style.value}`}>
                  {card.type === 'currency' ? fmtInr(val) : fmtPct(val)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AC + Non-AC + Total */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* AC */}
        <div>
          <div className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-2">AC (POS)</div>
          <div className="grid grid-cols-2 gap-2">
            {CARDS.filter(c => c.group === 'ac').map(card => {
              const style = GROUP_STYLES[card.group];
              const val = s[card.key] || 0;
              return (
                <div key={card.key} className={`bg-white rounded-xl shadow-sm border ${style.border} p-3`}>
                  <div className={`text-[10px] font-medium uppercase tracking-wide ${style.label}`}>{card.label}</div>
                  <div className={`text-lg font-bold mt-1 ${style.value}`}>
                    {card.type === 'currency' ? fmtInr(val) : fmtPct(val)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Non-AC */}
        <div>
          <div className="text-xs font-bold text-orange-400 uppercase tracking-wide mb-2">Non-AC (Admin)</div>
          <div className="grid grid-cols-2 gap-2">
            {CARDS.filter(c => c.group === 'nonac').map(card => {
              const style = GROUP_STYLES[card.group];
              const val = s[card.key] || 0;
              return (
                <div key={card.key} className={`bg-white rounded-xl shadow-sm border ${style.border} p-3`}>
                  <div className={`text-[10px] font-medium uppercase tracking-wide ${style.label}`}>{card.label}</div>
                  <div className={`text-lg font-bold mt-1 ${style.value}`}>
                    {card.type === 'currency' ? fmtInr(val) : fmtPct(val)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Total */}
        <div>
          <div className="text-xs font-bold text-green-400 uppercase tracking-wide mb-2">AC + Non-AC</div>
          <div className="grid grid-cols-2 gap-2">
            {CARDS.filter(c => c.group === 'total').map(card => {
              const style = GROUP_STYLES[card.group];
              const val = s[card.key] || 0;
              return (
                <div key={card.key} className={`bg-white rounded-xl shadow-sm border ${style.border} p-3`}>
                  <div className={`text-[10px] font-medium uppercase tracking-wide ${style.label}`}>{card.label}</div>
                  <div className={`text-lg font-bold mt-1 ${style.value}`}>
                    {card.type === 'currency' ? fmtInr(val) : fmtPct(val)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
