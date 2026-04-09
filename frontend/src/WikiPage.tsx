import { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { VERSION } from './version'

/* ─── types ──────────────────────────────────────────────────────── */

interface PageSummary {
  slug: string
  title: string
  category: string
  tags: string[]
  updated_at: string | null
}

interface PageDetail extends PageSummary {
  body: string
  sources: string[]
  created_at: string | null
}

interface SearchResult {
  slug: string
  title: string
  category: string
  tags: string[]
  rank: number
  excerpt: string
}

/* ─── constants ──────────────────────────────────────────────────── */

const CATEGORY_ORDER = ['Concepts', 'Teachings', 'Biblical Texts', 'Prophetic', 'Series', 'Entities']

const CATEGORY_COLOR: Record<string, string> = {
  'Concepts':      '#8b0000',
  'Teachings':     '#c0392b',
  'Biblical Texts':'#6b3a3a',
  'Prophetic':     '#5b2d8b',
  'Series':        '#1a5276',
  'Entities':      '#666',
}

/* ─── helpers ────────────────────────────────────────────────────── */

function CategoryBadge({ category }: { category: string }) {
  const color = CATEGORY_COLOR[category] ?? '#888'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.6rem',
      fontFamily: 'Barlow, Helvetica, Arial, sans-serif',
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: '#fff',
      background: color,
      borderRadius: 3,
      padding: '2px 6px',
      flexShrink: 0,
    }}>
      {category}
    </span>
  )
}

function TagList({ tags }: { tags: string[] }) {
  if (!tags?.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {tags.map(t => (
        <span key={t} style={{
          fontSize: '0.6rem',
          color: '#999',
          background: '#f0f0f0',
          border: '1px solid #e4e4e4',
          borderRadius: 10,
          padding: '1px 7px',
        }}>
          {t}
        </span>
      ))}
    </div>
  )
}

/* Convert [[slug]] and [[slug|display text]] to interceptable paths */
function processWikiLinks(body: string): string {
  return body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, slug, label) =>
    `[${label ?? slug}](/wiki-internal/${slug.trim()})`
  )
}

/* Strip the ## Sources section from the body — we render sources from the JSONB array instead */
function stripSourcesSection(body: string): string {
  return body.replace(/\n?## Sources[\s\S]*$/m, '').trimEnd()
}

/* Render a source string as a React element — video:{id} — Title becomes a YouTube link */
function renderSource(s: string, i: number) {
  const m = s.match(/^video:([A-Za-z0-9_-]+)(?:\s*[—–-]\s*(.+))?$/)
  if (m) {
    const [, id, title] = m
    const label = title ? title.trim() : id
    return (
      <a key={i} href={`https://youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer"
        style={{ display: 'block', color: '#8b0000', fontSize: '0.82rem', textDecoration: 'none', marginBottom: 6 }}
        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
      >
        {label} ↗
      </a>
    )
  }
  // PDF or unknown source — plain text
  return <span key={i} style={{ display: 'block', fontSize: '0.82rem', color: '#888', marginBottom: 6 }}>{s}</span>
}

/* ─── WikiPage ───────────────────────────────────────────────────── */

export default function WikiPage() {
  const [grouped, setGrouped]           = useState<Record<string, PageSummary[]>>({})
  const [total, setTotal]               = useState(0)
  const [indexLoading, setIndexLoading] = useState(true)

  const [currentPage, setCurrentPage]   = useState<PageDetail | null>(null)
  const [pageLoading, setPageLoading]   = useState(false)
  const [pageMode, setPageMode]         = useState(false)  // true when we're in page view, even if load failed

  const [searchQuery, setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching]       = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const topRef    = useRef<HTMLDivElement>(null)

  /* Set page title */
  useEffect(() => {
    const prev = document.title
    document.title = 'Kingdom Age Wiki'
    return () => { document.title = prev }
  }, [])

  /* Unlock scrolling — the global CSS locks height + overflow for the chat layout */
  useEffect(() => {
    const root = document.getElementById('root')
    document.documentElement.style.height = 'auto'
    document.documentElement.style.overflow = 'auto'
    document.body.style.height = 'auto'
    document.body.style.overflow = 'auto'
    if (root) { root.style.height = 'auto'; root.style.overflow = 'visible' }
    return () => {
      document.documentElement.style.height = ''
      document.documentElement.style.overflow = ''
      document.body.style.height = ''
      document.body.style.overflow = ''
      if (root) { root.style.height = ''; root.style.overflow = '' }
    }
  }, [])

  /* load index */
  useEffect(() => {
    fetch('/api/wiki')
      .then(r => r.json())
      .then(data => {
        setGrouped(data.grouped ?? {})
        setTotal(data.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setIndexLoading(false))
  }, [])

  /* open a page — optionally skip pushState when called from popstate handler */
  const openPage = useCallback(async (slug: string, pushHistory = true) => {
    setPageMode(true)
    setPageLoading(true)
    setCurrentPage(null)
    topRef.current?.scrollIntoView()
    if (pushHistory) window.history.pushState({ slug }, '', `/wiki/${slug}`)
    try {
      const r = await fetch(`/api/wiki/${slug}`)
      if (!r.ok) throw new Error('not found')
      setCurrentPage(await r.json())
    } catch {
      setCurrentPage(null)
    } finally {
      setPageLoading(false)
    }
  }, [])

  /* go back to index */
  const goIndex = (pushHistory = true) => {
    setCurrentPage(null)
    setPageLoading(false)
    setPageMode(false)
    if (pushHistory) window.history.pushState({}, '', '/wiki')
    topRef.current?.scrollIntoView()
  }

  /* handle browser back/forward */
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const slug = e.state?.slug
      if (slug) {
        openPage(slug, false)
      } else {
        goIndex(false)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [openPage])

  /* on mount, load page if URL is /wiki/some-slug */
  useEffect(() => {
    const match = window.location.pathname.match(/^\/wiki\/(.+)$/)
    if (match) {
      openPage(match[1], false)
    }
  }, [])

  /* search */
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const r = await fetch(`/api/wiki/search?q=${encodeURIComponent(q.trim())}&limit=20`)
      const data = await r.json()
      setSearchResults(data.results ?? [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') runSearch(searchQuery)
    if (e.key === 'Escape') { setSearchQuery(''); setSearchResults(null) }
  }

  /* custom link renderer — intercepts wiki-internal: links */
  const linkRenderer = useCallback(({ href, children }: any) => {
    if (href?.startsWith('/wiki-internal/')) {
      const slug = href.replace('/wiki-internal/', '')
      return (
        <button
          onClick={e => { e.preventDefault(); openPage(slug) }}
          style={{ color: '#8b0000', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
        >
          {children}
        </button>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#8b0000' }}>
        {children}
      </a>
    )
  }, [openPage])

  const isPageView = pageMode

  return (
    <div style={{ minHeight: '100dvh', overflowY: 'auto', background: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
      <div ref={topRef} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 24px 8px', background: '#8b0000', flexShrink: 0 }}>
        <div style={{ position: 'relative', height: 52, width: 108 }}>
          <img
            src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png" alt=""
            style={{ position: 'absolute', inset: 0, height: 52, width: 'auto', filter: 'sepia(1) saturate(4) hue-rotate(5deg) brightness(1.3)', clipPath: 'inset(0 62% 0 0)' }}
          />
          <img
            src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png" alt="Kingdom Age"
            style={{ position: 'absolute', inset: 0, height: 52, width: 'auto', filter: 'brightness(0) invert(1)', clipPath: 'inset(0 0 0 34%)' }}
          />
        </div>
      </div>

      {/* ── Sub-header ── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '8px 16px', background: '#fff', borderBottom: '2px solid #e8e8e8', flexShrink: 0 }}>
        {/* Back button — left-anchored */}
        {isPageView && (
          <button
            onClick={() => goIndex()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b0000', fontFamily: 'Barlow, Helvetica, Arial, sans-serif', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0, zIndex: 1 }}
          >
            ← Wiki
          </button>
        )}
        {/* Title — always centered */}
        <h1 className="ka-subheader-title" style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
          Kingdom Age <span style={{ color: '#8b0000' }}>Wiki</span>
        </h1>
        {/* Page count — right-anchored spacer */}
        <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#ccc', flexShrink: 0, zIndex: 1 }}>
          {!isPageView && total > 0 ? `${total} pages` : ''}
        </span>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, maxWidth: 700, width: '100%', margin: '0 auto', padding: '20px 16px 48px' }}>

        {/* ── Index view ── */}
        {!isPageView && (
          <>
            {/* Search */}
            <div className="ka-input-card" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKey}
                  placeholder="Search the wiki…"
                  className="ka-input-field"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => runSearch(searchQuery)}
                  disabled={!searchQuery.trim() || searching}
                  className="ka-send-btn"
                >
                  {searching ? '…' : 'Search'}
                </button>
                {searchResults !== null && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchResults(null) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '1.1rem', lineHeight: 1, padding: '0 2px' }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Search results */}
            {searchResults !== null && (
              <div style={{ marginBottom: 24 }}>
                <p className="ka-label" style={{ color: '#888', marginBottom: 12 }}>
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
                </p>
                {searchResults.length === 0 && (
                  <p style={{ fontSize: '0.9rem', color: '#aaa', fontStyle: 'italic' }}>No pages matched.</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {searchResults.map(r => (
                    <button
                      key={r.slug}
                      onClick={() => openPage(r.slug)}
                      style={{ textAlign: 'left', background: '#fff', border: '1px solid #e4e4e4', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#c0392b')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#e4e4e4')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a', flex: 1 }}>{r.title}</span>
                        <CategoryBadge category={r.category} />
                      </div>
                      <p
                        style={{ fontSize: '0.8rem', color: '#666', lineHeight: 1.5, margin: 0 }}
                        dangerouslySetInnerHTML={{ __html: r.excerpt }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Category index */}
            {searchResults === null && (
              indexLoading ? (
                <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', marginTop: 40 }}>Loading…</p>
              ) : total === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 60 }}>
                  <p style={{ color: '#aaa', fontSize: '0.9rem' }}>The wiki is empty.</p>
                  <p style={{ color: '#ccc', fontSize: '0.8rem', marginTop: 8 }}>Run the ingest script to populate it.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                  {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
                    <section key={cat}>
                      {/* Category header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <h2 style={{
                          fontFamily: 'Barlow, Helvetica, Arial, sans-serif',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: CATEGORY_COLOR[cat] ?? '#888',
                        }}>
                          {cat}
                        </h2>
                        <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
                        <span style={{ fontSize: '0.6rem', color: '#ccc' }}>{grouped[cat].length}</span>
                      </div>

                      {/* Page list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {grouped[cat].map(page => (
                          <button
                            key={page.slug}
                            onClick={() => openPage(page.slug)}
                            style={{ textAlign: 'left', background: '#fff', border: '1px solid #e4e4e4', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#c0392b'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(192,57,43,0.1)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e4e4e4'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: page.tags?.length ? 6 : 0 }}>
                              <span style={{ flex: 1, fontSize: '0.92rem', fontWeight: 600, color: '#1a1a1a' }}>{page.title}</span>
                              <span style={{ fontSize: '0.62rem', color: '#bbb', flexShrink: 0 }}>›</span>
                            </div>
                            {page.tags?.length > 0 && <TagList tags={page.tags.slice(0, 5)} />}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}

                  {/* Any uncategorised */}
                  {Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)).map(cat => (
                    <section key={cat}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <h2 style={{ fontFamily: 'Barlow, Helvetica, Arial, sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888' }}>{cat}</h2>
                        <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {grouped[cat].map(page => (
                          <button key={page.slug} onClick={() => openPage(page.slug)}
                            style={{ textAlign: 'left', background: '#fff', border: '1px solid #e4e4e4', borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}
                          >
                            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#1a1a1a' }}>{page.title}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )
            )}
          </>
        )}

        {/* ── Page view ── */}
        {isPageView && (
          <>
            {pageLoading && (
              <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', marginTop: 40 }}>Loading…</p>
            )}

            {!pageLoading && currentPage && (
              <article>
                {/* Page header */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <h2 style={{
                      fontFamily: 'Barlow, Helvetica, Arial, sans-serif',
                      fontSize: '1.4rem',
                      fontWeight: 700,
                      color: '#1a1a1a',
                      lineHeight: 1.2,
                      flex: 1,
                      minWidth: 0,
                    }}>
                      {currentPage.title}
                    </h2>
                    <CategoryBadge category={currentPage.category} />
                  </div>
                  {currentPage.tags?.length > 0 && <TagList tags={currentPage.tags} />}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#e8e8e8', marginBottom: 20 }} />

                {/* Body */}
                <div className="ka-markdown" style={{
                  fontSize: '0.95rem',
                  lineHeight: 1.75,
                  color: '#2c2c2c',
                }}>
                  <ReactMarkdown components={{ a: linkRenderer }}>
                    {processWikiLinks(stripSourcesSection(currentPage.body))}
                  </ReactMarkdown>
                </div>

                {/* Sources — rendered from JSONB array, always accurate */}
                {currentPage.sources && currentPage.sources.length > 0 && (
                  <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #e8e8e8' }}>
                    <p style={{ fontSize: '0.65rem', fontFamily: 'Barlow, Helvetica, Arial, sans-serif', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#aaa', marginBottom: 10 }}>
                      Sources
                    </p>
                    {currentPage.sources.map((s, i) => renderSource(String(s), i))}
                  </div>
                )}

                {/* Updated at */}
                {currentPage.updated_at && (
                  <p style={{ marginTop: 24, fontSize: '0.62rem', color: '#ccc', textAlign: 'right' }}>
                    Last updated {new Date(currentPage.updated_at).toLocaleDateString()}
                  </p>
                )}
              </article>
            )}

            {!pageLoading && !currentPage && (
              <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', marginTop: 40 }}>Page not found.</p>
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: '1px solid #e8e8e8', background: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.6rem', color: '#ccc', fontFamily: 'Barlow, Helvetica, Arial, sans-serif' }}>{VERSION}</span>
      </div>
    </div>
  )
}
