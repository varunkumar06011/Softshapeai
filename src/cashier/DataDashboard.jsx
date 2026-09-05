// ─────────────────────────────────────────────────────────────────────────────
// DataDashboard — Insights panel for the cashier desktop app
// ─────────────────────────────────────────────────────────────────────────────
// Renders 5 widgets above the operational Dashboard tab:
//   1. Summary tiles: Total Sales, Discounts, Expenditure, Final Amount
//      (values are computed in CashierDashboard from completedTransactions +
//      expenditureSummary and passed in as props — same source as the
//      existing dashboard tiles, no duplicate fetching).
//   2. Sales Attribution — last 7 days bar chart (reuses /api/reports/daily-sales
//      that the admin Dashboard uses, so the cashier sees the same numbers).
//   3. Today Specials Sold — list of special items sold today with counts
//      (reuses /api/analytics/today-specials-sold).
//   4. Today Special Captain Leader — ranked captains by specials sold
//      (reuses /api/analytics/today-specials-by-staff).
//   5. Category Breakdown — Food / Liquor / Beverages revenue pie + table
//      (reuses /api/reports/categorywise-sales). Clicking a category opens a
//      popup that lists every item sold in that category with qty + revenue
//      (reuses /api/reports/itemwise-sales?outletType=food|liquor|beverages).
//
// All data refreshes on the `softshape_order_updated` window event (fired by
// CashierDashboard after every settlement) so the panel stays live without
// polling. Falls back gracefully when the cloud backend is unreachable —
// each widget independently shows an "unable to load" state.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, Tag, Receipt, Banknote, TrendingUp, Flame, Users, X, Loader2,
  ChartNoAxesCombined, Package, ArrowUpRight, Crown, Medal, Award, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { edgeAwareJsonFetch } from '../services/edgeHealth';
import { fetchReportDailySales, fetchReportCategorywise, fetchReportItemwise } from '../services/reportsApi';
import { getKolkataDateString, shiftKolkataDate } from '../shared/utils/dateFormat';

const CATEGORY_COLORS = { Food: '#B71C1C', Liquor: '#E53935', Beverages: '#2563EB' };
const FALLBACK_COLOR = '#EF9A9A';
const CATEGORY_TO_OUTLET_TYPE = {
  Food: 'food',
  Liquor: 'liquor',
  Beverages: 'beverages',
};

function inr(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function getLast7DayRange() {
  const today = getKolkataDateString();
  const start = shiftKolkataDate(new Date(), -6);
  return { startDate: start, endDate: today };
}

function Loading({ label }) {
  return (
    <div className="flex items-center justify-center py-10 text-gray-400">
      <Loader2 size={20} className="animate-spin mr-2" />
      <span className="text-xs font-bold uppercase tracking-widest">{label || 'Loading…'}</span>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="flex items-center justify-center py-10 text-gray-400">
      <span className="text-xs font-bold uppercase tracking-widest">{message || 'Unable to load'}</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-10 text-gray-300">
      <span className="text-xs font-bold uppercase tracking-widest">{message || 'No data'}</span>
    </div>
  );
}

// ── Widget 1: Summary tiles ────────────────────────────────────────────────
function SummaryTiles({ totalSales, discounts, expenditure, finalAmount, txnsCount, discountedTxnsCount, expendituresCount, dateLabel }) {
  const stats = [
    { label: 'Total Sales', value: inr(totalSales), sub: `${txnsCount} txns ${dateLabel}`, icon: Wallet, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Discounts', value: inr(discounts), sub: `${discountedTxnsCount} discounted`, icon: Tag, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Expenditures', value: inr(expenditure), sub: `${expendituresCount} expenditures`, icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Final Amount', value: inr(finalAmount), sub: 'Sales − Expenditures', icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 ${s.bg} ${s.color} rounded-2xl flex items-center justify-center shrink-0 shadow-inner`}>
            <s.icon size={24} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
            <p className={`text-xl sm:text-2xl font-black font-mono ${s.color} leading-none mt-1`}>{s.value}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-1 truncate">{s.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Widget 2: Sales Attribution — last 7 days ──────────────────────────────
function SalesAttributionChart({ outletId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const genRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = getLast7DayRange();
      const res = await fetchReportDailySales(startDate, endDate, outletId || 'all');
      if (gen !== genRef.current) return;
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dailyData = days.map((d) => ({ day: d, revenue: 0, date: null }));
      (res.byDay || []).forEach((day) => {
        const dayDate = new Date(day.date);
        const dayIdx = dayDate.getDay();
        dailyData[dayIdx].revenue += Number(day.revenue || 0);
        dailyData[dayIdx].date = day.date;
      });
      const chartData = order.map((dayName) => {
        const dayIdx = days.indexOf(dayName);
        return { d: dayName, v: Math.round(dailyData[dayIdx].revenue), date: dailyData[dayIdx].date };
      });
      setData(chartData);
    } catch (err) {
      if (gen !== genRef.current) return;
      setError(err.message || 'Failed to load');
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('softshape_order_updated', handler);
    return () => window.removeEventListener('softshape_order_updated', handler);
  }, [load]);

  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
      <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
        <ChartNoAxesCombined size={16} className="text-[#1E3A8A]" />
        Sales Attribution — Last 7 days
      </h3>
      {loading ? (
        <Loading label="Loading sales…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.every((d) => d.v === 0) ? (
        <EmptyState message="No sales in the last 7 days" />
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="99%" height="100%" minWidth={0} minHeight={0} debounce={150}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ddBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1E3A8A" stopOpacity={1} />
                  <stop offset="100%" stopColor="#1E3A8A" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: '#E0E7FF' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                formatter={(v) => [inr(v), 'Revenue']}
                labelFormatter={(l, payload) => payload?.[0]?.payload?.date || l}
              />
              <Bar dataKey="v" fill="url(#ddBarGrad)" radius={[6, 6, 0, 0]} barSize={32} isAnimationActive animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Widget 3: Today Specials Sold ──────────────────────────────────────────
function TodaySpecialsSold({ outletId, date }) {
  const [specials, setSpecials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const genRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletId && outletId !== 'all') params.set('outletId', outletId);
      params.set('startDate', date);
      params.set('endDate', date);
      const qsStr = params.toString();
      const data = await edgeAwareJsonFetch(
        `/api/edge/analytics/today-specials-sold?${qsStr}`,
        `/api/analytics/today-specials-sold?${qsStr}`,
      );
      if (gen !== genRef.current) return;
      setSpecials(data.specials || []);
    } catch (err) {
      if (gen !== genRef.current) return;
      setError(err.message || 'Failed to load');
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [outletId, date]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('softshape_order_updated', handler);
    return () => window.removeEventListener('softshape_order_updated', handler);
  }, [load]);

  const totalSold = specials.reduce((s, x) => s + Number(x.soldCount || 0), 0);

  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
      <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
        <Flame size={16} className="text-[#F59E0B]" />
        Today Specials Sold
        <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">{totalSold} total</span>
      </h3>
      {loading ? (
        <Loading label="Loading specials…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : specials.length === 0 ? (
        <EmptyState message="No specials sold today" />
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar">
          {[...specials]
            .sort((a, b) => Number(b.soldCount) - Number(a.soldCount))
            .map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 bg-amber-50/60 border border-amber-100 rounded-xl px-3 py-2.5">
                <div className="min-w-0 flex items-center gap-2">
                  <Flame size={14} className="text-amber-500 shrink-0" />
                  <span className="text-sm font-bold text-gray-800 truncate">{s.name}</span>
                  {s.specialChannel && (
                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                      {s.specialChannel}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-lg font-black text-amber-700 tabular-nums">{s.soldCount}</span>
                  <span className="text-[10px] font-bold text-amber-500 uppercase">sold</span>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Widget 4: Today Special Captain Leader ─────────────────────────────────
function CaptainLeader({ outletId, date }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const genRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletId && outletId !== 'all') params.set('outletId', outletId);
      params.set('startDate', date);
      params.set('endDate', date);
      const qsStr = params.toString();
      const data = await edgeAwareJsonFetch(
        `/api/edge/analytics/today-specials-by-staff?${qsStr}`,
        `/api/analytics/today-specials-by-staff?${qsStr}`,
      );
      if (gen !== genRef.current) return;
      // Show only captains who actually sold at least one special today — keeps the
      // cashier leaderboard focused on the day's competition rather than every
      // zero-sale captain (the admin view shows the full roster).
      // Backend now returns role; filter to CAPTAIN-only as a safety net.
      setStaff((data.staff || []).filter((s) => s.role === 'CAPTAIN' && Number(s.soldCount) > 0));
    } catch (err) {
      if (gen !== genRef.current) return;
      setError(err.message || 'Failed to load');
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [outletId, date]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('softshape_order_updated', handler);
    return () => window.removeEventListener('softshape_order_updated', handler);
  }, [load]);

  const rankIcon = (idx) => {
    if (idx === 0) return <Crown size={14} className="text-amber-500" />;
    if (idx === 1) return <Medal size={14} className="text-gray-500" />;
    if (idx === 2) return <Award size={14} className="text-orange-500" />;
    return null;
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
      <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
        <Users size={16} className="text-[#1E3A8A]" />
        Today Special Captain Leader
      </h3>
      {loading ? (
        <Loading label="Loading leaderboard…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : staff.length === 0 ? (
        <EmptyState message="No special sales by captains today" />
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar">
          {staff.map((s, idx) => (
            <div
              key={s.userId}
              className={`rounded-xl border overflow-hidden ${
                idx === 0 ? 'bg-amber-50 border-amber-200' :
                idx === 1 ? 'bg-gray-50 border-gray-200' :
                idx === 2 ? 'bg-orange-50 border-orange-200' :
                'bg-gray-50 border-transparent'
              }`}
            >
              <div
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-opacity-80 transition-colors"
                onClick={() => setExpanded(expanded === s.userId ? null : s.userId)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shrink-0 ${
                    idx === 0 ? 'bg-amber-500 text-white' :
                    idx === 1 ? 'bg-gray-500 text-white' :
                    idx === 2 ? 'bg-orange-500 text-white' :
                    'bg-white border border-gray-200 text-gray-700'
                  }`}>
                    {idx + 1}
                  </span>
                  {rankIcon(idx)}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-gray-900 truncate">{s.name || s.userId}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {s.revenue > 0 ? inr(Math.round(s.revenue)) : 'No revenue'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="text-right">
                    <span className="text-sm font-black text-[#1E3A8A]">{s.soldCount}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase ml-1">sold</span>
                  </div>
                  <span className="text-gray-400 text-xs">{expanded === s.userId ? '▲' : '▼'}</span>
                </div>
              </div>
              {expanded === s.userId && (
                <div className="px-3 pb-2.5 pt-1 space-y-1 border-t border-gray-200/50">
                  {s.items && s.items.length > 0 ? (
                    s.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] py-1">
                        <span className="font-bold text-gray-700 truncate pr-2">{it.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-black text-[#1E3A8A]">{it.soldCount}x</span>
                          {it.revenue > 0 && <span className="font-bold text-gray-400">{inr(Math.round(it.revenue))}</span>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-2 text-center">
                      <span className="text-[11px] font-bold text-gray-400">No specials sold</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Widget 5: Category Breakdown + item drill-in popup ─────────────────────
function CategoryBreakdown({ outletId, date }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [drillItems, setDrillItems] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState(null);
  const genRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchReportCategorywise(date, date, outletId || 'all');
      if (gen !== genRef.current) return;
      setData(res);
    } catch (err) {
      if (gen !== genRef.current) return;
      setError(err.message || 'Failed to load');
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [outletId, date]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('softshape_order_updated', handler);
    return () => window.removeEventListener('softshape_order_updated', handler);
  }, [load]);

  const openCategory = useCallback(async (catName) => {
    const outletType = CATEGORY_TO_OUTLET_TYPE[catName];
    if (!outletType) return;
    setSelectedCategory(catName);
    setDrillItems([]);
    setDrillError(null);
    setDrillLoading(true);
    try {
      const res = await fetchReportItemwise(date, date, outletType, outletId || 'all');
      // Filter to the chosen report category (itemwise endpoint with outletType
      // already filters server-side, but Beverages normalization can leak other
      // types when outletType is 'all' — guard client-side too).
      const items = (res.items || []).filter((it) => it.reportCategory === catName);
      setDrillItems(items);
    } catch (err) {
      setDrillError(err.message || 'Failed to load items');
    } finally {
      setDrillLoading(false);
    }
  }, [date, outletId]);

  const closeCategory = () => setSelectedCategory(null);

  const categories = data?.categories || [];
  const totalRevenue = data?.summary?.totalRevenue || 0;

  const pieData = categories.map((c) => ({ name: c.name, value: c.totalRevenue }));
  const colors = pieData.map((c) => CATEGORY_COLORS[c.name] || FALLBACK_COLOR);

  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
      <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
        <Package size={16} className="text-[#1E3A8A]" />
        Category Breakdown
        <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">{inr(totalRevenue)} total</span>
      </h3>
      {loading ? (
        <Loading label="Loading categories…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : categories.length === 0 ? (
        <EmptyState message="No sales today" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={150}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  stroke="none"
                  isAnimationActive
                  animationDuration={800}
                >
                  {pieData.map((_e, i) => <Cell key={i} fill={colors[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => [inr(v), 'Revenue']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Category</th>
                  <th className="px-2 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Items</th>
                  <th className="px-2 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Qty</th>
                  <th className="px-2 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Revenue</th>
                  <th className="px-2 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">%</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr
                    key={c.name}
                    onClick={() => openCategory(c.name)}
                    className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer transition-colors"
                    title={`Click to view all ${c.name} items sold`}
                  >
                    <td className="px-2 py-2.5 font-bold text-gray-900 flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: CATEGORY_COLORS[c.name] || FALLBACK_COLOR }}
                      />
                      {c.name}
                      <ArrowUpRight size={12} className="text-gray-300" />
                    </td>
                    <td className="px-2 py-2.5 text-right text-gray-700">{c.itemCount}</td>
                    <td className="px-2 py-2.5 text-right text-gray-700">{c.totalQuantity}</td>
                    <td className="px-2 py-2.5 text-right font-bold text-gray-900">{inr(c.totalRevenue)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="w-16 h-2 bg-gray-100 rounded-full ml-auto overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(c.revenuePercent, 100)}%`,
                            background: CATEGORY_COLORS[c.name] || FALLBACK_COLOR,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 font-bold">{c.revenuePercent}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 font-bold mt-2">Click a category to see item-wise sales</p>
          </div>
        </div>
      )}

      {/* Item drill-in popup */}
      <AnimatePresence>
        {selectedCategory && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCategory}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-800 flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ background: CATEGORY_COLORS[selectedCategory] || FALLBACK_COLOR }}
                  />
                  {selectedCategory} — Item-wise Sales
                  <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">({date})</span>
                </h3>
                <button
                  onClick={closeCategory}
                  className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto custom-scrollbar flex-grow">
                {drillLoading ? (
                  <Loading label="Loading items…" />
                ) : drillError ? (
                  <ErrorState message={drillError} />
                ) : drillItems.length === 0 ? (
                  <EmptyState message={`No ${selectedCategory} items sold`} />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Item</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Qty Sold</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Unit Price</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Revenue</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillItems.map((it) => (
                        <tr key={it.id || it.name} className="border-b border-gray-100 hover:bg-blue-50/40">
                          <td className="px-4 py-3 font-bold text-gray-900">{it.name}</td>
                          <td className="px-4 py-3 text-right font-black text-[#1E3A8A]">{it.quantitySold}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{inr(it.unitPrice)}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">{inr(it.totalRevenue)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{it.orderCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-black">
                        <td className="px-4 py-3 text-gray-800">Total</td>
                        <td className="px-4 py-3 text-right text-gray-800">
                          {drillItems.reduce((s, it) => s + Number(it.quantitySold || 0), 0)}
                        </td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right text-gray-900">
                          {inr(drillItems.reduce((s, it) => s + Number(it.totalRevenue || 0), 0))}
                        </td>
                        <td className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DataDashboard({
  totalSales = 0,
  discounts = 0,
  expenditure = 0,
  finalAmount = 0,
  txnsCount = 0,
  discountedTxnsCount = 0,
  expendituresCount = 0,
  date = null,
  outletId = 'all',
  onDateChange,
}) {
  // Local date state mirrors the parent prop but lets the cashier change the
  // date directly from this panel. When onDateChange is provided, the parent's
  // dashboardDate / completedTransactions / expenditureSummary also update so
  // the summary tiles stay in sync with the selected date.
  const [localDate, setLocalDate] = useState(date || null);
  useEffect(() => { setLocalDate(date || null); }, [date]);

  const handleDateChange = useCallback((newDate) => {
    setLocalDate(newDate);
    if (onDateChange) onDateChange(newDate);
  }, [onDateChange]);

  const dateLabel = localDate ? `(${localDate})` : '(Today)';
  const today = localDate || getKolkataDateString();

  return (
    <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar bg-gray-50">
      {/* Header with date toggle */}
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 flex-wrap">
        <TrendingUp size={18} className="text-[#1E3A8A]" />
        <span className="text-sm font-black text-gray-700 uppercase tracking-widest">Data Dashboard</span>
        <div className="ml-auto flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <span className="text-xs font-bold text-gray-500 hidden sm:inline">
            {localDate ? localDate : "Today"}
          </span>
          <input
            type="date"
            value={localDate || ''}
            onChange={(e) => handleDateChange(e.target.value || null)}
            className="text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#1E3A8A]"
          />
          {localDate && (
            <button
              onClick={() => handleDateChange(null)}
              className="text-sm font-bold text-[#1E3A8A] hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Widget 1: Summary tiles */}
      <SummaryTiles
        totalSales={totalSales}
        discounts={discounts}
        expenditure={expenditure}
        finalAmount={finalAmount}
        txnsCount={txnsCount}
        discountedTxnsCount={discountedTxnsCount}
        expendituresCount={expendituresCount}
        dateLabel={dateLabel}
      />

      {/* Widget 2: Sales Attribution — full width */}
      <SalesAttributionChart outletId={outletId} />

      {/* Widgets 3 & 4: side-by-side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TodaySpecialsSold outletId={outletId} date={today} />
        <CaptainLeader outletId={outletId} date={today} />
      </div>

      {/* Widget 5: Category Breakdown — full width */}
      <CategoryBreakdown outletId={outletId} date={today} />
    </div>
  );
}
