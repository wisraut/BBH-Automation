// AI chat — sends to /api/ai/chat, persists every message into the active session.
import { useCallback, useState } from 'react'

import { api, ApiError } from '../lib/api'
import { useAiSessions } from './useAiSessions'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  ts: Date
}

interface ChatResponse {
  answer: string
  conversation_id: string
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
      // Snapshot the session's convId + pinned patient at send time so a session
      // switch doesn't leak context into the wrong Dify conversation.
      const session = sessions.find((s) => s.id === sid)
      const convId = session?.convId ?? ''
      const pinnedPatientId = session?.pinnedPatient?.id ?? null

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: clean,
        ts: new Date(),
      }

      patchById(sid, (s) => ({
        messages: [...s.messages, userMsg],
        title:
          s.messages.length === 0 || s.title === 'สนทนาใหม่'
            ? deriveTitle(clean)
            : s.title,
      }))

      setIsLoading(true)
      setError(null)

      try {
        const res = await api.post<ChatResponse>('/api/ai/chat', {
          message: clean,
          conversation_id: convId,
          patient_id: pinnedPatientId,
        })
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: res.answer,
          ts: new Date(),
        }
        patchById(sid, (s) => ({
          messages: [...s.messages, assistantMsg],
          convId: res.conversation_id || s.convId,
        }))
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
        setError(msg)
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, sessions, ensureCurrent, patchById],
  )

  return {
    // chat state for the active session
    messages,
    isLoading,
    error,
    send,
    // session controls
    sessions,
    current,
    currentId,
    createNew,
    switchTo,
    remove,
    patchById,
  }
}
