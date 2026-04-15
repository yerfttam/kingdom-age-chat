import { useState, useEffect, useRef, useCallback } from 'react'
import { VERSION } from './version'

/* ─── types ──────────────────────────────────────────────────────── */

interface Entry {
  id:             number
  video_id:       string
  video_title:    string
  video_url:      string
  video_date:     string | null
  speaker:        string | null
  type:           'vision' | 'dream'
  narrative:      string
  interpretation: string | null
}

/* ─── helpers ────────────────────────────────────────────────────── */

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00') // avoid timezone shift on date-only strings
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function TypeBadge({ type }: { type: string }) {
  const isVision = type === 'vision'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.6rem',
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: '#fff',
      background: isVision ? '#5b2d8b' : '#1a5276',
      borderRadius: 3,
      padding: '2px 7px',
      flexShrink: 0,
    }}>
      {type}
    </span>
  )
}

function EntryCard({ entry, query }: { entry: Entry; query: string }) {
  const [expanded, setExpanded] = useState(false)
  const PREVIEW = 400

  const highlight = (text: string) => {
    if (!query.trim()) return text
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fff3cd;padding:0 1px">$1</mark>')
  }

  const narrative    = entry.narrative
  const isLong       = narrative.length > PREVIEW
  const displayText  = expanded || !isLong ? narrative : narrative.slice(0, PREVIEW) + '…'

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e4e4e4',
      borderLeft: `4px solid ${entry.type === 'vision' ? '#5b2d8b' : '#1a5276'}`,
      borderRadius: '0 8px 8px 0',
      padding: '14px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Row 1: type badge + speaker + date + watch link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <TypeBadge type={entry.type} />
        {entry.speaker && (
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#444' }}>{entry.speaker}</span>
        )}
        {entry.video_date && (
          <span style={{ fontSize: '0.72rem', color: '#999' }}>{formatDate(entry.video_date)}</span>
        )}
        <a
          href={entry.video_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#8b0000', textDecoration: 'none', flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          Watch ↗
        </a>
      </div>

      {/* Narrative */}
      <p
        style={{ fontSize: '0.85rem', color: '#333', lineHeight: 1.65, margin: 0 }}
        dangerouslySetInnerHTML={{ __html: highlight(displayText) }}
      />
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#8b0000', padding: '6px 0 0', display: 'block' }}
        >
          {expanded ? 'Show less ↑' : 'Read more ↓'}
        </button>
      )}

      {/* Interpretation */}
      {entry.interpretation && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#aaa', display: 'block', marginBottom: 4 }}>
            Interpretation (as shared)
          </span>
          <p
            style={{ fontSize: '0.82rem', color: '#555', lineHeight: 1.6, margin: 0 }}
            dangerouslySetInnerHTML={{ __html: highlight(entry.interpretation) }}
          />
        </div>
      )}

      {/* Source */}
      <div style={{ marginTop: 8, fontSize: '0.68rem', color: '#bbb' }}>
        {entry.video_title}
      </div>
    </div>
  )
}

function Section({
  title, color, entries, query, emptyMsg
}: {
  title: string
  color: string
  entries: Entry[]
  query: string
  emptyMsg: string
}) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{
          fontFamily: 'Barlow, Helvetica, Arial, sans-serif',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color,
          margin: 0,
          flexShrink: 0,
        }}>
          {title}
        </h2>
        <div style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
        <span style={{ fontSize: '0.6rem', color: '#ccc' }}>{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: '#bbb', fontStyle: 'italic', paddingLeft: 4 }}>{emptyMsg}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(e => <EntryCard key={e.id} entry={e} query={query} />)}
        </div>
      )}
    </section>
  )
}

/* ─── PropheticPage ──────────────────────────────────────────────── */

export default function PropheticPage() {
  const [visions, setVisions]   = useState<Entry[]>([])
  const [dreams,  setDreams]    = useState<Entry[]>([])
  const [total,   setTotal]     = useState(0)
  const [loading, setLoading]   = useState(true)

  const [query,     setQuery]     = useState('')
  const [liveQuery, setLiveQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Unlock scrolling (same pattern as WikiExplorePage) */
  useEffect(() => {
    document.title = 'Prophetic Archive — Kingdom Age'
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

  const fetchEntries = useCallback((q: string) => {
    setLoading(true)
    const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
    fetch(`/api/prophetic-entries${params}`)
      .then(r => r.json())
      .then(data => {
        setVisions(data.visions ?? [])
        setDreams(data.dreams ?? [])
        setTotal(data.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  /* Initial load */
  useEffect(() => { fetchEntries('') }, [fetchEntries])

  /* Debounced search */
  const handleSearch = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLiveQuery(val)
      fetchEntries(val)
    }, 350)
  }

  const clearSearch = () => {
    setQuery('')
    setLiveQuery('')
    fetchEntries('')
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>

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
        <a
          href="/"
          style={{ color: '#8b0000', fontFamily: 'Barlow, Helvetica, Arial, sans-serif', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', textDecoration: 'none', flexShrink: 0, zIndex: 1 }}
        >
          ← Chat
        </a>
        <h1 style={{
          position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
          fontFamily: 'Barlow, Helvetica, Arial, sans-serif', fontSize: '0.95rem', fontWeight: 400,
          color: '#333', margin: 0,
        }}>
          Prophetic <span style={{ color: '#8b0000', fontWeight: 700 }}>Archive</span>
        </h1>
        <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#ccc', flexShrink: 0, zIndex: 1 }}>
          {total > 0 ? `${total} entries` : ''}
        </span>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, maxWidth: 700, width: '100%', margin: '0 auto', padding: '20px 16px 48px' }}>

        {/* Search */}
        <div className="ka-input-card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && clearSearch()}
              placeholder="Search visions and dreams…"
              className="ka-input-field"
              style={{ flex: 1 }}
            />
            {query && (
              <button
                onClick={clearSearch}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '1.1rem', lineHeight: 1, padding: '0 4px' }}
              >×</button>
            )}
          </div>
          {liveQuery.trim() && !loading && (
            <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#999', paddingLeft: 2 }}>
              {total} result{total !== 1 ? 's' : ''} for "{liveQuery}"
            </div>
          )}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', marginTop: 40 }}>Loading…</p>
        ) : total === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 60 }}>
            <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
              {liveQuery.trim() ? `No entries matched "${liveQuery}".` : 'No prophetic entries yet. Run extract_prophetic.py to start scanning.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            <Section
              title="Visions"
              color="#5b2d8b"
              entries={visions}
              query={liveQuery}
              emptyMsg={liveQuery ? 'No visions matched.' : 'No visions found yet.'}
            />
            <Section
              title="Dreams"
              color="#1a5276"
              entries={dreams}
              query={liveQuery}
              emptyMsg={liveQuery ? 'No dreams matched.' : 'No dreams found yet.'}
            />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: '1px solid #e8e8e8', background: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.6rem', color: '#ccc', fontFamily: 'Barlow, Helvetica, Arial, sans-serif' }}>{VERSION}</span>
      </div>
    </div>
  )
}
