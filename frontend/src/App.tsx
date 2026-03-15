import { useCallback, useState } from 'react'
import { ChatSection, ChatMessages, ChatInput } from '@llamaindex/chat-ui'
import { useKingdomAgeChat } from './hooks/useKingdomAgeChat'

const MODELS = [
  { group: 'Anthropic', options: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fast' },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced' },
    { value: 'claude-opus-4-6', label: 'Opus 4.6 — powerful' },
  ]},
  { group: 'OpenAI', options: [
    { value: 'gpt-4o-mini', label: 'GPT-4o mini — fast' },
    { value: 'gpt-4o', label: 'GPT-4o — balanced' },
  ]},
]

const VERSION = 'v2.0.0'

export default function App() {
  const [model, setModel] = useState('gpt-4o')
  const getModel = useCallback(() => model, [model])
  const handler = useKingdomAgeChat(getModel)
  return (
    <div className="flex flex-col h-dvh w-full max-w-3xl mx-auto">

      {/* Top bar */}
      <div
        className="flex items-center justify-center flex-shrink-0 py-2 px-6"
        style={{ background: '#8b0000' }}
      >
        <div className="relative h-[52px] w-[108px]">
          <img
            src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png"
            alt=""
            className="absolute top-0 left-0 h-[52px] w-auto"
            style={{
              filter: 'sepia(1) saturate(4) hue-rotate(5deg) brightness(1.3)',
              clipPath: 'inset(0 62% 0 0)',
            }}
          />
          <img
            src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png"
            alt="Kingdom Age"
            className="absolute top-0 left-0 h-[52px] w-auto"
            style={{
              filter: 'brightness(0) invert(1)',
              clipPath: 'inset(0 0 0 34%)',
            }}
          />
        </div>
      </div>

      {/* Sub-header */}
      <div
        className="flex items-center justify-center flex-shrink-0 py-2 px-4 border-b-2"
        style={{ background: '#fff', borderColor: '#e8e8e8' }}
      >
        <h1
          className="text-sm font-bold uppercase tracking-widest text-center"
          style={{ fontFamily: 'Barlow, Helvetica, Arial, sans-serif', color: '#1a0a0a' }}
        >
          Kingdom Age Video Transcript{' '}
          <span style={{ color: '#8b0000' }}>Chat</span>
        </h1>
      </div>

      {/* Chat section — fills remaining space */}
      <div className="flex flex-col flex-1 min-h-0">
        <ChatSection handler={handler} className="flex flex-col flex-1 min-h-0">

          {handler.messages.length === 0 ? (
            /* Welcome screen — shown before first message */
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <h2
                className="text-lg font-bold uppercase tracking-widest"
                style={{ fontFamily: 'Barlow, Helvetica, Arial, sans-serif', color: '#53585c' }}
              >
                Ask Anything
              </h2>
              <p className="text-sm" style={{ color: '#aaa' }}>
                Answers sourced from Kingdom Age video transcripts
              </p>
            </div>
          ) : (
            <ChatMessages className="flex-1 overflow-y-auto px-4 py-4" />
          )}

          <ChatInput className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-200 bg-white">
            <ChatInput.Form>
              <ChatInput.Field
                placeholder="Ask a question…"
                className="flex-1"
              />
              <ChatInput.Submit className="ka-send-btn" />
            </ChatInput.Form>
          </ChatInput>
        </ChatSection>
      </div>

      {/* Toolbar: model selector + version */}
      <div
        className="flex items-center justify-between flex-shrink-0 px-4 pb-3 pt-1 bg-white border-t border-gray-100"
      >
        <div />
        <div className="flex items-center gap-3">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-1 bg-white cursor-pointer outline-none"
            style={{ fontFamily: 'Fira Sans, Helvetica, Arial, sans-serif' }}
          >
            {MODELS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="text-[0.6rem] text-gray-300">{VERSION}</span>
        </div>
      </div>

    </div>
  )
}
