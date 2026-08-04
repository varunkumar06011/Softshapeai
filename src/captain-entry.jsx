// ─────────────────────────────────────────────────────────────────────────────
// captain-entry.jsx — Entry point for the Captain/Cashier Android app
// ─────────────────────────────────────────────────────────────────────────────
// Separate entry point for the captain/cashier app (packaged as Android APK
// via Capacitor). This is a lighter bundle that only includes:
//   - Login screen (email/password or PIN)
//   - Captain App (order taking, table management) — CAPTAIN role only
//   - Cashier App (billing, settlement) — CASHIER role only
//   - Edge setup screen (bridge pairing)
//
// Excludes the admin dashboard, onboarding wizard, and print station to keep
// the APK size small. Uses the same AuthContext, MenuContext, and
// SyncStatusContext as the main app so both roles have offline sync state.
// Socket reconnection is initialized on mount for real-time order updates.
// ─────────────────────────────────────────────────────────────────────────────

import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import AnimatedPage from './shared/components/AnimatedPage'
import './index.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import { MenuProvider } from './context/MenuContext'
import { SyncStatusProvider } from './context/SyncStatusContext'
import LoginScreen from './shared/components/LoginScreen'
import CaptainApp from './captain/CaptainApp'
import CashierDashboard from './cashier/CashierDashboard'
import EdgeSetupScreen from './onboarding/EdgeSetupScreen'
import SyncStatusIndicator from './shared/components/SyncStatusIndicator'
import AppUpdateBanner from './shared/components/AppUpdateBanner'
import { reconnectSocket } from './hooks/useSocket'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { isEdgeAvailable, edgeFetch } from './services/edgeHealth'
import * as Sentry from '@sentry/react'

function isTokenValid(token) {
  if (!token) return false;
  if (token.startsWith('edge-local-')) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return true;
    return Date.now() < payload.exp * 1000;
  } catch {
    return false;
  }
}

// Bug G: Catch unhandled promise rejections that Error Boundaries cannot intercept.
// Dispatches a global event so CaptainApp can reset critical UI state
// (isSubmittingKotRef, sendingKOT) that may be stuck by the rejection.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UnhandledRejection]', event.reason);
  try { Sentry.captureException(event.reason); } catch {}
  window.dispatchEvent(new CustomEvent('app:unhandled-rejection', {
    detail: { message: event.reason?.message || String(event.reason) },
  }));
  event.preventDefault();
});

function CaptainLoginWrapper() {
  const { user, token } = useAuth()
  const [edgeCheck, setEdgeCheck] = useState(null)
  const [edgeRestaurantId, setEdgeRestaurantId] = useState(null)
  const isLoggedIn = user && token && isTokenValid(token) && ['CAPTAIN', 'OWNER', 'ADMIN'].includes(user.role)

  useEffect(() => {
    if (isLoggedIn) return
    let cancelled = false
    ;(async () => {
      try {
        const available = await isEdgeAvailable()
        if (cancelled || !available) { setEdgeCheck(false); return }
        const status = await edgeFetch('/api/edge/status')
        if (cancelled) return
        if (status.registered && status.sessionValid && status.localStats?.menuItems > 0) {
          setEdgeCheck(true)
          if (status.restaurantId) setEdgeRestaurantId(status.restaurantId)
        } else {
          setEdgeCheck('setup')
        }
      } catch {
        if (!cancelled) setEdgeCheck(false)
      }
    })()
    return () => { cancelled = true }
  }, [isLoggedIn])

  if (isLoggedIn) return <Navigate to="/captain/dashboard" replace />
  if (edgeCheck === 'setup') return <Navigate to="/edge-setup" replace />
  return (
    <LoginScreen
      role="captain"
      onLogin={() => {}}
      onBack={() => {}}
      onEdgeSetup={() => { window.location.href = '/edge-setup' }}
      edgeAvailable={edgeCheck === true}
      edgeRestaurantId={edgeRestaurantId}
    />
  )
}

function CaptainAppWrapper() {
  const { user, token, logout } = useAuth()
  if (!(user && token && isTokenValid(token) && ['CAPTAIN', 'OWNER', 'ADMIN'].includes(user.role))) {
    logout()
    return <Navigate to="/captain" replace />
  }
  return (
    <ErrorBoundary>
      <SyncStatusIndicator />
      <CaptainApp onLogout={() => { logout(); window.location.href = '/captain' }} />
    </ErrorBoundary>
  )
}

function CashierLoginWrapper() {
  const { user, token } = useAuth()
  const [edgeCheck, setEdgeCheck] = useState(null)
  const [edgeRestaurantId, setEdgeRestaurantId] = useState(null)
  const isLoggedIn = user && token && isTokenValid(token) && ['CASHIER', 'OWNER', 'ADMIN'].includes(user.role)

  useEffect(() => {
    if (isLoggedIn) return
    let cancelled = false
    ;(async () => {
      try {
        const available = await isEdgeAvailable()
        if (cancelled || !available) { setEdgeCheck(false); return }
        const status = await edgeFetch('/api/edge/status')
        if (cancelled) return
        if (status.registered && status.sessionValid && status.localStats?.menuItems > 0) {
          setEdgeCheck(true)
          if (status.restaurantId) setEdgeRestaurantId(status.restaurantId)
        } else {
          setEdgeCheck('setup')
        }
      } catch {
        if (!cancelled) setEdgeCheck(false)
      }
    })()
    return () => { cancelled = true }
  }, [isLoggedIn])

  if (isLoggedIn) return <Navigate to="/cashier/dashboard" replace />
  if (edgeCheck === 'setup') return <Navigate to="/edge-setup" replace />
  return (
    <LoginScreen
      role="cashier"
      onLogin={() => {}}
      onBack={() => {}}
      onEdgeSetup={() => { window.location.href = '/edge-setup' }}
      edgeAvailable={edgeCheck === true}
      edgeRestaurantId={edgeRestaurantId}
    />
  )
}

function CashierDashboardWrapper() {
  const { user, token, logout } = useAuth()
  if (!(user && token && isTokenValid(token) && ['CASHIER', 'OWNER', 'ADMIN'].includes(user.role))) {
    logout()
    return <Navigate to="/cashier" replace />
  }
  return (
    <ErrorBoundary>
      <SyncStatusIndicator />
      <CashierDashboard onLogout={() => { logout(); window.location.href = '/cashier' }} />
    </ErrorBoundary>
  )
}

function AnimatedCaptainRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/edge-setup" element={<AnimatedPage><EdgeSetupScreen /></AnimatedPage>} />
        <Route path="/captain" element={<AnimatedPage><CaptainLoginWrapper /></AnimatedPage>} />
        <Route path="/captain/dashboard/*" element={<ErrorBoundary><AnimatedPage><CaptainAppWrapper /></AnimatedPage></ErrorBoundary>} />
        <Route path="/cashier" element={<AnimatedPage><CashierLoginWrapper /></AnimatedPage>} />
        <Route path="/cashier/dashboard" element={<ErrorBoundary><AnimatedPage><CashierDashboardWrapper /></AnimatedPage></ErrorBoundary>} />
        <Route path="*" element={<Navigate to="/captain" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

function CaptainRoutes() {
  return (
    <BrowserRouter>
      <AppUpdateBanner />
      <AnimatedCaptainRoutes />
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <SyncStatusProvider>
        <MenuProvider>
          <CaptainRoutes />
        </MenuProvider>
      </SyncStatusProvider>
    </AuthProvider>
  </StrictMode>,
)
