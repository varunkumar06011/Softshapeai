// ─────────────────────────────────────────────────────────────────────────────
// ItemDetailsDrawer — stock summary + recent activity (replaces table clutter)
// ─────────────────────────────────────────────────────────────────────────────
// Shows the authoritative currentStock from the item record (not recalculated).
// Movement breakdown is explanatory — aggregated from the ledger.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { fetchTransactions } from '../../services/barInventoryApi';
import { fetchKitchenLedger } from '../../services/kitchenInventoryApi';
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_COLORS, MOVEMENT_TYPE_SIGN } from './inventoryConstants';

export function ItemDetailsDrawer({ open, item, tab, onClose, onRecordPurchase, onStockAdjustment }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item && open) {
      fetchTransactionsList();
    }
  }, [item, open, tab]);

  const fetchTransactionsList = async () => {
    if (!item) return;
    setLoading(true);
    try {
      if (tab === 'bar') {
        // Bar transactions endpoint returns a bare array
        const data = await fetchTransactions({ itemId: item.id, limit: 20 });
        setTransactions(Array.isArray(data) ? data : []);
      } else {
        // Kitchen ledger endpoint returns { data: [...], hasMore, nextCursor }
        const data = await fetchKitchenLedger({ itemId: item.id, limit: 20 });
        setTransactions(Array.isArray(data) ? data : (data?.data || []));
      }
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  if (!open || !item) return null;

  const itemName = tab === 'bar' ? item.menuItem?.name : item.name;
  const category = tab === 'bar' ? item.menuItem?.category?.name : item.category;
  const currentStock = Number(item.currentStock) || 0;
  const reorderLevel = Number(item.reorderLevel) || 0;
  const unit = tab === 'bar' ? 'ml' : item.unit;
  const rate = tab === 'bar' ? Number(item.costPerBottle) || 0 : Number(item.price) || 0;
  const stockValue = tab === 'bar'
    ? (currentStock / (Number(item.bottleSize) || 750)) * rate
    : currentStock * rate;
  const isLow = reorderLevel > 0 && currentStock <= reorderLevel;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{itemName}</h2>
            {category && <p className="text-sm text-gray-500">{category}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 p-4 border-b border-gray-50">
          <button
            onClick={() => onRecordPurchase?.(item)}
            className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            Record Purchase
          </button>
          <button
            onClick={() => onStockAdjustment?.(item)}
            className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
          >
            Adjust Stock
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Stock Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Current Stock</div>
              <div className={`text-xl font-bold mt-1 ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                {currentStock.toFixed(2)} {unit}
              </div>
              {isLow && <div className="text-xs text-red-500 font-medium">Below reorder level</div>}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Stock Value</div>
              <div className="text-xl font-bold text-gray-900 mt-1">₹{stockValue.toFixed(2)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Reorder Level</div>
              <div className="text-lg font-semibold text-gray-700 mt-1">
                {reorderLevel > 0 ? `${reorderLevel.toFixed(2)} ${unit}` : 'Not set'}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Rate</div>
              <div className="text-lg font-semibold text-gray-700 mt-1">₹{rate.toFixed(2)}</div>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-2">Recent Activity</h3>
            {loading ? (
              <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No recent activity</div>
            ) : (
              <div className="space-y-2">
                {transactions.slice(0, 20).map((tx) => {
                  const type = tx.type || '';
                  const qty = Number(tx.quantityChange) || 0;
                  const label = MOVEMENT_TYPE_LABELS[type] || type;
                  const color = MOVEMENT_TYPE_COLORS[type] || 'text-gray-600';
                  const sign = MOVEMENT_TYPE_SIGN[type] || (qty >= 0 ? '+' : '-');
                  const date = tx.transactionDate || tx.createdAt;
                  return (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                      <div>
                        <div className={`text-sm font-medium ${color}`}>{label}</div>
                        <div className="text-xs text-gray-400">
                          {date ? new Date(date).toLocaleString() : ''}
                          {tx.createdBy && ` · ${tx.createdBy}`}
                        </div>
                      </div>
                      <div className={`text-sm font-semibold ${qty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {sign}{Math.abs(qty).toFixed(2)} {unit}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
