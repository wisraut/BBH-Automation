import { useEffect, useRef, useState } from 'react'

import { useAiChat } from '../hooks/useAiChat'
import { useAuth } from '../lib/auth'

const ROLE_CONTEXT: Record<string, { label: string; hint: string }> = {
  doctor: {
    label: 'โหมดแพทย์',
    hint: 'AI วิเคราะห์ผลแล็บและข้อมูลคนไข้จาก Knowledge Base ทางการแพทย์',
  },
  cro: {
    label: 'โหมด CRO',
    hint: 'AI ตอบคำถามเกี่ยวกับคลินิก บริการ และข้อมูลทั่วไปของ BBH',
  },
  admin: {
    label: 'โหมดผู้ดูแล',
    hint: 'AI ตอบคำถามเกี่ยวกับคลินิก บริการ และข้อมูลทั่วไปของ BBH',
  },
}

const SUGGESTIONS: Record<string, string[]> = {
  doctor: [
    'สรุปค่า HbA1c สูงกว่า 7% มีนัยยะอะไรต่อคนไข้เบาหวาน',
    'ยา Metformin มีข้อควรระวังอะไรบ้าง',
    'อธิบาย Functional Medicine approach สำหรับ Leaky Gut',
  ],
  cro: [
    'คลินิกให้บริการรักษาโรคอะไรบ้าง',
    'ค่าแพทย์นัดแรกเท่าไหร่',
    'Walk-in ได้ไหม ต้องจองล่วงหน้าหรือเปล่า',
  ],
  admin: [
    'คลินิกให้บริการรักษาโรคอะไรบ้าง',
    'ค่าแพทย์นัดแรกเท่าไหร่',
    'Walk-in ได้ไหม ต้องจองล่วงหน้าหรือเปล่า',
  ],
}

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
      <div className={`max-w-[72%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
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
  const { messages, isLoading, error, send, reset } = useAiChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const role = user?.role ?? 'cro'
  const ctx = ROLE_CONTEXT[role] ?? ROLE_CONTEXT.cro
  const suggestions = SUGGESTIONS[role] ?? SUGGESTIONS.cro

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  function handleSend() {
    if (!input.trim()) return
    void send(input)
    setInput('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b border-bbh-line bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-bbh-green-soft">
            <span className="font-serif text-base font-semibold text-bbh-green-dark">AI</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-bbh-ink">BBH AI Assistant</p>
            <p className="text-xs text-bbh-muted">{ctx.label} · Dify + Gemini Flash</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-bbh-line px-3 py-1.5 text-xs font-medium text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green"
          >
            สนทนาใหม่
          </button>
        )}
      </div>

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {messages.length === 0 ? (
          /* Welcome state */
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-bbh-green-soft">
                <span className="font-serif text-3xl font-semibold text-bbh-green-dark">AI</span>
              </div>
              <p className="font-serif text-xl font-semibold text-bbh-ink">
                BBH AI Assistant
              </p>
              <p className="mt-1 text-sm text-bbh-muted">{ctx.hint}</p>
            </div>

            <div className="w-full max-w-lg space-y-2">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-bbh-muted">
                ตัวอย่างคำถาม
              </p>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                  className="w-full rounded-2xl border border-bbh-line bg-white px-4 py-3 text-left text-sm text-bbh-ink transition hover:border-bbh-green hover:bg-bbh-green-soft"
                >
                  {s}
                </button>
              ))}
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

      {/* ── Input bar ── */}
      <div className="border-t border-bbh-line bg-white px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์คำถาม… (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
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
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M3.105 3.105a1 1 0 011.3-.126l12 8a1 1 0 010 1.642l-12 8a1 1 0 01-1.426-1.3L4.584 11H8a1 1 0 100-2H4.584L2.98 4.43a1 1 0 01.125-1.325z" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-bbh-muted">
          AI อาจให้ข้อมูลที่ไม่ถูกต้อง — ตรวจสอบกับแพทย์เสมอ
        </p>
      </div>
    </div>
  )
}
