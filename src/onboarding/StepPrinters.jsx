import React, { useState } from 'react';
import { Printer, Plus, Trash2, Monitor, X } from 'lucide-react';

const PAPER_WIDTHS = ['58mm', '80mm'];
const PRINTER_TYPES = [
  { value: 'KITCHEN', label: 'Kitchen KOT' },
  { value: 'BAR', label: 'Bar KOT' },
  { value: 'BILL', label: 'Bill' },
  { value: 'ALL', label: 'All' },
];

const StepPrinters = ({ printers, sectionRouting, sectionsData, onChange, onNext, onBack }) => {
  const [printingMode, setPrintingMode] = useState(printers.length > 0 ? 'qz' : 'none');

  const handleModeChange = (mode) => {
    setPrintingMode(mode);
    if (mode === 'none') {
      onChange([], {});
    } else if (printers.length === 0) {
      // Restore defaults
      onChange(
        [
          { name: 'Kitchen Printer', paperWidth: '80mm', type: 'KITCHEN' },
          { name: 'Bill Printer', paperWidth: '80mm', type: 'BILL' },
        ],
        {}
      );
    }
  };

  const updatePrinter = (index, field, value) => {
    const next = printers.map((p, i) => (i === index ? { ...p, [field]: value } : p));
    onChange(next, sectionRouting);
  };

  const addPrinter = () => {
    onChange([...printers, { name: '', paperWidth: '80mm', type: 'KITCHEN' }], sectionRouting);
  };

  const removePrinter = (index) => {
    const removedName = printers[index]?.name;
    const nextPrinters = printers.filter((_, i) => i !== index);
    // Clean up routing references to removed printer
    const nextRouting = { ...sectionRouting };
    Object.keys(nextRouting).forEach(key => {
      if (nextRouting[key] === removedName) delete nextRouting[key];
    });
    onChange(nextPrinters, nextRouting);
  };

  const updateRouting = (sectionName, printerName) => {
    onChange(printers, { ...sectionRouting, [sectionName]: printerName });
  };

  const isValid = true;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Printer size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Printer Setup</h2>
        <p className="text-gray-500">Configure KOT and bill printers for your restaurant</p>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleModeChange('qz')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            printingMode === 'qz'
              ? 'border-[#E53935] bg-[#FFF5F5]'
              : 'border-gray-100 bg-gray-50 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <Printer size={24} className={printingMode === 'qz' ? 'text-[#E53935]' : 'text-gray-400'} />
            <div>
              <p className={`text-sm font-semibold ${printingMode === 'qz' ? 'text-[#E53935]' : 'text-gray-900'}`}>
                QZ Tray
              </p>
              <p className="text-xs text-gray-500">USB or network printer</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('none')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            printingMode === 'none'
              ? 'border-[#E53935] bg-[#FFF5F5]'
              : 'border-gray-100 bg-gray-50 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <Monitor size={24} className={printingMode === 'none' ? 'text-[#E53935]' : 'text-gray-400'} />
            <div>
              <p className={`text-sm font-semibold ${printingMode === 'none' ? 'text-[#E53935]' : 'text-gray-900'}`}>
                No printing
              </p>
              <p className="text-xs text-gray-500">Skip for now, set up later</p>
            </div>
          </div>
        </button>
      </div>

      {printingMode === 'qz' && (
        <>
          {/* Printer list */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Printers</p>
              <button
                onClick={addPrinter}
                className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C]"
              >
                <Plus size={16} />
                Add Printer
              </button>
            </div>

            {printers.map((printer, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={printer.name}
                    onChange={(e) => updatePrinter(index, 'name', e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                    placeholder="Printer name"
                  />
                  {printers.length > 1 && (
                    <button
                      onClick={() => removePrinter(index)}
                      className="p-2 text-red-600 hover:text-red-500"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Paper Width</label>
                    <div className="flex gap-2">
                      {PAPER_WIDTHS.map(w => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => updatePrinter(index, 'paperWidth', w)}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                            printer.paperWidth === w
                              ? 'bg-[#E53935] text-white'
                              : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <select
                      value={printer.type}
                      onChange={(e) => updatePrinter(index, 'type', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                    >
                      {PRINTER_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Section → Printer routing */}
          {sectionsData.length > 0 && printers.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700">Section Printer Routing</p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                {sectionsData.map((section, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{section.name || `Section ${idx + 1}`}</span>
                    <select
                      value={sectionRouting[section.name] || printers[0]?.name || ''}
                      onChange={(e) => updateRouting(section.name, e.target.value)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                    >
                      {printers.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

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

export default StepPrinters;
