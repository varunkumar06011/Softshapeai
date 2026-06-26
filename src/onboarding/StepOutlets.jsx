import React, { useState } from 'react';
import { Store, Plus, Trash2, Layout, ChevronDown, ChevronUp, Copy, AlertTriangle, Utensils } from 'lucide-react';

const RESTAURANT_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in Restaurant' },
  { value: 'BAR_LOUNGE', label: 'Bar & Lounge' },
  { value: 'BAR_WITH_DINING', label: 'Bar with Dining' },
  { value: 'CAFE', label: 'Cafe' },
  { value: 'CLOUD_KITCHEN', label: 'Cloud Kitchen' },
];

const defaultOutlet = (index, parentType) => ({
  name: `Outlet ${index + 1}`,
  restaurantType: parentType || 'DINE_IN',
  sections: [{ name: 'Main Hall' }],
  tables: [{ number: 1, capacity: 4, sectionIndex: 0 }],
  menu: { categories: [{ name: 'My Menu', items: [{ name: 'Placeholder', price: 1, isVeg: true }] }] },
  useMainMenu: true,
});

const StepOutlets = ({ outlets, outletCount, parentType, mainSections, mainTables, mainMenu, onChange, onNext, onBack }) => {
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

  const updateOutletSections = (index, sections) => {
    updateOutlet(index, { sections });
  };

  const updateOutletTables = (index, tables) => {
    updateOutlet(index, { tables });
  };

  const toggleExpand = (idx) => {
    setExpandedIdxs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const copyFloorPlanFromMain = (idx) => {
    const sections = (mainSections || []).map(s => ({ name: s.name }));
    const tables = (mainTables || []).map((t, i) => ({ ...t, sectionIndex: t.sectionIndex }));
    updateOutlet(idx, { sections, tables });
  };

  const names = currentOutlets.map(o => o.name.trim().toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  const hasDuplicates = dupes.length > 0;

  const isValid = currentOutlets.every(o =>
    o.name.length >= 2 &&
    o.restaurantType &&
    o.sections.every(s => s.name.length >= 1) &&
    o.tables.length >= 1 &&
    o.tables.every(t => t.number > 0 && t.capacity > 0)
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

              {mainSections && mainSections.length > 0 && mainTables && mainTables.length > 0 && (
                <button
                  onClick={() => copyFloorPlanFromMain(idx)}
                  className="flex items-center gap-2 text-xs text-[#E53935] hover:text-[#B71C1C] font-medium"
                >
                  <Copy size={14} /> Copy floor plan from main restaurant
                </button>
              )}

              <OutletFloorPlan
                outlet={outlet}
                onSectionsChange={(sections) => updateOutletSections(idx, sections)}
                onTablesChange={(tables) => updateOutletTables(idx, tables)}
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

function OutletFloorPlan({ outlet, onSectionsChange, onTablesChange }) {
  const addSection = () => {
    onSectionsChange([...outlet.sections, { name: '' }]);
  };

  const removeSection = (index) => {
    if (outlet.sections.length > 1) {
      onSectionsChange(outlet.sections.filter((_, i) => i !== index));
      onTablesChange(outlet.tables.filter(t => t.sectionIndex !== index).map(t => ({
        ...t,
        sectionIndex: t.sectionIndex > index ? t.sectionIndex - 1 : t.sectionIndex
      })));
    }
  };

  const addTable = (sectionIndex) => {
    const maxNumber = outlet.tables.length > 0 ? Math.max(...outlet.tables.map(t => t.number)) : 0;
    onTablesChange([...outlet.tables, { number: maxNumber + 1, capacity: 4, sectionIndex }]);
  };

  const addBulkTables = (sectionIndex, count, capacity) => {
    const maxNumber = outlet.tables.length > 0 ? Math.max(...outlet.tables.map(t => t.number)) : 0;
    const newTables = Array.from({ length: count }, (_, i) => ({
      number: maxNumber + 1 + i,
      capacity,
      sectionIndex
    }));
    onTablesChange([...outlet.tables, ...newTables]);
  };

  const removeTable = (sectionIndex, tableIdx) => {
    const sectionTables = outlet.tables.filter(t => t.sectionIndex === sectionIndex);
    const tableToRemove = sectionTables[tableIdx];
    if (tableToRemove) {
      onTablesChange(outlet.tables.filter(t => t !== tableToRemove));
    }
  };

  const updateTable = (sectionIndex, tableIdx, field, value) => {
    const sectionTables = outlet.tables.filter(t => t.sectionIndex === sectionIndex);
    const tableToUpdate = sectionTables[tableIdx];
    if (tableToUpdate) {
      onTablesChange(outlet.tables.map(t => t === tableToUpdate ? { ...t, [field]: value } : t));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Layout size={16} /> Floor Plan
      </div>
      {outlet.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="bg-white rounded-lg p-3 space-y-2 border border-gray-100">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={section.name}
              onChange={(e) => {
                const next = [...outlet.sections];
                next[sectionIndex] = { ...next[sectionIndex], name: e.target.value };
                onSectionsChange(next);
              }}
              className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm font-medium"
              placeholder="Section name"
            />
            {outlet.sections.length > 1 && (
              <button onClick={() => removeSection(sectionIndex)} className="p-1 text-red-600 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {/* Bulk add */}
          <div className="flex gap-2 items-center bg-gray-50 rounded-lg p-2 border border-gray-100">
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-0.5">Add multiple</label>
              <input
                type="number"
                id={`bulk-count-${sectionIndex}`}
                defaultValue="4"
                min="1"
                max="50"
                className="w-full px-2 py-1 bg-white border border-gray-100 rounded text-sm text-gray-900"
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-gray-500 block mb-0.5">Capacity</label>
              <select
                id={`bulk-capacity-${sectionIndex}`}
                defaultValue="4"
                className="w-full px-2 py-1 bg-white border border-gray-100 rounded text-sm text-gray-900"
              >
                {[2, 4, 6, 8, 12].map(n => <option key={n} value={n}>{n} seats</option>)}
              </select>
            </div>
            <button
              onClick={() => {
                const count = parseInt(document.getElementById(`bulk-count-${sectionIndex}`).value) || 4;
                const capacity = parseInt(document.getElementById(`bulk-capacity-${sectionIndex}`).value) || 4;
                addBulkTables(sectionIndex, Math.min(50, Math.max(1, count)), capacity);
              }}
              className="mt-4 px-3 py-1.5 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-lg text-xs font-medium transition-all"
            >
              Add
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {outlet.tables.filter(t => t.sectionIndex === sectionIndex).map((table, tableIdx) => (
              <div key={tableIdx} className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1">
                <input
                  type="number"
                  value={table.number === 0 ? '' : table.number}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateTable(sectionIndex, tableIdx, 'number', val === '' ? 0 : Math.max(1, parseInt(val) || 1));
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      updateTable(sectionIndex, tableIdx, 'number', 1);
                    }
                  }}
                  className="w-12 px-1 py-1 bg-white border border-gray-100 rounded text-center text-sm text-gray-900"
                  min="1"
                />
                <div className="flex gap-0.5">
                  {[2, 4, 6, 8, 12].map(cap => (
                    <button
                      key={cap}
                      onClick={() => updateTable(sectionIndex, tableIdx, 'capacity', cap)}
                      className={`px-1.5 py-0.5 rounded text-xs font-medium transition-all ${
                        table.capacity === cap
                          ? 'bg-[#E53935] text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {cap}
                    </button>
                  ))}
                </div>
                <button onClick={() => removeTable(sectionIndex, tableIdx)} className="text-red-600 hover:text-red-500 ml-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() => addTable(sectionIndex)}
              className="flex items-center gap-1 text-xs text-[#E53935] hover:text-[#B71C1C] px-2 py-1"
            >
              <Plus size={14} /> Table
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={addSection}
        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-[#E53935] hover:text-[#E53935] transition-all flex items-center justify-center gap-1"
      >
        <Plus size={16} /> Add Section
      </button>
    </div>
  );
}



export default StepOutlets;
