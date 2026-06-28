// ─────────────────────────────────────────────────────────────────────────────
// Pricing — SaaS pricing plan cards for subscription display
// ─────────────────────────────────────────────────────────────────────────────
// Displays subscription plans (Starter, Growth, Pro) with features and pricing
// for both daily and monthly billing cycles. Used in the admin settings page
// and onboarding flow to show available SaaS plans.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Check } from 'lucide-react';

export function Pricing() {
  const plans = [
    {
      name: "Starter Plan",
      dayPrice: "100",
      monthPrice: "2,999",
      features: ["POS Billing", "Basic Inventory", "Captain Analytics"],
      color: "border-gray-200",
      btn: "bg-gray-900 text-white"
    },
    {
      name: "Growth Plan",
      dayPrice: "200",
      monthPrice: "5,999",
      features: ["Everything in Starter", "Marketing AI", "Smart Pricing Engine"],
      color: "border-[#B71C1C] ring-4 ring-red-50 shadow-2xl",
      popular: true,
      btn: "bg-[#B71C1C] text-white"
    },
    {
      name: "Pro Plan",
      dayPrice: "333",
      monthPrice: "9,999",
      features: ["Everything in Growth", "Surveillance AI", "Swiggy & Zomato Integration"],
      color: "border-gray-200",
      btn: "bg-gray-900 text-white"
    }
  ];

  return (
    <div className="py-8 px-4 font-sans">
      <div className="text-center mb-16">
        <h2 className="text-4xl font-black text-gray-900 tracking-tighter mb-4">Enterprise-Grade Scalability</h2>
        <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-xs">Transparent Pricing for Modern Restaurants</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
        {plans.map((plan, i) => (
          <div key={i} className={`relative bg-white rounded-[40px] border-2 p-10 flex flex-col transition-all duration-500 hover:translate-y-[-12px] ${plan.color}`}>
            {plan.popular && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#B71C1C] text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-100">
                Most Popular
              </div>
            )}
            <h3 className="text-xl font-black text-gray-900 mb-4">{plan.name}</h3>
            <div className="flex flex-col mb-10">
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-gray-900 tracking-tighter">₹{plan.dayPrice}</span>
                <span className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">/ Day</span>
              </div>
              <p className="text-sm font-medium text-gray-400 mt-2">₹{plan.monthPrice} / Month</p>
            </div>

            <div className="space-y-4 mb-12 flex-grow">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">What's included:</p>
              {plan.features.map((f, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                    <Check size={12} strokeWidth={4} />
                  </div>
                  <span className="text-sm font-bold text-gray-700">{f}</span>
                </div>
              ))}
            </div>

            <button className={`w-full py-4 rounded-[20px] font-black uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95 shadow-lg ${plan.btn}`}>
              Select {plan.name.split(' ')[0]}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-20 text-center">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Trusted by 2,400+ restaurants globally</p>
        <div className="mt-4 flex justify-center gap-8 opacity-30 grayscale contrast-150">
           {/* Mock Brand Logos */}
           <div className="h-6 w-24 bg-gray-400 rounded-md" />
           <div className="h-6 w-24 bg-gray-400 rounded-md" />
           <div className="h-6 w-24 bg-gray-400 rounded-md" />
        </div>
      </div>
    </div>
  );
}
