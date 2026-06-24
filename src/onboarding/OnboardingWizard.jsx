import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/apiConfig';
import StepRestaurant from './StepRestaurant';
import StepOwner from './StepOwner';
import StepStaff from './StepStaff';
import StepFloorPlan from './StepFloorPlan';
import StepMenu from './StepMenu';
import StepPlan from './StepPlan';
import { ChevronLeft, ChevronRight, CheckCircle2, Copy, ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'onboarding_wizard';

const defaultWizardData = {
  restaurant: { name: '', address: '', phone: '', email: '', gstin: '' },
  owner: { name: '', email: '', password: '', confirmPassword: '' },
  captains: [{ name: '', pin: '' }],
  cashiers: [{ name: '', pin: '' }],
  sections: [{ name: '' }],
  tables: [{ number: 1, capacity: 4, sectionIndex: 0 }],
  menu: { categories: [{ name: '', items: [{ name: '', price: 0, isVeg: true }] }] },
  selectedPlan: 'starter'
};

function loadSavedState() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

const OnboardingWizard = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  const saved = loadSavedState();
  const [currentStep, setCurrentStep] = useState(saved?.currentStep || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [onboardResult, setOnboardResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [wizardData, setWizardData] = useState(saved?.wizardData || defaultWizardData);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ currentStep, wizardData }));
    } catch { /* ignore */ }
  }, [currentStep, wizardData]);

  const steps = [
    { number: 1, title: 'Restaurant Info' },
    { number: 2, title: 'Owner Account' },
    { number: 3, title: 'Staff Setup' },
    { number: 4, title: 'Floor Plan' },
    { number: 5, title: 'Menu Setup' },
    { number: 6, title: 'Choose Plan' }
  ];

  const updateWizardData = (section, data) => {
    setWizardData(prev => ({ ...prev, [section]: data }));
  };

  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (plan) => {
    setLoading(true);
    setError(null);

    try {
      // Sanitize: remove empty entries that fail Zod validation
      const cleanCaptains = wizardData.captains.filter(c => c.name.trim().length >= 2 && /^\d{4}$/.test(c.pin));
      const cleanCashiers = wizardData.cashiers.filter(c => c.name.trim().length >= 2 && /^\d{4}$/.test(c.pin));
      const cleanSections = wizardData.sections.filter(s => s.name.trim().length >= 1);
      const cleanMenu = {
        categories: wizardData.menu.categories
          .filter(cat => cat.name.trim().length >= 1)
          .map(cat => ({
            ...cat,
            items: cat.items.filter(item => item.name.trim().length >= 1 && item.price > 0)
          }))
          .filter(cat => cat.items.length > 0)
      };

      if (cleanCaptains.length === 0) { setError('Add at least one captain with a 4-digit PIN'); setLoading(false); return; }
      if (cleanCashiers.length === 0) { setError('Add at least one cashier with a 4-digit PIN'); setLoading(false); return; }
      if (cleanSections.length === 0) { setError('Add at least one floor section'); setLoading(false); return; }
      if (cleanMenu.categories.length === 0) { setError('Add at least one menu category with items'); setLoading(false); return; }

      const { confirmPassword, ...ownerData } = wizardData.owner;

      const data = await apiFetch('/api/onboard', {
        method: 'POST',
        body: JSON.stringify({
          restaurant: wizardData.restaurant,
          owner: ownerData,
          captains: cleanCaptains,
          cashiers: cleanCashiers,
          sections: cleanSections,
          tables: wizardData.tables,
          menu: cleanMenu,
          plan
        })
      });

      sessionStorage.removeItem(STORAGE_KEY);
      setAuth(data.token, data.user, data.restaurant.slug);
      navigate('/admin/qr-codes');
    } catch (err) {
      setError(err.message || 'Failed to create restaurant');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    navigate('/admin/dashboard');
  };

  const handleCopyCode = () => {
    if (onboardResult?.restaurantCode) {
      navigator.clipboard.writeText(onboardResult.restaurantCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <StepRestaurant data={wizardData.restaurant} onChange={(data) => updateWizardData('restaurant', data)} onNext={handleNext} />;
      case 2:
        return <StepOwner data={wizardData.owner} onChange={(data) => updateWizardData('owner', data)} onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <StepStaff captains={wizardData.captains} cashiers={wizardData.cashiers} onChange={(captains, cashiers) => { updateWizardData('captains', captains); updateWizardData('cashiers', cashiers); }} onNext={handleNext} onBack={handleBack} />;
      case 4:
        return <StepFloorPlan sections={wizardData.sections} tables={wizardData.tables} onChange={(sections, tables) => { updateWizardData('sections', sections); updateWizardData('tables', tables); }} onNext={handleNext} onBack={handleBack} />;
      case 5:
        return <StepMenu data={wizardData.menu} onChange={(data) => updateWizardData('menu', data)} onNext={handleNext} onBack={handleBack} />;
      case 6:
        return <StepPlan selectedPlan={wizardData.selectedPlan} onSelect={handleSubmit} onBack={handleBack} loading={loading} error={error} />;
      default:
        return null;
    }
  };

  if (onboardResult) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] text-gray-900 flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-3xl p-10 shadow-[0_32px_64px_rgba(0,0,0,0.06)] border border-gray-100 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={48} className="text-green-600" />
          </div>
          <h1 className="text-3xl font-bold mb-2">You're All Set!</h1>
          <p className="text-gray-500 mb-8">
            <span className="font-semibold text-gray-900">{onboardResult.name}</span> has been created successfully.
          </p>

          <div className="bg-[#F8F9FA] border border-gray-200 rounded-2xl p-6 mb-8">
            <p className="text-sm text-gray-500 mb-2">Your Restaurant ID</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl font-bold tracking-wide text-[#E53935]">{onboardResult.restaurantCode}</span>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-lg hover:bg-gray-200 transition-all"
                title="Copy Restaurant ID"
              >
                <Copy size={18} className={copied ? 'text-green-600' : 'text-gray-500'} />
              </button>
            </div>
            {copied && <p className="text-xs text-green-600 mt-2">Copied!</p>}
            <p className="text-xs text-gray-400 mt-3">
              Share this ID with your staff to log in. Keep it safe.
            </p>
          </div>

          <button
            onClick={handleGoToDashboard}
            className="w-full py-4 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
          >
            Go to Dashboard
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Set Up Your Restaurant</h1>
          <p className="text-gray-500">Complete these 6 steps to get started</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {steps.map((step) => (
              <div key={step.number} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  currentStep >= step.number ? 'bg-[#E53935]' : 'bg-gray-200 text-gray-500'
                }`}>
                  {currentStep > step.number ? '✓' : step.number}
                </div>
                {step.number < 6 && (
                  <div className={`w-16 h-1 mx-2 ${
                    currentStep > step.number ? 'bg-[#E53935]' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            {steps.map((step) => (
              <span key={step.number} className={currentStep === step.number ? 'text-[#E53935] font-semibold' : ''}>
                {step.title}
              </span>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-2xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.04)] border border-gray-100">
          {renderStep()}
        </div>

        {/* Navigation (for steps that don't have their own) */}
        {currentStep !== 6 && (
          <div className="flex justify-between mt-6">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl transition-all"
            >
              <ChevronLeft size={20} />
              Back
            </button>
            {currentStep !== 1 && currentStep !== 3 && currentStep !== 4 && currentStep !== 5 && (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl transition-all"
              >
                Next
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;
