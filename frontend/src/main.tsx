import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import WikiPage from './WikiPage.tsx'
import WikiExplorePage from './WikiExplorePage.tsx'
import WikiStatusPage from './WikiStatusPage.tsx'
import ReportPage from './ReportPage.tsx'

const path = window.location.pathname

const isWikiExplore = path.startsWith('/wiki-explore')
const isWikiStatus  = path.startsWith('/wiki-status')
const isWiki        = path.startsWith('/wiki') && !isWikiExplore && !isWikiStatus
const isReport      = path.startsWith('/report')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isWiki
      ? <WikiPage />
      : isWikiExplore
      ? <WikiExplorePage />
      : isWikiStatus
      ? <WikiStatusPage />
      : isReport
      ? <ReportPage />
      : <App />}
  </StrictMode>,
)
