// AI chat session store — persisted in localStorage so refresh keeps history.
import { useCallback, useEffect, useState } from 'react'

import type { ChatMessage } from './useAiChat'

const SESSIONS_KEY = 'bbh_ai_sessions'
const CURRENT_KEY = 'bbh_ai_current'

export interface PinnedPatient {
  id: number
  hn: string | null
  display_name: string
}

export interface AiSession {
  id: string
  title: string
  convId: string
  messages: ChatMessage[]
  pinnedPatient: PinnedPatient | null
  createdAt: number
  updatedAt: number
}

interface RawSession extends Omit<AiSession, 'messages'> {
  messages: Array<Omit<ChatMessage, 'ts'> & { ts: string }>
}

function loadSessions(): AiSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RawSession[]
    return parsed.map((s) => ({
      ...s,
      pinnedPatient: s.pinnedPatient ?? null,  // backfill for older saved sessions
      messages: s.messages.map((m) => ({ ...m, ts: new Date(m.ts) })),
    }))
  } catch {
    return []
  }
}

function loadCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

function newSession(): AiSession {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: 'สนทนาใหม่',
    convId: '',
    messages: [],
    pinnedPatient: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function useAiSessions() {
  const [sessions, setSessions] = useState<AiSession[]>(loadSessions)
  const [currentId, setCurrentId] = useState<string | null>(loadCurrentId)

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
    } catch {
      // storage full or disabled — ignore
    }
  }, [sessions])

  useEffect(() => {
    try {
      if (currentId) localStorage.setItem(CURRENT_KEY, currentId)
      else localStorage.removeItem(CURRENT_KEY)
    } catch {
      // ignore
    }
  }, [currentId])

  const current = sessions.find((s) => s.id === currentId) ?? null

  const createNew = useCallback((): string => {
    const s = newSession()
    setSessions((prev) => [s, ...prev])
    setCurrentId(s.id)
    return s.id
  }, [])

  const switchTo = useCallback((id: string) => {
    setCurrentId(id)
  }, [])

  const remove = useCallback((id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (id === currentId) {
        setCurrentId(next[0]?.id ?? null)
      }
      return next
    })
  }, [currentId])

  // Patch a specific session by id — safer than "current" because the active
  // session may switch mid-network-call.
  const patchById = useCallback(
    (id: string, patcher: (s: AiSession) => Partial<AiSession>) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patcher(s), updatedAt: Date.now() } : s)),
      )
    },
    [],
  )

  // Ensure a session exists; returns its id. Used by useAiChat before send.
  const ensureCurrent = useCallback((): string => {
    if (currentId) return currentId
    return createNew()
  }, [currentId, createNew])

  return {
    sessions,
    current,
    currentId,
    createNew,
    switchTo,
    remove,
    patchById,
    ensureCurrent,
  }
}
