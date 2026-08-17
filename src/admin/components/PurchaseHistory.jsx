/**
 * PurchaseHistory — Admin Purchases subsection
 * Real data-driven purchase history with date range search, optional item filter,
 * item timeline, price analytics, vendor details, and PDF/Excel export.
 *
 * All data comes from the backend (GET /api/purchase-orders/daily/history and
 * GET /api/purchase-orders/daily/item-analytics). No hardcoded values.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Search, ArrowLeft, Calendar, Package, TrendingUp,
  FileText, FileSpreadsheet, Store, ChevronDown, ChevronRight,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { apiFetch } from '../../services/apiConfig';
import { getKolkataDateString } from '../../shared/utils/dateFormat';
import { useAuth } from '../../context/AuthContext';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const inr = (n) => '₹' + round2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrPlain = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

export default function PurchaseHistory({ onBack, outletId }) {
  const { restaurant } = useAuth();

  // Date range — default to last 30 days (history view should show data by default)
  const today = getKolkataDateString();
  const thirtyDaysAgo = getKolkataDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [itemName, setItemName] = useState('');
  const [searchedItemName, setSearchedItemName] = useState('');

  // Data
  const [records, setRecords] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchNonce, setSearchNonce] = useState(0);

  // Expanded timeline dates
  const [expandedDates, setExpandedDates] = useState({});

  // ── Load purchase history ──────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    setHasSearched(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (searchedItemName.trim()) params.set('itemName', searchedItemName.trim());
      if (outletId) params.set('outletId', outletId);
      const data = await apiFetch(`/api/purchase-orders/daily/history?${params.toString()}`);
      setRecords(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load purchase history');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, searchedItemName, outletId]);

  // ── Load item analytics (only when searching for a specific item) ──────────
  const loadAnalytics = useCallback(async () => {
    if (!searchedItemName.trim()) {
      setAnalytics(null);
      setTimeline([]);
      return;
    }
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, itemName: searchedItemName.trim() });
      if (outletId) params.set('outletId', outletId);
      const data = await apiFetch(`/api/purchase-orders/daily/item-analytics?${params.toString()}`);
      setAnalytics(data.analytics || null);
      setTimeline(data.timeline || []);
    } catch (err) {
      console.error('[PurchaseHistory] Analytics load failed:', err);
      setAnalytics(null);
      setTimeline([]);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [dateFrom, dateTo, searchedItemName, outletId]);

  // Auto-load when date range, searched item, or search nonce changes
  useEffect(() => {
    if (hasSearched) {
      loadHistory();
      loadAnalytics();
    }
  }, [loadHistory, loadAnalytics, hasSearched, searchNonce]);

  // Auto-load on first mount so the user sees data immediately
  useEffect(() => {
    setHasSearched(true);
  }, []);

  const handleSearch = () => {
    setSearchedItemName(itemName);
    setHasSearched(true);
    setSearchNonce((n) => n + 1);
  };

  const handleClearSearch = () => {
    setItemName('');
    setSearchedItemName('');
    setHasSearched(true);
    setSearchNonce((n) => n + 1);
  };

  // ── Computed totals ────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalQuantity = records.reduce((s, r) => s + Number(r.quantity), 0);
    const totalValue = records.reduce((s, r) => s + Number(r.totalPrice), 0);
    return {
      recordCount: records.length,
      totalQuantity: round2(totalQuantity),
      totalValue: round2(totalValue),
    };
  }, [records]);

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    if (records.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const restaurantName = restaurant?.name || restaurant?.businessName || 'Restaurant';
    const dateRangeStr = `${dateFrom} to ${dateTo}`;
    const title = searchedItemName.trim()
      ? `Purchase History — ${searchedItemName.trim()}`
      : `Purchase History — All Items`;

    // Header
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(restaurantName, 14, 15);
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(title, 14, 22);
    doc.text(`Date Range: ${dateRangeStr}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 34);

    // Table
    const tableData = records.map((r) => [
      r.date,
      r.itemName,
      r.categoryName || '—',
      r.vendorName || '—',
      `${round2(r.quantity)} ${r.unit || ''}`,
      inrPlain(r.unitPrice),
      inrPlain(r.totalPrice),
      r.paymentStatus,
      r.paymentMethod || '—',
    ]);

    autoTable(doc, {
      head: [['Date', 'Item', 'Category', 'Vendor', 'Qty', 'Unit Price', 'Total', 'Status', 'Method']],
      body: tableData,
      startY: 40,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [229, 57, 53], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 40 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { cellWidth: 25 },
        5: { cellWidth: 25 },
        6: { cellWidth: 30 },
        7: { cellWidth: 20 },
        8: { cellWidth: 20 },
      },
      foot: [['', '', '', '', '', 'Total', inrPlain(summary.totalValue), '', '']],
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
    });

    const fileName = `Purchase-History-${dateFrom}_to_${dateTo}${searchedItemName.trim() ? `-${searchedItemName.trim()}` : ''}.pdf`;
    doc.save(fileName);
  };

  // ── Export Excel ───────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (records.length === 0) return;

    const worksheetData = records.map((r) => ({
      'Date': r.date,
      'Item': r.itemName,
      'Category': r.categoryName || '',
      'Vendor': r.vendorName || '',
      'Vendor ID': r.vendorId || '',
      'Quantity': round2(r.quantity),
      'Unit': r.unit || '',
      'Unit Price': round2(r.unitPrice),
      'Total': round2(r.totalPrice),
      'Payment Status': r.paymentStatus,
      'Payment Method': r.paymentMethod || '',
      'Vendor Outstanding': round2(r.vendorOutstandingBalance),
    }));

    // Add summary row
    worksheetData.push({
      'Date': '',
      'Item': '',
      'Category': '',
      'Vendor': '',
      'Vendor ID': '',
      'Quantity': summary.totalQuantity,
      'Unit': '',
      'Unit Price': '',
      'Total': summary.totalValue,
      'Payment Status': '',
      'Payment Method': '',
      'Vendor Outstanding': '',
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase History');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 25 },
      { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 16 },
    ];

    const fileName = `Purchase-History-${dateFrom}_to_${dateTo}${searchedItemName.trim() ? `-${searchedItemName.trim()}` : ''}.xlsx`;
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, fileName);
  };

  const toggleDate = (date) => {
    setExpandedDates((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft size={14} />
              Back to Daily Entry
            </button>
          </div>
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
            <Package size={18} className="text-[#E53935]" />
            Purchase History
          </h3>
        </div>
      </div>

      {/* Search filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">From Date</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">To Date</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={dateTo}
                max={today}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Item Search (optional)</label>
            <div className="relative">
              <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="e.g. Onion"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm font-bold outline-none focus:border-[#E53935]"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center gap-1 bg-[#E53935] text-white rounded-lg px-4 py-2 text-xs font-black uppercase hover:bg-[#C62828] disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Searching...' : 'Search / Apply'}
          </button>
          {searchedItemName && (
            <button
              onClick={handleClearSearch}
              className="flex items-center gap-1 bg-gray-100 text-gray-600 rounded-lg px-4 py-2 text-xs font-black uppercase hover:bg-gray-200"
            >
              Clear Item Filter
            </button>
          )}
          {records.length > 0 && (
            <>
              <button
                onClick={handleExportPDF}
                disabled={loading}
                className="flex items-center gap-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-xs font-black uppercase hover:bg-blue-700 disabled:opacity-50"
              >
                <FileText size={14} />
                Export PDF
              </button>
              <button
                onClick={handleExportExcel}
                disabled={loading}
                className="flex items-center gap-1 bg-green-600 text-white rounded-lg px-4 py-2 text-xs font-black uppercase hover:bg-green-700 disabled:opacity-50"
              >
                <FileSpreadsheet size={14} />
                Export Excel
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">
          {error}
        </div>
      )}

      {/* Item Analytics (only when searching for a specific item) */}
      {searchedItemName && analytics && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h4 className="text-sm font-black uppercase tracking-widest text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-[#E53935]" />
            {searchedItemName} — Price Analytics
          </h4>
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : analytics.purchaseCount > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400">Total Quantity</div>
                  <div className="text-lg font-black text-gray-800">{round2(analytics.totalQuantity)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400">Total Value</div>
                  <div className="text-lg font-black text-gray-800">{inrPlain(analytics.totalValue)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400">Purchase Count</div>
                  <div className="text-lg font-black text-gray-800">{analytics.purchaseCount}</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400">Avg Unit Price (weighted)</div>
                  <div className="text-lg font-black text-blue-700">{inrPlain(analytics.avgUnitPrice)}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400">Min Unit Price</div>
                  <div className="text-lg font-black text-green-700">{inrPlain(analytics.minUnitPrice)}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400">Max Unit Price</div>
                  <div className="text-lg font-black text-red-700">{inrPlain(analytics.maxUnitPrice)}</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400">Latest Price</div>
                  <div className="text-lg font-black text-amber-700">{inrPlain(analytics.latestUnitPrice)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400">Latest Purchase Date</div>
                  <div className="text-sm font-black text-gray-800">{analytics.latestPurchaseDate || '—'}</div>
                </div>
              </div>

              {/* Timeline */}
              {timeline.length > 0 && (
                <div>
                  <h5 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
                    {searchedItemName} Purchase Timeline
                  </h5>
                  <div className="space-y-2">
                    {timeline.map((entry) => (
                      <div key={entry.date} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleDate(entry.date)}
                          className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
                        >
                          <div className="flex items-center gap-2">
                            {expandedDates[entry.date] ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                            <span className="text-sm font-black text-gray-800">{entry.date}</span>
                            <span className="text-[10px] font-bold text-gray-400">({entry.purchases.length} purchase{entry.purchases.length !== 1 ? 's' : ''})</span>
                          </div>
                          <span className="text-sm font-black text-[#E53935]">
                            {inrPlain(entry.purchases.reduce((s, p) => s + Number(p.total), 0))}
                          </span>
                        </button>
                        {expandedDates[entry.date] && (
                          <div className="p-3 space-y-2">
                            {entry.purchases.map((p, i) => (
                              <div key={i} className="flex items-start justify-between bg-white border border-gray-100 rounded-lg p-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Store size={12} className="text-gray-400" />
                                    <span className="text-xs font-bold text-gray-700">{p.vendorName || 'Unknown Vendor'}</span>
                                    {p.categoryName && (
                                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                        {p.categoryName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {round2(p.quantity)} {p.unit || ''} × {inrPlain(p.unitPrice)} = <span className="font-bold text-gray-700">{inrPlain(p.total)}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px]">
                                    <span className={`font-black uppercase px-1.5 py-0.5 rounded ${p.paymentStatus === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                      {p.paymentStatus}
                                    </span>
                                    {p.paymentMethod && (
                                      <span className="text-gray-400 uppercase">{p.paymentMethod}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] font-bold text-gray-400">Outstanding</div>
                                  <div className={`text-xs font-black ${p.vendorOutstandingBalance > 0 ? 'text-[#E53935]' : 'text-gray-400'}`}>
                                    {inrPlain(p.vendorOutstandingBalance)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">
              No purchase records found for "{searchedItemName}" in this date range.
            </p>
          )}
        </div>
      )}

      {/* Results table */}
      {hasSearched && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[#E53935]" />
            </div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center">
              <Package size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-400 font-bold">
                No purchase records found for the selected criteria.
              </p>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-xs font-black uppercase text-gray-500">
                  {summary.recordCount} records · {summary.totalQuantity} total qty
                </span>
                <span className="text-sm font-black text-[#E53935]">
                  Total: {inrPlain(summary.totalValue)}
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-black uppercase text-gray-400 whitespace-nowrap">Date</th>
                      <th className="text-left px-3 py-2 font-black uppercase text-gray-400">Item</th>
                      <th className="text-left px-3 py-2 font-black uppercase text-gray-400">Category</th>
                      <th className="text-left px-3 py-2 font-black uppercase text-gray-400">Vendor</th>
                      <th className="text-right px-3 py-2 font-black uppercase text-gray-400">Qty</th>
                      <th className="text-right px-3 py-2 font-black uppercase text-gray-400">Unit Price</th>
                      <th className="text-right px-3 py-2 font-black uppercase text-gray-400">Total</th>
                      <th className="text-center px-3 py-2 font-black uppercase text-gray-400">Status</th>
                      <th className="text-right px-3 py-2 font-black uppercase text-gray-400">Vendor Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, idx) => (
                      <tr key={r.id || idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-bold text-gray-700 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-2 font-bold text-gray-800">{r.itemName}</td>
                        <td className="px-3 py-2 text-gray-500">{r.categoryName || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.vendorName || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{round2(r.quantity)} {r.unit || ''}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{inrPlain(r.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-black text-gray-800">{inrPlain(r.totalPrice)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${r.paymentStatus === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {r.paymentStatus}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${r.vendorOutstandingBalance > 0 ? 'text-[#E53935]' : 'text-gray-400'}`}>
                          {inrPlain(r.vendorOutstandingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={4} className="px-3 py-2 text-xs font-black uppercase text-gray-500">Total</td>
                      <td className="px-3 py-2 text-right font-black text-gray-700">{summary.totalQuantity}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-black text-[#E53935]">{inrPlain(summary.totalValue)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {!hasSearched && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <Package size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-xs text-gray-400 font-bold">
            Select a date range and click "Search / Apply" to view purchase history.
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            Optionally enter an item name to filter results and view item analytics.
          </p>
        </div>
      )}
    </div>
  );
}
