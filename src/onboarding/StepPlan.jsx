import React, { useState, useEffect } from 'react';
import { CheckCircle, ArrowRight, Sparkles, Store, Loader2 } from 'lucide-react';
import { apiUrl } from '../services/apiConfig';

const StepPlan = ({ selectedPlan, outletCount, onSelect, onNext, onBack, loading, error }) => {
  const [localPlan, setLocalPlan] = useState(selectedPlan);
  const [quotes, setQuotes] = useState({});

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const [starterRes, proRes] = await Promise.all([
          fetch(apiUrl('/api/onboard/pricing/quote'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: 'starter', numberOfOutlets: outletCount })
          }).then(r => r.json()),
          fetch(apiUrl('/api/onboard/pricing/quote'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: 'pro', numberOfOutlets: outletCount })
          }).then(r => r.json()),
        ]);
        setQuotes({ starter: starterRes, pro: proRes });
      } catch (err) {
        setQuotes({});
      }
    };
    fetchQuotes();
  }, [outletCount]);

  const basePlans = [
    {
      id: 'starter',
      name: 'Starter',
      features: ['1 Outlet Included', '20 Tables', '3 Captains', 'Email Support']
    },
    {
      id: 'pro',
      name: 'Pro',
      features: ['Unlimited Tables', 'Unlimited Captains', 'Priority Support']
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      features: ['Unlimited Outlets', 'Unlimited Tables', 'Unlimited Captains', 'Dedicated Support', 'Custom Pricing']
    }
  ];

  const formatPrice = (planId) => {
    if (planId === 'enterprise') return 'Custom';
    const q = quotes[planId];
    if (!q || q.isCustomQuote) return '—';
    return `₹${q.totalMonthly.toLocaleString('en-IN')}/mo`;
  };

  const formatBreakdown = (planId) => {
    if (planId === 'enterprise') return null;
    const q = quotes[planId];
    if (!q || q.isCustomQuote) return null;
    if (q.extraOutlets > 0) {
      const perExtra = q.extraOutletCost / q.extraOutlets;
      return `Base ₹${q.basePrice.toLocaleString('en-IN')} + ${q.extraOutlets} extra × ₹${perExtra.toLocaleString('en-IN')}/mo`;
    }
    return 'Base price';
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
          const price = formatPrice(plan.id);
          const breakdown = formatBreakdown(plan.id);
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
                {breakdown && (
                  <p className="text-xs text-gray-400 mt-1">{breakdown}</p>
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
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Processing...
            </>
          ) : (
            <>
              Continue to Review
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default StepPlan;
