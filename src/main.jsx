import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { checkEnv } from './lib/envCheck.js'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

checkEnv(); // Vercel'de eksik Environment Variable var mı kontrol et

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
