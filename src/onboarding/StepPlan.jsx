import React from 'react';
import { CheckCircle, Mail, Clock, HeadphonesIcon, ArrowRight, Sparkles } from 'lucide-react';

const StepPlan = ({ selectedPlan, onSelect, onBack, loading, error }) => {
  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: '₹999/mo',
      outlets: '1',
      tables: '20',
      captains: '3',
      support: 'Email',
      payment: 'Demo',
      features: ['1 Outlet', '20 Tables', '3 Captains', 'Email Support', '30-day Free Trial']
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '₹2,499/mo',
      outlets: '3',
      tables: 'Unlimited',
      captains: 'Unlimited',
      support: 'Priority',
      payment: 'Demo',
      features: ['3 Outlets', 'Unlimited Tables', 'Unlimited Captains', 'Priority Support', '30-day Free Trial']
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      outlets: 'Unlimited',
      tables: 'Unlimited',
      captains: 'Unlimited',
      support: 'Dedicated',
      payment: 'Contact Us',
      features: ['Unlimited Outlets', 'Unlimited Tables', 'Unlimited Captains', 'Dedicated Support', 'Custom Pricing'],
      isEnterprise: true
    }
  ];

  const handleSelect = (planId) => {
    if (planId === 'enterprise') {
      window.location.href = 'mailto:hello@softshape.ai?subject=Enterprise Plan Inquiry';
    } else {
      onSelect(planId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <Sparkles size={48} className="mx-auto text-[#E53935] mb-4" />
        <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
        <p className="text-gray-500">Start with a 30-day free trial, no credit card required</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl p-6 border-2 transition-all ${
              selectedPlan === plan.id
                ? 'border-[#E53935] bg-[#E53935]/10'
                : 'border-gray-100 bg-white hover:border-gray-300'
            }`}
          >
            {selectedPlan === plan.id && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <CheckCircle className="text-[#E53935] bg-white rounded-full" size={24} />
              </div>
            )}

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
              <p className="text-2xl font-bold text-[#E53935]">{plan.price}</p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <Clock size={18} className="text-gray-500" />
                <span>{plan.outlets} Outlet{plan.outlets !== '1' ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <HeadphonesIcon size={18} className="text-gray-500" />
                <span>{plan.tables} Tables</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail size={18} className="text-gray-500" />
                <span>{plan.captains} Captains</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <HeadphonesIcon size={18} className="text-gray-500" />
                <span>{plan.support} Support</span>
              </div>
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
              onClick={() => handleSelect(plan.id)}
              disabled={loading}
              className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                plan.isEnterprise
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                  : selectedPlan === plan.id
                  ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                'Processing...'
              ) : plan.isEnterprise ? (
                'Contact Us'
              ) : (
                <>
                  Start Free Trial
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-[#E53935]/10 border border-[#E53935]/20 rounded-xl p-4 text-center">
        <p className="text-sm text-[#E53935]">
          <strong>30-day free trial</strong> • No credit card required • Cancel anytime
        </p>
      </div>

      <button
        onClick={onBack}
        disabled={loading}
        className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all"
      >
        Back
      </button>
    </div>
  );
};

export default StepPlan;
