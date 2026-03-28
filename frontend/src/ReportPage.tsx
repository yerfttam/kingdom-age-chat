import { useState, useEffect } from 'react'

interface QueryRow {
  created_at: string
  question: string
  model: string
  response_ms: number | null
  session_id: string | null
}

interface AdminData {
  rows: QueryRow[]
  total: number
}

export default function ReportPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Allow native browser scroll on admin page (global CSS sets overflow: hidden)
    const root = document.getElementById('root')
    document.documentElement.style.overflow = 'auto'
    document.documentElement.style.height = 'auto'
    document.body.style.overflow = 'auto'
    document.body.style.height = 'auto'
    if (root) { root.style.overflow = 'auto'; root.style.height = 'auto' }
    return () => {
      document.documentElement.style.overflow = ''
      document.documentElement.style.height = ''
      document.body.style.overflow = ''
      document.body.style.height = ''
      if (root) { root.style.overflow = ''; root.style.height = '' }
    }
  }, [])

  useEffect(() => {
    fetch('/report/data')
      .then(r => r.json())
      .then(setData)
      .catch(() => setError('Failed to load query data.'))
  }, [])

  return (
    <div className="flex flex-col min-h-dvh w-full">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-center flex-shrink-0 px-6 bg-[#8b0000]" style={{ paddingTop: '20px', paddingBottom: '8px' }}>
        <div className="relative h-[52px] w-[108px]">
          <img src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png" alt=""
            className="absolute inset-0 h-[52px] w-auto"
            style={{ filter: 'sepia(1) saturate(4) hue-rotate(5deg) brightness(1.3)', clipPath: 'inset(0 62% 0 0)' }}
          />
          <img src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png" alt="Kingdom Age"
            className="absolute inset-0 h-[52px] w-auto"
            style={{ filter: 'brightness(0) invert(1)', clipPath: 'inset(0 0 0 34%)' }}
          />
        </div>
      </div>

      {/* ── Sub-header ── */}
      <div className="flex items-center justify-center flex-shrink-0 py-2 px-4 bg-white border-b-2 border-[#e8e8e8]">
        <h1 className="ka-subheader-title">Kingdom Age Chat Query Log</h1>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '24px' }}>
        {error && (
          <div className="text-red-600 text-sm mb-4">{error}</div>
        )}

        {data && (
          <p className="text-sm text-[#53585c] my-5">
            Showing {data.rows.length.toLocaleString()} of {data.total.toLocaleString()} total queries
          </p>
        )}

        <div className="bg-white border border-[#f0f0f0] shadow-sm">
          {!data && !error && (
            <div className="text-center text-[#aaa] py-10 text-sm">Loading…</div>
          )}
          {data && data.rows.length === 0 && (
            <div className="text-center text-[#aaa] py-10 text-sm">No queries yet.</div>
          )}
          {data && data.rows.map((row, i) => (
            <div key={i} className="px-4 py-4 border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
              <div className="text-[0.7rem] text-[#aaa] mb-1">{row.created_at}</div>
              <div className="text-sm text-[#2c2c2c]">{row.question}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
