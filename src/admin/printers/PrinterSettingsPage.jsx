// ─────────────────────────────────────────────────────────────────────────────
// PrinterSettingsPage — Printer configuration and Windows Print Agent management
// ─────────────────────────────────────────────────────────────────────────────
// Manages printer setup for the restaurant:
//   - QZ Tray connection status and certificate display
//   - Windows Print Agent setup via QR code (agent downloads, pairs with backend)
//   - Printer agent polling (30s interval) for connection status
//   - Multiple printer support (kitchen, bar, cashier)
//   - Print test page functionality
//   - Agent download links from GitHub releases
//
// The Windows Print Agent is a Tauri-based desktop app that runs on the
// restaurant's POS machine and communicates with the backend via JWT tokens.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Printer, Download, RefreshCw, CheckCircle, Clock,
  Copy, AlertTriangle, BookOpen, Save, Trash2, Plus
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { apiUrl, getAuthHeaders } from '../../services/apiConfig.js';
import { useAuth } from '../../context/AuthContext.jsx';

// Poll interval for checking print agent connection status (30 seconds)
const POLL_INTERVAL_MS = 30_000;

const PRINT_AGENT_DOWNLOAD_URL =
  import.meta.env.VITE_PRINT_AGENT_DOWNLOAD_URL ||
  'https://github.com/varunkumar06011/softshape-print-agent/releases/latest';
const downloadUrlMissing = !PRINT_AGENT_DOWNLOAD_URL;

function StatusDot({ status }) {
  const colors = {
    online: { dot: 'bg-green-500', text: 'text-green-600', label: 'Online' },
    offline: { dot: 'bg-red-500', text: 'text-red-600', label: 'Offline' },
    unknown: { dot: 'bg-amber-500', text: 'text-amber-600', label: 'Unknown' },
  };
  const c = colors[status] || colors.unknown;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${c.dot} shadow-sm`} />
      <span className={`text-xs font-bold ${c.text}`}>{c.label}</span>
    </span>
  );
}

export default function PrinterSettingsPage() {
  const { user, restaurant, setRestaurant } = useAuth();
  const [agentStatus, setAgentStatus] = useState(null);
  const [setupToken, setSetupToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copiedRestaurant, setCopiedRestaurant] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [error, setError] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [printersConfig, setPrintersConfig] = useState([]);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState(null);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/print/agent-status'), {
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setAgentStatus(data);
        setError(null);
      }
    } catch {
      setError('Could not reach backend. Check internet connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const printers = restaurant?.printerConfig?.printers || [];
    setPrintersConfig(Array.isArray(printers) ? printers : Object.values(printers));
  }, [restaurant?.printerConfig?.printers]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  const generateToken = async () => {
    setTokenLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/print/agent-token'), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
      const data = await res.json();
      setSetupToken(data);
    } catch (err) {
      setError(err.message || 'Failed to generate setup token');
    } finally {
      setTokenLoading(false);
    }
  };

  const copyCode = async (text, setCopied) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers / insecure contexts
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      setError('Copy failed. Please select and copy manually.');
      setTimeout(() => setError(null), 3000);
    }
  };

  const restaurantCode = agentStatus?.restaurantCode || setupToken?.restaurantCode || user?.restaurantCode || '';

  const printerRoles = [
    { key: 'kitchen', label: 'Kitchen Printer', icon: '🍳' },
    { key: 'bar', label: 'Bar Printer', icon: '🍺' },
    { key: 'bill', label: 'Bill Printer', icon: '🧾' },
  ];

  const unmappedRoles = printerRoles
    .filter(({ key }) => agentStatus?.online && !agentStatus?.agentMapping?.[key])
    .map(({ label }) => label);

  const addPrinter = () => {
    setPrintersConfig((prev) => [...prev, { name: '', type: '' }]);
  };

  const updatePrinter = (index, field, value) => {
    setPrintersConfig((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removePrinter = (index) => {
    setPrintersConfig((prev) => prev.filter((_, i) => i !== index));
  };

  const savePrinterConfig = async () => {
    setConfigSaving(true);
    setConfigMessage(null);
    try {
      const validPrinters = printersConfig
        .map((p) => ({ name: String(p.name || '').trim(), type: String(p.type || '').trim().toUpperCase() }))
        .filter((p) => p.name);
      const mergedConfig = {
        ...(restaurant?.printerConfig || {}),
        printers: validPrinters,
      };
      const res = await fetch(apiUrl('/api/restaurant/profile'), {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerConfig: mergedConfig }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
      if (restaurant) {
        setRestaurant({ ...restaurant, printerConfig: mergedConfig });
      }
      setConfigMessage({ type: 'success', text: 'Printer config saved.' });
    } catch (err) {
      setConfigMessage({ type: 'error', text: err.message || 'Failed to save printer config' });
    } finally {
      setConfigSaving(false);
      setTimeout(() => setConfigMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading printer status…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Printer size={28} className="text-[#B71C1C]" />
        <div>
          <h2 className="text-xl font-black tracking-tight">Print Agent Setup</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Replace QZ Tray with a lightweight Windows app — no Java, no certificates, no browser setup.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {downloadUrlMissing && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          Print agent download URL is not configured. Set <code className="bg-red-100 px-1 rounded">VITE_PRINT_AGENT_DOWNLOAD_URL</code> before building.
        </div>
      )}

      {unmappedRoles.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-700">
          <AlertTriangle size={16} className="shrink-0" />
          Agent online but these printers are not mapped: {unmappedRoles.join(', ')}
        </div>
      )}

      {/* Agent Connection Status */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-base mb-1.5">Windows Print Agent</div>
            <StatusDot status={agentStatus?.online ? 'online' : 'offline'} />
            {agentStatus?.lastSeen && (
              <div className="text-[11px] text-gray-400 mt-1">
                Last seen: {new Date(agentStatus.lastSeen).toLocaleTimeString('en-IN')}
              </div>
            )}
          </div>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Per-printer status */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {printerRoles.map(({ key, label, icon }) => {
            const pStatus = agentStatus?.printerStatus?.[key];
            const mapped = agentStatus?.agentMapping?.[key];
            return (
              <div key={key} className="rounded-xl border border-gray-200 p-3.5 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="font-bold text-xs mb-1">{label}</div>
                {mapped ? (
                  <div className="text-[11px] text-gray-500 mb-1.5 truncate">{mapped}</div>
                ) : (
                  <div className="text-[11px] text-gray-400 mb-1.5">Not mapped</div>
                )}
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  pStatus === 'online' ? 'bg-green-100 text-green-700' :
                  pStatus === 'offline' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {pStatus || 'Unknown'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legacy QZ notice */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="font-bold text-amber-800 text-sm mb-1">QZ Tray / Print Station is deprecated</div>
        <div className="text-xs text-amber-700">
          The Windows Print Agent below is the supported print path. The old{' '}
          <strong>Print Station</strong> at{' '}
          <code className="bg-amber-100 px-1 rounded">/print-station</code> still works as a fallback
          but will be removed in a future release.
        </div>
      </div>

      {/* Download & Setup */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-5">
        {/* Step 1 — Download */}
        <div>
          <div className="font-bold text-base mb-1">Step 1 — Download the App</div>
          <p className="text-xs text-gray-500 mb-3">
            Install on the Windows PC that is connected (USB/WiFi) to your printers.
          </p>
          <a
            href={PRINT_AGENT_DOWNLOAD_URL}
            download="SoftShape-Print-Agent-Setup.exe"
            className="inline-flex items-center gap-2 rounded-xl bg-[#B71C1C] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#8B0000]"
          >
            <Download size={16} /> Download Print Agent (Windows)
          </a>
        </div>

        {/* Step 2 — Restaurant Code */}
        <div>
          <div className="font-bold text-base mb-1">Step 2 — Get Your Restaurant Code</div>
          <p className="text-xs text-gray-500 mb-2">
            Open the downloaded app and enter the code below, or scan the QR code.
          </p>
          {restaurantCode ? (
            <div className="flex gap-4 items-start flex-wrap">
              <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span className="font-mono text-lg font-bold tracking-widest text-gray-900">{restaurantCode}</span>
                <button
                  onClick={() => copyCode(restaurantCode, setCopiedRestaurant)}
                  className="rounded-lg border border-gray-200 p-1.5 hover:bg-white"
                >
                  {copiedRestaurant ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="text-center">
                <div className="inline-block rounded-lg border border-gray-200 p-2 bg-white">
                  <QRCodeSVG value={restaurantCode} size={100} marginSize={2} />
                </div>
                <div className="text-[10px] text-gray-400 mt-1">Scan to fill code</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 mt-1">Restaurant code not available. Try refreshing.</div>
          )}
        </div>

        {/* Step 3 — Setup Token */}
        <div>
          <div className="font-bold text-base mb-1">Step 3 — Generate a Setup Token</div>
          <p className="text-xs text-gray-500 mb-2">
            If the agent asks for a one-time setup token, generate one here. Valid for 15 minutes.
          </p>
          <button
            onClick={generateToken}
            disabled={tokenLoading}
            className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {tokenLoading ? 'Generating…' : 'Generate Setup Token'}
          </button>

          {setupToken && (
            <div className="mt-3">
              <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span className="font-mono text-xs font-bold break-all flex-1 text-gray-900">
                  {setupToken.token}
                </span>
                <button
                  onClick={() => copyCode(setupToken.token, setCopiedToken)}
                  className="rounded-lg border border-gray-200 p-1.5 hover:bg-white shrink-0"
                >
                  {copiedToken ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-red-500 mt-1.5">
                <Clock size={12} /> Expires: {new Date(setupToken.expiresAt).toLocaleTimeString('en-IN')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Printer Config Editor */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-base">Configured Printers</div>
            <p className="text-xs text-gray-500">These names appear in the print agent mapping dropdown and menu item printer selector.</p>
          </div>
          <button
            onClick={addPrinter}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="space-y-2">
            {printersConfig.length === 0 && (
              <div className="text-xs text-gray-400">No printers configured. Add at least one printer.</div>
            )}
            {printersConfig.map((printer, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Printer name (exact system name)"
                  value={printer.name || ''}
                  onChange={(e) => updatePrinter(index, 'name', e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:border-[#E53935] focus:outline-none"
                />
                <select
                  value={printer.type || ''}
                  onChange={(e) => updatePrinter(index, 'type', e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:border-[#E53935] focus:outline-none"
                >
                  <option value="">No type</option>
                  <option value="KITCHEN">Kitchen</option>
                  <option value="BAR">Bar</option>
                  <option value="KOT">KOT</option>
                  <option value="BILL">Bill</option>
                </select>
                <button
                  onClick={() => removePrinter(index)}
                  className="rounded-lg border border-gray-200 p-2 text-red-500 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

        <div className="flex items-center gap-3">
          <button
            onClick={savePrinterConfig}
            disabled={configSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#B71C1C] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#8B0000] disabled:opacity-50"
          >
            <Save size={16} /> {configSaving ? 'Saving…' : 'Save Printers'}
          </button>
          {configMessage && (
            <span className={`text-xs font-bold ${configMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {configMessage.text}
            </span>
          )}
        </div>
      </div>

      {/* Manual Book Toggle */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <button
          onClick={() => setShowManual(!showManual)}
          className="flex items-center gap-2 font-bold text-base text-[#B71C1C]"
        >
          <BookOpen size={18} /> Connect Your Printers in 5 Minutes
          <span className="text-xs font-normal text-gray-400 ml-auto">{showManual ? 'Hide' : 'Show'}</span>
        </button>

        {showManual && (
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <div className="font-bold text-gray-900">What you need</div>
            <p className="text-xs text-gray-600">Windows PC near the printer and an 80mm thermal printer (USB or WiFi).</p>

            <div className="font-bold text-gray-900 pt-2">Step 1 — Download</div>
            <p className="text-xs text-gray-600">Go to Dashboard → Printers, click <strong>Download Print Agent</strong>.</p>

            <div className="font-bold text-gray-900 pt-2">Step 2 — Install</div>
            <p className="text-xs text-gray-600">Double-click the <code className="bg-gray-100 px-1 rounded">.exe</code> and press Next until it finishes.</p>

            <div className="font-bold text-gray-900 pt-2">Step 3 — Open</div>
            <p className="text-xs text-gray-600">The app sits near the clock (system tray). Click it to open.</p>

            <div className="font-bold text-gray-900 pt-2">Step 4 — Enter your code</div>
            <p className="text-xs text-gray-600">Type the restaurant code shown above, or scan the QR code.</p>

            <div className="font-bold text-gray-900 pt-2">Step 5 — Generate setup token</div>
            <p className="text-xs text-gray-600">Click <strong>Generate Setup Token</strong> above and paste it in the app.</p>

            <div className="font-bold text-gray-900 pt-2">Step 6 — Connect printers</div>
            <p className="text-xs text-gray-600">Pick Kitchen, Bar, and Bill printer from the list in the app.</p>

            <div className="font-bold text-gray-900 pt-2">Step 7 — Test print</div>
            <p className="text-xs text-gray-600">Press Test Print for each printer to verify.</p>

            <div className="font-bold text-gray-900 pt-2">Step 8 — Done</div>
            <p className="text-xs text-gray-600">Your KOTs and bills will now print automatically.</p>

            <div className="font-bold text-gray-900 pt-3 border-t border-gray-100">Troubleshooting</div>
            <ul className="text-xs text-gray-600 space-y-1.5 mt-1">
              <li><strong>Printer not in the list</strong> — check power, USB cable, or WiFi connection.</li>
              <li><strong>Agent shows Offline</strong> — check internet on the PC and open the app.</li>
              <li><strong>Jobs not printing</strong> — re-check the printer mapping in the app.</li>
              <li><strong>Want the old system back</strong> — open <code className="bg-gray-100 px-1 rounded">/print-station</code> in browser; QZ Tray still works.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
