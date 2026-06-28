// ─────────────────────────────────────────────────────────────────────────────
// SettingsPage — Restaurant settings: profile, GST, staff, printer, apps
// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive settings page with sections for:
//   - Restaurant Profile: name, slug, address, phone, GST number
//   - GST Settings: GST registration, category (AC/Non-AC/Takeaway), rates
//   - Staff Management: add/edit/remove users (captains, cashiers, admins)
//   - Printer Settings: QZ Tray config, Windows Print Agent setup
//   - App Downloads: links to Android APKs, desktop apps, print agent
//   - Theme/Branding: logo, colors, receipt header text
//
// Only accessible to ADMIN and OWNER roles. Changes are saved via PATCH /api/restaurant.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import AppsSection from '../settings/AppsSection';
import { apiFetch } from '../../services/apiConfig';
import ManageSpacePanel from '../ManageSpacePanel';
import { useAuth } from '../../context/AuthContext';
import {
  Building2,
  Download,
  Save,
  Check,
  AlertCircle,
  Store,
  Users,
  Palette,
  Receipt,
  Wine,
  Loader2,
} from 'lucide-react';

const BAR_TYPES = ['BAR_LOUNGE', 'BAR_WITH_DINING'];

const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-[#E53935] focus:ring-2 focus:ring-red-100 transition-all';
const labelClass = 'text-sm font-medium text-gray-700 mb-1.5 block';
const cardClass = 'bg-white border border-gray-100 rounded-2xl p-6 space-y-4';
const sectionTitleClass = 'text-base font-bold text-gray-900';
const saveBtnClass =
  'px-6 py-2.5 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50';
const savingBtnClass =
  'px-6 py-2.5 bg-gray-400 text-white rounded-xl text-sm font-bold cursor-not-allowed';

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={20} className="text-[#E53935]" />}
        <h3 className={sectionTitleClass}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SaveButton({ saving, saved, error, onSave, label }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button onClick={onSave} disabled={saving} className={saving ? savingBtnClass : saveBtnClass}>
        {saving ? (
          <span className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Saving…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save size={14} /> {label || 'Save'}
          </span>
        )}
      </button>
      {saved && (
        <span className="flex items-center gap-1 text-sm font-bold text-green-600">
          <Check size={16} /> Saved
        </span>
      )}
      {error && (
        <span className="flex items-center gap-1 text-sm font-medium text-red-600">
          <AlertCircle size={16} /> {error}
        </span>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${checked ? 'bg-[#E53935]' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-6' : ''}`}
        />
      </button>
    </div>
  );
}

function SettingsPage({ onNavigate }) {
  const { restaurant, setRestaurant } = useAuth();
  const [tab, setTab] = useState('general');
  const [showManageSpace, setShowManageSpace] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [tablesCount, setTablesCount] = useState(0);
  const [staffCounts, setStaffCounts] = useState({ captains: 0, cashiers: 0 });

  // Per-section save state
  const [savingSection, setSavingSection] = useState(null);
  const [savedSection, setSavedSection] = useState(null);
  const [sectionError, setSectionError] = useState(null);
  const [sectionErrorName, setSectionErrorName] = useState(null);

  // Form state
  const [profile, setProfile] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    logoUrl: '',
  });
  const [branding, setBranding] = useState({
    receiptHeader: '',
    receiptSubHeader: '',
    fssai: '',
    themePrimary: '#E53935',
    themeSecondary: '#8b5cf6',
  });
  const [tax, setTax] = useState({
    gstRegistered: true,
    gstCategory: 'NON_AC',
    gstRate: null,
    pricesIncludeGst: false,
    serviceChargePercent: 0,
  });
  const [bar, setBar] = useState({
    barUnitMl: 30,
    fullBottleMl: 750,
    halfBottleMl: 375,
  });

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const data = await apiFetch('/api/restaurant/me');
        if (cancelled || !data?.restaurant) return;
        const r = data.restaurant;
        setProfileData(r);
        setTablesCount(data.tables?.length || 0);

        setProfile({
          name: r.name || '',
          address: r.address || '',
          phone: r.phone || '',
          email: r.email || '',
          gstin: r.gstin || '',
          logoUrl: r.logoUrl || '',
        });
        setBranding({
          receiptHeader: r.receiptHeader || '',
          receiptSubHeader: r.receiptSubHeader || '',
          fssai: r.fssai || '',
          themePrimary: r.themePrimary || '#E53935',
          themeSecondary: r.themeSecondary || '#8b5cf6',
        });
        setTax({
          gstRegistered: r.gstRegistered ?? true,
          gstCategory: r.gstCategory || 'NON_AC',
          gstRate: r.gstRate ?? null,
          pricesIncludeGst: r.pricesIncludeGst ?? false,
          serviceChargePercent: r.serviceChargePercent ?? 0,
        });
        setBar({
          barUnitMl: r.barUnitMl ?? 30,
          fullBottleMl: r.fullBottleMl ?? 750,
          halfBottleMl: r.halfBottleMl ?? 375,
        });

        // Load staff counts
        try {
          const slug = r.slug || r.restaurantCode;
          if (slug) {
            const [captainsData, cashiersData] = await Promise.all([
              apiFetch(`/api/restaurant/${slug}/staff?role=CAPTAIN`),
              apiFetch(`/api/restaurant/${slug}/staff?role=CASHIER`),
            ]);
            setStaffCounts({
              captains: captainsData?.staff?.length || 0,
              cashiers: cashiersData?.staff?.length || 0,
            });
          }
        } catch {
          // Staff count is non-critical
        }
      } catch (err) {
        console.error('[SettingsPage] Failed to load restaurant data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (sectionName, fields, payload) => {
    setSavingSection(sectionName);
    setSavedSection(null);
    setSectionError(null);
    setSectionErrorName(null);
    try {
      const updated = await apiFetch('/api/restaurant/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setRestaurant(updated);
      setSavedSection(sectionName);
      setTimeout(() => setSavedSection(null), 3000);
    } catch (err) {
      setSectionError(err.message || 'Failed to save');
      setSectionErrorName(sectionName);
    } finally {
      setSavingSection(null);
    }
  };

  const restaurantType = profileData?.restaurantType;
  const isBarType = BAR_TYPES.includes(restaurantType);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-[#E53935]" />
      </div>
    );
  }

  if (showManageSpace) {
    return (
      <div className="p-4 md:p-6 font-sans max-w-5xl mx-auto">
        <ManageSpacePanel onBack={() => setShowManageSpace(false)} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 font-sans max-w-5xl mx-auto space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setTab('general')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${tab === 'general' ? 'bg-red-50 text-[#E53935]' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Building2 size={16} />
          Restaurant Settings
        </button>
        <button
          onClick={() => setTab('apps')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${tab === 'apps' ? 'bg-red-50 text-[#E53935]' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Download size={16} />
          Download Apps
        </button>
      </div>

      {tab === 'general' && (
        <div className="space-y-6">
          {/* Section 1: Restaurant Profile */}
          <SectionCard title="Restaurant Profile" icon={Store}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Restaurant Name</label>
                <input
                  className={inputClass}
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  className={inputClass}
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  className={inputClass}
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>GSTIN</label>
                <input
                  className={inputClass}
                  value={profile.gstin}
                  onChange={(e) => setProfile({ ...profile, gstin: e.target.value.toUpperCase() })}
                  maxLength={15}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Address</label>
                <textarea
                  rows={2}
                  className={inputClass + ' resize-none'}
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Logo URL</label>
                <div className="flex items-center gap-3">
                  {profile.logoUrl && (
                    <img
                      src={profile.logoUrl}
                      alt="Logo"
                      className="w-12 h-12 object-contain rounded-lg border border-gray-200"
                    />
                  )}
                  <input
                    className={inputClass}
                    value={profile.logoUrl}
                    onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
            <SaveButton
              saving={savingSection === 'profile'}
              saved={savedSection === 'profile'}
              error={sectionErrorName === 'profile' ? sectionError : null}
              onSave={() => handleSave('profile', profile, profile)}
            />
          </SectionCard>

          {/* Section 2: Branding & Receipt */}
          <SectionCard title="Branding & Receipt" icon={Palette}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Receipt Header (Line 1)</label>
                <input
                  className={inputClass}
                  value={branding.receiptHeader}
                  onChange={(e) => setBranding({ ...branding, receiptHeader: e.target.value })}
                  placeholder="e.g. YOUR RESTAURANT NAME"
                />
              </div>
              <div>
                <label className={labelClass}>Receipt Sub-Header (Line 2)</label>
                <input
                  className={inputClass}
                  value={branding.receiptSubHeader}
                  onChange={(e) => setBranding({ ...branding, receiptSubHeader: e.target.value })}
                  placeholder="e.g. Since 1990 | Fine Dining"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>FSSAI Number</label>
                <input
                  className={inputClass}
                  value={branding.fssai}
                  onChange={(e) =>
                    setBranding({ ...branding, fssai: e.target.value.replace(/\D/g, '').slice(0, 14) })
                  }
                  placeholder="14-digit FSSAI license number"
                  maxLength={14}
                />
              </div>
              <div>
                <label className={labelClass}>Theme Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="w-12 h-12 rounded-xl border border-gray-300 cursor-pointer"
                    value={branding.themePrimary}
                    onChange={(e) => setBranding({ ...branding, themePrimary: e.target.value })}
                  />
                  <input
                    className={inputClass}
                    value={branding.themePrimary}
                    onChange={(e) => setBranding({ ...branding, themePrimary: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Theme Secondary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="w-12 h-12 rounded-xl border border-gray-300 cursor-pointer"
                    value={branding.themeSecondary}
                    onChange={(e) => setBranding({ ...branding, themeSecondary: e.target.value })}
                  />
                  <input
                    className={inputClass}
                    value={branding.themeSecondary}
                    onChange={(e) => setBranding({ ...branding, themeSecondary: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Live Receipt Header Preview */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Receipt Header Preview</p>
              <div className="text-center py-3 border-2 border-dashed rounded-lg" style={{ borderColor: branding.themePrimary }}>
                <div className="font-bold uppercase text-sm" style={{ color: branding.themePrimary }}>
                  {branding.receiptHeader || 'Your Restaurant Name'}
                </div>
                {branding.receiptSubHeader && (
                  <div className="text-gray-500 text-xs mt-0.5">{branding.receiptSubHeader}</div>
                )}
              </div>
            </div>

            <SaveButton
              saving={savingSection === 'branding'}
              saved={savedSection === 'branding'}
              error={sectionErrorName === 'branding' ? sectionError : null}
              onSave={() => handleSave('branding', branding, branding)}
            />
          </SectionCard>

          {/* Section 3: GST & Tax Settings */}
          <SectionCard title="GST & Tax Settings" icon={Receipt}>
            <div className="space-y-4">
              <Toggle
                checked={tax.gstRegistered}
                onChange={(val) => setTax({ ...tax, gstRegistered: val })}
                label="GST Registered"
                description="If off, no GST will be shown on bills"
              />

              {tax.gstRegistered && (
                <>
                  <div>
                    <label className={labelClass}>GST Category</label>
                    <select
                      className={inputClass}
                      value={tax.gstCategory}
                      onChange={(e) => setTax({ ...tax, gstCategory: e.target.value })}
                    >
                      <option value="NON_AC">Non-AC / Standalone (5%)</option>
                      <option value="AC">AC Restaurant (18%)</option>
                      <option value="TAKEAWAY">Takeaway / Parcel only (5%)</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>
                      GST Rate Override (%){' '}
                      <span className="text-gray-400 font-normal">(leave empty for auto from category)</span>
                    </label>
                    <input
                      type="number"
                      className={inputClass}
                      value={tax.gstRate ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTax({ ...tax, gstRate: val === '' ? null : Math.min(100, Math.max(0, parseFloat(val) || 0)) });
                      }}
                      placeholder="Auto"
                      min="0"
                      max="100"
                      step="0.5"
                    />
                  </div>

                  <Toggle
                    checked={tax.pricesIncludeGst}
                    onChange={(val) => setTax({ ...tax, pricesIncludeGst: val })}
                    label="Prices Include GST"
                    description="Menu prices already include GST (no extra charge at billing)"
                  />
                </>
              )}

              <div>
                <label className={labelClass}>Service Charge (%)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={tax.serviceChargePercent === 0 ? '' : tax.serviceChargePercent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTax({ ...tax, serviceChargePercent: val === '' ? 0 : Math.min(20, Math.max(0, parseFloat(val) || 0)) });
                  }}
                  placeholder="0"
                  min="0"
                  max="20"
                  step="0.5"
                />
              </div>
            </div>

            <SaveButton
              saving={savingSection === 'tax'}
              saved={savedSection === 'tax'}
              error={sectionErrorName === 'tax' ? sectionError : null}
              onSave={() => handleSave('tax', tax, tax)}
            />
          </SectionCard>

          {/* Section 4: Bar Configuration (only for bar types) */}
          {isBarType && (
            <SectionCard title="Bar Configuration" icon={Wine}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Default Pour Size (ML)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={bar.barUnitMl}
                    onChange={(e) => setBar({ ...bar, barUnitMl: Math.max(1, parseInt(e.target.value) || 1) })}
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className={labelClass}>Full Bottle Size (ML)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={bar.fullBottleMl}
                    onChange={(e) => setBar({ ...bar, fullBottleMl: Math.max(1, parseInt(e.target.value) || 1) })}
                    placeholder="750"
                  />
                </div>
                <div>
                  <label className={labelClass}>Half Bottle Size (ML)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={bar.halfBottleMl}
                    onChange={(e) => setBar({ ...bar, halfBottleMl: Math.max(1, parseInt(e.target.value) || 1) })}
                    placeholder="375"
                  />
                </div>
              </div>
              <SaveButton
                saving={savingSection === 'bar'}
                saved={savedSection === 'bar'}
                error={sectionErrorName === 'bar' ? sectionError : null}
                onSave={() => handleSave('bar', bar, bar)}
              />
            </SectionCard>
          )}

          {/* Section 5: Tables & Space */}
          <SectionCard title="Tables & Space" icon={Store}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  <span className="font-bold text-gray-900">{tablesCount}</span> tables configured
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Manage your floor plan, sections, and table layout</p>
              </div>
              <button
                onClick={() => setShowManageSpace(true)}
                className="px-4 py-2 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-xl text-sm font-bold transition-all"
              >
                Manage Space
              </button>
            </div>
          </SectionCard>

          {/* Section 6: Staff */}
          <SectionCard title="Staff" icon={Users}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  <span className="font-bold text-gray-900">{staffCounts.captains}</span> captains ·{' '}
                  <span className="font-bold text-gray-900">{staffCounts.cashiers}</span> cashiers
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Manage staff, roles, and PINs</p>
              </div>
              <button
                onClick={() => onNavigate?.('staff')}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-sm font-bold transition-all"
              >
                Manage Staff
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      {tab === 'apps' && <AppsSection />}
    </div>
  );
}

export default SettingsPage;
