import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { purgeLegacyCaches } from '../utils/cacheKeys';
import { apiFetch } from '../services/apiConfig';
import StepRestaurant from './StepRestaurant';
import StepBranding from './StepBranding';
import StepOwner from './StepOwner';
import StepStaff from './StepStaff';
import StepYourSpace from './StepYourSpace';
import StepMenu from './StepMenu';
import StepTax from './StepTax';
import StepPrinters from './StepPrinters';
import StepPlan from './StepPlan';
import StepPayment from './StepPayment';
import StepOutlets, { areasToFlat } from './StepOutlets';
import StepConfirmation from './StepConfirmation';
import OnboardingSuccess from './OnboardingSuccess';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'onboarding_wizard_v2';

function computeSteps(restaurantType, outletCount, hasVenues) {
  const base = [
    { id: 'restaurant', title: 'Restaurant Info' },
    { id: 'owner', title: 'Your Login Details' },
  ];

  if (restaurantType !== 'CLOUD_KITCHEN') {
    base.push({ id: 'yourspace', title: 'Your Space' });
    base.push({ id: 'staff', title: 'Staff Setup' });
  } else {
    base.push({ id: 'staff', title: 'Staff Setup' });
  }

  base.push({ id: 'menu', title: 'Menu Setup' });
  base.push({ id: 'tax', title: 'GST & Tax' });
  base.push({ id: 'printers', title: 'Printers' });

  if (outletCount > 1) {
    base.push({ id: 'outlets', title: 'Outlets' });
  }

  base.push({ id: 'plan', title: 'Choose Plan' });
  base.push({ id: 'payment', title: 'Payment' });
  base.push({ id: 'branding', title: 'Branding' });
  base.push({ id: 'confirm', title: 'Confirm' });

  return base;
}

const defaultWizardData = {
  restaurant: { name: '', address: '', phone: '', email: '', gstin: '', restaurantType: '', outletCount: 1, barUnitMl: 30, fullBottleMl: 750, halfBottleMl: 375, deliveryPlatforms: [], slug: '', logoPreview: undefined, logoFile: undefined },
  branding: { receiptHeader: '', receiptSubHeader: '', receiptFooter: '', fssai: '', themePrimary: '#E53935', logoUrl: '', logoPreview: undefined, logoFile: undefined, billPrefix: '', startingBillNumber: 1 },
  owner: { name: '', email: '', phone: '', password: '', confirmPassword: '', termsAccepted: false, marketingConsent: false },
  captains: [{ name: '', pin: '', role: 'CAPTAIN', shift: 'Full Day' }],
  cashiers: [{ name: '', pin: '', shift: 'Full Day' }],
  sections: [{ name: '', kotPrinterName: '' }],
  tables: [{ number: 1, capacity: 4, sectionIndex: 0 }],
  venues: [],
  menuSharing: 'SHARED',
  pricingMode: 'UNIFIED',
  priceProfiles: [{ name: 'Default', isDefault: true }],
  menu: { categories: [{ name: '', items: [{ name: '', price: 0, isVeg: true }] }] },
  taxConfig: { gstRegistered: true, gstCategory: 'NON_AC', gstRate: null, pricesIncludeGst: false, serviceChargePercent: 0, packagingCharge: 0 },
  printers: [
    { name: 'Kitchen Printer', paperWidth: '80mm', type: 'KITCHEN' },
    { name: 'Bill Printer', paperWidth: '80mm', type: 'BILL' },
  ],
  sectionRouting: {},
  outlets: [],
  selectedPlan: 'starter',
  paymentReference: null,
  sessionId: crypto.randomUUID?.() || Date.now().toString(36)
};

function loadSavedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration guard: old format used numeric currentStep; discard stale state
      if (typeof parsed?.currentStep === 'number') return null;
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

const OnboardingWizard = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  const saved = loadSavedState();
  const [currentStepId, setCurrentStepId] = useState(saved?.currentStepId || 'restaurant');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [onboardResult, setOnboardResult] = useState(null);
  const [wizardData, setWizardData] = useState(saved?.wizardData || defaultWizardData);

  const steps = useMemo(
    () => computeSteps(wizardData.restaurant.restaurantType, wizardData.restaurant.outletCount, (wizardData.venues || []).length > 0),
    [wizardData.restaurant.restaurantType, wizardData.restaurant.outletCount, wizardData.venues]
  );

  const maxStep = steps.length;
  const currentStepIndex = steps.findIndex(s => s.id === currentStepId);
  const hasMultipleOutlets = wizardData.restaurant.outletCount > 1;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentStepId, wizardData }));
    } catch { /* ignore */ }
  }, [currentStepId, wizardData]);

  // Reset dependent data when restaurant type changes
  const prevTypeRef = React.useRef(wizardData.restaurant.restaurantType);
  useEffect(() => {
    const newType = wizardData.restaurant.restaurantType;
    const prevType = prevTypeRef.current;
    if (newType && prevType && newType !== prevType) {
      setWizardData(prev => {
        const reset = { ...prev };
        // Clear floor-plan data for cloud kitchen; keep for cafe with counter default
        if (newType === 'CLOUD_KITCHEN') {
          reset.sections = [{ name: '', kotPrinterName: '' }];
          reset.tables = [{ number: 1, capacity: 4, sectionIndex: 0 }];
          reset.captains = [];
        }
        if (newType === 'CAFE') {
          reset.sections = [{ name: 'Main Counter', kotPrinterName: '' }];
          reset.tables = [{ number: 1, capacity: 1, sectionIndex: 0 }];
          reset.captains = [];
        }
        // Smart GST default based on restaurant type
        const isBar = newType === 'BAR_LOUNGE' || newType === 'BAR_WITH_DINING';
        const isAc = newType === 'AC_RESTAURANT' || isBar;
        reset.taxConfig = {
          ...reset.taxConfig,
          gstCategory: isAc ? 'AC' : (newType === 'CLOUD_KITCHEN' ? 'TAKEAWAY' : 'NON_AC'),
          pricesIncludeGst: false,
          serviceChargePercent: 0,
        };
        // Reset type-specific fields
        reset.restaurant = {
          ...reset.restaurant,
          barUnitMl: null,
          halfBottleMl: null,
          fullBottleMl: null,
          deliveryPlatforms: []
        };
        return reset;
      });
      // Jump back to restaurant step so owner sees the new flow
      setCurrentStepId('restaurant');
    }
    prevTypeRef.current = newType;
  }, [wizardData.restaurant.restaurantType]);

  const updateWizardData = (section, data) => {
    setWizardData(prev => ({ ...prev, [section]: data }));
  };

  const handleNext = useCallback(() => {
    if (currentStepIndex >= 0 && currentStepIndex < maxStep - 1) {
      setCurrentStepId(steps[currentStepIndex + 1].id);
    }
  }, [currentStepIndex, maxStep, steps]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepId(steps[currentStepIndex - 1].id);
    } else {
      navigate('/');
    }
  }, [currentStepIndex, steps, navigate]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const isCloud = wizardData.restaurant.restaurantType === 'CLOUD_KITCHEN';
      const isCafe = wizardData.restaurant.restaurantType === 'CAFE';

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

      const cleanBarMenu = {
        categories: (wizardData.menu.barMenu?.categories || [])
          .filter(cat => cat.name.trim().length >= 1)
          .map(cat => ({
            ...cat,
            items: cat.items.filter(item => item.name.trim().length >= 1 && item.price > 0)
          }))
          .filter(cat => cat.items.length > 0)
      };

      const cleanVenues = (wizardData.venues || []).map(v => ({
        ...v,
        name: v.name.trim(),
        floors: (v.floors || []).map(f => ({
          ...f,
          name: f.name.trim(),
          sections: (f.sections || []).map(s => ({
            ...s,
            name: s.name.trim(),
            tables: (s.tables || []).filter(t => t.number > 0),
          })).filter(s => s.name.length >= 1),
        })).filter(f => f.name.length >= 1 && f.sections.length > 0),
      })).filter(v => v.name.length >= 1);

      if (!isCloud && !isCafe && cleanCaptains.length === 0) { setError('Add at least one captain with a 4-digit PIN'); setLoading(false); return; }
      if (cleanCashiers.length === 0) { setError('Add at least one cashier with a 4-digit PIN'); setLoading(false); return; }
      if (!isCloud && cleanSections.length === 0) { setError('Add at least one floor section'); setLoading(false); return; }
      if (cleanMenu.categories.length === 0) { setError('Add at least one menu category with items'); setLoading(false); return; }

      // Sanitize outlets if multi-outlet
      let cleanOutlets = [];
      if (wizardData.restaurant.outletCount > 1 && wizardData.outlets && wizardData.outlets.length > 0) {
        cleanOutlets = wizardData.outlets.map(o => {
          const { sections, tables } = areasToFlat(o.areas || []);
          return {
            name: o.name.trim(),
            restaurantType: o.restaurantType,
            sections: sections.filter(s => s.name.trim().length >= 1),
            tables: tables.filter(t => t.number > 0 && t.capacity > 0),
            menu: {
              categories: o.menu.categories
                .filter(cat => cat.name.trim().length >= 1)
                .map(cat => ({
                  ...cat,
                  items: cat.items.filter(item => item.name.trim().length >= 1 && item.price > 0)
                }))
                .filter(cat => cat.items.length > 0)
            }
          };
        }).filter(o => o.sections.length > 0 && o.menu.categories.length > 0);
      }

      const { confirmPassword, ...ownerData } = wizardData.owner;

      const isBarType = wizardData.restaurant.restaurantType === 'BAR_LOUNGE' || wizardData.restaurant.restaurantType === 'BAR_WITH_DINING';

      const payload = {
        restaurant: wizardData.restaurant,
        branding: wizardData.branding,
        taxConfig: wizardData.taxConfig,
        owner: ownerData,
        captains: isCloud ? [] : cleanCaptains,
        cashiers: cleanCashiers,
        sections: isCloud ? [] : cleanSections,
        tables: isCloud ? [] : wizardData.tables,
        venues: cleanVenues.length > 0 ? cleanVenues : undefined,
        menuSharing: wizardData.menuSharing,
        pricingMode: wizardData.pricingMode,
        priceProfiles: wizardData.priceProfiles || [],
        menu: cleanMenu,
        printers: wizardData.printers,
        sectionRouting: wizardData.sectionRouting,
        outlets: cleanOutlets.length > 0 ? cleanOutlets : undefined,
        plan: wizardData.selectedPlan,
        paymentReference: wizardData.paymentReference,
        sessionId: wizardData.sessionId,
        emailVerificationProof: wizardData.owner.emailVerificationProof,
        phoneVerificationProof: wizardData.owner.phoneVerificationProof,
        ...(isBarType && cleanBarMenu.categories.length > 0 ? { barMenu: cleanBarMenu } : {}),
      };

      const data = await apiFetch('/api/onboard', {
        method: 'POST',
        body: JSON.stringify(payload),
        timeout: 60000,
      });

      localStorage.removeItem(STORAGE_KEY);
      setOnboardResult({
        restaurantCode: data.restaurant.restaurantCode,
        name: data.restaurant.name,
        token: data.token,
        user: data.user,
        slug: data.restaurant.slug,
        restaurant: data.restaurant
      });
    } catch (err) {
      setError(err.message || 'Failed to create restaurant');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    if (onboardResult?.token) {
      setAuth({ token: onboardResult.token, user: onboardResult.user, restaurant: onboardResult.restaurant });
    }
    navigate('/admin/dashboard?firstVisit=true');
  };

  const renderStep = () => {
    switch (currentStepId) {
      case 'restaurant':
        return <StepRestaurant data={wizardData.restaurant} onChange={(data) => updateWizardData('restaurant', data)} onNext={handleNext} />;
      case 'branding':
        return <StepBranding data={wizardData.branding} restaurantName={wizardData.restaurant.name} restaurantGstin={wizardData.restaurant.gstin} logoPreview={wizardData.restaurant.logoPreview} menu={wizardData.menu} taxConfig={wizardData.taxConfig} onChange={(data) => updateWizardData('branding', data)} onNext={handleNext} onBack={handleBack} />;
      case 'owner':
        return <StepOwner data={wizardData.owner} onChange={(data) => updateWizardData('owner', data)} onNext={handleNext} onBack={handleBack} sessionId={wizardData.sessionId} />;
      case 'yourspace':
        return (
          <StepYourSpace
            restaurantType={wizardData.restaurant.restaurantType}
            venues={wizardData.venues}
            sections={wizardData.sections}
            tables={wizardData.tables}
            onChange={(updates) => setWizardData(prev => ({ ...prev, ...updates }))}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 'staff':
        return (
          <StepStaff
            restaurantType={wizardData.restaurant.restaurantType}
            captains={wizardData.captains}
            cashiers={wizardData.cashiers}
            venues={wizardData.venues || []}
            onChange={(captains, cashiers) => { updateWizardData('captains', captains); updateWizardData('cashiers', cashiers); }}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 'menu':
        return (
          <StepMenu
            restaurantType={wizardData.restaurant.restaurantType}
            taxConfig={wizardData.taxConfig}
            data={wizardData.menu}
            deliveryPlatforms={wizardData.restaurant.deliveryPlatforms || []}
            barConfig={{
              barUnitMl: wizardData.restaurant.barUnitMl,
              halfBottleMl: wizardData.restaurant.halfBottleMl,
              fullBottleMl: wizardData.restaurant.fullBottleMl,
            }}
            onChange={(data) => updateWizardData('menu', data)}
            onDeliveryPlatformsChange={(platforms) => updateWizardData('restaurant', { ...wizardData.restaurant, deliveryPlatforms: platforms })}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 'tax':
        return <StepTax restaurantType={wizardData.restaurant.restaurantType} data={wizardData.taxConfig} sampleItems={wizardData.menu?.categories?.[0]?.items?.slice(0, 2) || []} onChange={(data) => updateWizardData('taxConfig', data)} onNext={handleNext} onBack={handleBack} />;
      case 'printers':
        return (
          <StepPrinters
            restaurantType={wizardData.restaurant.restaurantType}
            printers={wizardData.printers}
            sectionRouting={wizardData.sectionRouting}
            sectionsData={wizardData.sections}
            onChange={(printers, sectionRouting) => { updateWizardData('printers', printers); updateWizardData('sectionRouting', sectionRouting); }}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 'outlets':
        return <StepOutlets outlets={wizardData.outlets} outletCount={wizardData.restaurant.outletCount} parentType={wizardData.restaurant.restaurantType} mainVenues={wizardData.venues} mainMenu={wizardData.menu} onChange={(outlets) => updateWizardData('outlets', outlets)} onNext={handleNext} onBack={handleBack} />;
      case 'plan':
        const summary = {
          tables: (wizardData.tables?.length || 0) + (wizardData.outlets || []).reduce((s, o) => {
            const { tables: oTables } = areasToFlat(o.areas || []);
            return s + oTables.length;
          }, 0),
          staff: (wizardData.captains?.length || 0) + (wizardData.cashiers?.length || 0),
          menuItems: wizardData.menu?.categories?.reduce((s, cat) => s + (cat.items?.length || 0), 0) || 0,
        };
        return <StepPlan selectedPlan={wizardData.selectedPlan} outletCount={wizardData.restaurant.outletCount} wizardSummary={summary} onSelect={(plan) => updateWizardData('selectedPlan', plan)} onNext={handleNext} onBack={handleBack} loading={loading} error={error} />;
      case 'payment':
        return <StepPayment plan={wizardData.selectedPlan} outletCount={wizardData.restaurant.outletCount} sessionId={wizardData.sessionId} ownerEmail={wizardData.owner.email} ownerPhone={wizardData.owner.phone} onPaymentComplete={(ref, proceed) => { updateWizardData('paymentReference', ref); if (proceed) handleNext(); }} onBack={handleBack} onGoToPlan={() => setCurrentStepId('plan')} />;
      case 'confirm':
        return <StepConfirmation wizardData={wizardData} onConfirm={handleSubmit} onBack={handleBack} loading={loading} error={error} onGoToStep={(stepId) => setCurrentStepId(stepId)} onGoToOwnerStep={() => {
          setWizardData(prev => ({ ...prev, owner: { ...prev.owner, emailVerificationProof: undefined, phoneVerificationProof: undefined } }));
          setCurrentStepId('owner');
        }} />;
      default:
        return null;
    }
  };

  if (onboardResult) {
    return (
      <OnboardingSuccess
        onboardResult={onboardResult}
        formData={wizardData}
        onGoToDashboard={handleGoToDashboard}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Set Up Your Restaurant</h1>
          <p className="text-gray-500">Complete these {maxStep} steps to get started</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-start w-full">
            {steps.map((step, idx) => (
              <React.Fragment key={step.id}>
                {/* Step: circle + label stacked */}
                <div className="flex flex-col items-center shrink-0" style={{ minWidth: 0 }}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    currentStepIndex >= idx ? 'bg-[#E53935] text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {currentStepIndex > idx ? '✓' : idx + 1}
                  </div>
                  <span className={`mt-1 text-[10px] text-center leading-tight w-12 ${
                    currentStepIndex === idx ? 'text-[#E53935] font-semibold' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                </div>
                {/* Connector line between steps */}
                {idx < maxStep - 1 && (
                  <div className={`flex-1 h-1 mt-5 mx-1 ${
                    currentStepIndex > idx ? 'bg-[#E53935]' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-2xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.04)] border border-gray-100">
          {renderStep()}
        </div>

        {/* Global Back — most steps have their own, but this covers StepRestaurant */}
        {currentStepId !== 'confirm' && (
          <div className="flex justify-between mt-6">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl transition-all"
            >
              <ChevronLeft size={20} />
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;
