import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchCaptainPerformance } from "../services/captainPerformanceService";

export default function CaptainPerformanceDashboard({ captains: liveCaptains }) {
  const [range, setRange] = useState("Daily");

  const ranked = useMemo(
    () => [...(liveCaptains || [])].sort((a, b) => b.sales - a.sales).map((captain, idx) => ({ 
      ...captain, 
      rank: idx + 1,
      stars: Math.round(captain.rating || 0),
      badge: (captain.rating || 0) > 4.7 ? "Top Performer" : (captain.upsell || 0) > 20 ? "Upsell Pro" : "Steady",
      trend: (captain.orders || 0) > 40 ? "up" : "flat",
    })),
    [liveCaptains],
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-[10px] border border-[#FFCDD2] bg-white p-4 shadow-sm">
        <div>
          <h3 className="font-bold text-[#1A1A1A]">Captain Analytics & Accountability</h3>
          <p className="text-[10px] text-[#6B6B6B] uppercase tracking-widest font-bold mt-0.5">Real-time Performance Monitoring</p>
        </div>
        <div className="flex gap-2 bg-[#FFF5F5] p-1 rounded-lg border border-[#FFCDD2]">
          {["Daily", "Weekly", "Monthly"].map((item) => (
            <button 
              key={item} 
              onClick={() => setRange(item)} 
              className={`rounded-md px-3 py-1.5 text-[10px] font-bold transition-all ${range === item ? "bg-[#E53935] text-white shadow-md shadow-red-100" : "text-[#6B6B6B] hover:bg-white"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Stat label="Top Performer" value={ranked[0]?.name ?? "-"} color="#2E7D32" />
        <Stat label="Total Group Sales" value={`₹${ranked.reduce((a,c) => a + c.sales, 0).toLocaleString()}`} color="#1A1A1A" />
        <Stat label="Highest Rating" value={Math.max(...ranked.map((x) => x.rating || 0), 0).toFixed(1)} color="#F57F17" />
        <Stat label="Avg Service Speed" value={`${Math.round(ranked.reduce((a, c) => a + (c.speed || 0), 0) / (ranked.length || 1))}m`} color="#B71C1C" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-4 shadow-sm">
          <h4 className="mb-4 font-bold text-sm md:text-base flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#E53935]" />
            Revenue Contribution
          </h4>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranked}>
                <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#FFEBEE' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="sales" fill="#E53935" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-4 shadow-sm">
          <h4 className="mb-4 font-bold text-sm md:text-base flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Performance Insights
          </h4>
          <div className="space-y-3">
            {ranked.map(c => (
              <div key={c.name} className="flex items-center justify-between p-3 rounded-xl border border-[#FFEBEE] hover:border-[#EF9A9A] transition-all">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#FFEBEE] flex items-center justify-center text-lg">{c.img || "👤"}</div>
                  <div>
                    <p className="text-xs font-bold">{c.name}</p>
                    <p className="text-[10px] text-[#6B6B6B]">{c.orders} orders closed</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-[#B71C1C]">₹{c.sales.toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-[#2E7D32]">Rating: {c.rating}★</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-4 shadow-sm">
        <h4 className="mb-4 font-bold text-sm md:text-base">Real-time Leaderboard</h4>
        <div className="overflow-x-auto -mx-4 px-4 custom-scrollbar">
          <table className="w-full min-w-[800px] text-left text-xs md:text-sm">
            <thead>
              <tr className="border-b border-[#FFCDD2] text-[#B71C1C] uppercase tracking-wider text-[10px] font-black">
                <th className="py-3 px-2">Rank</th>
                <th className="py-3 px-2">Captain</th>
                <th className="py-3 px-2">Sales Attribution</th>
                <th className="py-3 px-2 text-center">Orders</th>
                <th className="py-3 px-2 text-center">Tables</th>
                <th className="py-3 px-2 text-center">Satisfaction</th>
                <th className="py-3 px-2 text-center">Efficiency</th>
                <th className="py-3 px-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FFEBEE]">
              {ranked.map((captain) => (
                <tr key={captain.name} className="hover:bg-[#FFF5F5] transition-all group">
                  <td className="py-4 px-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full font-black text-[10px] ${
                      captain.rank === 1 ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-gray-100 text-gray-600"
                    }`}>
                      {captain.rank}
                    </span>
                  </td>
                  <td className="py-4 px-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{captain.img || "👤"}</span>
                      <span className="font-bold group-hover:text-[#E53935]">{captain.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-2 font-black text-[#1A1A1A]">₹{captain.sales.toLocaleString()}</td>
                  <td className="py-4 px-2 text-center font-bold text-[#6B6B6B]">{captain.orders}</td>
                  <td className="py-4 px-2 text-center">
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-100">
                      {captain.tables.length} Active
                    </span>
                  </td>
                  <td className="py-4 px-2 text-center">
                    <div className="flex flex-col items-center">
                      <span className="font-black text-[#F57F17]">{captain.rating}</span>
                      <span className="text-[10px] text-[#F57F17] opacity-60">{"★".repeat(Math.round(captain.rating))}</span>
                    </div>
                  </td>
                  <td className="py-4 px-2 text-center">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full mx-auto overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${Math.min(100, (60 / (captain.speed || 1)) * 20)}%` }} />
                    </div>
                    <span className="text-[9px] font-mono mt-1 block">{captain.speed}m avg</span>
                  </td>
                  <td className="py-4 px-2 text-center">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-tighter border ${
                      captain.badge === "Top Performer" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-[#FFEBEE] text-[#B71C1C] border-[#EF9A9A]"
                    }`}>
                      {captain.badge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">{label}</p>
      <p className="text-xl font-black" style={{ color }}>{value}</p>
    </div>
  );
}
