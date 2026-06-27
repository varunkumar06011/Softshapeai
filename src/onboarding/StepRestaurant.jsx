import React, { useState, useRef } from 'react';
import { Building2, Phone, Mail, FileText, Layers, Utensils, Wine, Coffee, Cloud, UtensilsCrossed, Check, Send, Upload, Image as ImageIcon, AlertTriangle, X, Loader2 } from 'lucide-react';
import { apiFetch } from '../services/apiConfig';

const RESTAURANT_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in Restaurant', desc: 'Tables, food menu, KOT printing', icon: Utensils },
  { value: 'BAR_LOUNGE', label: 'Bar & Lounge', desc: 'Bar menu, bottle tracking, ML pricing', icon: Wine },
  { value: 'BAR_WITH_DINING', label: 'Bar with Dining', desc: 'Both food and bar under one roof', icon: UtensilsCrossed },
  { value: 'CAFE', label: 'Cafe', desc: 'Counter billing, no table management', icon: Coffee },
  { value: 'CLOUD_KITCHEN', label: 'Cloud Kitchen', desc: 'Online orders only, no dine-in', icon: Cloud },
];

const BAR_TYPES = ['BAR_LOUNGE', 'BAR_WITH_DINING'];

const StepRestaurant = ({ data, onChange, onNext }) => {
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const fileInputRef = useRef(null);

  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  };

  const slug = slugEdited ? (data.slug || '') : generateSlug(data.name || '');

  const gstinValid = !data.gstin || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(data.gstin || '');
  const barMlValid = !BAR_TYPES.includes(data.restaurantType) || (
    (data.barUnitMl ?? 30) > 0 && (data.halfBottleMl ?? 375) > 0 && (data.fullBottleMl ?? 750) > 0
  );
  const phoneValid = /^[0-9]{10}$/.test(data.phone || '');
  const isValid = data.name.length >= 2 && phoneValid && gstinValid && data.restaurantType && data.outletCount >= 1 && barMlValid;

  const handleSlugChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    setSlugEdited(true);
    onChange({ ...data, slug: val });
    setSlugAvailable(null);
  };

  const checkSlugAvailability = async () => {
    if (!slug || slug.length < 2) return;
    setSlugChecking(true);
    try {
      const res = await apiFetch(`/api/onboard/check-slug?slug=${encodeURIComponent(slug)}`, { method: 'GET' });
      setSlugAvailable(res.available);
    } catch {
      setSlugAvailable(null);
    } finally {
      setSlugChecking(false);
    }
  };

  const handleLogoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange({ ...data, logoPreview: ev.target.result, logoFile: file });
    };
    reader.readAsDataURL(file);
  };

  const handleTypeSelect = (typeValue) => {
    if (data.restaurantType && data.restaurantType !== typeValue) {
      setPendingType(typeValue);
      setShowTypeModal(true);
    } else {
      onChange({ ...data, restaurantType: typeValue, barUnitMl: null, halfBottleMl: null, fullBottleMl: null, deliveryPlatforms: [] });
    }
  };

  const confirmTypeChange = () => {
    onChange({
      ...data,
      restaurantType: pendingType,
      barUnitMl: null,
      halfBottleMl: null,
      fullBottleMl: null,
      deliveryPlatforms: []
    });
    setShowTypeModal(false);
    setPendingType(null);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Building2 size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Restaurant Information</h2>
        <p className="text-gray-500">Tell us about your restaurant</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Restaurant Name *
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
            placeholder="e.g., Grand Hotel"
          />
        </div>

        {data.name && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="text-sm text-gray-500">Your restaurant URL:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={slug}
                onChange={handleSlugChange}
                onBlur={checkSlugAvailability}
                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-[#E53935] font-mono text-sm focus:outline-none focus:border-[#E53935]"
                placeholder="your-restaurant"
              />
              <span className="text-gray-400 text-sm font-mono shrink-0">.softshape.app</span>
            </div>
            <div className="flex items-center gap-2">
              {slugChecking && <Loader2 size={14} className="animate-spin text-gray-400" />}
              {!slugChecking && slugAvailable === true && <span className="text-xs text-green-600">Available</span>}
              {!slugChecking && slugAvailable === false && <span className="text-xs text-red-600">Already taken</span>}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Address
          </label>
          <textarea
            rows={3}
            value={data.address}
            onChange={(e) => handleChange('address', e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 resize-none transition-all"
            placeholder="e.g., 123 Main Street, City, State, PIN"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number *
          </label>
          <div className="relative">
            <Phone size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <span className="absolute left-[2.25rem] top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 select-none pointer-events-none">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={data.phone}
              onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full pl-[5rem] pr-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
              placeholder="9876543210"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">We&apos;ll send an OTP to this number for verification</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <div className="relative">
            <Mail size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="email"
              value={data.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
              placeholder="e.g., restaurant@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            GSTIN <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="relative">
            <FileText size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={data.gstin}
              onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 uppercase transition-all"
              placeholder="e.g., 29ABCDE1234F1Z5"
              maxLength={15}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Required only if your annual turnover exceeds ₹20 lakhs</p>
          {data.gstin && !gstinValid && (
            <p className="text-xs text-red-600 mt-1">GSTIN must be 15 characters in standard format (e.g., 29ABCDE1234F1Z5)</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  onClick={() => handleTypeSelect(t.value)}
                  className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                    selected
                      ? 'border-[#E53935] bg-[#FFF5F5]'
                      : 'border-gray-200 bg-white hover:border-gray-300'
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Default pour size (ML)</label>
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
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                  placeholder="30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full bottle size (ML)</label>
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
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                  placeholder="750"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Half bottle size (ML)</label>
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
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            How many locations does your restaurant have? *
          </label>
          <div className="relative">
            <Layers size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <select
              value={data.outletCount || 1}
              onChange={(e) => handleChange('outletCount', parseInt(e.target.value))}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <option key={n} value={n}>{n} Outlet{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            If you have one restaurant, enter 1. If you have multiple branches, enter the total count.
          </p>
          {data.outletCount > 1 && (
            <p className="text-xs text-gray-400 mt-1">
              You'll configure each outlet's space and menu in a later step.
            </p>
          )}
        </div>

        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Restaurant Logo <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-gray-50 cursor-pointer hover:border-[#E53935] transition-all"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoSelect}
            />
            {data.logoPreview ? (
              <div className="flex flex-col items-center gap-3">
                <img src={data.logoPreview} alt="Logo preview" className="w-20 h-20 object-contain rounded-lg" />
                <span className="text-sm text-gray-600">{data.logoFile?.name || 'Logo selected'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ ...data, logoPreview: undefined, logoFile: undefined });
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <ImageIcon size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">Click to upload your logo</p>
                <p className="text-xs text-gray-400">Recommended: square image, max 2MB</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Type Change Confirmation Modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center">
                <AlertTriangle size={20} className="text-yellow-600" />
              </div>
              <h3 className="text-lg font-bold">Change restaurant type?</h3>
            </div>
            <p className="text-sm text-gray-500">
              This will reset space setup, staff, and menu data you&apos;ve entered so far for this restaurant type.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowTypeModal(false); setPendingType(null); }}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
              >
                Keep current type
              </button>
              <button
                onClick={confirmTypeChange}
                className="flex-1 py-2.5 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all"
              >
                Change & reset
              </button>
            </div>
          </div>
        </div>
      )}

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
