import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import AnimatedPage from './shared/components/AnimatedPage'
import './index.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import { MenuProvider } from './context/MenuContext'
import LoginScreen from './shared/components/LoginScreen'
import CaptainApp from './captain/CaptainApp'
import AppUpdateBanner from './shared/components/AppUpdateBanner'
import { reconnectSocket } from './hooks/useSocket'
import { ErrorBoundary } from './shared/components/ErrorBoundary'

function CaptainLoginWrapper() {
  const { user, setAuth } = useAuth()
  const isLoggedIn = user && ['CAPTAIN', 'CASHIER'].includes(user.role)
  if (isLoggedIn) return <Navigate to="/captain/dashboard" replace />
  return (
    <LoginScreen
      role="captain"
      onLogin={() => {}}
      onBack={() => {}}
    />
  )
}

function CaptainAppWrapper() {
  const { user, logout } = useAuth()
  if (!(user && ['CAPTAIN', 'CASHIER'].includes(user.role))) {
    return <Navigate to="/captain" replace />
  }
  return (
    <ErrorBoundary>
      <CaptainApp onLogout={() => { logout(); window.location.href = '/captain' }} />
    </ErrorBoundary>
  )
}

function AnimatedCaptainRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/captain" element={<AnimatedPage><CaptainLoginWrapper /></AnimatedPage>} />
        <Route path="/captain/dashboard/*" element={<ErrorBoundary><AnimatedPage><CaptainAppWrapper /></AnimatedPage></ErrorBoundary>} />
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
      <MenuProvider>
        <CaptainRoutes />
      </MenuProvider>
    </AuthProvider>
  </StrictMode>,
)
