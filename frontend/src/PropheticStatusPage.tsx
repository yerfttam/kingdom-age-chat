import { useEffect, useState } from 'react'

interface StatusData {
  total_videos:   number
  scanned:        number
  remaining:      number
  pct_complete:   number
  total_entries:  number
  visions:        number
  dreams:         number
  last_scanned:   string | null
  recent_entries: RecentEntry[]
}

interface RecentEntry {
  video_id:    string
  video_title: string
  video_url:   string
  video_date:  string | null
  speaker:     string | null
  type:        string
  narrative:   string
  created_at:  string | null
}

function fmt(n: number) {
  return n.toLocaleString()
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function PropheticStatusPage() {
  const [data, setData]       = useState<StatusData | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/prophetic-status')
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: '#f7f7f7', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#8b0000', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png"
          alt="Kingdom Age"
          style={{ height: 36, filter: 'brightness(0) invert(1)', clipPath: 'inset(0 0 0 34%)' }}
        />
        <div>
          <div style={{ color: 'white', fontSize: '1rem', fontWeight: 600 }}>Prophetic Archive</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Scan Status</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {loading && (
          <div style={{ textAlign: 'center', color: '#aaa', padding: 48 }}>Loading…</div>
        )}

        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: 8, padding: 16, color: '#c0392b' }}>
            Error loading status: {error}
          </div>
        )}

        {data && (
          <>
            {/* Progress bar */}
            <div style={{ background: 'white', borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: '#333' }}>Scan Progress</span>
                <span style={{ color: '#8b0000', fontWeight: 700 }}>{data.pct_complete}%</span>
              </div>
              <div style={{ background: '#f0f0f0', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                <div style={{
                  width: `${data.pct_complete}%`,
                  background: 'linear-gradient(90deg, #8b0000, #c0392b)',
                  height: '100%',
                  borderRadius: 99,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.78rem', color: '#999' }}>
                <span>{fmt(data.scanned)} scanned</span>
                <span>{fmt(data.remaining)} remaining of {fmt(data.total_videos)} total</span>
              </div>
              {data.last_scanned && (
                <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#bbb' }}>
                  Last scan: {timeAgo(data.last_scanned)}
                </div>
              )}
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Total Entries',  value: fmt(data.total_entries), color: '#8b0000' },
                { label: 'Visions',        value: fmt(data.visions),       color: '#6d4c9f' },
                { label: 'Dreams',         value: fmt(data.dreams),        color: '#1a6b8a' },
              ].map(s => (
                <div key={s.label} style={{
                  background: 'white', borderRadius: 10, padding: '20px 16px',
                  textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.75rem', color: '#999', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent entries */}
            <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
                Recent Entries
              </h2>

              {data.recent_entries.length === 0 ? (
                <div style={{ color: '#bbb', fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
                  No entries yet — run extract_prophetic.py to start scanning.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {data.recent_entries.map((e, i) => (
                    <div key={i} style={{
                      borderLeft: `3px solid ${e.type === 'vision' ? '#6d4c9f' : '#1a6b8a'}`,
                      paddingLeft: 14,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 99,
                          background: e.type === 'vision' ? '#f3eeff' : '#e8f4f8',
                          color: e.type === 'vision' ? '#6d4c9f' : '#1a6b8a',
                        }}>{e.type}</span>
                        {e.speaker && (
                          <span style={{ fontSize: '0.75rem', color: '#666', fontWeight: 500 }}>{e.speaker}</span>
                        )}
                        {e.video_date && (
                          <span style={{ fontSize: '0.72rem', color: '#aaa' }}>{e.video_date}</span>
                        )}
                        <a
                          href={e.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.72rem', color: '#8b0000', textDecoration: 'none', marginLeft: 'auto' }}
                          onMouseEnter={ev => (ev.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={ev => (ev.currentTarget.style.textDecoration = 'none')}
                        >
                          Watch ↗
                        </a>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#444', lineHeight: 1.5 }}>
                        {e.narrative}{e.narrative.length >= 300 ? '…' : ''}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#bbb', marginTop: 4 }}>
                        {e.video_title}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
