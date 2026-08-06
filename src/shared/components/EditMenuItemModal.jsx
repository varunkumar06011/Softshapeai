// ─────────────────────────────────────────────────────────────────────────────
// EditMenuItemModal — Shared menu item edit modal (admin + cashier)
// ─────────────────────────────────────────────────────────────────────────────
// Self-contained modal for editing a menu item's full set of fields:
//   name, category, dietary type, price, venue prices, GST, printer target,
//   physical printer override, menu type (FOOD/LIQUOR), availability, specials.
//
// Used by:
//   - Admin MenuPage (with showRecipe=true + recipe props)
//   - Cashier Edit Menu tab (showRecipe=false)
//
// Props:
//   item            — POS-shape item { id, n, p, c, t, img, menuType, gstEnabled,
//                     printerTarget, printerName, venuePrices, isAvailable,
//                     isSpecial, specialChannel, specialActive, specialExpiresAt }
//   categories      — [{ id, name }]
//   venues          — [{ id, label }] (active venue first)
//   activeVenueId   — string
//   printerOptions  — [{ name, type, source }]
//   showBarType     — bool: show FOOD/LIQUOR toggle (bar outlets)
//   onClose         — () => void
//   onSave          — async (updatedFields) => { success, error?, id? }
//   showRecipe      — bool (default false)
//   recipeRows / kitchenIngredients / recipe callbacks (optional, admin only)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { X, ChevronDown, Camera, Trash2 } from 'lucide-react';

const inputClass = "px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 outline-none transition-all focus:border-[#E53935] focus:ring-2 focus:ring-[#E53935]/10";

export default function EditMenuItemModal({
  item,
  categories = [],
  venues = [],
  activeVenueId,
  printerOptions = [],
  showBarType = false,
  onClose,
  onSave,
  showRecipe = false,
  recipeRows = [],
  kitchenIngredients = [],
  onRecipeRowsChange,
  onImageUpload,
}) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!item) return;
    setForm({
      ...item,
      basePrice: item.p ?? item.basePrice ?? 0,
      venuePrice: item.venuePrices?.[activeVenueId] ?? item.p ?? 0,
      categoryPrinterTarget: item.categoryPrinterTarget,
    });
  }, [item, activeVenueId]);

  if (!form) return null;

  const update = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.n) return;
    setSaving(true);
    setError(null);
    try {
      const isLiquor = form.menuType === 'LIQUOR' || form.menuType === 'BAR';
      const payload = {
        id: form.id,
        name: form.n,
        category: form.c,
        isVeg: form.t === 'veg',
        price: Number(form.basePrice ?? form.venuePrice ?? 0),
        menuType: form.menuType || 'FOOD',
        imageUrl: form.img,
        printerTarget: form.printerTarget || null,
        printerName: form.printerName || null,
        gstEnabled: isLiquor ? false : form.gstEnabled !== false,
        isAvailable: form.isAvailable !== false,
        isSpecial: form.isSpecial || false,
        specialChannel: form.specialChannel || 'BOTH',
        specialActive: form.specialActive !== false,
        venuePrices: {
          ...(form.venuePrices || {}),
          // Only include the active venue's price when the field has a value.
          // An empty field means "clear/remove this venue override" — sending 0
          // would set the price to ₹0 instead. The edge upsert helper skips
          // empty/null/undefined entries, so omitting the key is the correct way
          // to signal "no override for this venue".
          ...(activeVenueId && form.venuePrice !== '' && form.venuePrice !== null && form.venuePrice !== undefined
            ? { [activeVenueId]: Number(form.venuePrice) }
            : {}),
        },
      };
      const result = await onSave(payload);
      if (result && !result.success) {
        setError(result.error || 'Failed to save');
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const activeVenue = venues.find(v => v.id === activeVenueId) || venues[0] || { label: 'Base' };
  const isLiquor = form.menuType === 'LIQUOR' || form.menuType === 'BAR';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <h3 className="font-black text-lg text-gray-900 tracking-tight">Edit Item</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Section 1: Basic Info */}
          <details open className="group">
            <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">
              <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
              Basic Info
            </summary>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Item Image</label>
                <div className="flex items-center gap-4">
                  {form.img ? (
                    <img src={form.img} alt={form.n} className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center"><Camera size={20} className="text-gray-400" /></div>
                  )}
                  {onImageUpload ? (
                    <input type="file" accept="image/*" onChange={onImageUpload} className="text-xs text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-600 hover:file:bg-red-100" />
                  ) : (
                    <p className="text-[10px] text-gray-400">Image upload unavailable offline</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Item Name</label>
                <input value={form.n} onChange={e => update({ n: e.target.value })} className={inputClass + " w-full bg-gray-50"} />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Category</label>
                <select
                  value={form.c}
                  onChange={e => update({ c: e.target.value })}
                  className={inputClass + " w-full bg-gray-50"}
                >
                  <option value="">Select a category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <p style={{ color: 'orange', fontSize: '0.75rem', marginTop: '4px' }}>No categories found.</p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Dietary Type</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                    <input type="radio" name="diet" value="veg" checked={form.t === 'veg'} onChange={() => update({ t: 'veg' })} className="accent-green-600" />
                    <span className="text-green-700">Vegetarian</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                    <input type="radio" name="diet" value="non" checked={form.t === 'non'} onChange={() => update({ t: 'non' })} className="accent-red-600" />
                    <span className="text-red-700">Non-Veg</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isAvailable !== false}
                    onChange={e => update({ isAvailable: e.target.checked })}
                    className="accent-[#E53935] w-4 h-4"
                  />
                  <span className="text-gray-700">Available for ordering</span>
                </label>
              </div>
            </div>
          </details>

          {/* Section 2: Pricing */}
          <details open className="group">
            <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">
              <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
              Pricing
            </summary>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{activeVenue.label || 'Base'} Price (₹)</label>
                <input type="number" value={form.venuePrice} onChange={e => update({ venuePrice: e.target.value, basePrice: e.target.value })} className={inputClass + " w-full bg-gray-50"} />
              </div>

              {venues.length > 1 && (
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Venue Prices</label>
                  <div className="grid grid-cols-2 gap-3">
                    {venues.map((venue) => (
                      <div key={venue.id}>
                        <label className="block text-[9px] font-black uppercase text-gray-400 mb-1">{venue.label}</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={venue.id === activeVenueId ? form.venuePrice : (form.venuePrices?.[venue.id] ?? '')}
                          onChange={(e) => update({
                            venuePrice: venue.id === activeVenueId ? e.target.value : form.venuePrice,
                            basePrice: venue.id === activeVenueId ? e.target.value : form.basePrice,
                            venuePrices: { ...(form.venuePrices || {}), [venue.id]: e.target.value },
                          })}
                          className={inputClass + " w-full bg-gray-50"}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <label className={`flex items-center gap-2 text-sm font-bold ${isLiquor ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={isLiquor ? false : form.gstEnabled !== false}
                    disabled={isLiquor}
                    onChange={e => update({ gstEnabled: e.target.checked })}
                    className="accent-[#E53935] w-4 h-4"
                  />
                  <span className="text-gray-700">GST Applicable</span>
                </label>
                <span className="text-[10px] text-gray-400 font-medium">
                  {isLiquor ? 'Bar / liquor items never have GST' : 'If off, no GST is charged on this item in bills'}
                </span>
              </div>
            </div>
          </details>

          {/* Section 3: Printer Settings */}
          <details className="group border-t border-gray-100 pt-3">
            <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">
              <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
              Printer Settings
            </summary>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Print To</label>
                <select
                  value={form.printerTarget || form.categoryPrinterTarget || ''}
                  onChange={(e) => update({
                    printerTarget: e.target.value || null,
                    categoryPrinterTarget: e.target.value || null,
                  })}
                  className={inputClass + ' w-full bg-gray-50'}
                >
                  <option value="">Default (auto-resolve)</option>
                  {printerOptions.map(opt => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name}
                      {opt.source === 'agent-live' ? ' (Live)' : opt.type ? ` (${opt.type})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {showBarType && (
                <div className="flex gap-2 mt-2">
                  {[
                    { value: 'FOOD', label: 'Food' },
                    { value: 'LIQUOR', label: 'Bar / Drinks' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({
                        menuType: opt.value,
                        ...(opt.value === 'LIQUOR' || opt.value === 'BAR' ? { gstEnabled: false } : {}),
                      })}
                      className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all text-left ${
                        (form.menuType || 'FOOD') === opt.value
                          ? opt.value === 'FOOD'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <div>{opt.label}</div>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Physical Printer Override (optional)</label>
                <select
                  value={form.printerName || ''}
                  onChange={(e) => update({ printerName: e.target.value || null })}
                  className={inputClass + ' w-full bg-gray-50'}
                >
                  <option value="">Auto-resolve from Print To</option>
                  {printerOptions.map(opt => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name}
                      {opt.source === 'agent-live' ? ' (Live)' : opt.type ? ` (${opt.type})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Only change if the Windows printer name differs from the logical destination above.</p>
              </div>
            </div>
          </details>

          {/* Section 4: Recipe (admin only) */}
          {showRecipe && form.menuType !== 'LIQUOR' && onRecipeRowsChange && (
            <details className="group border-t border-gray-100 pt-3">
              <summary className="text-xs font-black uppercase text-gray-500 cursor-pointer mb-3 flex items-center gap-2 list-none">
                <ChevronDown size={14} className="text-gray-400 group-open:rotate-180 transition-transform" />
                Recipe (Kitchen Ingredients)
              </summary>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => onRecipeRowsChange([...recipeRows, { ingredientId: '', quantity: '', name: '', unit: '' }])}
                  className="text-xs font-bold text-[#E53935] hover:text-[#B71C1C]"
                >+ Add Ingredient</button>
                {recipeRows.length === 0 ? (
                  <p className="text-xs text-gray-400">No recipe set. Add ingredients to enable automatic kitchen inventory deduction on settle.</p>
                ) : (
                  <div className="space-y-2">
                    {recipeRows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={row.ingredientId}
                          onChange={(e) => {
                            const ing = kitchenIngredients.find(i => i.id === e.target.value);
                            onRecipeRowsChange(recipeRows.map((r, i) => i === idx ? { ...r, ingredientId: e.target.value, name: ing?.name, unit: ing?.unit } : r));
                          }}
                          className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50"
                        >
                          <option value="">Select ingredient</option>
                          {kitchenIngredients.map(ing => (
                            <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.001"
                          placeholder="Qty"
                          value={row.quantity}
                          onChange={(e) => onRecipeRowsChange(recipeRows.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                          className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 text-right"
                        />
                        <span className="text-xs text-gray-400 w-8">{row.unit || ''}</span>
                        <button
                          type="button"
                          onClick={() => onRecipeRowsChange(recipeRows.filter((_, i) => i !== idx))}
                          className="p-1 text-red-500 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/50 shrink-0">
          {error && <span className="text-xs text-red-600 self-center mr-auto">{error}</span>}
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.n || saving}
            className="px-6 py-2 text-sm font-black text-white bg-[#E53935] hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-md"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
