// ─────────────────────────────────────────────────────────────────────────────
// InventoryTable — shared table (desktop) + card list (mobile)
// ─────────────────────────────────────────────────────────────────────────────
// Columns: Item | Category | Unit | Opening | [Opening Bottles (bar only)] |
//          [Item Sale (bar only)] | Closing | [Closing Bottles (bar only)] |
//          Low Stock | Purchase Rate |
//          Stock Value | Actions [Edit][View]
//
// "Closing" = today's closing stock (from daily snapshot if available,
// otherwise the live currentStock running balance). This lets admins
// verify that today's opening matches yesterday's closing.
//
// Bar inventory shows additional columns:
//   - Opening (Bottles): openingML / bottleSize
//   - Item Sale: actual POS revenue for this item on the selected date
//
// Mobile: renders cards instead of a compressed table.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { updateInventoryItem } from '../../services/barInventoryApi';
import { MOBILE_BREAKPOINT } from './inventoryConstants';

// Normalize an item name to its base product name (without size suffixes).
// Mirrors the backend normalizeProductBaseName() in barMatching.ts.
function normalizeProductBaseName(name) {
  if (!name) return '';
  return String(name).toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*\d+\s*(?:ml|l(?:tr|itre|iter)?|l)\b/gi, ' ')
    .replace(/\s*(full\s+bottle|bottle|tin|can)\s*/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Group bar inventory items by normalized base name and aggregate per-bottle-size stock.
function groupByBrand(items) {
  const groups = new Map();
  for (const item of items) {
    const name = item.menuItem?.name || item.name || '';
    const base = normalizeProductBaseName(name);
    if (!base) continue;
    if (!groups.has(base)) {
      groups.set(base, { brand: base, displayName: name, sizes: {}, totalStock: 0, totalBottles: 0, items: [] });
    }
    const g = groups.get(base);
    const bottleSize = Number(item.bottleSize) || 0;
    const closing = Number(item.todayEntry?.closingStock) || Number(item.currentStock) || 0;
    const sizeKey = `${bottleSize}ml`;
    if (!g.sizes[sizeKey]) {
      g.sizes[sizeKey] = { bottleSize, stockMl: 0, bottles: 0, itemId: item.id };
    }
    g.sizes[sizeKey].stockMl += closing;
    g.sizes[sizeKey].bottles += bottleSize > 0 ? closing / bottleSize : 0;
    g.totalStock += closing;
    g.totalBottles += bottleSize > 0 ? closing / bottleSize : 0;
    g.items.push(item);
    // Use the shortest non-peg name as display name (e.g., "Mansion House 750ml" over "Mansion House 30ml")
    if (name.length < g.displayName.length || /\b(30|60|90)\s*ml/i.test(g.displayName)) {
      g.displayName = name;
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.brand.localeCompare(b.brand));
}

export function InventoryTable({ items, tab, page, totalPages, setPage, onEdit, onView, onRefresh }) {
  const isMobile = useMediaQuery();
  const [groupByBrandMode, setGroupByBrandMode] = useState(false);

  if (isMobile) {
    return <MobileCardList items={items} tab={tab} onEdit={onEdit} onView={onView} page={page} totalPages={totalPages} setPage={setPage} />;
  }

  // Grouped-by-brand view (bar tab only)
  if (tab === 'bar' && groupByBrandMode) {
    const grouped = groupByBrand(items);
    const SIZES = [750, 375, 180];
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Grouped by Brand</h3>
          <button
            onClick={() => setGroupByBrandMode(false)}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold uppercase hover:bg-gray-200 transition-colors"
          >
            Show Individual
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Brand</th>
                {SIZES.map(s => <th key={s} className="text-right px-4 py-3 font-semibold">{s}ml (btl / ml)</th>)}
                <th className="text-right px-4 py-3 font-semibold">Other (btl / ml)</th>
                <th className="text-right px-4 py-3 font-semibold">Total (btl / ml)</th>
                <th className="text-right px-4 py-3 font-semibold">Total Bottles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grouped.length === 0 ? (
                <tr>
                  <td colSpan={SIZES.length + 4} className="text-center py-12 text-gray-400">No items found</td>
                </tr>
              ) : (
                grouped.map((g) => (
                  <tr key={g.brand} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{g.displayName}</td>
                    {SIZES.map(s => {
                      const sz = g.sizes[`${s}ml`];
                      return (
                        <td key={s} className="px-4 py-3 text-right text-gray-600">
                          {sz ? (
                            <>
                              {sz.bottles.toFixed(2)}
                              <span className="text-xs text-gray-400 ml-1">({sz.stockMl.toFixed(0)} ml)</span>
                            </>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {Object.entries(g.sizes).filter(([k]) => !SIZES.includes(parseInt(k))).map(([k, v]) => (
                        <div key={k}>{k}: {v.bottles.toFixed(2)} ({v.stockMl.toFixed(0)} ml)</div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-700">
                      {g.totalBottles.toFixed(2)}
                      <span className="text-xs text-gray-400 ml-1">({g.totalStock.toFixed(0)} ml)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-700">{g.totalBottles.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && <Pagination page={page} totalPages={totalPages} setPage={setPage} />}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {tab === 'bar' && (
        <div className="flex justify-end px-4 py-2 border-b border-gray-100">
          <button
            onClick={() => setGroupByBrandMode(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold uppercase hover:bg-amber-200 transition-colors"
          >
            Group by Brand
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-semibold">Item</th>
              <th className="text-left px-4 py-3 font-semibold">Category</th>
              <th className="text-left px-4 py-3 font-semibold">Unit</th>
              <th className="text-right px-4 py-3 font-semibold">Opening</th>
              {tab === 'bar' && <th className="text-right px-4 py-3 font-semibold">Opening (Bottles)</th>}
              {tab === 'bar' && <th className="text-right px-4 py-3 font-semibold">Item Sale</th>}
              <th className="text-right px-4 py-3 font-semibold">Closing</th>
              {tab === 'bar' && <th className="text-right px-4 py-3 font-semibold">Closing (Bottles)</th>}
              <th className="text-right px-4 py-3 font-semibold">Low Stock</th>
              <th className="text-right px-4 py-3 font-semibold">Purchase Rate</th>
              {tab === 'bar' && <th className="text-right px-4 py-3 font-semibold">Sell Price</th>}
              {tab === 'bar' && <th className="text-center px-4 py-3 font-semibold">Report</th>}
              <th className="text-right px-4 py-3 font-semibold">Stock Value</th>
              <th className="text-center px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={tab === 'bar' ? 16 : 9} className="text-center py-12 text-gray-400">
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
                  ? (Number(item.bottleSize) > 0 ? (remaining / Number(item.bottleSize)) * rate : 0)
                  : remaining * rate;
                const isLow = reorder > 0 && remaining <= reorder;
                // Bottle quantity for bar items: openingML / bottleSize
                const bottleSize = Number(item.bottleSize) || 0;
                const openingBottles = bottleSize > 0 ? opening / bottleSize : 0;
                const closingBottles = bottleSize > 0 ? closing / bottleSize : 0;
                // Item Sale = actual POS revenue for this item on the selected date
                const itemSale = Number(item.itemSale) || 0;

                return (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isLow ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{category || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{unit || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{opening.toFixed(2)}</td>
                    {tab === 'bar' && (
                      <td className="px-4 py-3 text-right text-gray-600">
                        {openingBottles.toFixed(2)}
                        <span className="text-xs text-gray-400 ml-1">btl</span>
                      </td>
                    )}
                    {tab === 'bar' && (
                      <td className="px-4 py-3 text-right text-gray-600">
                        {itemSale > 0 ? `₹${itemSale.toLocaleString('en-IN')}` : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-gray-600">{closing.toFixed(2)}</td>
                    {tab === 'bar' && (
                      <td className="px-4 py-3 text-right text-gray-600">
                        {closingBottles.toFixed(2)}
                        <span className="text-xs text-gray-400 ml-1">btl</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      {reorder > 0 ? (
                        <span className={isLow ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                          {reorder.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{rate > 0 ? `₹${rate.toFixed(2)}` : '—'}</td>
                    {tab === 'bar' && (
                      <td className="px-4 py-3 text-right text-gray-600">
                        {Number(item.acSellingPrice) > 0 ? `₹${Number(item.acSellingPrice).toFixed(2)}` : <span className="text-orange-500 text-xs">not set</span>}
                      </td>
                    )}
                    {tab === 'bar' && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={async () => {
                            try {
                              await updateInventoryItem(item.id, { isHiddenFromReport: !item.isHiddenFromReport });
                              if (onRefresh) onRefresh();
                            } catch (e) { /* ignore */ }
                          }}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            item.isHiddenFromReport
                              ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                          title={item.isHiddenFromReport ? 'Hidden from Liquor PDF Report — click to show' : 'Visible in Liquor PDF Report — click to hide'}
                        >
                          {item.isHiddenFromReport ? 'Hidden' : 'Visible'}
                        </button>
                      </td>
                    )}
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
            ? (Number(item.bottleSize) > 0 ? (remaining / Number(item.bottleSize)) * rate : 0)
            : remaining * rate;
          const isLow = reorder > 0 && remaining <= reorder;
          // Bottle quantity for bar items: openingML / bottleSize
          const bottleSize = Number(item.bottleSize) || 0;
          const openingBottles = bottleSize > 0 ? opening / bottleSize : 0;
          const closingBottles = bottleSize > 0 ? closing / bottleSize : 0;
          const itemSale = Number(item.itemSale) || 0;

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
                <span>Opening: <span className="font-medium text-gray-900">{opening.toFixed(2)}{tab === 'bar' ? ` (${openingBottles.toFixed(2)} btl)` : ''}</span></span>
                <span>Closing: <span className="font-medium text-gray-900">{closing.toFixed(2)}{tab === 'bar' ? ` (${closingBottles.toFixed(2)} btl)` : ''}</span></span>
              </div>
              {tab === 'bar' && itemSale > 0 && (
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Item Sale: <span className="font-medium text-gray-900">₹{itemSale.toLocaleString('en-IN')}</span></span>
                </div>
              )}
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Purchase Rate: {rate > 0 ? `₹${rate.toFixed(2)}` : '—'}</span>
                <span>Value: ₹{stockValue.toFixed(2)}</span>
              </div>
              {tab !== 'bar' && <div className="mb-3" />}
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
