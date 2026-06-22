import { MessageSquare, Plus, Trash2 } from 'lucide-react'

import type { AiSession } from '../../hooks/useAiSessions'

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
      <div className="border-b border-bbh-line px-4 py-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-bbh-green px-3 py-2 text-sm font-semibold text-white transition hover:bg-bbh-green-dark"
        >
          <Plus size={16} />
          สนทนาใหม่
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-bbh-muted">
            ยังไม่มีประวัติสนทนา
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => {
              const active = s.id === currentId
              return (
                <li key={s.id}>
                  <div
                    className={`group relative flex items-start gap-2 rounded-xl px-3 py-2 text-sm transition ${
                      active
                        ? 'bg-bbh-green-soft text-bbh-green-dark'
                        : 'text-bbh-ink hover:bg-bbh-surface'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className="flex flex-1 items-start gap-2 overflow-hidden text-left"
                    >
                      <MessageSquare size={14} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.title}</p>
                        <p className="text-[11px] text-bbh-muted">
                          {formatRelative(s.updatedAt)} · {s.messages.length} ข้อความ
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`ลบสนทนา "${s.title}"?`)) onDelete(s.id)
                      }}
                      className="rounded-md p-1 text-bbh-muted opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
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
