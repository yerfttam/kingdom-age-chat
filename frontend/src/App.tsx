import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react'
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

const VERSION = 'v2.2.0'

/* ─── App ───────────────────────────────────────────────────────── */

export default function App() {
  const [model, setModel]   = useState('claude-sonnet-4-6')
  const [input, setInput]   = useState('')
  const getModel            = useCallback(() => model, [model])
  const handler             = useKingdomAgeChat(getModel)
  const bottomRef           = useRef<HTMLDivElement>(null)
  const lastMsgRef          = useRef<HTMLDivElement>(null)
  const textareaRef         = useRef<HTMLTextAreaElement>(null)
  const busy                = handler.status === 'submitted' || handler.status === 'streaming'

  /* auto-scroll: user message → scroll to bottom; assistant reply → scroll to top of reply */
  useEffect(() => {
    const last = handler.messages[handler.messages.length - 1]
    if (last?.role === 'assistant') {
      lastMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [handler.messages])

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

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="flex flex-col h-dvh w-full">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-center flex-shrink-0 py-2 px-6 bg-[#8b0000]">
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
          Kingdom Age Video Transcript <span className="text-[#8b0000]">Chat</span>
        </h1>
      </div>

      {/* ── Messages ── */}
      {/* Note: padding is on each row (not the scroll container) to avoid the
          overflow-y clipping bug where right padding disappears on iOS/Safari */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-5 flex flex-col gap-5">

        {handler.messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 gap-2 px-4">
            <h2 className="ka-welcome-heading">Ask Anything</h2>
            <p className="text-sm text-[#aaa]">Answers sourced from Kingdom Age video transcripts</p>
          </div>
        )}

        {handler.messages.map((msg, i) => (
          <div key={msg.id}
            ref={i === handler.messages.length - 1 ? lastMsgRef : null}
            className={`flex flex-col gap-1.5 px-4 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className={`ka-label ${msg.role === 'user' ? 'text-[#c0392b]' : 'text-[#888]'}`}>
              {msg.role === 'user' ? 'You' : 'Kingdom Age'}
            </div>
            <div className={msg.role === 'user' ? 'ka-bubble-user' : 'ka-bubble-assistant'}>
              {msg.role === 'assistant'
                ? <div className="ka-markdown"><ReactMarkdown>{getText(msg)}</ReactMarkdown></div>
                : getText(msg)
              }
            </div>
          </div>
        ))}

        {handler.status === 'submitted' && (
          <div className="flex flex-col gap-1.5 items-start px-4">
            <div className="ka-label text-[#888]">Kingdom Age</div>
            <div className="text-sm text-[#aaa] italic">Searching videos…</div>
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
      <div className="flex items-center justify-end flex-shrink-0 px-4 pb-3 pt-1 bg-white gap-3">
        <select value={model} onChange={(e) => setModel(e.target.value)} className="ka-model-select">
          {MODELS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="text-[0.6rem] text-[#ccc]">{VERSION}</span>
      </div>

    </div>
  )
}
