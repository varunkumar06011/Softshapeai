// ─────────────────────────────────────────────────────────────────────────────
// BarMappingPanel — Admin UI for managing BarItemMapping rows
// ─────────────────────────────────────────────────────────────────────────────
// Shows one row per (menu item, variant price) for all LIQUOR menu items.
// Pre-fills from AUTO_SUGGESTED mappings. Admin can pick primary/secondary
// inventory items and ml-per-unit, then save via POST /api/bar/inventory/mappings.
//
// Read-only against menu items and inventory items — only writes to
// bar_item_mappings via the mapping API.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Save, Trash2, RefreshCw, Search } from 'lucide-react';
import {
  fetchBarInventory,
  fetchBarMappings,
  fetchUnmappedBarItems,
  saveBarMapping,
  deleteBarMapping,
} from '../services/barInventoryApi';
import { apiUrl, getAuthHeaders } from '../services/apiConfig';

export default function BarMappingPanel() {
  const [mappings, setMappings] = useState([]);
  const [unmapped, setUnmapped] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // key being saved
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mapData, unmappedData, invData] = await Promise.all([
        fetchBarMappings(),
        fetchUnmappedBarItems().catch(() => []),
        fetchBarInventory(),
      ]);
      setMappings(mapData || []);
      setUnmapped(unmappedData || []);
      setInventoryItems(invData || []);

      // Fetch liquor menu items
      const res = await fetch(apiUrl('/api/menu/items/admin'), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', ...getAuthHeaders() },
      });
      if (res.ok) {
        const allItems = await res.json();
        setMenuItems((allItems || []).filter(i => i.menuType === 'LIQUOR'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Build a map of existing mappings by key for quick lookup
  const mappingByKey = new Map();
  for (const m of mappings) {
    mappingByKey.set(`${m.menuItemId}:${m.variantPrice}`, m);
  }

  // Build rows: one per (menu item, variant price)
  // For each liquor menu item, enumerate its variant prices (or basePrice if no variants)
  const rows = [];
  for (const mi of menuItems) {
    const prices = mi.variants && mi.variants.length > 0
      ? [...new Set(mi.variants.map(v => Number(v.price)))]
      : [Number(mi.basePrice)];
    for (const price of prices) {
      const key = `${mi.id}:${price}`;
      const existing = mappingByKey.get(key);
      const isUnmapped = unmapped.some(u => u.menuItemId === mi.id && u.price === price);
      rows.push({
        key,
        menuItemId: mi.id,
        menuItemName: mi.name,
        variantPrice: price,
        existing,
        isUnmapped,
      });
    }
  }

  // Filter by search
  const filteredRows = search
    ? rows.filter(r => r.menuItemName.toLowerCase().includes(search.toLowerCase()))
    : rows;

  // Sort: unmapped first, then by name
  filteredRows.sort((a, b) => {
    if (a.isUnmapped && !b.isUnmapped) return -1;
    if (!a.isUnmapped && b.isUnmapped) return 1;
    return a.menuItemName.localeCompare(b.menuItemName);
  });

  const unmappedCount = rows.filter(r => r.isUnmapped).length;

  async function handleSave(row, primaryInvId, secondaryInvId, mlPerUnit) {
    setSaving(row.key);
    setError(null);
    try {
      await saveBarMapping({
        menuItemId: row.menuItemId,
        variantPrice: row.variantPrice,
        primaryInvId,
        secondaryInvId: secondaryInvId || null,
        mlPerUnit: Number(mlPerUnit) || 0,
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(menuItemId, variantPrice) {
    setSaving(`${menuItemId}:${variantPrice}:delete`);
    setError(null);
    try {
      await deleteBarMapping(menuItemId, variantPrice);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
        <span className="ml-3 text-gray-500 font-bold">Loading mappings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900">Bar Item Mappings</h2>
          <p className="text-sm text-gray-500">
            Link each liquor menu item (per variant price) to inventory items for deterministic deduction.
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* Unmapped warning */}
      {unmappedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="text-amber-600" size={20} />
          <div>
            <p className="font-bold text-amber-800">{unmappedCount} unmapped (menu item, price) pair(s) from recent orders</p>
            <p className="text-sm text-amber-600">These items will produce NO_MAPPING errors during deduction until mapped.</p>
          </div>
        </div>
      )}

      {/* Edit warning */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        ⚠ Editing a mapping after an order has already been deducted will not retroactively correct that order — it only affects future deductions and retries.
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-bold">
          Error: {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu items…"
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
        />
      </div>

      {/* Mapping table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="py-3 px-2">Menu Item</th>
              <th className="py-3 px-2">Price</th>
              <th className="py-3 px-2">Primary Inventory</th>
              <th className="py-3 px-2">Secondary Inventory</th>
              <th className="py-3 px-2">ml/Unit</th>
              <th className="py-3 px-2">Source</th>
              <th className="py-3 px-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <MappingRow
                key={row.key}
                row={row}
                inventoryItems={inventoryItems}
                saving={saving === row.key}
                deleting={saving === `${row.key}:delete`}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filteredRows.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          No liquor menu items found.
        </div>
      )}
    </div>
  );
}

// ── Single mapping row ──────────────────────────────────────────────────────
function MappingRow({ row, inventoryItems, saving, deleting, onSave, onDelete }) {
  const existing = row.existing;
  const [primaryInvId, setPrimaryInvId] = useState(existing?.primaryInvId || '');
  const [secondaryInvId, setSecondaryInvId] = useState(existing?.secondaryInvId || '');
  const [mlPerUnit, setMlPerUnit] = useState(existing?.mlPerUnit || '');

  // Update local state when existing mapping changes (e.g. after refresh)
  useEffect(() => {
    setPrimaryInvId(existing?.primaryInvId || '');
    setSecondaryInvId(existing?.secondaryInvId || '');
    setMlPerUnit(existing?.mlPerUnit || '');
  }, [existing?.id, existing?.primaryInvId, existing?.secondaryInvId, existing?.mlPerUnit]);

  const isUnmappedBadge = row.isUnmapped && !existing;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-2 px-2 font-bold text-gray-900">
        {row.menuItemName}
        {isUnmappedBadge && (
          <span className="ml-2 text-[10px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            UNMAPPED
          </span>
        )}
      </td>
      <td className="py-2 px-2 text-gray-600">₹{row.variantPrice}</td>
      <td className="py-2 px-2">
        <select
          value={primaryInvId}
          onChange={(e) => setPrimaryInvId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-200"
        >
          <option value="">— Select —</option>
          {inventoryItems.map(inv => (
            <option key={inv.id} value={inv.id}>
              {inv.menuItem?.name || inv.displayName || 'Unknown'} ({Number(inv.currentStock || 0).toFixed(0)}ml)
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 px-2">
        <select
          value={secondaryInvId}
          onChange={(e) => setSecondaryInvId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-200"
        >
          <option value="">— None —</option>
          {inventoryItems.map(inv => (
            <option key={inv.id} value={inv.id}>
              {inv.menuItem?.name || inv.displayName || 'Unknown'} ({Number(inv.currentStock || 0).toFixed(0)}ml)
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 px-2">
        <input
          type="number"
          value={mlPerUnit}
          onChange={(e) => setMlPerUnit(e.target.value)}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-200"
        />
      </td>
      <td className="py-2 px-2">
        {existing ? (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${existing.source === 'MANUAL' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
            {existing.source === 'MANUAL' ? 'MANUAL' : 'AUTO'}
          </span>
        ) : (
          <span className="text-[10px] text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSave(row, primaryInvId, secondaryInvId, mlPerUnit)}
            disabled={saving || !primaryInvId || !mlPerUnit}
            className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-40 transition-colors"
            title="Save mapping"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          </button>
          {existing && (
            <button
              onClick={() => onDelete(row.menuItemId, row.variantPrice)}
              disabled={deleting}
              className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-40 transition-colors"
              title="Delete mapping"
            >
              {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
