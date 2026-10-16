import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrimeReactProvider } from '@primereact/core'
import Aura from '@primeuix/themes/aura'
import 'primeicons/primeicons.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrimeReactProvider theme={{ preset: Aura, options: { darkModeSelector: false } }}>
      <App />
    </PrimeReactProvider>
  </StrictMode>,
)
