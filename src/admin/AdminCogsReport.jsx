import { useState, useEffect, useCallback } from 'react';
import { TrendingDown, Loader2, Calendar, Package } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { getKolkataDateString } from '../shared/utils/dateFormat';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

export default function AdminCogsReport() {
  const today = getKolkataDateString();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('dateFrom', dateFrom);
      params.set('dateTo', dateTo);
      const result = await apiFetch(`/api/cogs?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load COGS report');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totalCogs = data?.totalCogs || 0;
  const itemBreakdown = data?.itemBreakdown || [];

  const sortedItems = [...itemBreakdown].sort((a, b) => b.totalCogsAmount - a.totalCogsAmount);
  const top10 = sortedItems.slice(0, 10);
  const maxCogs = top10.length > 0 ? Math.max(...top10.map((i) => i.totalCogsAmount)) : 0;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown size={22} className="text-[#E53935]" />
        <h1 className="text-lg font-black text-gray-800">COGS Report</h1>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:border-[#E53935]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:border-[#E53935]"
          />
        </div>
        <button
          onClick={loadReport}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#E53935] text-white rounded-lg text-xs font-bold hover:bg-[#D32F2F] transition-colors"
        >
          <Calendar size={14} />
          Apply
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-gray-400" size={28} />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-xs font-bold text-red-500">{error}</div>
      ) : (
        <>
          {/* Summary card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div className="text-center py-3 mb-3 bg-gray-50 rounded">
              <div className="text-[10px] font-bold text-gray-400 mb-1">Total COGS ({dateFrom} to {dateTo})</div>
              <div className="text-3xl font-black text-[#E53935]">{round2(totalCogs).toFixed(2)}</div>
            </div>
            <div className="text-center text-[10px] font-bold text-gray-400">
              {itemBreakdown.length} ingredient{itemBreakdown.length !== 1 ? 's' : ''} consumed in this period
            </div>
          </div>

          {/* Top 10 bar chart */}
          {top10.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <h2 className="text-sm font-black text-gray-800 mb-3">Top 10 Ingredients by Cost</h2>
              <div className="space-y-2">
                {top10.map((item, idx) => {
                  const pct = maxCogs > 0 ? (item.totalCogsAmount / maxCogs) * 100 : 0;
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-32 text-xs font-bold text-gray-600 truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="flex-1 bg-gray-100 rounded h-6 overflow-hidden">
                        <div
                          className="h-full bg-[#E53935] rounded transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-20 text-right text-xs font-bold text-gray-700">
                        {round2(item.totalCogsAmount).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full breakdown table */}
          {sortedItems.length === 0 ? (
            <div className="text-center py-8 text-xs font-bold text-gray-400">
              <Package size={32} className="mx-auto mb-2 text-gray-300" />
              No COGS data for this period.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 bg-gray-50">
                      <th className="text-left py-2 px-3 font-bold">#</th>
                      <th className="text-left py-2 px-3 font-bold">Ingredient</th>
                      <th className="text-left py-2 px-3 font-bold">Unit</th>
                      <th className="text-right py-2 px-3 font-bold">Consumed Qty</th>
                      <th className="text-right py-2 px-3 font-bold">COGS Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold text-gray-700">{item.name}</td>
                        <td className="py-2 px-3 text-gray-500">{item.unit || '—'}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{round2(item.totalConsumedQty).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-800">{round2(item.totalCogsAmount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={4} className="py-2 px-3 text-right font-black text-gray-700">Total</td>
                      <td className="py-2 px-3 text-right font-black text-[#E53935]">{round2(totalCogs).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
