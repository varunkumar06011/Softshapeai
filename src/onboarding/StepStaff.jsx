import React from 'react';
import { Users, Plus, Trash2, Key } from 'lucide-react';

const StepStaff = ({ captains, cashiers, onChange, onNext, onBack }) => {
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

  const isValid =
    captains.every(c => c.name.length >= 2 && c.pin.length === 4 && /^\d{4}$/.test(c.pin)) &&
    cashiers.every(c => c.name.length >= 2 && c.pin.length === 4 && /^\d{4}$/.test(c.pin));

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Users size={48} className="mx-auto text-blue-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Staff Setup</h2>
        <p className="text-gray-400">Add your captains and cashiers with 4-digit PINs</p>
      </div>

      {/* Captains */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Captains</h3>
          <button
            onClick={addCaptain}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
          >
            <Plus size={16} />
            Add Captain
          </button>
        </div>
        {captains.map((captain, index) => (
          <div key={index} className="bg-gray-700/50 rounded-xl p- space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={captain.name}
                  onChange={(e) => handleCaptainChange(index, 'name', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                  placeholder="Captain name"
                />
              </div>
              {captains.length > 1 && (
                <button
                  onClick={() => removeCaptain(index)}
                  className="p-2 text-red-400 hover:text-red-300"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="relative">
              <Key size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={captain.pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  handleCaptainChange(index, 'pin', value);
                }}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                placeholder="4-digit PIN"
                maxLength={4}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Cashiers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Cashiers</h3>
          <button
            onClick={addCashier}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
          >
            <Plus size={16} />
            Add Cashier
          </button>
        </div>
        {cashiers.map((cashier, index) => (
          <div key={index} className="bg-gray-700/50 rounded-xl p- space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={cashier.name}
                  onChange={(e) => handleCashierChange(index, 'name', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                  placeholder="Cashier name"
                />
              </div>
              {cashiers.length > 1 && (
                <button
                  onClick={() => removeCashier(index)}
                  className="p-2 text-red-400 hover:text-red-300"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="relative">
              <Key size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={cashier.pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  handleCashierChange(index, 'pin', value);
                }}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                placeholder="4-digit PIN"
                maxLength={4}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
        <p className="text-sm text-blue-300">
          <strong>Note:</strong> Staff will use these 4-digit PINs to login. Make sure to write them down.
        </p>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            isValid
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default StepStaff;
