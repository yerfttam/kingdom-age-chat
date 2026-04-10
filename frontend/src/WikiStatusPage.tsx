import { useEffect, useState } from 'react'
import { VERSION } from './version'

interface CategoryCount {
  category: string
  count: number
}

interface RecentPage {
  slug: string
  title: string
  category: string
  updated_at: string | null
}

interface SourceTypes {
  videos: number
  pdfs: number
  posts: number
}

interface WikiStatus {
  total_pages: number
  by_category: CategoryCount[]
  total_sources: number
  source_types: SourceTypes
  last_updated: string | null
  recent_pages: RecentPage[]
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function WikiStatusPage() {
  const [status, setStatus] = useState<WikiStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshed, setRefreshed] = useState<Date>(new Date())

  useEffect(() => {
    document.title = 'Wiki Status — Kingdom Age'
  }, [])

  /* Unlock scrolling — global CSS locks height + overflow for chat layout */
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

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/wiki-status')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: WikiStatus) => {
        setStatus(data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [refreshed])

  const CATEGORY_ORDER = ['Concepts', 'Teachings', 'Biblical Texts', 'Series', 'Entities', 'Prophetic']
  const sortedCategories = status
    ? [...status.by_category].sort(
        (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
      )
    : []

  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        background: '#8b0000',
        color: '#fff',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexShrink: 0,
      }}>
        <a href="/wiki" style={{ color: '#ffcccc', textDecoration: 'none', fontSize: '0.82rem', fontFamily: '"Fira Sans", sans-serif' }}>
          ← Wiki
        </a>
        <div style={{
          position: 'absolute', left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <span className="ka-subheader-title" style={{ color: '#fff' }}>
            Wiki Status
          </span>
        </div>
        <div style={{ fontSize: '0.72rem', color: '#ffaaaa', fontFamily: '"Fira Sans", sans-serif' }}>
          {VERSION}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', maxWidth: 720, margin: '0 auto', width: '100%' }}>

        {loading && (
          <p style={{ color: '#888', fontFamily: '"Fira Sans", sans-serif', fontSize: '0.9rem' }}>
            Loading…
          </p>
        )}

        {error && (
          <p style={{ color: '#c0392b', fontFamily: '"Fira Sans", sans-serif', fontSize: '0.9rem' }}>
            Error: {error}
          </p>
        )}

        {status && !loading && (
          <>
            {/* Top stats row */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              <StatCard label="Total Pages" value={status.total_pages} />
              <StatCard label="Sources Ingested" value={status.total_sources} />
              <StatCard label="Videos" value={status.source_types.videos} />
              <StatCard label="PDF Chunks" value={status.source_types.pdfs} />
              <StatCard label="Posts" value={status.source_types.posts} />
            </div>

            {/* Last updated */}
            <div style={{ marginBottom: 24, fontFamily: '"Fira Sans", sans-serif', fontSize: '0.82rem', color: '#888' }}>
              Last updated: <span style={{ color: '#444' }}>{fmtDate(status.last_updated)}</span>
            </div>

            {/* By category */}
            <Section title="Pages by Category">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sortedCategories.map(c => (
                  <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontFamily: '"Fira Sans", sans-serif',
                      fontSize: '0.88rem',
                      color: '#444',
                      width: 140,
                      flexShrink: 0,
                    }}>
                      {c.category}
                    </span>
                    <div style={{
                      flex: 1,
                      height: 10,
                      background: '#e8e8e8',
                      borderRadius: 5,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.round((c.count / status.total_pages) * 100)}%`,
                        background: '#8b0000',
                        borderRadius: 5,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <span style={{
                      fontFamily: '"Barlow", sans-serif',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      color: '#8b0000',
                      width: 30,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}>
                      {c.count}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Recently updated */}
            <Section title="Recently Updated">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {status.recent_pages.map(p => (
                  <div key={p.slug} style={{
                    display: 'flex', alignItems: 'baseline',
                    justifyContent: 'space-between', gap: 8,
                    fontFamily: '"Fira Sans", sans-serif',
                    fontSize: '0.88rem',
                  }}>
                    <a
                      href={`/wiki/${p.slug}`}
                      style={{ color: '#8b0000', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {p.title}
                    </a>
                    <span style={{ color: '#aaa', fontSize: '0.78rem', flexShrink: 0 }}>
                      {fmtRelative(p.updated_at)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Refresh note */}
            <div style={{ marginTop: 32, textAlign: 'center' }}>
              <button
                onClick={() => setRefreshed(new Date())}
                style={{
                  background: 'none',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  padding: '6px 16px',
                  fontFamily: '"Fira Sans", sans-serif',
                  fontSize: '0.8rem',
                  color: '#888',
                  cursor: 'pointer',
                }}
              >
                Refresh
              </button>
              <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#bbb', fontFamily: '"Fira Sans", sans-serif' }}>
                Last fetched {refreshed.toLocaleTimeString()}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: 8,
      padding: '14px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      minWidth: 110,
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: '"Barlow", sans-serif',
        fontWeight: 700,
        fontSize: '1.6rem',
        color: '#8b0000',
        lineHeight: 1,
      }}>
        {value.toLocaleString()}
      </div>
      <div style={{
        fontFamily: '"Fira Sans", sans-serif',
        fontSize: '0.72rem',
        color: '#888',
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        fontFamily: '"Barlow", sans-serif',
        fontWeight: 700,
        fontSize: '0.72rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#aaa',
        marginBottom: 12,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}
