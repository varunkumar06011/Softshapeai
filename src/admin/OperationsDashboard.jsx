import React, { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, Banknote, BarChart2, CreditCard, DollarSign, FileSpreadsheet, FileText, Layers,
  Package, RefreshCw, Smartphone, Star, TrendingUp, Users,
} from 'lucide-react';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';
import { API_BASE, apiFetch } from '../services/apiConfig';
import { getAuthHeaders } from '../services/apiConfig';
import {
  fetchReportCategorywise, fetchReportDailySales, fetchReportPaymentMethods,
} from '../services/reportsApi.js';
import { fetchBarInventory, fetchLowStockItems } from '../services/barInventoryApi.js';
import { downloadPDF, downloadExcel } from './reportDownloads.js';

function Money({ value }) {
  if (value == null) return '—';
  return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-[#FFCDD2] shadow-sm relative overflow-hidden group">
      <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
        <Icon size={40} />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-[10px] font-bold mt-2 text-gray-500">{sub}</p>}
    </div>
  );
}

function MiniCard({ label, value, sub, colorClass }) {
  return (
    <div className={`bg-white p-4 rounded-2xl border shadow-sm ${colorClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-black text-gray-900">{value}</p>
      {sub && <p className="text-[10px] font-bold mt-1 text-gray-500">{sub}</p>}
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
      <p className="text-sm font-bold text-gray-700">Failed to load dashboard.</p>
      <p className="text-xs text-gray-500 mb-4">Please check your connection and try again.</p>
      <button onClick={onRetry} className="bg-[#B71C1C] text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest">Retry</button>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="bg-white p-8 rounded-3xl border border-[#FFCDD2] shadow-sm text-center">
      <BarChart2 size={40} className="mx-auto text-gray-300 mb-4" />
      <p className="text-sm font-bold text-gray-500">No data found for this period.</p>
    </div>
  );
}

async function fetchKitchenInventory() {
  const rid = getCurrentRestaurantId();
  const res = await fetch(`${API_BASE}/api/inventory/kitchen?restaurantId=${rid}`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) return [];
  return res.json();
}

async function fetchPayrollSummary() {
  const rid = getCurrentRestaurantId();
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  try {
    const records = await apiFetch(`/api/payroll/records?restaurantId=${rid}&monthYear=${monthYear}`);
    return records || [];
  } catch {
    return [];
  }
}

async function loadDashboardData(dateFilter) {
  const rid = getCurrentRestaurantId();
  const [sales, payments, categories, barInventory, lowStock, kitchenInventory, payrollRecords] = await Promise.allSettled([
    fetchReportDailySales(dateFilter.startDate, dateFilter.endDate),
    fetchReportPaymentMethods(dateFilter.startDate, dateFilter.endDate),
    fetchReportCategorywise(dateFilter.startDate, dateFilter.endDate),
    fetchBarInventory(),
    fetchLowStockItems(),
    fetchKitchenInventory(),
    fetchPayrollSummary(),
  ]);

  return {
    sales: sales.status === 'fulfilled' ? sales.value : null,
    payments: payments.status === 'fulfilled' ? payments.value : null,
    categories: categories.status === 'fulfilled' ? categories.value : null,
    barInventory: barInventory.status === 'fulfilled' ? barInventory.value : [],
    lowStock: lowStock.status === 'fulfilled' ? lowStock.value : [],
    kitchenInventory: kitchenInventory.status === 'fulfilled' ? kitchenInventory.value : [],
    payrollRecords: payrollRecords.status === 'fulfilled' ? payrollRecords.value : [],
  };
}

export default function OperationsDashboard({ dateFilter, onDownloadRef }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadDashboardData(dateFilter);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateFilter]);

  const summary = useMemo(() => {
    if (!data) return null;
    const salesSummary = data.sales?.summary || {};
    const methods = data.payments?.methods || [];
    const categoryList = data.categories?.categories || [];

    const totalPayable = data.payrollRecords.reduce((s, r) => s + Number(r.netPayable || 0), 0);
    const totalPaid = data.payrollRecords.reduce((s, r) => s + Number(r.paidAmount || 0), 0);
    const totalOutstanding = totalPayable - totalPaid;

    const lowStockCount = data.lowStock.length + data.kitchenInventory.filter(
      (i) => Number(i.currentStock || 0) <= Number(i.reorderLevel || 0) && Number(i.reorderLevel || 0) > 0
    ).length;

    const totalInventoryValue = data.barInventory.reduce(
      (s, i) => s + Number(i.currentStock || 0) * Number(i.costPerBottle || 0), 0
    );

    return {
      totalRevenue: salesSummary.totalRevenue || 0,
      totalSales: salesSummary.totalSales ?? salesSummary.totalSubtotal ?? 0,
      netSales: salesSummary.netSales ?? 0,
      totalTransactions: salesSummary.totalTransactions || 0,
      averageBillValue: salesSummary.averageBillValue || 0,
      totalDiscount: salesSummary.totalDiscount || 0,
      paymentMethods: methods,
      categories: categoryList,
      lowStockCount,
      totalInventoryValue,
      staffCount: data.payrollRecords.length,
      payrollPayable: totalPayable,
      payrollPaid: totalPaid,
      payrollOutstanding: totalOutstanding,
    };
  }, [data]);

  const dateRangeText = `${dateFilter.startDate} to ${dateFilter.endDate}`;

  const doPDF = () => {
    if (!summary) return;
    const headers = [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value' },
    ];
    const rows = [
      { metric: 'Total Sales', value: summary.totalSales },
      { metric: 'Net Sales', value: summary.netSales },
      { metric: 'Total Transactions', value: summary.totalTransactions },
      { metric: 'Average Bill Value', value: summary.averageBillValue },
      { metric: 'Total Discount', value: summary.totalDiscount },
      { metric: 'Low Stock Items', value: summary.lowStockCount },
      { metric: 'Payroll Payable', value: summary.payrollPayable },
      { metric: 'Payroll Outstanding', value: summary.payrollOutstanding },
    ];
    downloadPDF({ title: 'Operations Dashboard', dateRange: dateRangeText, headers, rows, filename: 'Operations-Dashboard' });
  };

  const doExcel = () => {
    if (!summary) return;
    downloadExcel({
      title: 'Operations Dashboard',
      dateRange: dateRangeText,
      filename: 'Operations-Dashboard',
      sheets: [
        {
          name: 'Summary',
          headers: [
            { key: 'metric', label: 'Metric' },
            { key: 'value', label: 'Value' },
          ],
          rows: [
            { metric: 'Total Sales', value: summary.totalSales },
            { metric: 'Net Sales', value: summary.netSales },
            { metric: 'Total Transactions', value: summary.totalTransactions },
            { metric: 'Average Bill Value', value: summary.averageBillValue },
            { metric: 'Total Discount', value: summary.totalDiscount },
            { metric: 'Low Stock Items', value: summary.lowStockCount },
            { metric: 'Payroll Payable', value: summary.payrollPayable },
            { metric: 'Payroll Outstanding', value: summary.payrollOutstanding },
          ],
        },
        {
          name: 'Payment Methods',
          headers: [
            { key: 'method', label: 'Method' },
            { key: 'count', label: 'Count' },
            { key: 'amount', label: 'Amount', format: 'money' },
          ],
          rows: summary.paymentMethods.map((m) => ({ method: m.method, count: m.count, amount: m.amount })),
        },
        {
          name: 'Categories',
          headers: [
            { key: 'name', label: 'Category' },
            { key: 'totalRevenue', label: 'Revenue', format: 'money' },
            { key: 'revenuePercent', label: '%', format: 'percent' },
          ],
          rows: summary.categories.map((c) => ({ name: c.name, totalRevenue: c.totalRevenue, revenuePercent: c.revenuePercent })),
        },
      ],
    });
  };

  useEffect(() => {
    onDownloadRef.current = { pdf: doPDF, excel: doExcel };
  }, [summary, dateFilter]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard onRetry={fetchData} />;
  if (!summary || summary.totalTransactions === 0) return <EmptyCard />;

  const trend = data.sales?.byDay?.map((d) => ({ time: d.date, rev: d.revenue })) || [];
  const methodPie = summary.paymentMethods.map((m) => ({
    name: m.method,
    value: Math.round((m.amount / (summary.totalSales || 1)) * 100),
  }));
  const categoryBar = summary.categories.slice(0, 6).map((c) => ({ name: c.name, revenue: c.totalRevenue }));
  const methodIcons = { CASH: Banknote, UPI: Smartphone, CARD: CreditCard, SPLIT: Layers };

  return (
    <div className="space-y-6">
      <ReportHeader title="Operations Dashboard" subtitle="Sales, Inventory & Payroll at a glance">
        <DownloadButtons onPDF={doPDF} onExcel={doExcel} />
      </ReportHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sales" value={<Money value={summary.totalSales} />} sub="With GST, after discount" icon={DollarSign} color="text-green-600" />
        <StatCard label="Net Sales" value={<Money value={summary.netSales} />} sub="Excl. GST, after discount" icon={TrendingUp} color="text-blue-600" />
        <StatCard label="Transactions" value={summary.totalTransactions} sub="Bills settled" icon={Package} color="text-amber-600" />
        <StatCard label="Total Discount" value={<Money value={summary.totalDiscount} />} sub="Discounts given" icon={Star} color="text-purple-600" />
      </div>

      {/* Operations mini cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniCard
          label="Low Stock Items"
          value={summary.lowStockCount}
          sub={summary.lowStockCount > 0 ? 'Needs attention' : 'Stock healthy'}
          colorClass={summary.lowStockCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-[#FFCDD2]'}
        />
        <MiniCard label="Inventory Value" value={<Money value={summary.totalInventoryValue} />} sub="Bar stock value" colorClass="border-[#FFCDD2]" />
        <MiniCard label="Staff Count" value={summary.staffCount} sub="Active payroll records" colorClass="border-[#FFCDD2]" />
        <MiniCard
          label="Payroll Outstanding"
          value={<Money value={summary.payrollOutstanding} />}
          sub={summary.payrollOutstanding > 0 ? 'Pending payments' : 'All paid'}
          colorClass={summary.payrollOutstanding > 0 ? 'border-red-200 bg-red-50' : 'border-[#FFCDD2]'}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="font-black text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-[#B71C1C]" /> Revenue Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="odColorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B71C1C" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#B71C1C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 'bold', fontSize: '12px' }} />
                <Area type="monotone" dataKey="rev" stroke="#B71C1C" strokeWidth={3} fillOpacity={1} fill="url(#odColorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm flex flex-col">
          <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2">
            <Layers size={18} className="text-[#B71C1C]" /> Payment Mix
          </h3>
          <div className="flex-grow flex flex-col justify-center">
            <div className="h-[200px] w-full relative">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={methodPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={8} stroke="none">
                    {methodPie.map((_entry, i) => (
                      <Cell key={i} fill={['#B71C1C', '#E53935', '#EF9A9A', '#FFCDD2'][i % 4]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px] font-black text-gray-400 uppercase">Total</p>
                <p className="text-xl font-black text-gray-900">{summary.totalTransactions}</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {summary.paymentMethods.map((m, i) => {
                const Icon = methodIcons[m.method] || Banknote;
                return (
                  <div key={m.method} className="flex items-center justify-between p-3 rounded-xl bg-[#F4F4F5]">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${['bg-[#B71C1C]', 'bg-[#E53935]', 'bg-[#EF9A9A]', 'bg-[#FFCDD2]'][i % 4]}`} />
                      <Icon size={14} className="text-gray-500" />
                      <span className="text-xs font-bold text-gray-700">{m.method}</span>
                    </div>
                    <span className="text-xs font-black text-gray-900"><Money value={m.amount} /></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Category chart + Inventory + Payroll */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2">
            <BarChart2 size={18} className="text-[#B71C1C]" /> Top Categories
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={categoryBar}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} formatter={(v) => ['₹' + Number(v).toLocaleString('en-IN'), 'Revenue']} />
                <Bar dataKey="revenue" fill="#B71C1C" radius={[8, 8, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2">
            <Users size={18} className="text-[#B71C1C]" /> Payroll Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MiniCard label="Payable" value={<Money value={summary.payrollPayable} />} colorClass="border-[#FFCDD2]" />
            <MiniCard label="Paid" value={<Money value={summary.payrollPaid} />} colorClass="border-green-200 bg-green-50" />
            <MiniCard label="Outstanding" value={<Money value={summary.payrollOutstanding} />} colorClass={summary.payrollOutstanding > 0 ? 'border-red-200 bg-red-50' : 'border-[#FFCDD2]'} />
          </div>
          <div className="mt-4 p-4 rounded-2xl bg-[#F4F4F5]">
            <div className="flex justify-between text-xs font-bold text-gray-500 mb-2">
              <span>Payment Progress</span>
              <span>{summary.payrollPayable > 0 ? Math.round((summary.payrollPaid / summary.payrollPayable) * 100) : 100}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#B71C1C] rounded-full"
                style={{ width: `${summary.payrollPayable > 0 ? Math.min((summary.payrollPaid / summary.payrollPayable) * 100, 100) : 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Low stock table */}
      {(data.lowStock.length > 0 || data.kitchenInventory.some((i) => Number(i.currentStock || 0) <= Number(i.reorderLevel || 0) && Number(i.reorderLevel || 0) > 0)) && (
        <div className="bg-white p-6 rounded-3xl border border-[#FFCDD2] shadow-sm">
          <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-[#B71C1C]" /> Low Stock Alerts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB] border-b border-[#FFCDD2]">
                <tr>
                  <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Item</th>
                  <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Type</th>
                  <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Current</th>
                  <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Reorder Level</th>
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...data.lowStock, ...data.kitchenInventory.filter((i) => Number(i.currentStock || 0) <= Number(i.reorderLevel || 0) && Number(i.reorderLevel || 0) > 0)].slice(0, 10).map((item, idx) => (
                  <tr key={item.id || idx} className="border-b border-[#FFCDD2]/50 hover:bg-[#FFF5F5]">
                    <td className="px-3 py-3 font-bold text-gray-900">{item.name || item.menuItem?.name || '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{item.menuItem ? 'Bar' : 'Kitchen'}</td>
                    <td className="px-3 py-3 text-right font-bold text-gray-700">{Number(item.currentStock || 0).toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{Number(item.reorderLevel || 0).toFixed(2)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest bg-red-100 text-red-700">Low</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
