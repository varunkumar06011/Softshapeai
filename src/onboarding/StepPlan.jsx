import React, { useState, useEffect } from 'react';
import { CheckCircle, ArrowRight, Sparkles, Store, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { apiUrl } from '../services/apiConfig';

const FALLBACK_PRICES = { starter: 999, pro: 2499 };

const StepPlan = ({ selectedPlan, outletCount, wizardSummary, onSelect, onNext, onBack, loading, error }) => {
  const [localPlan, setLocalPlan] = useState(selectedPlan);
  const [quotes, setQuotes] = useState({});
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

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
    if (q && !q.isCustomQuote) return `₹${q.totalMonthly.toLocaleString('en-IN')}/mo`;
    // Fallback to static base price
    const fallback = FALLBACK_PRICES[planId];
    if (fallback) return `₹${fallback.toLocaleString('en-IN')}/mo`;
    return '—';
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
      setShowEnterpriseModal(true);
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

      {wizardSummary && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <span className="font-semibold">Your setup so far:</span>{' '}
          {wizardSummary.tables} tables, {wizardSummary.staff} staff, {wizardSummary.menuItems} menu items
        </div>
      )}

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
                {plan.id === 'pro' && (
                  <span className="absolute -top-3 right-3 bg-[#E53935] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Most Popular
                  </span>
                )}
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

      <button
        onClick={() => setShowComparison(!showComparison)}
        className="w-full text-sm text-gray-500 hover:text-[#E53935] flex items-center justify-center gap-1 py-2"
      >
        {showComparison ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {showComparison ? 'Hide comparison' : 'Compare all features'}
      </button>

      {showComparison && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-4 text-gray-400 font-medium">Feature</th>
                <th className="text-center py-2 px-4 text-gray-900 font-semibold">Starter</th>
                <th className="text-center py-2 px-4 text-[#E53935] font-semibold">Pro</th>
                <th className="text-center py-2 px-4 text-gray-900 font-semibold">Enterprise</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              {[
                ['Outlets', '1', '1 + extras', 'Unlimited'],
                ['Tables', '20', 'Unlimited', 'Unlimited'],
                ['Staff', '3 captains', 'Unlimited', 'Unlimited'],
                ['Support', 'Email', 'Priority', 'Dedicated'],
                ['Custom Pricing', '—', '—', 'Yes'],
              ].map(([feat, s, p, e], i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2 pr-4">{feat}</td>
                  <td className="text-center py-2 px-4">{s}</td>
                  <td className="text-center py-2 px-4 font-medium">{p}</td>
                  <td className="text-center py-2 px-4">{e}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Enterprise Modal */}
      {showEnterpriseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Enterprise Plan</h3>
              <button onClick={() => setShowEnterpriseModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-500">Our team will reach out to discuss custom pricing for your needs.</p>
            <a
              href="mailto:hello@softshape.ai?subject=Enterprise Plan Inquiry"
              className="block w-full py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold text-center transition-all"
            >
              Request a Call Back
            </a>
            <button
              onClick={() => setShowEnterpriseModal(false)}
              className="block w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold text-center transition-all"
            >
              Back to Plans
            </button>
          </div>
        </div>
      )}

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
