import React from 'react';
import { Building2, Globe, Phone, Mail, FileText } from 'lucide-react';

const StepRestaurant = ({ data, onChange, onNext }) => {
  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  };

  const slug = generateSlug(data.name || '');

  const isValid = data.name.length >= 2 && data.phone.length >= 10;

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
            GSTIN
          </label>
          <div className="relative">
            <FileText size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={data.gstin}
              onChange={(e) => handleChange('gstin', e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:border-[#E53935] text-gray-900"
              placeholder="e.g., 29ABCDE1234F1Z5"
            />
          </div>
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
