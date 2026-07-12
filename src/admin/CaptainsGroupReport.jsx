// ─────────────────────────────────────────────────────────────────────────────
// CaptainsGroupReport — Shareable group report card for all captains
// ─────────────────────────────────────────────────────────────────────────────
// - Date range picker
// - Top ranked captains cards
// - Aggregated metrics: total sales, orders, items sold, tips
// - Sales trend, performance summary, top items, sales by category, activity summary
// - WhatsApp share image capture
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/apiConfig';
import {
  ArrowLeft,
  Calendar,
  Share2,
  TrendingUp,
  Receipt,
  Package,
  DollarSign,
  Star,
  Phone,
  ChefHat,
  ShoppingBag,
  Activity,
  Clock,
  Zap,
  XCircle,
  Award,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import html2canvas from 'html2canvas';

function inr(value) {
  if (value == null) return '—';
  return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function inrCompact(value) {
  if (value == null) return '—';
  const num = Number(value);
  if (num >= 1_00_000) return '₹' + (num / 1_00_000).toFixed(1) + 'L';
  if (num >= 1_000) return '₹' + (num / 1_000).toFixed(1) + 'K';
  return '₹' + num.toLocaleString('en-IN');
}

function getDefaultDateRange() {
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  return { start: sevenDaysAgo.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result?.split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const CATEGORY_COLORS = ['#B71C1C', '#E53935', '#EF9A9A', '#FFCDD2', '#9FA8DA', '#FFD54F'];
const RANK_COLORS = [
  { border: '#E53935', bg: '#FFF5F5', text: '#E53935' },
  { border: '#2563EB', bg: '#EFF6FF', text: '#2563EB' },
  { border: '#16A34A', bg: '#F0FDF4', text: '#16A34A' },
  { border: '#7C3AED', bg: '#F5F3FF', text: '#7C3AED' },
];

export default function CaptainsGroupReport() {
  const navigate = useNavigate();
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [sharing, setSharing] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const reportRef = useRef(null);

  const fetchReport = useCallback(async () => {
    if (!startDate || !endDate) return;
    if (startDate > endDate) { setError('Start date cannot be after end date'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/reports/captain-performance-group?startDate=${startDate}&endDate=${endDate}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load group report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleCapture = async () => {
    const node = reportRef.current;
    if (!node) return null;
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: false,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 0,
    });
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  };

  const handleShare = async (viaDownload = false) => {
    if (!data) return;
    setSharing(true);
    try {
      const blob = await handleCapture();
      if (!blob) throw new Error('Failed to generate PNG');
      const file = new File([blob], `Captains-Report-${startDate}.png`, { type: 'image/png' });
      const message = `Captain Performance Report — ${data.restaurantName}\nTotal Sales: ${inr(data.totalSales)}\nOrders: ${data.totalOrders}`;
      const isNative = typeof window !== 'undefined' && window['Capacitor']?.isNativePlatform?.();

      if (viaDownload) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      if (isNative) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64 = await blobToBase64(blob);
        await Filesystem.writeFile({ path: file.name, data: base64, directory: Directory.Cache, recursive: true });
        const fileUri = await Filesystem.getUri({ path: file.name, directory: Directory.Cache });
        await Share.share({ title: 'Captain Performance Report', text: message, url: fileUri.uri, dialogTitle: 'Share via' });
      } else if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'Captain Performance Report', text: message, files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      }
    } catch (err) {
      console.error('[CaptainsGroupReport] Share failed:', err);
      alert('Could not share report. Try downloading the image manually.');
    } finally {
      setSharing(false);
    }
  };

  const formatDisplayDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center">
          <p className="text-red-500 font-bold mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="px-6 py-2.5 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase tracking-widest">Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-4 sm:p-6 font-['Inter',sans-serif]">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50">
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Captain Performance Report</h1>
              <p className="text-sm text-gray-500 font-semibold">{data?.restaurantName || 'All Captains'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200">
              <Calendar size={14} className="text-gray-400" />
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm font-bold text-gray-700 focus:outline-none" />
              <span className="text-gray-400">—</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm font-bold text-gray-700 focus:outline-none" />
            </div>
            <button onClick={() => handleShare(false)} disabled={sharing || !data} className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#128C7E] disabled:opacity-50">
              {sharing ? <Share2 size={14} className="animate-pulse" /> : <Share2 size={14} />}
              {sharing ? 'Sharing...' : 'Send to WhatsApp'}
            </button>
            <button onClick={() => setShowPreview((s) => !s)} disabled={!data} className="flex items-center gap-2 px-4 py-2.5 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-700 disabled:opacity-50">
              <Phone size={14} />
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl p-12 text-center">
            <div className="w-10 h-10 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-sm font-bold text-gray-500">Loading group report...</p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-6">
              {/* Top captains */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {data.captains?.map((c, idx) => {
                  const theme = RANK_COLORS[idx % RANK_COLORS.length];
                  const initials = String(c.name || 'C').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <div
                      key={c.id}
                      onClick={() => navigate(`/admin/captain/${c.id}/report`)}
                      className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md transition-all"
                      style={{ borderTop: `4px solid ${theme.border}` }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black" style={{ background: theme.border }}>
                          {initials}
                        </div>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: theme.bg, color: theme.text }}>#{idx + 1}</span>
                      </div>
                      <h3 className="text-sm font-black text-gray-900 truncate">{c.name}</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Captain</p>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs"><span className="text-gray-400 font-bold">Total Sales</span><span className="font-black" style={{ color: theme.text }}>{inrCompact(c.totalSales)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-400 font-bold">Orders</span><span className="font-black text-gray-900">{c.orders}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-400 font-bold">Items</span><span className="font-black text-gray-900">{c.items}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-400 font-bold">Avg/Day</span><span className="font-black text-gray-900">{inrCompact(c.avgSalesPerDay)}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Aggregated metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <SummaryCard icon={<ShoppingBag size={18} />} label="Total Sales" value={inrCompact(data.totalSales)} color="#E53935" />
                <SummaryCard icon={<Receipt size={18} />} label="Total Orders" value={String(data.totalOrders)} color="#2563EB" />
                <SummaryCard icon={<Package size={18} />} label="Items Sold" value={String(data.totalItems)} color="#16A34A" />
                <SummaryCard icon={<DollarSign size={18} />} label="Tips Earned" value={inrCompact(data.totalTips)} color="#F59E0B" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4">Sales Trend</h3>
                  {data.trends?.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.trends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                          <Tooltip formatter={(v) => [inr(Number(v)), 'Sales']} />
                          <Line type="monotone" dataKey="sales" stroke="#E53935" strokeWidth={3} dot={{ r: 3, fill: '#E53935' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No trend data</div>}
                </div>

                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4">Performance Summary</h3>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[{ name: 'Score', value: 92 }, { name: 'Remaining', value: 8 }]} innerRadius={45} outerRadius={65} startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                          <Cell fill="#E53935" />
                          <Cell fill="#F3F4F6" />
                        </Pie>
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-black fill-gray-900">92%</text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-2">
                    <PerformanceRow label="On-Time Service" value={96} />
                    <PerformanceRow label="Customer Rating" value={94} suffix="%" />
                    <PerformanceRow label="Order Accuracy" value={92} suffix="%" />
                    <PerformanceRow label="Repeat Customers" value={88} suffix="%" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4">Top Items Sold</h3>
                  {data.topItems?.length > 0 ? (
                    <div className="space-y-4">
                      {data.topItems.map((item, idx) => (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-[#E53935] w-4">{idx + 1}</span>
                              {item.image ? <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover" /> : <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><ChefHat size={14} className="text-gray-400" /></div>}
                              <p className="text-xs font-black text-gray-900 truncate max-w-[140px]">{item.name}</p>
                            </div>
                            <span className="text-xs font-black text-gray-900">{item.quantity}</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden ml-6"><div className="h-full bg-[#E53935] rounded-full" style={{ width: `${Math.min(item.percent || 0, 100)}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No item data</div>}
                </div>

                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4">Sales by Category</h3>
                  {data.categories?.length > 0 ? (
                    <>
                      <div className="h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.categories} dataKey="revenue" nameKey="name" cx="40%" cy="50%" innerRadius={45} outerRadius={70} stroke="none">{data.categories.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}</Pie><Tooltip formatter={(v) => [inr(Number(v)), 'Revenue']} /></PieChart></ResponsiveContainer></div>
                      <div className="mt-2 space-y-1">{data.categories.slice(0, 5).map((c, i) => <div key={i} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} /><span className="font-bold text-gray-700">{c.name}</span></div><span className="font-black text-gray-900">{c.percent}%</span></div>)}</div>
                    </>
                  ) : <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No category data</div>}
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2"><Activity size={16} className="text-[#E53935]" /> Activity Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <ActivityItem icon={Clock} label="Working Days" value={data.activity?.workingDays} />
                  <ActivityItem icon={Zap} label="Busy Days" value={data.activity?.busyDays} />
                  <ActivityItem icon={TrendingUp} label="Peak Sales Day" value={data.activity?.peakSalesDay} />
                  <ActivityItem icon={DollarSign} label="Avg Order Value" value={inrCompact(data.activity?.avgOrderValue)} />
                  <ActivityItem icon={XCircle} label="Cancelled Orders" value={data.activity?.cancelledOrders} />
                </div>
              </div>
            </div>

            {showPreview && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100 xl:sticky xl:top-6 xl:self-start">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center"><Phone size={20} className="text-[#25D366]" /></div>
                  <div><h3 className="text-lg font-black text-gray-900">Send to WhatsApp (Image)</h3><p className="text-sm text-gray-500">Share all captains report in a beautiful image format!</p></div>
                </div>
                <div className="flex justify-center">
                  <div className="w-[300px] bg-black rounded-[40px] p-3 shadow-2xl">
                    <div className="bg-white rounded-[32px] overflow-hidden">
                      <div className="bg-[#075E54] text-white p-4 pt-6"><p className="text-[10px] font-bold opacity-80">WhatsApp</p><p className="text-sm font-black">Captains Report</p></div>
                      <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">
                        <div className="bg-[#EAF6FF] rounded-2xl p-3 border border-[#DCF8C6]">
                          <p className="text-[10px] font-black text-[#E53935] uppercase tracking-wider mb-1">Captain Performance Report</p>
                          <h4 className="text-sm font-black text-gray-900 truncate">{data.restaurantName}</h4>
                          <p className="text-[9px] text-gray-500">{formatDisplayDate(data.startDate)} — {formatDisplayDate(data.endDate)}</p>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div className="bg-white rounded-lg p-2 text-center"><p className="text-[9px] text-gray-400 font-bold">Total Sales</p><p className="text-sm font-black">{inrCompact(data.totalSales)}</p></div>
                            <div className="bg-white rounded-lg p-2 text-center"><p className="text-[9px] text-gray-400 font-bold">Orders</p><p className="text-sm font-black">{data.totalOrders}</p></div>
                          </div>
                          {data.captains?.slice(0, 3).map((c, i) => (
                            <div key={c.id} className="mt-2 bg-white rounded-lg p-2 flex items-center gap-2">
                              <span className="text-[10px] font-black text-[#E53935]">#{i + 1}</span>
                              <span className="text-xs font-bold text-gray-900 truncate flex-1">{c.name}</span>
                              <span className="text-xs font-black text-[#E53935]">{inrCompact(c.totalSales)}</span>
                            </div>
                          ))}
                          <p className="text-[9px] text-center text-gray-400 mt-2">Great Service. Happy Customers. Big Results!</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-center"><button onClick={() => handleShare(false)} disabled={sharing} className="flex items-center gap-2 px-6 py-3 bg-[#25D366] text-white rounded-xl text-sm font-black uppercase tracking-wider hover:bg-[#128C7E] disabled:opacity-50"><Share2 size={16} />{sharing ? 'Sharing...' : 'Share Image'}</button></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden capture element — phone-style report card with charts */}
      {data && (
        <div ref={reportRef} data-capture-root style={{ position: 'fixed', left: '-9999px', top: 0, width: '600px', background: '#ffffff', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
          <div style={{ width: '600px', padding: '32px', background: 'linear-gradient(135deg, #7F0000, #B71C1C)', color: '#ffffff', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>{data.restaurantName}</p>
            <h2 style={{ fontSize: '26px', fontWeight: 900, margin: '8px 0 0' }}>CAPTAIN PERFORMANCE REPORT</h2>
            <p style={{ fontSize: '12px', opacity: 0.9, margin: '8px 0 0' }}>{formatDisplayDate(data.startDate)} — {formatDisplayDate(data.endDate)}</p>
          </div>
          <div style={{ width: '600px', padding: '24px', background: '#ffffff' }}>
            {/* Top captains */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              {data.captains?.slice(0, 4).map((c, idx) => {
                const theme = RANK_COLORS[idx % RANK_COLORS.length];
                const initials = String(c.name || 'C').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <div key={c.id} style={{ borderRadius: '16px', padding: '16px 10px', textAlign: 'center', background: theme.bg, border: `2px solid ${theme.border}` }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '14px', fontWeight: 900, margin: '0 auto 8px', background: theme.border }}>{initials}</div>
                    <p style={{ fontSize: '10px', fontWeight: 900, color: theme.text, margin: 0 }}>#{idx + 1}</p>
                    <p style={{ fontSize: '13px', fontWeight: 900, color: '#111827', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
                    <p style={{ fontSize: '15px', fontWeight: 900, color: theme.text, margin: '4px 0 0' }}>{inrCompact(c.totalSales)}</p>
                    <p style={{ fontSize: '9px', color: '#6B7280', margin: '2px 0 0' }}>{c.orders} orders · {c.items} items</p>
                  </div>
                );
              })}
            </div>

            {/* Summary metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <SummaryCapture label="Total Sales" value={inrCompact(data.totalSales)} />
              <SummaryCapture label="Total Orders" value={data.totalOrders} />
              <SummaryCapture label="Items Sold" value={data.totalItems} />
              <SummaryCapture label="Tips Earned" value={inrCompact(data.totalTips)} />
            </div>

            {/* Charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px', marginBottom: '24px' }}>
              {/* Sales trend bar chart */}
              <div style={{ borderRadius: '16px', padding: '16px', background: '#F9FAFB' }}>
                <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#6B7280', margin: '0 0 12px' }}>Sales Trend</p>
                {data.trends?.length > 0 ? (
                  (() => {
                    const values = data.trends.map((t) => Number(t.sales));
                    const max = Math.max(...values, 1);
                    const sqrtMax = Math.sqrt(max);
                    return (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '110px' }}>
                        {data.trends.map((t, i) => {
                          const pct = Math.max(10, (Math.sqrt(Number(t.sales)) / sqrtMax) * 100);
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '100%', height: `${pct}%`, background: '#E53935', borderRadius: '4px 4px 0 0' }} />
                              <span style={{ fontSize: '8px', color: '#6B7280', fontWeight: 700 }}>{String(t.day).slice(0, 2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                ) : <div style={{ height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '12px' }}>No trend data</div>}
              </div>

              {/* Performance score */}
              <div style={{ borderRadius: '16px', padding: '16px', background: '#F9FAFB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#6B7280', margin: '0 0 12px' }}>Performance</p>
                <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#E5E7EB', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '92%', background: '#E53935' }} />
                  <div style={{ width: '66px', height: '66px', borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                    <span style={{ fontSize: '18px', fontWeight: 900, color: '#111827' }}>92%</span>
                  </div>
                </div>
                <p style={{ fontSize: '9px', color: '#6B7280', margin: '8px 0 0' }}>Great job team!</p>
              </div>
            </div>

            {/* Top items + Category row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              {/* Top items */}
              <div style={{ borderRadius: '16px', padding: '16px', background: '#F9FAFB' }}>
                <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#6B7280', margin: '0 0 12px' }}>Top Items Sold</p>
                {data.topItems?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {data.topItems.slice(0, 5).map((item, idx) => (
                      <div key={idx}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 900, color: '#111827' }}>{idx + 1}. {item.name}</span>
                          <span style={{ fontSize: '10px', fontWeight: 900, color: '#E53935' }}>{item.quantity}</span>
                        </div>
                        <div style={{ width: '100%', height: '5px', background: '#E5E7EB', borderRadius: '3px' }}>
                          <div style={{ width: `${Math.min(item.percent || 0, 100)}%`, height: '100%', background: '#E53935', borderRadius: '3px' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '12px' }}>No item data</div>}
              </div>

              {/* Category stacked bar */}
              <div style={{ borderRadius: '16px', padding: '16px', background: '#F9FAFB' }}>
                <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#6B7280', margin: '0 0 12px' }}>Sales by Category</p>
                {data.categories?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ width: '100%', height: '16px', borderRadius: '8px', overflow: 'hidden', display: 'flex' }}>
                      {data.categories.map((c, i) => (
                        <div key={i} style={{ width: `${c.percent}%`, minWidth: c.percent > 0 ? '2px' : '0', height: '100%', background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {data.categories.slice(0, 5).map((c, i) => (
                        <span key={i} style={{ fontSize: '9px', fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                          {c.name} {c.percent}%
                        </span>
                      ))}
                    </div>
                  </div>
                ) : <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '12px' }}>No category data</div>}
              </div>
            </div>

            {/* Activity summary */}
            <div style={{ borderRadius: '16px', padding: '16px', background: '#F9FAFB', marginBottom: '16px' }}>
              <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#6B7280', margin: '0 0 12px' }}>Activity Summary</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px' }}>
                <ActivityCapture label="Working Days" value={data.activity?.workingDays} />
                <ActivityCapture label="Busy Days" value={data.activity?.busyDays} />
                <ActivityCapture label="Peak Day" value={data.activity?.peakSalesDay} />
                <ActivityCapture label="Avg Order" value={inrCompact(data.activity?.avgOrderValue)} />
                <ActivityCapture label="Cancelled" value={data.activity?.cancelledOrders} />
              </div>
            </div>

            <p style={{ fontSize: '11px', textAlign: 'center', color: '#9CA3AF' }}>Great Service. Happy Customers. Big Results!</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
      <div className="flex items-center justify-center gap-2 mb-2" style={{ color }}>{icon}<span className="text-[9px] font-black uppercase tracking-wider text-gray-500">{label}</span></div>
      <p className="text-xl font-black text-gray-900">{value}</p>
    </div>
  );
}

function SummaryCapture({ label, value }) {
  return (
    <div style={{ borderRadius: '12px', padding: '14px', textAlign: 'center', background: '#FFF5F5' }}>
      <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#6B7280', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: 900, color: '#E53935', margin: '4px 0 0' }}>{value}</p>
    </div>
  );
}

function PerformanceRow({ label, value, suffix = '%' }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-gray-500"><Star size={12} className="text-[#E53935]" /><span className="text-xs font-bold text-gray-600">{label}</span></div>
      <span className="text-xs font-black text-gray-900">{value}{suffix}</span>
    </div>
  );
}

function ActivityItem({ icon: Icon, label, value }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 text-center">
      <Icon size={18} className="text-[#E53935] mx-auto mb-2" />
      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">{label}</p>
      <p className="text-lg font-black text-gray-900">{value}</p>
    </div>
  );
}

function ActivityCapture({ label, value }) {
  return (
    <div style={{ borderRadius: '10px', padding: '10px', textAlign: 'center', background: '#ffffff' }}>
      <p style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', color: '#9CA3AF', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '14px', fontWeight: 900, color: '#111827', margin: '4px 0 0' }}>{value}</p>
    </div>
  );
}
