import React, { useEffect, useRef } from 'react';
import { Palette, FileText, Image as ImageIcon, Upload, Check } from 'lucide-react';

const SAMPLE_ITEMS = [
  { name: 'Paneer Butter Masala', qty: 1, price: 280 },
  { name: 'Naan', qty: 2, price: 30 },
];

const StepBranding = ({ data, restaurantName, restaurantGstin, logoPreview, menu, taxConfig, onChange, onNext, onBack }) => {
  const fileInputRef = useRef(null);

  // Auto-fill receipt header from restaurant name if empty
  useEffect(() => {
    if (!data.receiptHeader && restaurantName) {
      onChange({ ...data, receiptHeader: restaurantName });
    }
  }, [restaurantName]);

  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const handleLogoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      handleChange('logoPreview', ev.target.result);
      handleChange('logoFile', file);
    };
    reader.readAsDataURL(file);
  };

  const fssaiValid = !data.fssai || /^\d{14}$/.test(data.fssai);
  const isValid = (data.receiptHeader || '').trim().length >= 2 && fssaiValid;

  // Build preview items from real menu or fallback
  const previewItems = (menu?.categories || []).flatMap(cat => cat.items || []).slice(0, 3);
  const itemsToShow = previewItems.length > 0
    ? previewItems.map(item => ({ name: item.name, qty: 1, price: item.price }))
    : SAMPLE_ITEMS;

  const subtotal = itemsToShow.reduce((sum, item) => sum + item.price * item.qty, 0);
  const gstRate = taxConfig?.gstCategory === 'AC' ? 0.18 : 0.05;
  const gstAmount = taxConfig?.pricesIncludeGst
    ? Math.round((subtotal - subtotal / (1 + gstRate)) * 100) / 100
    : Math.round(subtotal * gstRate * 100) / 100;
  const total = taxConfig?.pricesIncludeGst ? subtotal : Math.round((subtotal + gstAmount) * 100) / 100;
  const displayedSubtotal = Math.round((total - gstAmount) * 100) / 100;

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const gstLabel = taxConfig?.gstCategory === 'AC' ? 'GST 18%' : 'GST 5%';
  const cgstLabel = taxConfig?.gstCategory === 'AC' ? 'CGST 9%' : 'CGST 2.5%';
  const sgstLabel = taxConfig?.gstCategory === 'AC' ? 'SGST 9%' : 'SGST 2.5%';
  const cgstAmount = Math.round(gstAmount / 2 * 100) / 100;
  const sgstAmount = Math.round(gstAmount / 2 * 100) / 100;

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
          {/* Logo Upload */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Restaurant Logo</p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center bg-white cursor-pointer hover:border-[#E53935] transition-all"
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
              {logoPreview || data.logoPreview ? (
                <div className="flex flex-col items-center gap-2">
                  <img src={logoPreview || data.logoPreview} alt="Logo" className="w-16 h-16 object-contain rounded" />
                  <span className="text-xs text-gray-500">Click to change logo</span>
                </div>
              ) : (
                <>
                  <ImageIcon size={28} className="mx-auto text-gray-400 mb-1" />
                  <p className="text-sm text-gray-600">Upload logo</p>
                  <p className="text-xs text-gray-400">Square, max 2MB</p>
                </>
              )}
            </div>
          </div>

          {/* Theme Color */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Theme Color</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={data.themePrimary || '#E53935'}
                onChange={(e) => handleChange('themePrimary', e.target.value)}
                className="w-12 h-12 rounded-lg border border-gray-200 cursor-pointer"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{data.themePrimary || '#E53935'}</p>
                <p className="text-xs text-gray-400">Used on receipts and app theme</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <FileText size={16} /> Receipt Identity
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Receipt Header Line 1 *
              </label>
              <input
                type="text"
                value={data.receiptHeader || ''}
                onChange={(e) => handleChange('receiptHeader', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                placeholder={restaurantName || 'Your Restaurant Name'}
              />
              <p className="text-xs text-gray-400 mt-1">What prints at the top of every bill</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Receipt Header Line 2
              </label>
              <input
                type="text"
                value={data.receiptSubHeader || ''}
                onChange={(e) => handleChange('receiptSubHeader', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                placeholder="e.g., Fine Dining Experience | Hyderabad"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Receipt Footer
              </label>
              <textarea
                rows={2}
                value={data.receiptFooter || ''}
                onChange={(e) => handleChange('receiptFooter', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 resize-none transition-all"
                placeholder="Thank you! Visit again."
                maxLength={120}
              />
              <p className="text-xs text-gray-400 mt-1">{120 - (data.receiptFooter || '').length} chars remaining</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bill Prefix</label>
                <input
                  type="text"
                  value={data.billPrefix || ''}
                  onChange={(e) => handleChange('billPrefix', e.target.value.slice(0, 10).toUpperCase())}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                  placeholder="BILL-"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Starting Number</label>
                <input
                  type="number"
                  value={data.startingBillNumber || 1}
                  onChange={(e) => handleChange('startingBillNumber', Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                  min={1}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                FSSAI Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={data.fssai || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 14);
                  handleChange('fssai', val);
                }}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
                placeholder="14-digit FSSAI license number"
                maxLength={14}
              />
              {data.fssai && !fssaiValid && (
                <p className="text-xs text-red-600 mt-1">FSSAI must be exactly 14 digits</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                GST Number
              </label>
              <input
                type="text"
                value={restaurantGstin || ''}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 cursor-not-allowed"
                placeholder="GST number from previous step"
              />
              <p className="text-xs text-gray-400 mt-1">GST number is pulled from restaurant details</p>
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
            <div className="border-2 border-dashed rounded-lg p-4 max-w-xs mx-auto" style={{ borderColor: data.themePrimary || '#E53935' }}>
              <div className="text-center border-b-2 border-dashed border-gray-300 pb-2 mb-2">
                {(logoPreview || data.logoPreview) && (
                  <img src={logoPreview || data.logoPreview} alt="" className="w-10 h-10 object-contain mx-auto mb-1 rounded" />
                )}
                <div className="font-bold uppercase text-sm" style={{ color: data.themePrimary || '#E53935' }}>{data.receiptHeader || restaurantName || 'Your Restaurant'}</div>
                {data.receiptSubHeader && (
                  <div className="text-gray-500 text-xs mt-0.5">{data.receiptSubHeader}</div>
                )}
                {restaurantGstin && (
                  <div className="text-gray-500 text-xs mt-0.5">GST: {restaurantGstin}</div>
                )}
              </div>
              <div className="flex justify-between mb-2 text-xs text-gray-500">
                <span>Table 1 | 2 covers</span>
                <span>{today}</span>
              </div>
              <div className="border-t-2 border-dashed border-gray-300 pt-2 space-y-1">
                {itemsToShow.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>{item.name} x{item.qty}</span>
                    <span>₹{item.price * item.qty}</span>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-dashed border-gray-300 mt-2 pt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Subtotal</span>
                  <span>₹{displayedSubtotal}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>{cgstLabel}</span>
                  <span>₹{cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>{sgstLabel}</span>
                  <span>₹{sgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-dashed border-gray-300 pt-1">
                  <span>Total</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
              </div>
              <div className="border-t-2 border-dashed border-gray-300 mt-2 pt-2 text-center text-gray-500 text-xs">
                {data.receiptFooter || 'Thank you! Visit again.'}
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
