// ─────────────────────────────────────────────────────────────────────────────
// CaptainReportCard — Detailed report card for a single captain with date range
// ─────────────────────────────────────────────────────────────────────────────
// - Full dashboard layout: metrics, charts, top items, activity summary
// - WhatsApp share: captures a compact phone-sized report card via html2canvas
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/apiConfig';
import {
  ArrowLeft,
  Calendar,
  Share2,
  TrendingUp,
  Receipt,
  Package,
  DollarSign,
  Award,
  Star,
  Phone,
  ChefHat,
  ShoppingBag,
  Activity,
  Clock,
  Users,
  Zap,
  XCircle,
  ArrowUpRight,
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
  return {
    start: sevenDaysAgo.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result?.split(',')[1];
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const CATEGORY_COLORS = ['#B71C1C', '#E53935', '#EF9A9A', '#FFCDD2', '#9FA8DA', '#FFD54F'];

export default function CaptainReportCard() {
  const { captainId } = useParams();
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
    if (!startDate || !endDate || !captainId) return;
    if (startDate > endDate) {
      setError('Start date cannot be after end date');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/reports/captain-performance/${captainId}?startDate=${startDate}&endDate=${endDate}`
      );
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [captainId, startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

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
      let blob = await handleCapture();
      if (!blob) throw new Error('Failed to generate PNG');

      const file = new File([blob], `Captain-Report-${captainId}.png`, {
        type: 'image/png',
      });
      const message = `Captain Performance Report — ${data?.name || 'Captain'}\nTotal Sales: ${inr(
        data?.totalSales || 0
      )}\nOrders: ${data?.orders || 0}`;

      const isNative =
        typeof window !== 'undefined' && window['Capacitor']?.isNativePlatform?.();

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
        await Filesystem.writeFile({
          path: file.name,
          data: base64,
          directory: Directory.Cache,
          recursive: true,
        });
        const fileUri = await Filesystem.getUri({
          path: file.name,
          directory: Directory.Cache,
        });
        await Share.share({
          title: 'Captain Performance Report',
          text: message,
          url: fileUri.uri,
          dialogTitle: 'Share via',
        });
      } else if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Captain Performance Report',
          text: message,
          files: [file],
        });
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
      console.error('[CaptainReportCard] Share failed:', err);
      alert('Could not share report. Try downloading the image manually.');
    } finally {
      setSharing(false);
    }
  };

  const initials = useMemo(() => {
    return String(data?.name || 'C')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [data?.name]);

  const formatDisplayDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center">
          <p className="text-red-500 font-bold mb-4">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase tracking-widest"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-4 sm:p-6 font-['Inter',sans-serif]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                Captain Report Card
              </h1>
              <p className="text-sm text-gray-500 font-semibold">
                {data?.name || '...'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200">
              <Calendar size={14} className="text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm font-bold text-gray-700 focus:outline-none"
              />
              <span className="text-gray-400">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm font-bold text-gray-700 focus:outline-none"
              />
            </div>
            <button
              onClick={() => handleShare(false)}
              disabled={sharing || !data}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#128C7E] disabled:opacity-50"
            >
              {sharing ? <Share2 size={14} className="animate-pulse" /> : <Share2 size={14} />}
              {sharing ? 'Sharing...' : 'Send to WhatsApp'}
            </button>
            <button
              onClick={() => setShowPreview((s) => !s)}
              disabled={!data}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#E53935] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-700 disabled:opacity-50"
            >
              <Phone size={14} />
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl p-12 text-center">
            <div className="w-10 h-10 border-2 border-[#E53935] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-sm font-bold text-gray-500">Loading report...</p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Main dashboard view */}
            <div className="space-y-6">
              {/* Metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <MetricCard
                  icon={<ShoppingBag size={18} />}
                  label="Total Sales"
                  value={inrCompact(data.totalSales)}
                  growth={data.growth?.totalSales}
                />
                <MetricCard
                  icon={<TrendingUp size={18} />}
                  label="Avg Sales / Day"
                  value={inrCompact(data.avgSalesPerDay)}
                  growth={data.growth?.avgSalesPerDay}
                />
                <MetricCard
                  icon={<Receipt size={18} />}
                  label="Orders Handled"
                  value={String(data.orders)}
                  growth={data.growth?.orders}
                />
                <MetricCard
                  icon={<Package size={18} />}
                  label="Items Sold"
                  value={String(data.items)}
                  growth={data.growth?.items}
                />
                <MetricCard
                  icon={<DollarSign size={18} />}
                  label="Tips Earned"
                  value={inrCompact(data.tipsEarned)}
                  growth={data.growth?.tips}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sales overview chart */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                      Sales Overview
                    </h3>
                    <span className="text-xs font-bold text-gray-400">Daily</span>
                  </div>
                  {data.trends?.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.trends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                          <Tooltip formatter={(v) => [inr(Number(v)), 'Sales']} />
                          <Line
                            type="monotone"
                            dataKey="sales"
                            stroke="#E53935"
                            strokeWidth={3}
                            dot={{ r: 3, fill: '#E53935' }}
                            fill="#FFF5F5"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No trend data</div>
                  )}
                </div>

                {/* Performance doughnut */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4">
                    Performance Summary
                  </h3>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Score', value: data.performanceScore || 0 },
                            { name: 'Remaining', value: 100 - (data.performanceScore || 0) },
                          ]}
                          innerRadius={45}
                          outerRadius={65}
                          startAngle={90}
                          endAngle={-270}
                          dataKey="value"
                          stroke="none"
                        >
                          <Cell fill="#E53935" />
                          <Cell fill="#F3F4F6" />
                        </Pie>
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-black fill-gray-900">
                          {data.performanceScore || 0}%
                        </text>
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
                {/* Top items */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4">
                    Top Items Sold
                  </h3>
                  {data.topItems?.length > 0 ? (
                    <div className="space-y-4">
                      {data.topItems.map((item, idx) => (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-[#E53935] w-4">{idx + 1}</span>
                              {item.image ? (
                                <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                                  <ChefHat size={14} className="text-gray-400" />
                                </div>
                              )}
                              <p className="text-xs font-black text-gray-900 truncate max-w-[120px]">{item.name}</p>
                            </div>
                            <span className="text-xs font-black text-gray-900">{item.quantity}</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden ml-6">
                            <div className="h-full bg-[#E53935] rounded-full" style={{ width: `${Math.min(item.percent || 0, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No item data</div>
                  )}
                </div>

                {/* Sales by category */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4">
                    Sales by Category
                  </h3>
                  {data.categories?.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.categories}
                            dataKey="revenue"
                            nameKey="name"
                            cx="40%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={70}
                            stroke="none"
                          >
                            {data.categories.map((_, i) => (
                              <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => [inr(Number(v)), 'Revenue']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No category data</div>
                  )}
                  <div className="mt-2 space-y-1">
                    {data.categories?.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                          <span className="font-bold text-gray-700">{c.name}</span>
                        </div>
                        <span className="font-black text-gray-900">{c.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Activity summary */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-[#E53935]" />
                  Activity Summary
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <ActivityItem icon={Clock} label="Working Days" value={data.activity?.workingDays} />
                  <ActivityItem icon={Zap} label="Busy Days" value={data.activity?.busyDays} />
                  <ActivityItem icon={TrendingUp} label="Peak Sales Day" value={data.activity?.peakSalesDay} />
                  <ActivityItem icon={DollarSign} label="Avg Order Value" value={inrCompact(data.activity?.avgOrderValue)} />
                  <ActivityItem icon={XCircle} label="Cancelled Orders" value={data.activity?.cancelledOrders} />
                </div>
              </div>
            </div>

            {/* WhatsApp preview panel */}
            {showPreview && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100 xl:sticky xl:top-6 xl:self-start">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                    <Phone size={20} className="text-[#25D366]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Send to WhatsApp (Image)</h3>
                    <p className="text-sm text-gray-500">Share captain performance in a beautiful image format!</p>
                  </div>
                </div>
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="w-[300px] bg-black rounded-[40px] p-3 shadow-2xl">
                      <div className="bg-white rounded-[32px] overflow-hidden">
                        <div className="bg-[#075E54] text-white p-4 pt-6">
                          <p className="text-[10px] font-bold opacity-80">WhatsApp</p>
                          <p className="text-sm font-black">Captain Performance</p>
                        </div>
                        <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">
                          <div className="bg-[#EAF6FF] rounded-2xl p-4 border border-[#DCF8C6]">
                            <p className="text-[10px] font-black text-[#E53935] uppercase tracking-wider mb-1">
                              Captain Performance Report
                            </p>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E53935] to-[#B71C1C] flex items-center justify-center text-white text-sm font-black">
                                {initials}
                              </div>
                              <div>
                                <h4 className="text-sm font-black text-gray-900">{data.name}</h4>
                                <p className="text-[9px] text-gray-500">
                                  {formatDisplayDate(data.startDate)} — {formatDisplayDate(data.endDate)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 text-center bg-white rounded-xl p-3">
                              <p className="text-[9px] font-black text-gray-400 uppercase">Total Sales</p>
                              <p className="text-2xl font-black text-[#E53935]">{inrCompact(data.totalSales)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <div className="bg-white rounded-lg p-2 text-center">
                                <p className="text-[9px] text-gray-400 font-bold">Avg/Day</p>
                                <p className="text-sm font-black">{inrCompact(data.avgSalesPerDay)}</p>
                              </div>
                              <div className="bg-white rounded-lg p-2 text-center">
                                <p className="text-[9px] text-gray-400 font-bold">Orders</p>
                                <p className="text-sm font-black">{data.orders}</p>
                              </div>
                              <div className="bg-white rounded-lg p-2 text-center">
                                <p className="text-[9px] text-gray-400 font-bold">Items</p>
                                <p className="text-sm font-black">{data.items}</p>
                              </div>
                              <div className="bg-white rounded-lg p-2 text-center">
                                <p className="text-[9px] text-gray-400 font-bold">Tips</p>
                                <p className="text-sm font-black">{inrCompact(data.tipsEarned)}</p>
                              </div>
                            </div>
                            <div className="mt-2 bg-gradient-to-br from-[#B71C1C] to-[#7F0000] rounded-xl p-2 text-white text-center">
                              <p className="text-[9px] font-black uppercase opacity-80">Performance Score</p>
                              <p className="text-lg font-black">{data.performanceScore || 0}%</p>
                            </div>
                            {data.topItems?.length > 0 && (
                              <div className="mt-2">
                                <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Top Items</p>
                                <div className="flex gap-1 overflow-x-auto pb-1">
                                  {data.topItems.slice(0, 4).map((it, i) => (
                                    <div key={i} className="min-w-[60px] bg-white rounded-lg p-1 text-center">
                                      {it.image ? (
                                        <img src={it.image} alt="" className="w-10 h-10 rounded-md object-cover mx-auto" />
                                      ) : (
                                        <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center mx-auto">
                                          <ChefHat size={14} className="text-gray-400" />
                                        </div>
                                      )}
                                      <p className="text-[8px] font-bold truncate mt-1">{it.name}</p>
                                      <p className="text-[8px] text-[#E53935] font-black">{it.quantity}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <p className="text-[9px] text-center text-gray-400 mt-2">Thank you for your amazing service!</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => handleShare(false)}
                    disabled={sharing}
                    className="flex items-center gap-2 px-6 py-3 bg-[#25D366] text-white rounded-xl text-sm font-black uppercase tracking-wider hover:bg-[#128C7E] disabled:opacity-50"
                  >
                    <Share2 size={16} />
                    {sharing ? 'Sharing...' : 'Share Image'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden capture element — compact phone-style report card */}
      {data && (
        <div
          ref={reportRef}
          data-capture-root
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: '400px',
            background: '#ffffff',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div style={{ width: '400px', padding: '24px', background: '#ffffff' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p
                style={{
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#E53935',
                  margin: '0 0 8px',
                }}
              >
                Captain Performance Report
              </p>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: '20px',
                  fontWeight: 900,
                  margin: '0 auto 8px',
                  background: 'linear-gradient(135deg, #E53935, #B71C1C)',
                }}
              >
                {initials}
              </div>
              <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#111827', margin: 0 }}>{data.name}</h2>
              <p style={{ fontSize: '12px', color: '#6B7280', margin: '4px 0 0' }}>
                {formatDisplayDate(data.startDate)} — {formatDisplayDate(data.endDate)}
              </p>
            </div>

            <div
              style={{
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '16px',
                textAlign: 'center',
                background: '#FFF5F5',
              }}
            >
              <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#6B7280', margin: 0 }}>
                Total Sales
              </p>
              <p style={{ fontSize: '34px', fontWeight: 900, color: '#E53935', margin: '4px 0 0' }}>
                {inrCompact(data.totalSales)}
              </p>
              {data.growth?.totalSales ? (
                <p style={{ fontSize: '11px', color: data.growth.totalSales >= 0 ? '#16A34A' : '#DC2626', fontWeight: 700, marginTop: '4px' }}>
                  {data.growth.totalSales >= 0 ? '↑' : '↓'} {Math.abs(data.growth.totalSales)}%
                </p>
              ) : null}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              {[
                { label: 'Avg/Day', value: inrCompact(data.avgSalesPerDay) },
                { label: 'Orders', value: data.orders },
                { label: 'Items', value: data.items },
                { label: 'Tips', value: inrCompact(data.tipsEarned) },
              ].map((m, i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: '12px',
                    padding: '12px',
                    textAlign: 'center',
                    background: '#F9FAFB',
                  }}
                >
                  <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#9CA3AF', margin: 0 }}>
                    {m.label}
                  </p>
                  <p style={{ fontSize: '15px', fontWeight: 900, color: '#111827', margin: '4px 0 0' }}>{m.value}</p>
                </div>
              ))}
            </div>

            <div
              style={{
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                textAlign: 'center',
                color: '#ffffff',
                background: 'linear-gradient(135deg, #B71C1C, #7F0000)',
              }}
            >
              <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', opacity: 0.8, margin: 0 }}>
                Performance Score
              </p>
              <p style={{ fontSize: '28px', fontWeight: 900, margin: '4px 0 0' }}>{data.performanceScore || 0}%</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '6px' }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span
                    key={s}
                    style={{
                      color: s <= Math.round((data.performanceScore || 0) / 20) ? '#FACC15' : 'rgba(255,255,255,0.3)',
                      fontSize: '14px',
                    }}
                  >
                    ★
                  </span>
                ))}
              </div>
            </div>

            {data.topItems?.length > 0 && (
              <div>
                <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#6B7280', marginBottom: '8px' }}>
                  Top Items Sold
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.topItems.slice(0, 5).map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderRadius: '10px',
                        padding: '8px',
                        background: '#F9FAFB',
                      }}
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: '#E5E7EB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <span style={{ fontSize: '12px', fontWeight: 900, color: '#9CA3AF' }}>{idx + 1}</span>
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: '12px',
                            fontWeight: 900,
                            color: '#111827',
                            margin: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.name}
                        </p>
                        <p style={{ fontSize: '10px', color: '#6B7280', margin: '2px 0 0' }}>Qty: {item.quantity}</p>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: '#E53935' }}>{item.percent || 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p style={{ fontSize: '10px', textAlign: 'center', color: '#9CA3AF', marginTop: '16px' }}>
              Thank you for your amazing service!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, growth }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-2 mb-2 text-gray-500">
        {icon}
        <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg sm:text-xl font-black text-gray-900">{value}</p>
      {growth !== undefined && growth !== null && (
        <p className={`text-[10px] font-black flex items-center gap-0.5 mt-1 ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {growth >= 0 ? <ArrowUpRight size={10} /> : <ArrowUpRight size={10} className="rotate-90" />}
          {Math.abs(growth)}% vs previous period
        </p>
      )}
    </div>
  );
}

function PerformanceRow({ label, value, suffix = '%' }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-gray-500">
        <Star size={12} className="text-[#E53935]" />
        <span className="text-xs font-bold text-gray-600">{label}</span>
      </div>
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
