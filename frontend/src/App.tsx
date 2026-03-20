import { useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { useKingdomAgeChat } from './hooks/useKingdomAgeChat'
import type { Message } from '@llamaindex/chat-ui'

/* ─── helpers ─────────────────────────────────────────────────── */

function getText(msg: Message): string {
  const part = msg.parts.find((p) => p.type === 'text')
  return part && 'text' in part ? part.text : ''
}

function makeUserMessage(text: string): Message {
  return { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }] }
}

function getSources(msg: Message): { title: string; url: string }[] {
  const part = msg.parts.find((p) => p.type === 'data-sources')
  if (!part || !('data' in part)) return []
  return ((part as any).data?.nodes ?? []).map((n: any) => ({
    title: n.metadata?.file_name ?? n.url,
    url: n.url,
  }))
}

/* ─── constants ────────────────────────────────────────────────── */

const MODELS = [
  { group: 'Anthropic', options: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fast' },
    { value: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 — balanced' },
    { value: 'claude-opus-4-6',           label: 'Opus 4.6 — powerful' },
  ]},
  { group: 'OpenAI', options: [
    { value: 'gpt-4o-mini', label: 'GPT-4o mini — fast' },
    { value: 'gpt-4o',      label: 'GPT-4o — balanced' },
  ]},
]

const VERSION = 'v2.8.2'

const PROMPT_CATEGORIES = [
  {
    name: 'Foundations',
    prompts: [
      'Who is Jesus?',
      'What is the meaning of life?',
      'What is the Kingdom Age?',
      'What is the difference between the church age and the kingdom age?',
      "What is God's eternal purpose?",
      "What is God's will for my life?",
      'How can I come to know God?',
      'What is a son of God?',
      'What is True Love?',
    ],
  },
  {
    name: 'Teaching',
    prompts: [
      'Define Institutional Christianity.',
      'Is there hierarchy in the Body of Christ?',
      'What are spiritual gifts for?',
      'How is God glorified?',
      'What is the spirit of Sonship?',
      'What is Baptism?',
      'What is the Ancient way?',
      "What is God's Business?",
      'Why do we observe the Feasts of the Lord?',
      'Why do they discuss Ancient Eastern philosophy?',
      'What is the Pattern Life?',
      "What is God's divine order?",
    ],
  },
  {
    name: 'Community',
    prompts: [
      'What makes this community different from other churches?',
      'Is this a cult?',
      'How did former generations miss the mark of God\'s purpose?',
      'How can someone become a part of this community?',
      'Do these people think they are the only ones to have received revelation from God?',
      'What would Satan think about this community?',
      'What do they teach their children about marriage?',
      'What is the Culture Center?',
      'What is the prophetic trajectory of this community?',
      "What is the culture of God's House?",
      'Why does this community seem so exclusive?',
    ],
  },
]

const ALL_PROMPTS = PROMPT_CATEGORIES.flatMap((c) => c.prompts)

/* ─── App ───────────────────────────────────────────────────────── */

export default function App() {
  const [model, setModel]           = useState('claude-opus-4-6')
  const [input, setInput]           = useState('')
  const [showAllPrompts, setShowAllPrompts] = useState(false)
  const getModel                    = useCallback(() => model, [model])
  const handler                     = useKingdomAgeChat(getModel)
  const bottomRef                   = useRef<HTMLDivElement>(null)
  const lastMsgRef                  = useRef<HTMLDivElement>(null)
  const scrollContainerRef          = useRef<HTMLDivElement>(null)
  const textareaRef                 = useRef<HTMLTextAreaElement>(null)
  const userScrolledRef             = useRef(false)
  const busy                        = handler.status === 'submitted' || handler.status === 'streaming'

  /* pick 6 random prompts once on mount */
  const featuredPrompts = useMemo(() => {
    const shuffled = [...ALL_PROMPTS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 6)
  }, [])

  /* detect user scrolling away from bottom during streaming */
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      userScrolledRef.current = !nearBottom
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  /* reset userScrolled when a new message starts */
  useEffect(() => {
    userScrolledRef.current = false
  }, [handler.messages.length])

  /* auto-scroll: new message added → smooth scroll to start of reply or bottom */
  useEffect(() => {
    const last = handler.messages[handler.messages.length - 1]
    if (last?.role === 'assistant') {
      lastMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [handler.messages.length])

  /* auto-scroll: follow streaming output — stop if user scrolled up */
  useEffect(() => {
    if (handler.status === 'streaming' && !userScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [handler.messages, handler.status])

  /* auto-grow textarea */
  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const submit = () => {
    const text = input.trim()
    if (!text || busy) return
    handler.sendMessage(makeUserMessage(text))
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const submitPrompt = (text: string) => {
    if (busy) return
    handler.sendMessage(makeUserMessage(text))
    setShowAllPrompts(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="flex flex-col h-dvh w-full">

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
        <h1 className="ka-subheader-title">
          Kingdom Age <span className="text-[#8b0000]">Chat</span>
        </h1>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto py-5 px-4 flex flex-col gap-5">

        {handler.messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-10 gap-4 px-4">
            <h2 className="ka-welcome-heading">Ask Anything</h2>
            <p className="text-sm text-[#aaa]">Answers sourced from Kingdom Age teachings</p>

            {/* ── Suggested prompts ── */}
            <div className="flex flex-wrap justify-center gap-2 mt-2 max-w-lg">
              {featuredPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => submitPrompt(p)}
                  className="text-xs text-[#555] bg-[#f7f7f7] border border-[#e0e0e0] rounded-full px-3 py-1.5 hover:border-[#8b0000] hover:text-[#8b0000] transition-colors text-left"
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAllPrompts(true)}
              className="text-xs text-[#aaa] hover:text-[#8b0000] transition-colors mt-1"
            >
              See all suggested prompts →
            </button>
          </div>
        )}

        {handler.messages.map((msg, i) => (
          <div key={msg.id}
            ref={i === handler.messages.length - 1 ? lastMsgRef : null}
            className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className={`ka-label ${msg.role === 'user' ? 'text-[#c0392b]' : 'text-[#888]'}`}>
              {msg.role === 'user' ? 'You' : 'Kingdom Age'}
            </div>
            <div className={msg.role === 'user' ? 'ka-bubble-user' : 'ka-bubble-assistant'}>
              {msg.role === 'assistant' && (
                <button
                  className="ka-copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(getText(msg))
                    const btn = document.getElementById('copy-' + msg.id)
                    if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '⧉' }, 1500) }
                  }}
                  id={'copy-' + msg.id}
                  title="Copy to clipboard"
                >⧉</button>
              )}
              {msg.role === 'assistant'
                ? <div className="ka-markdown"><ReactMarkdown>{getText(msg)}</ReactMarkdown></div>
                : getText(msg)
              }
            </div>
            {msg.role === 'assistant' && (() => {
              const sources = getSources(msg)
              if (!sources.length) return null
              return (
                <details className="self-start" style={{ marginLeft: '4px' }}>
                  <summary style={{ fontSize: '0.6rem', color: '#8b0000', cursor: 'pointer', listStyle: 'none', userSelect: 'none' }}>
                    {sources.length} source{sources.length !== 1 ? 's' : ''} ›
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                    {sources.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '0.6rem', color: '#aaa', textDecoration: 'none', display: 'block', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#8b0000')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
                      >{s.title}</a>
                    ))}
                  </div>
                </details>
              )
            })()}
          </div>
        ))}

        {handler.status === 'submitted' && (
          <div className="flex flex-col gap-1.5 items-start">
            <div className="ka-label text-[#888]">Kingdom Age</div>
            <div className="text-sm text-[#aaa] italic">Searching…</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-3 bg-white border-t border-[#e8e8e8]">
        <div className="ka-input-card">
          <div className="flex items-start gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={handleInput}
              onKeyDown={onKeyDown}
              placeholder="Ask a question…"
              className="ka-input-field"
              disabled={busy}
            />
            <button onClick={submit} disabled={busy || !input.trim()} className="ka-send-btn">
              Send
            </button>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center flex-shrink-0 px-4 pb-3 pt-1 bg-white gap-3">
        <div className="flex-1" />
        <button
          onClick={() => setShowAllPrompts(true)}
          className="text-[0.7rem] text-[#aaa] hover:text-[#8b0000] transition-colors whitespace-nowrap"
        >
          Suggested Prompts
        </button>
        <div className="flex flex-1 items-center justify-end gap-3">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="ka-model-select">
            {MODELS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="text-[0.6rem] text-[#ccc] pr-2">{VERSION}</span>
        </div>
      </div>

      {/* ── All prompts modal ── */}
      {showAllPrompts && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setShowAllPrompts(false)}
        >
          <div
            className="bg-white w-full sm:max-w-lg max-h-[80vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* modal header */}
            <div className="relative flex items-center justify-center px-5 py-4 bg-[#8b0000]">
              <h2 className="text-sm text-white">Suggested Prompts</h2>
              <button
                onClick={() => setShowAllPrompts(false)}
                className="absolute right-4 text-white/70 hover:text-white text-lg leading-none"
              >×</button>
            </div>

            {/* modal body */}
            <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {PROMPT_CATEGORIES.map((cat) => (
                <div key={cat.name}>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[#aaa] mb-2">{cat.name}</p>
                  <div className="flex flex-col gap-1">
                    {cat.prompts.map((p) => (
                      <button
                        key={p}
                        onClick={() => submitPrompt(p)}
                        className="text-left text-sm text-[#444] hover:text-[#8b0000] py-1.5 border-b border-[#f0f0f0] last:border-0 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
