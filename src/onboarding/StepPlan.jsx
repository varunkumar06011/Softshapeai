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
        <Sparkles size={48} className="mx-auto text-blue-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
        <p className="text-gray-400">Start with a 30-day free trial, no credit card required</p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl p-6 border-2 transition-all ${
              selectedPlan === plan.id
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-700 bg-gray-800 hover:border-gray-600'
            }`}
          >
            {selectedPlan === plan.id && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <CheckCircle className="text-blue-500 bg-gray-900 rounded-full" size={24} />
              </div>
            )}

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
              <p className="text-2xl font-bold text-blue-400">{plan.price}</p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <Clock size={18} className="text-gray-400" />
                <span>{plan.outlets} Outlet{plan.outlets !== '1' ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <HeadphonesIcon size={18} className="text-gray-400" />
                <span>{plan.tables} Tables</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail size={18} className="text-gray-400" />
                <span>{plan.captains} Captains</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <HeadphonesIcon size={18} className="text-gray-400" />
                <span>{plan.support} Support</span>
              </div>
            </div>

            <ul className="space-y-2 mb-6 text-sm text-gray-300">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSelect(plan.id)}
              disabled={loading}
              className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                plan.isEnterprise
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : selectedPlan === plan.id
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
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

      <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 text-center">
        <p className="text-sm text-blue-300">
          <strong>30-day free trial</strong> • No credit card required • Cancel anytime
        </p>
      </div>

      <button
        onClick={onBack}
        disabled={loading}
        className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-all"
      >
        Back
      </button>
    </div>
  );
};

export default StepPlan;
