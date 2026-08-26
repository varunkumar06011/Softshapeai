// ─────────────────────────────────────────────────────────────────────────────
// AdditionalSalesPage — full management page for Additional / Offline Sales
// ─────────────────────────────────────────────────────────────────────────────
// Allows admins to manually enter reference sales figures for outlets without
// a PC/system. Supports date picker, category tabs, add/edit/delete.
//
// CRITICAL: These values are NOT included in Total Sales, AOV, POS revenue,
// billing, or inventory. They are showcase/reference figures only.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { getKolkataDateString } from '../shared/utils/dateFormat';
import {
  fetchAdditionalSales,
  createAdditionalSale,
  updateAdditionalSale,
  deleteAdditionalSale,
} from '../services/additionalSalesApi';

const CATEGORIES = ['Food', 'Liquor', 'Beverages'];

function fmtInr(n) {
  return `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
}

export default function AdditionalSalesPage() {
  const [selectedDate, setSelectedDate] = useState(getKolkataDateString());
  const [activeCategory, setActiveCategory] = useState('Food');
  const [sales, setSales] = useState([]);
  const [totalByCategory, setTotalByCategory] = useState({ Food: 0, Liquor: 0, Beverages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    outletName: '',
    revenue: '',
    saleDate: selectedDate,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdditionalSales(selectedDate, activeCategory);
      setSales(res.items || []);
      setTotalByCategory(res.totalByCategory || { Food: 0, Liquor: 0, Beverages: 0 });
    } catch (err) {
      setError(err.message || 'Failed to load additional sales');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, activeCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset form when switching category/date
  useEffect(() => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ outletName: '', revenue: '', saleDate: selectedDate, notes: '' });
  }, [activeCategory, selectedDate]);

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
      const payload = {
        saleDate: formData.saleDate,
        category: activeCategory,
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
      setFormData({ outletName: '', revenue: '', saleDate: selectedDate, notes: '' });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
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
    if (!confirm('Delete this offline sale record?')) return;
    try {
      await deleteAdditionalSale(id);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4 font-sans bg-[#F8F9FB] -m-4 p-4 md:-m-6 md:p-6 min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-black text-[#1A1A1A]">Additional / Offline Sales</h2>
          <p className="text-[10px] font-bold text-[#6B6B6B] uppercase tracking-wider">Reference figures — not included in Total Sales or AOV</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <Calendar size={16} className="text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-sm font-semibold text-gray-800 outline-none"
          />
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

      {/* Category Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeCategory === cat
                ? 'bg-[#1A1A1A] text-white'
                : 'bg-white text-[#6B6B6B] border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat} {totalByCategory[cat] > 0 && `(${fmtInr(totalByCategory[cat])})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>
      )}

      {/* Add Button */}
      {!showForm && (
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ outletName: '', revenue: '', saleDate: selectedDate, notes: '' }); }}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
        >
          <Plus size={14} /> Add Offline Sale
        </button>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-900">{editingId ? 'Edit Offline Sale' : `Add ${activeCategory} Offline Sale`}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div>
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

      {/* Sales Table */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-12 bg-gray-100 rounded animate-pulse" />
          <div className="h-12 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : sales.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">No {activeCategory} offline sales for {selectedDate}.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Outlet Name</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Revenue</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Notes</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((it) => (
                <tr key={it.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800 font-medium">{it.outletName}</td>
                  <td className="px-4 py-3 text-gray-600">{it.saleDate}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-bold">{fmtInr(it.revenue)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{it.notes || '—'}</td>
                  <td className="px-4 py-3 text-right">
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
                <td className="px-4 py-3 text-gray-900 font-bold" colSpan={2}>Total {activeCategory}</td>
                <td className="px-4 py-3 text-right text-gray-900 font-bold">{fmtInr(totalByCategory[activeCategory] || 0)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
