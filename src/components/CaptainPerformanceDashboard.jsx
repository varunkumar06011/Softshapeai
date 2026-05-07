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

      <div className="grid grid-cols-4 gap-3">
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
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ranked}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="sales" fill="#E53935" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-4">
            <h4 className="mb-2 font-semibold">Leaderboard</h4>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#FFCDD2]">
                  <th>Rank</th><th>Name</th><th>Assigned Tables</th><th>Orders</th><th>Sales</th><th>Upsell</th><th>Rating</th><th>Stars</th><th>Shift</th><th>Speed</th><th>Badge</th><th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((captain) => (
                  <tr key={captain.name} className="border-b border-[#FFEBEE]">
                    <td className="py-2 font-bold">#{captain.rank}</td>
                    <td>{captain.name}</td>
                    <td>{captain.tables.join(", ")}</td>
                    <td>{captain.orders}</td>
                    <td>₹{captain.sales.toLocaleString()}</td>
                    <td>{captain.upsell}%</td>
                    <td>{captain.rating}</td>
                    <td>{"★".repeat(captain.stars)}</td>
                    <td>{captain.shift}</td>
                    <td>{captain.speed} min</td>
                    <td><span className="rounded-full bg-[#FFEBEE] px-2 py-0.5 text-xs">{captain.badge}</span></td>
                    <td>{captain.trend === "up" ? "📈" : "➖"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="rounded-[10px] border border-[#FFCDD2] bg-white p-3"><p className="text-xs text-[#6B6B6B]">{label}</p><p className="text-lg font-bold">{value}</p></div>;
}
