import { useCallback, useRef, useState } from 'react'

import { api, ApiError } from '../lib/api'

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

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const convIdRef = useRef<string>('')

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text.trim(),
      ts: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    setError(null)

    try {
      const res = await api.post<ChatResponse>('/api/ai/chat', {
        message: text.trim(),
        conversation_id: convIdRef.current,
      })
      convIdRef.current = res.conversation_id
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: res.answer, ts: new Date() },
      ])
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading])

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
    convIdRef.current = ''
  }, [])

  return { messages, isLoading, error, send, reset }
}
