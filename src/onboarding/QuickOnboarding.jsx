// ─────────────────────────────────────────────────────────────────────────────
// QuickOnboarding — 4-step offline-first onboarding wizard
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the 13-step OnboardingWizard with a fast flow:
//   1. Restaurant basics + owner account (name, type, phone, PIN)
//   2. Menu template selection (from JSON templates)
//   3. Table count (simple number input)
//   4. Printer auto-detect (via Tauri list_printers command)
//
// All steps write to the edge server's local SQLite via POST /api/edge/onboard.
// No network call blocks any step. Cloud sync happens in the background.
//
// Auth path: Path A (Phase 0.4) — Firebase OTP stays for owner account creation
// when online. Local PIN is the device-unlock layer. When offline, the owner
// sets a PIN that works locally; phone verification is deferred.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { isEdgeAvailable, edgeFetch, getEdgeUrl, resetEdgeCache } from '../services/edgeHealth.js';
import { ChevronLeft, ChevronRight, Check, Store, Utensils, LayoutGrid, Printer, Loader2, Wine, Coffee, Cloud, UtensilsCrossed } from 'lucide-react';

// Menu templates — imported as raw JSON via Vite's ?raw suffix
import dineInVeg from './templates/dine-in-veg.json';
import dineInNonVeg from './templates/dine-in-nonveg.json';
import barTemplate from './templates/bar.json';
import cafeTemplate from './templates/cafe.json';
import cloudKitchen from './templates/cloud-kitchen.json';
import genericTemplate from './templates/generic.json';

const MENU_TEMPLATES = [
  dineInVeg,
  dineInNonVeg,
  barTemplate,
  cafeTemplate,
  cloudKitchen,
  genericTemplate,
];

const RESTAURANT_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in Restaurant', desc: 'Tables, food menu, KOT printing', icon: Utensils },
  { value: 'BAR_LOUNGE', label: 'Bar & Lounge', desc: 'Bar menu, bottle tracking, ML pricing', icon: Wine },
  { value: 'BAR_WITH_DINING', label: 'Bar with Dining', desc: 'Both food and bar under one roof', icon: UtensilsCrossed },
  { value: 'CAFE', label: 'Cafe', desc: 'Counter billing, no table management', icon: Coffee },
  { value: 'CLOUD_KITCHEN', label: 'Cloud Kitchen', desc: 'Online orders only, no dine-in', icon: Cloud },
];

const STEPS = [
  { id: 'basics', title: 'Restaurant Basics', icon: Store },
  { id: 'menu', title: 'Menu Template', icon: Utensils },
  { id: 'tables', title: 'Tables', icon: LayoutGrid },
  { id: 'printers', title: 'Printers', icon: Printer },
];

const QuickOnboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantType, setRestaurantType] = useState('DINE_IN');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [tableCount, setTableCount] = useState(10);
  const [printers, setPrinters] = useState([]);
  const [printerMapping, setPrinterMapping] = useState({ kitchen: null, bill: null, bar: null });

  const canProceed = useCallback(() => {
    if (step === 0) return restaurantName.trim() && ownerName.trim() && ownerPin.length >= 4;
    if (step === 1) return selectedTemplate !== null;
    if (step === 2) return tableCount > 0;
    if (step === 3) return true; // printers are optional
    return false;
  }, [step, restaurantName, ownerName, ownerPin, selectedTemplate, tableCount]);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  const detectPrinters = useCallback(async () => {
    // Tauri desktop: use list_printers command
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
      try {
        const result = await window.__TAURI__.core.invoke('list_printers');
        if (Array.isArray(result)) {
          setPrinters(result.map(p => typeof p === 'string' ? p : p.name));
        }
      } catch (err) {
        console.warn('[Onboarding] Printer detection failed:', err);
      }
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    const template = MENU_TEMPLATES.find(t => t.id === selectedTemplate) || genericTemplate;

    const payload = {
      restaurantName,
      restaurantType,
      owner: { name: ownerName, phone: ownerPhone, pin: ownerPin },
      menuTemplate: template,
      tableCount,
      printerMapping,
    };

    try {
      if (!(window.__TAURI__ || window.__TAURI_INTERNALS__)) {
        throw new Error(
          'New Restaurant setup must be opened inside the SoftShape Cashier desktop app. ' +
          'Use the installed Cashier application, not a browser tab.'
        );
      }

      // Edge server is the only path — it creates local SQLite records and
      // enqueues them for cloud sync. Cloud registration happens automatically
      // via POST /api/edge/register-offline when connectivity returns.
      resetEdgeCache();
      if (await isEdgeAvailable()) {
        const result = await edgeFetch('/api/edge/onboard', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (result.success !== false) {
          navigate('/cashier');
          return;
        }
        throw new Error(result.error || 'Onboarding failed');
      }

      // No edge server — can't onboard offline without it
      setError(
        'Edge server is not running on this device. ' +
        'Make sure you are using the SoftShape Cashier desktop app (not a browser) ' +
        'and that no other application is using port 3100 (e.g. the old Print Agent). ' +
        'Restart the Cashier app and try again.'
      );
      setSubmitting(false);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }, [restaurantName, restaurantType, ownerName, ownerPhone, ownerPin, selectedTemplate, tableCount, printerMapping, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 to-orange-500 text-white px-8 py-6">
          <h1 className="text-2xl font-bold">Welcome to SoftShape</h1>
          <p className="text-rose-100 text-sm mt-1">Get billing in 10 minutes — works offline</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-8 py-4 border-b">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <React.Fragment key={s.id}>
                <div className={`flex items-center gap-2 ${isActive ? 'text-rose-600' : isDone ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-rose-600 text-white' : isDone ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
                    {isDone ? <Check size={16} /> : <Icon size={16} />}
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">{s.title}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${isDone ? 'bg-green-600' : 'bg-gray-200'}`} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step content */}
        <div className="p-8 min-h-[300px]">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="basics" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-xl font-semibold mb-4">Tell us about your restaurant</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name *</label>
                    <input
                      type="text"
                      value={restaurantName}
                      onChange={e => setRestaurantName(e.target.value)}
                      placeholder="e.g. Spice Garden"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Type *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {RESTAURANT_TYPES.map(t => {
                        const Icon = t.icon;
                        const selected = restaurantType === t.value;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setRestaurantType(t.value)}
                            className={`relative flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                              selected ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-rose-300'
                            }`}
                          >
                            {selected && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-rose-600 rounded-full flex items-center justify-center">
                                <Check size={12} className="text-white" />
                              </div>
                            )}
                            <Icon size={24} className={selected ? 'text-rose-600' : 'text-gray-400'} />
                            <div>
                              <p className={`font-semibold text-sm ${selected ? 'text-rose-600' : 'text-gray-900'}`}>{t.label}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                      <input
                        type="text"
                        value={ownerName}
                        onChange={e => setOwnerName(e.target.value)}
                        placeholder="Owner name"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                      <input
                        type="tel"
                        value={ownerPhone}
                        onChange={e => setOwnerPhone(e.target.value)}
                        placeholder="+91..."
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Device PIN (4 digits) *</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={ownerPin}
                      onChange={e => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 1234"
                      className="w-32 px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-rose-500 focus:border-transparent text-center text-lg tracking-widest"
                    />
                    <p className="text-xs text-gray-500 mt-1">Used to unlock the app on this device</p>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="menu" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-xl font-semibold mb-4">Choose a menu template</h2>
                <p className="text-sm text-gray-500 mb-4">Pick the closest match — you can customize everything later</p>
                <div className="grid grid-cols-2 gap-3">
                  {MENU_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`text-left p-4 rounded-lg border-2 transition-all ${selectedTemplate === t.id ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-rose-300'}`}
                    >
                      <div className="font-semibold text-gray-800">{t.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.description}</div>
                      <div className="text-xs text-gray-400 mt-2">{t.categories.length} categories, {t.categories.reduce((n, c) => n + c.items.length, 0)} items</div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="tables" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-xl font-semibold mb-4">How many tables?</h2>
                <p className="text-sm text-gray-500 mb-4">We'll create them automatically — you can rename and reorganize later</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setTableCount(Math.max(1, tableCount - 1))}
                    className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-xl font-bold"
                  >−</button>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={tableCount}
                    onChange={e => setTableCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    className="w-20 text-center text-2xl font-bold px-2 py-2 rounded-lg border border-gray-300"
                  />
                  <button
                    onClick={() => setTableCount(Math.min(100, tableCount + 1))}
                    className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-xl font-bold"
                  >+</button>
                </div>
                <div className="mt-6 grid grid-cols-10 gap-2">
                  {Array.from({ length: Math.min(tableCount, 30) }, (_, i) => (
                    <div key={i} className="aspect-square bg-rose-100 rounded-lg flex items-center justify-center text-sm font-medium text-rose-700">
                      {i + 1}
                    </div>
                  ))}
                  {tableCount > 30 && <div className="col-span-10 text-center text-gray-400 text-sm">+ {tableCount - 30} more</div>}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="printers" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-xl font-semibold mb-4">Printer Setup</h2>
                <p className="text-sm text-gray-500 mb-4">Auto-detect connected printers — or skip and configure later</p>
                <button
                  onClick={detectPrinters}
                  className="px-4 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium mb-4"
                >
                  Detect Printers
                </button>
                {printers.length > 0 ? (
                  <div className="space-y-3">
                    {['kitchen', 'bill', 'bar'].map(role => (
                      <div key={role}>
                        <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{role} Printer</label>
                        <select
                          value={printerMapping[role] || ''}
                          onChange={e => setPrinterMapping({ ...printerMapping, [role]: e.target.value || null })}
                          className="w-full px-4 py-2 rounded-lg border border-gray-300"
                        >
                          <option value="">— None —</option>
                          {printers.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 py-8 text-center">
                    {window.__TAURI__ ? 'Click "Detect Printers" to scan for connected printers' : 'Printer detection is available on the desktop app. You can configure printers later from Settings.'}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t bg-gray-50">
          <button
            onClick={handleBack}
            disabled={step === 0 || submitting}
            className="flex items-center gap-1 px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-30"
          >
            <ChevronLeft size={18} /> Back
          </button>
          <div className="text-sm text-gray-400">Step {step + 1} of {STEPS.length}</div>
          <button
            onClick={handleNext}
            disabled={!canProceed() || submitting}
            className="flex items-center gap-1 px-6 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-30 font-medium"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : step === STEPS.length - 1 ? <Check size={18} /> : null}
            {submitting ? 'Setting up...' : step === STEPS.length - 1 ? 'Finish' : 'Next'}
            {!submitting && step < STEPS.length - 1 && <ChevronRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickOnboarding;
