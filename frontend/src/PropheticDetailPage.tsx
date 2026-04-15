import { useState, useEffect } from 'react'
import { VERSION } from './version'
import { Entry, entryTitle, formatDate, TYPE_COLORS } from './PropheticPage'

function formatTimestamp(seconds: number | null): string {
  if (seconds === null) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function PropheticDetailPage({ id }: { id: number }) {
  const [entry,   setEntry]   = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.style.height = 'auto'
    document.documentElement.style.overflow = 'auto'
    document.body.style.height = 'auto'
    document.body.style.overflow = 'auto'
    const root = document.getElementById('root')
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
    fetch(`/api/prophetic-entries/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setEntry(d); document.title = `${entryTitle(d)} — Kingdom Age` })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  const c = entry ? (TYPE_COLORS[entry.type] ?? TYPE_COLORS.vision) : TYPE_COLORS.vision

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
          href="/prophetic"
          style={{ color: '#8b0000', fontFamily: 'Barlow, Helvetica, Arial, sans-serif', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', textDecoration: 'none', flexShrink: 0, zIndex: 1 }}
        >
          ← Archive
        </a>
        <h1 style={{
          position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
          fontFamily: 'Barlow, Helvetica, Arial, sans-serif', fontSize: '0.95rem', fontWeight: 400,
          color: '#333', margin: 0,
        }}>
          Prophetic <span style={{ color: '#8b0000', fontWeight: 700 }}>Archive</span>
        </h1>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, maxWidth: 700, width: '100%', margin: '0 auto', padding: '28px 16px 56px' }}>

        {loading && (
          <p style={{ textAlign: 'center', color: '#aaa', marginTop: 60 }}>Loading…</p>
        )}

        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: 8, padding: 16, color: '#c0392b' }}>
            Could not load entry: {error}
          </div>
        )}

        {entry && (
          <div style={{ background: '#fff', borderRadius: 10, border: `1px solid #e8e8e8`, borderTop: `4px solid ${c.border}`, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

            {/* ── Hero: type + title ── */}
            <div style={{ padding: '24px 24px 18px' }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: c.text, background: c.bg, borderRadius: 3, padding: '3px 9px',
                }}>
                  {entry.type}
                </span>
              </div>
              <h1 style={{
                fontFamily: 'Barlow, Helvetica, Arial, sans-serif',
                fontSize: '1.45rem',
                fontWeight: 700,
                color: '#1a1a1a',
                margin: '0 0 16px',
                lineHeight: 1.3,
              }}>
                {entryTitle(entry)}
              </h1>

              {/* Meta row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px' }}>
                {entry.speaker && (
                  <div>
                    <span style={labelStyle}>Speaker</span>
                    <span style={valueStyle}>{entry.speaker}</span>
                  </div>
                )}
                <div>
                  <span style={labelStyle}>Date</span>
                  <span style={valueStyle}>{formatDate(entry.video_date)}</span>
                </div>
                <div>
                  <span style={labelStyle}>Meeting</span>
                  <span style={valueStyle}>{entry.video_title}</span>
                </div>
                {entry.timestamp_seconds !== null && (
                  <div>
                    <span style={labelStyle}>Timestamp</span>
                    <span style={valueStyle}>{formatTimestamp(entry.timestamp_seconds)}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: '#f0f0f0' }} />

            {/* ── Narrative ── */}
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#bbb', marginBottom: 10 }}>
                Narrative
              </div>
              <p style={{ fontSize: '0.9rem', color: '#333', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
                {entry.narrative}
              </p>
            </div>

            {/* ── Interpretation ── */}
            {entry.interpretation && (
              <>
                <div style={{ height: 1, background: '#f0f0f0' }} />
                <div style={{ padding: '20px 24px', background: '#fafafa' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#bbb', marginBottom: 10 }}>
                    Interpretation (as shared)
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#555', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {entry.interpretation}
                  </p>
                </div>
              </>
            )}

            {/* ── Watch link ── */}
            <div style={{ height: 1, background: '#f0f0f0' }} />
            <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.72rem', color: '#bbb' }}>Source video</span>
              <a
                href={entry.watch_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: '0.8rem', fontWeight: 600, color: '#8b0000',
                  textDecoration: 'none', padding: '7px 14px',
                  border: '1px solid #8b0000', borderRadius: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#8b0000'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8b0000' }}
              >
                Watch on YouTube ↗
              </a>
            </div>

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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '#bbb',
  marginBottom: 2,
}

const valueStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  color: '#333',
  fontWeight: 500,
}
