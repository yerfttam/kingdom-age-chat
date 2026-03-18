import { useState, useRef, useCallback } from 'react'
import { API_BASE } from '../constants'

export type MessageRole = 'user' | 'assistant'

export interface Source {
  title: string
  url: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  sources?: Source[]
}

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

const SESSION_ID = Math.random().toString(36).slice(2)

function makeId() {
  return Math.random().toString(36).slice(2)
}

function parseSSEChunk(chunk: string): { type: string; delta?: string; sources?: Source[] }[] {
  const events: { type: string; delta?: string; sources?: Source[] }[] = []
  const lines = chunk.split('\n')
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    try {
      events.push(JSON.parse(line.slice(6)))
    } catch {
      // ignore malformed lines
    }
  }
  return events
}

export function useChat(getModel: () => string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const messagesRef = useRef<ChatMessage[]>([])
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const syncSet = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev)
      messagesRef.current = next
      return next
    })
  }

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return

      const history = messagesRef.current.map((m) => ({
        role: m.role,
        content: m.text,
      }))

      const userMsg: ChatMessage = { id: makeId(), role: 'user', text }
      syncSet((prev) => [...prev, userMsg])
      setStatus('submitted')

      const streamingId = makeId()
      let streamingText = ''
      let processedLength = 0

      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      xhr.open('POST', `${API_BASE}/chat/stream`, true)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.setRequestHeader('Accept', 'text/event-stream')

      xhr.onprogress = () => {
        const newChunk = xhr.responseText.slice(processedLength)
        processedLength = xhr.responseText.length

        const events = parseSSEChunk(newChunk)
        for (const event of events) {
          if (event.type === 'text' && event.delta) {
            streamingText += event.delta
            const captured = streamingText

            syncSet((prev) => {
              const exists = prev.some((m) => m.id === streamingId)
              if (!exists) {
                return [...prev, { id: streamingId, role: 'assistant', text: captured }]
              }
              return prev.map((m) =>
                m.id === streamingId ? { ...m, text: captured } : m
              )
            })
            setStatus('streaming')
          } else if (event.type === 'sources' && event.sources) {
            const sources = event.sources
            syncSet((prev) =>
              prev.map((m) =>
                m.id === streamingId ? { ...m, sources } : m
              )
            )
          }
        }
      }

      xhr.onload = () => {
        setStatus('ready')
        xhrRef.current = null
      }

      xhr.onerror = () => {
        syncSet((prev) => [
          ...prev,
          { id: makeId(), role: 'assistant', text: 'Something went wrong. Please try again.' },
        ])
        setStatus('error')
        xhrRef.current = null
      }

      xhr.send(
        JSON.stringify({
          question: text,
          model: getModel(),
          history,
          session_id: SESSION_ID,
        })
      )
    },
    [getModel]
  )

  const clearMessages = useCallback(() => {
    xhrRef.current?.abort()
    setMessages([])
    messagesRef.current = []
    setStatus('ready')
  }, [])

  return { messages, status, sendMessage, clearMessages }
}
