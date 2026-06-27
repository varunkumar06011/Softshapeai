import React, { useState } from 'react';
import { CheckCircle, ArrowLeft, ArrowRight, Printer, Store, Users, Layout, Utensils, CreditCard, FileText, Loader2, Receipt, XCircle, Pencil, ChevronDown, ChevronUp, Eye, EyeOff, MapPin, Building2 } from 'lucide-react';

const RESTAURANT_TYPE_LABELS = {
  DINE_IN: 'Dine-in Restaurant',
  BAR_LOUNGE: 'Bar & Lounge',
  BAR_WITH_DINING: 'Bar with Dining',
  CAFE: 'Cafe',
  CLOUD_KITCHEN: 'Cloud Kitchen',
};

const StepConfirmation = ({ wizardData, onConfirm, onBack, loading, error, onGoToStep, onGoToOwnerStep }) => {
  const { restaurant, owner, captains, cashiers, sections, tables, menu, selectedPlan, outlets, outletCount, taxConfig, printers } = wizardData;
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(wizardData.owner?.termsAccepted || false);

  const planLabels = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };

  const totalTables = tables.length + (outlets || []).reduce((sum, o) => sum + o.tables.length, 0);
  const totalCaptains = captains.length;
  const totalCashiers = cashiers.length;
  const totalMenuItems = menu.categories.reduce((sum, cat) => sum + cat.items.length, 0);

  const firstSection = sections[0]?.name || 'Main Hall';
  const firstTable = tables[0]?.number || 1;
  const sampleItems = menu.categories.flatMap(cat => cat.items).slice(0, 3);
  const sampleSubtotal = sampleItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const effectiveTaxConfig = taxConfig || { gstCategory: 'NON_AC', pricesIncludeGst: false };
  const isAcPreview = String(effectiveTaxConfig.gstCategory).toUpperCase() === 'AC';
  const sampleGstRate = isAcPreview ? 0.18 : 0.05;
  const sampleGstAmount = effectiveTaxConfig.pricesIncludeGst
    ? Math.round((sampleSubtotal - sampleSubtotal / (1 + sampleGstRate)) * 100) / 100
    : Math.round(sampleSubtotal * sampleGstRate * 100) / 100;
  const sampleTotal = effectiveTaxConfig.pricesIncludeGst ? sampleSubtotal : Math.round((sampleSubtotal + sampleGstAmount) * 100) / 100;
  const sampleDisplayedSubtotal = Math.round((sampleTotal - sampleGstAmount) * 100) / 100;

  const now = new Date();
  const istTime = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  const istDate = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

  const EditLink = ({ stepId, label }) => (
    onGoToStep ? (
      <button onClick={() => onGoToStep(stepId)} className="text-xs text-[#E53935] hover:text-[#B71C1C] font-medium flex items-center gap-1 ml-auto">
        <Pencil size={12} /> {label}
      </button>
    ) : null
  );

  const SectionHeader = ({ icon, title, stepId, editLabel }) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        {icon} {title}
      </div>
      <EditLink stepId={stepId} label={editLabel || 'Edit'} />
    </div>
  );

  const NotProvided = () => <span className="text-gray-400 italic">Not provided</span>;

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
        <SectionHeader icon={<Store size={18} className="text-[#E53935]" />} title="Restaurant Information" stepId="restaurant" />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-400">Name:</span> <span className="font-medium text-gray-900">{restaurant.name}</span></div>
          <div><span className="text-gray-400">Type:</span> <span className="font-medium text-gray-900">{RESTAURANT_TYPE_LABELS[restaurant.restaurantType]}</span></div>
          <div><span className="text-gray-400">Phone:</span> <span className="font-medium text-gray-900">{restaurant.phone}</span></div>
          <div><span className="text-gray-400">Outlets:</span> <span className="font-medium text-gray-900">{outletCount}</span></div>
          <div><span className="text-gray-400">GSTIN:</span> <span className="font-mono font-medium text-gray-900">{restaurant.gstin || <NotProvided />}</span></div>
          <div><span className="text-gray-400">Email:</span> <span className="font-medium text-gray-900">{restaurant.email || <NotProvided />}</span></div>
          <div className="col-span-2"><span className="text-gray-400">Address:</span> <span className="font-medium text-gray-900">{restaurant.address || <NotProvided />}</span></div>
        </div>
      </div>

      {/* Owner & Staff Summary */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <SectionHeader icon={<Users size={18} className="text-[#E53935]" />} title="Owner & Staff" stepId="staff" />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-400">Owner:</span> <span className="font-medium text-gray-900">{owner.name}</span></div>
          <div><span className="text-gray-400">Owner Email:</span> <span className="font-medium text-gray-900">{owner.email}</span></div>
          <div><span className="text-gray-400">Captains:</span> <span className="font-medium text-gray-900">{totalCaptains}</span></div>
          <div><span className="text-gray-400">Cashiers:</span> <span className="font-medium text-gray-900">{totalCashiers}</span></div>
        </div>
        {(captains?.length > 0 || cashiers?.length > 0) && (
          <div className="pt-2 border-t border-gray-200">
            <button onClick={() => setShowPins(!showPins)} className="text-xs text-[#E53935] hover:text-[#B71C1C] font-medium flex items-center gap-1">
              {showPins ? <EyeOff size={12} /> : <Eye size={12} />}
              {showPins ? 'Hide staff PINs' : 'View staff PINs'}
            </button>
            {showPins && (
              <div className="mt-2 bg-white rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-3 py-2 text-gray-400 font-bold uppercase">Role</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-bold uppercase">Name</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-bold uppercase">PIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {captains.map((c, i) => (
                      <tr key={`cap-${i}`} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-500">Captain</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
                        <td className="px-3 py-2 font-mono font-bold text-[#E53935]">{c.pin}</td>
                      </tr>
                    ))}
                    {cashiers.map((c, i) => (
                      <tr key={`cash-${i}`} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-500">Cashier</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
                        <td className="px-3 py-2 font-mono font-bold text-[#E53935]">{c.pin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Your Space Summary — Visual Tree */}
      {wizardData.restaurant?.restaurantType !== 'CLOUD_KITCHEN' && (() => {
        const venues = wizardData.venues || [];
        const hasVenues = venues.length > 0;
        const flatSections = wizardData.sections || [];
        const flatTables = wizardData.tables || [];

        if (!hasVenues && flatSections.length === 0) return null;

        return (
          <div className="bg-gray-50 rounded-xl p-5 space-y-3">
            <SectionHeader icon={<Layout size={18} className="text-[#E53935]" />} title="Your Space" stepId="yourspace" />
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Building2 size={16} className="text-gray-500" />
                Your Account — {restaurant.name}
              </div>
              <div className="flex items-center gap-2 text-gray-700 ml-4">
                <Store size={14} className="text-gray-400" />
                {restaurant.name} (Main Outlet)
              </div>
              {hasVenues ? (
                venues.map((venue, vi) => {
                  const allSections = [
                    ...(venue.floors || []).flatMap(f => f.sections || []),
                    ...(venue.sections || [])
                  ];
                  const sectionCount = allSections.length;
                  const tableCount = allSections.reduce((sum, s) => sum + (s.tables?.length || 0), 0);
                  const seatCount = allSections.reduce((sum, s) => sum + (s.tables || []).reduce((ss, t) => ss + (t.capacity || 0), 0), 0);
                  return (
                    <div key={vi} className="ml-8">
                      <div className="flex items-center gap-2 text-gray-700">
                        <MapPin size={14} className="text-[#E53935]" />
                        <span className="font-medium">{venue.name}</span>
                        <span className="text-gray-400 text-xs">{sectionCount} section{sectionCount !== 1 ? 's' : ''} · {tableCount} table{tableCount !== 1 ? 's' : ''} · {seatCount} seat{seatCount !== 1 ? 's' : ''}</span>
                      </div>
                      {allSections.map((section, si) => {
                        const secTables = section.tables || [];
                        const secSeats = secTables.reduce((sum, t) => sum + (t.capacity || 0), 0);
                        return (
                          <div key={si} className="ml-6 text-gray-500 text-xs flex items-center gap-1">
                            <span className="text-gray-300">└</span>
                            <span>{section.name}</span>
                            <span className="text-gray-400">— {secTables.length} table{secTables.length !== 1 ? 's' : ''} · {secSeats} seat{secSeats !== 1 ? 's' : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              ) : (
                <div className="ml-8">
                  <div className="flex items-center gap-2 text-gray-700">
                    <MapPin size={14} className="text-[#E53935]" />
                    <span className="font-medium">Main Area</span>
                    <span className="text-gray-400 text-xs">{flatSections.length} section{flatSections.length !== 1 ? 's' : ''} · {flatTables.length} table{flatTables.length !== 1 ? 's' : ''}</span>
                  </div>
                  {flatSections.map((section, si) => {
                    const secTables = flatTables.filter(t => t.sectionIndex === si);
                    const secSeats = secTables.reduce((sum, t) => sum + (t.capacity || 0), 0);
                    return (
                      <div key={si} className="ml-6 text-gray-500 text-xs flex items-center gap-1">
                        <span className="text-gray-300">└</span>
                        <span>{section.name}</span>
                        <span className="text-gray-400">— {secTables.length} table{secTables.length !== 1 ? 's' : ''} · {secSeats} seat{secSeats !== 1 ? 's' : ''}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {outlets && outlets.length > 0 && (
                <div className="text-xs text-gray-400 mt-2 ml-4">
                  Additional Outlets: {outlets.map(o => o.name).join(', ')}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Menu Summary */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <SectionHeader icon={<Utensils size={18} className="text-[#E53935]" />} title="Menu" stepId="menu" />
        <div className="text-sm">
          <span className="text-gray-400">Categories:</span> <span className="font-medium text-gray-900">{menu.categories.length}</span>
          <span className="text-gray-400 ml-3">Items:</span> <span className="font-medium text-gray-900">{totalMenuItems}</span>
        </div>
        <div className="text-sm text-gray-400">
          {menu.categories.map(cat => `${cat.name} (${cat.items.length})`).join(' • ')}
        </div>
      </div>

      {/* Tax Summary */}
      {taxConfig && (
        <div className="bg-gray-50 rounded-xl p-5 space-y-3">
          <SectionHeader icon={<Receipt size={18} className="text-[#E53935]" />} title="Tax & GST" stepId="tax" />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-400">GST Registered:</span> <span className="font-medium text-gray-900">{taxConfig.gstRegistered ? 'Yes' : 'No'}</span></div>
            {taxConfig.gstRegistered && (
              <>
                <div><span className="text-gray-400">Category:</span> <span className="font-medium text-gray-900">{taxConfig.gstCategory || 'NON_AC'}</span></div>
                <div><span className="text-gray-400">Prices:</span> <span className="font-medium text-gray-900">{taxConfig.pricesIncludeGst ? 'Inclusive' : 'Exclusive'}</span></div>
              </>
            )}
            {taxConfig.serviceChargePercent > 0 && (
              <div><span className="text-gray-400">Service Charge:</span> <span className="font-medium text-gray-900">{taxConfig.serviceChargePercent}%</span></div>
            )}
            {taxConfig.packagingCharge > 0 && (
              <div><span className="text-gray-400">Packaging:</span> <span className="font-medium text-gray-900">₹{taxConfig.packagingCharge}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Printers Summary */}
      {printers && printers.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-5 space-y-3">
          <SectionHeader icon={<Printer size={18} className="text-[#E53935]" />} title="Printers" stepId="printers" />
          <div className="text-sm">
            {printers.map((p, i) => (
              <span key={i} className="inline-block mr-3">
                <span className="font-medium text-gray-900">{p.name}</span>
                <span className="text-gray-400 text-xs"> ({p.type}, {p.paperWidth})</span>
              </span>
            ))}
          </div>
        </div>
      )}

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
        <button
          onClick={() => setShowPrintPreview(!showPrintPreview)}
          className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-all"
        >
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-[#E53935]" /> Sample Print Formats
          </div>
          {showPrintPreview ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {showPrintPreview && (
          <div>
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
                  <span>₹{sampleDisplayedSubtotal}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>GST ({isAcPreview ? '18%' : '5%'})</span>
                  <span>₹{sampleGstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>Total</span>
                  <span>₹{sampleTotal.toFixed(2)}</span>
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
        )}
      </div>

      {/* Terms checkbox */}
      <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
        <input
          id="terms"
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="w-5 h-5 mt-0.5 text-[#E53935] rounded border-gray-300"
        />
        <label htmlFor="terms" className="text-sm text-gray-600">
          I agree to the <a href="/terms" target="_blank" className="text-[#E53935] hover:underline">Terms of Service</a> and <a href="/privacy" target="_blank" className="text-[#E53935] hover:underline">Privacy Policy</a>.
        </label>
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
          disabled={loading || !termsAccepted}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            !loading && termsAccepted
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
