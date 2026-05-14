import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchCaptainPerformance } from "../services/captainPerformanceService";

export default function CaptainPerformanceDashboard() {
  const [captains, setCaptains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState("Daily");

  useEffect(() => {
    fetchCaptainPerformance()
      .then(setCaptains)
      .catch((e) => setError(e.message || "Unable to load captain analytics"))
      .finally(() => setLoading(false));
  }, []);

  const ranked = useMemo(
    () => [...captains].sort((a, b) => b.sales - a.sales).map((captain, idx) => ({ ...captain, rank: idx + 1 })),
    [captains],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-[10px] border border-[#FFCDD2] bg-white p-4">
        <h3 className="font-semibold">Captain Performance Management</h3>
        <div className="flex gap-2">
          {["Daily", "Weekly", "Monthly"].map((item) => (
            <button key={item} onClick={() => setRange(item)} className={`rounded-md border px-3 py-1 text-sm ${range === item ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{item}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Top Performer" value={ranked[0]?.name ?? "-"} />
        <Stat label="Highest Sales" value={`₹${ranked[0]?.sales?.toLocaleString?.() ?? 0}`} />
        <Stat label="Best Rating" value={Math.max(...ranked.map((x) => x.rating), 0).toFixed(1)} />
        <Stat label="Avg Completion Speed" value={`${Math.round(ranked.reduce((a, c) => a + c.speed, 0) / (ranked.length || 1))} mins`} />
      </div>

      {loading && <div className="h-14 animate-pulse rounded bg-[#FFEBEE]" />}
      {error && <div className="rounded border border-[#E53935] bg-[#FFEBEE] p-2 text-sm text-[#B71C1C]">{error}</div>}

      {!!ranked.length && (
        <>
          <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-4">
            <h4 className="mb-2 font-semibold">Sales Comparison</h4>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ranked}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="sales" fill="#E53935" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-4">
            <h4 className="mb-4 font-semibold text-sm md:text-base">Captain Performance Leaderboard</h4>
            <div className="overflow-x-auto -mx-4 px-4 scrollbar-thin scrollbar-thumb-red-200">
              <table className="w-full min-w-[900px] text-left text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-[#FFCDD2] text-[#B71C1C] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-2">Rank</th>
                    <th className="py-3 px-2">Name</th>
                    <th className="py-3 px-2">Tables</th>
                    <th className="py-3 px-2 text-center">Orders</th>
                    <th className="py-3 px-2 text-right">Sales</th>
                    <th className="py-3 px-2 text-center">Upsell</th>
                    <th className="py-3 px-2 text-center">Rating</th>
                    <th className="py-3 px-2">Stars</th>
                    <th className="py-3 px-2">Shift</th>
                    <th className="py-3 px-2 text-center">Speed</th>
                    <th className="py-3 px-2 text-center">Badge</th>
                    <th className="py-3 px-2 text-center">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FFEBEE]">
                  {ranked.map((captain) => (
                    <tr key={captain.name} className="hover:bg-[#FFF5F5] transition-colors">
                      <td className="py-3 px-2 font-black text-[#E53935]">#{captain.rank}</td>
                      <td className="py-3 px-2 font-bold">{captain.name}</td>
                      <td className="py-3 px-2 text-[#6B6B6B]">{captain.tables.join(", ")}</td>
                      <td className="py-3 px-2 text-center font-semibold">{captain.orders}</td>
                      <td className="py-3 px-2 text-right font-black">₹{captain.sales.toLocaleString()}</td>
                      <td className="py-3 px-2 text-center text-blue-600 font-bold">{captain.upsell}%</td>
                      <td className="py-3 px-2 text-center">
                        <span className="font-bold text-[#F57F17]">{captain.rating}</span>
                      </td>
                      <td className="py-3 px-2 text-[#F57F17]">{"★".repeat(captain.stars)}</td>
                      <td className="py-3 px-2 text-[#6B6B6B]">{captain.shift}</td>
                      <td className="py-3 px-2 text-center">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">{captain.speed}m</span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="rounded-full bg-[#FFEBEE] px-2 py-0.5 text-[9px] font-black text-[#B71C1C] uppercase tracking-tighter border border-[#EF9A9A]">
                          {captain.badge}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center text-lg">{captain.trend === "up" ? "📈" : "➖"}</td>
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

function Stat({ label, value }) {
  return <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-3"><p className="text-xs text-[#6B6B6B]">{label}</p><p className="text-lg font-bold">{value}</p></div>;
}
