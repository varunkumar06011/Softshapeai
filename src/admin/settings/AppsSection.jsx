// ─────────────────────────────────────────────────────────────────────────────
// AppsSection — App download links and QR codes for all platform clients
// ─────────────────────────────────────────────────────────────────────────────
// Displays download links and QR codes for all Softshape client apps:
//   - Cashier Desktop (Windows/Mac)
//   - Cashier Android (APK)
//   - Admin Desktop (Windows/Mac)
//   - Admin Android (APK)
//   - Captain Android (APK)
//   - Windows Print Agent (desktop app for printer management)
//
// URLs are configured via Vite environment variables. QR codes are generated
// for mobile app downloads so users can scan and install directly.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import { Download, Smartphone, Monitor, Tablet, Printer, QrCode, AlertTriangle, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// Fallback URLs — used when Vite env vars are not set in the deployment environment
const RELEASE_BASE = 'https://github.com/varunkumar06011/Softshapeai/releases/download/v1.2.5';
const DEFAULT_PRINT_AGENT_URL = 'https://github.com/varunkumar06011/softshape-print-agent/releases/latest';

// Download URLs for each platform (from Vite env vars with hardcoded fallbacks)
const DOWNLOAD_URLS = {
  cashierDesktop: import.meta.env.VITE_CASHIER_DESKTOP_DOWNLOAD_URL || `${RELEASE_BASE}/SoftShape.Cashier_0.1.0_x64-setup.exe`,
  cashierAndroid: import.meta.env.VITE_CASHIER_ANDROID_DOWNLOAD_URL || `${RELEASE_BASE}/cashier-android.apk`,
  adminDesktop: import.meta.env.VITE_ADMIN_DESKTOP_DOWNLOAD_URL || `${RELEASE_BASE}/SoftShape.Admin_0.1.0_x64-setup.exe`,
  adminAndroid: import.meta.env.VITE_ADMIN_ANDROID_DOWNLOAD_URL || `${RELEASE_BASE}/admin-android.apk`,
  captainAndroid: import.meta.env.VITE_CAPTAIN_ANDROID_DOWNLOAD_URL || `${RELEASE_BASE}/captain-android.apk`,
  printAgent: import.meta.env.VITE_PRINT_AGENT_DOWNLOAD_URL || DEFAULT_PRINT_AGENT_URL,
};

function DownloadCard({ icon: Icon, title, subtitle, url, fileName, badge }) {
  const missing = !url;
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${missing ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white hover:border-[#E53935] hover:shadow-md transition-all'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${missing ? 'bg-gray-100 text-gray-400' : 'bg-red-50 text-[#E53935]'}`}>
            <Icon size={22} />
          </div>
          <div>
            <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
              {title}
              {badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">{badge}</span>}
            </div>
            <div className="text-xs text-gray-500">{subtitle}</div>
          </div>
        </div>
      </div>
      {missing ? (
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">
          <AlertTriangle size={14} className="shrink-0" />
          Contact support to enable this download.
        </div>
      ) : (
        <a
          href={url}
          download={fileName}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#B71C1C] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#8B0000] transition-colors"
        >
          <Download size={16} />
          Download {fileName ? `(${fileName})` : ''}
        </a>
      )}
    </div>
  );
}

function PwaQrCard({ title, subtitle, url, icon: Icon }) {
  const [showInstructions, setShowInstructions] = useState(false);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-3 hover:border-[#E53935] hover:shadow-md transition-all">
      <div className="flex items-center gap-3">
        <div className="rounded-xl p-2.5 bg-blue-50 text-blue-600">
          <Icon size={22} />
        </div>
        <div>
          <div className="font-bold text-sm text-gray-900">{title}</div>
          <div className="text-xs text-gray-500">{subtitle}</div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="rounded-xl border-2 border-gray-100 p-3 bg-white">
          <QRCodeSVG value={url} size={120} includeMargin={false} />
        </div>
        <p className="text-[10px] text-gray-400 text-center">Scan with camera to install</p>
      </div>
      <button
        onClick={() => setShowInstructions(!showInstructions)}
        className="text-xs font-bold text-[#E53935] hover:underline text-left"
      >
        {showInstructions ? 'Hide instructions' : 'Show installation instructions'}
      </button>
      {showInstructions && (
        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1.5">
          <p><strong>1.</strong> Open the camera app on your device.</p>
          <p><strong>2.</strong> Point it at the QR code above.</p>
          <p><strong>3.</strong> Tap the notification to open the link in Safari.</p>
          <p><strong>4.</strong> Tap the Share button (square with arrow).</p>
          <p><strong>5.</strong> Select "Add to Home Screen".</p>
          <p><strong>6.</strong> Tap "Add" — the app icon appears on your home screen.</p>
          <p className="pt-1 text-gray-400">The app works offline once installed. All actions sync automatically when back online.</p>
        </div>
      )}
    </div>
  );
}

export default function AppsSection() {
  const baseUrl = window.location.origin;

  const pwaUrls = useMemo(() => ({
    cashierPwa: `${baseUrl}/cashier/dashboard`,
    adminPwa: `${baseUrl}/admin/dashboard`,
  }), [baseUrl]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-red-50 p-2.5 text-[#E53935]">
          <Download size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Download Apps</h2>
          <p className="text-sm text-gray-500">Install SoftShape on your devices — works offline.</p>
        </div>
      </div>

      {/* Cashier Apps */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider text-gray-700 mb-3">Cashier</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DownloadCard
            icon={Monitor}
            title="Cashier Desktop"
            subtitle="Windows .exe — for cashier PC"
            url={DOWNLOAD_URLS.cashierDesktop}
            fileName="SoftShape-Cashier-Setup.exe"
          />
          <DownloadCard
            icon={Smartphone}
            title="Cashier Android"
            subtitle="Android .apk — for tablets/phones"
            url={DOWNLOAD_URLS.cashierAndroid}
            fileName="SoftShape-Cashier.apk"
          />
          <PwaQrCard
            icon={Tablet}
            title="Cashier iPad (PWA)"
            subtitle="No download — install via Safari"
            url={pwaUrls.cashierPwa}
          />
        </div>
      </div>

      {/* Admin Apps */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider text-gray-700 mb-3">Admin</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DownloadCard
            icon={Monitor}
            title="Admin Desktop"
            subtitle="Windows .exe — for admin PC"
            url={DOWNLOAD_URLS.adminDesktop}
            fileName="SoftShape-Admin-Setup.exe"
          />
          <DownloadCard
            icon={Smartphone}
            title="Admin Android"
            subtitle="Android .apk — for tablets/phones"
            url={DOWNLOAD_URLS.adminAndroid}
            fileName="SoftShape-Admin.apk"
          />
          <PwaQrCard
            icon={Tablet}
            title="Admin iPad (PWA)"
            subtitle="No download — install via Safari"
            url={pwaUrls.adminPwa}
          />
        </div>
      </div>

      {/* Captain Apps */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider text-gray-700 mb-3">Captain</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DownloadCard
            icon={Smartphone}
            title="Captain Android"
            subtitle="Android .apk — for waiters/captains"
            url={DOWNLOAD_URLS.captainAndroid}
            fileName="SoftShape-Captain.apk"
          />
        </div>
      </div>

      {/* Print Agent */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider text-gray-700 mb-3">Print Agent</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DownloadCard
            icon={Printer}
            title="Print Agent"
            subtitle="Windows .exe — for printer PC"
            url={DOWNLOAD_URLS.printAgent}
            fileName="SoftShape-Print-Agent-Setup.exe"
          />
        </div>
      </div>

      {/* Offline info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <div className="flex items-start gap-2.5">
          <QrCode size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">All apps work offline</p>
            <p className="text-xs text-blue-700">
              Cashier and Captain apps can take orders, print KOTs, settle bills, and queue transactions without internet.
              Actions sync automatically when connection is restored. PWA versions (iPad) use the same offline engine via service worker + IndexedDB.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
