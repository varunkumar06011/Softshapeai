import React from 'react';
import { Building2, Globe, Phone, Mail, FileText, Store, Layers } from 'lucide-react';

const RESTAURANT_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in Restaurant' },
  { value: 'BAR_LOUNGE', label: 'Bar & Lounge' },
  { value: 'CAFE', label: 'Cafe' },
  { value: 'CLOUD_KITCHEN', label: 'Cloud Kitchen' },
];

const StepRestaurant = ({ data, onChange, onNext }) => {
  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  };

  const slug = generateSlug(data.name || '');

  const gstinValid = /^[0-9A-Z]{15}$/.test(data.gstin || '');
  const isValid = data.name.length >= 2 && data.phone.length >= 10 && gstinValid && data.restaurantType && data.outletCount >= 1;

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
              value={data.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
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
            <p className="text-xs text-red-600 mt-1">GSTIN must be exactly 15 alphanumeric characters</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-2">
            Restaurant Type *
          </label>
          <div className="relative">
            <Store size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <select
              value={data.restaurantType || ''}
              onChange={(e) => handleChange('restaurantType', e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
            >
              <option value="">Select type...</option>
              {RESTAURANT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

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
