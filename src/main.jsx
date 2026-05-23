import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MenuProvider } from './context/MenuContext'
import { OutletProvider } from './context/OutletContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <OutletProvider>
      <MenuProvider>
        <App />
      </MenuProvider>
    </OutletProvider>
  </StrictMode>,
)
