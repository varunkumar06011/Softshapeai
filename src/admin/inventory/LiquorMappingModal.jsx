// ─────────────────────────────────────────────────────────────────────────────
// LiquorMappingModal — map LIQUOR menu items to bar inventory bottles
// ─────────────────────────────────────────────────────────────────────────────
// Sets MenuItem.barInventoryItemId (which bottle a sale deducts FROM) and
// MenuItem.deductionMl (how many ml per unit) — the two fields the deduction
// engine uses. Many menu items can pour from one bottle (e.g. "RS 30ml" and
// "RS 60ml" both deduct from "RS 750ml"). Empty ml = auto (name parse → 30ml).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { X, Wine, Search, Check } from 'lucide-react';
import { fetchLiquorMappings, saveLiquorMapping } from '../../services/barInventoryApi';
import LottieLoader from '../../shared/components/LottieLoader';

const QUICK_ML = [30, 60, 90, 180, 375, 750];

function parseMlFromName(name) {
  if (!name) return null;
  const m = name.match(/(\d+)\s*ml\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function effectiveMl(item) {
  return item.deductionMl ?? parseMlFromName(item.name) ?? 30;
}

export function LiquorMappingModal({ open, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [bottles, setBottles] = useState([]);
  const [search, setSearch] = useState('');
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  // drafts[menuItemId] = { bottleId, ml } — only present for edited rows
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setDrafts({});
    setRowErrors({});
    setSearch('');
    setUnmappedOnly(false);
    fetchLiquorMappings()
      .then((d) => {
        setItems(d?.items || []);
        setBottles((d?.bottles || []).filter((b) => b.isActive !== false));
      })
      .catch((e) => setError(e.message || 'Failed to load mappings'))
      .finally(() => setLoading(false));
  }, [open]);

  const draftFor = (item) => drafts[item.id] || {
    bottleId: item.barInventoryItemId || '',
    ml: item.deductionMl != null ? String(item.deductionMl) : '',
  };

  const setDraft = (item, patch) => {
    setDrafts((prev) => ({ ...prev, [item.id]: { ...draftFor(item), ...patch } }));
    setRowErrors((prev) => ({ ...prev, [item.id]: null }));
  };

  const isDirty = (item) => {
    const d = drafts[item.id];
    if (!d) return false;
    return d.bottleId !== (item.barInventoryItemId || '')
      || d.ml !== (item.deductionMl != null ? String(item.deductionMl) : '');
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => {
        const stale = i.barInventoryItemId && !i.linkedBottle;
        if (unmappedOnly && i.barInventoryItemId && !stale) return false;
        if (q && !i.name.toLowerCase().includes(q) && !(i.categoryName || '').toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const aBad = !a.barInventoryItemId || !a.linkedBottle ? 0 : 1;
        const bBad = !b.barInventoryItemId || !b.linkedBottle ? 0 : 1;
        return aBad - bBad || a.name.localeCompare(b.name);
      });
  }, [items, search, unmappedOnly]);

  const unmappedCount = items.filter((i) => !i.barInventoryItemId || !i.linkedBottle).length;

  const handleSave = async (item) => {
    const d = draftFor(item);
    const mlNum = d.ml === '' ? null : Number(d.ml);
    if (mlNum !== null && (!Number.isFinite(mlNum) || mlNum <= 0)) {
      setRowErrors((prev) => ({ ...prev, [item.id]: 'ml must be a positive number' }));
      return;
    }
    setSavingId(item.id);
    try {
      const res = await saveLiquorMapping(item.id, {
        barInventoryItemId: d.bottleId || null,
        deductionMl: mlNum,
      });
      const saved = res?.menuItem;
      setItems((prev) => prev.map((i) => {
        if (i.id !== item.id) return i;
        const bottle = bottles.find((b) => b.id === (saved?.barInventoryItemId ?? d.bottleId)) || null;
        const next = {
          ...i,
          barInventoryItemId: saved?.barInventoryItemId ?? (d.bottleId || null),
          deductionMl: saved?.deductionMl ?? mlNum,
          linkedBottle: bottle,
        };
        next.effectiveDeductionMl = effectiveMl(next);
        return next;
      }));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      onSaved?.();
    } catch (e) {
      setRowErrors((prev) => ({ ...prev, [item.id]: e.message || 'Save failed' }));
    } finally {
      setSavingId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Wine size={18} className="text-amber-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Liquor Mapping</h2>
              <p className="text-xs text-gray-400">
                Which bottle each menu item deducts from, and how many ml per unit
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu items..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
            />
          </div>
          <button
            onClick={() => setUnmappedOnly(!unmappedOnly)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              unmappedOnly ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {unmappedOnly ? 'Showing unmapped' : `Unmapped (${unmappedCount})`}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-3">{error}</div>
          )}
          {loading ? (
            <LottieLoader size={80} className="py-12" />
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm font-bold">
              {items.length === 0 ? 'No liquor menu items found' : 'No items match the filter'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-3">Menu Item</th>
                  <th className="pb-2 pr-3">Deducts From</th>
                  <th className="pb-2 pr-3 w-28">ml / unit</th>
                  <th className="pb-2 pr-3 w-24">Status</th>
                  <th className="pb-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const d = draftFor(item);
                  const dirty = isDirty(item);
                  const stale = item.barInventoryItemId && !item.linkedBottle;
                  return (
                    <tr key={item.id} className="border-b border-gray-50 align-top">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-gray-800">{item.name}</div>
                        <div className="text-xs text-gray-400">
                          {item.categoryName || 'Liquor'} · ₹{item.basePrice}
                        </div>
                        {rowErrors[item.id] && (
                          <div className="text-xs text-red-600 mt-1">{rowErrors[item.id]}</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <select
                          value={d.bottleId}
                          onChange={(e) => setDraft(item, { bottleId: e.target.value })}
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                        >
                          <option value="">— Not mapped —</option>
                          {stale && (
                            <option value={item.barInventoryItemId}>
                              (inactive) {item.barInventoryItemId}
                            </option>
                          )}
                          {bottles.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} · {b.bottleSizeMl}ml
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          type="number"
                          min="1"
                          value={d.ml}
                          onChange={(e) => setDraft(item, { ml: e.target.value })}
                          placeholder={`auto: ${item.effectiveDeductionMl}`}
                          className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                        />
                        <div className="flex flex-wrap gap-1 mt-1">
                          {QUICK_ML.map((ml) => (
                            <button
                              key={ml}
                              type="button"
                              onClick={() => setDraft(item, { ml: String(ml) })}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                d.ml === String(ml)
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              {ml}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        {stale ? (
                          <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-orange-100 text-orange-700">
                            STALE LINK
                          </span>
                        ) : item.barInventoryItemId ? (
                          <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-green-100 text-green-700">
                            MAPPED
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-700">
                            UNMAPPED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {dirty && (
                          <button
                            onClick={() => handleSave(item)}
                            disabled={savingId === item.id}
                            className="p-2 rounded-lg bg-[#E53935] text-white hover:bg-[#B71C1C] disabled:bg-gray-300 transition-colors"
                            title="Save mapping"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 shrink-0">
          Empty ml = auto (parsed from item name, else 30ml). Multiple menu items can deduct from the same bottle.
        </div>
      </div>
    </div>
  );
}

export default LiquorMappingModal;
