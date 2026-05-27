import React, { useMemo, useState, useEffect } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, TrendingUp } from "lucide-react";
import { CAPTAINS } from "../config/captains";
import { fetchTransactions } from "../services/orderApi";
import { RESTAURANT_ID } from "../services/tableApi";
import { BAR_ID } from "../services/barApiConfig";

export default function CaptainPerformanceDashboard() {
  const [range, setRange] = useState("Today");
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const date = range === "Today" ? new Date().toISOString().slice(0, 10) : undefined;
    const limit = 1000;
    Promise.allSettled([
      fetchTransactions(RESTAURANT_ID, limit, date),
      fetchTransactions(BAR_ID, limit, date),
    ]).then(results => {
      const all = results.flatMap(r => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []));
      setTransactions(all);
    });
  }, [range]);

  const { captains, trends } = useMemo(() => {
    const now = Date.now();
    let filterMs = Infinity; // Default to "All Time" - show all transactions
    if (range === "Today") filterMs = 24 * 60 * 60 * 1000;
    else if (range === "Weekly") filterMs = 7 * 24 * 60 * 60 * 1000;
    else if (range === "Monthly") filterMs = 30 * 24 * 60 * 60 * 1000;

    const filteredTxns = transactions.filter(t => (now - (new Date(t.createdAt || t.timestamp || now).getTime())) <= filterMs);

    const captainMap = {};
    CAPTAINS.forEach(c => {
      captainMap[c.id] = { id: c.id, name: c.name, initials: c.initials, color: c.color, sales: 0, orders: 0, itemsCount: {} };
    });

    filteredTxns.forEach(t => {
      const cid = t.captainId;
      if (cid && captainMap[cid]) {
        captainMap[cid].sales += Number(t.amount || 0);
        captainMap[cid].orders += 1;

        if (t.itemsList) {
          t.itemsList.forEach(item => {
            const name = item.n;
            const qty = item.q || 1;
            captainMap[cid].itemsCount[name] = (captainMap[cid].itemsCount[name] || 0) + qty;
          });
        }
      }
    });

    const processedCaptains = Object.values(captainMap).map(c => {
      let topItem = "None";
      let maxQty = 0;
      Object.entries(c.itemsCount).forEach(([name, qty]) => {
        if (qty > maxQty) {
          maxQty = qty;
          topItem = name;
        }
      });
      return { ...c, topItem };
    }).sort((a, b) => b.sales - a.sales);

    let trendBuckets = {};
    if (range === "Today") {
      const hours = [12, 14, 16, 18, 20, 22];
      hours.forEach(h => {
        const label = h > 12 ? `${h - 12} PM` : `${h} PM`;
        trendBuckets[label] = 0;
      });
      filteredTxns.forEach(t => {
        const date = new Date(t.createdAt || t.timestamp || Date.now());
        const h = date.getHours();
        let mappedH = hours.find(hour => h <= hour);
        if (!mappedH) mappedH = 22;
        const label = mappedH > 12 ? `${mappedH - 12} PM` : `${mappedH} PM`;
        if (trendBuckets[label] !== undefined) {
          trendBuckets[label] += Number(t.amount || 0);
        }
      });
    } else {
      filteredTxns.forEach(t => {
        const d = new Date(t.createdAt || t.timestamp || Date.now()).toLocaleDateString("en-GB");
        trendBuckets[d] = (trendBuckets[d] || 0) + Number(t.amount || 0);
      });
    }

    const trendsArray = Object.entries(trendBuckets).map(([hourOrDay, sales]) => ({
      hour: hourOrDay,
      sales,
    }));

    return { captains: processedCaptains, trends: trendsArray };
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {captains.slice(0, 4).map((c, i) => (
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
        </div>

        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="font-black text-gray-900 mb-6">Captain Leaderboard</h3>
          <div className="space-y-4">
            {captains.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 hover:bg-red-50 transition-colors group cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-300 group-hover:text-[#B71C1C] w-4">#{i + 1}</span>
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
    </div>
  );
}
