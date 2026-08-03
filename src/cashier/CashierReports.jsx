// ─────────────────────────────────────────────────────────────────────────────
// CashierReports — Edge-first reports dashboard for cashiers
// ─────────────────────────────────────────────────────────────────────────────
// Self-contained reports component that fetches ALL data from the edge server
// (local SQLite). Never imports from AdminReports.jsx and never calls cloud
// report endpoints. Works offline for edge-local (PIN) sessions.
//
// Report types:
//   - Daily Sales Summary
//   - Item-wise Sales (existing edge endpoint)
//   - Category-wise Sales
//   - Payment Method Breakdown
//   - Discount Report
//   - GST Report
//   - Cancelled/Edited Items
//   - Hourly Analysis
//   - Table Utilization
//   - KOT Count
//   - Venue Revenue
//   - Captain Performance (existing edge endpoint)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, BarChart3, PieChart, Percent, Receipt, XCircle, Clock,
  Table2, FileText, Building2, Users, Loader2, AlertCircle, Calendar,
  Download, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { edgeFetch, isEdgeAvailable } from '../services/edgeHealth';
import { getKolkataDateString, shiftKolkataDate, formatDateDisplay } from '../shared/utils/dateFormat';
import { downloadPDF, downloadExcel } from '../admin/reportDownloads';

const REPORT_TYPES = [
  { id: 'daily-sales', label: 'Daily Sales', icon: TrendingUp },
  { id: 'items-sold', label: 'Item-wise Sales', icon: BarChart3 },
  { id: 'categorywise-sales', label: 'Category Sales', icon: PieChart },
  { id: 'payment-methods', label: 'Payment Methods', icon: Receipt },
  { id: 'discount-report', label: 'Discounts', icon: Percent },
  { id: 'gst-report', label: 'GST Report', icon: FileText },
  { id: 'cancelled-items', label: 'Cancelled Items', icon: XCircle },
  { id: 'hourly-analysis', label: 'Hourly Analysis', icon: Clock },
  { id: 'table-utilization', label: 'Table Utilization', icon: Table2 },
  { id: 'kot-count', label: 'KOT Count', icon: FileText },
  { id: 'venue-revenue', label: 'Venue Revenue', icon: Building2 },
  { id: 'captain-performance', label: 'Captain Performance', icon: Users },
];

const EDGE_PATHS = {
  'daily-sales': '/api/edge/reports/daily-sales',
  'items-sold': '/api/edge/analytics/items-sold',
  'categorywise-sales': '/api/edge/reports/categorywise-sales',
  'payment-methods': '/api/edge/reports/payment-methods',
  'discount-report': '/api/edge/reports/discount-report',
  'gst-report': '/api/edge/reports/gst-report',
  'cancelled-items': '/api/edge/reports/cancelled-items',
  'hourly-analysis': '/api/edge/reports/hourly-analysis',
  'table-utilization': '/api/edge/reports/table-utilization',
  'kot-count': '/api/edge/reports/kot-count',
  'venue-revenue': '/api/edge/reports/venue-revenue',
  'captain-performance': '/api/edge/analytics/captain-performance',
};

export default function CashierReports() {
  const [activeReport, setActiveReport] = useState('daily-sales');
  const [startDate, setStartDate] = useState(getKolkataDateString());
  const [endDate, setEndDate] = useState(getKolkataDateString());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [edgeDown, setEdgeDown] = useState(false);
  const [venueId, setVenueId] = useState('');
  const [venues, setVenues] = useState([]);

  // ── Date range presets ─────────────────────────────────────────────────────
  const applyPreset = useCallback((preset) => {
    const today = getKolkataDateString();
    switch (preset) {
      case 'today':
        setStartDate(today); setEndDate(today); break;
      case 'yesterday': {
        const y = shiftKolkataDate(new Date(), -1);
        setStartDate(y); setEndDate(y); break;
      }
      case 'last7': {
        const s = shiftKolkataDate(new Date(), -6);
        setStartDate(s); setEndDate(today); break;
      }
      case 'last30': {
        const s = shiftKolkataDate(new Date(), -29);
        setStartDate(s); setEndDate(today); break;
      }
      case 'thisMonth': {
        const s = getKolkataDateString().slice(0, 8) + '01';
        setStartDate(s); setEndDate(today); break;
      }
    }
  }, []);

  // ── Fetch venue list for filter dropdown ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isEdgeAvailable())) return;
      try {
        const res = await edgeFetch('/api/edge/venues', { timeoutMs: 5000 });
        if (!cancelled && Array.isArray(res)) setVenues(res);
      } catch { /* venues filter is optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch report data ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setData(null);
    setEdgeDown(false);

    if (!(await isEdgeAvailable())) {
      setEdgeDown(true);
      setLoading(false);
      return;
    }

    try {
      const path = EDGE_PATHS[activeReport];
      const params = activeReport === 'hourly-analysis'
        ? `?date=${encodeURIComponent(startDate)}`
        : `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
      const venueParam = venueId ? `&venueId=${encodeURIComponent(venueId)}` : '';
      const res = await edgeFetch(`${path}${params}${venueParam}`, { timeoutMs: 8000 });
      setData(res);
    } catch (err) {
      setError(err?.message || 'Failed to load report from edge server.');
      setEdgeDown(true);
    } finally {
      setLoading(false);
    }
  }, [activeReport, startDate, endDate, venueId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // ── Quick date navigation ──────────────────────────────────────────────────
  const shiftRange = useCallback((days) => {
    setStartDate(shiftKolkataDate(startDate, days));
    setEndDate(shiftKolkataDate(endDate, days));
  }, [startDate, endDate]);

  const isSingleDay = startDate === endDate;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header + date controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={22} className="text-[#1E3A8A]" />
            Cashier Reports
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => shiftRange(-1)}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
              title="Previous day"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-gray-600 min-w-[120px] text-center">
              {isSingleDay ? formatDateDisplay(startDate) : `${formatDateDisplay(startDate)} → ${formatDateDisplay(endDate)}`}
            </span>
            <button
              onClick={() => shiftRange(1)}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
              title="Next day"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-[#1E3A8A]"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-[#1E3A8A]"
            />
          </div>
          {/* Venue filter */}
          {venues.length > 0 && (
            <div className="flex items-center gap-1">
              <Building2 size={14} className="text-gray-400" />
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-[#1E3A8A]"
              >
                <option value="">All Venues</option>
                {venues.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-1 ml-auto">
            {['today', 'yesterday', 'last7', 'last30', 'thisMonth'].map(p => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
              >
                {p === 'thisMonth' ? 'This Month' : p === 'last7' ? '7 Days' : p === 'last30' ? '30 Days' : p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Report type sidebar */}
        <div className="w-48 shrink-0 bg-white rounded-xl border border-gray-200 p-2 shadow-sm overflow-y-auto">
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => setActiveReport(rt.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-xs font-black uppercase tracking-wider transition mb-1 ${activeReport === rt.id
                ? 'bg-[#1E3A8A] text-white'
                : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <rt.icon size={15} className={activeReport === rt.id ? 'text-white' : 'text-gray-400'} />
              {rt.label}
            </button>
          ))}
        </div>

        {/* Report content */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-y-auto">
          {edgeDown && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle size={40} className="text-gray-300 mb-3" />
              <p className="text-sm font-bold text-gray-400 mb-1">Reports not available</p>
              <p className="text-xs text-gray-400">The edge server is unreachable. Cashier reports require the edge server (local SQLite) and do not fall back to cloud.</p>
              <button
                onClick={fetchData}
                className="mt-4 px-4 py-2 bg-[#1E3A8A] text-white rounded-lg text-xs font-black uppercase hover:bg-blue-800 transition"
              >
                Retry
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin text-[#1E3A8A]" />
            </div>
          )}

          {error && !edgeDown && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              <AlertCircle size={18} className="text-red-600" />
              <p className="text-sm font-bold text-red-700">{error}</p>
            </div>
          )}

          {!loading && !edgeDown && !error && data && (
            <ReportRenderer reportId={activeReport} data={data} startDate={startDate} endDate={endDate} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportRenderer — dispatches to the correct renderer per report type
// ─────────────────────────────────────────────────────────────────────────────
function ReportRenderer({ reportId, data, startDate, endDate }) {
  switch (reportId) {
    case 'daily-sales': return <DailySalesReport data={data} startDate={startDate} endDate={endDate} />;
    case 'items-sold': return <ItemsSoldReport data={data} startDate={startDate} endDate={endDate} />;
    case 'categorywise-sales': return <CategorySalesReport data={data} startDate={startDate} endDate={endDate} />;
    case 'payment-methods': return <PaymentMethodsReport data={data} startDate={startDate} endDate={endDate} />;
    case 'discount-report': return <DiscountReport data={data} startDate={startDate} endDate={endDate} />;
    case 'gst-report': return <GstReport data={data} startDate={startDate} endDate={endDate} />;
    case 'cancelled-items': return <CancelledItemsReport data={data} startDate={startDate} endDate={endDate} />;
    case 'hourly-analysis': return <HourlyAnalysisReport data={data} />;
    case 'table-utilization': return <TableUtilizationReport data={data} startDate={startDate} endDate={endDate} />;
    case 'kot-count': return <KotCountReport data={data} startDate={startDate} endDate={endDate} />;
    case 'venue-revenue': return <VenueRevenueReport data={data} startDate={startDate} endDate={endDate} />;
    case 'captain-performance': return <CaptainPerformanceReport data={data} startDate={startDate} endDate={endDate} />;
    default: return <p className="text-sm text-gray-400">Unknown report type.</p>;
  }
}

// ── Shared UI helpers ────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
      <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">{label}</p>
      <p className="text-lg font-black text-gray-900 mt-0.5">{value}</p>
      {sub && <p className="text-[10px] font-bold text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// Pagination hook — resets to page 0 whenever rows change.
function usePagination(rows, pageSize = 25) {
  const [currentPage, setCurrentPage] = useState(0);
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setCurrentPage(0);
  }
  const totalRows = rows?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageRows = rows?.slice(currentPage * pageSize, (currentPage + 1) * pageSize) || [];
  return { pageRows, currentPage, totalPages, totalRows, setCurrentPage };
}

// Export modal — asks user to choose "Current page" or "All records" before
// generating the file. Renders only when there are rows to export.
function ExportButtons({ title, headers, allRows, currentPageRows, filename, sheets, startDate, endDate }) {
  const [showModal, setShowModal] = useState(false);
  const [pendingFormat, setPendingFormat] = useState(null);
  if (!allRows || allRows.length === 0) return null;
  const dateRange = `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;

  const triggerExport = (format) => {
    setPendingFormat(format);
    setShowModal(true);
  };

  const doExport = (scope) => {
    const rowsToExport = scope === 'page' ? (currentPageRows || allRows) : allRows;
    const sheetsToExport = sheets
      ? sheets.map((s, i) => ({
          ...s,
          rows: scope === 'page' && i === 0 ? (currentPageRows || s.rows) : s.rows,
        }))
      : [{ name: title, headers, rows: rowsToExport }];
    if (pendingFormat === 'pdf') {
      downloadPDF({ title, dateRange, headers, rows: rowsToExport, filename: `${filename}.pdf` });
    } else {
      downloadExcel({ title, dateRange, sheets: sheetsToExport, filename: `${filename}.xlsx` });
    }
    setShowModal(false);
    setPendingFormat(null);
  };

  return (
    <>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => triggerExport('pdf')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E3A8A] text-white rounded-lg text-xs font-black uppercase hover:bg-blue-800 transition"
        >
          <Download size={13} /> PDF
        </button>
        <button
          onClick={() => triggerExport('excel')}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-black uppercase hover:bg-gray-50 transition"
        >
          <Download size={13} /> Excel
        </button>
      </div>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-3">Export Scope</h4>
            <p className="text-xs text-gray-500 mb-4">Choose which records to include in the export.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => doExport('page')}
                className="px-4 py-2.5 bg-[#1E3A8A] text-white rounded-lg text-xs font-black uppercase hover:bg-blue-800 transition"
              >
                Current Page ({currentPageRows?.length || 0} rows)
              </button>
              <button
                onClick={() => doExport('all')}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-black uppercase hover:bg-gray-50 transition"
              >
                All Records ({allRows.length} rows)
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({ message }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-bold text-gray-400">{message || 'No data available for the selected date range.'}</p>
    </div>
  );
}

// Paginated table — accepts {key, label} headers and rows keyed by key.
function Table({ headers, rows, currentPage, totalPages, setCurrentPage }) {
  if (!rows || rows.length === 0) return <EmptyState />;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              {headers.map(h => (
                <th key={h.key} className="text-left py-2 px-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                {headers.map(h => (
                  <td key={h.key} className="py-2 px-3 font-bold text-gray-700">{row[h.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs font-bold text-gray-400">
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// SimpleTable — for small summary tables that don't need pagination.
function SimpleTable({ headers, rows }) {
  if (!rows || rows.length === 0) return <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200">
            {headers.map(h => (
              <th key={h.key} className="text-left py-2 px-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              {headers.map(h => (
                <td key={h.key} className="py-2 px-3 font-bold text-gray-700">{row[h.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Daily Sales ──────────────────────────────────────────────────────────────
function DailySalesReport({ data, startDate, endDate }) {
  const s = data.summary || {};
  const byDay = data.byDay || [];
  const headers = [
    { key: 'date', label: 'Date' }, { key: 'revenue', label: 'Revenue' }, { key: 'transactions', label: 'Transactions' },
  ];
  const rows = byDay.map(d => ({ date: d.date, revenue: `₹${d.revenue}`, transactions: d.transactions }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Daily Sales Summary</h3>
      <ExportButtons
        title="Daily Sales Summary"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="daily-sales"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Daily Sales', headers, rows }]}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Revenue" value={`₹${s.totalRevenue || 0}`} />
        <StatCard label="Transactions" value={s.totalTransactions || 0} />
        <StatCard label="Avg Bill" value={`₹${s.averageBillValue || 0}`} />
        <StatCard label="Discount" value={`₹${s.totalDiscount || 0}`} />
        <StatCard label="CGST" value={`₹${s.totalCGST || 0}`} />
        <StatCard label="SGST" value={`₹${s.totalSGST || 0}`} />
      </div>
      <h4 className="text-xs font-black uppercase text-gray-500 mb-2">By Day</h4>
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Item-wise Sales ──────────────────────────────────────────────────────────
function ItemsSoldReport({ data, startDate, endDate }) {
  const items = data.items || [];
  const headers = [
    { key: 'name', label: 'Item' }, { key: 'quantity', label: 'Quantity' }, { key: 'revenue', label: 'Revenue' },
    { key: 'type', label: 'Type' }, { key: 'orderCount', label: 'Orders' },
  ];
  const rows = items.map(it => ({
    name: it.name, quantity: it.quantity, revenue: `₹${it.revenue}`, type: it.type, orderCount: it.orderCount,
  }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Item-wise Sales</h3>
      <ExportButtons
        title="Item-wise Sales"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="item-wise-sales"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Items', headers, rows }]}
      />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Items" value={data.summary?.totalItems || 0} />
        <StatCard label="Total Quantity" value={data.summary?.totalQuantity || 0} />
        <StatCard label="Total Revenue" value={`₹${data.summary?.totalRevenue || 0}`} />
      </div>
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Category Sales ───────────────────────────────────────────────────────────
function CategorySalesReport({ data, startDate, endDate }) {
  const cats = data.categories || [];
  const headers = [
    { key: 'name', label: 'Category' }, { key: 'itemCount', label: 'Items' },
    { key: 'totalQuantity', label: 'Quantity' }, { key: 'totalRevenue', label: 'Revenue' },
  ];
  const rows = cats.map(c => ({
    name: c.name, itemCount: c.itemCount, totalQuantity: c.totalQuantity, totalRevenue: `₹${c.totalRevenue}`,
  }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Category-wise Sales</h3>
      <ExportButtons
        title="Category-wise Sales"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="category-sales"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Categories', headers, rows }]}
      />
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Payment Methods ──────────────────────────────────────────────────────────
function PaymentMethodsReport({ data, startDate, endDate }) {
  const byMethod = data.byMethod || {};
  const headers = [
    { key: 'method', label: 'Method' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount' },
  ];
  const rows = Object.entries(byMethod).map(([method, v]) => ({
    method, count: v.count, amount: `₹${v.amount}`,
  }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Payment Method Breakdown</h3>
      <ExportButtons
        title="Payment Methods"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="payment-methods"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Methods', headers, rows }]}
      />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Total Revenue" value={`₹${data.totalRevenue || 0}`} />
        <StatCard label="Transactions" value={data.totalTransactions || 0} />
      </div>
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Discount Report ──────────────────────────────────────────────────────────
function DiscountReport({ data, startDate, endDate }) {
  const orders = data.discountedOrders || [];
  const byPercent = data.byDiscountPercent || [];
  const orderHeaders = [
    { key: 'billNumber', label: 'Bill No' }, { key: 'discountPercent', label: 'Discount %' },
    { key: 'discountAmount', label: 'Discount Amt' }, { key: 'grandTotal', label: 'Grand Total' },
  ];
  const orderRows = orders.map(o => ({
    billNumber: o.billNumber || '—', discountPercent: o.discountPercent,
    discountAmount: `₹${o.discountAmount}`, grandTotal: `₹${o.grandTotal}`,
  }));
  const percentHeaders = [
    { key: 'percent', label: 'Discount %' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount' },
  ];
  const percentRows = byPercent.map(p => ({ percent: p.percent, count: p.count, amount: `₹${p.amount}` }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(orderRows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Discount Report</h3>
      <ExportButtons
        title="Discount Report"
        headers={orderHeaders}
        allRows={orderRows}
        currentPageRows={pageRows}
        filename="discount-report"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Orders', headers: orderHeaders, rows: orderRows }]}
      />
      <div className="grid grid-cols-1 gap-3 mb-4">
        <StatCard label="Total Discount" value={`₹${data.totalDiscount || 0}`} />
      </div>
      <h4 className="text-xs font-black uppercase text-gray-500 mb-2">By Discount Percent</h4>
      <SimpleTable headers={percentHeaders} rows={percentRows} />
      <h4 className="text-xs font-black uppercase text-gray-500 mb-2 mt-4">Discounted Orders</h4>
      <Table headers={orderHeaders} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── GST Report ───────────────────────────────────────────────────────────────
function GstReport({ data, startDate, endDate }) {
  const byRate = data.byRate || [];
  const headers = [
    { key: 'rate', label: 'GST Rate' }, { key: 'taxableValue', label: 'Taxable Value' },
    { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' },
  ];
  const rows = byRate.map(r => ({
    rate: `${r.rate}%`, taxableValue: `₹${r.taxableValue}`, cgst: `₹${r.cgst}`, sgst: `₹${r.sgst}`,
  }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">GST Report</h3>
      <ExportButtons
        title="GST Report"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="gst-report"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'GST', headers, rows }]}
      />
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatCard label="Taxable Value" value={`₹${data.totalTaxableValue || 0}`} />
        <StatCard label="CGST" value={`₹${data.totalCGST || 0}`} />
        <StatCard label="SGST" value={`₹${data.totalSGST || 0}`} />
        <StatCard label="Transactions" value={data.transactions || 0} />
      </div>
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Cancelled Items ──────────────────────────────────────────────────────────
function CancelledItemsReport({ data, startDate, endDate }) {
  const items = data.items || [];
  const byItem = data.byItem || [];
  const itemHeaders = [
    { key: 'name', label: 'Item' }, { key: 'quantity', label: 'Qty' },
    { key: 'price', label: 'Price' }, { key: 'cancelledBy', label: 'Cancelled By' },
  ];
  const itemRows = items.map(it => ({
    name: it.name, quantity: it.quantity, price: `₹${it.price}`, cancelledBy: it.cancelledBy || '—',
  }));
  const byItemHeaders = [
    { key: 'name', label: 'Item' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount' },
  ];
  const byItemRows = byItem.map(b => ({ name: b.name, count: b.count, amount: `₹${b.amount}` }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(itemRows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Cancelled / Edited Items</h3>
      <ExportButtons
        title="Cancelled Items"
        headers={itemHeaders}
        allRows={itemRows}
        currentPageRows={pageRows}
        filename="cancelled-items"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Items', headers: itemHeaders, rows: itemRows }]}
      />
      <div className="grid grid-cols-1 gap-3 mb-4">
        <StatCard label="Total Cancelled Qty" value={data.totalCancelled || 0} />
      </div>
      <h4 className="text-xs font-black uppercase text-gray-500 mb-2">By Item</h4>
      <SimpleTable headers={byItemHeaders} rows={byItemRows} />
      <h4 className="text-xs font-black uppercase text-gray-500 mb-2 mt-4">All Cancelled Items</h4>
      <Table headers={itemHeaders} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Hourly Analysis ──────────────────────────────────────────────────────────
function HourlyAnalysisReport({ data }) {
  const byHour = (data.byHour || []).filter(h => h.transactions > 0);
  const headers = [
    { key: 'hour', label: 'Hour' }, { key: 'revenue', label: 'Revenue' },
    { key: 'transactions', label: 'Transactions' }, { key: 'items', label: 'Items' },
  ];
  const rows = byHour.map(h => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`, revenue: `₹${h.revenue}`, transactions: h.transactions, items: h.items,
  }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Hourly Analysis — {data.date}</h3>
      <ExportButtons
        title="Hourly Analysis"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="hourly-analysis"
        startDate={data.date}
        endDate={data.date}
        sheets={[{ name: 'Hourly', headers, rows }]}
      />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Peak Hour" value={data.peakHour ? `${String(data.peakHour.hour).padStart(2, '0')}:00` : '—'} sub={data.peakHour ? `₹${data.peakHour.revenue}` : ''} />
        <StatCard label="Slowest Hour" value={data.slowestHour ? `${String(data.slowestHour.hour).padStart(2, '0')}:00` : '—'} sub={data.slowestHour ? `₹${data.slowestHour.revenue}` : ''} />
      </div>
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Table Utilization ────────────────────────────────────────────────────────
function TableUtilizationReport({ data, startDate, endDate }) {
  const byTable = data.byTable || [];
  const headers = [
    { key: 'tableNumber', label: 'Table' }, { key: 'sectionName', label: 'Section' },
    { key: 'orderCount', label: 'Orders' }, { key: 'revenue', label: 'Revenue' }, { key: 'avgOrderValue', label: 'Avg Order' },
  ];
  const rows = byTable.map(t => ({
    tableNumber: t.tableNumber, sectionName: t.sectionName, orderCount: t.orderCount,
    revenue: `₹${t.revenue}`, avgOrderValue: `₹${t.avgOrderValue}`,
  }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Table Utilization</h3>
      <ExportButtons
        title="Table Utilization"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="table-utilization"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Tables', headers, rows }]}
      />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Total Orders" value={data.totalOrders || 0} />
        <StatCard label="Total Revenue" value={`₹${data.totalRevenue || 0}`} />
      </div>
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── KOT Count ────────────────────────────────────────────────────────────────
function KotCountReport({ data, startDate, endDate }) {
  const byType = data.byType || [];
  const byDay = data.byDay || [];
  const typeHeaders = [{ key: 'type', label: 'Type' }, { key: 'count', label: 'Count' }];
  const typeRows = byType.map(t => ({ type: t.type, count: t.count }));
  const dayHeaders = [{ key: 'date', label: 'Date' }, { key: 'count', label: 'Count' }];
  const dayRows = byDay.map(d => ({ date: d.date, count: d.count }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(dayRows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">KOT Count</h3>
      <ExportButtons
        title="KOT Count"
        headers={dayHeaders}
        allRows={dayRows}
        currentPageRows={pageRows}
        filename="kot-count"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'By Day', headers: dayHeaders, rows: dayRows }, { name: 'By Type', headers: typeHeaders, rows: typeRows }]}
      />
      <div className="grid grid-cols-1 gap-3 mb-4">
        <StatCard label="Total KOTs" value={data.totalKots || 0} />
      </div>
      <h4 className="text-xs font-black uppercase text-gray-500 mb-2">By Type</h4>
      <SimpleTable headers={typeHeaders} rows={typeRows} />
      <h4 className="text-xs font-black uppercase text-gray-500 mb-2 mt-4">By Day</h4>
      <Table headers={dayHeaders} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Venue Revenue ────────────────────────────────────────────────────────────
function VenueRevenueReport({ data, startDate, endDate }) {
  const byVenue = data.byVenue || [];
  const headers = [
    { key: 'venueName', label: 'Venue' }, { key: 'revenue', label: 'Revenue' },
    { key: 'transactions', label: 'Transactions' }, { key: 'items', label: 'Items' },
  ];
  const rows = byVenue.map(v => ({
    venueName: v.venueName, revenue: `₹${v.revenue}`, transactions: v.transactions, items: v.items,
  }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Venue Revenue</h3>
      <ExportButtons
        title="Venue Revenue"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="venue-revenue"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Venues', headers, rows }]}
      />
      <div className="grid grid-cols-1 gap-3 mb-4">
        <StatCard label="Total Revenue" value={`₹${data.totalRevenue || 0}`} />
      </div>
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}

// ── Captain Performance ──────────────────────────────────────────────────────
function CaptainPerformanceReport({ data, startDate, endDate }) {
  const captains = data.captains || [];
  const headers = [
    { key: 'name', label: 'Name' }, { key: 'sales', label: 'Sales' }, { key: 'orders', label: 'Orders' },
    { key: 'items', label: 'Items' }, { key: 'topItem', label: 'Top Item' },
  ];
  const rows = captains.map(c => ({
    name: c.name, sales: `₹${c.sales}`, orders: c.orders, items: c.items, topItem: c.highestSellingItem?.name || '—',
  }));
  const { pageRows, currentPage, totalPages, setCurrentPage } = usePagination(rows);
  return (
    <div>
      <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-3">Captain Performance</h3>
      <ExportButtons
        title="Captain Performance"
        headers={headers}
        allRows={rows}
        currentPageRows={pageRows}
        filename="captain-performance"
        startDate={startDate}
        endDate={endDate}
        sheets={[{ name: 'Captains', headers, rows }]}
      />
      <Table headers={headers} rows={pageRows} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} />
    </div>
  );
}
