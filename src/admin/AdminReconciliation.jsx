import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Scale, Loader2, AlertCircle, RotateCcw, RefreshCw,
  ChevronDown, ChevronRight, CheckCircle, XCircle, Clock,
  TrendingDown, TrendingUp, Wallet, Building2, Info,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';
import { useAuth } from '../context/AuthContext';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(n) {
  if (n == null || isNaN(n)) return '—';
  const num = Number(n);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${mins}`;
}

// ── Status Pills ─────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const config = {
    BALANCED: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
    MISMATCH: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
    INCOMPLETE: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
  };
  const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-600', icon: AlertCircle };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${c.bg} px-2.5 py-1 text-xs font-bold ${c.text}`}>
      <Icon size={12} />
      {status}
    </span>
  );
}

function SheetStatusPill({ status }) {
  const config = {
    DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600' },
    SUBMITTED: { bg: 'bg-blue-100', text: 'text-blue-700' },
    LOCKED: { bg: 'bg-purple-100', text: 'text-purple-700' },
  };
  const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex rounded-full ${c.bg} px-2.5 py-1 text-xs font-bold ${c.text}`}>
      {status}
    </span>
  );
}

function POStatusPill({ status }) {
  const config = {
    PENDING: { bg: 'bg-gray-100', text: 'text-gray-600' },
    DELIVERED: { bg: 'bg-blue-100', text: 'text-blue-700' },
    PARTIALLY_PAID: { bg: 'bg-amber-100', text: 'text-amber-700' },
    PAID: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    CANCELLED: { bg: 'bg-red-100', text: 'text-red-700' },
  };
  const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex rounded-full ${c.bg} px-2.5 py-1 text-xs font-bold ${c.text}`}>
      {status}
    </span>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color = 'gray' }) {
  const colorMap = {
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.gray}`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={16} />}
        <span className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

// ── Error Card ───────────────────────────────────────────────────────────────
function ErrorCard({ message, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
      <p className="text-sm font-medium text-red-700 mb-3">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
      >
        <RotateCcw size={14} />
        Retry
      </button>
    </div>
  );
}

// ── Loading Card ─────────────────────────────────────────────────────────────
function LoadingCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <Loader2 size={28} className="mx-auto text-gray-300 animate-spin mb-3" />
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  );
}

// ── Tab 1: Daily Cash ────────────────────────────────────────────────────────
function DailyCashTab({ outletId, accessibleOutlets }) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultStart = firstOfMonth.toISOString().split('T')[0];
  const defaultEnd = now.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('startDate', startDate);
      params.set('endDate', endDate);
      if (outletId) params.set('outletId', outletId);
      const result = await apiFetch(`/api/balance-sheet/reconciliation/summary?${params.toString()}`);
      setData(result);
    } catch (err) {
      console.error('[Reconciliation] Daily cash load failed:', err);
      setError(err.message || 'Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, outletId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRow = (key) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard message={error} onRetry={load} />;

  const summary = data?.summary || {};
  const breakdown = data?.dailyBreakdown || [];

  return (
    <div className="space-y-4">
      {/* Date Range Picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E53935] focus:outline-none focus:ring-1 focus:ring-[#E53935]"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E53935] focus:outline-none focus:ring-1 focus:ring-[#E53935]"
          />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Balanced Days" value={summary.balancedDays ?? 0} icon={CheckCircle} color="green" />
        <StatCard label="Mismatched Days" value={summary.mismatchDays ?? 0} icon={XCircle} color="red" />
        <StatCard label="Incomplete Days" value={summary.incompleteDays ?? 0} icon={Clock} color="amber" />
        <StatCard
          label="Total Variance"
          value={formatCurrency(summary.totalVariance ?? 0)}
          icon={(summary.totalVariance ?? 0) < 0 ? TrendingDown : TrendingUp}
          color={(summary.totalVariance ?? 0) < 0 ? 'red' : 'green'}
        />
      </div>

      {/* Table */}
      {breakdown.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Scale size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No balance sheets found for this period</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400 w-8"></th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Date</th>
                  {accessibleOutlets.length > 1 && (
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Outlet</th>
                  )}
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Sheet Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">System Closing</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Actual Closing</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Variance</th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Reconciliation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {breakdown.map((row) => {
                  const rowKey = `${row.date}-${row.outletId || ''}`;
                  const isExpanded = expandedRows.has(rowKey);
                  const canExpand = row.status === 'MISMATCH' && row.systemClosing != null;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        onClick={() => canExpand && toggleRow(rowKey)}
                        className={`hover:bg-gray-50 transition-colors ${canExpand ? 'cursor-pointer' : ''}`}
                      >
                        <td className="px-4 py-3">
                          {canExpand && (
                            isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(row.date)}</td>
                        {accessibleOutlets.length > 1 && (
                          <td className="px-4 py-3 text-sm text-gray-600">{row.outletName || '—'}</td>
                        )}
                        <td className="px-4 py-3"><SheetStatusPill status={row.sheetStatus} /></td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 font-mono whitespace-nowrap">
                          {row.systemClosing != null ? formatCurrency(row.systemClosing) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 font-mono whitespace-nowrap">
                          {row.actualClosing != null ? formatCurrency(row.actualClosing) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right text-sm font-mono font-bold whitespace-nowrap ${
                          row.variance == null ? 'text-gray-400' :
                          row.variance === 0 ? 'text-emerald-600' :
                          row.variance < 0 ? 'text-red-600' : 'text-red-600'
                        }`}>
                          {row.variance != null ? formatCurrency(row.variance) : '—'}
                        </td>
                        <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                      </tr>
                      {isExpanded && canExpand && (
                        <tr>
                          <td colSpan={accessibleOutlets.length > 1 ? 8 : 7} className="px-0 py-0">
                            <div className="bg-gray-50 px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                                <div>
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Opening Balance</span>
                                  <p className="text-gray-800 font-mono">{formatCurrency(row.openingBalance)}</p>
                                </div>
                                <div>
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Sales</span>
                                  <p className="text-gray-800 font-mono">{formatCurrency(row.totalSales)}</p>
                                </div>
                                <div>
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Expenditures</span>
                                  <p className="text-gray-800 font-mono">{formatCurrency(row.totalExpenditures)}</p>
                                </div>
                                <div>
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Adjustments (Net)</span>
                                  <p className="text-gray-800 font-mono">{formatCurrency(row.adjustmentsNet)}</p>
                                </div>
                                <div>
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">System Closing</span>
                                  <p className="text-gray-800 font-mono">{formatCurrency(row.systemClosing)}</p>
                                </div>
                                <div>
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Actual Closing</span>
                                  <p className="text-gray-800 font-mono">{formatCurrency(row.actualClosing)}</p>
                                </div>
                              </div>
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Variance</span>
                                <p className={`text-lg font-black font-mono ${row.variance < 0 ? 'text-red-600' : 'text-red-600'}`}>
                                  {formatCurrency(row.variance)}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Outstanding Payables ──────────────────────────────────────────────
function OutstandingPayablesTab({ outletId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletId) params.set('outletId', outletId);
      const result = await apiFetch(`/api/purchase-orders/reconciliation/outstanding?${params.toString()}`);
      setData(result);
    } catch (err) {
      console.error('[Reconciliation] Outstanding payables load failed:', err);
      setError(err.message || 'Failed to load outstanding payables');
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard message={error} onRetry={load} />;

  const outstanding = data?.outstanding || [];
  const totalOutstanding = data?.totalOutstanding || 0;
  return (
    <div className="space-y-4">
      {/* Stat Card */}
      <StatCard
        label="Total Outstanding"
        value={formatCurrency(totalOutstanding)}
        icon={Wallet}
        color={totalOutstanding > 0 ? 'red' : 'green'}
      />

      {/* Table */}
      {outstanding.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CheckCircle size={32} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-sm font-medium text-gray-500">No outstanding payables — all purchase orders are paid or cancelled</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Vendor</th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Order Date</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Total Amount</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Paid</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Outstanding</th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outstanding.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{po.vendorName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(po.orderDate)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 font-mono whitespace-nowrap">{formatCurrency(po.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 font-mono whitespace-nowrap">{formatCurrency(po.paidAmount)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-red-600 font-mono whitespace-nowrap">{formatCurrency(po.outstandingAmount)}</td>
                    <td className="px-4 py-3"><POStatusPill status={po.status} /></td>
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

// ── Tab 3: Depreciation Gaps ─────────────────────────────────────────────────
function DepreciationGapsTab({ outletId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (outletId) params.set('outletId', outletId);
      const result = await apiFetch(`/api/fixed-assets/reconciliation/depreciation-gaps?${params.toString()}`);
      setData(result);
    } catch (err) {
      console.error('[Reconciliation] Depreciation gaps load failed:', err);
      setError(err.message || 'Failed to load depreciation gaps');
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingCard />;
  if (error) return <ErrorCard message={error} onRetry={load} />;

  const gaps = data?.gaps || [];
  const skippedAssets = data?.skippedAssets || 0;

  return (
    <div className="space-y-4">
      {/* Stat Card */}
      <StatCard
        label="Assets with Gaps"
        value={gaps.length}
        icon={Building2}
        color={gaps.length > 0 ? 'red' : 'green'}
      />

      {/* Table */}
      {gaps.length === 0 ? (
        <div className="bg-white rounded-xl border border-emerald-200 p-12 text-center">
          <CheckCircle size={32} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-sm font-medium text-emerald-600">All depreciation entries are up to date</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Asset Name</th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Purchase Date</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Expected Months</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Logged Entries</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Missing Months</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Current Book Value</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Expected Book Value</th>
                  <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gaps.map((asset) => {
                  const diff = Math.round((asset.currentBookValue - asset.expectedBookValue) * 100) / 100;
                  return (
                    <tr key={asset.assetId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{asset.assetName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(asset.purchaseDate)}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 font-mono">{asset.expectedMonths}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 font-mono">{asset.actualEntries}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-red-600 font-mono">{asset.missingMonths}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 font-mono whitespace-nowrap">{formatCurrency(asset.currentBookValue)}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 font-mono whitespace-nowrap">{formatCurrency(asset.expectedBookValue)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-red-600 font-mono whitespace-nowrap">{formatCurrency(diff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Skipped Assets Info Note */}
      {skippedAssets > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <Info size={16} className="text-blue-500" />
          <p className="text-sm text-blue-700">
            {skippedAssets} {skippedAssets === 1 ? 'asset was' : 'assets were'} skipped (non-straight-line or missing useful life).
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function AdminReconciliation() {
  const { restaurant } = useAuth();
  const [activeTab, setActiveTab] = useState('daily-cash');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);

  const accessibleOutlets = useMemo(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);

  const [outletId, setOutletId] = useState(() => {
    try {
      const raw = localStorage.getItem('ss_accessible_outlets');
      const outlets = raw ? JSON.parse(raw) : [];
      if (outlets.length > 1) return 'all';
      if (outlets.length === 1) return outlets[0].id;
      return restaurant?.id || '';
    } catch {
      return restaurant?.id || '';
    }
  });

  const handleRefresh = () => {
    setLastRefreshed(new Date());
    setRefreshKey((k) => k + 1);
  };

  const tabs = [
    { key: 'daily-cash', label: 'Daily Cash', icon: Scale },
    { key: 'payables', label: 'Outstanding Payables', icon: Wallet },
    { key: 'depreciation', label: 'Depreciation Gaps', icon: Building2 },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale size={24} className="text-[#E53935]" />
          <div>
            <h1 className="text-xl font-black text-gray-900">Reconciliation</h1>
            <p className="text-sm text-gray-500">Daily cash position, outstanding payables, and depreciation health.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Last refreshed: {formatDateTime(lastRefreshed)}</span>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Outlet Selector (only if multi-outlet) */}
      {accessibleOutlets.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Outlet:</span>
          <select
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E53935] focus:outline-none focus:ring-1 focus:ring-[#E53935]"
          >
            <option value="all">All Outlets</option>
            {accessibleOutlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 font-bold text-sm transition-all ${
                activeTab === tab.key
                  ? 'border-b-2 border-[#E53935] text-[#E53935]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div key={`${activeTab}-${refreshKey}`}>
        {activeTab === 'daily-cash' && <DailyCashTab outletId={outletId} accessibleOutlets={accessibleOutlets} />}
        {activeTab === 'payables' && <OutstandingPayablesTab outletId={outletId} />}
        {activeTab === 'depreciation' && <DepreciationGapsTab outletId={outletId} />}
      </div>
    </div>
  );
}
