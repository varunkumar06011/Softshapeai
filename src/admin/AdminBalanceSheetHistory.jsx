import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Store, Loader2, Lock,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';

function getTodayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function getMonthStart(dateStr) {
  return dateStr.slice(0, 8) + '01';
}

export default function AdminBalanceSheetHistory({ onSelectDate }) {
  const today = getTodayIST();
  const [monthDate, setMonthDate] = useState(today);
  const [outletId, setOutletId] = useState('all');
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outlets, setOutlets] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      setOutlets(raw ? JSON.parse(raw) : []);
    } catch { setOutlets([]); }
  }, []);

  const startDate = getMonthStart(monthDate);
  const endDate = monthDate;

  const loadSheets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('startDate', startDate);
      params.set('endDate', endDate);
      if (outletId !== 'all') params.set('outletId', outletId);
      const data = await apiFetch(`/api/balance-sheet?${params.toString()}`);
      setSheets(data || []);
    } catch (err) {
      console.error('[BalanceSheetHistory] Load failed:', err);
      setSheets([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, outletId]);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  const shiftMonth = (dir) => {
    const d = new Date(monthDate.slice(0, 8) + '15T00:00:00');
    d.setMonth(d.getMonth() + dir);
    setMonthDate(d.toISOString().slice(0, 10));
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  const totalSales = (s) => {
    const ac = Number(s.acBarSaleOverride ?? s.acBarSaleComputed ?? 0);
    const nonAc = Number(s.nonAcBarSaleOverride ?? s.nonAcBarSaleComputed ?? 0);
    const fw = Number(s.familyWingSaleOverride ?? s.familyWingSaleComputed ?? 0);
    const parcel = Number(s.parcelSaleOverride ?? s.parcelSaleComputed ?? 0);
    const swiggy = Number(s.swiggySale ?? 0);
    const zomato = Number(s.zomatoSale ?? 0);
    return ac + nonAc + fw + parcel + swiggy + zomato;
  };

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-black text-gray-800">
            {new Date(monthDate.slice(0, 8) + '15T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {outlets.length > 1 && (
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#E53935]"
            >
              <option value="all">All Outlets</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="animate-spin text-[#E53935]" size={24} />
        </div>
      ) : sheets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          No balance sheets found for this period
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-bold text-gray-600">
                <th className="px-3 py-2">Date</th>
                {outletId === 'all' && <th className="px-3 py-2">Outlet</th>}
                <th className="px-3 py-2 text-right">Total Sales</th>
                <th className="px-3 py-2 text-right">Expenditures</th>
                <th className="px-3 py-2 text-right">Closing Balance</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => onSelectDate?.(s.reportDate)}
                  className="border-t border-gray-100 cursor-pointer hover:bg-[#FFF5F5]"
                >
                  <td className="px-3 py-2 font-bold text-gray-800">{formatDate(s.reportDate)}</td>
                  {outletId === 'all' && <td className="px-3 py-2 text-gray-600">{s.outletName || '—'}</td>}
                  <td className="px-3 py-2 text-right font-bold text-gray-800">{formatCurrency(totalSales(s))}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(s.totalExpenditures)}</td>
                  <td className="px-3 py-2 text-right font-black text-gray-900">{formatCurrency(s.closingBalance)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      s.status === 'LOCKED' ? 'bg-gray-800 text-white' :
                      s.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {s.status === 'LOCKED' && <Lock size={10} />}
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
