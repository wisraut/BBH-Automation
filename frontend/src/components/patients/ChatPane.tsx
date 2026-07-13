import { useEffect, useMemo, useRef, useState } from 'react'
import { dateLocale } from '../../i18n/datetime'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, Bot, Clock, Loader2, Send, Sparkles, User, UserRoundCog,
} from 'lucide-react'

import {
  usePatientAiMode, useSetPatientAiMode,
  type AiMode, type Banner,
} from '../../hooks/usePatientAiMode'
import { usePatientMessages } from '../../hooks/usePatientMessages'
import { useSendPatientMessage } from '../../hooks/useSendPatientMessage'
import { useToast } from '../../hooks/useToast'

interface Props {
  patientId: number | null
  patientName?: string | null
  showHeader?: boolean
}

const MODE_KEYS: AiMode[] = ['auto', 'copilot', 'silent']

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

function BannerStrip({ banner, pauseUntil }: { banner: Banner; pauseUntil: string | null }) {
  const { t } = useTranslation()
  const map: Record<Banner, { bg: string; ink: string; icon: React.ReactNode; text: string }> = {
    auto: {
      bg: 'bg-emerald-50 border-emerald-200', ink: 'text-emerald-800',
      icon: <Bot size={14} />, text: t('chatPane.banner.auto'),
    },
    copilot: {
      bg: 'bg-sky-50 border-sky-200', ink: 'text-sky-800',
      icon: <Sparkles size={14} />, text: t('chatPane.banner.copilot'),
    },
    silent: {
      bg: 'bg-orange-50 border-orange-200', ink: 'text-orange-800',
      icon: <UserRoundCog size={14} />, text: t('chatPane.banner.silent'),
    },
    paused: {
      bg: 'bg-amber-50 border-amber-200', ink: 'text-amber-800',
      icon: <Clock size={14} />,
      text: t('chatPane.banner.paused', { time: pauseUntil ? formatTime(pauseUntil) : '--:--' }),
    },
    after_hours: {
      bg: 'bg-slate-100 border-slate-300', ink: 'text-slate-700',
      icon: <Clock size={14} />, text: t('chatPane.banner.afterHours'),
    },
    keyword_handoff: {
      bg: 'bg-rose-50 border-rose-200', ink: 'text-rose-800',
      icon: <AlertTriangle size={14} />, text: t('chatPane.banner.keywordHandoff'),
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
  const { t } = useTranslation()
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
    ? { icon: <User size={12} />, name: t('chatPane.author.patient') }
    : isCroReply
      ? { icon: <UserRoundCog size={12} />, name: t('roleShort.cro') }
      : isCopilotDraft
        ? { icon: <Sparkles size={12} />, name: t('chatPane.author.aiDraft') }
        : { icon: <Bot size={12} />, name: t('chatPane.author.ai') }
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

export function ChatPane({ patientId, patientName, showHeader = true }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const msgQ = usePatientMessages(patientId)
  const modeQ = usePatientAiMode(patientId)
  const sendM = useSendPatientMessage()
  const setModeM = useSetPatientAiMode()

  const messages = useMemo(() => msgQ.data?.data ?? [], [msgQ.data])
  const mode = modeQ.data

  useEffect(() => { setText('') }, [patientId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  if (patientId == null) {
    return (
      <div className="flex h-full items-center justify-center bg-bbh-surface/40 text-sm text-bbh-muted">
        {t('chatPane.selectPatientToChat')}
      </div>
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    sendM.mutate(
      { patientId, message: text.trim() },
      {
        onSuccess: () => setText(''),
        onError: () => toast.show('error', t('chatPane.sendFailed')),
      },
    )
  }

  const changeMode = (m: AiMode) => {
    if (!mode || mode.ai_mode === m) return
    setModeM.mutate(
      { patientId, mode: m },
      {
        onSuccess: () => toast.show('success', t('chatPane.modeSet', { mode: m })),
        onError: () => toast.show('error', t('chatPane.modeChangeFailed')),
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
    <div className="flex h-full min-h-0 flex-col bg-white">
      {showHeader ? (
        <header className="border-b border-bbh-line px-4 py-3">
          <h2 className="truncate font-serif text-lg font-semibold text-bbh-ink">
            {patientName ?? t('chatPane.author.patient')}
          </h2>
        </header>
      ) : null}

      {mode && mode.has_line_session ? (
        <div className="space-y-2 border-b border-bbh-line bg-white p-3">
          <BannerStrip banner={mode.banner} pauseUntil={mode.pause_until} />
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-bbh-line bg-bbh-surface p-0.5">
              {MODE_KEYS.map((key) => {
                const active = mode.ai_mode === key
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={setModeM.isPending}
                    onClick={() => changeMode(key)}
                    title={t(`chatPane.mode.${key}.hint`)}
                    className={`px-3 py-1 text-xs font-semibold transition ${
                      active ? 'bg-white text-bbh-ink shadow-sm' : 'text-bbh-muted hover:text-bbh-ink'
                    }`}
                  >
                    {t(`chatPane.mode.${key}.label`)}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-bbh-muted">
              {t('chatPane.effective')} <span className="font-semibold">{mode.effective_mode}</span>
            </p>
          </div>
        </div>
      ) : mode && !mode.has_line_session ? (
        <div className="border-b border-bbh-line bg-amber-50 p-3 text-xs text-amber-800">
          {t('chatPane.noLineSession')}
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-bbh-surface/40 p-4">
        {msgQ.isLoading ? (
          <div className="flex justify-center pt-8 text-bbh-muted">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-bbh-muted">{t('chatPane.noMessages')}</p>
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
            placeholder={t('chatPane.inputPlaceholder')}
            className="flex-1 resize-none rounded-xl border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none"
          />
          <button
            type="submit"
            disabled={sendM.isPending || !text.trim() || !mode?.has_line_session}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-bbh-green px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sendM.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {t('chatPane.send')}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-bbh-muted">
          {t('chatPane.charCountHint', { count: text.length })}
        </p>
      </form>
    </div>
  )
}
