import { useState, useCallback, useRef } from 'react'
import type { ChatHandler, Message } from '@llamaindex/chat-ui'

type SourceItem = { title: string; url: string }

function makeId() {
  return Math.random().toString(36).slice(2)
}

function textMessage(role: Message['role'], text: string): Message {
  return { id: makeId(), role, parts: [{ type: 'text', text }] }
}

function getText(msg: Message): string {
  const part = msg.parts.find((p) => p.type === 'text')
  return part && 'text' in part ? part.text : ''
}

// Stable session ID for this browser session
const SESSION_ID = Math.random().toString(36).slice(2)

export function useKingdomAgeChat(getModel: () => string): ChatHandler {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<ChatHandler['status']>('ready')
  const messagesRef = useRef<Message[]>(messages)

  // Keep ref in sync so sendMessage always sees current messages without
  // needing to be recreated on every state update
  const syncedSetMessages: typeof setMessages = (updater) => {
    setMessages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      messagesRef.current = next
      return next
    })
  }

  const sendMessage = useCallback(
    async (msg: Message) => {
      const textPart = msg.parts.find((p) => p.type === 'text')
      const text = textPart && 'text' in textPart ? textPart.text : ''
      if (!text.trim()) return

      // Snapshot history BEFORE adding the new user message
      const history = messagesRef.current.map((m) => ({
        role: m.role as string,
        content: getText(m),
      }))

      syncedSetMessages((prev) => [...prev, msg])
      setStatus('submitted')

      try {
        const res = await fetch('/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text, model: getModel(), history, session_id: SESSION_ID }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (!res.body) throw new Error('No response body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let streamingText = ''
        const streamingId = makeId()

        syncedSetMessages((prev) => [
          ...prev,
          { id: streamingId, role: 'assistant', parts: [{ type: 'text', text: '' }] },
        ])
        setStatus('streaming')

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            let event: { type: string; delta?: string; sources?: SourceItem[] }
            try { event = JSON.parse(line.slice(6)) } catch { continue }

            if (event.type === 'text' && event.delta) {
              streamingText += event.delta
              const captured = streamingText
              syncedSetMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, parts: [{ type: 'text', text: captured }] }
                    : m
                )
              )
            } else if (event.type === 'sources' && event.sources) {
              const sources = event.sources
              syncedSetMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== streamingId) return m
                  const parts: Message['parts'] = [{ type: 'text', text: streamingText }]
                  if (sources.length > 0) {
                    parts.push({
                      type: 'data-sources',
                      data: {
                        nodes: sources.map((s) => ({
                          url: s.url,
                          metadata: { file_name: s.title, url: s.url },
                          score: undefined,
                        })),
                      },
                    } as any)
                  }
                  return { ...m, parts }
                })
              )
            }
          }
        }

        setStatus('ready')
      } catch {
        syncedSetMessages((prev) => [
          ...prev,
          textMessage('assistant', 'Something went wrong. Please try again.'),
        ])
        setStatus('error')
      }
    },
    [getModel],
  )

  return { messages, status, sendMessage, setMessages }
}
