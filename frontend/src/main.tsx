import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import ReportPage from './ReportPage.tsx'
import PropheticStatusPage from './PropheticStatusPage.tsx'
import PropheticPage from './PropheticPage.tsx'
import PropheticDetailPage from './PropheticDetailPage.tsx'

const path = window.location.pathname

const isReport           = path.startsWith('/report')
const isPropheticStatus  = path.startsWith('/prophetic-status')
// /prophetic/123  → detail page
const propheticDetailMatch = path.match(/^\/prophetic\/(\d+)$/)
const isPropheticDetail  = !!propheticDetailMatch
const isProphetic        = path.startsWith('/prophetic') && !isPropheticStatus && !isPropheticDetail

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isReport
      ? <ReportPage />
      : isPropheticStatus
      ? <PropheticStatusPage />
      : isPropheticDetail
      ? <PropheticDetailPage id={Number(propheticDetailMatch![1])} />
      : isProphetic
      ? <PropheticPage />
      : <App />}
  </StrictMode>,
)
