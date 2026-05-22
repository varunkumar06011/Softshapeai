import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { queryClient } from './lib/queryClient'
import { MenuProvider } from './context/MenuContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MenuProvider>
        <App />
      </MenuProvider>
    </QueryClientProvider>
  </StrictMode>,
)
