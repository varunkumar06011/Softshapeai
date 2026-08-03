// ─────────────────────────────────────────────────────────────────────────────
// CashierSpecialsManager — Today's Specials management for cashiers
// ─────────────────────────────────────────────────────────────────────────────
// Permission-gated (menuSpecials) component that allows cashiers to:
//   - View all items flagged as Today's Specials
//   - Toggle active/inactive per special
//   - Set the broadcast channel (CASHIER / CAPTAIN / BOTH)
//   - Set / clear an expiry date-time
//   - Remove the special flag (keeps the underlying item)
//   - Bulk-add new specials by name (reuses bulkImportSpecials service)
//
// All writes go through updateMenuItem / bulkImportSpecials (edge-first,
// offline-capable). No image upload, no item deletion.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useCallback } from 'react';
import { Flame, Check, AlertCircle, Loader2, X, Plus, Trash2 } from 'lucide-react';

const CHANNELS = ['CASHIER', 'CAPTAIN', 'BOTH'];

export default function CashierSpecialsManager({ menuItems, categories, refreshMenu, updateMenuItem, bulkImportSpecials }) {
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add-specials modal state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newIsVeg, setNewIsVeg] = useState(true);
  const [newChannel, setNewChannel] = useState('BOTH');
  const [adding, setAdding] = useState(false);

  // ── Specials list (items flagged isSpecial) ────────────────────────────────
  const specials = useMemo(() => {
    if (!Array.isArray(menuItems)) return [];
    return menuItems
      .filter(it => it && it.isSpecial && !it.isDeleted)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [menuItems]);

  // ── Available categories (existing only) ───────────────────────────────────
  const availableCategories = useMemo(() => {
    if (!Array.isArray(categories)) return [];
    return categories
      .map(c => (typeof c === 'string' ? c : (c?.name || c?.id || '')))
      .filter(name => name && name !== 'All');
  }, [categories]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const flashSuccess = useCallback((msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  }, []);

  const runUpdate = useCallback(async (id, payload, label) => {
    if (savingId) return; // double-click guard
    setError('');
    setSavingId(id);
    try {
      await updateMenuItem(id, payload);
      await refreshMenu?.().catch(() => {});
      flashSuccess(`${label} updated.`);
    } catch (err) {
      setError(err?.message || `Failed to update ${label}.`);
    } finally {
      setSavingId(null);
    }
  }, [savingId, updateMenuItem, refreshMenu, flashSuccess]);

  // ── Per-special actions ────────────────────────────────────────────────────
  const toggleActive = (item) =>
    runUpdate(item.id, { specialActive: !item.specialActive }, item.name);

  const changeChannel = (item, channel) =>
    runUpdate(item.id, { specialChannel: channel }, item.name);

  const changeExpiry = (item, value) => {
    // value is the datetime-local string; empty string clears the expiry.
    const payload = { specialExpiresAt: value ? new Date(value).toISOString() : null };
    runUpdate(item.id, payload, item.name);
  };

  const removeSpecial = (item) => {
    if (!confirm(`Remove "${item.name}" from Today's Specials? The item itself will remain in the menu.`)) return;
    runUpdate(item.id, { isSpecial: false, specialActive: false, specialExpiresAt: null }, item.name);
  };

  // ── Add new special ────────────────────────────────────────────────────────
  const handleAddSpecial = async (e) => {
    e?.preventDefault();
    if (adding) return;
    setError('');

    const trimmedName = newName.trim();
    if (!trimmedName) { setError('Item name is required'); return; }
    const numPrice = Number(newPrice);
    if (!isFinite(numPrice) || numPrice <= 0) { setError('Price must be a positive number'); return; }
    if (!newCategory) { setError('Please select a category'); return; }

    const item = {
      name: trimmedName,
      category: newCategory,
      price: numPrice,
      isVeg: newIsVeg,
      menuType: 'FOOD',
      specialChannel: newChannel,
    };

    setAdding(true);
    try {
      await bulkImportSpecials([item], false);
      await refreshMenu?.().catch(() => {});
      flashSuccess(`Added "${trimmedName}" as a Today Special.`);
      // Reset modal state
      setNewName('');
      setNewCategory('');
      setNewPrice('');
      setNewIsVeg(true);
      setNewChannel('BOTH');
      setShowAddModal(false);
    } catch (err) {
      setError(err?.message || 'Failed to add special. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  // ── Format expiry for datetime-local input ─────────────────────────────────
  const formatExpiryForInput = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    // datetime-local expects YYYY-MM-DDTHH:mm in local time
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame size={22} className="text-[#E53935]" />
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider">Today's Specials</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#E53935] text-white rounded-xl text-sm font-black hover:bg-red-700 transition uppercase tracking-wider"
          >
            <Plus size={16} />
            Add Special
          </button>
        </div>

        {/* Success banner */}
        {success && (
          <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Check size={18} className="text-green-600" />
            <p className="text-sm font-bold text-green-700">{success}</p>
            <button onClick={() => setSuccess('')} className="ml-auto text-green-600 hover:text-green-800">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle size={18} className="text-red-600" />
            <p className="text-sm font-bold text-red-700">{error}</p>
            <button onClick={() => setError('')} className="ml-auto text-red-600 hover:text-red-800">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Specials list */}
        {specials.length === 0 ? (
          <div className="py-12 text-center">
            <Flame size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-bold text-gray-400">No Today's Specials yet. Click "Add Special" to create one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {specials.map(item => (
              <div key={item.id} className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-gray-900 truncate">{item.name}</h3>
                      <span className="text-xs font-bold text-gray-500">₹{item.basePrice ?? item.price}</span>
                      {item.category && (
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{item.category}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${item.specialActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'}`}>
                        {item.specialActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase">
                        Channel: {item.specialChannel || 'BOTH'}
                      </span>
                      {item.specialExpiresAt && (
                        <span className="text-[10px] font-bold text-amber-600">
                          Expires: {new Date(item.specialExpiresAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSpecial(item)}
                    disabled={savingId === item.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg text-[11px] font-black hover:bg-red-50 transition uppercase tracking-wider disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                  {/* Active toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-gray-500">Active</label>
                    <button
                      type="button"
                      onClick={() => toggleActive(item)}
                      disabled={savingId === item.id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${item.specialActive ? 'bg-green-600' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${item.specialActive ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Channel selector */}
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">Channel</label>
                    <select
                      value={item.specialChannel || 'BOTH'}
                      onChange={(e) => changeChannel(item, e.target.value)}
                      disabled={savingId === item.id}
                      className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-[#1E3A8A]"
                    >
                      {CHANNELS.map(ch => (
                        <option key={ch} value={ch}>{ch}</option>
                      ))}
                    </select>
                  </div>

                  {/* Expiry picker */}
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">Expiry</label>
                    <input
                      type="datetime-local"
                      value={formatExpiryForInput(item.specialExpiresAt)}
                      onChange={(e) => changeExpiry(item, e.target.value)}
                      disabled={savingId === item.id}
                      className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-[#1E3A8A]"
                    />
                  </div>
                </div>

                {savingId === item.id && (
                  <div className="flex items-center gap-2 mt-2 text-xs font-bold text-gray-400">
                    <Loader2 size={12} className="animate-spin" />
                    Saving...
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Special modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !adding && setShowAddModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base uppercase tracking-wider">Add Today Special</h3>
              <button onClick={() => !adding && setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={16} className="text-red-600" />
                <p className="text-xs font-bold text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddSpecial} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block">Item Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Chef's Special Paneer"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#1E3A8A]"
                  disabled={adding}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block">Category * (existing only)</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#1E3A8A]"
                  disabled={adding}
                >
                  <option value="">Select a category...</option>
                  {availableCategories.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block">Price (₹) *</label>
                <input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="e.g. 299"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#1E3A8A]"
                  disabled={adding}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block">Type</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setNewIsVeg(true)}
                      disabled={adding}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase ${newIsVeg ? 'bg-green-50 text-green-700 border-2 border-green-500' : 'bg-gray-50 text-gray-600 border-2 border-gray-200'}`}
                    >
                      Veg
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewIsVeg(false)}
                      disabled={adding}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase ${!newIsVeg ? 'bg-red-50 text-red-700 border-2 border-red-500' : 'bg-gray-50 text-gray-600 border-2 border-gray-200'}`}
                    >
                      Non-Veg
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block">Channel</label>
                  <select
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value)}
                    disabled={adding}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-[#1E3A8A]"
                  >
                    {CHANNELS.map(ch => (
                      <option key={ch} value={ch}>{ch}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={adding}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-black text-gray-600 hover:bg-gray-50 transition uppercase tracking-wider disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding || !newName.trim() || !newPrice || !newCategory}
                  className="flex-1 py-2.5 bg-[#E53935] text-white rounded-xl text-sm font-black hover:bg-red-700 disabled:opacity-50 transition uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  {adding ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Add Special
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
