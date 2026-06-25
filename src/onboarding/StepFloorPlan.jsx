import React from 'react';
import { Layout, Plus, Trash2, Users, Printer } from 'lucide-react';

const TYPE_CONFIG = {
  DINE_IN: { sectionLabel: 'Sections', tableLabel: 'Tables', sectionPlaceholder: 'Section name (e.g., Main Hall)', showTables: true },
  BAR_LOUNGE: { sectionLabel: 'Bar Areas', tableLabel: 'Seats/Spots', sectionPlaceholder: 'e.g., Main Bar, Rooftop, VIP Section', showTables: true },
  BAR_WITH_DINING: { sectionLabel: 'Sections', tableLabel: 'Tables', sectionPlaceholder: 'Section name (e.g., Main Hall)', showTables: true },
  CAFE: { sectionLabel: 'Sections', tableLabel: 'Counters', sectionPlaceholder: 'Section name (e.g., Main Counter)', showTables: true },
  CLOUD_KITCHEN: { sectionLabel: 'Sections', tableLabel: 'Tables', sectionPlaceholder: '', showTables: false },
};

const StepFloorPlan = ({ restaurantType, printers, sections, tables, onChange, onNext, onBack }) => {
  const config = TYPE_CONFIG[restaurantType] || TYPE_CONFIG.DINE_IN;

  const handleSectionChange = (index, field, value) => {
    const newSections = [...sections];
    newSections[index] = { ...newSections[index], [field]: value };
    onChange(newSections, tables);
  };

  const addSection = () => {
    const defaultPrinter = printers.length > 0 ? printers[0].name : '';
    onChange([...sections, { name: '', kotPrinterName: defaultPrinter }], tables);
  };

  const removeSection = (index) => {
    if (sections.length > 1) {
      const newSections = sections.filter((_, i) => i !== index);
      const newTables = tables.filter(t => t.sectionIndex !== index);
      onChange(newSections, newTables.map(t => ({ ...t, sectionIndex: t.sectionIndex > index ? t.sectionIndex - 1 : t.sectionIndex })));
    }
  };

  const handleTableChange = (sectionIndex, tableIndex, field, value) => {
    const sectionTables = tables.filter(t => t.sectionIndex === sectionIndex);
    const tableToUpdate = sectionTables[tableIndex];
    if (tableToUpdate) {
      onChange(sections, tables.map(t => t === tableToUpdate ? { ...t, [field]: value } : t));
    }
  };

  const addTable = (sectionIndex) => {
    const existingTablesInSection = tables.filter(t => t.sectionIndex === sectionIndex);
    const maxNumber = existingTablesInSection.length > 0 ? Math.max(...existingTablesInSection.map(t => t.number)) : 0;
    onChange(sections, [...tables, { number: maxNumber + 1, capacity: 4, sectionIndex }]);
  };

  const removeTable = (sectionIndex, tableIndex) => {
    const sectionTables = tables.filter(t => t.sectionIndex === sectionIndex);
    if (sectionTables.length > 0) {
      const tableToRemove = sectionTables[tableIndex];
      onChange(sections, tables.filter(t => t !== tableToRemove));
    }
  };

  const getTablesForSection = (sectionIndex) => {
    return tables.filter(t => t.sectionIndex === sectionIndex);
  };

  const isValid = restaurantType === 'CLOUD_KITCHEN' || (
    sections.every(s => s.name.length >= 1) &&
    tables.length >= 1 &&
    tables.every(t => t.number > 0 && t.capacity > 0)
  );

  if (restaurantType === 'CLOUD_KITCHEN') {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <Layout size={48} className="mx-auto text-[#E53935] mb-4" />
          <h2 className="text-2xl font-bold mb-2">Floor Plan</h2>
        </div>
        <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-100">
          <p className="text-gray-700 font-medium">Cloud kitchens don't have dine-in tables.</p>
          <p className="text-gray-500 text-sm mt-1">Your orders will come from delivery platforms.</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={onBack}
            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
          >
            Back
          </button>
          <button
            onClick={onNext}
            className="flex-1 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Layout size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Floor Plan</h2>
        <p className="text-gray-500">Define your restaurant {config.sectionLabel.toLowerCase()} and {config.tableLabel.toLowerCase()}</p>
      </div>

      <div className="space-y-6">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={section.name}
                onChange={(e) => handleSectionChange(sectionIndex, 'name', e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 font-semibold"
                placeholder={config.sectionPlaceholder}
              />
              {sections.length > 1 && (
                <button
                  onClick={() => removeSection(sectionIndex)}
                  className="p-2 text-red-600 hover:text-red-500"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>

            {printers.length > 0 && (
              <div className="flex items-center gap-3">
                <Printer size={16} className="text-gray-500" />
                <label className="text-xs font-medium text-gray-500">KOT Printer</label>
                <select
                  value={section.kotPrinterName || printers[0]?.name || ''}
                  onChange={(e) => handleSectionChange(sectionIndex, 'kotPrinterName', e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                >
                  {printers.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {config.showTables && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-500">{config.tableLabel}</h4>
                  <button
                    onClick={() => addTable(sectionIndex)}
                    className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C]"
                  >
                    <Plus size={16} />
                    Add {config.tableLabel.slice(0, -1)}
                  </button>
                </div>

                {getTablesForSection(sectionIndex).map((table, tableIndex) => (
                  <div key={tableIndex} className="flex gap-3 items-center">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">{config.tableLabel.slice(0, -1)} Number</label>
                      <input
                        type="number"
                        value={table.number === 0 ? '' : table.number}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleTableChange(sectionIndex, tableIndex, 'number', val === '' ? 0 : Math.max(1, parseInt(val) || 1));
                        }}
                        onBlur={(e) => {
                          if (!e.target.value || parseInt(e.target.value) < 1) {
                            handleTableChange(sectionIndex, tableIndex, 'number', 1);
                          }
                        }}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                        min="1"
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-gray-500 mb-1 block">Capacity</label>
                      <div className="relative">
                        <Users size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500" />
                        <input
                          type="number"
                          value={table.capacity}
                          onChange={(e) => handleTableChange(sectionIndex, tableIndex, 'capacity', parseInt(e.target.value) || 4)}
                          className="w-full pl-8 pr-2 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                          min="1"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => removeTable(sectionIndex, tableIndex)}
                      className="p-2 text-red-600 hover:text-red-500 mt-4"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}

                {getTablesForSection(sectionIndex).length === 0 && (
                  <p className="text-sm text-gray-400 italic">No {config.tableLabel.toLowerCase()} added yet</p>
                )}
              </div>
            )}
          </div>
        ))}

        {restaurantType === 'CAFE' && (
          <p className="text-xs text-gray-500 -mt-2">
            Most cafes use counter-based billing — add counters only if you have seating areas.
          </p>
        )}

        <button
          onClick={addSection}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-[#E53935] hover:text-[#E53935] transition-all flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Add {config.sectionLabel.slice(0, -1)}
        </button>
      </div>

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

export default StepFloorPlan;
