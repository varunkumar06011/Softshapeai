import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ClipboardList,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RotateCcw,
  Filter,
} from 'lucide-react';
import { apiFetch } from '../services/apiConfig';

const ENTITY_TYPES = [
  { value: '', label: 'All' },
  { value: 'Expenditure', label: 'Expenditure' },
  { value: 'PurchaseOrder', label: 'Purchase Order' },
  { value: 'PurchaseOrderPayment', label: 'PO Payment' },
  { value: 'FixedAsset', label: 'Asset' },
  { value: 'Vendor', label: 'Vendor' },
  { value: 'OpeningBalance', label: 'Opening Balance' },
  { value: 'OpeningBalanceLine', label: 'Opening Balance Line' },
  { value: 'DailyBalanceSheet', label: 'Daily Balance Sheet' },
  { value: 'LedgerCategory', label: 'Ledger Category' },
  { value: 'Liability', label: 'Liability' },
  { value: 'EquityAdjustment', label: 'Equity Adjustment' },
];

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${mins}`;
}

function titleCaseAction(action) {
  return action
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatMetadataSummary(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  const parts = [];
  if (metadata.amount !== undefined) {
    const amt = Number(metadata.amount);
    parts.push(`₹${amt.toLocaleString('en-IN')}`);
  }
  if (metadata.category) parts.push(metadata.category);
  if (metadata.entryType) parts.push(metadata.entryType);
  if (metadata.narration) parts.push(metadata.narration);
  if (metadata.paidToName) parts.push(metadata.paidToName);
  if (metadata.label) parts.push(metadata.label);
  if (metadata.direction) parts.push(metadata.direction);
  if (metadata.liabilityName) parts.push(metadata.liabilityName);
  if (metadata.amountPaid !== undefined) parts.push(`Paid: ₹${Number(metadata.amountPaid).toLocaleString('en-IN')}`);
  if (metadata.remainingBalance !== undefined) parts.push(`Balance: ₹${Number(metadata.remainingBalance).toLocaleString('en-IN')}`);
  if (metadata.name && !metadata.paidToName && !metadata.liabilityName) parts.push(metadata.name);
  if (metadata.type) parts.push(metadata.type);
  if (metadata.totalPaid !== undefined) parts.push(`Total Paid: ₹${Number(metadata.totalPaid).toLocaleString('en-IN')}`);
  if (metadata.oldName && metadata.newName) parts.push(`${metadata.oldName} → ${metadata.newName}`);
  if (metadata.date) parts.push(metadata.date);
  if (metadata.totalSales !== undefined) parts.push(`Sales: ₹${Number(metadata.totalSales).toLocaleString('en-IN')}`);
  if (metadata.closingBalance !== undefined) parts.push(`Closing: ₹${Number(metadata.closingBalance).toLocaleString('en-IN')}`);
  return parts.slice(0, 3).join(' · ');
}

function MetadataDrawer({ metadata }) {
  if (!metadata || typeof metadata !== 'object') {
    return <p className="text-sm text-gray-400 py-2">No metadata available</p>;
  }
  const entries = Object.entries(metadata);
  return (
    <div className="py-2 px-4 bg-gray-50 rounded-b-lg">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col py-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{key}</span>
            <span className="text-gray-700">
              {value === null
                ? 'null'
                : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAuditTrail() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultStart = firstOfMonth.toISOString().split('T')[0];
  const defaultEnd = now.toISOString().split('T')[0];

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedRows, setExpandedRows] = useState(new Set());

  const [filters, setFilters] = useState({
    entityType: '',
    startDate: defaultStart,
    endDate: defaultEnd,
  });

  const debounceRef = useRef(null);

  const loadLogs = useCallback(async (currentPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.entityType) params.set('entityType', filters.entityType);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      params.set('page', String(currentPage));
      params.set('limit', '50');

      const data = await apiFetch(`/api/audit-log?${params.toString()}`);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(data.page || 1);
    } catch (err) {
      console.error('[AdminAuditTrail] Load failed:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Debounced reload on filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadLogs(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadLogs]);

  const toggleRow = (id) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClearFilters = () => {
    setFilters({
      entityType: '',
      startDate: defaultStart,
      endDate: defaultEnd,
    });
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    loadLogs(newPage);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ClipboardList size={24} className="text-[#E53935]" />
        <div>
          <h1 className="text-xl font-black text-gray-900">Audit Trail</h1>
          <p className="text-sm text-gray-500">Every financial action, logged and traceable.</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-700">Filters</span>
          </div>

          {/* Entity Type Dropdown */}
          <select
            value={filters.entityType}
            onChange={(e) => setFilters((prev) => ({ ...prev, entityType: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E53935] focus:outline-none focus:ring-1 focus:ring-[#E53935]"
          >
            {ENTITY_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E53935] focus:outline-none focus:ring-1 focus:ring-[#E53935]"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E53935] focus:outline-none focus:ring-1 focus:ring-[#E53935]"
            />
          </div>

          {/* Clear Button */}
          <button
            onClick={handleClearFilters}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-700 mb-3">{error}</p>
          <button
            onClick={() => loadLogs(page)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            <RotateCcw size={14} />
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {!error && loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Loader2 size={28} className="mx-auto text-gray-300 animate-spin mb-3" />
          <p className="text-sm text-gray-400">Loading audit logs...</p>
        </div>
      )}

      {/* Empty State */}
      {!error && !loading && logs.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ClipboardList size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No activity recorded for the selected filters</p>
        </div>
      )}

      {/* Table */}
      {!error && !loading && logs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400 w-8"></th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Date &amp; Time</th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Who</th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Action</th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Entity</th>
                  <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const isExpanded = expandedRows.has(log.id);
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => toggleRow(log.id)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-gray-400" />
                          ) : (
                            <ChevronRight size={16} className="text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {log.user ? (
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900">{log.user.name}</span>
                              <span className="text-xs text-gray-400">{log.user.email}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 italic">System</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-[#E53935]/10 px-2.5 py-1 text-xs font-bold text-[#B71C1C]">
                            {titleCaseAction(log.action)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">{log.entityType}</span>
                            <span className="text-xs text-gray-400 font-mono">{log.entityId ? log.entityId.slice(0, 8) + '…' : '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatMetadataSummary(log.metadata)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-0 py-0">
                            <MetadataDrawer metadata={log.metadata} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">
              {total} {total === 1 ? 'entry' : 'entries'} · Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
