import React from 'react';
import { Users, Plus, Trash2, Key, Clock } from 'lucide-react';

const SHIFTS = ['Morning', 'Evening', 'Night', 'Full Day'];

const StepStaff = ({ restaurantType, captains, cashiers, onChange, onNext, onBack }) => {
  const isCloud = restaurantType === 'CLOUD_KITCHEN';
  const isCafe = restaurantType === 'CAFE';
  const showCaptains = !isCloud;

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
    onChange([...captains, { name: '', pin: '', role: 'CAPTAIN', shift: 'Full Day' }], cashiers);
  };

  const removeCaptain = (index) => {
    if (captains.length > 1) {
      onChange(captains.filter((_, i) => i !== index), cashiers);
    }
  };

  const addCashier = () => {
    onChange(captains, [...cashiers, { name: '', pin: '', shift: 'Full Day' }]);
  };

  const removeCashier = (index) => {
    if (cashiers.length > 1) {
      onChange(captains, cashiers.filter((_, i) => i !== index));
    }
  };

  const captainsValid = isCafe || captains.every(c => c.name.length >= 2 && c.pin.length === 4 && /^\d{4}$/.test(c.pin));
  const cashiersValid = cashiers.every(c => c.name.length >= 2 && c.pin.length === 4 && /^\d{4}$/.test(c.pin));
  const isValid = captainsValid && cashiersValid;

  const cashierLabel = isCloud ? 'Order Managers' : 'Cashiers';

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Users size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Staff Setup</h2>
        <p className="text-gray-500">
          {isCloud ? 'Add your order managers with 4-digit PINs' : 'Add your captains and cashiers with 4-digit PINs'}
        </p>
      </div>

      {/* Captains */}
      {showCaptains && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Captains {isCafe && <span className="text-sm font-normal text-gray-500">(Optional)</span>}
            </h3>
            <button
              onClick={addCaptain}
              className="flex items-center gap-2 text-sm text-[#E53935] hover:text-[#B71C1C]"
            >
              <Plus size={16} /> Add Captain
            </button>
          </div>
          {isCafe && (
            <p className="text-xs text-gray-500 -mt-2">Optional for cafes — add counter staff if needed.</p>
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
                    placeholder="Captain name"
                  />
                </div>
                {captains.length > 1 && (
                  <button onClick={() => removeCaptain(index)} className="p-2 text-red-600 hover:text-red-500">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Key size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={captain.pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                      handleCaptainChange(index, 'pin', value);
                    }}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                    placeholder="4-digit PIN"
                    maxLength={4}
                  />
                </div>
                <select
                  value={captain.role || 'CAPTAIN'}
                  onChange={(e) => handleCaptainChange(index, 'role', e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] text-gray-900"
                >
                  <option value="CAPTAIN">Captain</option>
                  <option value="MANAGER">Manager</option>
                </select>
                <select
                  value={captain.shift || 'Full Day'}
                  onChange={(e) => handleCaptainChange(index, 'shift', e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] text-gray-900"
                >
                  {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
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
                  type="text"
                  value={cashier.pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                    handleCashierChange(index, 'pin', value);
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                  placeholder="4-digit PIN"
                  maxLength={4}
                />
              </div>
              <select
                value={cashier.shift || 'Full Day'}
                onChange={(e) => handleCashierChange(index, 'shift', e.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E53935] text-gray-900"
              >
                {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
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
