import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import WikiPage from './WikiPage.tsx'
import ReportPage from './ReportPage.tsx'

const path = window.location.pathname

const isWiki   = path.startsWith('/wiki')
const isReport = path.startsWith('/report')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isWiki ? <WikiPage /> : isReport ? <ReportPage /> : <App />}
  </StrictMode>,
)
