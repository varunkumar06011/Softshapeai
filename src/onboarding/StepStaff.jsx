import React, { useState } from 'react';
import { Users, Plus, Trash2, Key } from 'lucide-react';

const StepStaff = ({ captains, cashiers, onChange, onNext, onBack }) => {
  const [errors, setErrors] = useState({ captains: [], cashiers: [] });

  const handleCaptainChange = (index, field, value) => {
    const newCaptains = [...captains];
    newCaptains[index] = { ...newCaptains[index], [field]: value };
    onChange(newCaptains, cashiers);
    
    if (errors.captains[index]?.[field]) {
      const newErrors = { ...errors };
      newErrors.captains[index] = { ...newErrors.captains[index], [field]: null };
      setErrors(newErrors);
    }
  };

  const handleCashierChange = (index, field, value) => {
    const newCashiers = [...cashiers];
    newCashiers[index] = { ...newCashiers[index], [field]: value };
    onChange(captains, newCashiers);
    
    if (errors.cashiers[index]?.[field]) {
      const newErrors = { ...errors };
      newErrors.cashiers[index] = { ...newErrors.cashiers[index], [field]: null };
      setErrors(newErrors);
    }
  };

  const addCaptain = () => {
    onChange([...captains, { name: '', pin: '' }], cashiers);
  };

  const removeCaptain = (index) => {
    if (captains.length > 1) {
      onChange(captains.filter((_, i) => i !== index), cashiers);
    }
  };

  const addCashier = () => {
    onChange(captains, [...cashiers, { name: '', pin: '' }]);
  };

  const removeCashier = (index) => {
    if (cashiers.length > 1) {
      onChange(captains, cashiers.filter((_, i) => i !== index));
    }
  };

  const validate = () => {
    let isValid = true;
    const newErrors = { captains: [], cashiers: [] };

    captains.forEach((c, i) => {
      const e = {};
      if (!c.name || c.name.length < 2) { e.name = "Name ≥ 2 chars"; isValid = false; }
      if (!c.pin || c.pin.length !== 4) { e.pin = "4 digits"; isValid = false; }
      newErrors.captains[i] = e;
    });

    cashiers.forEach((c, i) => {
      const e = {};
      if (!c.name || c.name.length < 2) { e.name = "Name ≥ 2 chars"; isValid = false; }
      if (!c.pin || c.pin.length !== 4) { e.pin = "4 digits"; isValid = false; }
      newErrors.cashiers[i] = e;
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleContinue = () => {
    if (validate()) {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Users size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Staff Setup</h2>
        <p className="text-gray-500">Add your captains and cashiers with 4-digit PINs</p>
      </div>

      {/* Captains */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Captains</h3>
          <button
            onClick={addCaptain}
            className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C]"
          >
            <Plus size={16} />
            Add Captain
          </button>
        </div>
        {captains.map((captain, index) => (
          <div key={index} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={captain.name}
                  onChange={(e) => handleCaptainChange(index, 'name', e.target.value)}
                  className={`w-full px-4 py-2 bg-gray-50 border rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 ${errors.captains[index]?.name ? 'border-red-500' : 'border-gray-100'}`}
                  placeholder="Captain name"
                />
                {errors.captains[index]?.name && <p className="text-red-400 text-xs mt-1">{errors.captains[index].name}</p>}
              </div>
              {captains.length > 1 && (
                <button
                  onClick={() => removeCaptain(index)}
                  className="p-2 text-red-600 hover:text-red-500"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="relative">
              <Key size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={captain.pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  handleCaptainChange(index, 'pin', value);
                }}
                className={`w-full pl-10 pr-4 py-2 bg-gray-50 border rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 ${errors.captains[index]?.pin ? 'border-red-500' : 'border-gray-100'}`}
                placeholder="4-digit PIN"
                maxLength={4}
              />
            </div>
            {errors.captains[index]?.pin && <p className="text-red-400 text-xs mt-1">{errors.captains[index].pin}</p>}
          </div>
        ))}
      </div>

      {/* Cashiers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Cashiers</h3>
          <button
            onClick={addCashier}
            className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C]"
          >
            <Plus size={16} />
            Add Cashier
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
                  className={`w-full px-4 py-2 bg-gray-50 border rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 ${errors.cashiers[index]?.name ? 'border-red-500' : 'border-gray-100'}`}
                  placeholder="Cashier name"
                />
                {errors.cashiers[index]?.name && <p className="text-red-400 text-xs mt-1">{errors.cashiers[index].name}</p>}
              </div>
              {cashiers.length > 1 && (
                <button
                  onClick={() => removeCashier(index)}
                  className="p-2 text-red-600 hover:text-red-500"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="relative">
              <Key size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={cashier.pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  handleCashierChange(index, 'pin', value);
                }}
                className={`w-full pl-10 pr-4 py-2 bg-gray-50 border rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 ${errors.cashiers[index]?.pin ? 'border-red-500' : 'border-gray-100'}`}
                placeholder="4-digit PIN"
                maxLength={4}
              />
            </div>
            {errors.cashiers[index]?.pin && <p className="text-red-400 text-xs mt-1">{errors.cashiers[index].pin}</p>}
          </div>
        ))}
      </div>

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
          onClick={handleContinue}
          className="flex-1 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default StepStaff;
