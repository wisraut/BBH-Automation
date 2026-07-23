// AI chat — streams tokens from /api/ai/chat/stream into the active session.
// Loading/error state lives in the aiStore singleton so that switching pages
// while the model is "thinking" does not cancel or lose the response.
import { useCallback, useSyncExternalStore } from 'react'

import i18n from '../i18n'
import { getToken } from '../lib/api'
import { API_BASE } from '../lib/apiBase'
import { aiActions, getSnapshot, subscribe, NEW_SESSION_TITLE } from '../lib/aiStore'
import type { BookSource } from '../lib/aiStore'
import { useAiSessions } from './useAiSessions'

export type { ChatMessage } from '../lib/aiStore'

function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
}

// The image payload sent to the backend: `data` is the full base64 (transient —
// used for vision, not stored); `thumb` is the downscaled preview the server
// persists so the conversation shows the image after reload.
export interface OutgoingImage {
  mime: string
  data: string
  thumb: string
}

// Standalone async — does NOT live in any component's closure, so unmounting
// the page does not interrupt the stream or drop store updates.
async function runStream(
  sid: string,
  clean: string,
  convId: string,
  pinnedPatientId: number | null,
  image?: OutgoingImage,
) {
  const assistantId = crypto.randomUUID()
  aiActions.setLoading(sid, true)
  aiActions.setError(sid, null)

  let buffer = ''
  let convFromStream = ''
  let assistantCreated = false
  const token = getToken()

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
        image: image ? { mime_type: image.mime, data: image.data, thumb: image.thumb || null } : null,
      }),
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let chunkBuffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunkBuffer += decoder.decode(value, { stream: true })
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
            | { type: 'book_sources'; sources: BookSource[] }
            | { type: 'conv_id'; value: string }
            | { type: 'done' }
            | { type: 'error'; message: string }
          if (payload.type === 'delta') {
            if (!payload.text) continue
            buffer += payload.text
            if (!assistantCreated) {
              assistantCreated = true
              aiActions.patchById(sid, (s) => ({
                messages: [
                  ...s.messages,
                  { id: assistantId, role: 'assistant', text: buffer, ts: new Date() },
                ],
              }))
            } else {
              aiActions.patchById(sid, (s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, text: buffer } : m,
                ),
              }))
            }
          } else if (payload.type === 'book_sources') {
            // Arrives after all deltas — the assistant message already exists.
            // Attach the textbook citations so the footnote renders (and persists
            // via the store). Guarded on assistantCreated in case of an empty answer.
            if (assistantCreated && payload.sources?.length) {
              aiActions.patchById(sid, (s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, bookSources: payload.sources } : m,
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
      aiActions.onConversationId(sid, convFromStream)
    }
    if (!assistantCreated) {
      aiActions.setError(sid, i18n.t('aiChat.noResponse'))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : i18n.t('aiChat.genericError')
    aiActions.setError(sid, msg)
  } finally {
    aiActions.setLoading(sid, false)
  }
}

export function useAiChat() {
  const store = useAiSessions()
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const messages = store.current?.messages ?? []
  const sid = store.currentId
  const isLoading = sid ? !!snap.pendingById[sid] : false
  const error     = sid ? (snap.errorById[sid] ?? null) : null

  const send = useCallback(async (
    text: string,
    image?: { mime: string; data: string; thumb: string },
  ) => {
    const clean = text.trim()
    if (!clean && !image) return

    const targetSid = aiActions.ensureCurrent()
    const fresh = getSnapshot()
    if (fresh.pendingById[targetSid]) return  // already streaming for this session

    const session = fresh.sessions.find((s) => s.id === targetSid)
    const convId = session?.convId ?? ''
    const pinnedPatientId = session?.pinnedPatient?.id ?? null

    aiActions.patchById(targetSid, (s) => ({
      messages: [
        ...s.messages,
        // Only the small thumbnail is stored on the message; the full image
        // rides the request below and is dropped after send.
        { id: crypto.randomUUID(), role: 'user', text: clean, ts: new Date(), imageThumb: image?.thumb },
      ],
      // Keep the language-neutral sentinel for image-only turns (no text to
      // derive a title from) so the sessions list still shows "new chat".
      title:
        (s.messages.length === 0 || s.title === NEW_SESSION_TITLE) && clean
          ? deriveTitle(clean)
          : s.title,
    }))

    // Fire-and-forget — runStream uses the store, not React state, so this
    // continues even if the component that called send() unmounts.
    void runStream(targetSid, clean, convId, pinnedPatientId, image ? { mime: image.mime, data: image.data, thumb: image.thumb } : undefined)
  }, [])

  return {
    messages,
    isLoading,
    error,
    send,
    sessions:  store.sessions,
    current:   store.current,
    currentId: store.currentId,
    ready:     store.ready,
    createNew: store.createNew,
    switchTo:  store.switchTo,
    remove:    store.remove,
    patchById: store.patchById,
    setPinned: store.setPinned,
  }
}
