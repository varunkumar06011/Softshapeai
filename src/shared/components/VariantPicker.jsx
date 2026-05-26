import { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';

export default function VariantPicker({ item, onSelect, onClose }) {
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customMl, setCustomMl] = useState('');

  // Reset custom mode state when item changes
  useEffect(() => {
    setIsCustomMode(false);
    setCustomMl('');
  }, [item]);

  // Calculate price per ml from 30ml variant
  const pricePerMl = useMemo(() => {
    if (item?.menuType !== 'LIQUOR') return 0;
    const variant30ml = item.variants?.find(v => v.name === '30ml');
    if (!variant30ml) return 0;
    return variant30ml.price / 30;
  }, [item]);

  // Calculate custom price
  const customPrice = useMemo(() => {
    const parsedMl = parseFloat(customMl);
    if (!parsedMl || parsedMl <= 0) return 0;
    return Math.ceil(parsedMl * pricePerMl);
  }, [customMl, pricePerMl]);

  const handleCustomConfirm = () => {
    const parsedMl = parseFloat(customMl);
    if (!parsedMl || parsedMl <= 0) return;

    const customVariant = {
      id: 'custom',
      name: `Custom ${parsedMl}ml`,
      price: customPrice
    };

    onSelect(item, customVariant);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    // Allow only numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setCustomMl(value);
    }
  };

  const isValidCustomMl = useMemo(() => {
    const parsedMl = parseFloat(customMl);
    return parsedMl > 0 && customPrice > 0;
  }, [customMl, customPrice]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-gray-900">{item.n}</h3>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
              {isCustomMode ? 'Enter custom ml' : 'Select variant'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        {!isCustomMode ? (
          <div className="space-y-2">
            {item.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => onSelect(item, v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-gray-100 hover:border-[#E53935] hover:bg-[#FFF5F5] transition-all group"
              >
                <span className="text-sm font-black text-gray-800 group-hover:text-[#B71C1C]">
                  {v.name}
                </span>
                <span className="text-sm font-black text-[#E53935]">
                  ₹{v.price}
                </span>
              </button>
            ))}

            {item.menuType === 'LIQUOR' && pricePerMl > 0 && (
              <button
                onClick={() => setIsCustomMode(true)}
                className="w-full flex items-center justify-center px-4 py-3 rounded-2xl border-2 border-[#E53935] bg-[#FFF5F5] hover:bg-[#FFCDD2] transition-all group"
              >
                <span className="text-sm font-black text-[#E53935] uppercase tracking-[0.1em]">
                  Custom ML
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-600 uppercase tracking-[0.1em]">
                Enter ML Amount
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={customMl}
                onChange={handleInputChange}
                placeholder="e.g., 45"
                autoFocus
                className="w-full px-4 py-3 bg-[#FFF5F5] border-2 border-gray-200 focus:border-[#E53935] rounded-xl outline-none text-base font-bold text-gray-900"
              />
            </div>

            {customMl && isValidCustomMl && (
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-[#FFF5F5] border-2 border-[#E53935]">
                <span className="text-sm font-black text-gray-800">
                  Price for {parseFloat(customMl)}ml
                </span>
                <span className="text-base font-black text-[#E53935]">
                  ₹{customPrice}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsCustomMode(false);
                  setCustomMl('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-[0.15em] hover:bg-gray-200 active:scale-95 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleCustomConfirm}
                disabled={!isValidCustomMl}
                className="flex-1 px-4 py-3 bg-[#E53935] text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
