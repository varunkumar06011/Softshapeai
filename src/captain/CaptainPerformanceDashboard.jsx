// ─────────────────────────────────────────────────────────────────────────────
// CaptainPerformanceDashboard — Captain revenue and performance analytics
// ─────────────────────────────────────────────────────────────────────────────
// Displays performance metrics for captains:
//   - Revenue generated per captain (bar chart)
//   - Date range filtering (Today, 7 days, 30 days, Custom)
//   - Total revenue, order count, average bill
//   - Target vs actual comparison
//   - Top performing captains leaderboard
//
// Fetches data from /api/reports/captain endpoint.
// Used by admin and captain to track individual performance.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useEffect } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, TrendingUp, Calendar } from "lucide-react";
import { getCurrentRestaurantId } from "../utils/getCurrentRestaurantId";
import { apiFetch } from "../services/apiConfig";

// Convert Date to ISO date string (YYYY-MM-DD)
function toISODate(d) {
  return d.toISOString().split('T')[0];
}

function getRangeDates(range, customStart, customEnd) {
  if (range === 'Custom') {
    return { startDate: customStart, endDate: customEnd };
  }
  const now = new Date();
  const endDate = toISODate(now);
  if (range === 'Today') {
    return { startDate: endDate, endDate };
  }
  if (range === 'Weekly') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { startDate: toISODate(start), endDate };
  }
  if (range === 'All Time') {
    return { startDate: '1970-01-01', endDate };
  }
  // Monthly
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: toISODate(start), endDate };
}

export default function CaptainPerformanceDashboard() {
  const [range, setRange] = useState("Today");
  const [customStart, setCustomStart] = useState(() => toISODate(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toISODate(new Date()));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const { startDate, endDate } = useMemo(() => getRangeDates(range, customStart, customEnd), [range, customStart, customEnd]);

  useEffect(() => {
    const restaurantId = getCurrentRestaurantId();
    if (!restaurantId) return;
    setLoading(true);
    apiFetch(`/api/reports/captain-performance?restaurantId=${restaurantId}&startDate=${startDate}&endDate=${endDate}`)
      .then(data => setReport(data || null))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const { captains, trends, hasData } = useMemo(() => {
    if (!report || !Array.isArray(report.captains)) {
      return { captains: [], trends: [], hasData: false };
    }
    const captains = report.captains.map(c => ({
      id: c.id,
      name: c.name || c.id,
      initials: String(c.name || c.id).slice(0, 2).toUpperCase(),
      sales: Number(c.sales || 0),
      orders: Number(c.orders || 0),
      topItem: c.highestSellingItem?.name || 'None',
    })).sort((a, b) => b.sales - a.sales);

    const trendMap = {};
    (report.trends || []).forEach(t => {
      const key = t.hour || t.day || t.label;
      if (!key) return;
      trendMap[key] = (trendMap[key] || 0) + Number(t.sales || 0);
    });
    const trends = Object.entries(trendMap).map(([hour, sales]) => ({ hour, sales: Math.max(0, sales) }));

    return { captains, trends, hasData: captains.length > 0 };
  }, [report]);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#FFCDD2] shadow-sm">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center text-[#B71C1C] shrink-0">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-gray-900 tracking-tight truncate">Captain Intelligence</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">Performance &amp; Service Quality</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <div className="flex bg-[#F4F4F5] p-1 rounded-xl overflow-x-auto scrollbar-hide">
            {["Today", "Weekly", "Monthly", "All Time", "Custom"].map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${range === r ? "bg-white text-[#B71C1C] shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
              >
                {r}
              </button>
            ))}
          </div>
          {range === 'Custom' && (
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400" />
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold" />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold" />
            </div>
          )}
        </div>
      </div>

      {/* FIX #8: Show loading state and empty state */}
      {loading ? (
        <div className="bg-white p-12 rounded-2xl border border-[#FFCDD2] shadow-sm flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B71C1C]"></div>
          <p className="mt-4 text-sm font-bold text-gray-400">Loading analytics...</p>
        </div>
      ) : !hasData ? (
        <div className="bg-white p-12 rounded-2xl border border-[#FFCDD2] shadow-sm flex flex-col items-center justify-center">
          <Users size={48} className="text-gray-300 mb-4" />
          <h3 className="font-black text-gray-900 text-lg mb-2">No Captain Data Available</h3>
          <p className="text-sm text-gray-400 text-center max-w-md">
            No captain sales found for the selected time period. Sales will appear here once captains complete orders.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {captains.slice(0, 4).map(c => (
              <div key={c.id} className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm relative overflow-hidden group hover:border-[#B71C1C] transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center text-sm font-black text-[#B71C1C] border-2 border-white shadow-sm">
                    {c.initials}
                  </div>
                  <div>
                    <p className="font-black text-gray-900">{c.name}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Captain</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Sales</span>
                    <span className="text-sm font-black text-gray-900">₹{c.sales.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Orders</span>
                    <span className="text-sm font-black text-gray-900">{c.orders}</span>
                  </div>
                  <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Top Item</span>
                    <span className="text-[10px] font-black text-[#B71C1C] uppercase truncate max-w-[100px]">{c.topItem}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
              <h3 className="font-black text-gray-900 mb-8 flex items-center gap-2">
                <TrendingUp size={18} className="text-[#B71C1C]" />
                Efficiency Trend
              </h3>
              {trends.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center">
                  <p className="text-sm text-gray-400">No trend data available</p>
                </div>
              ) : (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="99%" height="100%">
                    <BarChart data={trends}>
                      <XAxis dataKey="hour" tick={{ fontSize: 10, fontWeight: "bold" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fontWeight: "bold" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="sales" fill="#B71C1C" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
              <h3 className="font-black text-gray-900 mb-6">Captain Leaderboard</h3>
              <div className="space-y-4">
                {captains.map((c, index) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 hover:bg-red-50 transition-colors group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-gray-300 group-hover:text-[#B71C1C] w-4">#{index + 1}</span>
                      <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-[10px] font-black border border-gray-100">
                        {c.initials}
                      </div>
                      <p className="text-xs font-black text-gray-900">{c.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-[#B71C1C]">₹{c.sales.toLocaleString()}</p>
                      <p className="text-[9px] font-bold text-gray-400">{c.orders} orders</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
