// ─────────────────────────────────────────────────────────────────────────────
// StepPrinters — Printer configuration for KOT and bill printing (Step 8)
// ─────────────────────────────────────────────────────────────────────────────
// Configures thermal printers for the restaurant:
//   - Add/remove printers with name, paper width (58mm/80mm), type
//   - Printer types: Kitchen (KOT), Bar (bar KOT), Bill (receipts), All-in-One
//   - Default printer set based on restaurant type (Cloud Kitchen → kitchen only)
//   - Print preview with sample KOT format
//
// Printer setup is completed later in PrinterSettingsPage (admin) with
// QZ Tray connection or Windows Print Agent pairing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from 'react';
import { Printer, Plus, Trash2, Monitor, X, ArrowRight, AlertTriangle, CheckCircle, FileText } from 'lucide-react';

// Supported paper widths for thermal printers
const PAPER_WIDTHS = ['58mm', '80mm'];
// Printer type options with descriptions
const PRINTER_TYPES = [
  { value: 'KITCHEN', label: 'Kitchen Printer (prints order tickets)' },
  { value: 'BAR', label: 'Bar Printer (prints bar order tickets)' },
  { value: 'BILL', label: 'Bill Printer (prints customer bills)' },
  { value: 'ALL', label: 'All-in-One Printer' },
];

const getDefaultPrinters = (restaurantType) => {
  if (restaurantType === 'CLOUD_KITCHEN') {
    return [{ name: 'Kitchen Printer', paperWidth: '80mm', type: 'KITCHEN' }];
  }
  // CAFE and all others
  return [
    { name: 'Kitchen Printer', paperWidth: '80mm', type: 'KITCHEN' },
    { name: 'Bill Printer', paperWidth: '80mm', type: 'BILL' },
  ];
};

const PRESET_NAMES = ['Kitchen Printer', 'Bar Printer', 'Bill Printer', 'Counter KOT'];

const StepPrinters = ({ restaurantType, printers, sectionRouting, sectionsData, onChange, onNext, onBack }) => {
  const [printingMode, setPrintingMode] = useState(printers.length > 0 ? 'qz' : 'none');
  const [showTestModal, setShowTestModal] = useState(false);
  const [testPrinter, setTestPrinter] = useState(null);
  const savedPrintersRef = useRef(printers);
  const savedRoutingRef = useRef(sectionRouting);

  const handleModeChange = (mode) => {
    setPrintingMode(mode);
    if (mode === 'none') {
      savedPrintersRef.current = printers;
      savedRoutingRef.current = sectionRouting;
      onChange([], {});
    } else if (printers.length === 0) {
      const restored = savedPrintersRef.current.length > 0
        ? savedPrintersRef.current
        : getDefaultPrinters(restaurantType);
      onChange(restored, savedRoutingRef.current);
    }
  };

  const updatePrinter = (index, field, value) => {
    const next = printers.map((p, i) => (i === index ? { ...p, [field]: value } : p));
    onChange(next, sectionRouting);
  };

  const setPresetName = (index, preset) => {
    if (preset === 'custom') {
      updatePrinter(index, 'name', '');
    } else {
      updatePrinter(index, 'name', preset);
    }
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
        <p className="text-gray-500">Set up printers for order tickets and bills</p>
      </div>

      {/* Printer connected? */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700">Do you have a printer connected?</p>
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
                  Yes, I have a printer
                </p>
                <p className="text-xs text-gray-500">Configure printers for order tickets and bills</p>
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
                  No, skip for now
                </p>
                <p className="text-xs text-gray-500">Orders will be sent digitally to the Captain app</p>
              </div>
            </div>
          </button>
        </div>
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
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {PRESET_NAMES.map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setPresetName(index, preset)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            printer.name === preset
                              ? 'bg-[#E53935] text-white'
                              : 'bg-white border border-gray-200 text-gray-600 hover:border-[#E53935]'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPresetName(index, 'custom')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          printer.name && !PRESET_NAMES.includes(printer.name)
                            ? 'bg-[#E53935] text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-[#E53935]'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                    {(!printer.name || !PRESET_NAMES.includes(printer.name)) && (
                      <input
                        type="text"
                        value={printer.name}
                        onChange={(e) => updatePrinter(index, 'name', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                        placeholder="Enter custom printer name"
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => { setTestPrinter(printer); setShowTestModal(true); }}
                      className="text-xs text-[#E53935] hover:text-[#B71C1C] font-medium"
                      disabled={!printer.name}
                    >
                      Test
                    </button>
                    {printers.length > 1 && (
                      <button
                        onClick={() => removePrinter(index)}
                        className="p-1 text-red-600 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
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
                {sectionsData.map((section, idx) => {
                  const assigned = sectionRouting[section.name] || printers[0]?.name || '';
                  const hasName = section.name && section.name.trim().length > 0;
                  return (
                    <div key={idx} className="flex items-center justify-between">
                      <span className={`text-sm ${hasName ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                        {hasName ? section.name : 'Unnamed Section'}
                      </span>
                      <div className="flex items-center gap-2">
                        {!sectionRouting[section.name] && (
                          <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">Not assigned</span>
                        )}
                        <select
                          value={assigned}
                          onChange={(e) => updateRouting(section.name, e.target.value)}
                          className="px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                        >
                          {printers.map(p => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Print Flow Diagram */}
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Print Flow</p>
                <div className="space-y-2">
                  {sectionsData.map((section, idx) => {
                    const assigned = sectionRouting[section.name] || printers[0]?.name || '—';
                    const hasName = section.name && section.name.trim().length > 0;
                    return (
                      <div key={idx} className="flex items-center gap-3 text-sm">
                        <div className={`flex-1 px-3 py-2 rounded-lg border ${hasName ? 'bg-gray-50 border-gray-100 text-gray-700' : 'bg-gray-50 border-gray-100 text-gray-400 italic'}`}>
                          {hasName ? section.name : 'Unnamed Section'}
                        </div>
                        <ArrowRight size={16} className="text-gray-300 shrink-0" />
                        <div className="flex-1 px-3 py-2 rounded-lg bg-[#FFF5F5] border border-[#E53935]/20 text-[#E53935] font-medium">
                          {assigned}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {printingMode === 'none' && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm text-blue-800 font-medium mb-1">Digital KOT mode</p>
          <p className="text-xs text-blue-600">Orders will be sent to the Captain app as digital KOTs. You can add printers later from Settings.</p>
        </div>
      )}

      {/* Test Print Modal */}
      {showTestModal && testPrinter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Test Print — {testPrinter.name}</h3>
              <button onClick={() => setShowTestModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 font-mono text-xs text-gray-600 space-y-1 border border-gray-100">
              <p className="font-bold text-center border-b border-gray-200 pb-1">SAMPLE KOT</p>
              <p>Table: T1</p>
              <p>Captain: Ravi</p>
              <p>Time: {new Date().toLocaleTimeString()}</p>
              <p className="border-t border-gray-200 pt-1">1 x Paneer Tikka</p>
              <p>1 x Butter Naan</p>
              <p className="border-t border-gray-200 pt-1 text-center">--- KOT END ---</p>
            </div>
            <p className="text-xs text-gray-500">In a real setup, this would print to {testPrinter.name}.</p>
            <button
              onClick={() => setShowTestModal(false)}
              className="w-full py-2.5 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all"
            >
              Close
            </button>
          </div>
        </div>
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
