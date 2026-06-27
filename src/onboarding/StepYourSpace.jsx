import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Users, ArrowRight, MapPin, LayoutGrid, Hash, Armchair } from 'lucide-react';

const AREA_PRESETS = {
  DINE_IN: [{ name: 'Restaurant', venueType: 'DINE_IN' }],
  BAR_LOUNGE: [{ name: 'Bar', venueType: 'BAR' }],
  BAR_WITH_DINING: [
    { name: 'Restaurant', venueType: 'DINE_IN' },
    { name: 'Bar', venueType: 'BAR' },
  ],
  CAFE: [{ name: 'Cafe', venueType: 'CAFE' }],
};

const VENUE_TYPE_LABELS = {
  DINE_IN: 'Dine-in',
  BAR: 'Bar',
  CAFE: 'Cafe',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

const SKIP_TABLE_VENUE_TYPES = ['TAKEAWAY', 'DELIVERY'];

function buildInitialAreas(restaurantType, existingVenues) {
  if (existingVenues && existingVenues.length > 0) {
    return existingVenues.map(v => {
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
  }
  const presets = AREA_PRESETS[restaurantType] || AREA_PRESETS.DINE_IN;
  return presets.map(p => ({
    name: p.name,
    venueType: p.venueType,
    sections: [{ name: 'Main Hall', tables: [{ number: 1, capacity: 4 }] }],
  }));
}

const StepYourSpace = ({ restaurantType, venues, sections, tables, onChange, onNext, onBack }) => {
  const [areas, setAreas] = useState(() => buildInitialAreas(restaurantType, venues));
  const [quickAdd, setQuickAdd] = useState({});
  const initializedRef = React.useRef(false);

  const allTables = useMemo(
    () => areas.flatMap(a => a.sections.flatMap(s => s.tables)),
    [areas]
  );

  const nextTableNumber = useMemo(
    () => (allTables.length > 0 ? Math.max(...allTables.map(t => t.number)) + 1 : 1),
    [allTables]
  );

  const syncToWizard = (updatedAreas) => {
    const flatSections = [];
    const flatTables = [];
    updatedAreas.forEach(area => {
      area.sections.forEach(section => {
        const sectionIndex = flatSections.length;
        flatSections.push({ name: section.name, kotPrinterName: '' });
        section.tables.forEach(t => {
          flatTables.push({ number: t.number, capacity: t.capacity, sectionIndex });
        });
      });
    });

    const nestedVenues = updatedAreas.map(area => ({
      name: area.name,
      venueType: area.venueType,
      floors: [{
        name: 'Ground Floor',
        sections: area.sections.map(s => ({
          name: s.name,
          tables: s.tables.map(t => ({ number: t.number, capacity: t.capacity })),
        })),
      }],
    }));

    onChange({
      venues: nestedVenues,
      sections: flatSections,
      tables: flatTables,
    });
  };

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      syncToWizard(areas);
    }
  }, []);

  const updateAreas = (updatedAreas) => {
    setAreas(updatedAreas);
    syncToWizard(updatedAreas);
  };

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
    const skipTables = SKIP_TABLE_VENUE_TYPES.includes(area.venueType);
    const sectionCount = area.sections.length;
    const tableCount = area.sections.reduce((sum, s) => sum + s.tables.length, 0);
    const seatCount = area.sections.reduce((sum, s) => sum + s.tables.reduce((ss, t) => ss + (t.capacity || 0), 0), 0);
    return { sectionCount, tableCount, seatCount, skipTables };
  };

  const isValid = () => {
    return areas.every(area => {
      if (!area.name.trim()) return false;
      if (area.sections.length === 0) return false;
      const skipTables = SKIP_TABLE_VENUE_TYPES.includes(area.venueType);
      return area.sections.every(section => {
        if (!section.name.trim()) return false;
        if (!skipTables && section.tables.length === 0) return false;
        return true;
      });
    });
  };

  const valid = isValid();

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <LayoutGrid size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Your Space</h2>
        <p className="text-gray-500">
          Tell us how your restaurant is laid out. Add each area (like a dining room or bar), then add sections and tables within each area.
        </p>
        <p className="text-gray-400 text-sm mt-1">
          A section is a zone within your area — for example, 'Window Side' or 'Main Hall'.
        </p>
      </div>

      {areas.map((area, areaIdx) => {
        const stats = areaStats(area);
        const skipTables = stats.skipTables;
        return (
          <div key={areaIdx} className="rounded-2xl border-2 border-gray-100 overflow-hidden">
            {/* Area Header */}
            <div className="bg-gray-50 px-5 py-4 flex items-center gap-3">
              <MapPin size={20} className="text-[#E53935] shrink-0" />
              <input
                type="text"
                value={area.name}
                onChange={(e) => updateAreaName(areaIdx, e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 font-medium"
                placeholder="Area name (e.g., Restaurant, Bar, Rooftop)"
              />
              <span className="shrink-0 px-2.5 py-1 bg-[#E53935]/10 text-[#E53935] text-xs font-semibold rounded-full">
                {VENUE_TYPE_LABELS[area.venueType] || area.venueType}
              </span>
              {areas.length > 1 && (
                <button
                  onClick={() => removeArea(areaIdx)}
                  className="p-2 text-red-600 hover:text-red-500 shrink-0"
                  type="button"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>

            {/* Area Stats Bar */}
            <div className="px-5 py-2 bg-white border-b border-gray-100 flex items-center gap-4 text-xs text-gray-500">
              <span>{stats.sectionCount} section{stats.sectionCount !== 1 ? 's' : ''}</span>
              {!skipTables && (
                <>
                  <span>·</span>
                  <span>{stats.tableCount} table{stats.tableCount !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{stats.seatCount} seat{stats.seatCount !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>

            {/* Sections */}
            <div className="p-5 space-y-4">
              {area.sections.map((section, secIdx) => {
                const sStats = sectionStats(section);
                const quickKey = `${areaIdx}-${secIdx}`;
                const qa = quickAdd[quickKey] || { count: 4, capacity: 4 };
                return (
                  <div key={secIdx} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                    {/* Section Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={section.name}
                          onChange={(e) => updateSectionName(areaIdx, secIdx, e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                          placeholder="Section name (e.g., Main Hall, Window Side)"
                        />
                      </div>
                      {!skipTables && (
                        <span className="shrink-0 text-xs text-gray-500 bg-white px-2.5 py-1.5 rounded-lg border border-gray-100">
                          {sStats.tableCount} table{sStats.tableCount !== 1 ? 's' : ''} · {sStats.seatCount} seat{sStats.seatCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {area.sections.length > 1 && (
                        <button
                          onClick={() => removeSection(areaIdx, secIdx)}
                          className="p-1.5 text-red-600 hover:text-red-500 shrink-0"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Tables List */}
                    {!skipTables && section.tables.length > 0 && (
                      <div className="space-y-1.5">
                        {section.tables.map((table, tableIdx) => (
                          <div key={tableIdx} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                            <Hash size={14} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 w-8">T{table.number}</span>
                            <Armchair size={14} className="text-gray-400 ml-2" />
                            <span className="text-xs text-gray-500">Capacity:</span>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={table.capacity}
                              onChange={(e) => updateTableCapacity(areaIdx, secIdx, tableIdx, Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm text-center focus:outline-none focus:border-[#E53935] text-gray-900"
                            />
                            <button
                              onClick={() => removeTable(areaIdx, secIdx, tableIdx)}
                              className="ml-auto p-1 text-red-600 hover:text-red-500"
                              type="button"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick Add Tables */}
                    {!skipTables && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">Add tables:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={qa.count}
                          onChange={(e) => setQuickAddField(quickKey, 'count', e.target.value)}
                          className="w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-[#E53935] text-gray-900"
                          placeholder="Count"
                        />
                        <span className="text-xs text-gray-400">x</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={qa.capacity}
                          onChange={(e) => setQuickAddField(quickKey, 'capacity', e.target.value)}
                          className="w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-[#E53935] text-gray-900"
                          placeholder="Seats"
                        />
                        <span className="text-xs text-gray-400">seats each</span>
                        <button
                          onClick={() => handleQuickAdd(areaIdx, secIdx)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#E53935] text-white text-xs font-semibold rounded-lg hover:bg-[#B71C1C] transition-all"
                          type="button"
                        >
                          <Plus size={14} /> Add Tables
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Section Button */}
              <button
                onClick={() => addSection(areaIdx)}
                className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C] font-medium"
                type="button"
              >
                <Plus size={16} /> Add Section
              </button>
            </div>
          </div>
        );
      })}

      {/* Add Area Button */}
      <button
        onClick={addArea}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-[#E53935] hover:text-[#E53935] transition-all flex items-center justify-center gap-2"
        type="button"
      >
        <Plus size={18} /> Add Area
      </button>

      {/* Validation hint */}
      {!valid && (
        <p className="text-xs text-gray-400 text-center">
          Each area needs a name and at least one section with tables.
        </p>
      )}

      {/* Navigation */}
      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!valid}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            valid
              ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          Continue
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default StepYourSpace;
