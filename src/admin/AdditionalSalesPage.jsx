// ─────────────────────────────────────────────────────────────────────────────
// AdditionalSalesPage — full management page for Additional / Offline Sales
// ─────────────────────────────────────────────────────────────────────────────
// Allows admins to manually enter reference sales figures for outlets without
// a PC/system. Supports date range presets, search, category tabs, add/edit/delete.
//
// CRITICAL: These values are NOT included in Total Sales, AOV, POS revenue,
// billing, or inventory. They are showcase/reference figures only.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Plus, Pencil, Trash2, AlertTriangle, Search, X } from 'lucide-react';
import { getKolkataDateString, shiftKolkataDate } from '../shared/utils/dateFormat';
import {
  fetchAdditionalSales,
  createAdditionalSale,
  updateAdditionalSale,
  deleteAdditionalSale,
} from '../services/additionalSalesApi';

const CATEGORIES = ['All', 'Food', 'Liquor', 'Beverages'];
const CATEGORY_TABS = CATEGORIES; // 'All' + 3 categories

function fmtInr(n) {
  return `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

// Date range presets
function getDatePreset(preset) {
  const today = getKolkataDateString();
  switch (preset) {
    case 'today':
      return { fromDate: today, toDate: today };
    case 'yesterday': {
      const y = shiftKolkataDate(today, -1);
      return { fromDate: y, toDate: y };
    }
    case 'week': {
      const start = shiftKolkataDate(today, -6);
      return { fromDate: start, toDate: today };
    }
    case 'month': {
      const start = shiftKolkataDate(today, -29);
      return { fromDate: start, toDate: today };
    }
    default:
      return { fromDate: today, toDate: today };
  }
}

export default function AdditionalSalesPage() {
  // Date range state
  const [datePreset, setDatePreset] = useState('today');
  const [fromDate, setFromDate] = useState(getKolkataDateString());
  const [toDate, setToDate] = useState(getKolkataDateString());

  // Filters
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [sales, setSales] = useState([]);
  const [totalByCategory, setTotalByCategory] = useState({ Food: 0, Liquor: 0, Beverages: 0 });
  const [grandTotal, setGrandTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formCategory, setFormCategory] = useState('Food');
  const [formData, setFormData] = useState({
    outletName: '',
    revenue: '',
    saleDate: getKolkataDateString(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // Apply date preset
  const applyPreset = (preset) => {
    setDatePreset(preset);
    const { fromDate: f, toDate: t } = getDatePreset(preset);
    setFromDate(f);
    setToDate(t);
  };

  // When user manually changes a date, switch preset to 'custom'
  const handleFromDateChange = (val) => {
    setFromDate(val);
    setDatePreset('custom');
  };
  const handleToDateChange = (val) => {
    setToDate(val);
    setDatePreset('custom');
  };

  // Debounced search — trigger search 400ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdditionalSales({
        fromDate,
        toDate,
        category: activeCategory,
        search: searchQuery || undefined,
      });
      setSales(res.items || []);
      setTotalByCategory(res.totalByCategory || { Food: 0, Liquor: 0, Beverages: 0 });
      setGrandTotal(res.grandTotal || 0);
      setCount(res.count || 0);
    } catch (err) {
      setError(err.message || 'Failed to load additional sales');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, activeCategory, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset form when switching category/date
  useEffect(() => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ outletName: '', revenue: '', saleDate: getKolkataDateString(), notes: '' });
  }, [activeCategory]);

  const handleSave = async () => {
    if (!formData.outletName.trim()) {
      setError('Outlet name is required');
      return;
    }
    if (formData.revenue === '' || Number(formData.revenue) < 0) {
      setError('Revenue must be a non-negative number');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cat = editingId ? formCategory : (activeCategory === 'All' ? formCategory : activeCategory);
      const payload = {
        saleDate: formData.saleDate,
        category: cat,
        outletName: formData.outletName.trim(),
        revenue: Number(formData.revenue),
        notes: formData.notes.trim() || undefined,
      };
      if (editingId) {
        await updateAdditionalSale(editingId, payload);
      } else {
        await createAdditionalSale(payload);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ outletName: '', revenue: '', saleDate: getKolkataDateString(), notes: '' });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setFormCategory(item.category);
    setFormData({
      outletName: item.outletName,
      revenue: String(item.revenue),
      saleDate: item.saleDate,
      notes: item.notes || '',
    });
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this offline sale record? This will NOT affect any POS/system sales.')) return;
    try {
      await deleteAdditionalSale(id);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  };

  // Filtered total for the active category view
  const activeCategoryTotal = useMemo(() => {
    if (activeCategory === 'All') return grandTotal;
    return totalByCategory[activeCategory] || 0;
  }, [activeCategory, grandTotal, totalByCategory]);

  const dateRangeLabel = useMemo(() => {
    if (fromDate === toDate) return fromDate;
    return `${fromDate} → ${toDate}`;
  }, [fromDate, toDate]);

  return (
    <div className="space-y-4 font-sans bg-[#F8F9FB] -m-4 p-4 md:-m-6 md:p-6 min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-black text-[#1A1A1A]">Additional / Offline Sales</h2>
          <p className="text-[10px] font-bold text-[#6B6B6B] uppercase tracking-wider">Reference figures — not included in Total Sales or AOV</p>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-amber-800">
            These manually entered sales are showcase/reference figures only.
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            They are NOT added to Total Sales, AOV, POS revenue, billing, or inventory.
            Do not use this for system-generated sales.
          </p>
        </div>
      </div>

      {/* Date Range Presets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { key: 'today', label: 'Today' },
          { key: 'yesterday', label: 'Yesterday' },
          { key: 'week', label: 'This Week' },
          { key: 'month', label: 'This Month' },
        ].map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              datePreset === p.key
                ? 'bg-[#1A1A1A] text-white'
                : 'bg-white text-[#6B6B6B] border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date Range Inputs + Search */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Date pickers */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleFromDateChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-800 outline-none w-[120px]"
            />
          </div>
          <span className="text-xs text-gray-400 font-bold">to</span>
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleToDateChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-800 outline-none w-[120px]"
            />
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm flex-1 min-w-[180px]">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by outlet name or notes..."
            className="bg-transparent text-xs font-semibold text-gray-800 outline-none w-full"
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORY_TABS.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeCategory === cat
                ? 'bg-[#1A1A1A] text-white'
                : 'bg-white text-[#6B6B6B] border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat}
            {cat !== 'All' && totalByCategory[cat] > 0 && ` (${fmtInr(totalByCategory[cat])})`}
            {cat === 'All' && grandTotal > 0 && ` (${fmtInr(grandTotal)})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>
      )}

      {/* Add Button */}
      {!showForm && (
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setFormCategory(activeCategory === 'All' ? 'Food' : activeCategory);
            setFormData({ outletName: '', revenue: '', saleDate: getKolkataDateString(), notes: '' });
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
        >
          <Plus size={14} /> Add Offline Sale
        </button>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-900">{editingId ? 'Edit Offline Sale' : 'Add Offline Sale'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Category selector in form (always visible) */}
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-500 bg-white"
              >
                <option value="Food">Food</option>
                <option value="Liquor">Liquor</option>
                <option value="Beverages">Beverages</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Outlet Name</label>
              <input
                type="text"
                value={formData.outletName}
                onChange={(e) => setFormData({ ...formData, outletName: e.target.value })}
                placeholder="e.g. Garden Outlet"
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Revenue (₹)</label>
              <input
                type="number"
                value={formData.revenue}
                onChange={(e) => setFormData({ ...formData, revenue: e.target.value })}
                placeholder="0"
                min="0"
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={formData.saleDate}
                onChange={(e) => setFormData({ ...formData, saleDate: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Notes (optional)</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder=""
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Summary Bar — Combined Display Total */}
      {!loading && count > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Records</span>
              <p className="text-sm font-bold text-gray-900">{count}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Period</span>
              <p className="text-sm font-bold text-gray-900">{dateRangeLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {activeCategory === 'All' ? (
              <>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Offline Total</span>
                  <p className="text-sm font-black text-amber-600">{fmtInr(grandTotal)}</p>
                </div>
              </>
            ) : (
              <div className="text-right">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{activeCategory} Offline</span>
                <p className="text-sm font-black text-amber-600">{fmtInr(activeCategoryTotal)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales Table — Desktop / Tablet */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-12 bg-gray-100 rounded animate-pulse" />
          <div className="h-12 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : sales.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">
            No {activeCategory === 'All' ? '' : activeCategory + ' '}offline sales
            {searchQuery ? ` matching "${searchQuery}"` : ''} for {dateRangeLabel}.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-gray-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Outlet Name</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Revenue</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Notes</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Created By</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Updated</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((it) => (
                  <tr key={it.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{it.saleDate}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        it.category === 'Food' ? 'bg-orange-100 text-orange-700' :
                        it.category === 'Liquor' ? 'bg-purple-100 text-purple-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{it.category}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{it.outletName}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-bold whitespace-nowrap">{fmtInr(it.revenue)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">{it.notes || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <div>{it.createdBy || '—'}</div>
                      <div className="text-[10px] text-gray-400">{fmtDateTime(it.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {it.updatedBy ? (
                        <>
                          <div>{it.updatedBy}</div>
                          <div className="text-[10px] text-gray-400">{fmtDateTime(it.updatedAt)}</div>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => handleEdit(it)} className="text-gray-400 hover:text-blue-600 mr-2">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(it.id)} className="text-gray-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-bold" colSpan={3}>
                    {activeCategory === 'All' ? 'All Categories Total' : `${activeCategory} Total`}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-bold">{fmtInr(activeCategoryTotal)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {sales.map((it) => (
              <div key={it.id} className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${
                        it.category === 'Food' ? 'bg-orange-100 text-orange-700' :
                        it.category === 'Liquor' ? 'bg-purple-100 text-purple-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{it.category}</span>
                      <span className="text-xs text-gray-400">{it.saleDate}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 truncate">{it.outletName}</p>
                    {it.notes && <p className="text-xs text-gray-500 mt-0.5 truncate">{it.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-gray-900">{fmtInr(it.revenue)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-50 pt-2">
                  <div className="text-[10px] text-gray-400">
                    {it.createdBy || '—'} · {fmtDateTime(it.createdAt)}
                    {it.updatedBy && ` · edited ${it.updatedBy}`}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleEdit(it)} className="text-gray-400 hover:text-blue-600">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(it.id)} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {/* Mobile total bar */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">
                {activeCategory === 'All' ? 'All Categories' : activeCategory}
              </span>
              <span className="text-sm font-black text-gray-900">{fmtInr(activeCategoryTotal)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
