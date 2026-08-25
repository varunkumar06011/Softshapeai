import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../services/apiConfig';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle, Search } from 'lucide-react';

export function InventoryReconciliation() {
  const [snapshotDate, setSnapshotDate] = useState('2026-08-24');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('snapshotDate', snapshotDate);
      if (search.trim()) params.set('search', search.trim());
      const result = await apiFetch(`/api/bar/inventory/reconciliation?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load reconciliation');
    } finally {
      setLoading(false);
    }
  }, [snapshotDate, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-800">Inventory Reconciliation</h3>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Physical snapshot vs system stock
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={snapshotDate}
            onChange={(e) => setSnapshotDate(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
          />
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm outline-none focus:border-[#E53935] w-48"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Items</p>
              <p className="text-xl font-black text-gray-900">{data.totalItems}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">With Variance</p>
              <p className="text-xl font-black text-[#E53935]">{data.itemsWithVariance}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Matched</p>
              <p className="text-xl font-black text-green-600">{data.totalItems - data.itemsWithVariance}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Snapshot Date</p>
              <p className="text-sm font-black text-gray-900">{data.snapshotDate}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-black text-[10px] text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Snapshot Opening</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Sold</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Purchased</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Wastage</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Adjusted</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Running Closing</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">System Stock</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.itemId} className={`border-b border-gray-100 hover:bg-gray-50 ${item.hasVariance ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {item.hasVariance ? (
                            <AlertTriangle size={14} className="text-[#E53935] shrink-0" />
                          ) : (
                            <CheckCircle size={14} className="text-green-500 shrink-0" />
                          )}
                          <div>
                            <p className="font-bold text-gray-900">{item.itemName}</p>
                            <p className="text-[10px] text-gray-500">{item.bottleSize}ml bottle</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">{item.snapshotOpening.display}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">{item.postSnapshotSold.display}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">{item.postSnapshotPurchased.display}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">{item.postSnapshotWastage.display}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">{item.postSnapshotAdjusted.display}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold text-gray-900">{item.runningClosing.display}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">{item.systemCurrentStock.display}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${item.hasVariance ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {item.variance.ml > 0 ? '+' : ''}{item.variance.display}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
