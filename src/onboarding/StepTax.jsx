// ─────────────────────────────────────────────────────────────────────────────
// StepTax — GST configuration and tax category selection (Step 6)
// ─────────────────────────────────────────────────────────────────────────────
// Configures GST settings for the restaurant:
//   - GST registration toggle (registered vs unregistered)
//   - GST category selection:
//     - Non-AC / Standalone: 5% GST
//     - AC Restaurant: 18% GST (if alcohol served or AC available)
//     - Takeaway / Parcel only: 5% GST (no service charge)
//   - GST number input (if registered)
//   - Per-item tax rate preview with sample items
//   - Service charge configuration (optional)
//
// GST category determines the default tax rate applied to food items.
// For bar types (BAR_LOUNGE, BAR_WITH_DINING), GST applies only to food —
// liquor is always GST-exempt. The live preview shows the food/liquor split.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Receipt, Percent, ToggleLeft, ToggleRight, Info, CheckCircle } from 'lucide-react';

// GST category options with rates and descriptions
const GST_CATEGORIES = [
  { value: 'NON_AC', label: 'Non-AC / Standalone', rate: '5%', desc: 'Most Indian restaurants' },
  { value: 'AC', label: 'AC Restaurant', rate: '18%', desc: 'If alcohol is served or AC is available' },
  { value: 'TAKEAWAY', label: 'Takeaway / Parcel only', rate: '5%', desc: 'No service charge' },
];

const FALLBACK_ITEMS = [
  { name: 'Paneer Tikka', price: 250 },
  { name: 'Butter Naan', price: 40 },
];

const FALLBACK_FOOD_ITEMS = [
  { name: 'Paneer Tikka', price: 250 },
  { name: 'Butter Naan', price: 40 },
];

const FALLBACK_LIQUOR_ITEMS = [
  { name: 'Kingfisher Beer', price: 180 },
  { name: 'Royal Stag (Peg)', price: 150 },
];

const StepTax = ({ restaurantType, data, sampleItems, onChange, onNext, onBack }) => {
  const isCloud = restaurantType === 'CLOUD_KITCHEN';
  const isBar = restaurantType === 'BAR_LOUNGE' || restaurantType === 'BAR_WITH_DINING';
  const [showServiceTooltip, setShowServiceTooltip] = useState(false);
  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  const isValid = true; // All fields have sensible defaults

  const previewItems = (sampleItems && sampleItems.length > 0)
    ? sampleItems.slice(0, 2)
    : FALLBACK_ITEMS;

  const foodPreviewItems = isBar ? FALLBACK_FOOD_ITEMS : previewItems;
  const liquorPreviewItems = isBar ? FALLBACK_LIQUOR_ITEMS : [];

  const gstRate = data.gstCategory === 'AC' ? 18 : 5;
  const foodSubtotal = foodPreviewItems.reduce((s, i) => s + (i.price || 0), 0);
  const liquorSubtotal = liquorPreviewItems.reduce((s, i) => s + (i.price || 0), 0);
  const subtotal = foodSubtotal + liquorSubtotal;
  const gstAmount = data.pricesIncludeGst ? 0 : (foodSubtotal * gstRate) / 100;
  const serviceAmount = data.serviceChargePercent > 0 ? (subtotal * data.serviceChargePercent) / 100 : 0;
  const packagingAmount = isCloud && data.packagingCharge > 0 ? data.packagingCharge : 0;
  const total = subtotal + gstAmount + serviceAmount + packagingAmount;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Receipt size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">GST & Tax Setup</h2>
        <p className="text-gray-500">Configure how tax is applied to your bills</p>
      </div>

      {/* Liquor GST exemption banner for bar types */}
      {isBar && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Info size={20} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Liquor is exempt from GST</p>
            <p className="text-xs text-blue-700 mt-1">
              GST applies only to food items. Liquor/bar items are charged without GST on the bill.
              {isBar && restaurantType === 'BAR_LOUNGE' && ' You can skip GST entirely if you only serve liquor.'}
            </p>
          </div>
        </div>
      )}

      {/* GST Registered Toggle */}
      <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {isBar ? 'Do you charge GST on food items?' : 'Are you GST registered?'}
          </p>
          <p className="text-xs text-gray-500">
            {isBar
              ? 'GST will apply only to food items, not liquor'
              : 'If not, no GST will be shown on bills'}
          </p>
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

      {!data.gstRegistered && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">Tax setup skipped</p>
            <p className="text-xs text-green-600">
              {isBar
                ? 'No GST will be charged on food items. Liquor is always GST-free. You can update this later from Admin Settings.'
                : 'No GST will be shown on bills. You can update this later from Admin Settings.'}
            </p>
          </div>
        </div>
      )}

      {data.gstRegistered && (
        <>
          {/* GST Category */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              {isBar ? 'Food GST rate category' : 'Restaurant category for GST'}
            </p>
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
                        : 'border-gray-200 bg-white hover:border-gray-300'
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

          {/* Optional GST rate override */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Override GST rate (optional)</p>
              <button
                type="button"
                onClick={() => handleChange('gstRate', data.gstRate != null ? null : (data.gstCategory === 'AC' ? 18 : 5))}
                className="flex items-center gap-2"
              >
                {data.gstRate != null ? (
                  <ToggleRight size={28} className="text-[#E53935]" />
                ) : (
                  <ToggleLeft size={28} className="text-gray-400" />
                )}
              </button>
            </div>
            {data.gstRate != null && (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Enter a custom GST rate. Most restaurants use 5% or 18%.
                </p>
                <div className="flex gap-2">
                  {[5, 12, 18, 28].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleChange('gstRate', r)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        data.gstRate === r
                          ? 'bg-[#E53935] text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {r}%
                    </button>
                  ))}
                  <input
                    type="number"
                    value={data.gstRate ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleChange('gstRate', val === '' ? null : Math.min(100, Math.max(0, parseFloat(val) || 0)));
                    }}
                    placeholder="Custom"
                    className="w-24 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E53935] text-gray-900 text-sm"
                    min="0"
                    max="100"
                    step="0.5"
                  />
                </div>
              </div>
            )}
            {data.gstRate == null && (
              <p className="text-xs text-gray-400">
                Rate auto-derives from category ({data.gstCategory === 'AC' ? '18%' : '5%'}). Enable to override.
              </p>
            )}
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
                    : 'border-gray-200 bg-white hover:border-gray-300'
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
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-semibold ${data.pricesIncludeGst ? 'text-[#E53935]' : 'text-gray-900'}`}>
                  Inclusive
                </p>
                <p className="text-xs text-gray-500 mt-1">GST is already included in menu prices</p>
              </button>
            </div>
          </div>

          {/* Live Receipt Preview */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Receipt size={16} className="text-[#E53935]" /> Live Preview
            </h4>
            <div className="space-y-1 text-sm">
              {isBar && (
                <>
                  {foodPreviewItems.map((item, i) => (
                    <div key={`f-${i}`} className="flex justify-between text-gray-700">
                      <span>{item.name}</span>
                      <span>₹{item.price.toFixed(2)}</span>
                    </div>
                  ))}
                  {liquorPreviewItems.map((item, i) => (
                    <div key={`l-${i}`} className="flex justify-between text-gray-700">
                      <span>{item.name}</span>
                      <span>₹{item.price.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-dashed border-gray-200 pt-1 mt-1">
                    {data.gstRegistered && (
                      <div className="flex justify-between text-gray-600">
                        <span>Food Subtotal</span>
                        <span>₹{foodSubtotal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600">
                      <span>Liquor Subtotal</span>
                      <span>₹{liquorSubtotal.toFixed(2)}</span>
                    </div>
                    {data.gstRegistered && !data.pricesIncludeGst && (
                      <div className="flex justify-between text-gray-600">
                        <span>GST on Food ({gstRate}%)</span>
                        <span>₹{gstAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {data.gstRegistered && data.pricesIncludeGst && (
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>Includes GST on Food ({gstRate}%)</span>
                        <span>₹{((foodSubtotal * gstRate) / (100 + gstRate)).toFixed(2)}</span>
                      </div>
                    )}
                    {serviceAmount > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Service Charge ({data.serviceChargePercent}%)</span>
                        <span>₹{serviceAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-100">
                      <span>Total</span>
                      <span>₹{total.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
              {!isBar && (
                <>
                  {previewItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-gray-700">
                      <span>{item.name}</span>
                      <span>₹{item.price.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-dashed border-gray-200 pt-1 mt-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    {data.gstRegistered && !data.pricesIncludeGst && (
                      <div className="flex justify-between text-gray-600">
                        <span>GST ({gstRate}%)</span>
                        <span>₹{gstAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {data.gstRegistered && data.pricesIncludeGst && (
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>Includes GST ({gstRate}%)</span>
                        <span>₹{((subtotal * gstRate) / (100 + gstRate)).toFixed(2)}</span>
                      </div>
                    )}
                    {serviceAmount > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Service Charge ({data.serviceChargePercent}%)</span>
                        <span>₹{serviceAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {packagingAmount > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Packaging</span>
                        <span>₹{packagingAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-100">
                      <span>Total</span>
                      <span>₹{total.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Service charge %</label>
            <input
              type="number"
              value={data.serviceChargePercent === 0 ? '' : data.serviceChargePercent}
              onChange={(e) => {
                const val = e.target.value;
                const num = val === '' ? 0 : Math.min(20, Math.max(0, parseFloat(val) || 0));
                handleChange('serviceChargePercent', num);
              }}
              onBlur={(e) => {
                if (!e.target.value || parseFloat(e.target.value) <= 0) {
                  handleChange('serviceChargePercent', 0);
                }
              }}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
              min="0"
              max="20"
              step="0.5"
            />
          </div>
        )}
        {data.serviceChargePercent > 10 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-700">
            Most restaurants charge 5–10%. Higher charges may invite customer disputes.
          </div>
        )}
        <div className="relative">
          <button
            onClick={() => setShowServiceTooltip(!showServiceTooltip)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#E53935] transition-colors"
          >
            <Info size={14} /> NRAI guidelines
          </button>
          {showServiceTooltip && (
            <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-lg p-2 shadow-lg text-xs text-gray-600 max-w-xs">
              Service charge is voluntary as per NRAI guidelines. Customers can request it to be removed.
            </div>
          )}
        </div>
      </div>

      {isCloud && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-gray-500" />
            <p className="text-sm font-semibold text-gray-700">Packaging charge per order</p>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
            <input
              type="number"
              value={data.packagingCharge === 0 ? '' : data.packagingCharge}
              onChange={(e) => {
                const val = e.target.value;
                const num = val === '' ? 0 : Math.max(0, parseFloat(val) || 0);
                handleChange('packagingCharge', num);
              }}
              className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 text-gray-900 transition-all"
              min="0"
              step="1"
              placeholder="0"
            />
          </div>
          <p className="text-xs text-gray-400">
            Added to every delivery order for packaging materials.
            {data.packagingCharge > 0 && (
              <span className="block mt-1 text-gray-500">
                Example: ₹{data.packagingCharge} × 20 orders/day = ₹{data.packagingCharge * 20}/day
              </span>
            )}
          </p>
        </div>
      )}

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
