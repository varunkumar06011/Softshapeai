import React, { useState } from 'react';
import { CheckCircle, ArrowRight, Sparkles, Store } from 'lucide-react';

const StepPlan = ({ selectedPlan, outletCount, onSelect, onNext, onBack, loading, error }) => {
  const [localPlan, setLocalPlan] = useState(selectedPlan);

  const basePlans = [
    {
      id: 'starter',
      name: 'Starter',
      basePrice: 999,
      includedOutlets: 1,
      features: ['1 Outlet Included', '20 Tables', '3 Captains', 'Email Support']
    },
    {
      id: 'pro',
      name: 'Pro',
      basePrice: 2499,
      includedOutlets: 3,
      features: ['3 Outlets Included', 'Unlimited Tables', 'Unlimited Captains', 'Priority Support']
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      basePrice: null,
      includedOutlets: 999,
      features: ['Unlimited Outlets', 'Unlimited Tables', 'Unlimited Captains', 'Dedicated Support', 'Custom Pricing']
    }
  ];

  const computePrice = (plan) => {
    if (plan.basePrice === null) return 'Custom';
    if (outletCount <= plan.includedOutlets) return `₹${plan.basePrice.toLocaleString('en-IN')}/mo`;
    const extra = (outletCount - plan.includedOutlets) * 500;
    return `₹${(plan.basePrice + extra).toLocaleString('en-IN')}/mo`;
  };

  const handleSelect = (planId) => {
    setLocalPlan(planId);
    onSelect(planId);
  };

  const handleContinue = () => {
    if (localPlan === 'enterprise') {
      window.location.href = 'mailto:hello@softshape.ai?subject=Enterprise Plan Inquiry';
    } else {
      onSelect(localPlan);
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Sparkles size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
        <p className="text-gray-500">Pricing adjusted for {outletCount} outlet{outletCount > 1 ? 's' : ''}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {basePlans.map((plan) => {
          const price = computePrice(plan);
          const isSelected = localPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-[#E53935] bg-[#E53935]/10'
                  : 'border-gray-100 bg-white hover:border-gray-300'
              }`}
              onClick={() => handleSelect(plan.id)}
            >
              {isSelected && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <CheckCircle className="text-[#E53935] bg-white rounded-full" size={24} />
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-2xl font-bold text-[#E53935]">{price}</p>
                {plan.basePrice !== null && outletCount > plan.includedOutlets && (
                  <p className="text-xs text-gray-400 mt-1">
                    Base ₹{plan.basePrice.toLocaleString('en-IN')} + ₹{(outletCount - plan.includedOutlets) * 500}/outlet
                  </p>
                )}
              </div>

              <ul className="space-y-2 mb-6 text-sm text-gray-500">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-600" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={(e) => { e.stopPropagation(); handleSelect(plan.id); }}
                className={`w-full py-3 rounded-xl font-semibold transition-all ${
                  isSelected
                    ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                Select
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={loading || !localPlan}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            localPlan && !loading
              ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading ? 'Processing...' : (
            <>
              Continue to Confirmation
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default StepPlan;
