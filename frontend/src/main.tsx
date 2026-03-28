import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ReportPage from './ReportPage.tsx'

const isReport = window.location.pathname.startsWith('/report')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isReport ? <ReportPage /> : <App />}
  </StrictMode>,
)
