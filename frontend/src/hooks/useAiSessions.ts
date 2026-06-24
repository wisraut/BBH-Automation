// Thin React adapter over the module-level aiStore singleton.
// State lives outside React so in-flight chat streams survive route changes.
import { useSyncExternalStore } from 'react'

import { aiActions, getSnapshot, subscribe } from '../lib/aiStore'

export type { AiSession, ChatMessage, PinnedPatient } from '../lib/aiStore'

export function useAiSessions() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const current = snap.sessions.find((s) => s.id === snap.currentId) ?? null

  return {
    sessions:      snap.sessions,
    current,
    currentId:     snap.currentId,
    createNew:     aiActions.createNew,
    switchTo:      aiActions.switchTo,
    remove:        aiActions.remove,
    patchById:     aiActions.patchById,
    ensureCurrent: aiActions.ensureCurrent,
  }
}
