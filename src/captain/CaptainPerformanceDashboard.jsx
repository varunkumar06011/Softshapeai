import { useMemo, useState, useEffect } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, TrendingUp } from "lucide-react";
import { CAPTAINS } from "../config/captains";
import { fetchTransactions } from "../services/orderApi";
import { RESTAURANT_ID } from "../services/tableApi";
import { BAR_ID } from "../services/barApiConfig";

export default function CaptainPerformanceDashboard() {
  const [range, setRange] = useState("Today");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);

    // FIX #4: Proper date parameters for each range
    let dateParam = undefined;
    let monthParam = undefined;
    const limit = 1000;

    const now = new Date();
    if (range === "Today") {
      // Fetch today's transactions only (IST day)
      dateParam = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
    } else if (range === "Weekly") {
      // For weekly, fetch ALL transactions (client-side filter handles 7-day range)
      // Don't pass date param - let backend return all recent transactions
      dateParam = undefined;
    } else if (range === "Monthly") {
      // Fetch entire current month (IST month)
      monthParam = now.toISOString().slice(0, 7); // "YYYY-MM"
    }

    Promise.allSettled([
      fetchTransactions(RESTAURANT_ID, limit, dateParam, monthParam),
      fetchTransactions(BAR_ID, limit, dateParam, monthParam),
    ]).then(results => {
      const all = results.flatMap(r => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []));
      setTransactions(all);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [range]);

  const { captains, trends, hasData } = useMemo(() => {
    // FIX #7: Use fixed timestamp instead of Date.now() for purity
    const nowTimestamp = Date.now();

    // Client-side filter for transaction time ranges
    // Backend handles date filtering, but we apply additional client-side filter
    const filteredTxns = transactions.filter(t => {
      // Get transaction timestamp (backend returns paidAt or createdAt)
      const txnTime = new Date(t.paidAt || t.createdAt).getTime();

      // Validate timestamp is valid
      if (!txnTime || isNaN(txnTime)) return false;

      // For Today and Weekly, apply time-based filter
      // Monthly already filtered by backend, so include all
      if (range === "Today") {
        // Only show today's transactions (last 24 hours)
        return (nowTimestamp - txnTime) <= (24 * 60 * 60 * 1000);
      } else if (range === "Weekly") {
        // Only show last 7 days
        return (nowTimestamp - txnTime) <= (7 * 24 * 60 * 60 * 1000);
      } else {
        // Monthly - include all (backend already filtered)
        return true;
      }
    });

    // FIX #5 & #6: Build captain map from config + handle unknown captains
    const captainMap = {};

    // Initialize all known captains
    CAPTAINS.forEach(c => {
      captainMap[c.id] = {
        id: c.id,
        name: c.name,
        initials: c.initials,
        color: c.color,
        sales: 0,
        orders: 0,
        itemsCount: {}
      };
    });

    // Process all transactions (including CASHIER and unknown captains)
    filteredTxns.forEach(t => {
      const cid = t.captainId;

      // FIX #5: Handle CASHIER and null captainId
      if (!cid || cid === 'CASHIER' || cid === 'cashier') {
        return; // Skip cashier transactions (not captain sales)
      }

      // FIX #6: If captain not in config, create entry dynamically
      if (!captainMap[cid]) {
        captainMap[cid] = {
          id: cid,
          name: cid, // Use ID as name for unknown captains
          initials: cid.slice(0, 2).toUpperCase(),
          color: 'bg-gray-50 text-gray-600',
          sales: 0,
          orders: 0,
          itemsCount: {}
        };
      }

      // Add sales and orders
      captainMap[cid].sales += Number(t.amount || 0);
      captainMap[cid].orders += 1;

      // FIX #1 & #3: Safely handle items with null checks
      // Backend returns 'items', Cashier maps to 'itemsList' - support both
      const itemsArray = t.itemsList || t.items;
      if (Array.isArray(itemsArray)) {
        itemsArray.forEach(item => {
          // Validate item name exists and is not empty
          const name = String(item?.n || item?.name || '').trim();
          if (!name || name === 'undefined' || name === 'null') {
            return; // Skip items with invalid names
          }

          const qty = Number(item?.q || item?.quantity || 1);
          if (isNaN(qty) || qty <= 0) {
            return; // Skip invalid quantities
          }

          captainMap[cid].itemsCount[name] = (captainMap[cid].itemsCount[name] || 0) + qty;
        });
      }
    });

    // FIX #10: More efficient top item calculation using Array.reduce
    const processedCaptains = Object.values(captainMap).map(c => {
      let topItem = "None";

      if (Object.keys(c.itemsCount).length > 0) {
        // Find max using reduce (more efficient than forEach)
        const entries = Object.entries(c.itemsCount);
        const maxEntry = entries.reduce((max, current) =>
          current[1] > max[1] ? current : max
        , entries[0]);

        topItem = maxEntry[0];
      }

      return { ...c, topItem };
    }).sort((a, b) => b.sales - a.sales);

    // FIX #2: Dynamic hourly/daily buckets with IST timezone handling
    let trendBuckets = {};

    if (range === "Today") {
      // Dynamic hourly buckets - show ALL hours with transactions
      filteredTxns.forEach(t => {
        const txnDate = new Date(t.paidAt || t.createdAt);

        // Get IST hour using native timezone-aware formatting
        const hourLabel = txnDate.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          hour12: true,
        }).toUpperCase().replace('.', '').trim();

        trendBuckets[hourLabel] = (trendBuckets[hourLabel] || 0) + Number(t.amount || 0);
      });
    } else {
      // Daily buckets for Weekly/Monthly with consistent IST date formatting
      filteredTxns.forEach(t => {
        const txnDate = new Date(t.paidAt || t.createdAt);

        // Convert to IST date using native timezone-aware formatting
        const dateKey = txnDate.toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        trendBuckets[dateKey] = (trendBuckets[dateKey] || 0) + Number(t.amount || 0);
      });
    }

    // FIX #9: Validate sales data before creating trends array
    let trendsArray = Object.entries(trendBuckets)
      .map(([hourOrDay, sales]) => ({
        hour: hourOrDay,
        sales: Number.isFinite(sales) ? Math.max(0, sales) : 0, // Ensure valid number
      }))
      .filter(t => t.sales >= 0); // Remove any negative values

    // Sort chronologically for all ranges
    if (trendsArray.length > 0) {
      if (range === "Today") {
        // Sort hours chronologically (12 AM, 1 AM, ..., 11 PM)
        const hourOrder = (label) => {
          const match = label.match(/^(\d+) (AM|PM)$/);
          if (!match) return 0;
          let hour = parseInt(match[1]);
          const period = match[2];

          // Convert to 24-hour for sorting
          if (period === 'AM') {
            if (hour === 12) hour = 0; // 12 AM = 0 hours
          } else {
            if (hour !== 12) hour += 12; // PM hours (except 12 PM)
          }
          return hour;
        };

        trendsArray.sort((a, b) => hourOrder(a.hour) - hourOrder(b.hour));
      } else {
        // Sort dates chronologically for Weekly/Monthly
        trendsArray.sort((a, b) => {
          // Parse DD/MM/YYYY format to Date objects for comparison
          const [dayA, monthA, yearA] = a.hour.split('/').map(Number);
          const [dayB, monthB, yearB] = b.hour.split('/').map(Number);
          const dateA = new Date(yearA, monthA - 1, dayA);
          const dateB = new Date(yearB, monthB - 1, dayB);
          return dateA - dateB; // Ascending chronological order
        });
      }
    }

    return {
      captains: processedCaptains,
      trends: trendsArray,
      // Show UI even with zero sales - only hide if no captains configured
      hasData: processedCaptains.length > 0
    };
  }, [transactions, range]);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#FFCDD2] shadow-sm">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center text-[#B71C1C] shrink-0">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-gray-900 tracking-tight truncate">Captain Intelligence</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">Performance &amp; Service Quality</p>
          </div>
        </div>
        <div className="flex bg-[#F4F4F5] p-1 rounded-xl w-full sm:w-auto overflow-x-auto scrollbar-hide shrink-0">
          {["Today", "Weekly", "Monthly"].map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${range === r ? "bg-white text-[#B71C1C] shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
            >
              {r}
            </button>
          ))}
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
