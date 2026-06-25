import React from 'react';
import { CheckCircle, ArrowLeft, ArrowRight, Printer, Store, Users, Layout, Utensils, CreditCard, FileText, Loader2, Receipt, XCircle } from 'lucide-react';

const RESTAURANT_TYPE_LABELS = {
  DINE_IN: 'Dine-in Restaurant',
  BAR_LOUNGE: 'Bar & Lounge',
  BAR_WITH_DINING: 'Bar with Dining',
  CAFE: 'Cafe',
  CLOUD_KITCHEN: 'Cloud Kitchen',
};

const StepConfirmation = ({ wizardData, onConfirm, onBack, loading, error, onGoToOwnerStep }) => {
  const { restaurant, owner, captains, cashiers, sections, tables, menu, selectedPlan, outlets, outletCount } = wizardData;

  const planLabels = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };

  const totalTables = tables.length + (outlets || []).reduce((sum, o) => sum + o.tables.length, 0);
  const totalCaptains = captains.length;
  const totalCashiers = cashiers.length;
  const totalMenuItems = menu.categories.reduce((sum, cat) => sum + cat.items.length, 0);

  const firstSection = sections[0]?.name || 'Main Hall';
  const firstTable = tables[0]?.number || 1;
  const sampleItems = menu.categories.flatMap(cat => cat.items).slice(0, 3);

  const now = new Date();
  const istTime = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  const istDate = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <CheckCircle size={48} className="mx-auto text-green-600 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Review & Confirm</h2>
        <p className="text-gray-500">Please review your configuration before creating your restaurant</p>
      </div>

      {error && (() => {
        const isVerificationExpired =
          error.toLowerCase().includes('verification') &&
          (error.toLowerCase().includes('expired') || error.toLowerCase().includes('invalid'));
        return (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-600 space-y-2">
            {isVerificationExpired ? (
              <>
                <p>Your email or phone verification has expired (2 hour limit). Please go back to Step 2 and re-verify.</p>
                <button
                  onClick={onGoToOwnerStep}
                  className="text-sm font-semibold underline text-red-700 hover:text-red-900"
                >
                  Go Back to Verify
                </button>
              </>
            ) : (
              error
            )}
          </div>
        );
      })()}

      {/* Restaurant Info Summary */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Store size={18} className="text-[#E53935]" /> Restaurant Information
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-400">Name:</span> <span className="font-medium text-gray-900">{restaurant.name}</span></div>
          <div><span className="text-gray-400">Type:</span> <span className="font-medium text-gray-900">{RESTAURANT_TYPE_LABELS[restaurant.restaurantType]}</span></div>
          <div><span className="text-gray-400">Phone:</span> <span className="font-medium text-gray-900">{restaurant.phone}</span></div>
          <div><span className="text-gray-400">Outlets:</span> <span className="font-medium text-gray-900">{outletCount}</span></div>
          <div><span className="text-gray-400">GSTIN:</span> <span className="font-mono font-medium text-gray-900">{restaurant.gstin}</span></div>
          {restaurant.email && <div><span className="text-gray-400">Email:</span> <span className="font-medium text-gray-900">{restaurant.email}</span></div>}
          {restaurant.address && <div className="col-span-2"><span className="text-gray-400">Address:</span> <span className="font-medium text-gray-900">{restaurant.address}</span></div>}
        </div>
      </div>

      {/* Owner & Staff Summary */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Users size={18} className="text-[#E53935]" /> Owner & Staff
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-400">Owner:</span> <span className="font-medium text-gray-900">{owner.name}</span></div>
          <div><span className="text-gray-400">Owner Email:</span> <span className="font-medium text-gray-900">{owner.email}</span></div>
          <div><span className="text-gray-400">Captains:</span> <span className="font-medium text-gray-900">{totalCaptains}</span></div>
          <div><span className="text-gray-400">Cashiers:</span> <span className="font-medium text-gray-900">{totalCashiers}</span></div>
        </div>
      </div>

      {/* Floor Plan Summary */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Layout size={18} className="text-[#E53935]" /> Floor Plan
        </div>
        <div className="text-sm">
          <span className="text-gray-400">Sections:</span> <span className="font-medium text-gray-900">{sections.map(s => s.name).join(', ')}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-400">Total Tables:</span> <span className="font-medium text-gray-900">{totalTables}</span>
        </div>
        {outlets && outlets.length > 0 && (
          <div className="text-sm">
            <span className="text-gray-400">Additional Outlets:</span> <span className="font-medium text-gray-900">{outlets.map(o => o.name).join(', ')}</span>
          </div>
        )}
      </div>

      {/* Menu Summary */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Utensils size={18} className="text-[#E53935]" /> Menu
        </div>
        <div className="text-sm">
          <span className="text-gray-400">Categories:</span> <span className="font-medium text-gray-900">{menu.categories.length}</span>
          <span className="text-gray-400 ml-3">Items:</span> <span className="font-medium text-gray-900">{totalMenuItems}</span>
        </div>
        <div className="text-sm text-gray-400">
          {menu.categories.map(cat => `${cat.name} (${cat.items.length})`).join(' • ')}
        </div>
      </div>

      {/* Plan Summary */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <CreditCard size={18} className="text-[#E53935]" /> Selected Plan
        </div>
        <div className="text-sm">
          <span className="font-medium text-gray-900 text-lg">{planLabels[selectedPlan]}</span>
          <span className="text-gray-400 ml-2">({outletCount} outlet{outletCount > 1 ? 's' : ''})</span>
        </div>
      </div>

      {/* Print Previews */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Printer size={18} className="text-[#E53935]" /> Sample Print Formats
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* KOT Preview */}
          <PrintPreview title="KOT" icon={<Printer size={14} />}>
            <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
              <div className="font-bold uppercase">{restaurant.name || 'Your Restaurant'}</div>
              <div className="text-gray-500">{firstSection}</div>
            </div>
            <div className="flex justify-between mb-2 text-xs">
              <span>Table: <strong>T{firstTable}</strong></span>
              <span>KOT #001</span>
            </div>
            <div className="flex justify-between mb-2 text-gray-500 text-xs">
              <span>{istDate}</span>
              <span>{istTime}</span>
            </div>
            <div className="border-t border-dashed border-gray-300 pt-2">
              <div className="flex justify-between text-xs font-semibold pb-1">
                <span>Item</span>
                <span>Qty</span>
              </div>
              {sampleItems.map((item, i) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span className={item.isVeg ? 'text-green-700' : 'text-red-700'}>
                    {item.isVeg ? 'V' : 'NV'} {item.name || `Item ${i + 1}`}
                  </span>
                  <span>1</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-gray-300 mt-2 pt-2 text-center text-gray-500 text-xs">
              --- Kitchen Order Ticket ---
            </div>
          </PrintPreview>

          {/* Final Bill Preview */}
          <PrintPreview title="Final Bill" icon={<Receipt size={14} />}>
            <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
              <div className="font-bold uppercase">{restaurant.name || 'Your Restaurant'}</div>
              <div className="text-gray-500 text-xs">{restaurant.address || 'Restaurant Address'}</div>
              <div className="text-gray-500 text-xs">GSTIN: {restaurant.gstin || 'N/A'}</div>
            </div>
            <div className="flex justify-between mb-2 text-xs text-gray-500">
              <span>Table: T{firstTable}</span>
              <span>{istDate} {istTime}</span>
            </div>
            <div className="border-t border-dashed border-gray-300 pt-2">
              <div className="flex justify-between text-xs font-semibold pb-1">
                <span>Item</span>
                <span>Amount</span>
              </div>
              {sampleItems.map((item, i) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span>{item.name || `Item ${i + 1}`} x 1</span>
                  <span>₹{item.price || 0}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-gray-300 mt-2 pt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Subtotal</span>
                  <span>₹{sampleItems.reduce((sum, item) => sum + (item.price || 0), 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>GST (5%)</span>
                  <span>₹{(sampleItems.reduce((sum, item) => sum + (item.price || 0), 0) * 0.05).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>Total</span>
                  <span>₹{(sampleItems.reduce((sum, item) => sum + (item.price || 0), 0) * 1.05).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="border-t border-dashed border-gray-300 mt-2 pt-2 text-center text-gray-500 text-xs">
              Thank you! Visit again.
            </div>
          </PrintPreview>

          {/* Cancel Bill Preview */}
          <PrintPreview title="Cancel Bill" icon={<XCircle size={14} />}>
            <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
              <div className="font-bold uppercase text-red-700">CANCELLED</div>
              <div className="font-bold uppercase">{restaurant.name || 'Your Restaurant'}</div>
            </div>
            <div className="flex justify-between mb-2 text-xs text-gray-500">
              <span>Table: T{firstTable}</span>
              <span>{istDate} {istTime}</span>
            </div>
            <div className="border-t border-dashed border-gray-300 pt-2">
              <div className="flex justify-between text-xs font-semibold pb-1">
                <span>Voided Item</span>
                <span>Qty</span>
              </div>
              {sampleItems.slice(0, 2).map((item, i) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span className="line-through text-red-700">
                    {item.name || `Item ${i + 1}`}
                  </span>
                  <span>1</span>
                </div>
              ))}
              <div className="border-t border-dashed border-gray-300 mt-2 pt-2 text-xs text-center text-red-700">
                Reason: Customer request
              </div>
              <div className="text-xs text-center text-gray-500 mt-1">
                Cancelled by: {captains[0]?.name || 'Captain'}
              </div>
            </div>
            <div className="border-t border-dashed border-gray-300 mt-2 pt-2 text-center text-gray-500 text-xs">
              --- Void/Cancel Bill ---
            </div>
          </PrintPreview>
        </div>
        <p className="text-xs text-gray-400 text-center">These are how your kitchen, final, and cancel bills will appear when printed</p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            !loading
              ? 'bg-[#E53935] hover:bg-[#B71C1C] text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Creating Restaurant...
            </>
          ) : (
            <>
              Confirm & Create Restaurant
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

function PrintPreview({ title, icon, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700">
        <span className="text-[#E53935]">{icon}</span>
        {title}
      </div>
      <div className="bg-white border border-gray-300 rounded-lg p-3 font-mono text-xs text-gray-900 mx-auto" style={{ maxWidth: '220px' }}>
        {children}
      </div>
    </div>
  );
}

export default StepConfirmation;
