// ─────────────────────────────────────────────────────────────────────────────
// CombinedBarTable — Bar inventory table (STOCK → PURCHASE → SALE → CONSUMPTION → PROFIT)
// ─────────────────────────────────────────────────────────────────────────────
// Columns:
//   S.No | Item | Purchase Rate | Opening Stock | Purchases | Total Stock |
//   AC Sale | Non-AC Sale | Closing Stock | Closing Value
//
// Opening Stock  = AC + Non-AC combined (bottles)
// Purchases      = AC received + Non-AC received (bottles)
// Total Stock    = Opening Stock + Purchases
// AC Sale        = POS liquor sales (bottles) — from Vgrand Lounge POS only
// Non-AC Sale    = Admin-entered Non-AC sales (bottles) — NOT from POS
// Closing Stock  = Total Stock − AC Sale − Non-AC Sale (EDITABLE by Admin)
// Closing Value  = Closing Stock × Purchase Rate
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { updateInventoryItem, adjustStock, updateNonAcEntry } from '../../services/barInventoryApi';

function fmtQty(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  const v = Number(n);
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function fmtInr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function CombinedBarTable({ items, onNonAcDeduct, onEdit, onView, onRefresh, date }) {
  const [showNonAcOnly, setShowNonAcOnly] = useState(false);
  const [editingClosing, setEditingClosing] = useState(null); // item.id being edited
  const [closingInput, setClosingInput] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = showNonAcOnly ? items.filter(i => i.hasNonAc) : items;

  const handleStartEdit = (item) => {
    const btlSize = Number(item.bottleSize) || 0;
    const acClosingBtl = Number(item.acClosingBottles) || 0;
    const nonAcClosingBtl = Number(item.nonAcClosing) || 0;
    const currentClosing = acClosingBtl + nonAcClosingBtl;
    setEditingClosing(item.id);
    setClosingInput(String(currentClosing.toFixed(2)));
  };

  const handleSaveClosing = async (item) => {
    const newClosingBtl = Number(closingInput) || 0;
    const btlSize = Number(item.bottleSize) || 0;
    const acClosingBtl = Number(item.acClosingBottles) || 0;
    const nonAcClosingBtl = Number(item.nonAcClosing) || 0;
    const currentClosingBtl = acClosingBtl + nonAcClosingBtl;
    if (Math.abs(newClosingBtl - currentClosingBtl) < 0.01) {
      setEditingClosing(null);
      return;
    }
    setSaving(true);
    try {
      if (item.hasNonAc && item.nonAcItemId) {
        // Non-AC item: update closingBottles via NonAcDailyEntry
        const openingBtl = Number(item.openingNonAc) || 0;
        const receivedBtl = Number(item.nonAcReceived) || 0;
        const saleBtl = Number(item.nonAcDeduction) || 0;
        await updateNonAcEntry({
          itemId: item.nonAcItemId,
          date,
          openingBottles: openingBtl,
          saleBottles: saleBtl,
          closingBottles: newClosingBtl,
          receivedBottles: receivedBtl,
          reason: 'Admin closing stock edit',
        });
      } else if (item.hasAc && item.acItemId) {
        // AC item: adjust stock to match new closing
        const newClosingMl = btlSize > 0 ? newClosingBtl * btlSize : newClosingBtl;
        const currentClosingMl = Number(item.acClosing) || 0;
        const diffMl = newClosingMl - currentClosingMl;
        if (Math.abs(diffMl) > 0.01) {
          await adjustStock({
            itemId: item.acItemId,
            quantityChange: Math.abs(diffMl),
            type: 'ADJUSTMENT',
            notes: `Admin closing stock edit: ${currentClosingBtl.toFixed(2)} → ${newClosingBtl.toFixed(2)} btl`,
            createdBy: 'Admin',
            date,
          });
        }
      }
      setEditingClosing(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      alert('Failed to save closing stock: ' + (e.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

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
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> AC (POS)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Non-AC (Admin)</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <th className="text-center px-2 py-3 font-semibold w-10">S.No</th>
              <th className="text-left px-3 py-3 font-semibold">Item</th>
              <th className="text-right px-3 py-3 font-semibold">Purchase Rate</th>
              <th className="text-right px-3 py-3 font-semibold">Opening Stock</th>
              <th className="text-right px-3 py-3 font-semibold">Purchases</th>
              <th className="text-right px-3 py-3 font-semibold">Total Stock</th>
              <th className="text-right px-3 py-3 font-semibold text-blue-600">AC Sale</th>
              <th className="text-right px-3 py-3 font-semibold text-orange-600">Non-AC Sale</th>
              <th className="text-right px-3 py-3 font-semibold">Closing Stock</th>
              <th className="text-right px-3 py-3 font-semibold">Closing Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-gray-400">No items found</td>
              </tr>
            ) : (
              filtered.map((item, idx) => {
                const btlSize = Number(item.bottleSize) || 0;
                const purchaseRate = Number(item.purchaseRate) || 0;
                // Opening Stock = AC + Non-AC combined (bottles)
                const openingBtl = (Number(item.openingAcBottles) || 0) + (Number(item.openingNonAc) || 0);
                // Purchases = AC received (ml→btl) + Non-AC received (btl)
                const acReceivedBtl = Number(item.acReceivedBottles) || (btlSize > 0 ? (Number(item.acReceived) || 0) / btlSize : 0);
                const purchasesBtl = acReceivedBtl + (Number(item.nonAcReceived) || 0);
                // Total Stock = Opening + Purchases
                const totalStockBtl = openingBtl + purchasesBtl;
                // AC Sale = POS liquor sales (bottles)
                const acSaleBtl = Number(item.acSaleBottles) || (btlSize > 0 ? (Number(item.acSale) || 0) / btlSize : 0);
                // Non-AC Sale = Admin-entered (bottles)
                const nonAcSaleBtl = Number(item.nonAcDeduction) || 0;
                // Closing Stock = Total Stock − AC Sale − Non-AC Sale
                const acClosingBtl = Number(item.acClosingBottles) || 0;
                const nonAcClosingBtl = Number(item.nonAcClosing) || 0;
                const closingBtl = acClosingBtl + nonAcClosingBtl;
                // Closing Value = Closing Stock × Purchase Rate
                const closingValue = closingBtl * purchaseRate;
                const isEditing = editingClosing === item.id;

                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    {/* S.No */}
                    <td className="px-2 py-2 text-center text-gray-500 text-xs">{idx + 1}</td>
                    {/* Item */}
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {item.itemName}
                      {item.needsConfirmation && (
                        <span className="ml-1 text-[10px] text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded-full" title={item.notes}>
                          ⚠ Confirm
                        </span>
                      )}
                    </td>
                    {/* Purchase Rate */}
                    <td className="px-3 py-2 text-right text-gray-600 text-xs">
                      {purchaseRate > 0 ? fmtInr(purchaseRate) : '—'}
                    </td>
                    {/* Opening Stock */}
                    <td className="px-3 py-2 text-right text-gray-700 text-xs">
                      {fmtQty(openingBtl)}
                      <span className="text-[10px] text-gray-400 ml-1">btl</span>
                    </td>
                    {/* Purchases */}
                    <td className="px-3 py-2 text-right text-gray-700 text-xs">
                      {fmtQty(purchasesBtl)}
                      <span className="text-[10px] text-gray-400 ml-1">btl</span>
                    </td>
                    {/* Total Stock */}
                    <td className="px-3 py-2 text-right text-gray-700 font-medium text-xs">
                      {fmtQty(totalStockBtl)}
                      <span className="text-[10px] text-gray-400 ml-1">btl</span>
                    </td>
                    {/* AC Sale (POS) */}
                    <td className="px-3 py-2 text-right text-blue-700 text-xs">
                      {item.hasAc && acSaleBtl > 0 ? (
                        <span>
                          {fmtQty(acSaleBtl)}
                          <span className="text-[10px] text-gray-400 ml-1">btl</span>
                        </span>
                      ) : '—'}
                    </td>
                    {/* Non-AC Sale (Admin) */}
                    <td className="px-3 py-2 text-right text-orange-700 text-xs">
                      {item.hasNonAc && nonAcSaleBtl > 0 ? (
                        <span>
                          {fmtQty(nonAcSaleBtl)}
                          <span className="text-[10px] text-gray-400 ml-1">btl</span>
                        </span>
                      ) : '—'}
                    </td>
                    {/* Closing Stock — EDITABLE */}
                    <td className="px-3 py-2 text-right font-medium text-xs">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={closingInput}
                            onChange={(e) => setClosingInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveClosing(item);
                              if (e.key === 'Escape') setEditingClosing(null);
                            }}
                            className="w-20 text-right text-xs px-1 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            autoFocus
                            disabled={saving}
                          />
                          <button
                            onClick={() => handleSaveClosing(item)}
                            disabled={saving}
                            className="text-green-600 hover:bg-green-50 p-0.5 rounded"
                            title="Save"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setEditingClosing(null)}
                            disabled={saving}
                            className="text-gray-400 hover:bg-gray-100 p-0.5 rounded"
                            title="Cancel"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="text-gray-900 hover:text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors"
                          title="Click to edit closing stock"
                        >
                          {fmtQty(closingBtl)}
                          <span className="text-[10px] text-gray-400 ml-1">btl</span>
                          <svg className="w-3 h-3 inline ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </td>
                    {/* Closing Value */}
                    <td className="px-3 py-2 text-right text-gray-700 font-medium text-xs">
                      {fmtInr(closingValue)}
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
