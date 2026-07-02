import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Bot, Clock, Loader2, MessageCircle, Send, Sparkles, User, UserRoundCog, X,
} from 'lucide-react'

import {
  usePatientAiMode, useSetPatientAiMode,
  type AiMode, type Banner,
} from '../../hooks/usePatientAiMode'
import { usePatientMessages } from '../../hooks/usePatientMessages'
import { useSendPatientMessage } from '../../hooks/useSendPatientMessage'
import { useToast } from '../../hooks/useToast'

interface Props {
  open: boolean
  patientId: number | null
  patientName?: string | null
  onClose: () => void
}

const MODES: { key: AiMode; label: string; hint: string }[] = [
  { key: 'auto', label: 'Auto', hint: 'AI ตอบเอง' },
  { key: 'copilot', label: 'Copilot', hint: 'AI ร่างให้ CRO ยืนยัน' },
  { key: 'silent', label: 'Silent', hint: 'CRO ตอบเองทั้งหมด' },
]

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function BannerStrip({ banner, pauseUntil }: { banner: Banner; pauseUntil: string | null }) {
  const map: Record<Banner, { bg: string; ink: string; icon: React.ReactNode; text: string }> = {
    auto: {
      bg: 'bg-emerald-50 border-emerald-200', ink: 'text-emerald-800',
      icon: <Bot size={14} />, text: 'AI ทำงาน · ตอบคนไข้อัตโนมัติ',
    },
    copilot: {
      bg: 'bg-sky-50 border-sky-200', ink: 'text-sky-800',
      icon: <Sparkles size={14} />, text: 'Copilot · AI ร่าง รอ CRO ยืนยัน',
    },
    silent: {
      bg: 'bg-orange-50 border-orange-200', ink: 'text-orange-800',
      icon: <UserRoundCog size={14} />, text: 'Silent · CRO ตอบเอง AI ไม่ตอบ',
    },
    paused: {
      bg: 'bg-amber-50 border-amber-200', ink: 'text-amber-800',
      icon: <Clock size={14} />,
      text: `AI หยุดชั่วคราวจนถึง ${pauseUntil ? formatTime(pauseUntil) : '--:--'} · CRO ดูแล`,
    },
    after_hours: {
      bg: 'bg-slate-100 border-slate-300', ink: 'text-slate-700',
      icon: <Clock size={14} />, text: 'นอกเวลาทำการ · AI ตอบทับสวิตช์ทุกโหมด',
    },
    keyword_handoff: {
      bg: 'bg-rose-50 border-rose-200', ink: 'text-rose-800',
      icon: <AlertTriangle size={14} />, text: 'ระบบจับคำ "อยากคุยกับคน" · handoff ให้ CRO',
    },
  }
  const s = map[banner] ?? map.auto
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${s.bg} ${s.ink}`}>
      {s.icon}
      <span>{s.text}</span>
    </div>
  )
}

function MessageBubble({ direction, text, at, prefix }: {
  direction: 'in' | 'out' | 'system'
  text: string | null
  at: string | null
  prefix: string | null
}) {
  if (direction === 'system') {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] rounded-full bg-bbh-surface px-3 py-1 text-[11px] text-bbh-muted">
          {text}
        </div>
      </div>
    )
  }
  const isOut = direction === 'out'
  const isCroReply = prefix === 'CRO_MANUAL'
  const isCopilotDraft = prefix?.startsWith('COPILOT_DRAFT') ?? false
  const align = isOut ? 'justify-end' : 'justify-start'
  const bubbleColor = !isOut
    ? 'bg-white border border-bbh-line text-bbh-ink'
    : isCroReply
      ? 'bg-bbh-green text-white'
      : isCopilotDraft
        ? 'bg-sky-100 border border-sky-300 text-sky-900'
        : 'bg-bbh-green-soft text-bbh-ink'
  const author = !isOut
    ? { icon: <User size={12} />, name: 'คนไข้' }
    : isCroReply
      ? { icon: <UserRoundCog size={12} />, name: 'CRO' }
      : isCopilotDraft
        ? { icon: <Sparkles size={12} />, name: 'AI (ร่าง)' }
        : { icon: <Bot size={12} />, name: 'AI' }
  return (
    <div className={`flex ${align}`}>
      <div className="flex max-w-[78%] flex-col gap-1">
        <div className={`flex items-center gap-1 text-[10px] text-bbh-muted ${isOut ? 'justify-end' : 'justify-start'}`}>
          {author.icon}
          <span>{author.name}</span>
          {prefix && !isCroReply && !isCopilotDraft ? <span className="rounded bg-bbh-surface px-1 text-[9px]">{prefix}</span> : null}
        </div>
        <div className={`rounded-2xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap ${bubbleColor}`}>
          {text || ''}
        </div>
        <div className={`text-[10px] text-bbh-muted ${isOut ? 'text-right' : 'text-left'}`}>
          {formatTime(at)}
        </div>
      </div>
    </div>
  )
}

export function PatientChatDrawer({ open, patientId, patientName, onClose }: Props) {
  const toast = useToast()
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const msgQ = usePatientMessages(open ? patientId : null)
  const modeQ = usePatientAiMode(open ? patientId : null)
  const sendM = useSendPatientMessage()
  const setModeM = useSetPatientAiMode()

  const messages = useMemo(() => msgQ.data?.data ?? [], [msgQ.data])
  const mode = modeQ.data

  useEffect(() => {
    if (open) setText('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  if (!open || patientId == null) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    sendM.mutate(
      { patientId, message: text.trim() },
      {
        onSuccess: () => setText(''),
        onError: () => toast.show('error', 'ส่งไม่สำเร็จ — คนไข้อาจไม่มี LINE'),
      },
    )
  }

  const changeMode = (m: AiMode) => {
    if (!mode || mode.ai_mode === m) return
    setModeM.mutate(
      { patientId, mode: m },
      {
        onSuccess: () => toast.show('success', `ตั้ง AI mode = ${m}`),
        onError: () => toast.show('error', 'เปลี่ยน mode ไม่สำเร็จ'),
      },
    )
  }

  const groupedByDay: { day: string; items: typeof messages }[] = []
  messages.forEach((m) => {
    const day = formatDay(m.at)
    const last = groupedByDay[groupedByDay.length - 1]
    if (last && last.day === day) last.items.push(m)
    else groupedByDay.push({ day, items: [m] })
  })

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <header className="border-b border-bbh-line px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-bbh-muted">
                <MessageCircle size={14} className="text-bbh-green" />
                <span>Chat กับคนไข้ (LINE)</span>
              </div>
              <h2 className="mt-0.5 truncate font-serif text-lg font-semibold text-bbh-ink">
                {patientName ?? 'คนไข้'}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-bbh-muted hover:bg-bbh-surface">
              <X size={18} />
            </button>
          </div>
          {mode && mode.has_line_session ? (
            <div className="mt-3 space-y-2">
              <BannerStrip banner={mode.banner} pauseUntil={mode.pause_until} />
              <div className="inline-flex overflow-hidden rounded-lg border border-bbh-line bg-bbh-surface p-0.5">
                {MODES.map((m) => {
                  const active = mode.ai_mode === m.key
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={setModeM.isPending}
                      onClick={() => changeMode(m.key)}
                      title={m.hint}
                      className={`px-3 py-1 text-xs font-semibold transition ${
                        active ? 'bg-white text-bbh-ink shadow-sm' : 'text-bbh-muted hover:text-bbh-ink'
                      }`}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-bbh-muted">
                Sticky: <span className="font-semibold">{mode.ai_mode}</span> · Effective: <span className="font-semibold">{mode.effective_mode}</span>
              </p>
            </div>
          ) : mode && !mode.has_line_session ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
              คนไข้ยังไม่มี LINE session — เริ่มคุยได้เมื่อคนไข้ทัก LINE โรงพยาบาลก่อน
            </p>
          ) : null}
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-bbh-surface/40 p-4">
          {msgQ.isLoading ? (
            <div className="flex justify-center pt-8 text-bbh-muted">
              <Loader2 className="animate-spin" size={18} />
            </div>
          ) : messages.length === 0 ? (
            <p className="mt-8 text-center text-sm text-bbh-muted">ยังไม่มีข้อความ</p>
          ) : (
            groupedByDay.map(({ day, items }) => (
              <div key={day} className="space-y-3">
                <div className="flex justify-center">
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-bbh-muted shadow-sm">
                    {day}
                  </span>
                </div>
                {items.map((m) => (
                  <MessageBubble
                    key={m.id}
                    direction={m.direction}
                    text={m.text}
                    at={m.at}
                    prefix={m.route_prefix}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        <form onSubmit={submit} className="border-t border-bbh-line bg-white p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit(e as unknown as React.FormEvent)
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="พิมพ์ข้อความส่งไปยัง LINE คนไข้... (Shift+Enter ขึ้นบรรทัดใหม่)"
              className="flex-1 resize-none rounded-xl border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none"
            />
            <button
              type="submit"
              disabled={sendM.isPending || !text.trim() || !mode?.has_line_session}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-bbh-green px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendM.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              ส่ง
            </button>
          </div>
          <p className="mt-1 text-[11px] text-bbh-muted">
            {text.length}/2000 · การส่งจะหยุด AI ตอบอัตโนมัติ 30 นาที
          </p>
        </form>
      </aside>
    </div>
  )
}
