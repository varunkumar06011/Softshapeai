import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Camera,
  ChartNoAxesCombined,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Table2,
  UtensilsCrossed,
} from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import AIDishCreationModal from "./components/AIDishCreationModal";
import UnifiedOrdersDashboard from "./components/UnifiedOrdersDashboard";

const CaptainPerformanceDashboard = lazy(() => import("./components/CaptainPerformanceDashboard"));

const C = {
  primary: "#E53935",
  primaryLight: "#FFEBEE",
  primaryMid: "#EF9A9A",
  white: "#FFFFFF",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  success: "#2E7D32",
  warning: "#F57F17",
  border: "#FFCDD2",
  sidebar: "#B71C1C",
  page: "#FFF5F5",
};

const navItems = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["pos", "POS Billing", ShoppingCart],
  ["tables", "Tables", Table2],
  ["menu", "Menu", UtensilsCrossed],
  ["orders", "Orders", ClipboardList],
  ["reports", "Reports", ChartNoAxesCombined],
  ["captains", "Captain Analytics", ChartNoAxesCombined],
  ["payroll", "Payroll", DollarSign],
  ["marketing", "Marketing AI", Megaphone],
  ["surveillance", "Surveillance", Camera],
  ["inventory", "Inventory", Package],
  ["pricing", "Pricing", Sparkles],
  ["settings", "Settings", Settings],
];

const btn = "rounded-md bg-[#E53935] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#c62828]";
const card = "rounded-[10px] border border-[#FFCDD2] bg-white";
const input = "w-full rounded-[4px] border border-[#FFCDD2] bg-white px-3 py-2 text-sm outline-none focus:border-[#E53935]";

function Login({ onLogin }) {
  const [merge, setMerge] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMerge(true), 2000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF5F5] p-6">
      <div className="w-full max-w-xl rounded-[10px] border border-[#FFCDD2] bg-white p-8">
        <h1 className="text-center text-4xl font-bold text-[#E53935]">softshape.ai</h1>
        <p className="mt-2 text-center text-[#6B6B6B]">Where AI shapes your business</p>
        <div className="my-6 flex items-center justify-center gap-3">
          {!merge ? ["Designer", "Accountant", "Captain", "Surveillance"].map((r, i) => (
            <div key={r} className="h-16 w-16 animate-pulse rounded-full bg-[#FFEBEE] text-center text-[10px] font-semibold text-[#B71C1C] flex items-center justify-center">
              {r}
            </div>
          )) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#E53935] bg-[#FFEBEE] font-bold text-[#E53935]">Spire.ai</div>
          )}
        </div>
        <div className="space-y-3">
          <input className={input} defaultValue="admin@raviskitchen.com" />
          <input className={input} defaultValue="••••••••" type="password" />
          <button onClick={onLogin} className={`${btn} w-full`}>Login to Dashboard</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [spireOpen, setSpireOpen] = useState(false);
  const [tableDetail, setTableDetail] = useState(null);
  const [payslip, setPayslip] = useState(null);
  const [incident, setIncident] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [posted, setPosted] = useState(false);
  const [upload, setUpload] = useState(null);
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const uploadRef = useRef(null);

  const title = useMemo(() => navItems.find((x) => x[0] === page)?.[1] ?? "Dashboard", [page]);
  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />;

  return (
    <div className="min-h-screen bg-[#FFF5F5] text-[#1A1A1A]">
      <aside className="fixed left-0 top-0 flex h-screen w-[220px] flex-col justify-between bg-[#B71C1C] p-4 text-white">
        <div>
          <div className="text-2xl font-bold">softshape<span className="text-[#EF9A9A]">.ai</span></div>
          <div className="mt-1 flex items-center gap-2 text-xs"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />Spire.ai is ready ✦</div>
          <div className="mt-5 space-y-1">
            {navItems.map(([k, label, Icon]) => (
              <button key={k} onClick={() => setPage(k)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${page === k ? "bg-white text-[#B71C1C]" : "text-white hover:bg-[#d64a46]"}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-[#EF9A9A] p-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20" />
            <div className="text-xs">Ravi's Kitchen</div>
          </div>
          <LogOut size={16} />
        </div>
      </aside>

      <div className="ml-[220px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#FFCDD2] bg-white px-6">
          <div className="text-xl font-bold">{title}</div>
          <div className="text-sm text-[#6B6B6B]">Wednesday, 7 May 2025</div>
          <div className="flex items-center gap-3">
            <button className="relative rounded-md border border-[#FFCDD2] p-2"><Bell size={16} /><span className="absolute -right-2 -top-2 rounded-full bg-[#E53935] px-1 text-[10px] text-white">3</span></button>
            <button className="rounded-md border border-[#FFCDD2] p-2"><Search size={16} /></button>
            <div className="h-8 w-8 rounded-full bg-[#FFEBEE]" />
          </div>
        </header>
        <main className="page-enter p-6">
          {page === "dashboard" && <Dashboard />}
          {page === "pos" && <Pos />}
          {page === "tables" && <Tables onOpen={setTableDetail} />}
          {page === "menu" && <MenuPage onAddDish={() => setDishModalOpen(true)} />}
          {page === "orders" && <Orders />}
          {page === "reports" && <Reports />}
          {page === "captains" && <Suspense fallback={<div className={card + " p-4"}>Loading captain analytics...</div>}><CaptainPerformanceDashboard /></Suspense>}
          {page === "payroll" && <Payroll onPayslip={setPayslip} />}
          {page === "marketing" && <Marketing upload={upload} setUpload={setUpload} uploadRef={uploadRef} generated={generated} setGenerated={setGenerated} posted={posted} setPosted={setPosted} />}
          {page === "surveillance" && <Surveillance onIncident={() => setIncident(true)} />}
          {page === "inventory" && <Inventory onPo={() => setPoOpen(true)} />}
          {page === "pricing" && <Pricing />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>

      <button onClick={() => setSpireOpen((v) => !v)} className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#E53935] px-4 py-3 text-white hover:bg-[#c62828]">
        <Bot size={16} /> Ask Spire ✦
      </button>
      {spireOpen && <SpirePanel />}

      {tableDetail && <Modal title={`Table ${tableDetail.id} Details`} onClose={() => setTableDetail(null)}>
        <p className="text-sm text-[#6B6B6B]">{tableDetail.items}</p>
        <p className="mt-2 text-sm">Seated: {tableDetail.time}</p>
        <p className="text-sm">Bill: {tableDetail.bill}</p>
        <div className="mt-4 flex gap-2">
          <button className={btn}>View Bill</button>
          <button className="rounded-md border border-[#FFCDD2] px-3 py-2 text-sm">Mark Available</button>
        </div>
      </Modal>}

      {payslip && <Modal title={`${payslip} Payslip`} onClose={() => setPayslip(null)}>
        <div className={card + " p-4"}>
          <h4 className="font-semibold">Ravi's Kitchen - Salary Slip</h4>
          <p className="text-sm text-[#6B6B6B]">Month: May 2025</p>
          <p className="mt-2 text-sm">Base: ₹12,000 | Deductions: ₹1,200 | Net: ₹10,800</p>
          <button className={`${btn} mt-4`}>Download PDF</button>
        </div>
      </Modal>}

      {incident && <Modal title="Camera Incident" onClose={() => setIncident(false)}>
        <div className="rounded-md border border-[#E53935] bg-[#FFEBEE] p-3 text-sm">CAM-03 | 14:32:07 | Storage Zone | Confidence: 91%</div>
      </Modal>}

      {poOpen && <Modal title="Auto Purchase Order" onClose={() => setPoOpen(false)}>
        <p className="text-sm">Mutton: 10kg | Milk: 15L</p>
      </Modal>}

      <AIDishCreationModal
        open={dishModalOpen}
        onClose={() => setDishModalOpen(false)}
        onSave={() => setDishModalOpen(false)}
      />
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-lg rounded-[10px] border border-[#FFCDD2] bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button onClick={onClose}>✕</button></div>{children}</div></div>;
}

function Dashboard() {
  const sales = [{ d: "Mon", v: 32 }, { d: "Tue", v: 41 }, { d: "Wed", v: 47 }, { d: "Thu", v: 38 }, { d: "Fri", v: 55 }, { d: "Sat", v: 62 }, { d: "Sun", v: 71 }];
  return <div className="space-y-4">
    <div className="rounded-[10px] border border-[#EF9A9A] bg-[#FFEBEE] p-4">Good morning, Ravi! 🍽 Today looks busy — 142 orders expected. Chicken Biriyani is trending. 3 staff marked absent.</div>
    <div className="grid grid-cols-4 gap-4">
      {[
        { label: "Today's Revenue", value: "₹47,350", sub: "↑12%", color: "text-[#2E7D32]" },
        { label: "Total Orders", value: "89", sub: "live count", color: "text-[#1A1A1A]" },
        { label: "Tables Occupied", value: "14/20", sub: "active tables", color: "text-[#1A1A1A]" },
        { label: "Staff Present", value: "18/21", sub: "today", color: "text-[#1A1A1A]" },
      ].map((x) => (
        <div key={x.label} className={card + " border-t-4 border-t-[#E53935] p-4"}>
          <p className="text-xs tracking-wide text-[#6B6B6B]">{x.label}</p>
          <div className="mt-2 flex items-end gap-2">
            <p className="text-3xl font-extrabold leading-none text-[#1A1A1A]">{x.value}</p>
            <p className={`text-sm font-bold ${x.color}`}>{x.sub}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div className={card + " p-4"}><h3 className="mb-3 font-semibold">Sales - Last 7 days</h3><ResponsiveContainer width="100%" height={220}><BarChart data={sales}><XAxis dataKey="d" /><YAxis /><Tooltip /><Bar dataKey="v" fill="#E53935" /></BarChart></ResponsiveContainer></div>
      <div className={card + " p-4"}><h3 className="mb-3 font-semibold">Top selling items today</h3>{["Chicken Biriyani — 50 plates — ₹18,750", "Mutton Curry — 28 plates — ₹11,200", "Prawn Fry — 22 plates — ₹8,800", "Veg Biriyani — 19 plates — ₹5,700", "Lassi — 45 glasses — ₹3,150"].map((r) => <div key={r} className="mb-2 flex items-center justify-between rounded-md border border-[#FFCDD2] p-2 text-sm"><span>{r.split("—")[0]}</span><span className="rounded-full bg-[#FFEBEE] px-2">{r.split("—")[1]}</span><span>{r.split("—")[2]}</span></div>)}</div>
    </div>
    <div className="grid grid-cols-3 gap-4">
      <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Recent Orders</h3><p className="text-sm">Order#1042 Table 7 ₹850 Preparing</p><p className="text-sm">Order#1041 Table 3 ₹1,200 Served</p><p className="text-sm">Order#1040 Takeaway ₹650 Ready</p><p className="text-sm">Order#1039 Table 12 ₹2,100 Served</p><p className="text-sm">Order#1038 Delivery ₹890 Dispatched</p></div>
      <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Spire.ai Alerts</h3><p className="text-sm">⚠ Zone violation at Kitchen 14:32</p><p className="text-sm">✦ Post scheduled for Instagram 6PM</p><p className="text-sm">✓ Payroll calculated for May — 21 staff</p></div>
      <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Inventory Quick View</h3><p className="text-sm">Chicken 35kg remaining</p><p className="text-sm">Rice 80kg</p><p className="text-sm">Mutton 12kg <span className="rounded bg-[#FFEBEE] px-2 text-[#B71C1C]">LOW</span></p><p className="text-sm">Prawns 8kg</p><p className="text-sm">Oil 40L</p></div>
    </div>
  </div>;
}

function Pos() {
  const items = [["Chicken Biriyani", 375, "non"], ["Mutton Biriyani", 450, "non"], ["Veg Biriyani", 300, "veg"], ["Prawn Biriyani", 550, "non"], ["Chicken Curry", 280, "non"], ["Mutton Curry", 400, "non"], ["Chicken 65", 320, "non"], ["Prawn Fry", 400, "non"], ["Paneer Tikka", 350, "veg"], ["Lassi", 70, "veg"], ["Soft Drinks", 50, "veg"], ["Gulab Jamun", 80, "veg"]];
  return <div className="grid grid-cols-5 gap-4">
    <div className="col-span-3 space-y-4">
      <div className="flex gap-2">{["All", "Biriyani", "Curry", "Starters", "Drinks", "Desserts"].map((x, i) => <button key={x} className={`rounded-md border px-3 py-1 text-sm ${i === 0 ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{x}</button>)}</div>
      <div className="grid grid-cols-3 gap-3">{items.map((x) => <div key={x[0]} className={card + " p-3"}><p className="font-semibold text-sm">{x[0]}</p><p className="text-sm">₹{x[1]}</p><div className="mt-2 flex items-center justify-between"><span className={`h-3 w-3 rounded-full ${x[2] === "veg" ? "bg-green-600" : "bg-red-600"}`} /><button className={btn + " px-2 py-1 text-xs"}>+Add</button></div></div>)}</div>
    </div>
    <div className={"col-span-2 " + card + " p-4"}>
      <h3 className="font-semibold">Order #1043, Table 8</h3>
      <p className="mt-2 text-sm">Chicken Biriyani × 2 = ₹750</p><p className="text-sm">Mutton Curry × 1 = ₹400</p><p className="text-sm">Lassi × 2 = ₹140</p>
      <div className="mt-3 border-t border-[#FFCDD2] pt-2 text-sm"><p>Subtotal: ₹1,290</p><p>GST 5%: ₹64.50</p><p className="font-semibold">Total: ₹1,354.50</p></div>
      <div className="mt-3 flex gap-2">{["Cash", "Card", "UPI"].map((x, i) => <button key={x} className={`rounded-md border px-3 py-1 text-sm ${i === 0 ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{x}</button>)}</div>
      <button className={`${btn} mt-3 w-full`}>Print Bill</button>
      <button className="mt-2 w-full rounded-md border border-[#FFCDD2] px-3 py-2 text-sm">New Order</button>
      <button className={`${btn} mt-2 w-full`}>Send to Kitchen</button>
    </div>
  </div>;
}

function Tables({ onOpen }) {
  const data = [
    { id: 1, status: "occupied", details: "4 guests — ₹1,850 — 45 min" },
    { id: 2, status: "available", details: "Available" },
    { id: 3, status: "occupied", details: "2 guests — ₹650 — 20 min" },
    { id: 4, status: "reserved", details: "Priya 7:00 PM" },
    { id: 5, status: "occupied", details: "6 guests — ₹3,200 — 1h 10m" },
    { id: 6, status: "available", details: "Available" },
    { id: 7, status: "occupied", details: "3 guests — ₹980 — 35 min" },
    { id: 8, status: "occupied", details: "4 guests — ₹1,354 — 15 min" },
    { id: 9, status: "available", details: "Available" },
    { id: 10, status: "reserved", details: "Wedding party 8PM" },
    { id: 11, status: "occupied", details: "2 guests — ₹480 — 12 min" },
    { id: 12, status: "available", details: "Available" },
    { id: 13, status: "occupied", details: "5 guests — ₹2,410 — 53 min" },
    { id: 14, status: "available", details: "Available" },
    { id: 15, status: "occupied", details: "4 guests — ₹1,440 — 24 min" },
    { id: 16, status: "occupied", details: "3 guests — ₹1,140 — 32 min" },
    { id: 17, status: "available", details: "Available" },
    { id: 18, status: "occupied", details: "4 guests — ₹1,760 — 41 min" },
    { id: 19, status: "available", details: "Available" },
    { id: 20, status: "occupied", details: "2 guests — ₹720 — 18 min" },
  ];
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Floor Plan — Main Hall</h3><select className={input + " max-w-52"}><option>Main Hall</option><option>Terrace</option></select></div>
    <div className="grid grid-cols-4 gap-3">{data.map((t) => {
      const bg = t.status === "occupied" ? "bg-[#B71C1C] text-white border-[#B71C1C]" : t.status === "reserved" ? "bg-[#FFF3E0] text-[#8D4E00]" : "bg-[#E8F5E9] text-[#1B5E20]";
      const label = t.status === "occupied" ? `Occupied — ${t.details}` : t.status === "reserved" ? `Reserved — ${t.details}` : "Available";
      return <button key={t.id} onClick={() => t.status === "occupied" && onOpen({ id: t.id, items: "Chicken Biriyani x2, Mutton Curry x1, Lassi x2", time: "Seated 45 min ago", bill: "₹1,850" })} className={`${card} ${bg} min-h-[96px] p-3 text-left`}><p className="text-lg font-extrabold">T{t.id}</p><p className="text-xs font-semibold">{label}</p></button>;
    })}</div>
    <p className="text-sm text-[#6B6B6B]">Legend: Red = Occupied | Green = Available | Amber = Reserved</p>
  </div>;
}

function MenuPage({ onAddDish }) {
  const items = ["Chicken Biriyani", "Mutton Biriyani", "Veg Biriyani", "Prawn Biriyani", "Chicken Curry", "Mutton Curry", "Chicken 65", "Prawn Fry", "Paneer Tikka", "Lassi", "Soft Drinks", "Gulab Jamun"];
  return <div className={card + " p-4"}>
    <div className="mb-3 flex justify-end"><button className={btn} onClick={onAddDish}>+ Add Item</button></div>
    <table className="w-full text-left text-sm"><thead><tr className="border-b border-[#FFCDD2]"><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Veg/Non-Veg</th><th>Available</th><th>Action</th></tr></thead><tbody>{items.map((i, idx) => <tr key={i} className="border-b border-[#FFEBEE]"><td><div className="h-8 w-8 rounded bg-[#EF9A9A]" /></td><td>{i}</td><td>{idx < 4 ? "Biriyani" : idx < 8 ? "Starters/Curry" : "Drinks/Dessert"}</td><td>₹{[375, 450, 300, 550, 280, 400, 320, 400, 350, 70, 50, 80][idx]}</td><td>{idx === 2 || idx > 7 ? "Veg" : "Non-Veg"}</td><td><span className="rounded-full bg-green-100 px-2 py-1 text-xs">Available</span></td><td>✏️ 🗑️</td></tr>)}</tbody></table>
  </div>;
}

function Orders() {
  const rows = [["#1043", "Dine-In", "Table 8", "3", "₹1,354", "Preparing", "5 min ago", "View"], ["#1042", "Dine-In", "Table 7", "4", "₹850", "Ready", "12 min ago", "View"], ["#1041", "Delivery", "Swiggy — Kiran", "2", "₹890", "Dispatched", "18 min ago", "Track"], ["#1040", "Takeaway", "Walk-in", "1", "₹375", "Ready", "22 min ago", "View"], ["#1039", "Dine-In", "Table 12", "6", "₹2,100", "Served", "35 min ago", "Bill"], ["#1038", "Delivery", "Zomato — Ananya", "3", "₹1,100", "Delivered", "45 min ago", "Done"], ["#1037", "Dine-In", "Table 5", "5", "₹3,200", "Preparing", "8 min ago", "View"], ["#1036", "Takeaway", "Walk-in", "2", "₹650", "Ready", "50 min ago", "View"], ["#1035", "Delivery", "Rajat", "4", "₹1,280", "Dispatched", "1h ago", "Track"], ["#1034", "Dine-In", "Table 4", "3", "₹740", "Cancelled", "1h ago", "View"], ["#1033", "Dine-In", "Table 11", "2", "₹520", "Served", "1h 15m", "Bill"], ["#1032", "Delivery", "Nisha", "3", "₹990", "Delivered", "1h 20m", "Done"]];
  return <div className="space-y-4">
    <UnifiedOrdersDashboard />
    <div className="flex gap-2">{["Dine-In (48)", "Takeaway (23)", "Delivery (18)", "All (89)"].map((x, i) => <button key={x} className={`rounded-md border px-3 py-1 text-sm ${i === 0 ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{x}</button>)}</div>
    <div className="flex gap-2"><select className={input + " max-w-52"}><option>All Status</option><option>Preparing</option></select><input className={input} placeholder="Search order..." /></div>
    <div className={card + " overflow-hidden"}><table className="w-full text-left text-sm"><thead className="bg-[#FFEBEE]"><tr><th className="p-2">Order ID</th><th>Type</th><th>Table/Customer</th><th>Items</th><th>Amount</th><th>Status</th><th>Time</th><th>Action</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]} className="border-b border-[#FFEBEE]"><td className="p-2">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]} items</td><td>{r[4]}</td><td><span className="rounded-full bg-[#FFEBEE] px-2 py-1 text-xs">{r[5]}</span></td><td>{r[6]}</td><td><button className="text-[#B71C1C]">{r[7]}</button></td></tr>)}</tbody></table></div>
  </div>;
}

function Reports() {
  const trend = Array.from({ length: 30 }).map((_, i) => ({ day: i + 1, rev: 8000 + ((i * 977) % 15000) }));
  const pie = [{ name: "Dine-In", value: 55 }, { name: "Delivery", value: 27 }, { name: "Takeaway", value: 18 }];
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div className="flex gap-2">{["Today", "This Week", "This Month", "Custom"].map((x, i) => <button key={x} className={`rounded-md border px-3 py-1 text-sm ${i === 0 ? "border-[#E53935] bg-[#FFEBEE]" : "border-[#FFCDD2]"}`}>{x}</button>)}</div><div className="flex gap-2"><button className="rounded-md border border-[#E53935] px-3 py-2 text-sm text-[#B71C1C]">Download PDF</button><button className="rounded-md border border-[#E53935] px-3 py-2 text-sm text-[#B71C1C]">Download CSV</button></div></div>
    <div className="grid grid-cols-4 gap-4">{["Total Revenue|₹3,47,250", "Total Orders|624", "Avg Order Value|₹556", "Top Item|Chicken Biriyani"].map((x) => <div key={x} className={card + " p-3"}><p className="text-xs text-[#6B6B6B]">{x.split("|")[0]}</p><p className="font-semibold">{x.split("|")[1]}</p></div>)}</div>
    <div className="grid grid-cols-2 gap-4">
      <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Revenue Trend</h3><ResponsiveContainer width="100%" height={220}><AreaChart data={trend}><XAxis dataKey="day" /><YAxis /><Tooltip /><Area dataKey="rev" stroke="#E53935" fill="#FFEBEE" /></AreaChart></ResponsiveContainer></div>
      <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Order Type</h3><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={pie} dataKey="value" cx="50%" cy="50%" outerRadius={72}>{pie.map((_, i) => <Cell key={i} fill={["#E53935", "#EF9A9A", "#FFCDD2"][i]} />)}</Pie></PieChart></ResponsiveContainer><p className="text-sm">Dine-In 55% | Delivery 27% | Takeaway 18%</p></div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Top 5 Items</h3><p className="text-sm">Chicken Biriyani | 280 | ₹1,05,000 | 30%</p><p className="text-sm">Mutton Curry | 220 | ₹88,000 | 25%</p><p className="text-sm">Prawn Fry | 180 | ₹72,000 | 20%</p><p className="text-sm">Veg Biriyani | 150 | ₹45,000 | 13%</p><p className="text-sm">Lassi | 320 | ₹22,400 | 12%</p></div>
      <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Peak Hours</h3><p className="text-sm">12PM-2PM (Very High)</p><p className="text-sm">7PM-10PM (Very High)</p><p className="text-sm">3PM-5PM (Low)</p></div>
    </div>
    <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Staff Performance</h3><table className="w-full text-sm"><thead><tr><th>Name</th><th>Orders Handled</th><th>Avg Rating</th><th>Present Days</th></tr></thead><tbody><tr><td>Raju</td><td>210</td><td>4.8</td><td>28/30</td></tr><tr><td>Meena</td><td>185</td><td>4.6</td><td>30/30</td></tr><tr><td>Suresh</td><td>160</td><td>4.4</td><td>26/30</td></tr><tr><td>Lakshmi</td><td>190</td><td>4.9</td><td>29/30</td></tr></tbody></table></div>
  </div>;
}

function Payroll({ onPayslip }) {
  const staff = ["Raju Kumar|Head Chef|₹18,000|28|2|₹1,200|₹16,800|Paid ✓", "Meena Devi|Waiter|₹12,000|30|0|₹0|₹12,000|Paid ✓", "Suresh Babu|Cook|₹14,000|26|4|₹1,867|₹12,133|Pending", "Lakshmi R|Cashier|₹13,000|29|1|₹433|₹12,567|Paid ✓", "Arjun K|Delivery|₹10,000|25|5|₹1,667|₹8,333|Pending", "Priya S|Helper|₹9,000|30|0|₹0|₹9,000|Paid ✓", "Kiran T|Waiter|₹12,000|27|3|₹1,200|₹10,800|Pending", ...Array.from({ length: 14 }).map((_, i) => `Staff ${i + 8}|Support|₹11,000|28|2|₹733|₹10,267|Paid ✓`)];
  return <div className="space-y-4">
    <div className="rounded-[10px] bg-[#E53935] p-4 text-white">🤖 Spire.ai — Your Accountant</div>
    <div className="flex items-center gap-3"><select className={input + " max-w-52"}><option>May 2025</option></select><button className={btn}>Calculate Payroll</button></div>
    <div className="grid grid-cols-3 gap-4">
      <div className={card + " border-t-2 border-t-[#E53935] p-4"}>
        <p className="text-sm uppercase text-[#6B6B6B]">Total Payroll</p>
        <p className="mt-1 text-5xl font-extrabold text-[#1A1A1A]">₹2,35,233</p>
      </div>
      <div className={card + " border-t-2 border-t-[#E53935] p-4"}>
        <p className="text-sm uppercase text-[#6B6B6B]">Paid</p>
        <p className="mt-1 text-5xl font-extrabold text-[#2E7D32]">₹1,75,467</p>
      </div>
      <div className={card + " border-t-2 border-t-[#E53935] p-4"}>
        <p className="text-sm uppercase text-[#6B6B6B]">Pending</p>
        <p className="mt-1 text-5xl font-extrabold text-[#F57F17]">₹59,766</p>
      </div>
    </div>
    <div className={card + " overflow-auto"}><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[#FFEBEE]"><tr><th className="p-2">Name</th><th>Role</th><th>Base Salary</th><th>Days Present</th><th>Absent</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th>Action</th></tr></thead><tbody>{staff.map((s) => { const c = s.split("|"); return <tr key={s} className="border-b border-[#FFEBEE]"><td className="p-2">{c[0]}</td><td>{c[1]}</td><td>{c[2]}</td><td>{c[3]}</td><td>{c[4]}</td><td>{c[5]}</td><td>{c[6]}</td><td>{c[7]}</td><td><button className="text-[#B71C1C]" onClick={() => onPayslip(c[0])}>Payslip PDF</button></td></tr>; })}</tbody></table></div>
    <div className="rounded-md border border-[#FFCDD2] bg-[#FFEBEE] p-3 text-sm">Total Payroll ₹2,45,600 | Paid: ₹1,68,400 | Pending: ₹77,200</div>
  </div>;
}

function Marketing({ upload, setUpload, uploadRef, generated, setGenerated, posted, setPosted }) {
  const [selectedDesign, setSelectedDesign] = useState(1);
  const [language, setLanguage] = useState("en");
  const [dishName, setDishName] = useState("Chicken Biriyani");
  const handleUpload = (f) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    setUpload({ name: f.name, url });
    setGenerated(false);
  };
  const caption = language === "en"
    ? `🍛 Royal ${dishName} — Cooked slow, served fresh! Every grain tells a story of flavor crafted with love at Ravi's Kitchen.
📍 Vijayawada | Order Now ☎ 98765-43210
#ChickenBiriyani #RavisKitchen #Vijayawada #FoodLovers #Biriyani #AndhraFood #FoodPhotography`
    : `🍛 రాయల్ ${dishName} — నెమ్మదిగా వండి, తాజాగా వడ్డించాం!
రవి'స్ కిచెన్ ప్రేమతో తయారైన రుచికి ప్రతి అన్నగింజ సాక్ష్యం.
📍 విజయవాడ | ఇప్పుడే ఆర్డర్ చేయండి ☎ 98765-43210
#చికెన్‌బిర్యానీ #రవిస్‌కిచెన్ #విజయవాడ #ఫుడ్‌లవర్స్ #బిర్యానీ #ఆంధ్రఫుడ్`;

  return <div className="space-y-4">
    <div className="rounded-[10px] border border-[#FFCDD2] bg-[#FFEBEE] p-4 font-semibold">Spire.ai — Your Designer & Marketing Manager</div>
    <div className="flex items-center gap-2 text-sm"><span className="rounded-full bg-[#E53935] px-2 py-1 text-white">Step 1: Upload</span><span>→</span><span className="rounded-full bg-[#FFEBEE] px-2 py-1">Step 2: Choose Design</span><span>→</span><span className="rounded-full bg-[#FFEBEE] px-2 py-1">Step 3: Post</span></div>
    <div className={card + " p-4"}>
      <button onClick={() => uploadRef.current?.click()} className="w-full rounded-[10px] border-2 border-dashed border-[#E53935] bg-[#FFF5F5] p-8 text-sm">Drop your food photo here or click to browse</button>
      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
      {upload && <div className="mt-3 flex items-center gap-3 rounded-md border border-[#FFCDD2] p-2"><img src={upload.url} alt="uploaded" className="h-16 w-16 rounded object-cover" /><p className="text-sm">{upload.name}</p></div>}
      {!upload && <div className="mt-3 flex items-center gap-3 rounded-md border border-[#FFCDD2] p-2"><div className="h-16 w-16 rounded bg-orange-300" /><p className="text-sm">chicken_biriyani_raw.jpg</p></div>}
      <button onClick={() => setGenerated(true)} className={`${btn} mt-3`}>Generate Designs →</button>
    </div>
    {generated && <div className={card + " p-4"}>
      <h3 className="font-semibold">Spire.ai generated 4 designs for you</h3>
      <div className="mt-3 grid grid-cols-4 gap-3">
        {[{ n: "Overhead flat lay", f: "contrast(1.1) saturate(1.1)" }, { n: "Close-up steam shot", f: "sepia(0.2) saturate(1.3)" }, { n: "Lifestyle restaurant scene", f: "brightness(0.9) saturate(0.8)" }, { n: "Abstract artistic splash", f: "hue-rotate(-15deg) saturate(1.4)" }].map((d, i) => <button key={d.n} onClick={() => setSelectedDesign(i + 1)} className={`rounded-md border p-2 text-left ${selectedDesign === i + 1 ? "border-2 border-[#E53935]" : "border-[#FFCDD2]"}`}>
          <div className="h-24 w-full rounded bg-[#EF9A9A]">{upload ? <img src={upload.url} alt={d.n} className="h-full w-full rounded object-cover" style={{ filter: d.f }} /> : null}</div>
          <p className="mt-2 text-xs font-semibold">{`Design ${i + 1}`}</p>
          <p className="text-xs text-[#6B6B6B]">{d.n}</p>
        </button>)}
      </div>
      <div className="mt-3">
        <p className="text-sm font-semibold">Name this dish (speak or type):</p>
        <div className="mt-2 flex gap-2">
          <button className="h-9 w-9 rounded-full bg-[#E53935] text-white">🎤</button>
          <input className={input} value={dishName} onChange={(e) => setDishName(e.target.value)} />
        </div>
      </div>
      <div className="mt-2 flex gap-2 text-sm">
        <button onClick={() => setLanguage("en")} className={`rounded-md px-3 py-1 ${language === "en" ? "border border-[#E53935] bg-[#FFEBEE]" : "border border-[#FFCDD2]"}`}>English</button>
        <button onClick={() => setLanguage("te")} className={`rounded-md px-3 py-1 ${language === "te" ? "border border-[#E53935] bg-[#FFEBEE] font-semibold text-[#B71C1C]" : "border border-[#FFCDD2]"}`}>తెలుగు</button>
      </div>
      <div className="mt-3 whitespace-pre-line rounded-md border border-[#FFCDD2] bg-[#FFF5F5] p-3 text-sm">{caption}</div>
      <div className="mt-3 flex items-center gap-3 text-sm"><span>Choose platforms:</span><label><input type="checkbox" defaultChecked /> Instagram</label><label><input type="checkbox" defaultChecked /> Facebook</label><label><input type="checkbox" /> WhatsApp</label></div>
      <div className="mt-2 flex items-center gap-3 text-sm"><label><input type="radio" name="posttime" defaultChecked /> Post Now</label><label><input type="radio" name="posttime" /> Schedule</label><input className={input + " max-w-40"} type="time" defaultValue="18:00" /></div>
      <button onClick={() => setPosted(true)} className={`${btn} mt-3`}>Publish Post</button>
      {posted && <div className="mt-2 rounded-md border border-[#2E7D32] bg-green-50 p-2 text-sm text-[#2E7D32]">✓ Posted to Instagram & Facebook!</div>}
      <div className="mt-4"><h4 className="mb-2 font-semibold">Past posts</h4><p className="text-sm">3 May | Instagram | Mutton Biriyani | 248 | 1,840 | Published</p><p className="text-sm">1 May | Facebook | Prawn Fry | 112 | 760 | Published</p><p className="text-sm">28 Apr | Instagram | Gulab Jamun | 89 | 520 | Published</p></div>
    </div>}
  </div>;
}

function Surveillance({ onIncident }) {
  return <div className="space-y-4">
    <div className="flex items-center justify-between rounded-[10px] border border-[#FFCDD2] bg-white p-3"><p className="font-semibold">Spire.ai Surveillance — Live</p><p className="text-sm"><span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />1080p · 24fps</p></div>
    <div className="grid grid-cols-2 gap-4">
      {["CAM-01 Kitchen Pass|Z-01 PASS · 4 persons · safe|bg-slate-700|text-green-400", "CAM-02 Back of House|Z-02 PREP · busy|bg-slate-600|text-amber-300", "CAM-03 Cash Counter|Z-03 CASH · 2 persons · safe|bg-neutral-700|text-green-400", "CAM-04 Storage Room|Z-04 STORAGE · ALERT|bg-zinc-800|text-red-400"].map((x, i) => { const c = x.split("|"); return <div key={x} className={card + " p-2"}><div className={`relative h-40 rounded ${c[2]}`}><div className={`absolute left-4 top-4 border-2 ${i === 3 ? "border-red-500" : "border-green-500"} h-14 w-20`} /></div><p className={`mt-2 text-sm ${c[3]}`}>{c[0]} — {c[1]}</p></div>; })}
    </div>
    <div className="rounded-md border border-[#E53935] bg-[#FFEBEE] p-3 text-sm">⚠ SPIRE ALERT — 14:32:07 | CAM-04 | Storage Zone | Unauthorized person detected | Confidence: 91% | Captain notified</div>
    <div className="flex gap-2">{["Kitchen Pass", "Back of House", "Cash Counter", "Storage Room"].map((x, i) => <button key={x} className={`rounded-full border px-3 py-1 text-xs ${i === 3 ? "border-[#E53935] text-[#B71C1C]" : "border-[#FFCDD2]"}`}>{x} · {i === 3 ? "ALERT red" : "live green"}</button>)}</div>
    <div className={card + " p-4"}><h3 className="mb-2 font-semibold">Alert Log</h3><p className="text-sm">14:32 | CAM-04 | Unauthorized person in Storage | Confidence 91% | Captain alerted | <button onClick={onIncident} className="text-[#B71C1C]">View Screenshot</button></p><p className="text-sm">12:18 | CAM-02 | 6th person in Kitchen zone (max 5) | Confidence 87% | Warning sent | <button onClick={onIncident} className="text-[#B71C1C]">View Screenshot</button></p><p className="text-sm">09:45 | CAM-01 | Unknown person at Pass | Confidence 78% | Logged | <button onClick={onIncident} className="text-[#B71C1C]">View Screenshot</button></p></div>
  </div>;
}

function Inventory({ onPo }) {
  return <div className="space-y-4">
    <div className="rounded-[10px] border border-[#FFCDD2] bg-[#FFEBEE] p-4">Spire.ai tracks every ingredient — ask anything</div>
    <div className="flex gap-2"><input className={input} defaultValue="Where did my 50kg chicken go today?" /><button className={btn}>Ask Spire →</button></div>
    <div className={card + " p-4 text-sm"}><p>Analyzing your 50kg chicken stock for today...</p><p>→ 12.5kg used in 50 Chicken Biriyani plates (₹18,750 revenue)</p><p>→ 3.2kg used in Chicken Curry — 8 orders (₹2,240)</p><p>→ 35kg currently in cold storage (Fridge #2, Zone B)</p><p>→ 2.5kg UNACCOUNTED ⚠ — checking cameras...</p><p>→ Found: CAM-04 at 14:32 — suspicious activity flagged</p><button className={`${btn} mt-3`}>View Camera Incident</button></div>
    <div className={card + " p-4"}><table className="w-full text-left text-sm"><thead><tr><th>Item</th><th>Opening</th><th>Purchased</th><th>Used</th><th>Current</th><th>Status</th><th>Reorder</th></tr></thead><tbody>{["Chicken|50 kg|0|15.2 kg|34.8 kg|OK|10 kg", "Rice|100 kg|0|20 kg|80 kg|OK|20 kg", "Mutton|15 kg|0|3 kg|12 kg|LOW ⚠|10 kg", "Prawns|10 kg|0|2 kg|8 kg|OK|5 kg", "Cooking Oil|50 L|0|10 L|40 L|OK|15 L", "Onions|30 kg|0|8 kg|22 kg|OK|10 kg", "Tomatoes|20 kg|0|6 kg|14 kg|OK|8 kg", "Milk|20 L|0|8 L|12 L|LOW ⚠|10 L"].map((r) => <tr key={r} className="border-b border-[#FFEBEE]">{r.split("|").map((c) => <td key={c} className="py-1">{c}</td>)}</tr>)}</tbody></table></div>
    <button onClick={onPo} className={btn}>Generate Purchase Order</button>
  </div>;
}

function Pricing() {
  return <div className="space-y-4">
    <div className="text-center"><h2 className="text-3xl font-bold">Simple pricing. Powerful AI. Every day.</h2><p className="text-[#6B6B6B]">Less than a cup of chai per day for the AI that runs your restaurant.</p></div>
    <div className="mx-auto flex w-fit gap-2 rounded-md border border-[#FFCDD2] p-1"><button className="rounded-md bg-[#E53935] px-3 py-1 text-white">Yearly</button><button className="rounded-md px-3 py-1">Monthly</button></div>
    <div className="grid grid-cols-3 gap-4">
      <PriceCard title="Basic POS" price="₹68 /day" billed="billed as ₹25,000/year" features={["✓ Full POS billing", "✓ Table management", "✓ KOT system", "✓ Basic reports", "✓ Menu management", "✗ Spire.ai", "✗ Surveillance AI"]} action="Get Started" />
      <PriceCard title="Spire Starter" popular price="₹110 /day" billed="billed as ₹40,000/year" features={["✓ Everything in Basic +", "✓ Spire.ai voice assistant", "✓ Payroll automation", "✓ AI marketing (50 credits/mo)", "✓ Instagram & Facebook posting", "✗ Camera surveillance"]} action="Start Free Trial" solid />
      <PriceCard title="Spire Pro" price="₹137 /day" billed="billed as ₹50,000/year" features={["✓ Everything in Starter", "✓ Spire.ai cam surveillance", "✓ Inventory AI tracking", "✓ Unlimited marketing credits", "✓ Custom AI training", "✓ Priority support"]} action="Contact Sales" />
    </div>
    <p className="text-center text-sm text-[#6B6B6B]">All plans include: GST billing · Free onboarding · Telugu + English support · 24/7 Spire.ai chat</p>
  </div>;
}

function PriceCard({ title, price, billed, features, action, popular, solid }) {
  return <div className={`relative rounded-[10px] border bg-white p-4 ${popular ? "border-2 border-[#E53935]" : "border-[#FFCDD2]"}`}>{popular && <span className="absolute -top-3 left-4 rounded-full bg-[#E53935] px-2 py-1 text-xs text-white">MOST POPULAR</span>}<h3 className="font-semibold">{title}</h3><p className="mt-2 text-3xl font-bold">{price}</p><p className="text-sm text-[#6B6B6B]">{billed}</p><div className="mt-3 space-y-1 text-sm">{features.map((f) => <p key={f}>{f}</p>)}</div><button className={`mt-4 w-full rounded-md px-3 py-2 text-sm ${solid ? "bg-[#E53935] text-white hover:bg-[#c62828]" : "border border-[#E53935] text-[#B71C1C]"}`}>{action}</button></div>;
}

function SettingsPage() {
  return <div className="grid grid-cols-4 gap-4">
    <div className={card + " p-3"}><p className="mb-2 font-semibold">Tabs</p>{["Restaurant", "Users", "Spire.ai", "Payments", "Notifications", "Integrations"].map((x, i) => <div key={x} className={`mb-1 rounded-md px-2 py-1 text-sm ${i === 0 ? "bg-[#FFEBEE]" : ""}`}>{x}</div>)}</div>
    <div className={"col-span-3 " + card + " p-4"}>
      <h3 className="mb-3 font-semibold">Restaurant</h3>
      <div className="grid grid-cols-2 gap-3"><input className={input} defaultValue="Ravi's Kitchen" /><input className={input} defaultValue="Ravi Kumar" /><input className={input} defaultValue="+91 98765 43210" /><input className={input} defaultValue="37AABCU9603R1ZX" /><input className={"col-span-2 " + input} defaultValue="MG Road, Vijayawada, AP 520010" /></div>
      <div className="mt-3 rounded-md border border-dashed border-[#E53935] p-4 text-sm">Logo upload area</div>
      <div className="mt-3 rounded-md border border-[#FFCDD2] bg-[#FFF5F5] p-3 text-sm"><p>Spire.ai settings preview: Language Telugu / English, Voice sensitivity, Auto-post toggle, Inventory threshold 20%, Surveillance confidence 85%, Plan: Spire Pro</p></div>
      <button className={`${btn} mt-3`}>Save</button>
    </div>
  </div>;
}

function SpirePanel() {
  return <div className="fixed bottom-0 right-0 top-0 z-40 w-[350px] border-l border-[#FFCDD2] bg-white p-4">
    <h3 className="font-semibold">Spire.ai Assistant</h3>
    <div className="mt-4 space-y-3 text-sm">
      <div className="rounded-md bg-[#FFF5F5] p-2">User: Spire, where did my 50kg chicken go today?</div>
      <div className="rounded-md bg-[#FFEBEE] p-2">Spire: Analyzing sales + inventory + cameras... Found: 12.5kg used in 50 biriyani plates (₹37,500 revenue). 35kg in fridge. 2.5kg unaccounted — flagged 1 camera incident at 14:32. Showing now ↓</div>
      <div className="rounded-md border border-[#E53935] bg-[#FFEBEE] p-2">CAM-03 | 14:32:07 | Storage Zone | Confidence: 91%</div>
    </div>
  </div>;
}

export default App;
