// AI chat — streams tokens from /api/ai/chat/stream, persists into active session.
import { useCallback, useState } from 'react'

import { getToken } from '../lib/api'
import { useAiSessions } from './useAiSessions'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  ts: Date
}

function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
}

export function useAiChat() {
  const store = useAiSessions()
  const {
    sessions, current, currentId, createNew, switchTo, remove,
    patchById, ensureCurrent,
  } = store
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messages = current?.messages ?? []

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean || isLoading) return

      const sid = ensureCurrent()
      const session = sessions.find((s) => s.id === sid)
      const convId = session?.convId ?? ''
      const pinnedPatientId = session?.pinnedPatient?.id ?? null

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: clean,
        ts: new Date(),
      }
      const assistantId = crypto.randomUUID()

      // Only append the user message now. The assistant bubble appears when the
      // first token arrives so we never show an empty grey bubble.
      patchById(sid, (s) => ({
        messages: [...s.messages, userMsg],
        title:
          s.messages.length === 0 || s.title === 'สนทนาใหม่'
            ? deriveTitle(clean)
            : s.title,
      }))

      setIsLoading(true)
      setError(null)

      const token = getToken()
      let buffer = ''
      let convFromStream = ''
      let assistantCreated = false

      try {
        const res = await fetch(`${API_BASE}/api/ai/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: clean,
            conversation_id: convId,
            patient_id: pinnedPatientId,
          }),
        })
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`)
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let chunkBuffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunkBuffer += decoder.decode(value, { stream: true })
          // SSE messages separated by double newline
          const blocks = chunkBuffer.split('\n\n')
          chunkBuffer = blocks.pop() ?? ''
          for (const block of blocks) {
            const line = block.split('\n').find((l) => l.startsWith('data:'))
            if (!line) continue
            const raw = line.slice(5).trim()
            if (!raw) continue
            try {
              const payload = JSON.parse(raw) as
                | { type: 'delta'; text: string }
                | { type: 'conv_id'; value: string }
                | { type: 'done' }
                | { type: 'error'; message: string }
              if (payload.type === 'delta') {
                if (!payload.text) continue
                buffer += payload.text
                if (!assistantCreated) {
                  assistantCreated = true
                  patchById(sid, (s) => ({
                    messages: [
                      ...s.messages,
                      { id: assistantId, role: 'assistant', text: buffer, ts: new Date() },
                    ],
                  }))
                } else {
                  patchById(sid, (s) => ({
                    messages: s.messages.map((m) =>
                      m.id === assistantId ? { ...m, text: buffer } : m,
                    ),
                  }))
                }
              } else if (payload.type === 'conv_id') {
                convFromStream = payload.value
              } else if (payload.type === 'error') {
                throw new Error(payload.message)
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message.startsWith('HTTP')) throw parseErr
              // ignore non-JSON keep-alives
            }
          }
        }
        if (convFromStream) {
          patchById(sid, () => ({ convId: convFromStream }))
        }
        if (!assistantCreated) {
          setError('AI ไม่ตอบ — ลองใหม่')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
        setError(msg)
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, sessions, ensureCurrent, patchById],
  )

  return {
    messages,
    isLoading,
    error,
    send,
    sessions,
    current,
    currentId,
    createNew,
    switchTo,
    remove,
    patchById,
  }
}
