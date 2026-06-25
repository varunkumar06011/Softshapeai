import React, { useEffect } from 'react';
import { Palette, FileText, Image, Check } from 'lucide-react';

const StepBranding = ({ data, restaurantName, onChange, onNext, onBack }) => {
  // Auto-fill receipt header from restaurant name if empty
  useEffect(() => {
    if (!data.receiptHeader && restaurantName) {
      onChange({ ...data, receiptHeader: restaurantName });
    }
  }, [restaurantName]);

  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const fssaiValid = !data.fssai || /^\d{14}$/.test(data.fssai);
  const isValid = (data.receiptHeader || '').trim().length >= 2 && fssaiValid;

  const themeColor = data.themePrimary || '#E53935';

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Palette size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Branding & Receipt</h2>
        <p className="text-gray-500">Set up how your restaurant appears on bills and receipts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <FileText size={16} /> Receipt Identity
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Receipt Header Line 1 *
              </label>
              <input
                type="text"
                value={data.receiptHeader || ''}
                onChange={(e) => handleChange('receiptHeader', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                placeholder={restaurantName || 'Your Restaurant Name'}
              />
              <p className="text-xs text-gray-400 mt-1">What prints at the top of every bill</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Receipt Header Line 2
              </label>
              <input
                type="text"
                value={data.receiptSubHeader || ''}
                onChange={(e) => handleChange('receiptSubHeader', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                placeholder="e.g., Fine Dining Experience | Hyderabad"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                FSSAI Number
              </label>
              <input
                type="text"
                value={data.fssai || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 14);
                  handleChange('fssai', val);
                }}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                placeholder="14-digit FSSAI license number"
                maxLength={14}
              />
              {data.fssai && !fssaiValid && (
                <p className="text-xs text-red-600 mt-1">FSSAI must be exactly 14 digits</p>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Palette size={16} /> Branding
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Primary Brand Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => handleChange('themePrimary', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                />
                <span className="text-sm text-gray-700 font-mono">{themeColor}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Logo URL
              </label>
              <div className="relative">
                <Image size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={data.logoUrl || ''}
                  onChange={(e) => handleChange('logoUrl', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900"
                  placeholder="https://..."
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">You can upload a logo from Admin Settings after setup</p>
            </div>
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

        {/* Live Receipt Preview */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Live Receipt Preview</p>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 max-w-xs mx-auto">
              <div className="text-center border-b-2 border-dashed border-gray-300 pb-2 mb-2">
                <div className="font-bold uppercase text-sm">{data.receiptHeader || restaurantName || 'Your Restaurant'}</div>
                {data.receiptSubHeader && (
                  <div className="text-gray-500 text-xs mt-0.5">{data.receiptSubHeader}</div>
                )}
              </div>
              <div className="flex justify-between mb-2 text-xs text-gray-500">
                <span>Table 1 | 2 covers</span>
                <span>25/06/2026</span>
              </div>
              <div className="border-t-2 border-dashed border-gray-300 pt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Paneer Butter Masala x1</span>
                  <span>₹280</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Naan x2</span>
                  <span>₹60</span>
                </div>
              </div>
              <div className="border-t-2 border-dashed border-gray-300 mt-2 pt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Subtotal</span>
                  <span>₹340</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>CGST 2.5%</span>
                  <span>₹8.50</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>SGST 2.5%</span>
                  <span>₹8.50</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-dashed border-gray-300 pt-1">
                  <span>Total</span>
                  <span>₹357</span>
                </div>
              </div>
              <div className="border-t-2 border-dashed border-gray-300 mt-2 pt-2 text-center text-gray-500 text-xs">
                Thank you! Visit again.
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">
            This preview updates as you type above
          </p>
        </div>
      </div>
    </div>
  );
};

export default StepBranding;
