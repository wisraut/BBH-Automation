import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity, FlaskConical, HeartPulse, MessageSquare, Pill,
  Send, ShieldAlert, User, X,
} from 'lucide-react'

import { AiSessionsList } from '../components/ai/AiSessionsList'
import { PatientPickerModal } from '../components/ai/PatientPickerModal'
import { useAiChat } from '../hooks/useAiChat'
import { useAuth } from '../lib/auth'

const ROLE_CONTEXT: Record<string, { label: string; hint: string }> = {
  doctor: {
    label: 'โหมดแพทย์',
    hint: 'ผู้ช่วยด้านสุขภาพ — วิเคราะห์ผลแล็บและข้อมูลคนไข้ทางการแพทย์',
  },
  cro: {
    label: 'โหมด CRO',
    hint: 'ผู้ช่วยด้านสุขภาพ — ตอบคำถามสุขภาพ การแพทย์ และข้อมูลคนไข้',
  },
  admin: {
    label: 'โหมดผู้ดูแล',
    hint: 'ผู้ช่วยด้านสุขภาพ — ตอบคำถามสุขภาพ การแพทย์ และข้อมูลคนไข้',
  },
}

type QuickPrompt = { icon: LucideIcon; text: string }

// Shown when a patient is pinned — one tap asks about that patient's record.
const PATIENT_PROMPTS: QuickPrompt[] = [
  { icon: FlaskConical, text: 'สรุปผลแล็บล่าสุดของคนไข้คนนี้' },
  { icon: Pill, text: 'ตอนนี้คนไข้ใช้ยาอะไรอยู่บ้าง' },
  { icon: ShieldAlert, text: 'คนไข้มีประวัติแพ้ยาอะไรไหม' },
  { icon: Activity, text: 'สรุปโรคประจำตัวและความเสี่ยงของคนไข้' },
]

// Shown when no patient is pinned — general health starters.
const GENERAL_PROMPTS: QuickPrompt[] = [
  { icon: Activity, text: 'ความดันโลหิตสูงควรปรับพฤติกรรมอย่างไร' },
  { icon: FlaskConical, text: 'ค่า SGOT / SGPT สูง หมายความว่าอะไร' },
  { icon: HeartPulse, text: 'แนวทางดูแลผู้ป่วยเบาหวานเบื้องต้น' },
  { icon: Pill, text: 'ยาที่กินคู่กันแล้วควรระวังมีอะไรบ้าง' },
]

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-bbh-muted"
          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: .5; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function MessageBubble({ role, text, ts }: { role: 'user' | 'assistant'; text: string; ts: Date }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="mr-2 mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bbh-green-soft">
          <span className="font-serif text-sm font-semibold text-bbh-green-dark">B</span>
        </div>
      )}
      <div className={`max-w-[85%] md:max-w-[72%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-bbh-green text-white'
              : 'rounded-tl-sm border border-bbh-line bg-white text-bbh-ink'
          }`}
        >
          {text.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              {i < text.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>
        <p className="px-1 text-[11px] text-bbh-muted">
          {ts.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

export function AiAssistant() {
  const { user } = useAuth()
  const {
    messages, isLoading, error, send,
    sessions, current, currentId, createNew, switchTo, remove, patchById,
  } = useAiChat()
  const [input, setInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const role = user?.role ?? 'cro'
  const ctx = ROLE_CONTEXT[role] ?? ROLE_CONTEXT.cro
  const pinned = current?.pinnedPatient ?? null
  const quickPrompts = pinned ? PATIENT_PROMPTS : GENERAL_PROMPTS

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  function handleSend() {
    if (!input.trim()) return
    void send(input)
    setInput('')
    inputRef.current?.focus()
  }

  function handleQuick(text: string) {
    if (isLoading) return
    void send(text)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSwitchSession(id: string) {
    switchTo(id)
    setSessionsOpen(false)
  }

  function handleNewSession() {
    createNew()
    setSessionsOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative flex h-full min-w-0 overflow-hidden">
      {/* Desktop sessions panel — collapsible + resizable */}
      <div className="hidden w-72 shrink-0 lg:block">
        <AiSessionsList
          sessions={sessions}
          currentId={currentId}
          onSelect={switchTo}
          onNew={() => { createNew(); inputRef.current?.focus() }}
          onDelete={remove}
        />
      </div>

      <button
        type="button"
        aria-label="ปิดประวัติสนทนา"
        onClick={() => setSessionsOpen(false)}
        className={`fixed inset-0 z-30 bg-bbh-ink/40 backdrop-blur-[2px] transition-opacity lg:hidden ${sessionsOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:hidden ${sessionsOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <AiSessionsList
          sessions={sessions}
          currentId={currentId}
          onSelect={handleSwitchSession}
          onNew={handleNewSession}
          onDelete={remove}
        />
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col">

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bbh-line bg-white px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setSessionsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-bbh-line px-3 py-2 text-xs font-semibold text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green lg:hidden"
          >
            <MessageSquare size={15} />
            ประวัติสนทนา
          </button>
          <div className="hidden h-9 w-9 place-items-center rounded-xl bg-bbh-green-soft sm:grid">
            <span className="font-serif text-base font-semibold text-bbh-green-dark">AI</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-bbh-ink">BBH AI Assistant</p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bbh-green-soft px-2 py-0.5 text-[10px] font-semibold text-bbh-green-dark">
                <HeartPulse size={11} />
                เฉพาะสุขภาพ
              </span>
            </div>
            <p className="truncate text-xs text-bbh-muted">{ctx.label} · ผู้ช่วยด้านสุขภาพ</p>
          </div>
        </div>

        {pinned ? (
          <div className="flex max-w-full items-center gap-2 rounded-full border border-bbh-green/40 bg-bbh-green-soft px-3 py-1.5 text-xs font-semibold text-bbh-green-dark">
            <User size={14} />
            <span>
              {pinned.hn ? `HN ${pinned.hn} · ` : ''}{pinned.display_name}
            </span>
            <button
              type="button"
              onClick={() => currentId && patchById(currentId, () => ({ pinnedPatient: null }))}
              className="ml-1 rounded-full p-0.5 transition hover:bg-white/60"
              aria-label="ยกเลิก">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-bbh-line px-3 py-1.5 text-xs font-medium text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green"
          >
            <User size={14} />
            เลือกคนไข้
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-5">
        {messages.length === 0 ? (
          /* Welcome state */
          <div className="flex h-full flex-col items-center justify-center gap-6 py-6">
            <div className="text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-bbh-green-soft">
                <span className="font-serif text-3xl font-semibold text-bbh-green-dark">AI</span>
              </div>
              <p className="font-serif text-xl font-semibold text-bbh-ink">
                BBH AI Assistant
              </p>
              <p className="mt-1 text-sm text-bbh-muted">{ctx.hint}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-bbh-green-soft px-3 py-1 text-xs font-medium text-bbh-green-dark">
                <HeartPulse size={13} />
                ตอบเฉพาะเรื่องสุขภาพ การแพทย์ และข้อมูลคนไข้
              </p>
              {pinned ? (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-bbh-ink">
                  <User size={13} className="text-bbh-green" />
                  กำลังคุยเรื่องคนไข้:{' '}
                  <span className="font-semibold">
                    {pinned.hn ? `HN ${pinned.hn} · ` : ''}{pinned.display_name}
                  </span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-bbh-green transition hover:text-bbh-green-dark"
                >
                  <User size={13} />
                  เลือกคนไข้เพื่อคุยเจาะข้อมูลรายบุคคล
                </button>
              )}
            </div>

            <div className="w-full max-w-md">
              <p className="mb-2 px-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-bbh-muted">
                {pinned ? 'ถามเรื่องคนไข้คนนี้' : 'เริ่มด้วยคำถามสุขภาพ'}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {quickPrompts.map((p) => (
                  <button
                    key={p.text}
                    type="button"
                    onClick={() => handleQuick(p.text)}
                    disabled={isLoading}
                    className="flex items-center gap-2 rounded-xl border border-bbh-line bg-white px-3 py-2.5 text-left text-xs font-medium text-bbh-ink transition-all duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-50"
                  >
                    <p.icon size={15} className="shrink-0 text-bbh-green" />
                    <span>{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} text={m.text} ts={m.ts} />
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="mr-2 mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bbh-green-soft">
                  <span className="font-serif text-sm font-semibold text-bbh-green-dark">B</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-bbh-line bg-white px-4 py-3">
                  <TypingDots />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Contextual patient shortcuts during an ongoing chat */}
      {pinned && messages.length > 0 && (
        <div className="border-t border-bbh-line bg-bbh-surface/60 px-3 py-2 md:px-6">
          <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto">
            {PATIENT_PROMPTS.map((p) => (
              <button
                key={p.text}
                type="button"
                onClick={() => handleQuick(p.text)}
                disabled={isLoading}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-bbh-line bg-white px-3 py-1.5 text-[11px] font-medium text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-50"
              >
                <p.icon size={12} className="text-bbh-green" />
                {p.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-bbh-line bg-white px-3 py-3 md:px-6 md:py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2 md:gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์คำถาม... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-2xl border border-bbh-line bg-bbh-surface px-4 py-3 text-sm text-bbh-ink placeholder:text-bbh-muted focus:border-bbh-green focus:outline-none disabled:opacity-50"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bbh-green text-white transition hover:bg-bbh-green-dark disabled:opacity-40"
            aria-label="ส่งข้อความ"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
      </div>

      <PatientPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => {
          const sid = currentId ?? createNew()
          patchById(sid, () => ({
            pinnedPatient: { id: p.id, hn: p.hn ?? null, display_name: p.display_name },
          }))
        }}
      />
    </div>
  )
}
