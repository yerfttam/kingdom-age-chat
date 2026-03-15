import { useState, useCallback } from 'react'
import type { ChatHandler, Message } from '@llamaindex/chat-ui'

type SourceItem = { title: string; url: string }

function makeId() {
  return Math.random().toString(36).slice(2)
}

function textMessage(role: Message['role'], text: string): Message {
  return { id: makeId(), role, parts: [{ type: 'text', text }] }
}

function assistantMessage(text: string, sources: SourceItem[]): Message {
  const parts: Message['parts'] = [{ type: 'text', text }]
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
  return { id: makeId(), role: 'assistant', parts }
}

export function useKingdomAgeChat(getModel: () => string): ChatHandler {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<ChatHandler['status']>('ready')

  const sendMessage = useCallback(
    async (msg: Message) => {
      const textPart = msg.parts.find((p) => p.type === 'text')
      const text = textPart && 'text' in textPart ? textPart.text : ''
      if (!text.trim()) return

      setMessages((prev) => [...prev, msg])
      setStatus('submitted')

      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text, model: getModel() }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data: { answer: string; sources: SourceItem[] } = await res.json()
        setMessages((prev) => [
          ...prev,
          assistantMessage(data.answer, data.sources ?? []),
        ])
        setStatus('ready')
      } catch {
        setMessages((prev) => [
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
