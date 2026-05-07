import { useEffect, useMemo, useState } from "react";
import { fetchUnifiedOrders, getOrderAnalytics, PLATFORM_META, subscribeToIncomingOrders } from "../services/orderIntegrationService";

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.05;
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // audio optional
  }
}

export default function UnifiedOrdersDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState({ platform: "All", branch: "All", status: "All", time: "All" });

  useEffect(() => {
    let unsub = () => {};
    const load = async () => {
      try {
        const data = await fetchUnifiedOrders();
        setOrders(data);
        unsub = subscribeToIncomingOrders((next) => {
          setOrders(next);
          beep();
        });
      } catch (e) {
        setError(e.message || "Unable to load orders");
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => unsub();
  }, []);

  const visible = useMemo(() => {
    const now = Date.now();
    return orders.filter((order) => {
      if (filter.platform !== "All" && order.platform !== filter.platform) return false;
      if (filter.branch !== "All" && order.branch !== filter.branch) return false;
      if (filter.status !== "All" && order.status !== filter.status) return false;
      if (filter.time === "15m" && now - order.createdAt > 15 * 60 * 1000) return false;
      if (filter.time === "1h" && now - order.createdAt > 60 * 60 * 1000) return false;
      return true;
    });
  }, [orders, filter]);

  const analytics = useMemo(() => getOrderAnalytics(visible), [visible]);

  return (
    <div className="space-y-3 rounded-[10px] border border-[#FFCDD2] bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Unified Incoming Orders (Zomato + Swiggy + Direct)</h3>
        <button className="rounded-md border border-[#FFCDD2] px-2 py-1 text-xs" onClick={async () => setOrders(await fetchUnifiedOrders())}>Auto Refresh</button>
      </div>

      <div className="grid grid-cols-4 gap-2 text-sm">
        <select className="rounded border border-[#FFCDD2] p-1" onChange={(e) => setFilter((f) => ({ ...f, platform: e.target.value }))}><option>All</option><option>Zomato</option><option>Swiggy</option><option>Direct</option></select>
        <select className="rounded border border-[#FFCDD2] p-1" onChange={(e) => setFilter((f) => ({ ...f, branch: e.target.value }))}><option>All</option><option>Main Hall</option><option>Express Outlet</option></select>
        <select className="rounded border border-[#FFCDD2] p-1" onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}><option>All</option><option>Preparing</option><option>Ready</option><option>Dispatched</option><option>Served</option></select>
        <select className="rounded border border-[#FFCDD2] p-1" onChange={(e) => setFilter((f) => ({ ...f, time: e.target.value }))}><option value="All">All</option><option value="15m">Last 15m</option><option value="1h">Last 1h</option></select>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MetricCard label="Total Orders" value={analytics.totalOrders} />
        <MetricCard label="Most Ordered Dish" value={analytics.mostOrderedDish} />
        <MetricCard label="Peak Timing" value={analytics.peakTiming} />
        <MetricCard label="Platform Revenue" value={`Z:${analytics.revenueByPlatform.Zomato ?? 0} S:${analytics.revenueByPlatform.Swiggy ?? 0}`} />
      </div>

      {loading && <div className="h-10 animate-pulse rounded bg-[#FFEBEE]" />}
      {error && <div className="rounded border border-[#E53935] bg-[#FFEBEE] p-2 text-sm text-[#B71C1C]">{error}</div>}
      {!loading && !visible.length && <div className="rounded border border-[#FFCDD2] p-2 text-sm text-[#6B6B6B]">No incoming orders for selected filters.</div>}
      <div className="grid grid-cols-3 gap-2">
        {visible.slice(0, 9).map((order) => (
          <div key={order.id} className="rounded border border-[#FFCDD2] p-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{order.id}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${PLATFORM_META[order.platform]?.badgeClass ?? "bg-slate-100 text-slate-700"}`}>{order.platform}</span>
            </div>
            <p>{order.customer}</p>
            <p>{order.dish}</p>
            <p>₹{order.amount}</p>
            <p className="text-xs text-[#6B6B6B]">{order.branch} • {order.status}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return <div className="rounded border border-[#FFCDD2] bg-[#FFF5F5] p-2"><p className="text-xs text-[#6B6B6B]">{label}</p><p className="font-bold">{value}</p></div>;
}
