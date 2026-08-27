// ─────────────────────────────────────────────────────────────────────────────
// CombinedBarTable — Bar inventory table with separate AC and Non-AC columns
// ─────────────────────────────────────────────────────────────────────────────
// Columns:
//   Category | Item | Unit | Opening AC | Opening Non-AC |
//   AC Sale | Non-AC Deduction | AC Closing | Non-AC Closing | Total Closing |
//   Purchase Rate | Stock Value | Actions
//
// AC Sale = total sales AMOUNT (₹) from settled/finalized POS bills for the day
// Non-AC Deduction = ADMIN controlled (manual entry)
// Opening AC and Opening Non-AC both shown in bottle quantities
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

export function CombinedBarTable({ items, onNonAcDeduct, onEdit, onView }) {
  const [showNonAcOnly, setShowNonAcOnly] = useState(false);

  const filtered = showNonAcOnly ? items.filter(i => i.hasNonAc) : items;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100">
        <button
          onClick={() => setShowNonAcOnly(false)}
          className={`px-3 py-1 rounded-lg text-xs font-medium ${!showNonAcOnly ? 'bg-[#E53935] text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          All Items
        </button>
        <button
          onClick={() => setShowNonAcOnly(true)}
          className={`px-3 py-1 rounded-lg text-xs font-medium ${showNonAcOnly ? 'bg-[#E53935] text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Non-AC Only
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> AC (system)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Non-AC (admin)</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-3 font-semibold">Category</th>
              <th className="text-left px-3 py-3 font-semibold">Item</th>
              <th className="text-left px-3 py-3 font-semibold">Unit</th>
              <th className="text-right px-3 py-3 font-semibold text-blue-600">Opening AC <span className="text-[9px] font-normal">(btl)</span></th>
              <th className="text-right px-3 py-3 font-semibold text-orange-600">Opening Non-AC <span className="text-[9px] font-normal">(btl)</span></th>
              <th className="text-right px-3 py-3 font-semibold text-blue-600">AC Sale <span className="text-[9px] font-normal">(₹)</span></th>
              <th className="text-right px-3 py-3 font-semibold text-orange-600">Non-AC Deduction</th>
              <th className="text-right px-3 py-3 font-semibold text-blue-600">AC Closing</th>
              <th className="text-right px-3 py-3 font-semibold text-orange-600">Non-AC Closing</th>
              <th className="text-right px-3 py-3 font-semibold">Total Closing</th>
              <th className="text-right px-3 py-3 font-semibold">Purchase Rate</th>
              <th className="text-right px-3 py-3 font-semibold">Stock Value</th>
              <th className="text-center px-3 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-12 text-gray-400">No items found</td>
              </tr>
            ) : (
              filtered.map((item) => {
                const acClosing = Number(item.acClosing) || 0;
                const nonAcClosing = Number(item.nonAcClosing) || 0;
                const bottleSize = Number(item.bottleSize) || 0;
                const acClosingBottles = Number(item.acClosingBottles) || (bottleSize > 0 ? acClosing / bottleSize : 0);
                const openingAcBottles = Number(item.openingAcBottles) || (bottleSize > 0 ? (Number(item.openingAc) || 0) / bottleSize : 0);
                const totalClosingBottles = acClosingBottles + nonAcClosing;
                const acSaleAmount = Number(item.acSaleAmount) || 0;
                const stockValue = item.stockValue || 0;
                const needsConfirm = item.needsConfirmation;

                return (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${needsConfirm ? 'bg-yellow-50/40' : ''}`}>
                    <td className="px-3 py-2 text-gray-600 text-xs">{item.category}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {item.itemName}
                      {needsConfirm && (
                        <span className="ml-1 text-[10px] text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded-full" title={item.notes}>
                          ⚠ Confirm
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{item.unit}</td>
                    {/* Opening AC (bottles) */}
                    <td className="px-3 py-2 text-right text-blue-700 text-xs">
                      {item.hasAc ? openingAcBottles.toFixed(2) : '—'}
                      {item.hasAc && <span className="text-[10px] text-gray-400 ml-1">btl</span>}
                    </td>
                    {/* Opening Non-AC */}
                    <td className="px-3 py-2 text-right text-orange-700 text-xs">
                      {item.hasNonAc ? Number(item.openingNonAc).toFixed(2) : '—'}
                      {item.hasNonAc && <span className="text-[10px] text-gray-400 ml-1">btl</span>}
                    </td>
                    {/* AC Sale (₹ revenue from settled bills) */}
                    <td className="px-3 py-2 text-right text-blue-700 text-xs">
                      {item.hasAc && acSaleAmount > 0 ? (
                        <span>
                          ₹{acSaleAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          <span className="block text-[9px] text-gray-400">SETTLED</span>
                        </span>
                      ) : '—'}
                    </td>
                    {/* Non-AC Deduction */}
                    <td className="px-3 py-2 text-right text-orange-700 text-xs">
                      {item.hasNonAc ? (
                        <span>
                          {Number(item.nonAcDeduction).toFixed(2)}
                          <span className="text-[10px] text-gray-400 ml-1">btl</span>
                          <span className="block text-[9px] text-gray-400">ADMIN</span>
                        </span>
                      ) : '—'}
                    </td>
                    {/* AC Closing (bottles) */}
                    <td className="px-3 py-2 text-right text-blue-700 font-medium text-xs">
                      {item.hasAc ? acClosingBottles.toFixed(2) : '—'}
                      {item.hasAc && <span className="text-[10px] text-gray-400 ml-1">btl</span>}
                    </td>
                    {/* Non-AC Closing */}
                    <td className="px-3 py-2 text-right text-orange-700 font-medium text-xs">
                      {item.hasNonAc ? Number(item.nonAcClosing).toFixed(2) : '—'}
                      {item.hasNonAc && <span className="text-[10px] text-gray-400 ml-1">btl</span>}
                    </td>
                    {/* Total Closing */}
                    <td className="px-3 py-2 text-right font-semibold text-xs">
                      {totalClosingBottles.toFixed(2)}
                      <span className="text-[10px] text-gray-400 ml-1">btl</span>
                    </td>
                    {/* Purchase Rate */}
                    <td className="px-3 py-2 text-right text-gray-600 text-xs">
                      {item.purchaseRate ? `₹${Number(item.purchaseRate).toFixed(0)}` : '—'}
                    </td>
                    {/* Stock Value */}
                    <td className="px-3 py-2 text-right text-gray-700 font-medium text-xs">
                      ₹{Number(stockValue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    {/* Actions */}
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        {item.hasNonAc && (
                          <button
                            onClick={() => onNonAcDeduct(item)}
                            className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 transition-colors"
                            title="Non-AC Deduction"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4M20 12l-6 6m6-6l-6-6" />
                            </svg>
                          </button>
                        )}
                        {item.hasAc && (
                          <button
                            onClick={() => onEdit(item)}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                            title="Edit AC Item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => onView(item)}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                          title="View"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
