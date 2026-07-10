// ─────────────────────────────────────────────────────────────────────────────
// AdminReports — Sales, GST, and performance reports with charts and export
// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive reporting dashboard with multiple report types:
//   - Daily Sales: revenue, orders, average bill, trend charts
//   - Item-wise: top selling items by quantity and revenue
//   - Category-wise: revenue breakdown by menu category (pie chart)
//   - Payment Methods: cash/card/UPI/upi breakdown (bar chart)
//   - Discounts: discount analysis by captain and type
//   - GST: CGST/SGST liability report for tax filing
//   - Captain Performance: revenue per captain, target vs actual
//
// Features:
//   - Date range picker with IST timezone awareness
//   - Realcharts visualizations (area, bar, pie charts)
//   - PDF and Excel export via reportDownloads.js
//   - Auto-refresh with loading states
//   - Search and filter within report data
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Banknote, BarChart2, ChevronDown, Coffee, CreditCard, Download, FileSpreadsheet, FileText, Layers,
  RefreshCw, Search, Smartphone, TrendingUp, DollarSign, Package, AlertTriangle,
  ArrowUpDown, Wallet,
} from 'lucide-react';
import { StarIcon } from '../shared/icons/StarIcon';
import { getKolkataDateString, shiftKolkataDate } from '../shared/utils/dateFormat.js';
import {
  fetchReportDailySales, fetchReportCategorywise,
  fetchReportPaymentMethods, fetchReportDiscounts, fetchReportGST,
} from '../services/reportsApi.js';
import { downloadPDF, downloadExcel } from './reportDownloads.js';
import { useAuth } from '../context/AuthContext';
import { API_BASE, apiFetch, getAuthHeaders } from '../services/apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import OperationsDashboard from './OperationsDashboard';

const BEVERAGE_KEYWORDS = [
  'water', 'sprite', 'thums up', 'thumsup', 'tin thums', 'soda', 'cola', 'coke', 'pepsi',
  'limca', 'fanta', 'mirinda', '7up', 'pulpy orange', 'fresh lime', 'mojitho', 'mojito',
  'moctail', 'mocktail', 'fruit punch', 'lassi', 'butter milk', 'buttermilk', 'milk shake',
  'milkshake', 'monster', 'charged', 'red bull', 'coolberg', 'juice',
];

const BEVERAGE_ALIASES = {
  'thumsup': 'thums up',
  'thums': 'thums up',
  'tin thums': 'thums up',
  'butter milk': 'buttermilk',
  'milk shake': 'milkshake',
  'moctail': 'mocktail',
  'mojitho': 'mojito',
};

function normalizeBeverageNameForAnalytics(name) {
  let normalized = String(name || '').toLowerCase();
  normalized = normalized
    .replace(/\b(tin|bottle|bottel|pet|can|glass|pack|packs)\b/g, ' ')
    .replace(/\s+\d+(\.\d+)?\s*(ml|mls|milliliter|millilitre|l|ltr|liter|litre|lt|lts)\b/g, ' ')
    .replace(/\s+\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return BEVERAGE_ALIASES[normalized] || normalized;
}

function getReportCategoryFromAnalytics(item) {
  if (item.type === 'liquor') return 'Liquor';
  const normalizedName = normalizeBeverageNameForAnalytics(String(item.name || ''));
  if (BEVERAGE_KEYWORDS.some((k) => normalizedName.includes(k))) return 'Beverages';
  return 'Food';
}

async function fetchItemwiseAnalytics(startDate, endDate, categoryFilter = 'all') {
  const restaurantId = getCurrentRestaurantId();
  const outletParam = categoryFilter !== 'all' ? `&outletType=${categoryFilter}` : '';
  const url = `${API_BASE}/api/reports/itemwise-sales?restaurantId=${restaurantId}&startDate=${startDate}&endDate=${endDate}${outletParam}`;
  const res = await fetch(url, { headers: getAuthHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch itemwise sales report');
  const raw = await res.json();
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  const itemMap = new Map();
  for (const it of rawItems) {
    const category = it.reportCategory || getReportCategoryFromAnalytics(it);
    const key = category === 'Beverages' ? (it.name || '').toLowerCase().trim() : it.name;
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        name: it.name,
        category: it.category || category,
        menuType: it.menuType === 'LIQUOR' ? 'LIQUOR' : 'FOOD',
        reportCategory: category,
        quantitySold: 0,
        totalRevenue: 0,
        orderCount: 0,
      });
    }
    const rec = itemMap.get(key);
    rec.quantitySold += it.quantitySold || it.quantity || 0;
    rec.totalRevenue += it.totalRevenue || it.revenue || 0;
    rec.orderCount += it.orderCount || 0;
  }

  let items = Array.from(itemMap.values());
  if (categoryFilter === 'food') {
    items = items.filter((it) => it.reportCategory === 'Food');
  } else if (categoryFilter === 'liquor') {
    items = items.filter((it) => it.reportCategory === 'Liquor');
  } else if (categoryFilter === 'beverages') {
    items = items.filter((it) => it.reportCategory === 'Beverages');
  }

  const totalRevenueAll = items.reduce((s, it) => s + it.totalRevenue, 0);
  const totalQuantityAll = items.reduce((s, it) => s + it.quantitySold, 0);
  const foodRevenue = items.filter((it) => it.reportCategory === 'Food').reduce((s, it) => s + it.totalRevenue, 0);
  const liquorRevenue = items.filter((it) => it.reportCategory === 'Liquor').reduce((s, it) => s + it.totalRevenue, 0);
  const beveragesRevenue = items.filter((it) => it.reportCategory === 'Beverages').reduce((s, it) => s + it.totalRevenue, 0);

  const finalItems = items
    .map((it) => ({
      name: it.name,
      category: it.category,
      menuType: it.menuType,
      reportCategory: it.reportCategory,
      quantitySold: it.quantitySold,
      unitPrice: it.quantitySold > 0 ? it.totalRevenue / it.quantitySold : 0,
      totalRevenue: it.totalRevenue,
      revenuePercent: totalRevenueAll > 0 ? (it.totalRevenue / totalRevenueAll) * 100 : 0,
      orderCount: it.orderCount,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return {
    items: finalItems,
    summary: {
      totalItems: finalItems.length,
      totalQuantity: totalQuantityAll,
      totalRevenue: totalRevenueAll,
      foodRevenue,
      liquorRevenue,
      beveragesRevenue,
    },
    dateRange: raw.dateRange,
  };
}

const REPORT_CATEGORIES = [
  {
    key: 'overview', label: 'Overview',
    reports: [{ id: 'overview', label: 'Executive Summary', icon: Layers, urgent: true }],
  },
  {
    key: 'sales', label: 'Sales & Revenue',
    reports: [
      { id: 'daily-sales', label: 'Daily Sales Summary', icon: TrendingUp, urgent: true },
      { id: 'itemwise-sales', label: 'Item-wise Sales', icon: Package, urgent: true },
      { id: 'categorywise-sales', label: 'Category-wise Sales', icon: Layers, urgent: true },
      { id: 'payment-methods', label: 'Payment Method Breakdown', icon: CreditCard, urgent: true },
      { id: 'venue-revenue', label: 'Venue-wise Revenue', icon: BarChart2, urgent: false },
      { id: 'monthly-pl', label: 'Monthly P&L', icon: DollarSign, urgent: false },
    ],
  },
  {
    key: 'operations', label: 'Operations',
    reports: [
      { id: 'operations-dashboard', label: 'Operations Dashboard', icon: BarChart2, urgent: true },
      { id: 'xreport-view', label: 'X Report View', icon: FileText, urgent: true },
      { id: 'discount-report', label: 'Discount Report', icon: StarIcon, urgent: true },
      { id: 'cancelled-items', label: 'Cancelled / Edited Items', icon: AlertTriangle, urgent: false },
      { id: 'table-utilization', label: 'Table Utilization', icon: BarChart2, urgent: false },
      { id: 'hourly-report', label: 'Hourly Analysis', icon: BarChart2, urgent: false },
    ],
  },
  {
    key: 'gst', label: 'GST & Compliance',
    reports: [
      { id: 'gst-report', label: 'GST Report', icon: FileText, urgent: true },
      { id: 'kot-count', label: 'KOT Count Report', icon: Package, urgent: false },
    ],
  },
  {
    key: 'customer', label: 'Customer Insights',
    reports: [
      { id: 'captain-performance', label: 'Captain Performance', icon: StarIcon, urgent: false },
    ],
  },
];

const DEFAULT_REPORT = 'overview';

function getDateRange(type) {
  const today = getKolkataDateString();
  switch (type) {
    case 'today': return { startDate: today, endDate: today };
    case 'yesterday': { const y = shiftKolkataDate(new Date(), -1); return { startDate: y, endDate: y }; }
    case 'this-week': {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const start = getKolkataDateString(new Date(d.setDate(diff)));
      return { startDate: start, endDate: today };
    }
    case 'this-month': {
      const [y, m] = today.split('-');
      return { startDate: `${y}-${m}-01`, endDate: today };
    }
    default: return { startDate: today, endDate: today };
  }
}

function ReportDateFilter({ value, onChange }) {
  const { type, startDate, endDate } = value;
  const pills = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'this-week', label: 'This Week' },
    { key: 'this-month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ];
  const setType = (t) => {
    const range = getDateRange(t);
    onChange({ type: t, startDate: range.startDate, endDate: range.endDate });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap bg-[#F4F4F5] p-1 rounded-xl">
        {pills.map((p) => (
          <button
            key={p.key}
            onClick={() => setType(p.key)}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
              type === p.key ? 'bg-white text-[#B71C1C] shadow' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {type === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={startDate}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            className="px-2 py-1.5 text-xs border border-[#FFCDD2] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#B71C1C]" />
          <span className="text-gray-400 text-xs font-bold">to</span>
          <input type="date" value={endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            className="px-2 py-1.5 text-xs border border-[#FFCDD2] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#B71C1C]" />
        </div>
      )}
    </div>
  );
}

function Money({ value }) {
  if (value == null) return '—';
  return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm relative overflow-hidden group">
      <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
        <Icon size={48} />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-[10px] font-bold mt-2 text-gray-500">{sub}</p>}
    </div>
  );
}

function ReportHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm gap-4">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-[#FFEBEE] flex items-center justify-center text-[#B71C1C] shadow-inner">
          <BarChart2 size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">{title}</h2>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-2">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex h-96 items-center justify-center bg-white rounded-3xl border border-[#FFCDD2] shadow-sm">
      <RefreshCw className="animate-spin text-[#B71C1C]" size={40} />
    </div>
  );
}

function ErrorCard({ onRetry }) {
  return (
    <div className="bg-white p-8 rounded-3xl border border-[#FFCDD2] shadow-sm text-center">
      <AlertTriangle size={40} className="mx-auto text-[#B71C1C] mb-4" />
      <p className="text-sm font-bold text-gray-700">Failed to load report.</p>
      <p className="text-xs text-gray-500 mb-4">Please check your connection and try again.</p>
      <button onClick={onRetry} className="bg-[#B71C1C] text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest">Retry</button>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="bg-white p-8 rounded-3xl border border-[#FFCDD2] shadow-sm text-center">
      <BarChart2 size={40} className="mx-auto text-gray-300 mb-4" />
      <p className="text-sm font-bold text-gray-500">No transactions found for this period.</p>
    </div>
  );
}

function DownloadButtons({ onPDF, onExcel }) {
  return (
    <>
      <button onClick={onPDF} className="flex items-center gap-2 bg-[#F4F4F5] text-gray-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-colors">
        <FileText size={14} /> PDF
      </button>
      <button onClick={onExcel} className="flex items-center gap-2 bg-[#B71C1C] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#8E1414] transition-colors">
        <FileSpreadsheet size={14} /> Excel
      </button>
    </>
  );
}

// ── Placeholder reports (to be replaced in chunks) ───────────────────────
function ExecutiveSummary({ dateFilter, outletId, onDownloadRef }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try { const res = await fetchReportDailySales(dateFilter.startDate, dateFilter.endDate, outletId); setData(res); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [dateFilter, outletId]);

  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;
  const doPDF = () => {
    if (!data) return;
    const headers = [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }];
    const rows = [
      { metric: 'Total Sales', value: data.summary.totalSales ?? data.summary.totalSubtotal },
      { metric: 'Net Sales', value: data.summary.netSales },
      { metric: 'Total Transactions', value: data.summary.totalTransactions },
      { metric: 'Average Bill Value', value: data.summary.averageBillValue },
      { metric: 'Total Discount', value: data.summary.totalDiscount },
    ];
    downloadPDF({ title: 'Executive Summary', dateRange: dateRangeText, headers, rows, filename: 'Executive-Summary' });
  };
  const doExcel = () => {
    if (!data) return;
    downloadExcel({ title: 'Executive Summary', dateRange: dateRangeText, filename: 'Executive-Summary',
      sheets: [{ name: 'Summary', headers: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }],
        rows: [
          { metric: 'Total Sales', value: data.summary.totalSales ?? data.summary.totalSubtotal },
          { metric: 'Net Sales', value: data.summary.netSales },
          { metric: 'Total Transactions', value: data.summary.totalTransactions },
          { metric: 'Average Bill Value', value: data.summary.averageBillValue },
          { metric: 'Total Discount', value: data.summary.totalDiscount },
        ],
      }],
    });
  };
  useEffect(() => { onDownloadRef.current = { pdf: doPDF, excel: doExcel }; }, [data, dateFilter]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard onRetry={fetchData} />;
  if (!data || data.summary.totalTransactions === 0) return <EmptyCard />;

  const trend = data.byDay.map((d) => ({ time: d.date, rev: d.revenue }));
  const methods = data.byMethod ? Object.entries(data.byMethod).map(([name, v]) => ({
    name, value: Math.round((v.amount / (data.summary.totalSales ?? data.summary.totalSubtotal ?? 1)) * 100),
  })) : [];

  return (
    <div className="space-y-6">
      <ReportHeader title="Executive Summary" subtitle="Real-time Operational Analytics">
        <DownloadButtons onPDF={doPDF} onExcel={doExcel} />
      </ReportHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sales" value={<Money value={data.summary.totalSales ?? data.summary.totalSubtotal} />} sub="With GST, after discount" icon={DollarSign} color="text-green-600" />
        <StatCard label="Net Sales" value={<Money value={data.summary.netSales} />} sub="Excl. GST, after discount" icon={TrendingUp} color="text-blue-600" />
        <StatCard label="Transactions" value={data.summary.totalTransactions} sub="Real-time Order Volume" icon={Package} color="text-amber-600" />
        <StatCard label="Total Discount" value={<Money value={data.summary.totalDiscount} />} sub="Discounts in this period" icon={StarIcon} color="text-purple-600" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm animate-chart-in">
          <h3 className="font-black text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-[#B71C1C]" /> Revenue Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs><linearGradient id="esColorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#B71C1C" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#B71C1C" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold', fontSize: '12px' }} />
                <Area type="monotone" dataKey="rev" stroke="#B71C1C" strokeWidth={3} fillOpacity={1} fill="url(#esColorRev)" isAnimationActive={true} animationDuration={1000} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm flex flex-col animate-chart-in-delay-1">
          <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2">
            <Layers size={18} className="text-[#B71C1C]" /> Payment Mix
          </h3>
          <div className="flex-grow flex flex-col justify-center">
            <div className="h-[200px] w-full relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={methods} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={8} stroke="none" isAnimationActive={true} animationDuration={800} animationEasing="ease-out">
                    {methods.map((_entry, i) => <Cell key={i} fill={['#B71C1C','#E53935','#EF9A9A','#FFCDD2'][i%4]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px] font-black text-gray-400 uppercase">Total</p>
                <p className="text-xl font-black text-gray-900">{data.summary.totalTransactions}</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {methods.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#F4F4F5]">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${['bg-[#B71C1C]','bg-[#E53935]','bg-[#EF9A9A]','bg-[#FFCDD2]'][i%4]}`} />
                    <span className="text-xs font-bold text-gray-700">{m.name}</span>
                  </div>
                  <span className="text-xs font-black text-gray-900">{m.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DailySalesReport({ dateFilter, outletId, onDownloadRef }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try { const res = await fetchReportDailySales(dateFilter.startDate, dateFilter.endDate, outletId); setData(res); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [dateFilter, outletId]);

  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;
  const doPDF = () => {
    if (!data) return;
    const headers = [
      { key: 'outlet', label: 'Outlet' }, { key: 'transactions', label: 'Transactions' },
      { key: 'revenue', label: 'Total Sales', format: 'money' }, { key: 'avgBill', label: 'Avg Bill', format: 'money' },
    ];
    const rows = Object.entries(data.byOutlet || {}).map(([outlet, v]) => ({
      outlet: outlet.charAt(0).toUpperCase() + outlet.slice(1), transactions: v.count,
      revenue: v.amount, avgBill: v.count > 0 ? Math.round(v.amount / v.count) : 0,
    }));
    rows.push({ outlet: 'Total', transactions: data.summary.totalTransactions, revenue: data.summary.totalSales ?? data.summary.totalSubtotal, avgBill: data.summary.averageBillValue });
    downloadPDF({ title: 'Daily Sales Summary', dateRange: dateRangeText, headers, rows, filename: 'Daily-Sales' });
  };
  const doExcel = () => {
    if (!data) return;
    const outletHeaders = [
      { key: 'outlet', label: 'Outlet' }, { key: 'transactions', label: 'Transactions' },
      { key: 'revenue', label: 'Total Sales', format: 'money' }, { key: 'avgBill', label: 'Avg Bill', format: 'money' },
    ];
    const outletRows = Object.entries(data.byOutlet || {}).map(([outlet, v]) => ({
      outlet: outlet.charAt(0).toUpperCase() + outlet.slice(1), transactions: v.count,
      revenue: v.amount, avgBill: v.count > 0 ? Math.round(v.amount / v.count) : 0,
    }));
    const methodHeaders = [{ key: 'method', label: 'Method' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount', format: 'money' }];
    const methodRows = Object.entries(data.byMethod || {}).map(([method, v]) => ({ method, count: v.count, amount: v.amount }));
    downloadExcel({ title: 'Daily Sales Summary', dateRange: dateRangeText, filename: 'Daily-Sales',
      sheets: [
        { name: 'By Outlet', headers: outletHeaders, rows: outletRows },
        { name: 'By Method', headers: methodHeaders, rows: methodRows },
      ],
    });
  };
  useEffect(() => { onDownloadRef.current = { pdf: doPDF, excel: doExcel }; }, [data, dateFilter]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard onRetry={fetchData} />;
  if (!data || data.summary.totalTransactions === 0) return <EmptyCard />;

  const outlets = Object.entries(data.byOutlet || {});
  const methods = Object.entries(data.byMethod || {});
  const trend = data.byDay.map((d) => ({ time: d.date, rev: d.revenue }));
  const daysCount = data.byDay.length;

  return (
    <div className="space-y-6">
      <ReportHeader title="Daily Sales Summary" subtitle="Outlet & Method Breakdown">
        <DownloadButtons onPDF={doPDF} onExcel={doExcel} />
      </ReportHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sales" value={<Money value={data.summary.totalSales ?? data.summary.totalSubtotal} />} sub="With GST, after discount" icon={DollarSign} color="text-green-600" />
        <StatCard label="Net Sales" value={<Money value={data.summary.netSales} />} sub="Excl. GST, after discount" icon={TrendingUp} color="text-blue-600" />
        <StatCard label="Transactions" value={data.summary.totalTransactions} sub="Bills settled" icon={Package} color="text-amber-600" />
        <StatCard label="Total Discount" value={<Money value={data.summary.totalDiscount} />} sub="Discounts given" icon={StarIcon} color="text-purple-600" />
      </div>
      <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
        <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Outlet Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Outlet</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Transactions</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Total Sales</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Avg Bill</th>
              </tr>
            </thead>
            <tbody>
              {outlets.map(([outlet, v]) => (
                <tr key={outlet} className="border-b border-[#FFCDD2]/50 hover:bg-[#FFF5F5]">
                  <td className="px-4 py-3 font-bold text-gray-700 capitalize">{outlet}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-700">{v.count}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900"><Money value={v.amount} /></td>
                  <td className="px-4 py-3 text-right font-bold text-gray-700"><Money value={v.count > 0 ? Math.round(v.amount / v.count) : 0} /></td>
                </tr>
              ))}
              <tr className="bg-[#F9FAFB] font-black">
                <td className="px-4 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-gray-900">{data.summary.totalTransactions}</td>
                <td className="px-4 py-3 text-right text-gray-900"><Money value={data.summary.totalRevenue} /></td>
                <td className="px-4 py-3 text-right text-gray-900"><Money value={data.summary.averageBillValue} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm animate-chart-in">
          <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Payment Methods</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart layout="vertical" data={methods.map(([m, v]) => ({ method: m, amount: v.amount }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dsBarGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#B71C1C" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#B71C1C" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="method" type="category" tick={{ fontSize: 11, fontWeight: 'bold' }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} formatter={(v) => ['₹' + Number(v).toLocaleString('en-IN'), 'Amount']} />
                <Bar dataKey="amount" fill="url(#dsBarGrad)" radius={[0, 8, 8, 0]} barSize={24} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Highest & Lowest Bill</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#FFF5F5] p-5 rounded-2xl border border-[#FFCDD2]">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Highest Bill</p>
              <p className="text-2xl font-black text-gray-900 mb-1"><Money value={data.summary.highestBill?.amount} /></p>
              <p className="text-xs text-gray-500">Table {data.summary.highestBill?.tableNumber} • {data.summary.highestBill?.method}</p>
            </div>
            <div className="bg-[#F4F4F5] p-5 rounded-2xl border border-[#E5E5E5]">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Lowest Bill</p>
              <p className="text-2xl font-black text-gray-900 mb-1"><Money value={data.summary.lowestBill?.amount} /></p>
              <p className="text-xs text-gray-500">Table {data.summary.lowestBill?.tableNumber} • {data.summary.lowestBill?.method}</p>
            </div>
          </div>
        </div>
      </div>
      {daysCount > 1 && (
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm animate-chart-in-delay-1">
          <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Daily Trend</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs><linearGradient id="dsColorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#B71C1C" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#B71C1C" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold', fontSize: '12px' }} />
                <Area type="monotone" dataKey="rev" stroke="#B71C1C" strokeWidth={3} fillOpacity={1} fill="url(#dsColorRev)" isAnimationActive={true} animationDuration={1000} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
function ItemwiseSalesReport({ dateFilter, outletId, onDownloadRef }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [outletType, setOutletType] = useState('all');
  const [sortKey, setSortKey] = useState('totalRevenue');
  const [sortDir, setSortDir] = useState('desc');
  const [showAll, setShowAll] = useState(false);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try { const res = await fetchItemwiseAnalytics(dateFilter.startDate, dateFilter.endDate, outletType); setData(res); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [dateFilter, outletType]);

  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;
  const doPDF = () => {
    if (!data) return;
    const headers = [
      { key: 'name', label: 'Item Name' }, { key: 'category', label: 'Category' },
      { key: 'reportCategory', label: 'Type' }, { key: 'quantitySold', label: 'Qty Sold' },
      { key: 'unitPrice', label: 'Unit Price', format: 'money' },
      { key: 'totalRevenue', label: 'Total Revenue', format: 'money' },
      { key: 'revenuePercent', label: 'Rev %', format: 'percent' },
    ];
    downloadPDF({ title: 'Item-wise Sales', dateRange: dateRangeText, headers, rows: data.items, filename: 'Itemwise-Sales' });
  };
  const doExcel = () => {
    if (!data) return;
    downloadExcel({ title: 'Item-wise Sales', dateRange: dateRangeText, filename: 'Itemwise-Sales',
      sheets: [{ name: 'Items', headers: [
        { key: 'name', label: 'Item Name' }, { key: 'category', label: 'Category' },
        { key: 'reportCategory', label: 'Type' }, { key: 'quantitySold', label: 'Qty Sold' },
        { key: 'unitPrice', label: 'Unit Price', format: 'money' },
        { key: 'totalRevenue', label: 'Total Revenue', format: 'money' },
        { key: 'revenuePercent', label: 'Rev %', format: 'percent' },
      ], rows: data.items }],
    });
  };
  useEffect(() => { onDownloadRef.current = { pdf: doPDF, excel: doExcel }; }, [data, dateFilter]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard onRetry={fetchData} />;
  if (!data || data.summary.totalItems === 0) return <EmptyCard />;

  const sorted = [...data.items].sort((a, b) => {
    const av = a[sortKey] ?? 0; const bv = b[sortKey] ?? 0;
    return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
  });
  const shown = showAll ? sorted : sorted.slice(0, 50);

  return (
    <div className="space-y-6">
      <ReportHeader title="Item-wise Sales" subtitle="Best & worst performing items">
        <div className="flex items-center gap-2">
          <div className="flex bg-[#F4F4F5] p-1 rounded-xl">
            {['all', 'food', 'beverages', 'liquor'].map((t) => (
              <button key={t} onClick={() => setOutletType(t)}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${outletType === t ? 'bg-white text-[#B71C1C] shadow' : 'text-gray-400 hover:text-gray-600'}`}>
                {t === 'all' ? 'All' : t === 'food' ? 'Food' : t === 'beverages' ? 'Beverages' : 'Liquor'}
              </button>
            ))}
          </div>
          <DownloadButtons onPDF={doPDF} onExcel={doExcel} />
        </div>
      </ReportHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Items" value={data.summary.totalItems} sub="Unique SKUs" icon={Package} color="text-blue-600" />
        <StatCard label="Total Quantity" value={data.summary.totalQuantity} sub="Units sold" icon={TrendingUp} color="text-amber-600" />
        <StatCard label="Food Revenue" value={<Money value={data.summary.foodRevenue} />} sub="Food items" icon={DollarSign} color="text-green-600" />
        <StatCard label="Beverages Revenue" value={<Money value={data.summary.beveragesRevenue} />} sub="Beverage items" icon={Coffee} color="text-blue-600" />
        <StatCard label="Liquor Revenue" value={<Money value={data.summary.liquorRevenue} />} sub="Liquor items" icon={StarIcon} color="text-purple-600" />
      </div>
      <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Items</h3>
          {sorted.length > 50 && (
            <button onClick={() => setShowAll((v) => !v)} className="text-[10px] font-black uppercase tracking-widest text-[#B71C1C]">
              {showAll ? 'Show Top 50' : 'Show All'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">#</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400 cursor-pointer" onClick={() => toggleSort('name')}>
                  Item <ArrowUpDown size={10} className="inline ml-1" />
                </th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Category</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Type</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400 cursor-pointer" onClick={() => toggleSort('quantitySold')}>
                  Qty <ArrowUpDown size={10} className="inline ml-1" />
                </th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Unit Price</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400 cursor-pointer" onClick={() => toggleSort('totalRevenue')}>
                  Revenue <ArrowUpDown size={10} className="inline ml-1" />
                </th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Rev %</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it, idx) => (
                <tr key={it.name + idx} className="border-b border-[#FFCDD2]/50 hover:bg-[#FFF5F5]">
                  <td className="px-3 py-3 text-gray-500 text-xs">{idx + 1}</td>
                  <td className="px-3 py-3 font-bold text-gray-900">{it.name}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{it.category}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                      it.reportCategory === 'Liquor' ? 'bg-amber-100 text-amber-700' :
                      it.reportCategory === 'Beverages' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {it.reportCategory || it.menuType}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-gray-700">{it.quantitySold}</td>
                  <td className="px-3 py-3 text-right font-bold text-gray-700"><Money value={it.unitPrice} /></td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900"><Money value={it.totalRevenue} /></td>
                  <td className="px-3 py-3 text-right">
                    <div className="w-20 h-2 bg-gray-100 rounded-full ml-auto overflow-hidden">
                      <div className="h-full bg-[#B71C1C] rounded-full" style={{ width: `${Math.min(it.revenuePercent, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 font-bold">{it.revenuePercent}%</span>
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

function CategorywiseSalesReport({ dateFilter, outletId, onDownloadRef }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try { const res = await fetchReportCategorywise(dateFilter.startDate, dateFilter.endDate, outletId); setData(res); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [dateFilter, outletId]);

  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;
  const doPDF = () => {
    if (!data) return;
    const headers = [
      { key: 'name', label: 'Category' }, { key: 'itemCount', label: 'Items' },
      { key: 'totalQuantity', label: 'Qty Sold' },
      { key: 'totalRevenue', label: 'Revenue', format: 'money' },
      { key: 'revenuePercent', label: 'Rev %', format: 'percent' },
    ];
    downloadPDF({ title: 'Category-wise Sales', dateRange: dateRangeText, headers, rows: data.categories, filename: 'Categorywise-Sales' });
  };
  const doExcel = () => {
    if (!data) return;
    downloadExcel({ title: 'Category-wise Sales', dateRange: dateRangeText, filename: 'Categorywise-Sales',
      sheets: [{ name: 'Categories', headers: [
        { key: 'name', label: 'Category' }, { key: 'itemCount', label: 'Items' },
        { key: 'totalQuantity', label: 'Qty Sold' },
        { key: 'totalRevenue', label: 'Revenue', format: 'money' },
        { key: 'revenuePercent', label: 'Rev %', format: 'percent' },
      ], rows: data.categories }],
    });
  };
  useEffect(() => { onDownloadRef.current = { pdf: doPDF, excel: doExcel }; }, [data, dateFilter]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard onRetry={fetchData} />;
  if (!data || data.categories.length === 0) return <EmptyCard />;

  const top6 = data.categories.slice(0, 6);
  const others = data.categories.slice(6);
  const othersRevenue = others.reduce((s, c) => s + c.totalRevenue, 0);
  const pieData = [...top6.map((c) => ({ name: c.name, value: c.totalRevenue }))];
  if (others.length > 0) pieData.push({ name: 'Others', value: othersRevenue });
  const categoryColors = { Food: '#B71C1C', Liquor: '#E53935', Beverages: '#2563EB' };
  const colors = pieData.map((c) => categoryColors[c.name] || '#EF9A9A');

  return (
    <div className="space-y-6">
      <ReportHeader title="Category-wise Sales" subtitle="Revenue by menu category">
        <DownloadButtons onPDF={doPDF} onExcel={doExcel} />
      </ReportHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm animate-chart-in">
          <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Revenue Distribution</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={4} stroke="none" isAnimationActive={true} animationDuration={800} animationEasing="ease-out">
                  {pieData.map((_e, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => ['₹' + Number(v).toLocaleString('en-IN'), 'Revenue']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Category Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
                <tr>
                  <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Category</th>
                  <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Items</th>
                  <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Qty</th>
                  <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Revenue</th>
                  <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">%</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.name} className="border-b border-[#FFCDD2]/50 hover:bg-[#FFF5F5]">
                    <td className="px-3 py-3 font-bold text-gray-900">{c.name}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{c.itemCount}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{c.totalQuantity}</td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900"><Money value={c.totalRevenue} /></td>
                    <td className="px-3 py-3 text-right">
                      <div className="w-16 h-2 bg-gray-100 rounded-full ml-auto overflow-hidden">
                        <div className={`h-full rounded-full ${c.name === 'Beverages' ? 'bg-blue-200' : c.name === 'Liquor' ? 'bg-red-300' : 'bg-red-200'}`} style={{ width: `${Math.min(c.revenuePercent, 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 font-bold">{c.revenuePercent}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
function PaymentMethodsReport({ dateFilter, outletId, onDownloadRef }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try { const res = await fetchReportPaymentMethods(dateFilter.startDate, dateFilter.endDate, outletId); setData(res); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [dateFilter, outletId]);

  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;
  const doPDF = () => {
    if (!data) return;
    const headers = [
      { key: 'date', label: 'Date' },
      { key: 'CASH', label: 'Cash', format: 'money' },
      { key: 'CARD', label: 'Card', format: 'money' },
      { key: 'UPI', label: 'UPI', format: 'money' },
      { key: 'OTHER', label: 'Other', format: 'money' },
      { key: 'total', label: 'Total', format: 'money' },
    ];
    const rows = (data.byDay || []).map((d) => ({
      date: d.date,
      CASH: d.CASH || 0,
      CARD: d.CARD || 0,
      UPI: d.UPI || 0,
      OTHER: d.OTHER || 0,
      total: (d.CASH || 0) + (d.CARD || 0) + (d.UPI || 0) + (d.OTHER || 0),
    }));
    downloadPDF({ title: 'Payment Method Breakdown', dateRange: dateRangeText, headers, rows, filename: 'Payment-Methods' });
  };
  const doExcel = () => {
    if (!data) return;
    downloadExcel({ title: 'Payment Method Breakdown', dateRange: dateRangeText, filename: 'Payment-Methods',
      sheets: [{ name: 'Daily', headers: [
        { key: 'date', label: 'Date' },
        { key: 'CASH', label: 'Cash', format: 'money' },
        { key: 'CARD', label: 'Card', format: 'money' },
        { key: 'UPI', label: 'UPI', format: 'money' },
        { key: 'OTHER', label: 'Other', format: 'money' },
        { key: 'total', label: 'Total', format: 'money' },
      ], rows: (data.byDay || []).map((d) => ({
        date: d.date,
        CASH: d.CASH || 0,
        CARD: d.CARD || 0,
        UPI: d.UPI || 0,
        OTHER: d.OTHER || 0,
        total: (d.CASH || 0) + (d.CARD || 0) + (d.UPI || 0) + (d.OTHER || 0),
      })) }],
    });
  };
  useEffect(() => { onDownloadRef.current = { pdf: doPDF, excel: doExcel }; }, [data, dateFilter]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard onRetry={fetchData} />;
  if (!data || data.summary.totalTransactions === 0) return <EmptyCard />;

  const methodIcons = { CASH: Banknote, CARD: CreditCard, UPI: Smartphone, OTHER: Wallet };
  const methodMeta = data.methods || [];
  const byDay = data.byDay || [];
  const daysCount = byDay.length;
  const totalTips = data.summary?.totalTips || 0;

  return (
    <div className="space-y-6">
      <ReportHeader title="Payment Method Breakdown" subtitle="How customers are paying">
        <DownloadButtons onPDF={doPDF} onExcel={doExcel} />
      </ReportHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {methodMeta.map((m) => {
          const Icon = methodIcons[m.method] || Banknote;
          return (
            <div key={m.method} className="bg-white p-5 rounded-2xl border border-[#FFCDD2] shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-[#FFEBEE] flex items-center justify-center text-[#B71C1C]">
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{m.method}</p>
                  <p className="text-xl font-black text-gray-900"><Money value={m.amount} /></p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 font-bold">
                <span>{m.count} txns</span>
                <span>{m.percent}%</span>
              </div>
            </div>
          );
        })}
      </div>
      {totalTips > 0 && (
        <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Total Tips Collected</p>
              <p className="text-xl font-black text-gray-900"><Money value={totalTips} /></p>
            </div>
          </div>
        </div>
      )}
      {daysCount > 1 && (
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm animate-chart-in">
          <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Daily Payment Trend</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={byDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} formatter={(v) => ['₹' + Number(v).toLocaleString('en-IN'), '']} />
                <Bar dataKey="CASH" stackId="a" fill="#B71C1C" radius={[0,0,0,0]} barSize={24} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                <Bar dataKey="CARD" stackId="a" fill="#EF9A9A" radius={[0,0,0,0]} barSize={24} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                <Bar dataKey="UPI" stackId="a" fill="#90CAF9" radius={[0,0,0,0]} barSize={24} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                <Bar dataKey="OTHER" stackId="a" fill="#FFCC80" radius={[4,4,0,0]} barSize={24} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
        <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Daily Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Date</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Cash</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Card</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">UPI</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Other</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((d) => {
                const total = (d.CASH || 0) + (d.CARD || 0) + (d.UPI || 0) + (d.OTHER || 0);
                return (
                  <tr key={d.date} className="border-b border-[#FFCDD2]/50 hover:bg-[#FFF5F5]">
                    <td className="px-3 py-3 font-bold text-gray-900">{d.date}</td>
                    <td className="px-3 py-3 text-right text-gray-700"><Money value={d.CASH} /></td>
                    <td className="px-3 py-3 text-right text-gray-700"><Money value={d.CARD} /></td>
                    <td className="px-3 py-3 text-right text-gray-700"><Money value={d.UPI} /></td>
                    <td className="px-3 py-3 text-right text-gray-700"><Money value={d.OTHER} /></td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900"><Money value={total} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DiscountReport({ dateFilter, outletId, onDownloadRef }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try { const res = await fetchReportDiscounts(dateFilter.startDate, dateFilter.endDate, outletId); setData(res); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [dateFilter, outletId]);

  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;
  const doPDF = () => {
    if (!data) return;
    const headers = [
      { key: 'billRef', label: 'Bill Ref' }, { key: 'txnDate', label: 'Date' },
      { key: 'tableNumber', label: 'Table' }, { key: 'outlet', label: 'Outlet' },
      { key: 'subtotal', label: 'Subtotal', format: 'money' },
      { key: 'discountPercent', label: 'Disc %', format: 'percent' },
      { key: 'discountAmount', label: 'Disc Amt', format: 'money' },
      { key: 'grandTotal', label: 'Grand Total', format: 'money' },
      { key: 'method', label: 'Method' },
    ];
    downloadPDF({ title: 'Discount Report', dateRange: dateRangeText, headers, rows: data.transactions, filename: 'Discount-Report' });
  };
  const doExcel = () => {
    if (!data) return;
    downloadExcel({ title: 'Discount Report', dateRange: dateRangeText, filename: 'Discount-Report',
      sheets: [{ name: 'Transactions', headers: [
        { key: 'billRef', label: 'Bill Ref' }, { key: 'txnDate', label: 'Date' },
        { key: 'tableNumber', label: 'Table' }, { key: 'outlet', label: 'Outlet' },
        { key: 'subtotal', label: 'Subtotal', format: 'money' },
        { key: 'discountPercent', label: 'Disc %', format: 'percent' },
        { key: 'discountAmount', label: 'Disc Amt', format: 'money' },
        { key: 'grandTotal', label: 'Grand Total', format: 'money' },
        { key: 'method', label: 'Method' },
      ], rows: data.transactions }],
    });
  };
  useEffect(() => { onDownloadRef.current = { pdf: doPDF, excel: doExcel }; }, [data, dateFilter]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard onRetry={fetchData} />;
  if (!data || data.summary.totalTransactionsWithDiscount === 0) return <EmptyCard />;

  const highDiscount = data.summary.totalDiscountGiven > 10000;

  return (
    <div className="space-y-6">
      <ReportHeader title="Discount Report" subtitle="All discounted transactions">
        <DownloadButtons onPDF={doPDF} onExcel={doExcel} />
      </ReportHeader>
      {highDiscount && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-600" />
          <p className="text-sm font-bold text-amber-800">
            High discount volume detected — <Money value={data.summary.totalDiscountGiven} /> discounted in this period.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Discount Given" value={<Money value={data.summary.totalDiscountGiven} />} sub="Amount waived" icon={StarIcon} color="text-purple-600" />
        <StatCard label="Txns with Discount" value={data.summary.totalTransactionsWithDiscount} sub="Bills discounted" icon={Package} color="text-blue-600" />
        <StatCard label="Avg Discount %" value={`${data.summary.averageDiscountPercent}%`} sub="Average rate" icon={TrendingUp} color="text-amber-600" />
        <StatCard label="Revenue Impact" value={<Money value={data.summary.totalRevenueLost} />} sub="Lost revenue" icon={DollarSign} color="text-red-600" />
      </div>
      <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
        <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Discounted Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Bill Ref</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Date</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Table</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Outlet</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Subtotal</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Disc %</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Disc Amt</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Grand Total</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Method</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.txnId} className="border-b border-[#FFCDD2]/50 hover:bg-[#FFF5F5]">
                  <td className="px-3 py-3 font-bold text-gray-900">{t.billRef}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{t.txnDate}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{t.tableNumber ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-600 capitalize text-xs">{t.outlet}</td>
                  <td className="px-3 py-3 text-right font-bold text-gray-700"><Money value={t.subtotal} /></td>
                  <td className="px-3 py-3 text-right text-gray-700">{t.discountPercent}%</td>
                  <td className="px-3 py-3 text-right font-bold text-red-600"><Money value={t.discountAmount} /></td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900"><Money value={t.grandTotal} /></td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{t.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
function GSTReport({ dateFilter, outletId, onDownloadRef }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try { const res = await fetchReportGST(dateFilter.startDate, dateFilter.endDate, outletId); setData(res); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [dateFilter, outletId]);

  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;
  const doPDF = () => {
    if (!data) return;
    const headers = [
      { key: 'billRef', label: 'Bill Ref' }, { key: 'txnDate', label: 'Date' },
      { key: 'tableNumber', label: 'Table' }, { key: 'outlet', label: 'Outlet' },
      { key: 'subtotal', label: 'Subtotal', format: 'money' },
      { key: 'discountAmount', label: 'Discount', format: 'money' },
      { key: 'taxableAmount', label: 'Taxable', format: 'money' },
      { key: 'cgst', label: 'CGST', format: 'money' },
      { key: 'sgst', label: 'SGST', format: 'money' },
      { key: 'totalTax', label: 'Total Tax', format: 'money' },
      { key: 'grandTotal', label: 'Grand Total', format: 'money' },
      { key: 'method', label: 'Method' },
    ];
    downloadPDF({ title: 'GST Report', dateRange: dateRangeText, headers, rows: data.transactions, filename: 'GST-Report' });
  };
  const doExcel = () => {
    if (!data) return;
    downloadExcel({ title: 'GST Report', dateRange: dateRangeText, filename: 'GST-Report',
      sheets: [
        { name: 'Transaction Detail', headers: [
          { key: 'billRef', label: 'Bill Ref' }, { key: 'txnDate', label: 'Date' },
          { key: 'tableNumber', label: 'Table' }, { key: 'outlet', label: 'Outlet' },
          { key: 'subtotal', label: 'Subtotal', format: 'money' },
          { key: 'discountAmount', label: 'Discount', format: 'money' },
          { key: 'taxableAmount', label: 'Taxable', format: 'money' },
          { key: 'cgst', label: 'CGST', format: 'money' },
          { key: 'sgst', label: 'SGST', format: 'money' },
          { key: 'totalTax', label: 'Total Tax', format: 'money' },
          { key: 'grandTotal', label: 'Grand Total', format: 'money' },
          { key: 'method', label: 'Method' },
        ], rows: data.transactions },
        { name: 'Daily Summary', headers: [
          { key: 'date', label: 'Date' },
          { key: 'taxableAmount', label: 'Taxable Amount', format: 'money' },
          { key: 'cgst', label: 'CGST', format: 'money' },
          { key: 'sgst', label: 'SGST', format: 'money' },
          { key: 'totalTax', label: 'Total Tax', format: 'money' },
        ], rows: data.byDay || [] },
      ],
    });
  };
  useEffect(() => { onDownloadRef.current = { pdf: doPDF, excel: doExcel }; }, [data, dateFilter]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard onRetry={fetchData} />;
  if (!data || data.summary.transactionCount === 0) return <EmptyCard />;

  return (
    <div className="space-y-6">
      <ReportHeader title="GST Report" subtitle="For GST Filing">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">For GST Filing</span>
          <DownloadButtons onPDF={doPDF} onExcel={doExcel} />
        </div>
      </ReportHeader>
      <div className="bg-white p-4 rounded-2xl border border-[#FFCDD2] shadow-sm">
        <p className="text-xs font-bold text-gray-500">GSTIN: <span className="text-gray-900 font-black">{data.gstin || 'Not configured'}</span></p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Taxable Amount" value={<Money value={data.summary.totalTaxableAmount} />} sub="After discount" icon={DollarSign} color="text-green-600" />
        <StatCard label="Total CGST" value={<Money value={data.summary.totalCGST} />} sub="Central tax" icon={FileText} color="text-blue-600" />
        <StatCard label="Total SGST" value={<Money value={data.summary.totalSGST} />} sub="State tax" icon={FileText} color="text-blue-600" />
        <StatCard label="Total Tax Collected" value={<Money value={data.summary.totalTax} />} sub="CGST + SGST" icon={TrendingUp} color="text-amber-600" />
        <StatCard label="Grand Total" value={<Money value={data.summary.totalGrandTotal} />} sub="Inc. tax" icon={Package} color="text-purple-600" />
      </div>
      <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
        <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Transaction Detail</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Bill Ref</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Date</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Table</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Outlet</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Subtotal</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Discount</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Taxable</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">CGST</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">SGST</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Total Tax</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Grand Total</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Method</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.billRef} className="border-b border-[#FFCDD2]/50 hover:bg-[#FFF5F5]">
                  <td className="px-3 py-3 font-bold text-gray-900">{t.billRef}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{t.txnDate}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{t.tableNumber ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-600 capitalize text-xs">{t.outlet}</td>
                  <td className="px-3 py-3 text-right font-bold text-gray-700"><Money value={t.subtotal} /></td>
                  <td className="px-3 py-3 text-right text-gray-700"><Money value={t.discountAmount} /></td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900"><Money value={t.taxableAmount} /></td>
                  <td className="px-3 py-3 text-right text-gray-700"><Money value={t.cgst} /></td>
                  <td className="px-3 py-3 text-right text-gray-700"><Money value={t.sgst} /></td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900"><Money value={t.totalTax} /></td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900"><Money value={t.grandTotal} /></td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{t.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
        <h3 className="text-sm font-black text-gray-900 mb-4 uppercase tracking-widest">Daily Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
              <tr>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Date</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Taxable Amount</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">CGST</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">SGST</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {(data.byDay || []).map((d) => (
                <tr key={d.date} className="border-b border-[#FFCDD2]/50 hover:bg-[#FFF5F5]">
                  <td className="px-3 py-3 font-bold text-gray-900">{d.date}</td>
                  <td className="px-3 py-3 text-right font-bold text-gray-700"><Money value={d.taxableAmount} /></td>
                  <td className="px-3 py-3 text-right text-gray-700"><Money value={d.cgst} /></td>
                  <td className="px-3 py-3 text-right text-gray-700"><Money value={d.sgst} /></td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900"><Money value={d.totalTax} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function XReportAdminView({ dateFilter, outletId, onDownloadRef }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch(`/api/xreports?startDate=${dateFilter.startDate}&endDate=${dateFilter.endDate}&outletId=${outletId}`);
        setReports(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || 'Failed to load X Reports');
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [dateFilter, outletId]);

  const headers = [
    ...(outletId === 'all' ? [{ key: 'outletName', label: 'Outlet' }] : []),
    { key: 'reportDate', label: 'Date' },
    { key: 'totalSales', label: 'Total Sales', format: 'money' },
    { key: 'expenditureAmount', label: 'Expenditure', format: 'money' },
    { key: 'cardAmount', label: 'Card', format: 'money' },
    { key: 'cashAmount', label: 'Cash', format: 'money' },
    { key: 'tipsAmount', label: 'Tips', format: 'money' },
    { key: 'cashFromNotes', label: 'Cash from Notes', format: 'money' },
    { key: 'finalAmount', label: 'Balance', format: 'money' },
    { key: 'printed', label: 'Printed' },
  ];
  const rows = reports.map((r) => ({
    ...(outletId === 'all' ? { outletName: r.outletName || 'Unknown' } : {}),
    reportDate: r.reportDate,
    totalSales: Number(r.totalSales),
    expenditureAmount: Number(r.expenditureAmount),
    cardAmount: Number(r.cardAmount),
    cashAmount: Number(r.cashAmount),
    tipsAmount: Number(r.tipsAmount || 0),
    cashFromNotes: Number(r.cashFromNotes),
    finalAmount: Number(r.totalSales) - (Number(r.cardAmount || 0) + Number(r.cashAmount || 0) + Number(r.upiAmount || 0) + Number(r.otherAmount || 0)) - Number(r.expenditureAmount || 0),
    printed: r.printed ? 'Yes' : 'No',
  }));
  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;

  const doPDF = () => {
    downloadPDF({
      title: 'X Reports',
      dateRange: dateRangeText,
      filename: 'X-Reports',
      headers,
      rows,
    });
  };

  const doExcel = () => {
    downloadExcel({
      title: 'X Reports',
      dateRange: dateRangeText,
      filename: 'X-Reports',
      sheets: [{ name: 'X Reports', headers, rows }],
    });
  };

  useEffect(() => { onDownloadRef.current = { pdf: doPDF, excel: doExcel }; }, [reports, dateFilter, outletId]);

  if (loading) return <div className="text-center py-8 text-gray-400">Loading X Reports...</div>;
  if (error) return <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>;
  if (!reports.length) return <div className="text-center py-8 text-gray-400">No X Reports found for this date range.</div>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-lg font-black text-gray-900 uppercase tracking-wider">X Reports</h3>
        <p className="text-xs text-gray-500 mt-0.5">{dateFilter.startDate} to {dateFilter.endDate}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {outletId === 'all' && <th className="px-4 py-2 text-left font-black uppercase text-xs text-gray-500">Outlet</th>}
              <th className="px-4 py-2 text-left font-black uppercase text-xs text-gray-500">Date</th>
              <th className="px-4 py-2 text-right font-black uppercase text-xs text-gray-500">Total Sales</th>
              <th className="px-4 py-2 text-right font-black uppercase text-xs text-gray-500">Expenditure</th>
              <th className="px-4 py-2 text-right font-black uppercase text-xs text-gray-500">Card</th>
              <th className="px-4 py-2 text-right font-black uppercase text-xs text-gray-500">Cash</th>
              <th className="px-4 py-2 text-right font-black uppercase text-xs text-gray-500">Tips</th>
              <th className="px-4 py-2 text-right font-black uppercase text-xs text-gray-500">Cash from Notes</th>
              <th className="px-4 py-2 text-right font-black uppercase text-xs text-gray-500">Balance</th>
              <th className="px-4 py-2 text-center font-black uppercase text-xs text-gray-500">Printed</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                {outletId === 'all' && <td className="px-4 py-2 font-semibold text-gray-900">{r.outletName || 'Unknown'}</td>}
                <td className="px-4 py-2 font-semibold text-gray-900">{r.reportDate}</td>
                <td className="px-4 py-2 text-right tabular-nums">₹{Number(r.totalSales).toFixed(2)}</td>
                <td className="px-4 py-2 text-right tabular-nums">₹{Number(r.expenditureAmount).toFixed(2)}</td>
                <td className="px-4 py-2 text-right tabular-nums">₹{Number(r.cardAmount).toFixed(2)}</td>
                <td className="px-4 py-2 text-right tabular-nums">₹{Number(r.cashAmount).toFixed(2)}</td>
                <td className="px-4 py-2 text-right tabular-nums">₹{Number(r.tipsAmount || 0).toFixed(2)}</td>
                <td className="px-4 py-2 text-right tabular-nums">₹{Number(r.cashFromNotes).toFixed(2)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-black">₹{(Number(r.totalSales) - Number(r.expenditureAmount || 0)).toFixed(2)}</td>
                <td className="px-4 py-2 text-center">
                  {r.printed ? (
                    <span className="px-2 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded text-xs font-bold">Yes</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-50 text-gray-400 border border-gray-200 rounded text-xs font-bold">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminReports() {
  const [activeReport, setActiveReport] = useState(DEFAULT_REPORT);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState({ type: 'this-week', ...getDateRange('this-week') });
  const [exportOpen, setExportOpen] = useState(false);
  const [outletId, setOutletId] = useState('all');
  const [outlets, setOutlets] = useState([]);
  const downloadRef = useRef({ pdf: () => {}, excel: () => {} });

  const { restaurant } = useAuth();
  const enabledModules = restaurant?.enabledModules || {};
  const restaurantType = restaurant?.restaurantType || '';

  // Fetch outlets list for the dropdown
  useEffect(() => {
    apiFetch('/api/restaurant/outlets-overview')
      .then(data => {
        if (data?.outlets && Array.isArray(data.outlets)) {
          setOutlets(data.outlets.map(o => ({ id: o.id, name: o.name })));
        }
      })
      .catch(() => {});
  }, []);

  // Fallback: refresh enabledModules for existing sessions
  useEffect(() => {
    if (!restaurant?.enabledModules) {
      apiFetch('/api/auth/me')
        .then(data => {
          if (data?.restaurant?.enabledModules) {
            // localStorage merge fallback
            const authKey = Object.keys(localStorage).find(k => k.includes('auth') && localStorage.getItem(k));
            if (authKey) {
              try {
                const parsed = JSON.parse(localStorage.getItem(authKey));
                parsed.restaurant = { ...parsed.restaurant, ...data.restaurant };
                localStorage.setItem(authKey, JSON.stringify(parsed));
              } catch {}
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  const filteredCategories = useMemo(() => {
    let categories = REPORT_CATEGORIES;
    // Filter reports based on enabledModules
    categories = categories.map(cat => ({
      ...cat,
      reports: cat.reports.filter(r => {
        if (r.id === 'captain-performance') return enabledModules.tables !== false;
        if (r.id === 'table-utilization') return enabledModules.tables !== false;
        if (r.id === 'venue-revenue') return enabledModules.food !== false || enabledModules.bar !== false;
        return true;
      }),
    })).filter(cat => cat.reports.length > 0);

    // Add delivery platform report for CLOUD_KITCHEN
    if (restaurantType === 'CLOUD_KITCHEN') {
      const salesCat = categories.find(c => c.key === 'sales');
      if (salesCat) {
        salesCat.reports.push({ id: 'delivery-platforms', label: 'Delivery Platform Breakdown', icon: Smartphone, urgent: false });
      }
    }

    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.map((cat) => ({
      ...cat,
      reports: cat.reports.filter((r) => r.label.toLowerCase().includes(q)),
    })).filter((cat) => cat.reports.length > 0);
  }, [search, enabledModules, restaurantType]);

  const allReports = filteredCategories.flatMap((c) => c.reports);
  const activeReportMeta = allReports.find((r) => r.id === activeReport);

  return (
    <div className="min-h-screen bg-[#FFF5F5] font-sans">
      {/* Sticky Top Bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#FFCDD2] p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reports..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#FFCDD2] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#B71C1C] bg-[#F4F4F5]"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {outlets.length > 1 && (
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                className="px-3 py-2 text-xs font-bold border border-[#FFCDD2] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#B71C1C] bg-white cursor-pointer"
              >
                <option value="all">All Outlets</option>
                {outlets.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            )}
            <ReportDateFilter value={dateFilter} onChange={setDateFilter} />
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-2 bg-[#B71C1C] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#8E1414] transition-colors"
              >
                <Download size={14} /> Export All <ChevronDown size={12} />
              </button>
              {exportOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-[#FFCDD2] shadow-lg z-20 overflow-hidden">
                  <button onClick={() => { downloadRef.current.pdf(); setExportOpen(false); }} className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-[#FFF5F5] flex items-center gap-2">
                    <FileText size={14} className="text-[#B71C1C]" /> Export Current as PDF
                  </button>
                  <button onClick={() => { downloadRef.current.excel(); setExportOpen(false); }} className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-[#FFF5F5] flex items-center gap-2">
                    <FileSpreadsheet size={14} className="text-[#B71C1C]" /> Export Current as Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row">
        {/* Left Sidebar */}
        <aside className="w-full md:w-56 flex-shrink-0 bg-white border-r border-[#FFCDD2] md:min-h-[calc(100vh-73px)]">
          <div className="p-4 space-y-6">
            {filteredCategories.map((cat) => (
              <div key={cat.key}>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 px-3">{cat.label}</p>
                <div className="space-y-1">
                  {cat.reports.map((r) => {
                    const Icon = r.icon;
                    const isActive = activeReport === r.id;
                    if (!r.urgent) {
                      return (
                        <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 cursor-not-allowed rounded-md select-none">
                          <Icon size={14} />
                          <span>{r.label}</span>
                          <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-gray-300">Soon</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={r.id}
                        onClick={() => setActiveReport(r.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                          isActive ? 'bg-[#FFF5F5] text-[#B71C1C] font-bold' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={14} />
                        <span>{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-xs font-bold text-amber-700">
            Note: Reports are under active testing. Please cross-verify figures with source data before relying on them for financial decisions.
          </div>
          <div className="mb-4">
            {activeReport === 'overview' && <ExecutiveSummary dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'daily-sales' && <DailySalesReport dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'itemwise-sales' && <ItemwiseSalesReport dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'categorywise-sales' && <CategorywiseSalesReport dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'payment-methods' && <PaymentMethodsReport dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'operations-dashboard' && <OperationsDashboard dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'xreport-view' && <XReportAdminView dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'discount-report' && <DiscountReport dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'gst-report' && <GSTReport dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
            {activeReport === 'delivery-platforms' && <DeliveryPlatformsReport dateFilter={dateFilter} outletId={outletId} onDownloadRef={downloadRef} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function DeliveryPlatformsReport({ dateFilter, outletId }) {
  const [data, setData] = useState({ platforms: [], totalRevenue: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    // Fetch transactions and group by delivery platform
    fetch(`${API_BASE}/api/transactions?date=${dateFilter.startDate}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(txns => {
        const platformMap = {};
        let total = 0;
        txns.forEach(t => {
          const platform = t.deliveryPlatform || 'Direct';
          platformMap[platform] = (platformMap[platform] || 0) + Number(t.amount || 0);
          total += Number(t.amount || 0);
        });
        const platforms = Object.entries(platformMap).map(([name, revenue]) => ({
          name,
          revenue,
          percent: total > 0 ? Math.round((revenue / total) * 100) : 0,
        }));
        setData({ platforms, totalRevenue: total });
      })
      .catch(() => setData({ platforms: [], totalRevenue: 0 }))
      .finally(() => setLoading(false));
  }, [dateFilter]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!data.platforms.length) return <p className="text-gray-500">No delivery data for this period.</p>;

  return (
    <div className="space-y-6">
      <ReportHeader title="Delivery Platform Breakdown" subtitle="Revenue by delivery channel" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.platforms.map(p => (
          <div key={p.name} className="bg-white rounded-xl p-5 border border-[#FFCDD2]">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">{p.name}</h3>
            <p className="text-2xl font-black text-[#B71C1C] mt-2">₹{p.revenue.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">{p.percent}% of total</p>
          </div>
        ))}
      </div>
    </div>
  );
}
