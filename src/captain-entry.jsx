import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import { MenuProvider } from './context/MenuContext'
import LoginScreen from './shared/components/LoginScreen'
import CaptainApp from './captain/CaptainApp'
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

function CaptainRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/captain" element={<CaptainLoginWrapper />} />
        <Route path="/captain/dashboard/*" element={<CaptainAppWrapper />} />
        <Route path="*" element={<Navigate to="/captain" replace />} />
      </Routes>
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
