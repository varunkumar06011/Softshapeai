import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  CheckCircle2, Copy, Check, ArrowRight, Store, Users, ShieldCheck,
  LayoutDashboard, CreditCard, Printer, Utensils, Layout, Check as CheckIcon,
  Smartphone, Mail, RotateCw, ChevronRight, Download, Monitor
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const OnboardingSuccess = ({ onboardResult, formData, onGoToDashboard }) => {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCashierCode, setCopiedCashierCode] = useState(false);
  const [copiedCaptainCode, setCopiedCaptainCode] = useState(false);

  const restaurant = onboardResult?.restaurant || {};
  const user = onboardResult?.user || {};
  const token = onboardResult?.token;
  const restaurantType = formData?.restaurant?.restaurantType || restaurant?.restaurantType || '';
  const isCloud = restaurantType === 'CLOUD_KITCHEN';
  const isCafe = restaurantType === 'CAFE';
  const showCaptainCard = !isCloud && !isCafe;

  // Auto-log the owner in so /admin navigation works without a second login
  useEffect(() => {
    if (token && user && restaurant) {
      setAuth({ token, user, restaurant });
    }
  }, [token, user, restaurant, setAuth]);

  const handleCopyCode = (code, setter) => {
    navigator.clipboard.writeText(code);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const [emailSent, setEmailSent] = useState(false);
  const [emailResending, setEmailResending] = useState(false);

  const handleResendEmail = async () => {
    setEmailResending(true);
    try {
      await fetch('/api/onboard/resend-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, restaurantCode: restaurant.restaurantCode }),
      });
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 3000);
    } catch {
      // silently fail
    } finally {
      setEmailResending(false);
    }
  };

  const totalMenuItems = formData?.menu?.categories?.reduce(
    (sum, cat) => sum + (cat?.items?.length || 0), 0
  ) || 0;

  const planLabel = (restaurant.plan || 'starter').toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 px-4 py-10">
      {/* ── Normal UI (hidden when printing) ── */}
      <div className="print:hidden max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="bg-white rounded-3xl p-10 shadow-[0_32px_64px_rgba(0,0,0,0.06)] border border-gray-100 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={48} className="text-green-600" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-3 tracking-tight">
            🎉 {restaurant.name || 'Your Restaurant'} is live on Softshape!
          </h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Your restaurant OS is ready. Share the credentials below with your team.
          </p>
        </div>

        {/* Credentials Card */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.06)] border border-gray-100">
          <h2 className="text-lg font-black mb-5 flex items-center gap-2 uppercase tracking-widest">
            <ShieldCheck size={20} className="text-[#E53935]" /> Restaurant Credentials
          </h2>

          <div className="bg-[#F8F9FA] border border-gray-200 rounded-2xl p-6 mb-4">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Restaurant Code</p>
            <div className="flex items-center justify-between gap-4">
              <span className="text-3xl md:text-4xl font-black tracking-[0.15em] text-[#E53935] break-all">
                {restaurant.restaurantCode || '—'}
              </span>
              <button
                onClick={() => handleCopyCode(restaurant.restaurantCode, setCopiedCode)}
                className="shrink-0 p-3 rounded-xl bg-white border border-gray-200 hover:border-[#E53935] hover:text-[#E53935] transition-all flex items-center gap-2 text-sm font-bold"
                title="Copy Restaurant Code"
              >
                {copiedCode ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                {copiedCode ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Owner Email</p>
              <p className="font-bold text-gray-900">{user.email || '—'}</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-yellow-700 mb-1">Important</p>
              <p className="font-bold text-yellow-800 text-xs">
                Cashiers and Captains use the Restaurant Code to log in.
              </p>
            </div>
          </div>
        </div>

        {/* App Cards */}
        <div className={`grid grid-cols-1 md:grid-cols-${showCaptainCard ? '3' : isCloud ? '3' : '2'} gap-6`}>
          {/* Admin Panel */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-gray-100 hover:border-[#E53935] transition-all flex flex-col">
            <div className="w-12 h-12 rounded-2xl bg-[#FFEBEE] flex items-center justify-center mb-4">
              <LayoutDashboard size={24} className="text-[#E53935]" />
            </div>
            <h3 className="font-black text-lg mb-1">Admin Panel</h3>
            <p className="text-xs text-gray-400 font-bold mb-4 leading-relaxed">
              Manage your menu, reports, staff, and settings.
            </p>
            <span className="inline-flex self-start rounded-full bg-[#FFEBEE] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#B71C1C] mb-4">
              {planLabel} Plan
            </span>
            <button
              onClick={onGoToDashboard}
              className="mt-auto w-full py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              Open Admin Dashboard <ArrowRight size={16} />
            </button>
          </div>

          {/* Cashier App */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-gray-100 hover:border-[#E53935] transition-all flex flex-col">
            <div className="w-12 h-12 rounded-2xl bg-[#FFEBEE] flex items-center justify-center mb-4">
              <CreditCard size={24} className="text-[#E53935]" />
            </div>
            <h3 className="font-black text-lg mb-1">Cashier App</h3>
            <p className="text-xs text-gray-400 font-bold mb-4 leading-relaxed">
              Billing counter — process payments and daily settlements.
            </p>

            {/* Cashier PIN table */}
            {(formData?.cashiers?.length > 0) && (
              <div className="mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cashier Credentials</p>
                <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-3 py-2 text-gray-400 font-black uppercase tracking-widest">Name</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-black uppercase tracking-widest">PIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.cashiers.map((c, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2 font-bold text-gray-900">{c.name}</td>
                          <td className="px-3 py-2 font-mono font-bold text-[#E53935]">{c.pin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-gray-400 font-bold">Code:</span>
              <span className="font-mono font-black text-gray-900">{restaurant.restaurantCode}</span>
              <button
                onClick={() => handleCopyCode(restaurant.restaurantCode, setCopiedCashierCode)}
                className="p-1 rounded hover:bg-gray-100 transition-all"
                title="Copy"
              >
                {copiedCashierCode ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-gray-400" />}
              </button>
            </div>

            <button
              onClick={() => navigate(`/cashier?code=${encodeURIComponent(restaurant.restaurantCode || '')}`)}
              className="mt-auto w-full py-3 bg-gray-900 hover:bg-black text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              Go to Cashier Login <ArrowRight size={16} />
            </button>
          </div>

          {/* Captain App — hidden for CAFE and CLOUD_KITCHEN */}
          {showCaptainCard && (
            <div className="bg-white rounded-3xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-gray-100 hover:border-[#E53935] transition-all flex flex-col">
              <div className="w-12 h-12 rounded-2xl bg-[#FFEBEE] flex items-center justify-center mb-4">
                <Users size={24} className="text-[#E53935]" />
              </div>
              <h3 className="font-black text-lg mb-1">Captain App</h3>
              <p className="text-xs text-gray-400 font-bold mb-4 leading-relaxed">
                Floor staff — take orders, manage tables, and send KOTs.
              </p>

              {/* Captain PIN table */}
              {(formData?.captains?.length > 0) && (
                <div className="mb-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Captain Credentials</p>
                  <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-3 py-2 text-gray-400 font-black uppercase tracking-widest">Name</th>
                          <th className="text-left px-3 py-2 text-gray-400 font-black uppercase tracking-widest">PIN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.captains.map((c, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-2 font-bold text-gray-900">{c.name}</td>
                            <td className="px-3 py-2 font-mono font-bold text-[#E53935]">{c.pin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="text-gray-400 font-bold">Code:</span>
                <span className="font-mono font-black text-gray-900">{restaurant.restaurantCode}</span>
                <button
                  onClick={() => handleCopyCode(restaurant.restaurantCode, setCopiedCaptainCode)}
                  className="p-1 rounded hover:bg-gray-100 transition-all"
                  title="Copy"
                >
                  {copiedCaptainCode ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-gray-400" />}
                </button>
              </div>

              <button
                onClick={() => navigate(`/captain?code=${encodeURIComponent(restaurant.restaurantCode || '')}`)}
                className="mt-auto w-full py-3 bg-gray-900 hover:bg-black text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                Go to Captain Login <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Delivery Setup — shown only for CLOUD_KITCHEN */}
          {isCloud && (
            <div className="bg-white rounded-3xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-gray-100 hover:border-[#E53935] transition-all flex flex-col">
              <div className="w-12 h-12 rounded-2xl bg-[#FFEBEE] flex items-center justify-center mb-4">
                <Store size={24} className="text-[#E53935]" />
              </div>
              <h3 className="font-black text-lg mb-1">Delivery Setup</h3>
              <p className="text-xs text-gray-400 font-bold mb-4 leading-relaxed">
                Configure delivery platform integrations (Swiggy, Zomato, Direct) from the Admin panel.
              </p>
              <span className="inline-flex self-start rounded-full bg-[#FFEBEE] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#B71C1C] mb-4">
                Setup Required
              </span>
              <button
                onClick={onGoToDashboard}
                className="mt-auto w-full py-3 bg-[#E53935] hover:bg-[#B71C1C] text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                Open Admin Dashboard <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Download Apps */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.06)] border border-gray-100">
          <h2 className="text-lg font-black mb-5 flex items-center gap-2 uppercase tracking-widest">
            <Download size={20} className="text-[#E53935]" /> Download Apps
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DownloadAppCard
              icon={Monitor}
              title="Admin Desktop"
              subtitle="Windows PC"
              url={import.meta.env.VITE_ADMIN_DESKTOP_DOWNLOAD_URL}
              fileName="SoftShape-Admin-Setup.exe"
            />
            <DownloadAppCard
              icon={Smartphone}
              title="Admin Android"
              subtitle="Android phone/tablet"
              url={import.meta.env.VITE_ADMIN_ANDROID_DOWNLOAD_URL}
              fileName="SoftShape-Admin.apk"
            />
            <DownloadAppCard
              icon={CreditCard}
              title="Cashier Desktop"
              subtitle="Windows PC"
              url={import.meta.env.VITE_CASHIER_DESKTOP_DOWNLOAD_URL}
              fileName="SoftShape-Cashier-Setup.exe"
            />
            <DownloadAppCard
              icon={Smartphone}
              title="Cashier Android"
              subtitle="Android phone/tablet"
              url={import.meta.env.VITE_CASHIER_ANDROID_DOWNLOAD_URL}
              fileName="SoftShape-Cashier.apk"
            />
          </div>
        </div>

        {/* What was created checklist */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.06)] border border-gray-100">
          <h2 className="text-lg font-black mb-5 flex items-center gap-2 uppercase tracking-widest">
            <CheckIcon size={20} className="text-green-600" /> What was created
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <CheckItem label={`${formData?.sections?.length || 0} sections created`} />
            <CheckItem label={`${formData?.tables?.length || 0} tables created`} />
            <CheckItem label={`${formData?.captains?.length || 0} captains added`} />
            <CheckItem label={`${formData?.cashiers?.length || 0} cashiers added`} />
            <CheckItem label={`${formData?.menu?.categories?.length || 0} menu categories`} />
            <CheckItem label={`${totalMenuItems} menu items`} />
          </div>
        </div>

        {/* Next Steps checklist */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.06)] border border-gray-100">
          <h2 className="text-lg font-black mb-5 flex items-center gap-2 uppercase tracking-widest">
            <ChevronRight size={20} className="text-[#E53935]" /> What to do next
          </h2>
          <div className="space-y-3">
            <NextStep n={1} text="Print table QR codes from the Admin panel" action="Go to Admin" onClick={() => navigate('/admin/qr-codes')} />
            <NextStep n={2} text="Train your captain on taking orders via the Captain app" action="Captain App" onClick={() => navigate(`/captain?code=${encodeURIComponent(restaurant.restaurantCode || '')}`)} />
            <NextStep n={3} text="Add more menu items and categories from Admin" action="Menu Settings" onClick={() => navigate('/admin/dashboard?firstVisit=true')} />
            {isCloud && <NextStep n={4} text="Connect delivery platforms (Swiggy, Zomato)" action="Delivery Setup" onClick={() => navigate('/admin/dashboard?firstVisit=true')} />}
          </div>
        </div>

        {/* Mobile PWA Card */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Smartphone size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Captain App on Mobile</h3>
              <p className="text-xs text-gray-400">Add to your phone's home screen for quick access</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
            <p><strong>iOS Safari:</strong> Tap Share → "Add to Home Screen"</p>
            <p><strong>Android Chrome:</strong> Tap Menu → "Add to Home screen"</p>
          </div>
        </div>

        {/* Email resend */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <Mail size={20} className="text-green-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Welcome Email</h3>
              <p className="text-xs text-gray-400">Sent to {user.email || 'your email'}</p>
            </div>
          </div>
          <button
            onClick={handleResendEmail}
            disabled={emailResending}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
          >
            {emailResending ? <RotateCw size={16} className="animate-spin" /> : <Mail size={16} />}
            {emailSent ? 'Email sent!' : 'Resend welcome email'}
          </button>
        </div>

        {/* Print Setup Sheet */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.06)] border border-gray-100 text-center">
          <Printer size={32} className="mx-auto text-gray-300 mb-3" />
          <h2 className="text-lg font-black mb-2">Print Setup Sheet</h2>
          <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
            Hand this printed card to your staff on day one. It has all login codes and a QR code for quick access.
          </p>
          <button
            onClick={() => window.print()}
            className="py-3 px-8 bg-gray-900 hover:bg-black text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all inline-flex items-center gap-2"
          >
            <Printer size={16} /> Print Setup Sheet
          </button>
        </div>
      </div>

      {/* ── Print-only content (hidden on screen, visible when printing) ── */}
      <div className="hidden print:block">
        <div className="min-h-screen bg-white p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-gray-900">{restaurant.name}</h1>
            <p className="text-sm text-gray-500 mt-1">Softshape Restaurant OS — Setup Sheet</p>
          </div>

          {/* Restaurant Code */}
          <div className="border-2 border-gray-900 rounded-2xl p-6 text-center mb-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Restaurant Code</p>
            <p className="text-4xl font-black tracking-[0.15em] text-[#E53935]">{restaurant.restaurantCode}</p>
          </div>

          {/* Owner info */}
          <div className="mb-8 text-sm">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Owner</p>
            <p className="font-bold">{user.name || '—'}</p>
            <p className="text-gray-500">{user.email || '—'}</p>
          </div>

          {/* Captains */}
          {(formData?.captains?.length > 0) && (
            <div className="mb-8">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Captains</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-900">
                    <th className="text-left py-2 font-black">Name</th>
                    <th className="text-left py-2 font-black">PIN</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.captains.map((c, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-2 font-bold">{c.name}</td>
                      <td className="py-2 font-mono font-black text-[#E53935]">{c.pin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cashiers */}
          {(formData?.cashiers?.length > 0) && (
            <div className="mb-8">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Cashiers</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-900">
                    <th className="text-left py-2 font-black">Name</th>
                    <th className="text-left py-2 font-black">PIN</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.cashiers.map((c, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-2 font-bold">{c.name}</td>
                      <td className="py-2 font-mono font-black text-[#E53935]">{c.pin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* QR Code */}
          <div className="flex flex-col items-center mt-10">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">Scan to log in</p>
            <QRCodeSVG
              value={`https://softshape.ai/cashier?code=${encodeURIComponent(restaurant.restaurantCode || '')}`}
              size={160}
              level="M"
              includeMargin={true}
            />
            <p className="text-[10px] text-gray-400 mt-3 font-bold">
              https://softshape.ai/cashier?code={restaurant.restaurantCode}
            </p>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-4 border-t border-gray-200 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              Powered by Softshape.ai
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function CheckItem({ label }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-4">
      <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <CheckIcon size={14} className="text-green-600" />
      </div>
      <span className="font-bold text-gray-900">{label}</span>
    </div>
  );
}

function NextStep({ n, text, action, onClick }) {
  return (
    <div className="flex items-center gap-4 bg-gray-50 rounded-xl p-4">
      <div className="w-8 h-8 rounded-full bg-[#E53935] text-white flex items-center justify-center text-sm font-bold shrink-0">
        {n}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{text}</p>
      </div>
      <button
        onClick={onClick}
        className="text-xs font-semibold text-[#E53935] hover:text-[#B71C1C] flex items-center gap-1 shrink-0"
      >
        {action} <ArrowRight size={14} />
      </button>
    </div>
  );
}

function DownloadAppCard({ icon: Icon, title, subtitle, url, fileName }) {
  if (!url) return null;
  return (
    <a
      href={url}
      download={fileName}
      className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 hover:border-[#E53935] hover:bg-white transition-all"
    >
      <div className="rounded-xl bg-[#FFEBEE] p-2.5 text-[#E53935]">
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <Download size={18} className="text-gray-400 shrink-0" />
    </a>
  );
}

export default OnboardingSuccess;
