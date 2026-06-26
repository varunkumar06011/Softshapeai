import React from 'react';
import { Building2, Phone, Mail, FileText, Layers, Utensils, Wine, Coffee, Cloud, UtensilsCrossed, Check, Send } from 'lucide-react';

const RESTAURANT_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in Restaurant', desc: 'Tables, food menu, KOT printing', icon: Utensils },
  { value: 'BAR_LOUNGE', label: 'Bar & Lounge', desc: 'Bar menu, bottle tracking, ML pricing', icon: Wine },
  { value: 'BAR_WITH_DINING', label: 'Bar with Dining', desc: 'Both food and bar under one roof', icon: UtensilsCrossed },
  { value: 'CAFE', label: 'Cafe', desc: 'Counter billing, no table management', icon: Coffee },
  { value: 'CLOUD_KITCHEN', label: 'Cloud Kitchen', desc: 'Online orders only, no dine-in', icon: Cloud },
];

const BAR_TYPES = ['BAR_LOUNGE', 'BAR_WITH_DINING'];

const StepRestaurant = ({ data, onChange, onNext }) => {
  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  };

  const slug = generateSlug(data.name || '');

  const gstinValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(data.gstin || '');
  const barMlValid = !BAR_TYPES.includes(data.restaurantType) || (
    (data.barUnitMl ?? 30) > 0 && (data.halfBottleMl ?? 375) > 0 && (data.fullBottleMl ?? 750) > 0
  );
  const phoneValid = /^[0-9]{10}$/.test(data.phone || '');
  const isValid = data.name.length >= 2 && phoneValid && gstinValid && data.restaurantType && data.outletCount >= 1 && barMlValid;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Building2 size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Restaurant Information</h2>
        <p className="text-gray-500">Tell us about your restaurant</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Restaurant Name *
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
            placeholder="e.g., Grand Hotel"
          />
        </div>

        {data.name && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500">Your restaurant URL preview:</p>
            <p className="text-[#E53935] font-mono">{slug}.softshape.app</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Address
          </label>
          <input
            type="text"
            value={data.address}
            onChange={(e) => handleChange('address', e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
            placeholder="e.g., 123 Main Street, City"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Phone Number *
          </label>
          <div className="relative">
            <Phone size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={data.phone}
              onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
              placeholder="e.g., 9876543210"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Email
          </label>
          <div className="relative">
            <Mail size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="email"
              value={data.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
              placeholder="e.g., restaurant@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            GSTIN *
          </label>
          <div className="relative">
            <FileText size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={data.gstin}
              onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900 uppercase"
              placeholder="e.g., 29ABCDE1234F1Z5"
              maxLength={15}
            />
          </div>
          {data.gstin && !gstinValid && (
            <p className="text-xs text-red-600 mt-1">GSTIN must be 15 characters in standard format (e.g., 29ABCDE1234F1Z5)</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Restaurant Type *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RESTAURANT_TYPES.map(t => {
              const Icon = t.icon;
              const selected = data.restaurantType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    if (data.restaurantType !== t.value) {
                      onChange({
                        ...data,
                        restaurantType: t.value,
                        barUnitMl: null,
                        halfBottleMl: null,
                        fullBottleMl: null,
                        deliveryPlatforms: []
                      });
                    }
                  }}
                  className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                    selected
                      ? 'border-[#E53935] bg-[#FFF5F5]'
                      : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  {selected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-[#E53935] rounded-full flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                  <Icon size={24} className={selected ? 'text-[#E53935]' : 'text-gray-400'} />
                  <div>
                    <p className={`font-semibold text-sm ${selected ? 'text-[#E53935]' : 'text-gray-900'}`}>{t.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {BAR_TYPES.includes(data.restaurantType) && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Bar Configuration</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Default pour size (ML)</label>
                <input
                  type="number"
                  value={data.barUnitMl === 0 ? '' : (data.barUnitMl ?? 30)}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleChange('barUnitMl', val === '' ? 0 : Math.max(1, parseInt(val) || 1));
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      handleChange('barUnitMl', 30);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                  placeholder="30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full bottle size (ML)</label>
                <input
                  type="number"
                  value={data.fullBottleMl === 0 ? '' : (data.fullBottleMl ?? 750)}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleChange('fullBottleMl', val === '' ? 0 : Math.max(1, parseInt(val) || 1));
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      handleChange('fullBottleMl', 750);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                  placeholder="750"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Half bottle size (ML)</label>
                <input
                  type="number"
                  value={data.halfBottleMl === 0 ? '' : (data.halfBottleMl ?? 375)}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleChange('halfBottleMl', val === '' ? 0 : Math.max(1, parseInt(val) || 1));
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      handleChange('halfBottleMl', 375);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                  placeholder="375"
                />
              </div>
            </div>
          </div>
        )}

        {data.restaurantType === 'CLOUD_KITCHEN' && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Delivery Platforms</p>
            <div className="flex flex-wrap gap-4">
              {['Swiggy', 'Zomato', 'Direct Online'].map(platform => (
                <label key={platform} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(data.deliveryPlatforms || []).includes(platform)}
                    onChange={(e) => {
                      const current = data.deliveryPlatforms || [];
                      const next = e.target.checked
                        ? [...current, platform]
                        : current.filter(p => p !== platform);
                      handleChange('deliveryPlatforms', next);
                    }}
                    className="w-4 h-4 text-[#E53935] rounded border-gray-300 focus:ring-[#E53935]"
                  />
                  <span className="text-sm text-gray-700">{platform}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Number of Outlets *
          </label>
          <div className="relative">
            <Layers size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <select
              value={data.outletCount || 1}
              onChange={(e) => handleChange('outletCount', parseInt(e.target.value))}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <option key={n} value={n}>{n} Outlet{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
          {data.outletCount > 1 && (
            <p className="text-xs text-gray-400 mt-1">
              You'll configure each outlet's floor plan and menu in a later step.
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!isValid}
        className={`w-full py-3 rounded-xl font-semibold transition-all ${
          isValid
            ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        Continue
      </button>
    </div>
  );
};

export default StepRestaurant;
