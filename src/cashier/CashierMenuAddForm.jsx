// ─────────────────────────────────────────────────────────────────────────────
// CashierMenuAddForm — Add + Edit menu items for cashiers
// ─────────────────────────────────────────────────────────────────────────────
// Permission-gated form that allows cashiers to add new menu items using
// existing categories only, and (when `editMode` is enabled) edit existing
// items: name, price, isVeg, isAvailable, unit, printerTarget, printerName,
// gstEnabled, menuType. No image upload, no delete, no category change, no
// specials management (handled by CashierSpecialsManager).
//
// Uses the shared local-first createMenuItem / updateMenuItem services
// (adminApi.js) which write to the edge server first (offline-capable) and
// fall back to cloud only for valid cloud-authenticated sessions.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useCallback } from 'react';
import { Plus, Check, AlertCircle, Loader2, X, Search, Pencil } from 'lucide-react';

export default function CashierMenuAddForm({ categories, activeOutlet, refreshMenu, createMenuItem, updateMenuItem, editMode = false, menuItems = [] }) {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [menuType, setMenuType] = useState('FOOD');
  const [unit, setUnit] = useState('');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [printerTarget, setPrinterTarget] = useState('');
  const [printerName, setPrinterName] = useState('');
  // Edit-mode-only state
  const [isAvailable, setIsAvailable] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Submission state ───────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ── Outlet type determines available menu types ────────────────────────────
  const canAddLiquor = activeOutlet === 'bar' || activeOutlet === 'both';
  const canAddFood = activeOutlet === 'restaurant' || activeOutlet === 'both';

  // ── Available categories (existing only — cashier cannot create) ──────────
  // `categories` from useMenu() is an array of category name strings, with
  // "All" as the first entry. Normalize to strings and drop the placeholder.
  const availableCategories = useMemo(() => {
    if (!Array.isArray(categories)) return [];
    return categories
      .map(c => (typeof c === 'string' ? c : (c?.name || c?.id || '')))
      .filter(name => name && name !== 'All');
  }, [categories]);

  // ── Validate category still exists on submit ───────────────────────────────
  const validateCategory = useCallback(() => {
    if (!category) return 'Please select a category';
    const exists = availableCategories.some(name => name === category);
    if (!exists) return 'Selected category no longer exists. Please choose a valid category.';
    return null;
  }, [category, availableCategories]);

  // ── Edit-mode: searchable list of existing menu items ─────────────────────
  const editableItems = useMemo(() => {
    if (!editMode || !Array.isArray(menuItems)) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = menuItems
      .filter(it => it && !it.isDeleted)
      .filter(it => !q || (it.name || '').toLowerCase().includes(q));
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [editMode, menuItems, searchQuery]);

  // Load an existing item into the form for editing.
  const loadItemForEdit = useCallback((item) => {
    setEditingId(item.id);
    setName(item.name || '');
    setCategory(item.category || item.categoryName || '');
    setPrice(String(item.basePrice ?? item.price ?? ''));
    setIsVeg(item.isVeg !== false);
    setMenuType(item.menuType || 'FOOD');
    setUnit(item.unit || '');
    setGstEnabled(item.gstEnabled !== false);
    setPrinterTarget(item.printerTarget || '');
    setPrinterName(item.printerName || '');
    setIsAvailable(item.isAvailable !== false);
    setError('');
    setSuccess(false);
  }, []);

  // ── Handle submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e?.preventDefault();

    // Prevent double-submit: ignore clicks while a request is in flight.
    if (saving) return;

    setError('');
    setSuccess(false);

    // ── Validation ───────────────────────────────────────────────────────────
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Item name is required'); return; }
    if (trimmedName.length > 200) { setError('Item name must be 200 characters or less'); return; }

    const numPrice = Number(price);
    if (!isFinite(numPrice) || numPrice <= 0) { setError('Price must be a positive number'); return; }

    // Category is required for new items; in edit mode the category is locked.
    if (!editMode) {
      const catError = validateCategory();
      if (catError) { setError(catError); return; }
    }

    if (!menuType || !['FOOD', 'LIQUOR', 'BAR'].includes(menuType)) {
      setError('Menu type is invalid');
      return;
    }
    if ((menuType === 'LIQUOR' || menuType === 'BAR') && !canAddLiquor) {
      setError('Liquor/bar items can only be added in bar-type outlets');
      return;
    }

    // ── Build payload ────────────────────────────────────────────────────────
    const vegOrBar = menuType === 'LIQUOR' || menuType === 'BAR';
    if (editMode && editingId) {
      // Edit mode: only whitelisted fields. No category, no image, no delete.
      const payload = {
        name: trimmedName,
        price: numPrice,
        basePrice: numPrice,
        isVeg: vegOrBar ? false : isVeg,
        menuType,
        unit: unit.trim() || undefined,
        gstEnabled: vegOrBar ? false : gstEnabled,
        printerTarget: printerTarget.trim() || undefined,
        printerName: printerName.trim() || undefined,
        isAvailable,
        // No imageUrl, category, syncToAllOutlets, categoryPrinterTarget, isDeleted.
      };

      setSaving(true);
      try {
        await updateMenuItem(editingId, payload);
        setSuccess(true);
        refreshMenu?.().catch(() => {});
        // Clear edit selection so the user can pick another item.
        setEditingId(null);
        setName('');
        setPrice('');
        setUnit('');
        setPrinterTarget('');
        setPrinterName('');
        setSearchQuery('');
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err?.message || 'Failed to update menu item. Please try again.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Add mode (default)
    const payload = {
      name: trimmedName,
      category,
      price: numPrice,
      basePrice: numPrice,
      isVeg: vegOrBar ? false : isVeg,
      menuType,
      unit: unit.trim() || undefined,
      gstEnabled: vegOrBar ? false : gstEnabled,
      printerTarget: printerTarget.trim() || undefined,
      printerName: printerName.trim() || undefined,
      // No imageUrl — cashiers cannot upload images.
      // No isSpecial/specialChannel/specialActive/specialExpiresAt — cashiers cannot manage specials.
      // No syncToAllOutlets/targetOutletId — cashiers can only create in the active outlet.
      // No categoryPrinterTarget — cashiers cannot modify category printer targets.
    };

    setSaving(true);
    try {
      await createMenuItem(payload);
      setSuccess(true);
      // Refresh the POS menu so the new item is immediately available for billing.
      refreshMenu?.().catch(() => {});
      // Reset form for the next item.
      setName('');
      setPrice('');
      setUnit('');
      setPrinterTarget('');
      setPrinterName('');
      setCategory('');
      // Auto-clear success message after 3 seconds.
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err?.message || 'Failed to create menu item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset form ─────────────────────────────────────────────────────────────
  const handleReset = () => {
    setName('');
    setCategory('');
    setPrice('');
    setIsVeg(true);
    setMenuType(canAddFood ? 'FOOD' : 'LIQUOR');
    setUnit('');
    setGstEnabled(true);
    setPrinterTarget('');
    setPrinterName('');
    setIsAvailable(true);
    setEditingId(null);
    setSearchQuery('');
    setError('');
    setSuccess(false);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Edit-mode: searchable list of existing items */}
      {editMode && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-3">Select an item to edit</h3>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items by name..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm font-bold outline-none focus:border-[#1E3A8A]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {editableItems.length === 0 ? (
              <p className="text-xs text-gray-400 font-bold py-4 text-center">
                {searchQuery ? 'No items match your search.' : 'No items available.'}
              </p>
            ) : (
              editableItems.slice(0, 100).map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => loadItemForEdit(item)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition ${editingId === item.id
                    ? 'bg-[#1E3A8A] text-white'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
                >
                  <span className="text-sm font-bold truncate">{item.name}</span>
                  <span className={`text-xs font-bold ${editingId === item.id ? 'text-white/80' : 'text-gray-400'}`}>
                    ₹{item.basePrice ?? item.price}
                    {item.isAvailable === false && ' · Unavailable'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider">
            {editMode ? (editingId ? 'Edit Menu Item' : 'Edit Menu Item') : 'Add Menu Item'}
          </h2>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider"
          >
            Reset
          </button>
        </div>

        {/* Edit-mode hint when no item is selected */}
        {editMode && !editingId && (
          <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <Pencil size={16} className="text-blue-600" />
            <p className="text-sm font-bold text-blue-700">Select an item from the list above to edit its details.</p>
          </div>
        )}

        {/* Success banner */}
        {success && (
          <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Check size={18} className="text-green-600" />
            <p className="text-sm font-bold text-green-700">
              {editMode ? 'Item updated successfully.' : 'Item added successfully and is now available for billing.'}
            </p>
            <button onClick={() => setSuccess(false)} className="ml-auto text-green-600 hover:text-green-800">
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Item name */}
          <div>
            <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Item Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Paneer Butter Masala"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#1E3A8A]"
              disabled={saving || (editMode && !editingId)}
            />
          </div>

          {/* Category — existing only (locked in edit mode; cashiers cannot move items) */}
          <div>
            <label className="text-xs font-black uppercase text-gray-500 mb-1 block">
              Category * {editMode && '(locked — cannot change)'}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#1E3A8A]"
              disabled={saving || editMode}
            >
              <option value="">Select a category...</option>
              {availableCategories.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {!editMode && (
              <p className="text-[10px] text-gray-400 mt-1 font-bold">You can only use existing categories. Ask a manager to create new ones.</p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Price (₹) *</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="0"
              step="0.01"
              placeholder="e.g. 250"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#1E3A8A]"
              disabled={saving || (editMode && !editingId)}
            />
          </div>

          {/* Menu type — food/liquor based on outlet */}
          <div>
            <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Menu Type *</label>
            <div className="flex gap-2">
              {canAddFood && (
                <button
                  type="button"
                  onClick={() => setMenuType('FOOD')}
                  disabled={saving || (editMode && !editingId)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition ${menuType === 'FOOD'
                    ? 'bg-[#1E3A8A] text-white border-2 border-[#1E3A8A]'
                    : 'bg-gray-50 text-gray-600 border-2 border-gray-200 hover:border-gray-300'}`}
                >
                  Food
                </button>
              )}
              {canAddLiquor && (
                <button
                  type="button"
                  onClick={() => setMenuType('LIQUOR')}
                  disabled={saving || (editMode && !editingId)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition ${menuType === 'LIQUOR'
                    ? 'bg-[#1E3A8A] text-white border-2 border-[#1E3A8A]'
                    : 'bg-gray-50 text-gray-600 border-2 border-gray-200 hover:border-gray-300'}`}
                >
                  Liquor/Bar
                </button>
              )}
            </div>
          </div>

          {/* Veg/Non-veg — hidden for liquor */}
          {menuType !== 'LIQUOR' && menuType !== 'BAR' && (
            <div>
              <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsVeg(true)}
                  disabled={saving || (editMode && !editingId)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition flex items-center justify-center gap-2 ${isVeg
                    ? 'bg-green-50 text-green-700 border-2 border-green-500'
                    : 'bg-gray-50 text-gray-600 border-2 border-gray-200 hover:border-gray-300'}`}
                >
                  <span className="w-4 h-4 border-2 border-green-600 rounded-sm flex items-center justify-center">
                    {isVeg && <span className="w-2 h-2 bg-green-600 rounded-full" />}
                  </span>
                  Veg
                </button>
                <button
                  type="button"
                  onClick={() => setIsVeg(false)}
                  disabled={saving || (editMode && !editingId)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition flex items-center justify-center gap-2 ${!isVeg
                    ? 'bg-red-50 text-red-700 border-2 border-red-500'
                    : 'bg-gray-50 text-gray-600 border-2 border-gray-200 hover:border-gray-300'}`}
                >
                  <span className="w-4 h-4 border-2 border-red-600 rounded-sm flex items-center justify-center">
                    {!isVeg && <span className="w-2 h-2 bg-red-600 rounded-full" />}
                  </span>
                  Non-Veg
                </button>
              </div>
            </div>
          )}

          {/* Unit */}
          <div>
            <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Unit (optional, max 20 chars)</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value.slice(0, 20))}
              maxLength={20}
              placeholder="e.g. 500ml, 1L, 2pcs"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#1E3A8A]"
              disabled={saving || (editMode && !editingId)}
            />
          </div>

          {/* GST — hidden for liquor/bar */}
          {menuType !== 'LIQUOR' && menuType !== 'BAR' && (
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-gray-500">GST Enabled</label>
              <button
                type="button"
                onClick={() => setGstEnabled(!gstEnabled)}
                disabled={saving || (editMode && !editingId)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${gstEnabled ? 'bg-[#1E3A8A]' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${gstEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          )}

          {/* Printer target/name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Printer Target (optional)</label>
              <input
                type="text"
                value={printerTarget}
                onChange={(e) => setPrinterTarget(e.target.value)}
                placeholder="e.g. kitchen1"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#1E3A8A]"
                disabled={saving || (editMode && !editingId)}
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-gray-500 mb-1 block">Printer Name (optional)</label>
              <input
                type="text"
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                placeholder="e.g. Kitchen Printer"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold outline-none focus:border-[#1E3A8A]"
                disabled={saving || (editMode && !editingId)}
              />
            </div>
          </div>

          {/* Availability toggle — edit mode only (new items default to available) */}
          {editMode && (
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-gray-500">Available for billing</label>
              <button
                type="button"
                onClick={() => setIsAvailable(!isAvailable)}
                disabled={saving || !editingId}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${isAvailable ? 'bg-green-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${isAvailable ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          )}

          {/* Submit button — disabled while in-flight to prevent duplicates */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-black text-gray-600 hover:bg-gray-50 transition uppercase tracking-wider disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !price || (editMode ? !editingId : !category)}
              className="flex-1 py-3 bg-[#E53935] text-white rounded-xl text-sm font-black hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition uppercase tracking-wider flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : editMode ? (
                <>
                  <Pencil size={16} />
                  Update Item
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Add Item
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Read-only existing items reference (add mode only) */}
      {!editMode && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-2">Existing Categories</h3>
          {availableCategories.length === 0 ? (
            <p className="text-xs text-gray-400 font-bold">No categories available. Ask a manager to create categories first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableCategories.map(name => (
                <span key={name} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-bold text-gray-700">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
