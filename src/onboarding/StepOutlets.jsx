import React, { useState } from 'react';
import { Store, Plus, Trash2, Layout, Utensils, ChevronDown, ChevronUp } from 'lucide-react';

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
  menu: { categories: [{ name: 'Starters', items: [{ name: '', price: 0, isVeg: true }] }] },
});

const StepOutlets = ({ outlets, outletCount, parentType, onChange, onNext, onBack }) => {
  const [expandedIdx, setExpandedIdx] = useState(0);

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

  const updateOutletMenu = (index, menu) => {
    updateOutlet(index, { menu });
  };

  const isValid = currentOutlets.every(o =>
    o.name.length >= 2 &&
    o.restaurantType &&
    o.sections.every(s => s.name.length >= 1) &&
    o.tables.length >= 1 &&
    o.tables.every(t => t.number > 0 && t.capacity > 0) &&
    o.menu.categories.length >= 1 &&
    o.menu.categories.every(cat => cat.name.length >= 1 && cat.items.every(item => item.name.length >= 1 && item.price > 0))
  );

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Store size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Outlet Configuration</h2>
        <p className="text-gray-500">Set up each additional outlet ({currentOutlets.length} outlet{currentOutlets.length > 1 ? 's' : ''})</p>
      </div>

      {currentOutlets.map((outlet, idx) => (
        <div key={idx} className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => setExpandedIdx(expandedIdx === idx ? -1 : idx)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-100 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${expandedIdx === idx ? 'bg-[#E53935] text-white' : 'bg-gray-200 text-gray-500'}`}>
                {idx + 1}
              </div>
              <span className="font-semibold text-gray-900">{outlet.name}</span>
              <span className="text-sm text-gray-400">{RESTAURANT_TYPES.find(t => t.value === outlet.restaurantType)?.label}</span>
            </div>
            {expandedIdx === idx ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
          </button>

          {expandedIdx === idx && (
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

              <OutletFloorPlan
                outlet={outlet}
                onSectionsChange={(sections) => updateOutletSections(idx, sections)}
                onTablesChange={(tables) => updateOutletTables(idx, tables)}
              />

              <OutletMenu
                menu={outlet.menu}
                onChange={(menu) => updateOutletMenu(idx, menu)}
              />
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
    const sectionTables = outlet.tables.filter(t => t.sectionIndex === sectionIndex);
    const maxNumber = sectionTables.length > 0 ? Math.max(...sectionTables.map(t => t.number)) : 0;
    onTablesChange([...outlet.tables, { number: maxNumber + 1, capacity: 4, sectionIndex }]);
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
          <div className="flex flex-wrap gap-2">
            {outlet.tables.filter(t => t.sectionIndex === sectionIndex).map((table, tableIdx) => (
              <div key={tableIdx} className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1">
                <input
                  type="number"
                  value={table.number}
                  onChange={(e) => updateTable(sectionIndex, tableIdx, 'number', parseInt(e.target.value) || 0)}
                  className="w-12 px-1 py-1 bg-white border border-gray-100 rounded text-center text-sm text-gray-900"
                  min="1"
                />
                <span className="text-xs text-gray-400">seats</span>
                <input
                  type="number"
                  value={table.capacity}
                  onChange={(e) => updateTable(sectionIndex, tableIdx, 'capacity', parseInt(e.target.value) || 4)}
                  className="w-12 px-1 py-1 bg-white border border-gray-100 rounded text-center text-sm text-gray-900"
                  min="1"
                />
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

function OutletMenu({ menu, onChange }) {
  const addCategory = () => {
    onChange({ ...menu, categories: [...menu.categories, { name: '', items: [{ name: '', price: 0, isVeg: true }] }] });
  };

  const removeCategory = (idx) => {
    if (menu.categories.length > 1) {
      onChange({ ...menu, categories: menu.categories.filter((_, i) => i !== idx) });
    }
  };

  const addItem = (catIdx) => {
    const next = [...menu.categories];
    next[catIdx] = { ...next[catIdx], items: [...next[catIdx].items, { name: '', price: 0, isVeg: true }] };
    onChange({ ...menu, categories: next });
  };

  const removeItem = (catIdx, itemIdx) => {
    if (menu.categories[catIdx].items.length > 1) {
      const next = [...menu.categories];
      next[catIdx] = { ...next[catIdx], items: next[catIdx].items.filter((_, i) => i !== itemIdx) };
      onChange({ ...menu, categories: next });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Utensils size={16} /> Menu
      </div>
      {menu.categories.map((cat, catIdx) => (
        <div key={catIdx} className="bg-white rounded-lg p-3 space-y-2 border border-gray-100">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={cat.name}
              onChange={(e) => {
                const next = [...menu.categories];
                next[catIdx] = { ...next[catIdx], name: e.target.value };
                onChange({ ...menu, categories: next });
              }}
              className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm font-medium"
              placeholder="Category name"
            />
            {menu.categories.length > 1 && (
              <button onClick={() => removeCategory(catIdx)} className="p-1 text-red-600 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {cat.items.map((item, itemIdx) => (
            <div key={itemIdx} className="flex items-center gap-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => {
                  const next = [...menu.categories];
                  next[catIdx] = {
                    ...next[catIdx],
                    items: next[catIdx].items.map((it, i) => i === itemIdx ? { ...it, name: e.target.value } : it)
                  };
                  onChange({ ...menu, categories: next });
                }}
                className="flex-1 px-2 py-1 bg-gray-50 border border-gray-100 rounded text-sm text-gray-900"
                placeholder="Item name"
              />
              <div className="w-20 relative">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                <input
                  type="number"
                  value={item.price === 0 ? '' : item.price}
                  onChange={(e) => {
                    const next = [...menu.categories];
                    next[catIdx] = {
                      ...next[catIdx],
                      items: next[catIdx].items.map((it, i) => i === itemIdx ? { ...it, price: parseFloat(e.target.value) || 0 } : it)
                    };
                    onChange({ ...menu, categories: next });
                  }}
                  className="w-full pl-4 pr-1 py-1 bg-gray-50 border border-gray-100 rounded text-sm text-gray-900"
                  placeholder="Price"
                  min="0"
                />
              </div>
              <button
                onClick={() => {
                  const next = [...menu.categories];
                  next[catIdx] = {
                    ...next[catIdx],
                    items: next[catIdx].items.map((it, i) => i === itemIdx ? { ...it, isVeg: !it.isVeg } : it)
                  };
                  onChange({ ...menu, categories: next });
                }}
                className={`px-2 py-1 rounded text-xs ${item.isVeg ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}
              >
                {item.isVeg ? 'Veg' : 'Non-Veg'}
              </button>
              {cat.items.length > 1 && (
                <button onClick={() => removeItem(catIdx, itemIdx)} className="text-red-600 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => addItem(catIdx)}
            className="flex items-center gap-1 text-xs text-[#E53935] hover:text-[#B71C1C]"
          >
            <Plus size={14} /> Add Item
          </button>
        </div>
      ))}
      <button
        onClick={addCategory}
        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-[#E53935] hover:text-[#E53935] transition-all flex items-center justify-center gap-1"
      >
        <Plus size={16} /> Add Category
      </button>
    </div>
  );
}

export default StepOutlets;
