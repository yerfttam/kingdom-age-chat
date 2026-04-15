import { useState, useEffect, useRef, useCallback } from 'react'
import { VERSION } from './version'

/* ─── types ──────────────────────────────────────────────────────── */

export interface Entry {
  id:                number
  video_id:          string
  video_title:       string
  video_url:         string
  watch_url:         string
  video_date:        string | null
  speaker:           string | null
  type:              'vision' | 'dream'
  narrative:         string
  interpretation:    string | null
  timestamp_seconds: number | null
}

/* ─── helpers ────────────────────────────────────────────────────── */

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function entryTitle(entry: Pick<Entry, 'speaker' | 'type' | 'video_date'>): string {
  const type = entry.type === 'vision' ? 'Vision' : 'Dream'
  if (entry.speaker) return `${entry.speaker}'s ${type}`
  if (entry.video_date) return `${type} — ${formatDate(entry.video_date)}`
  return type
}

export const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  vision: { bg: '#f3eeff', text: '#5b2d8b', border: '#5b2d8b' },
  dream:  { bg: '#e8f4f8', text: '#1a5276', border: '#1a5276' },
}

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? TYPE_COLORS.vision
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.6rem',
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: '#fff',
      background: c.border,
      borderRadius: 3,
      padding: '2px 7px',
      flexShrink: 0,
    }}>
      {type}
    </span>
  )
}

function EntryRow({ entry, query }: { entry: Entry; query: string }) {
  const c = TYPE_COLORS[entry.type] ?? TYPE_COLORS.vision
  const title = entryTitle(entry)
  const preview = entry.narrative.length > 120
    ? entry.narrative.slice(0, 120) + '…'
    : entry.narrative

  const highlightText = (text: string) => {
    if (!query.trim()) return text
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fff3cd;padding:0 1px">$1</mark>')
  }

  return (
    <div
      onClick={() => window.location.href = `/prophetic/${entry.id}`}
      style={{
        background: '#fff',
        border: '1px solid #e8e8e8',
        borderLeft: `4px solid ${c.border}`,
        borderRadius: '0 8px 8px 0',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <TypeBadge type={entry.type} />
        <span
          style={{ fontSize: '0.88rem', fontWeight: 600, color: '#222' }}
          dangerouslySetInnerHTML={{ __html: highlightText(title) }}
        />
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#bbb', flexShrink: 0 }}>
          {formatDate(entry.video_date)}
        </span>
      </div>

      {/* Narrative preview */}
      <p
        style={{ fontSize: '0.8rem', color: '#666', lineHeight: 1.55, margin: 0 }}
        dangerouslySetInnerHTML={{ __html: highlightText(preview) }}
      />

      {/* Meeting name */}
      <div style={{ marginTop: 5, fontSize: '0.68rem', color: '#bbb' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(e => <EntryRow key={e.id} entry={e} query={query} />)}
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

  useEffect(() => { fetchEntries('') }, [fetchEntries])

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
              {liveQuery.trim() ? `No entries matched "${liveQuery}".` : 'No prophetic entries yet.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
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
