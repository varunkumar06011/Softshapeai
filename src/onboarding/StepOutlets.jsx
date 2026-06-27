import React, { useState } from 'react';
import { Store, Plus, Trash2, MapPin, ChevronDown, ChevronUp, Copy, AlertTriangle, Utensils, LayoutGrid, Hash, Armchair } from 'lucide-react';

const RESTAURANT_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in Restaurant' },
  { value: 'BAR_LOUNGE', label: 'Bar & Lounge' },
  { value: 'BAR_WITH_DINING', label: 'Bar with Dining' },
  { value: 'CAFE', label: 'Cafe' },
  { value: 'CLOUD_KITCHEN', label: 'Cloud Kitchen' },
];

const VENUE_TYPE_LABELS = {
  DINE_IN: 'Dine-in',
  BAR: 'Bar',
  CAFE: 'Cafe',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

export function areasToFlat(areas) {
  const sections = [];
  const tables = [];
  areas.forEach(area => {
    area.sections.forEach(section => {
      const sectionIndex = sections.length;
      sections.push({ name: section.name });
      section.tables.forEach(t => {
        tables.push({ number: t.number, capacity: t.capacity, sectionIndex });
      });
    });
  });
  return { sections, tables };
}

const defaultOutlet = (index, parentType) => ({
  name: `Outlet ${index + 1}`,
  restaurantType: parentType || 'DINE_IN',
  areas: [{ name: 'Main Area', venueType: parentType || 'DINE_IN', sections: [{ name: 'Main Hall', tables: [{ number: 1, capacity: 4 }] }] }],
  menu: { categories: [{ name: 'My Menu', items: [{ name: 'Placeholder', price: 1, isVeg: true }] }] },
  useMainMenu: true,
});

const StepOutlets = ({ outlets, outletCount, parentType, mainVenues, mainMenu, onChange, onNext, onBack }) => {
  const [expandedIdxs, setExpandedIdxs] = useState(new Set([0]));

  const ensureOutlets = () => {
    const needed = outletCount - 1;
    let result = [...outlets];
    while (result.length < needed) {
      result.push(defaultOutlet(result.length, parentType));
    }
    if (result.length > needed) {
      result = result.slice(0, needed);
    }
    return result;
  };

  const currentOutlets = ensureOutlets();

  const updateOutlet = (index, data) => {
    const next = [...currentOutlets];
    next[index] = { ...next[index], ...data };
    onChange(next);
  };

  const toggleExpand = (idx) => {
    setExpandedIdxs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Risk Callout A: Unwrap mainVenues floors[].sections[].tables[] into areas format
  // Same unwrapping as buildInitialAreas in StepYourSpace.jsx
  const copyFloorPlanFromMain = (idx) => {
    const areas = (mainVenues || []).map(v => {
      const sections = (v.floors || []).flatMap(f =>
        (f.sections || []).map(s => ({
          name: s.name,
          tables: (s.tables || []).map(t => ({ number: t.number, capacity: t.capacity })),
        }))
      );
      const directSections = (v.sections || []).map(s => ({
        name: s.name,
        tables: (s.tables || []).map(t => ({ number: t.number, capacity: t.capacity })),
      }));
      return {
        name: v.name,
        venueType: v.venueType || 'DINE_IN',
        sections: [...sections, ...directSections],
      };
    });
    updateOutlet(idx, { areas });
  };

  // Risk Callout B: Keep dupe check AND validate areas structure
  const names = currentOutlets.map(o => o.name.trim().toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  const hasDuplicates = dupes.length > 0;

  const isValid = currentOutlets.every(o =>
    o.name.length >= 2 &&
    o.restaurantType &&
    o.areas.length >= 1 &&
    o.areas.every(area =>
      area.name.trim().length >= 1 &&
      area.sections.length >= 1 &&
      area.sections.every(section =>
        section.name.trim().length >= 1 &&
        section.tables.length >= 1 &&
        section.tables.every(t => t.number > 0 && t.capacity > 0)
      )
    )
  ) && !hasDuplicates;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Store size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Outlet Configuration</h2>
        <p className="text-gray-500">Set up each additional outlet ({currentOutlets.length} outlet{currentOutlets.length > 1 ? 's' : ''})</p>
      </div>

      {hasDuplicates && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-yellow-800 text-sm">
          <AlertTriangle size={18} />
          <span>Duplicate outlet names detected. Each outlet needs a unique name.</span>
        </div>
      )}

      {currentOutlets.map((outlet, idx) => (
        <div key={idx} className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => toggleExpand(idx)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-100 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${expandedIdxs.has(idx) ? 'bg-[#E53935] text-white' : 'bg-gray-200 text-gray-500'}`}>
                {idx + 1}
              </div>
              <span className="font-semibold text-gray-900">{outlet.name}</span>
              <span className="text-sm text-gray-400">{RESTAURANT_TYPES.find(t => t.value === outlet.restaurantType)?.label}</span>
            </div>
            {expandedIdxs.has(idx) ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
          </button>

          {expandedIdxs.has(idx) && (
            <div className="p-4 space-y-4 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Outlet Name *</label>
                  <input
                    type="text"
                    value={outlet.name}
                    onChange={(e) => updateOutlet(idx, { name: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                    placeholder="e.g., Downtown Branch"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Outlet Type *</label>
                  <select
                    value={outlet.restaurantType}
                    onChange={(e) => updateOutlet(idx, { restaurantType: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                  >
                    {RESTAURANT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {mainVenues && mainVenues.length > 0 && (
                <button
                  onClick={() => copyFloorPlanFromMain(idx)}
                  className="flex items-center gap-2 text-xs text-[#E53935] hover:text-[#B71C1C] font-medium"
                >
                  <Copy size={14} /> Copy floor plan from main restaurant
                </button>
              )}

              <OutletSpaceEditor
                outlet={outlet}
                onAreasChange={(areas) => updateOutlet(idx, { areas })}
              />

              {/* Menu toggle */}
              <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-100">
                <Utensils size={16} className="text-gray-500" />
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={outlet.useMainMenu !== false}
                    onChange={(e) => updateOutlet(idx, { useMainMenu: e.target.checked })}
                    className="w-4 h-4 text-[#E53935] rounded border-gray-300"
                  />
                  Use same menu as main restaurant
                </label>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            isValid
              ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

function OutletSpaceEditor({ outlet, onAreasChange }) {
  const areas = outlet.areas || [];
  const [quickAdd, setQuickAdd] = useState({});

  const allTables = areas.flatMap(a => a.sections.flatMap(s => s.tables));
  const nextTableNumber = allTables.length > 0 ? Math.max(...allTables.map(t => t.number)) + 1 : 1;

  const updateAreas = (next) => onAreasChange(next);

  const addArea = () => {
    updateAreas([...areas, { name: '', venueType: 'DINE_IN', sections: [{ name: '', tables: [] }] }]);
  };

  const removeArea = (areaIdx) => {
    if (areas.length > 1) {
      updateAreas(areas.filter((_, i) => i !== areaIdx));
    }
  };

  const updateAreaName = (areaIdx, name) => {
    updateAreas(areas.map((a, i) => i === areaIdx ? { ...a, name } : a));
  };

  const addSection = (areaIdx) => {
    updateAreas(areas.map((a, i) => i === areaIdx
      ? { ...a, sections: [...a.sections, { name: '', tables: [] }] }
      : a
    ));
  };

  const removeSection = (areaIdx, secIdx) => {
    updateAreas(areas.map((a, i) => i === areaIdx
      ? { ...a, sections: a.sections.filter((_, j) => j !== secIdx) }
      : a
    ));
  };

  const updateSectionName = (areaIdx, secIdx, name) => {
    updateAreas(areas.map((a, i) => i === areaIdx
      ? { ...a, sections: a.sections.map((s, j) => j === secIdx ? { ...s, name } : s) }
      : a
    ));
  };

  const addBulkTables = (areaIdx, secIdx, count, capacity) => {
    const startNum = nextTableNumber;
    const newTables = Array.from({ length: count }, (_, i) => ({
      number: startNum + i,
      capacity,
    }));
    updateAreas(areas.map((a, i) => i === areaIdx
      ? { ...a, sections: a.sections.map((s, j) => j === secIdx
          ? { ...s, tables: [...s.tables, ...newTables] }
          : s
        ) }
      : a
    ));
  };

  const removeTable = (areaIdx, secIdx, tableIdx) => {
    updateAreas(areas.map((a, i) => i === areaIdx
      ? { ...a, sections: a.sections.map((s, j) => j === secIdx
          ? { ...s, tables: s.tables.filter((_, k) => k !== tableIdx) }
          : s
        ) }
      : a
    ));
  };

  const updateTableCapacity = (areaIdx, secIdx, tableIdx, capacity) => {
    updateAreas(areas.map((a, i) => i === areaIdx
      ? { ...a, sections: a.sections.map((s, j) => j === secIdx
          ? { ...s, tables: s.tables.map((t, k) => k === tableIdx ? { ...t, capacity } : t) }
          : s
        ) }
      : a
    ));
  };

  const handleQuickAdd = (areaIdx, secIdx) => {
    const state = quickAdd[`${areaIdx}-${secIdx}`] || { count: 4, capacity: 4 };
    const count = Math.max(1, parseInt(state.count) || 1);
    const capacity = Math.max(1, parseInt(state.capacity) || 4);
    addBulkTables(areaIdx, secIdx, count, capacity);
    setQuickAdd(prev => ({ ...prev, [`${areaIdx}-${secIdx}`]: { count: 4, capacity: 4 } }));
  };

  const setQuickAddField = (key, field, value) => {
    setQuickAdd(prev => ({ ...prev, [key]: { ...(prev[key] || { count: 4, capacity: 4 }), [field]: value } }));
  };

  const sectionStats = (section) => {
    const tableCount = section.tables.length;
    const seatCount = section.tables.reduce((sum, t) => sum + (t.capacity || 0), 0);
    return { tableCount, seatCount };
  };

  const areaStats = (area) => {
    const sectionCount = area.sections.length;
    const tableCount = area.sections.reduce((sum, s) => sum + s.tables.length, 0);
    const seatCount = area.sections.reduce((sum, s) => sum + s.tables.reduce((ss, t) => ss + (t.capacity || 0), 0), 0);
    return { sectionCount, tableCount, seatCount };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <LayoutGrid size={16} /> Your Space
      </div>
      {areas.map((area, areaIdx) => {
        const stats = areaStats(area);
        return (
          <div key={areaIdx} className="rounded-xl border-2 border-gray-100 overflow-hidden">
            {/* Area Header */}
            <div className="bg-white px-4 py-3 flex items-center gap-3">
              <MapPin size={18} className="text-[#E53935] shrink-0" />
              <input
                type="text"
                value={area.name}
                onChange={(e) => updateAreaName(areaIdx, e.target.value)}
                className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm font-medium"
                placeholder="Area name (e.g., Restaurant, Bar, Rooftop)"
              />
              <span className="shrink-0 px-2 py-0.5 bg-[#E53935]/10 text-[#E53935] text-xs font-semibold rounded-full">
                {VENUE_TYPE_LABELS[area.venueType] || area.venueType}
              </span>
              {areas.length > 1 && (
                <button
                  onClick={() => removeArea(areaIdx)}
                  className="p-1.5 text-red-600 hover:text-red-500 shrink-0"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {/* Area Stats Bar */}
            <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-3 text-xs text-gray-500">
              <span>{stats.sectionCount} section{stats.sectionCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{stats.tableCount} table{stats.tableCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{stats.seatCount} seat{stats.seatCount !== 1 ? 's' : ''}</span>
            </div>

            {/* Sections */}
            <div className="p-4 space-y-3">
              {area.sections.map((section, secIdx) => {
                const sStats = sectionStats(section);
                const quickKey = `${areaIdx}-${secIdx}`;
                const qa = quickAdd[quickKey] || { count: 4, capacity: 4 };
                return (
                  <div key={secIdx} className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                    {/* Section Header */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={section.name}
                        onChange={(e) => updateSectionName(areaIdx, secIdx, e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                        placeholder="Section name (e.g., Main Hall, Window Side)"
                      />
                      <span className="shrink-0 text-xs text-gray-500 bg-white px-2 py-1 rounded-lg border border-gray-100">
                        {sStats.tableCount} table{sStats.tableCount !== 1 ? 's' : ''} · {sStats.seatCount} seat{sStats.seatCount !== 1 ? 's' : ''}
                      </span>
                      {area.sections.length > 1 && (
                        <button
                          onClick={() => removeSection(areaIdx, secIdx)}
                          className="p-1 text-red-600 hover:text-red-500 shrink-0"
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Tables List */}
                    {section.tables.length > 0 && (
                      <div className="space-y-1">
                        {section.tables.map((table, tableIdx) => (
                          <div key={tableIdx} className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                            <Hash size={12} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 w-8">T{table.number}</span>
                            <Armchair size={12} className="text-gray-400 ml-1" />
                            <span className="text-xs text-gray-500">Capacity:</span>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={table.capacity}
                              onChange={(e) => updateTableCapacity(areaIdx, secIdx, tableIdx, Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-14 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm text-center focus:outline-none focus:border-[#E53935] text-gray-900"
                            />
                            <button
                              onClick={() => removeTable(areaIdx, secIdx, tableIdx)}
                              className="ml-auto p-1 text-red-600 hover:text-red-500"
                              type="button"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick Add Tables */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">Add tables:</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={qa.count}
                        onChange={(e) => setQuickAddField(quickKey, 'count', e.target.value)}
                        className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-[#E53935] text-gray-900"
                        placeholder="Count"
                      />
                      <span className="text-xs text-gray-400">×</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={qa.capacity}
                        onChange={(e) => setQuickAddField(quickKey, 'capacity', e.target.value)}
                        className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-[#E53935] text-gray-900"
                        placeholder="Seats"
                      />
                      <span className="text-xs text-gray-400">seats each</span>
                      <button
                        onClick={() => handleQuickAdd(areaIdx, secIdx)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-[#E53935] text-white text-xs font-semibold rounded-lg hover:bg-[#B71C1C] transition-all"
                        type="button"
                      >
                        <Plus size={12} /> Add Tables
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add Section Button */}
              <button
                onClick={() => addSection(areaIdx)}
                className="flex items-center gap-1 text-sm text-[#E53935] hover:text-[#B71C1C] font-medium"
                type="button"
              >
                <Plus size={14} /> Add Section
              </button>
            </div>
          </div>
        );
      })}

      {/* Add Area Button */}
      <button
        onClick={addArea}
        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-[#E53935] hover:text-[#E53935] transition-all flex items-center justify-center gap-1"
        type="button"
      >
        <Plus size={16} /> Add Area
      </button>
    </div>
  );
}

export default StepOutlets;
