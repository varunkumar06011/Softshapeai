import React, { useState } from 'react';
import { Users, Plus, Trash2, Key, Clock, Eye, EyeOff, Copy, Check } from 'lucide-react';

const SHIFTS = ['Morning', 'Evening', 'Night', 'Full Day'];

const StepStaff = ({ restaurantType, captains, cashiers, venues, onChange, onNext, onBack }) => {
  const isCloud = restaurantType === 'CLOUD_KITCHEN';
  const isCafe = restaurantType === 'CAFE';
  const captainLabel = isCloud || isCafe ? 'Order Managers' : 'Captains';
  const cashierLabel = isCloud ? 'Order Managers' : 'Cashiers';

  const [showPinMap, setShowPinMap] = useState({});
  const [sameShift, setSameShift] = useState(true);
  const [copied, setCopied] = useState(false);
  const [captainsExpanded, setCaptainsExpanded] = useState(() => {
    const hasReal = captains.some(c => c.name.trim() || c.pin.trim());
    return hasReal;
  });

  const togglePin = (key) => {
    setShowPinMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCaptainChange = (index, field, value) => {
    const newCaptains = [...captains];
    newCaptains[index] = { ...newCaptains[index], [field]: value };
    onChange(newCaptains, cashiers);
  };

  const handleCashierChange = (index, field, value) => {
    const newCashiers = [...cashiers];
    newCashiers[index] = { ...newCashiers[index], [field]: value };
    onChange(captains, newCashiers);
  };

  const addCaptain = () => {
    setCaptainsExpanded(true);
    onChange([...captains, { name: '', pin: '', role: 'CAPTAIN', shift: 'Full Day', venueName: '' }], cashiers);
  };

  const removeCaptain = (index) => {
    if (captains.length > 1 || (isCafe || isCloud)) {
      onChange(captains.filter((_, i) => i !== index), cashiers);
    }
  };

  const addCashier = () => {
    onChange(captains, [...cashiers, { name: '', pin: '', shift: 'Full Day', venueName: '' }]);
  };

  const removeCashier = (index) => {
    if (cashiers.length > 1) {
      onChange(captains, cashiers.filter((_, i) => i !== index));
    }
  };

  const generatePins = () => {
    const used = new Set();
    captains.forEach(c => { if (/^\d{4}$/.test(c.pin)) used.add(c.pin); });
    cashiers.forEach(c => { if (/^\d{4}$/.test(c.pin)) used.add(c.pin); });

    const rand = () => String(Math.floor(1000 + Math.random() * 9000));
    const next = () => { let p; do { p = rand(); } while (used.has(p)); used.add(p); return p; };

    const newCaptains = captains.map(c => c.pin ? c : { ...c, pin: next() });
    const newCashiers = cashiers.map(c => c.pin ? c : { ...c, pin: next() });
    onChange(newCaptains, newCashiers);
  };

  const copyPins = () => {
    const lines = [];
    if (captains.length > 0 && !(isCafe && captains.length === 1 && !captains[0].name)) {
      lines.push(`${captainLabel}:`);
      captains.forEach(c => { if (c.name) lines.push(`  ${c.name} — PIN: ${c.pin || '---'}`); });
    }
    lines.push(`${cashierLabel}:`);
    cashiers.forEach(c => { if (c.name) lines.push(`  ${c.name} — PIN: ${c.pin || '---'}`); });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allCaptainsOptional = (isCafe || isCloud);
  const showCaptainSection = !allCaptainsOptional || captainsExpanded;
  const captainsValid = allCaptainsOptional || captains.every(c => c.name.length >= 2 && c.pin.length === 4 && /^\d{4}$/.test(c.pin));
  const cashiersValid = cashiers.every(c => c.name.length >= 2 && c.pin.length === 4 && /^\d{4}$/.test(c.pin));
  const isValid = captainsValid && cashiersValid;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Users size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Staff Setup</h2>
        <p className="text-gray-500">
          {isCloud || isCafe ? 'Add your order managers with 4-digit PINs' : 'Add your captains and cashiers with 4-digit PINs'}
        </p>
      </div>

      {/* Auto-generate & shift collapse controls */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={sameShift}
            onChange={(e) => {
              setSameShift(e.target.checked);
              if (e.target.checked) {
                onChange(
                  captains.map(c => ({ ...c, shift: 'Full Day' })),
                  cashiers.map(c => ({ ...c, shift: 'Full Day' }))
                );
              }
            }}
            className="w-4 h-4 text-[#E53935] rounded border-gray-300"
          />
          Same shift for everyone (Full Day)
        </label>
        <button
          onClick={generatePins}
          className="text-sm text-[#E53935] hover:text-[#B71C1C] font-medium"
        >
          Auto-generate PINs
        </button>
      </div>

      {/* Captains */}
      {showCaptainSection ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {captainLabel} {allCaptainsOptional && <span className="text-sm font-normal text-gray-500">(Optional)</span>}
            </h3>
            <button
              onClick={addCaptain}
              className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C]"
            >
              <Plus size={16} /> Add {captainLabel.slice(0, -1)}
            </button>
          </div>
          {allCaptainsOptional && (
            <p className="text-xs text-gray-500 -mt-2">
              {isCloud ? 'For Cloud Kitchen, order managers handle incoming delivery orders.' : 'Optional for cafes — add counter staff if needed.'}
            </p>
          )}
          {captains.map((captain, index) => (
            <div key={index} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
              <div className="flex gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={captain.name}
                    onChange={(e) => handleCaptainChange(index, 'name', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                    placeholder={`${captainLabel.slice(0, -1)} name`}
                  />
                </div>
                {(captains.length > 1 || allCaptainsOptional) && (
                  <button onClick={() => removeCaptain(index)} className="p-2 text-red-600 hover:text-red-500">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Key size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPinMap[`c-${index}`] ? 'text' : 'password'}
                    value={captain.pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                      handleCaptainChange(index, 'pin', value);
                    }}
                    className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                    placeholder="4-digit PIN"
                    maxLength={4}
                  />
                  <span className="absolute -bottom-5 left-0 text-[10px] text-gray-400 whitespace-nowrap">Staff will use this 4-digit PIN to log in on the tablet.</span>
                  <button
                    onClick={() => togglePin(`c-${index}`)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    type="button"
                  >
                    {showPinMap[`c-${index}`] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <select
                  value={captain.role || 'CAPTAIN'}
                  onChange={(e) => handleCaptainChange(index, 'role', e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] text-gray-900"
                >
                  <option value="CAPTAIN">Captain</option>
                  <option value="MANAGER">Manager</option>
                </select>
                {venues && venues.length > 0 && (
                  <select
                    value={captain.venueName || ''}
                    onChange={(e) => handleCaptainChange(index, 'venueName', e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] text-gray-900"
                  >
                    <option value="">All Venues</option>
                    {venues.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                  </select>
                )}
                {!sameShift && (
                  <select
                    value={captain.shift || 'Full Day'}
                    onChange={(e) => handleCaptainChange(index, 'shift', e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] text-gray-900"
                  >
                    {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-100">
          <p className="text-gray-700 font-medium mb-2">No {captainLabel.toLowerCase()} needed?</p>
          <p className="text-sm text-gray-500 mb-3">You can skip this or add them later from the Admin panel.</p>
          <button
            onClick={addCaptain}
            className="inline-flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C] font-medium"
          >
            <Plus size={16} /> Add {captainLabel.slice(0, -1)}
          </button>
        </div>
      )}

      {/* Cashiers / Order Managers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{cashierLabel}</h3>
          <button
            onClick={addCashier}
            className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C]"
          >
            <Plus size={16} /> Add {cashierLabel.slice(0, -1)}
          </button>
        </div>
        {cashiers.map((cashier, index) => (
          <div key={index} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={cashier.name}
                  onChange={(e) => handleCashierChange(index, 'name', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                  placeholder={`${cashierLabel.slice(0, -1)} name`}
                />
              </div>
              {cashiers.length > 1 && (
                <button onClick={() => removeCashier(index)} className="p-2 text-red-600 hover:text-red-500">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Key size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                <input
                  type={showPinMap[`x-${index}`] ? 'text' : 'password'}
                  value={cashier.pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                    handleCashierChange(index, 'pin', value);
                  }}
                  className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                  placeholder="4-digit PIN"
                  maxLength={4}
                />
                <span className="absolute -bottom-5 left-0 text-[10px] text-gray-400 whitespace-nowrap">Staff will use this 4-digit PIN to log in on the tablet.</span>
                <button
                  onClick={() => togglePin(`x-${index}`)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  type="button"
                >
                  {showPinMap[`x-${index}`] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {venues && venues.length > 0 && (
                <select
                  value={cashier.venueName || ''}
                  onChange={(e) => handleCashierChange(index, 'venueName', e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] text-gray-900"
                >
                  <option value="">All Venues</option>
                  {venues.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              )}
              {!sameShift && (
                <select
                  value={cashier.shift || 'Full Day'}
                  onChange={(e) => handleCashierChange(index, 'shift', e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] text-gray-900"
                >
                  {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* PIN Summary Card */}
      {(captains.some(c => c.name && c.pin) || cashiers.some(c => c.name && c.pin)) && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900">PIN Summary</h4>
            <button
              onClick={copyPins}
              className="flex items-center gap-1.5 text-sm text-[#E53935] hover:text-[#B71C1C] font-medium"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy all'}
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {captains.some(c => c.name && c.pin) && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">{captainLabel}</p>
                <div className="grid grid-cols-2 gap-2">
                  {captains.filter(c => c.name && c.pin).map((c, i) => (
                    <div key={i} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-gray-700">{c.name}</span>
                      <span className="text-gray-400 mx-1">—</span>
                      <span className="font-mono text-gray-900">{c.pin}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cashiers.some(c => c.name && c.pin) && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">{cashierLabel}</p>
                <div className="grid grid-cols-2 gap-2">
                  {cashiers.filter(c => c.name && c.pin).map((c, i) => (
                    <div key={i} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-gray-700">{c.name}</span>
                      <span className="text-gray-400 mx-1">—</span>
                      <span className="font-mono text-gray-900">{c.pin}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-[#E53935]/10 border border-[#E53935]/20 rounded-lg p-3">
        <p className="text-sm text-[#E53935]">
          <strong>Note:</strong> Staff will use these 4-digit PINs to login. Make sure to write them down.
        </p>
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

export default StepStaff;
