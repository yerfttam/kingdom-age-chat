import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import WikiPage from './WikiPage.tsx'
import WikiStatusPage from './WikiStatusPage.tsx'
import ReportPage from './ReportPage.tsx'

const path = window.location.pathname

const isWiki       = path.startsWith('/wiki') && !path.startsWith('/wiki-status')
const isWikiStatus = path.startsWith('/wiki-status')
const isReport     = path.startsWith('/report')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isWiki ? <WikiPage /> : isWikiStatus ? <WikiStatusPage /> : isReport ? <ReportPage /> : <App />}
  </StrictMode>,
)
