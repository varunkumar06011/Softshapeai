import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/apiConfig';
import StepRestaurant from './StepRestaurant';
import StepOwner from './StepOwner';
import StepStaff from './StepStaff';
import StepFloorPlan from './StepFloorPlan';
import StepMenu from './StepMenu';
import StepPlan from './StepPlan';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const OnboardingWizard = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [wizardData, setWizardData] = useState({
    restaurant: { name: '', address: '', phone: '', email: '', gstin: '' },
    owner: { name: '', email: '', password: '', confirmPassword: '' },
    captains: [{ name: '', pin: '' }],
    cashiers: [{ name: '', pin: '' }],
    sections: [{ name: '' }],
    tables: [{ number: 1, capacity: 4, sectionIndex: 0 }],
    menu: { categories: [{ name: '', items: [{ name: '', price: 0, isVeg: true }] }] },
    selectedPlan: 'starter'
  });

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
      const data = await apiFetch('/api/onboard', {
        method: 'POST',
        body: JSON.stringify({
          restaurant: wizardData.restaurant,
          owner: wizardData.owner,
          captains: wizardData.captains,
          cashiers: wizardData.cashiers,
          sections: wizardData.sections,
          tables: wizardData.tables,
          menu: wizardData.menu,
          plan
        })
      });

      setAuth(data.token, data.user, data.restaurant.slug);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to create restaurant');
    } finally {
      setLoading(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Set Up Your Restaurant</h1>
          <p className="text-gray-400">Complete these 6 steps to get started</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {steps.map((step) => (
              <div key={step.number} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  currentStep >= step.number ? 'bg-blue-600' : 'bg-gray-700'
                }`}>
                  {currentStep > step.number ? '✓' : step.number}
                </div>
                {step.number < 6 && (
                  <div className={`w-16 h-1 mx-2 ${
                    currentStep > step.number ? 'bg-blue-600' : 'bg-gray-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            {steps.map((step) => (
              <span key={step.number} className={currentStep === step.number ? 'text-blue-400 font-semibold' : ''}>
                {step.title}
              </span>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl">
          {renderStep()}
        </div>

        {/* Navigation (for steps that don't have their own) */}
        {currentStep !== 6 && (
          <div className="flex justify-between mt-6">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition-all"
            >
              <ChevronLeft size={20} />
              Back
            </button>
            {currentStep !== 1 && currentStep !== 3 && currentStep !== 4 && currentStep !== 5 && (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl transition-all"
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
