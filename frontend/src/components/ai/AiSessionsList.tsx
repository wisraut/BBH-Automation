import { MessageSquare, Plus, Trash2 } from 'lucide-react'

import type { AiSession } from '../../hooks/useAiSessions'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

interface AiSessionsListProps {
  sessions: AiSession[]
  currentId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'เมื่อกี้'
  if (min < 60) return `${min} นาที`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชม.`
  const day = Math.floor(hr / 24)
  return `${day} วัน`
}

export function AiSessionsList({
  sessions,
  currentId,
  onSelect,
  onNew,
  onDelete,
}: AiSessionsListProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-bbh-line bg-white">
      <div className="shrink-0 border-b border-bbh-line px-4 py-4">
        <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
          ประวัติสนทนา
        </p>
        <button
          type="button"
          onClick={onNew}
          className={`flex w-full items-center justify-center gap-2 rounded-lg bg-bbh-green px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
        >
          <Plus size={16} />
          สนทนาใหม่
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-bbh-muted">
            ยังไม่มีประวัติสนทนา
          </p>
        ) : (
          <ul className="divide-y divide-bbh-line">
            {sessions.map((s) => {
              const active = s.id === currentId
              return (
                <li key={s.id}>
                  <div
                    className={`group relative flex items-stretch transition-colors duration-200 ${
                      active ? 'bg-bbh-green-soft/60' : 'bg-white hover:bg-bbh-surface'
                    }`}
                  >
                    {/* selected lead rail — green reserved for the active session */}
                    {active ? (
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-bbh-green" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className={`flex min-w-0 flex-1 items-start gap-2 px-4 py-3 text-left text-sm ${FOCUS_RING}`}
                    >
                      <MessageSquare
                        size={14}
                        className={`mt-0.5 shrink-0 ${active ? 'text-bbh-green-dark' : 'text-bbh-muted'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-medium ${active ? 'text-bbh-green-dark' : 'text-bbh-ink'}`}>
                          {s.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-bbh-muted">
                          {formatRelative(s.updatedAt)} · {s.messages.length} ข้อความ
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`ลบสนทนา "${s.title}"?`)) onDelete(s.id)
                      }}
                      className={`mr-2 my-2 shrink-0 rounded-md p-1.5 text-bbh-muted opacity-0 transition-colors duration-200 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 ${FOCUS_RING}`}
                      aria-label="ลบสนทนา"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
