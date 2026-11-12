// ─────────────────────────────────────────────────────────────────────────────
// main.jsx — Application entry point for the Admin/Cashier portal
// ─────────────────────────────────────────────────────────────────────────────
// Initializes the React app with:
//   - Sentry error tracking (with session replay for error debugging)
//   - MenuProvider (menu data context via useMenuSync hook)
//   - Service worker registration for offline support
//   - StrictMode for development warnings
//
// Sentry config:
//   - 10% trace sample rate (production-safe)
//   - 10% session replay sample rate (normal sessions)
//   - 100% session replay for error sessions
//   - Trace headers propagated to backend for cross-platform error correlation
// ─────────────────────────────────────────────────────────────────────────────

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MenuProvider } from './context/MenuContext'
import { registerSW } from './utils/registerSW'
import { checkAndApplyOtaOnStartup, checkAndDownloadOta } from './services/otaService'
import { prewarmEdgeHealth, startEdgeAutoRecovery, startRuntimeEventBus } from './services/edgeHealth'
import secureStorage from './utils/secureStorage'
import * as Sentry from '@sentry/react'

// ── Secure storage: migrate tokens from localStorage to Tauri filesystem,
//    then pre-load the in-memory cache and purge localStorage copies.
//    Must complete before React renders so synchronous getItem() calls work.
(async () => {
  await secureStorage.migrate();
  await secureStorage.init();

  // ── OTA: apply pending update before React renders ───────────────────────────
  // If an OTA bundle is pending, navigate to it before the app loads.
  // This is async but we don't await it — if it fails, the app loads from
  // bundled assets normally. The OTA check is non-blocking.
  checkAndApplyOtaOnStartup().catch(() => { /* fall back to bundled assets */ });

  // Pre-warm edge health cache so first data fetch doesn't pay the probe latency
  prewarmEdgeHealth();

  // Start edge server auto-recovery (Tauri desktop only — no-op in browser)
  startEdgeAutoRecovery();

  // Connect to the Runtime WebSocket event bus for real-time state updates
  // (runtime.state_changed, config_sync.state_changed, connection.state_changed).
  // Replaces polling for runtime readiness — the UI gets push notifications.
  startRuntimeEventBus();

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    enabled: !!import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Session Replay
    replaysSessionSampleRate: 0.1,  // 10% of sessions — production-safe
    replaysOnErrorSampleRate: 1.0,
    // Propagate trace headers to backend so backend errors appear in replays
    tracePropagationTargets: [
      "localhost",
      /softshape/i,
    ],
  });

  // Catch unhandled promise rejections that React Error Boundaries cannot intercept.
  // Dispatches a global event so app components can reset critical UI state
  // (e.g. isSubmittingKotRef, sendingKOT) that may be stuck by the rejection.
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[UnhandledRejection]', event.reason);
    try { Sentry.captureException(event.reason); } catch {}
    window.dispatchEvent(new CustomEvent('app:unhandled-rejection', {
      detail: { message: event.reason?.message || String(event.reason) },
    }));
    event.preventDefault();
  });

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <MenuProvider>
        <App />
      </MenuProvider>
    </StrictMode>,
  );

  // Register service worker for offline support
  registerSW();

  // Background OTA check — non-blocking, downloads new bundle if available.
  // Applied on next app launch via checkAndApplyOtaOnStartup().
  setTimeout(() => {
    checkAndDownloadOta().catch(() => { /* ignore — non-critical */ });
  }, 10_000);
})();
