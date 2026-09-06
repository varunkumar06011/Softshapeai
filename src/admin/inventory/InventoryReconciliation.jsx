import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../services/apiConfig';
import { setItemStock } from '../../services/barInventoryApi';
import { getKolkataDateString } from '../../shared/utils/dateFormat';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle, Search } from 'lucide-react';

function fmtMl(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function InventoryReconciliation() {
  const [snapshotDate, setSnapshotDate] = useState(getKolkataDateString());
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Pending physical counts: { itemId: ml }
  const [physicalEdits, setPhysicalEdits] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('date', snapshotDate);
      const result = await apiFetch(`/api/bar/inventory/reconciliation?${params.toString()}`);
      setData(result);
      setPhysicalEdits({});
    } catch (err) {
      setError(err.message || 'Failed to load reconciliation');
    } finally {
      setLoading(false);
    }
  }, [snapshotDate]);

  useEffect(() => { load(); }, [load]);

  const handlePhysicalEdit = (itemId, value) => {
    setPhysicalEdits((prev) => {
      const next = { ...prev };
      const item = data?.items?.find((i) => i.itemId === itemId);
      const current = item?.physicalClosingMl;
      if (value === '' || Math.round(Number(value) * 100) / 100 === Math.round(Number(current) * 100) / 100) {
        delete next[itemId];
      } else {
        next[itemId] = Number(value);
      }
      return next;
    });
  };

  const handleSaveCounts = async () => {
    const entries = Object.entries(physicalEdits);
    if (entries.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const [itemId, ml] of entries) {
        if (!(Number(ml) >= 0)) continue;
        await setItemStock(itemId, Number(ml), { date: snapshotDate, notes: 'Physical count (reconciliation)' });
      }
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save physical counts');
    } finally {
      setSaving(false);
    }
  };

  const items = (data?.items || []).filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (item.name || '').toLowerCase().includes(q) || (item.brand || '').toLowerCase().includes(q);
  });
  const withVariance = items.filter((i) => i.varianceMl != null && Number(i.varianceMl) !== 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-800">Inventory Reconciliation</h3>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Physical count vs system closing
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
          {Object.keys(physicalEdits).length > 0 && (
            <button
              onClick={handleSaveCounts}
              disabled={saving}
              className="rounded-lg bg-[#E53935] px-3 py-2 text-sm font-bold text-white hover:bg-[#B71C1C] disabled:opacity-50"
            >
              {saving ? 'Saving...' : `Save ${Object.keys(physicalEdits).length} Count${Object.keys(physicalEdits).length > 1 ? 's' : ''}`}
            </button>
          )}
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
              <p className="text-xl font-black text-gray-900">{items.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">With Variance</p>
              <p className="text-xl font-black text-[#E53935]">{withVariance}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Missing Physical Count</p>
              <p className="text-xl font-black text-amber-600">{data.missingPhysicalCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</p>
              <p className="text-sm font-black text-gray-900">{data.date}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-black text-[10px] text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">System Closing (ml)</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Physical Closing (ml)</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Variance (ml)</th>
                    <th className="px-3 py-2 text-right font-black text-[10px] text-gray-500 uppercase tracking-wider">Variance %</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const hasVariance = item.varianceMl != null && Number(item.varianceMl) !== 0;
                    const physVal = physicalEdits[item.itemId] !== undefined
                      ? physicalEdits[item.itemId]
                      : (item.physicalClosingMl ?? '');
                    return (
                      <tr key={item.itemId} className={`border-b border-gray-100 hover:bg-gray-50 ${hasVariance ? 'bg-red-50/30' : ''}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {item.hasPhysicalCount ? (
                              hasVariance
                                ? <AlertTriangle size={14} className="text-[#E53935] shrink-0" />
                                : <CheckCircle size={14} className="text-green-500 shrink-0" />
                            ) : (
                              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                            )}
                            <div>
                              <p className="font-bold text-gray-900">{item.name}</p>
                              <p className="text-[10px] text-gray-500">{item.brand} · {item.bottleSizeMl}ml bottle</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">{fmtMl(item.systemClosingMl)}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            value={physVal}
                            onChange={(e) => handlePhysicalEdit(item.itemId, e.target.value)}
                            placeholder="—"
                            className={`w-24 px-2 py-1 text-right rounded border font-mono text-xs ${physicalEdits[item.itemId] !== undefined ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${hasVariance ? 'bg-red-100 text-red-700' : item.hasPhysicalCount ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                            {item.varianceMl != null ? `${Number(item.varianceMl) > 0 ? '+' : ''}${fmtMl(item.varianceMl)}` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                          {item.variancePercent != null ? `${Number(item.variancePercent).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">No records for this date.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
