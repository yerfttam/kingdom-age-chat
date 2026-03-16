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

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/admin/data')
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
      <div className="flex-1" style={{ padding: '24px' }}>
        {error && (
          <div className="text-red-600 text-sm mb-4">{error}</div>
        )}

        {data && (
          <p className="text-sm text-[#53585c] my-5">
            Showing {data.rows.length.toLocaleString()} of {data.total.toLocaleString()} total queries
          </p>
        )}

        <div className="bg-white shadow-sm overflow-hidden border border-[#f0f0f0]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Time (UTC)', 'Question', 'Model', 'Response Time', 'Session'].map(h => (
                  <th key={h} className="ka-label text-left px-4 py-3 bg-[#8b0000] text-white">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data && !error && (
                <tr><td colSpan={5} className="text-center text-[#aaa] py-10 text-sm">Loading…</td></tr>
              )}
              {data && data.rows.length === 0 && (
                <tr><td colSpan={5} className="text-center text-[#aaa] py-10 text-sm">No queries yet.</td></tr>
              )}
              {data && data.rows.map((row, i) => (
                <tr key={i} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                  <td className="px-4 py-3 text-sm text-[#53585c] whitespace-nowrap">{row.created_at}</td>
                  <td className="px-4 py-3 text-sm text-[#2c2c2c] max-w-md" title={row.question}>
                    {row.question.length > 120 ? row.question.slice(0, 120) + '…' : row.question}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#53585c]">{row.model || '—'}</td>
                  <td className="px-4 py-3 text-sm text-[#53585c] whitespace-nowrap">
                    {row.response_ms ? row.response_ms.toLocaleString() + ' ms' : '—'}
                  </td>
                  <td className="px-4 py-3 text-[0.7rem] text-[#aaa]">
                    {(row.session_id || '').slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
