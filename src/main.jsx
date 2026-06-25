import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MenuProvider } from './context/MenuContext'
import { OutletProvider } from './context/OutletContext'
import { OnlineStatusProvider } from './context/OnlineStatusContext'
import { registerSW } from './utils/registerSW'
import { initSyncEngine } from './utils/syncEngine'

registerSW();
initSyncEngine();

// Catch unhandled promise rejections that React Error Boundaries cannot intercept
window.addEventListener('unhandledrejection', (event) => {
  console.error('[UnhandledRejection]', event.reason);
  event.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <OutletProvider>
      <OnlineStatusProvider>
        <MenuProvider>
          <App />
        </MenuProvider>
      </OnlineStatusProvider>
    </OutletProvider>
  </StrictMode>,
)
