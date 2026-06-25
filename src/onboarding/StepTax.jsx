import React from 'react';
import { Receipt, Percent, ToggleLeft, ToggleRight } from 'lucide-react';

const GST_CATEGORIES = [
  { value: 'NON_AC', label: 'Non-AC / Standalone', rate: '5%', desc: 'Most Indian restaurants' },
  { value: 'AC', label: 'AC Restaurant', rate: '18%', desc: 'If alcohol is served or AC is available' },
  { value: 'TAKEAWAY', label: 'Takeaway / Parcel only', rate: '5%', desc: 'No service charge' },
];

const StepTax = ({ data, onChange, onNext, onBack }) => {
  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const isValid = true; // All fields have sensible defaults

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Receipt size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">GST & Tax Setup</h2>
        <p className="text-gray-500">Configure how tax is applied to your bills</p>
      </div>

      {/* GST Registered Toggle */}
      <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Are you GST registered?</p>
          <p className="text-xs text-gray-500">If not, no GST will be shown on bills</p>
        </div>
        <button
          type="button"
          onClick={() => handleChange('gstRegistered', !data.gstRegistered)}
          className="flex items-center gap-2"
        >
          {data.gstRegistered ? (
            <ToggleRight size={32} className="text-[#E53935]" />
          ) : (
            <ToggleLeft size={32} className="text-gray-400" />
          )}
        </button>
      </div>

      {data.gstRegistered && (
        <>
          {/* GST Category */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Restaurant category for GST</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GST_CATEGORIES.map(cat => {
                const selected = data.gstCategory === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => handleChange('gstCategory', cat.value)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selected
                        ? 'border-[#E53935] bg-[#FFF5F5]'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold ${selected ? 'text-[#E53935]' : 'text-gray-900'}`}>
                        {cat.label}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selected ? 'bg-[#E53935] text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {cat.rate}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{cat.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price type */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Are prices inclusive or exclusive of GST?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleChange('pricesIncludeGst', false)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  !data.pricesIncludeGst
                    ? 'border-[#E53935] bg-[#FFF5F5]'
                    : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-semibold ${!data.pricesIncludeGst ? 'text-[#E53935]' : 'text-gray-900'}`}>
                  Exclusive
                </p>
                <p className="text-xs text-gray-500 mt-1">GST is added on top at billing</p>
              </button>
              <button
                type="button"
                onClick={() => handleChange('pricesIncludeGst', true)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  data.pricesIncludeGst
                    ? 'border-[#E53935] bg-[#FFF5F5]'
                    : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-semibold ${data.pricesIncludeGst ? 'text-[#E53935]' : 'text-gray-900'}`}>
                  Inclusive
                </p>
                <p className="text-xs text-gray-500 mt-1">GST is already included in menu prices</p>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Service Charge */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Percent size={16} className="text-gray-500" />
            <p className="text-sm font-semibold text-gray-700">Service charge?</p>
          </div>
          <button
            type="button"
            onClick={() => handleChange('serviceChargePercent', data.serviceChargePercent > 0 ? 0 : 5)}
            className="flex items-center gap-2"
          >
            {data.serviceChargePercent > 0 ? (
              <ToggleRight size={32} className="text-[#E53935]" />
            ) : (
              <ToggleLeft size={32} className="text-gray-400" />
            )}
          </button>
        </div>
        {data.serviceChargePercent > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Service charge %</label>
            <input
              type="number"
              value={data.serviceChargePercent}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                handleChange('serviceChargePercent', Math.min(20, Math.max(0, val)));
              }}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
              min="0"
              max="20"
              step="0.5"
            />
          </div>
        )}
        <p className="text-xs text-gray-400">
          NRAI guidelines — service charge is optional and must be disclosed.
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

export default StepTax;
