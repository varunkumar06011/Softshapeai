import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MenuProvider } from './context/MenuContext'
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
});

// Catch unhandled promise rejections that React Error Boundaries cannot intercept
window.addEventListener('unhandledrejection', (event) => {
  console.error('[UnhandledRejection]', event.reason);
  event.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MenuProvider>
      <App />
    </MenuProvider>
  </StrictMode>,
)
