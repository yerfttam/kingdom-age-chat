import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import ReportPage from './ReportPage.tsx'
import PropheticStatusPage from './PropheticStatusPage.tsx'

const path = window.location.pathname

const isReport           = path.startsWith('/report')
const isPropheticStatus  = path.startsWith('/prophetic-status')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isReport
      ? <ReportPage />
      : isPropheticStatus
      ? <PropheticStatusPage />
      : <App />}
  </StrictMode>,
)
