// ─────────────────────────────────────────────────────────────────────────────
// EdgeSetupScreen — Link cashier desktop to an existing cloud restaurant
// ─────────────────────────────────────────────────────────────────────────────
// Path A flow: the restaurant was already created via the cloud onboarding
// wizard (OnboardingWizard.jsx). Now the cashier desktop app needs to:
//   1. Wait for the edge server (Bun sidecar) to start
//   2. Collect backend URL + restaurant code + setup token from the owner
//   3. Register the edge server with the cloud backend
//   4. Download the full restaurant config into local SQLite
//   5. Redirect to cashier login — ready to bill
//
// The setup token is generated from Admin → Printers → "Generate Setup Token"
// on the web dashboard. It's valid for 15 minutes.
//
// If the owner doesn't have a cloud account yet, they can skip to
// QuickOnboarding (Path B) which creates everything locally.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { isEdgeAvailable, edgeFetch, resetEdgeCache } from '../services/edgeHealth.js';
import {
  CheckCircle2, Loader2, AlertCircle, ArrowLeft, ArrowRight,
  Cloud, Database, Link2, Server, Utensils, LayoutGrid, Users,
  RefreshCw, Wifi, WifiOff, Store,
} from 'lucide-react';

// ── Poll intervals ────────────────────────────────────────────────────────────
const EDGE_START_POLL_MS = 2000;
const STATUS_POLL_MS = 2000;
const EDGE_START_TIMEOUT_MS = 30_000;

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'edge-start',   label: 'Starting edge server',     icon: Server },
  { id: 'collect-info', label: 'Enter setup details',       icon: Link2 },
  { id: 'register',     label: 'Registering with cloud',    icon: Cloud },
  { id: 'config-sync',  label: 'Downloading restaurant data', icon: Database },
  { id: 'ready',        label: 'Ready to bill',             icon: CheckCircle2 },
];

export default function EdgeSetupScreen() {
  const navigate = useNavigate();

  // ── Phase state ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('edge-start'); // edge-start | collect-info | register | config-sync | ready
  const [edgeOnline, setEdgeOnline] = useState(false);
  const [edgeChecking, setEdgeChecking] = useState(true);

  // ── Form state ───────────────────────────────────────────────────────────────
  const [backendUrl, setBackendUrl] = useState(
    import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || ''
  );
  const [restaurantCode, setRestaurantCode] = useState('');
  const [setupToken, setSetupToken] = useState('');

  // ── Registration state ──────────────────────────────────────────────────────
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState(null);

  // ── Config sync state ───────────────────────────────────────────────────────
  const [configSyncing, setConfigSyncing] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [configStats, setConfigStats] = useState({ tables: 0, menuItems: 0, activeOrders: 0, pendingSync: 0 });
  const [configRowsLoaded, setConfigRowsLoaded] = useState(0);
  const [syncStatus, setSyncStatus] = useState(null);

  // ── General ─────────────────────────────────────────────────────────────────
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const edgeStartTimerRef = useRef(null);

  // ── Step 1: Wait for edge server to come online ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const startTime = Date.now();

    const checkEdge = async () => {
      if (cancelled) return;
      resetEdgeCache();
      const available = await isEdgeAvailable();
      if (cancelled) return;

      if (available) {
        setEdgeOnline(true);
        setEdgeChecking(false);

        // Check if already registered with a valid session
        try {
          const status = await edgeFetch('/api/edge/status');
          if (status.registered && status.sessionValid) {
            // Already registered — check if config is loaded
            if (status.localStats && status.localStats.menuItems > 0) {
              setPhase('ready');
              return;
            }
            // Registered but no config yet — trigger sync
            setPhase('config-sync');
            triggerConfigSync();
            return;
          }
        } catch { /* not registered yet */ }

        // Not registered — show form
        setPhase('collect-info');
      } else if (Date.now() - startTime > EDGE_START_TIMEOUT_MS) {
        setEdgeChecking(false);
        setError(
          'Edge server did not start within 30 seconds. ' +
          'Make sure the SoftShape Cashier desktop app is running and no other ' +
          'application is using port 3100 (e.g. the old Print Agent). ' +
          'Close this page, restart the Cashier app, and try again.'
        );
      } else {
        // Retry
        edgeStartTimerRef.current = setTimeout(checkEdge, EDGE_START_POLL_MS);
      }
    };

    checkEdge();

    return () => {
      cancelled = true;
      if (edgeStartTimerRef.current) clearTimeout(edgeStartTimerRef.current);
    };
  }, []);

  // ── Step 2: Submit registration ─────────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    if (!backendUrl.trim()) {
      setRegisterError('Backend URL is required');
      return;
    }
    if (!restaurantCode.trim()) {
      setRegisterError('Restaurant code is required');
      return;
    }
    if (!setupToken.trim()) {
      setRegisterError('Setup token is required');
      return;
    }

    setRegistering(true);
    setRegisterError(null);
    setPhase('register');

    try {
      const result = await edgeFetch('/api/edge/register', {
        method: 'POST',
        body: JSON.stringify({
          setupToken: setupToken.trim(),
          restaurantCode: restaurantCode.trim(),
          backendUrl: backendUrl.trim(),
        }),
      });

      if (result.success) {
        // Registration succeeded — trigger config download
        setPhase('config-sync');
        setConfigSyncing(true);
        // If config was already downloaded during registration, check status
        if (result.configDownloaded && result.tablesLoaded > 0) {
          setConfigRowsLoaded(result.tablesLoaded);
          // Still poll to get final stats
          startStatusPolling();
        } else {
          // Trigger explicit config sync
          await triggerConfigSync();
        }
      } else {
        setRegisterError(result.error || 'Registration failed');
        setPhase('collect-info');
      }
    } catch (err) {
      setRegisterError(err.message || 'Failed to connect to cloud backend');
      setPhase('collect-info');
    } finally {
      setRegistering(false);
    }
  }, [backendUrl, restaurantCode, setupToken]);

  // ── Step 3: Trigger config sync ─────────────────────────────────────────────
  const triggerConfigSync = useCallback(async () => {
    setConfigSyncing(true);
    setConfigError(null);

    try {
      const result = await edgeFetch('/api/edge/config/sync', { method: 'POST' });
      if (result.success) {
        setConfigRowsLoaded(result.tablesLoaded || 0);
        // Start polling for final stats
        startStatusPolling();
      } else {
        setConfigError(result.error || 'Config sync failed');
      }
    } catch (err) {
      setConfigError(err.message || 'Failed to download config');
    } finally {
      setConfigSyncing(false);
    }
  }, []);

  // ── Poll edge server status during config sync ──────────────────────────────
  const startStatusPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    let pollCount = 0;
    const maxPolls = 30; // 60 seconds max

    pollRef.current = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        // Even if polling timed out, proceed if we have some data
        setPhase('ready');
        return;
      }

      try {
        const status = await edgeFetch('/api/edge/status');
        setSyncStatus(status);
        if (status.localStats) {
          setConfigStats({
            tables: status.localStats.tables || 0,
            menuItems: status.localStats.menuItems || 0,
            activeOrders: status.localStats.activeOrders || 0,
            pendingSync: status.localStats.pendingSyncRecords || 0,
          });
        }

        // If we have menu items and tables, config is loaded
        if (status.localStats && status.localStats.menuItems > 0 && status.localStats.tables > 0) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase('ready');
        }
      } catch {
        // Edge might be busy — keep polling
      }
    }, STATUS_POLL_MS);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Navigate to cashier login ───────────────────────────────────────────────
  const handleGoToCashier = () => navigate('/cashier');

  // ── Skip to offline onboarding (Path B) ─────────────────────────────────────
  const handleSkipToOffline = () => navigate('/onboarding');

  // ── Retry config sync ───────────────────────────────────────────────────────
  const handleRetrySync = () => {
    setConfigError(null);
    triggerConfigSync();
  };

  // ── Compute current step index for progress ─────────────────────────────────
  const currentStepIndex = STEPS.findIndex(s => s.id === phase);

  // ── Config download checklist items ─────────────────────────────────────────
  const configChecklist = [
    { label: 'Outlet settings',     done: configStats.menuItems > 0 || configRowsLoaded > 0, icon: Store },
    { label: 'Venues & floors',     done: configStats.tables > 0,     icon: LayoutGrid },
    { label: 'Sections & tables',   done: configStats.tables > 0,     icon: LayoutGrid },
    { label: 'Menu & categories',   done: configStats.menuItems > 0,  icon: Utensils },
    { label: 'Staff users',         done: configRowsLoaded > 10,      icon: Users },
  ];

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-orange-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg mb-4">
            <Cloud size={28} />
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Link to Cloud</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Connect this billing PC to your existing SoftShape restaurant
          </p>
        </div>

        {/* ── Progress Steps ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8 px-2">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isDone = idx < currentStepIndex;
            const isActive = idx === currentStepIndex;
            const isPending = idx > currentStepIndex;

            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isDone ? 'bg-green-500 text-white' :
                      isActive ? 'bg-rose-500 text-white scale-110 shadow-lg shadow-rose-200' :
                      'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isDone ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wide text-center w-16 leading-tight ${
                    isActive ? 'text-rose-600' : isDone ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded-full transition-all duration-500 ${
                    isDone ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Card ────────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">

          {/* ── Phase: edge-start ──────────────────────────────────────────────── */}
          {phase === 'edge-start' && (
            <div className="p-10 text-center min-h-[320px] flex flex-col items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                className="w-16 h-16 rounded-full border-4 border-rose-100 border-t-rose-500 mb-6"
              />
              <h2 className="text-lg font-bold text-gray-900 mb-2">Starting edge server…</h2>
              <p className="text-sm text-gray-500 max-w-sm">
                The local SQLite engine is launching on port 3100. This usually takes 2–3 seconds.
              </p>
              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 max-w-sm">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <AlertCircle size={16} /> Error
                  </div>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Phase: collect-info ───────────────────────────────────────────── */}
          {phase === 'collect-info' && (
            <div className="p-8 min-h-[320px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key="collect-form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Enter setup details</h2>
                  <p className="text-sm text-gray-500 mb-6">
                    Generate a setup token from <span className="font-semibold">Admin → Printers</span> on your web dashboard.
                  </p>

                  <div className="space-y-5">
                    {/* Backend URL */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Backend URL
                      </label>
                      <input
                        type="url"
                        value={backendUrl}
                        onChange={e => { setBackendUrl(e.target.value); setRegisterError(null); }}
                        placeholder="https://api.softshape.ai"
                        className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 bg-gray-50 text-sm font-medium outline-none focus:border-rose-400 focus:bg-white transition-all"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">The cloud server URL where your restaurant was onboarded</p>
                    </div>

                    {/* Restaurant Code */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Restaurant Code
                      </label>
                      <input
                        type="text"
                        value={restaurantCode}
                        onChange={e => { setRestaurantCode(e.target.value.toUpperCase()); setRegisterError(null); }}
                        placeholder="e.g. ABCD12"
                        maxLength={8}
                        className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 bg-gray-50 text-sm font-bold tracking-wider outline-none focus:border-rose-400 focus:bg-white transition-all uppercase"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">The 6-character code from your onboarding confirmation</p>
                    </div>

                    {/* Setup Token */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Setup Token
                      </label>
                      <input
                        type="text"
                        value={setupToken}
                        onChange={e => { setSetupToken(e.target.value); setRegisterError(null); }}
                        placeholder="Paste the token from Admin → Printers"
                        className="w-full h-12 px-4 rounded-xl border-2 border-gray-100 bg-gray-50 text-sm font-mono outline-none focus:border-rose-400 focus:bg-white transition-all"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">Valid for 15 minutes after generation</p>
                    </div>
                  </div>

                  {registerError && (
                    <div className="mt-5 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>{registerError}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-7 flex items-center justify-between">
                    <button
                      onClick={handleSkipToOffline}
                      className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      No cloud account? Set up offline →
                    </button>
                    <button
                      onClick={handleRegister}
                      disabled={registering || !backendUrl.trim() || !restaurantCode.trim() || !setupToken.trim()}
                      className="flex items-center gap-2 px-6 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-rose-100 active:scale-95"
                    >
                      {registering ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
                      {registering ? 'Linking…' : 'Link Restaurant'}
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {/* ── Phase: register ───────────────────────────────────────────────── */}
          {phase === 'register' && (
            <div className="p-10 text-center min-h-[320px] flex flex-col items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-6"
              >
                <Cloud size={28} className="text-rose-500" />
              </motion.div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Registering with cloud…</h2>
              <p className="text-sm text-gray-500 max-w-sm">
                Verifying setup token and linking this device to your restaurant on the cloud backend.
              </p>
            </div>
          )}

          {/* ── Phase: config-sync ────────────────────────────────────────────── */}
          {phase === 'config-sync' && (
            <div className="p-8 min-h-[320px]">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Downloading restaurant data</h2>
              <p className="text-sm text-gray-500 mb-6">
                Copying your menu, tables, staff, and settings from cloud to this device's local database.
              </p>

              {/* Config checklist */}
              <div className="space-y-3 mb-6">
                {configChecklist.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        item.done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        item.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                      }`}>
                        {item.done ? <CheckCircle2 size={16} /> : configSyncing ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                      </div>
                      <span className={`text-sm font-medium ${item.done ? 'text-green-700' : 'text-gray-500'}`}>
                        {item.label}
                      </span>
                      {item.done && (
                        <span className="ml-auto text-xs font-bold text-green-600">Done</span>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Stats */}
              {(configStats.tables > 0 || configStats.menuItems > 0) && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="text-center p-3 bg-rose-50 rounded-xl">
                    <div className="text-2xl font-black text-rose-600">{configStats.tables}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Tables</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-xl">
                    <div className="text-2xl font-black text-orange-600">{configStats.menuItems}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Menu Items</div>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-xl">
                    <div className="text-2xl font-black text-blue-600">{configRowsLoaded}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Total Rows</div>
                  </div>
                </div>
              )}

              {configError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p>{configError}</p>
                    <button
                      onClick={handleRetrySync}
                      className="mt-2 flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-800"
                    >
                      <RefreshCw size={12} /> Retry download
                    </button>
                  </div>
                </div>
              )}

              {configSyncing && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 size={16} className="animate-spin text-rose-500" />
                  Syncing from cloud…
                </div>
              )}
            </div>
          )}

          {/* ── Phase: ready ──────────────────────────────────────────────────── */}
          {phase === 'ready' && (
            <div className="p-10 text-center min-h-[320px] flex flex-col items-center justify-center">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-6 shadow-lg shadow-green-200"
              >
                <CheckCircle2 size={40} className="text-white" />
              </motion.div>

              <h2 className="text-2xl font-black text-gray-900 mb-2">Ready to bill!</h2>
              <p className="text-sm text-gray-500 max-w-sm mb-6">
                Your restaurant data is synced to this device. You can start billing immediately —
                even without internet. Orders will sync to the cloud automatically.
              </p>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8">
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <div className="text-xl font-black text-gray-900">{configStats.tables}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Tables</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <div className="text-xl font-black text-gray-900">{configStats.menuItems}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Items</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-center gap-1">
                    <Wifi size={14} className="text-green-500" />
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mt-1">Offline Ready</div>
                </div>
              </div>

              <button
                onClick={handleGoToCashier}
                className="flex items-center gap-2 px-8 py-4 bg-rose-500 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-rose-600 transition-all shadow-xl shadow-rose-100 active:scale-95"
              >
                Go to Cashier Login
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between px-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft size={14} /> Back to portal
          </button>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className={`w-2 h-2 rounded-full ${edgeOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="font-medium">
              {edgeOnline ? 'Edge server online' : edgeChecking ? 'Edge starting…' : 'Edge offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
