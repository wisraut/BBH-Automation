// AI sessions store — singleton outside React lifecycle.
//
// Source of truth is now the SERVER (GET/DELETE/PATCH /api/ai/conversations...),
// not localStorage: chat history follows the user across devices and nothing
// sensitive lingers in the browser. State still lives at module scope so an
// in-flight chat stream survives route changes (the stream keeps updating this
// store even while no React component is mounted).
//
// A conversation is identified in the UI by a stable frontend `id` and linked to
// the backend by `convId` (its server token). A brand-new chat is a local "draft"
// (convId === '') until its first message creates the server row.
import { api } from './api'

let currentOwner: string | null = null

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  ts: Date
  // Downscaled preview of an attached image (data URL). Persisted server-side now,
  // so it survives reload / shows on other devices.
  imageThumb?: string
}

export interface PinnedPatient {
  id: number
  hn: string | null
  display_name: string
}

export interface AiSession {
  id: string          // stable frontend key (draft id, or the server token)
  title: string
  convId: string      // server token — '' for a not-yet-sent draft
  messages: ChatMessage[]
  pinnedPatient: PinnedPatient | null
  createdAt: number
  updatedAt: number
  loaded: boolean     // have this conversation's messages been fetched?
}

export interface AiStoreSnapshot {
  sessions: AiSession[]
  currentId: string | null
  pendingById: Record<string, true>     // session id -> "request in-flight"
  errorById:   Record<string, string>   // session id -> last error message
  ready: boolean                        // initial conversation list resolved?
}

// Shapes returned by the backend endpoints.
interface ApiConversation {
  id: string
  title: string
  updatedAt: string | null
  pinnedPatient: PinnedPatient | null
}
interface ApiMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  imageThumb: string | null
  ts: string | null
}

// Language-neutral sentinel for an untitled session (rendered as a localized
// "new chat" label by the UI).
export const NEW_SESSION_TITLE = ''

function toMs(iso: string | null): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? Date.now() : t
}

let snapshot: AiStoreSnapshot = {
  sessions: [],
  currentId: null,
  pendingById: {},
  errorById: {},
  ready: false,
}

const listeners = new Set<() => void>()
function emit() { listeners.forEach((l) => l()) }
function update(patch: Partial<AiStoreSnapshot>) { snapshot = { ...snapshot, ...patch } }

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
export function getSnapshot(): AiStoreSnapshot { return snapshot }

// Merge the server's conversation list with what we already hold in memory
// (unsent drafts + already-loaded messages + in-flight streams), matching by
// convId so we never drop a live session or double-list a promoted draft.
function reconcile(server: ApiConversation[], existing: AiSession[]): AiSession[] {
  const byConv = new Map(existing.filter((s) => s.convId).map((s) => [s.convId, s]))
  const drafts = existing.filter((s) => !s.convId)
  const fromServer = server.map((item) => {
    const prior = byConv.get(item.id)
    if (prior) {
      // Keep loaded messages / pending state; refresh the server-owned fields.
      return { ...prior, title: item.title, pinnedPatient: item.pinnedPatient, updatedAt: toMs(item.updatedAt) }
    }
    const ts = toMs(item.updatedAt)
    return {
      id: item.id,
      convId: item.id,
      title: item.title,
      messages: [],
      pinnedPatient: item.pinnedPatient,
      createdAt: ts,
      updatedAt: ts,
      loaded: false,
    }
  })
  return [...drafts, ...fromServer]
}

async function hydrate() {
  if (!currentOwner) return
  try {
    const data = await api.get<{ conversations: ApiConversation[] }>('/api/ai/conversations')
    const sessions = reconcile(data.conversations ?? [], snapshot.sessions)
    // Keep the current selection if it still exists after reconcile; otherwise
    // (deleted elsewhere / no longer returned) fall back to the most recent, so
    // the page never gets stuck on a dead id showing an empty state.
    const stillThere = snapshot.currentId && sessions.some((s) => s.id === snapshot.currentId)
    const currentId = stillThere ? snapshot.currentId : (sessions[0]?.id ?? null)
    update({ sessions, currentId, ready: true })
    emit()
    if (currentId) void aiActions.ensureMessages(currentId)
  } catch {
    update({ ready: true })
    emit()
  }
}

// Bind the store to the logged-in user; called by AuthProvider when auth changes.
export function setOwner(ownerKey: string | null) {
  if (ownerKey === currentOwner) return
  currentOwner = ownerKey
  snapshot = { sessions: [], currentId: null, pendingById: {}, errorById: {}, ready: !ownerKey }
  emit()
  if (ownerKey) void hydrate()
}

export const aiActions = {
  refresh() { void hydrate() },

  patchById(id: string, patcher: (s: AiSession) => Partial<AiSession>) {
    const sessions = snapshot.sessions.map((s) =>
      s.id === id ? { ...s, ...patcher(s), updatedAt: Date.now() } : s,
    )
    update({ sessions })
    emit()
  },

  createNew(): string {
    const id = `draft-${crypto.randomUUID()}`
    const now = Date.now()
    const s: AiSession = {
      id, title: NEW_SESSION_TITLE, convId: '', messages: [],
      pinnedPatient: null, createdAt: now, updatedAt: now, loaded: true,
    }
    update({ sessions: [s, ...snapshot.sessions], currentId: id })
    emit()
    return id
  },

  switchTo(id: string) {
    update({ currentId: id })
    emit()
    void aiActions.ensureMessages(id)
  },

  // Lazily fetch a conversation's messages the first time it's opened.
  async ensureMessages(id: string) {
    const s = snapshot.sessions.find((x) => x.id === id)
    if (!s || s.loaded || !s.convId) return
    try {
      const data = await api.get<{ messages: ApiMessage[] }>(`/api/ai/conversations/${s.convId}/messages`)
      aiActions.patchById(id, () => ({
        messages: data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          ts: m.ts ? new Date(m.ts) : new Date(),
          imageThumb: m.imageThumb ?? undefined,
        })),
        loaded: true,
      }))
    } catch {
      aiActions.patchById(id, () => ({ loaded: true })) // avoid a refetch loop
    }
  },

  remove(id: string) {
    // Don't delete while a stream is in flight: the backend created the
    // conversation row at stream start, and a draft's DELETE would be skipped
    // (no convId yet) — leaving an orphan row that reappears on the next hydrate.
    // The stream finishes fast; the user can delete once it's done.
    if (snapshot.pendingById[id]) return
    const target = snapshot.sessions.find((s) => s.id === id)
    const sessions = snapshot.sessions.filter((s) => s.id !== id)
    const currentId = snapshot.currentId === id ? (sessions[0]?.id ?? null) : snapshot.currentId
    update({ sessions, currentId })
    emit()
    if (target?.convId) void api.delete(`/api/ai/conversations/${target.convId}`).catch(() => {})
  },

  ensureCurrent(): string {
    if (snapshot.currentId) return snapshot.currentId
    return aiActions.createNew()
  },

  // First message of a draft just created the server conversation — link the
  // token and pull the server-derived title/order into the list (once).
  onConversationId(id: string, token: string) {
    const s = snapshot.sessions.find((x) => x.id === id)
    if (!s || s.convId) return
    aiActions.patchById(id, () => ({ convId: token, loaded: true }))
    void hydrate()
  },

  // Pin/unpin a patient; persists to the server when the conversation exists.
  setPinned(id: string, patient: PinnedPatient | null) {
    aiActions.patchById(id, () => ({ pinnedPatient: patient }))
    const s = snapshot.sessions.find((x) => x.id === id)
    if (s?.convId) {
      void api.patch(`/api/ai/conversations/${s.convId}/patient`, { patient_id: patient?.id ?? null }).catch(() => {})
    }
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
