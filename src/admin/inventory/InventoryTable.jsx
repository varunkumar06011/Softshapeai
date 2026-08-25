// ─────────────────────────────────────────────────────────────────────────────
// InventoryTable — shared table (desktop) + card list (mobile)
// ─────────────────────────────────────────────────────────────────────────────
// Columns: Item | Category | Unit | Opening | Closing | Low Stock | Rate |
//          Stock Value | Actions [Edit][View]
//
// "Closing" = today's closing stock (from daily snapshot if available,
// otherwise the live currentStock running balance). This lets admins
// verify that today's opening matches yesterday's closing.
//
// Mobile: renders cards instead of a compressed table.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { MOBILE_BREAKPOINT } from './inventoryConstants';

export function InventoryTable({ items, tab, page, totalPages, setPage, onEdit, onView }) {
  const isMobile = useMediaQuery();

  if (isMobile) {
    return <MobileCardList items={items} tab={tab} onEdit={onEdit} onView={onView} page={page} totalPages={totalPages} setPage={setPage} />;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-semibold">Item</th>
              <th className="text-left px-4 py-3 font-semibold">Category</th>
              <th className="text-left px-4 py-3 font-semibold">Unit</th>
              <th className="text-right px-4 py-3 font-semibold">Opening</th>
              <th className="text-right px-4 py-3 font-semibold">Closing</th>
              <th className="text-right px-4 py-3 font-semibold">Low Stock</th>
              <th className="text-right px-4 py-3 font-semibold">Rate</th>
              <th className="text-right px-4 py-3 font-semibold">Stock Value</th>
              <th className="text-center px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400">
                  No items found
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const name = tab === 'bar' ? item.menuItem?.name : item.name;
                const category = tab === 'bar' ? item.menuItem?.category?.name : item.category;
                const unit = tab === 'bar' ? 'ml' : item.unit;
                // Opening = yesterday's closing + today's purchases.
                // Kitchen: todayEntry.openingStock already includes purchases (folded in).
                // Bar: todayEntry.openingStock is start-of-day stock, addedStock is
                //      today's purchases — so we add them to match the same model.
                const opening = tab === 'bar'
                  ? (Number(item.todayEntry?.openingStock) || 0) + (Number(item.todayEntry?.addedStock) || 0)
                  : Number(item.todayEntry?.openingStock) || 0;
                // Closing = today's closing stock from snapshot if available,
                // otherwise the live currentStock running balance.
                const closing = Number(item.todayEntry?.closingStock) || Number(item.currentStock) || 0;
                // Internal remaining stock — used for low-stock & value
                const remaining = Number(item.currentStock) || 0;
                const reorder = Number(item.reorderLevel) || 0;
                const rate = tab === 'bar'
                  ? Number(item.costPerBottle) || 0
                  : Number(item.price) || 0;
                const stockValue = tab === 'bar'
                  ? (remaining / (Number(item.bottleSize) || 750)) * rate
                  : remaining * rate;
                const isLow = reorder > 0 && remaining <= reorder;

                return (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isLow ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{category || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{unit || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{opening.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{closing.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {reorder > 0 ? (
                        <span className={isLow ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                          {reorder.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">₹{rate.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">₹{stockValue.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => onEdit(item)}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onView(item)}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          title="View"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} setPage={setPage} />}
    </div>
  );
}

function MobileCardList({ items, tab, onEdit, onView, page, totalPages, setPage }) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
          No items found
        </div>
      ) : (
        items.map((item) => {
          const name = tab === 'bar' ? item.menuItem?.name : item.name;
          const category = tab === 'bar' ? item.menuItem?.category?.name : item.category;
          const unit = tab === 'bar' ? 'ml' : item.unit;
          const opening = tab === 'bar'
            ? (Number(item.todayEntry?.openingStock) || 0) + (Number(item.todayEntry?.addedStock) || 0)
            : Number(item.todayEntry?.openingStock) || 0;
          // Closing = today's closing stock from snapshot if available,
          // otherwise the live currentStock running balance.
          const closing = Number(item.todayEntry?.closingStock) || Number(item.currentStock) || 0;
          // Internal remaining stock — used for low-stock detection and stock value
          const remaining = Number(item.currentStock) || 0;
          const reorder = Number(item.reorderLevel) || 0;
          const rate = tab === 'bar'
            ? Number(item.costPerBottle) || 0
            : Number(item.price) || 0;
          const stockValue = tab === 'bar'
            ? (remaining / (Number(item.bottleSize) || 750)) * rate
            : remaining * rate;
          const isLow = reorder > 0 && remaining <= reorder;

          return (
            <div key={item.id} className={`bg-white rounded-xl shadow-sm border p-4 ${isLow ? 'border-red-200' : 'border-gray-100'}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-gray-900">{name || '—'}</div>
                  <div className="text-xs text-gray-500">{category || '—'} · {unit}</div>
                </div>
                {isLow && (
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                    Low Stock
                  </span>
                )}
              </div>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Opening: <span className="font-medium text-gray-900">{opening.toFixed(2)}</span></span>
                <span>Closing: <span className="font-medium text-gray-900">{closing.toFixed(2)}</span></span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 mb-3">
                <span>Rate: ₹{rate.toFixed(2)}</span>
                <span>Value: ₹{stockValue.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(item)}
                  className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onView(item)}
                  className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  View
                </button>
              </div>
            </div>
          );
        })
      )}
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} setPage={setPage} />}
    </div>
  );
}

function Pagination({ page, totalPages, setPage }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <button
        onClick={() => setPage(Math.max(0, page - 1))}
        disabled={page === 0}
        className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Previous
      </button>
      <span className="text-sm text-gray-500">
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  );
}

// Simple media query hook (inline — no existing hook in the codebase)
function useMediaQuery() {
  const getWidth = () => typeof window !== 'undefined' ? window.innerWidth : 1024;
  const [width, setWidth] = useState(getWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width < MOBILE_BREAKPOINT;
}
