// ─────────────────────────────────────────────────────────────────────────────
// CategoryBreakdownModal — outlet-wise breakdown for Food/Liquor/Beverages
// ─────────────────────────────────────────────────────────────────────────────
// Opens when the admin clicks a category card on the Dashboard.
// Shows:
//   1. System Outlet Sales (from POS/billing — /api/reports/category-outlet-sales)
//   2. Additional / Offline Sales (manually entered — /api/additional-sales)
//   3. Add Offline Sale form
//
// Additional / Offline Sales are NOT included in Total Sales or AOV.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Pencil, Trash2, Store } from 'lucide-react';
import {
  fetchCategoryOutletSales,
  fetchAdditionalSales,
  createAdditionalSale,
  updateAdditionalSale,
  deleteAdditionalSale,
} from '../services/additionalSalesApi';

const CATEGORY_MAP = {
  food: 'Food',
  beverages: 'Beverages',
  liquor: 'Liquor',
  combo: 'Combo',
};

function fmtInr(n) {
  return `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
}

export function CategoryBreakdownModal({ open, categoryKey, date, onClose }) {
  const [systemOutlets, setSystemOutlets] = useState([]);
  const [systemTotal, setSystemTotal] = useState(0);
  const [offlineSales, setOfflineSales] = useState([]);
  const [offlineTotal, setOfflineTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add/edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    outletName: '',
    revenue: '',
    saleDate: date,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const categoryName = CATEGORY_MAP[categoryKey] || categoryKey;

  const loadData = useCallback(async () => {
    if (!open || !categoryName || categoryName === 'Combo') return;
    setLoading(true);
    setError(null);
    try {
      const [systemRes, offlineRes] = await Promise.all([
        fetchCategoryOutletSales(categoryName, date),
        fetchAdditionalSales({ date, category: categoryName }),
      ]);
      setSystemOutlets(systemRes.outlets || []);
      setSystemTotal(systemRes.totalRevenue || 0);
      const items = offlineRes.items || [];
      setOfflineSales(items);
      setOfflineTotal(items.reduce((s, it) => s + Number(it.revenue || 0), 0));
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [open, categoryName, date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setShowForm(false);
      setEditingId(null);
      setFormData({ outletName: '', revenue: '', saleDate: date, notes: '' });
    }
  }, [open, date]);

  const handleSave = async () => {
    if (!formData.outletName.trim() || !formData.revenue) {
      setError('Outlet name and revenue are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        saleDate: formData.saleDate,
        category: categoryName,
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
      setFormData({ outletName: '', revenue: '', saleDate: date, notes: '' });
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{categoryName} Sales — Outlet Wise</h2>
            <p className="text-xs text-gray-500 mt-0.5">{date}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>
          )}

          {loading ? (
            <div className="space-y-3">
              <div className="h-8 bg-gray-100 rounded animate-pulse" />
              <div className="h-8 bg-gray-100 rounded animate-pulse" />
              <div className="h-8 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : (
            <>
              {/* System Outlet Sales */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Store size={16} className="text-blue-600" />
                  System Outlet Sales
                </h3>
                {systemOutlets.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No system sales for this category on this date.</p>
                ) : (
                  <div className="border border-gray-100 rounded-lg overflow-x-auto">
                    <table className="w-full text-sm min-w-[300px]">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide">Outlet</th>
                          <th className="text-right px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemOutlets.map((o) => (
                          <tr key={o.restaurantId} className="border-t border-gray-50">
                            <td className="px-4 py-2.5 text-gray-800 font-medium">{o.outletName}</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 font-bold">{fmtInr(o.revenue)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-200 bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-900 font-bold">Total</td>
                          <td className="px-4 py-2.5 text-right text-gray-900 font-bold">{fmtInr(systemTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-2">
                  Outlet totals reflect item-level revenue and may differ slightly from the Dashboard total due to bill-level rounding/round-off adjustments.
                </p>
              </div>

              {/* Additional / Offline Sales */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Plus size={16} className="text-amber-600" />
                    Additional / Offline Sales
                  </h3>
                  {!showForm && (
                    <button
                      onClick={() => { setShowForm(true); setEditingId(null); setFormData({ outletName: '', revenue: '', saleDate: date, notes: '' }); }}
                      className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700"
                    >
                      <Plus size={14} /> Add Offline Sale
                    </button>
                  )}
                </div>

                {/* Banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
                  <p className="text-[11px] font-bold text-amber-800">
                    Additional / Offline Sales — NOT included in Total Sales or AOV
                  </p>
                </div>

                {/* Add/Edit Form */}
                {showForm && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 mb-3 space-y-3">
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
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                {/* Offline Sales Table */}
                {offlineSales.length === 0 && !showForm ? (
                  <p className="text-xs text-gray-400 italic">No additional/offline sales for this category on this date.</p>
                ) : (
                  offlineSales.length > 0 && (
                    <div className="border border-gray-100 rounded-lg overflow-x-auto">
                      <table className="w-full text-sm min-w-[350px]">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide">Outlet Name</th>
                            <th className="text-right px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide">Revenue</th>
                            <th className="text-right px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {offlineSales.map((it) => (
                            <tr key={it.id} className="border-t border-gray-50">
                              <td className="px-4 py-2.5 text-gray-800 font-medium">
                                {it.outletName}
                                {it.notes && <span className="block text-[10px] text-gray-400">{it.notes}</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-900 font-bold">{fmtInr(it.revenue)}</td>
                              <td className="px-4 py-2.5 text-right">
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
                            <td className="px-4 py-2.5 text-gray-900 font-bold">Total</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 font-bold">{fmtInr(offlineTotal)}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
