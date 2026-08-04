import React from 'react';
import { ChevronLeft, CheckCircle, Loader2 } from 'lucide-react';

const Section = ({ title, children }) => (
  <div className="mb-6">
    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h3>
    <div className="bg-gray-50 rounded-xl p-4 space-y-2">{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-900">{value || '—'}</span>
  </div>
);

const StepPreview = ({ wizardData, onBack, onConfirm, loading, error }) => {
  const { restaurant, owner, captains, cashiers, sections, tables, menu, selectedPlan } = wizardData;
  const totalItems = menu.categories.reduce((sum, cat) => sum + cat.items.length, 0);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Preview & Confirm</h2>
        <p className="text-gray-500 text-sm">Review your setup before launching your restaurant.</p>
      </div>

      <Section title="Restaurant">
        <Row label="Name" value={restaurant.name} />
        <Row label="Address" value={restaurant.address} />
        <Row label="Phone" value={restaurant.phone} />
        <Row label="Email" value={restaurant.email} />
        <Row label="GSTIN" value={restaurant.gstin} />
      </Section>

      <Section title="Owner Account">
        <Row label="Name" value={owner.name} />
        <Row label="Email" value={owner.email} />
      </Section>

      <Section title="Staff">
        <Row label="Captains" value={`${captains.length} (${captains.map(c => c.name).join(', ')})`} />
        <Row label="Cashiers" value={`${cashiers.length} (${cashiers.map(c => c.name).join(', ')})`} />
      </Section>

      <Section title="Floor Plan">
        <Row label="Sections" value={`${sections.length} (${sections.map(s => s.name).join(', ')})`} />
        <Row label="Tables" value={tables.length} />
      </Section>

      <Section title="Menu">
        <Row label="Categories" value={menu.categories.length} />
        <Row label="Total Items" value={totalItems} />
      </Section>

      <Section title="Plan">
        <Row label="Selected Plan" value={selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} />
      </Section>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl transition-all disabled:opacity-50"
        >
          <ChevronLeft size={20} />
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl transition-all disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Launching...
            </>
          ) : (
            <>
              <CheckCircle size={20} />
              Confirm & Launch
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default StepPreview;
