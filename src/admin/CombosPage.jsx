// ─────────────────────────────────────────────────────────────────────────────
// CombosPage — Admin UI for creating and managing combo menu items
// ─────────────────────────────────────────────────────────────────────────────
// A combo is a MenuItem with isCombo=true. It is billed as a single line at
// its own manually-entered price, but for KOT printing and inventory deduction
// it is exploded into its components (each component routed to its own
// printer/recipe). Components never participate in billing.
//
// Data flows through /api/menu/combos (cloud) — combos are config, not
// operational state, so they are always read from the cloud backend.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Pencil, PackageOpen, AlertTriangle } from 'lucide-react';
import { fetchCombos, createCombo, updateCombo, deleteCombo } from '../services/menuService';
import { getAuthHeaders, API_BASE } from '../services/apiConfig';
import { getCurrentRestaurantId } from '../utils/getCurrentRestaurantId';

const DEFAULT_IMG = '/placeholder.svg';

/** Fetch all menu items (admin endpoint) for the component picker. */
async function fetchAllMenuItems() {
  const rid = getCurrentRestaurantId();
  const url = `${API_BASE}/api/menu/items/admin?restaurantId=${encodeURIComponent(rid)}`;
  const res = await fetch(url, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error('Failed to load menu items');
  const data = await res.json();
  // Exclude items that are themselves combos — a combo cannot contain a combo.
  return data
    .filter((i) => !i.isCombo)
    .map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      isVeg: i.isVeg,
      menuType: i.menuType,
      price: Math.round(i.price ?? 0),
      isAvailable: i.isAvailable !== false,
    }));
}

export default function CombosPage({ open, onClose, onRefresh, mode = 'modal' }) {
  const [combos, setCombos] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | combo object
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    if (!open && mode !== 'page') return;
    setLoading(true);
    setError(null);
    try {
      const [comboList, items] = await Promise.all([fetchCombos(), fetchAllMenuItems()]);
      setCombos(Array.isArray(comboList) ? comboList : []);
      setMenuItems(items);
    } catch (err) {
      setError(err.message || 'Failed to load combos');
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (open || mode === 'page') load();
  }, [open, load, mode]);

  const menuItemById = useMemo(() => {
    const m = new Map();
    for (const i of menuItems) m.set(i.id, i);
    return m;
  }, [menuItems]);

  if (!open && mode === 'modal') return null;

  const handleClose = () => {
    setEditing(null);
    setFormError(null);
    onClose?.();
  };

  const handleSaved = () => {
    load();
    onRefresh?.();
  };

  // Full-page mode: render as an embedded section (no overlay/modal wrapper)
  if (mode === 'page') {
    return (
      <CombosContent
        combos={combos}
        menuItems={menuItems}
        menuItemById={menuItemById}
        loading={loading}
        error={error}
        editing={editing}
        setEditing={setEditing}
        setFormError={setFormError}
        formError={formError}
        saving={saving}
        setSaving={setSaving}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        handleSaved={handleSaved}
        setError={setError}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <PackageOpen size={20} className="text-[#E53935]" />
            <h2 className="text-lg font-black text-gray-900">Combos</h2>
            <span className="text-xs font-bold text-gray-400">({combos.length})</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <CombosContent
            combos={combos}
            menuItems={menuItems}
            menuItemById={menuItemById}
            loading={loading}
            error={error}
            editing={editing}
            setEditing={setEditing}
            setFormError={setFormError}
            formError={formError}
            saving={saving}
            setSaving={setSaving}
            deleteTarget={deleteTarget}
            setDeleteTarget={setDeleteTarget}
            handleSaved={handleSaved}
            setError={setError}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Shared body content (used by both modal and full-page modes) ────────────

function CombosContent({
  combos, menuItems, menuItemById, loading, error,
  editing, setEditing, formError, setFormError,
  saving, setSaving, deleteTarget, setDeleteTarget,
  handleSaved, setError,
}) {
  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm font-bold">
          Loading combos…
        </div>
      ) : editing ? (
        <ComboEditor
          combo={editing === 'new' ? null : editing}
          menuItems={menuItems}
          menuItemById={menuItemById}
          onCancel={() => { setEditing(null); setFormError(null); }}
          onSaved={(msg) => {
            if (msg) setFormError(msg);
            else { setEditing(null); setFormError(null); handleSaved(); }
          }}
          saving={saving}
          setSaving={setSaving}
        />
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => { setEditing('new'); setFormError(null); }}
              className="rounded-lg bg-[#E53935] px-4 py-2 text-sm font-black text-white shadow-md hover:bg-red-700 active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus size={16} /> New Combo
            </button>
          </div>

          {combos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <PackageOpen size={40} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-bold">No combos yet</p>
              <p className="text-xs mt-1">Click "New Combo" to create your first combo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {combos.map((combo) => {
                const unavailableComps = (combo.components || []).filter((c) => !c.available);
                return (
                  <div key={combo.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={combo.imageUrl || DEFAULT_IMG}
                          alt={combo.name}
                          className="h-12 w-12 rounded-lg object-cover bg-gray-100 flex-shrink-0"
                          onError={(e) => { e.target.src = DEFAULT_IMG; }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-gray-900 truncate">{combo.name}</h3>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${combo.isVeg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {combo.isVeg ? 'VEG' : 'NON'}
                            </span>
                            {!combo.isAvailable && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">UNAVAILABLE</span>
                            )}
                          </div>
                          <p className="text-sm font-black text-[#E53935]">₹{Math.round(combo.price ?? 0)}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditing(combo); setFormError(null); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          title="Edit combo"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(combo)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Delete combo"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1.5">
                        Components ({(combo.components || []).length})
                      </p>
                      <ul className="space-y-1">
                        {(combo.components || []).map((c) => (
                          <li key={c.id || c.menuItemId} className="flex items-center justify-between text-xs">
                            <span className={`flex items-center gap-1.5 ${!c.available ? 'text-red-600 line-through' : 'text-gray-700'}`}>
                              <span className={`inline-block h-2 w-2 rounded-full ${c.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                              {c.name}
                              {!c.available && <AlertTriangle size={11} className="text-red-500" />}
                            </span>
                            <span className="font-bold text-gray-500">×{c.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      {unavailableComps.length > 0 && (
                        <p className="mt-2 text-[10px] font-bold text-red-600 flex items-center gap-1">
                          <AlertTriangle size={11} /> {unavailableComps.length} component(s) unavailable — KOT/inventory will skip them.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {formError && editing && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> {formError}
        </div>
      )}

      {deleteTarget && (
        <DeleteComboConfirm
          combo={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              await deleteCombo(deleteTarget.id);
              setDeleteTarget(null);
              handleSaved();
            } catch (err) {
              setError(err.message || 'Failed to delete combo');
              setDeleteTarget(null);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Combo editor (create / edit) ────────────────────────────────────────────

function ComboEditor({ combo, menuItems, menuItemById, onCancel, onSaved, saving, setSaving }) {
  const isEdit = !!combo;
  const [name, setName] = useState(combo?.name || '');
  const [price, setPrice] = useState(combo?.price ?? '');
  const [isVeg, setIsVeg] = useState(combo?.isVeg !== false);
  const [isAvailable, setIsAvailable] = useState(combo?.isAvailable !== false);
  const [gstEnabled, setGstEnabled] = useState(combo?.gstEnabled !== false);
  const [components, setComponents] = useState(
    (combo?.components || []).map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity }))
  );
  const [pickerQuery, setPickerQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // Items not already picked + matching the picker query
  const availableItems = useMemo(() => {
    const picked = new Set(components.map((c) => c.menuItemId));
    return menuItems
      .filter((i) => !picked.has(i.id))
      .filter((i) => !pickerQuery || i.name.toLowerCase().includes(pickerQuery.toLowerCase()) || (i.category || '').toLowerCase().includes(pickerQuery.toLowerCase()));
  }, [menuItems, components, pickerQuery]);

  const addComponent = (item) => {
    setComponents((prev) => [...prev, { menuItemId: item.id, quantity: 1 }]);
    setPickerQuery('');
    setShowPicker(false);
  };

  const removeComponent = (menuItemId) => {
    setComponents((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
  };

  const setComponentQty = (menuItemId, qty) => {
    const q = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
    setComponents((prev) => prev.map((c) => (c.menuItemId === menuItemId ? { ...c, quantity: q } : c)));
  };

  const handleSave = async () => {
    if (!name.trim()) return onSaved('Name is required');
    if (price === '' || Number(price) < 0) return onSaved('Price is required');
    if (components.length === 0) return onSaved('At least one component is required');

    const payload = {
      name: name.trim(),
      price: Number(price),
      isVeg,
      isAvailable,
      gstEnabled,
      components: components.map((c) => ({ menuItemId: c.menuItemId, quantity: Number(c.quantity) || 1 })),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateCombo(combo.id, payload);
      } else {
        await createCombo(payload);
      }
      onSaved(null);
    } catch (err) {
      const msg = err?.message || 'Failed to save combo';
      onSaved(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black text-gray-900">
          {isEdit ? 'Edit Combo' : 'New Combo'}
        </h3>
        <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Basic fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Veg Thali Combo"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E53935]"
          />
        </div>
        <div>
          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Price (₹) *</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 199"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E53935]"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
          <input type="checkbox" checked={isVeg} onChange={(e) => setIsVeg(e.target.checked)} className="h-4 w-4 rounded text-[#E53935] focus:ring-[#E53935]" />
          Veg
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
          <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} className="h-4 w-4 rounded text-[#E53935] focus:ring-[#E53935]" />
          Available
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
          <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} className="h-4 w-4 rounded text-[#E53935] focus:ring-[#E53935]" />
          GST applicable
        </label>
      </div>

      {/* Components */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-black text-gray-500 uppercase">Components *</label>
          <button
            onClick={() => setShowPicker((s) => !s)}
            className="text-xs font-black text-[#E53935] hover:text-red-700 flex items-center gap-1"
          >
            <Plus size={14} /> Add component
          </button>
        </div>

        {showPicker && (
          <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <input
              autoFocus
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search menu items…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#E53935]"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {availableItems.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">No items match</p>
              ) : availableItems.slice(0, 50).map((item) => (
                <button
                  key={item.id}
                  onClick={() => addComponent(item)}
                  className="w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg hover:bg-white text-sm transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-bold text-gray-700">{item.name}</span>
                    <span className="text-xs text-gray-400">{item.category}</span>
                  </span>
                  <span className="text-xs font-bold text-gray-400">₹{item.price}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {components.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
            No components added yet. Click "Add component" to pick menu items.
          </p>
        ) : (
          <ul className="space-y-2">
            {components.map((c) => {
              const item = menuItemById.get(c.menuItemId);
              return (
                <li key={c.menuItemId} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm min-w-0">
                    <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${item?.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-bold text-gray-700 truncate">{item?.name || 'Unknown item'}</span>
                    {item?.category && <span className="text-xs text-gray-400">{item.category}</span>}
                    {item && !item.isAvailable && <span className="text-[10px] font-black text-red-600">UNAVAILABLE</span>}
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={c.quantity}
                      onChange={(e) => setComponentQty(c.menuItemId, e.target.value)}
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#E53935]"
                    />
                    <button
                      onClick={() => removeComponent(c.menuItemId)}
                      className="p-1 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-gray-400">
          Components are used for KOT ticket splitting and inventory deduction only — the combo is always billed as a single line at the price above.
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-bold text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 text-sm font-black text-white bg-[#E53935] hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-md transition-colors"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Combo'}
        </button>
      </div>
    </div>
  );
}

// ─── Delete confirmation ─────────────────────────────────────────────────────

function DeleteComboConfirm({ combo, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-full bg-red-100 p-2">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <h3 className="text-base font-black text-gray-900">Delete combo?</h3>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Are you sure you want to delete <span className="font-black">{combo.name}</span>? This will remove the combo from the menu. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-bold text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-black text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
