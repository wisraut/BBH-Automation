// AI sessions store — singleton outside React lifecycle.
//
// Previously useAiSessions held state via useState in the AiAssistant page.
// When the user navigated away mid-fetch, the component unmounted and the
// in-flight stream's patchById calls became no-ops, so the assistant reply
// was lost. Moving state to module scope means the stream keeps updating
// localStorage even while no React component is mounted, and the next mount
// of /ai reads the up-to-date state via useSyncExternalStore.

const SESSIONS_KEY = 'bbh_ai_sessions'
const CURRENT_KEY  = 'bbh_ai_current'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  ts: Date
}

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

export interface AiStoreSnapshot {
  sessions: AiSession[]
  currentId: string | null
  pendingById: Record<string, true>     // session id -> "request in-flight"
  errorById:   Record<string, string>   // session id -> last error message
}

function loadSessions(): AiSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RawSession[]
    return parsed.map((s) => ({
      ...s,
      pinnedPatient: s.pinnedPatient ?? null,
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

function persistSessions(sessions: AiSession[]) {
  try {
    const ser = sessions.map((s) => ({
      ...s,
      messages: s.messages.map((m) => ({ ...m, ts: m.ts.toISOString() })),
    }))
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(ser))
  } catch {
    // ignore — storage full / disabled
  }
}

function persistCurrent(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id)
    else localStorage.removeItem(CURRENT_KEY)
  } catch {
    // ignore
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

let snapshot: AiStoreSnapshot = {
  sessions:   loadSessions(),
  currentId:  loadCurrentId(),
  pendingById: {},
  errorById:   {},
}

const listeners = new Set<() => void>()
function emit() { listeners.forEach((l) => l()) }

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function getSnapshot(): AiStoreSnapshot {
  return snapshot
}

function update(patch: Partial<AiStoreSnapshot>) {
  snapshot = { ...snapshot, ...patch }
}

export const aiActions = {
  patchById(id: string, patcher: (s: AiSession) => Partial<AiSession>) {
    const sessions = snapshot.sessions.map((s) =>
      s.id === id ? { ...s, ...patcher(s), updatedAt: Date.now() } : s,
    )
    update({ sessions })
    persistSessions(sessions)
    emit()
  },

  createNew(): string {
    const s = newSession()
    const sessions = [s, ...snapshot.sessions]
    update({ sessions, currentId: s.id })
    persistSessions(sessions)
    persistCurrent(s.id)
    emit()
    return s.id
  },

  switchTo(id: string) {
    update({ currentId: id })
    persistCurrent(id)
    emit()
  },

  remove(id: string) {
    const sessions = snapshot.sessions.filter((s) => s.id !== id)
    const currentId = snapshot.currentId === id ? (sessions[0]?.id ?? null) : snapshot.currentId
    update({ sessions, currentId })
    persistSessions(sessions)
    persistCurrent(currentId)
    emit()
  },

  ensureCurrent(): string {
    if (snapshot.currentId) return snapshot.currentId
    return aiActions.createNew()
  },

  setLoading(id: string, loading: boolean) {
    const pendingById = { ...snapshot.pendingById }
    if (loading) pendingById[id] = true
    else delete pendingById[id]
    update({ pendingById })
    emit()
  },

  setError(id: string, err: string | null) {
    const errorById = { ...snapshot.errorById }
    if (err) errorById[id] = err
    else delete errorById[id]
    update({ errorById })
    emit()
  },
}
