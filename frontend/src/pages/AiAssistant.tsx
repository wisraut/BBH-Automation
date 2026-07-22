import { useEffect, useRef, useState } from 'react'
import { dateLocale } from '../i18n/datetime'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, MessageSquare, Paperclip, Send, User, X } from 'lucide-react'

import { AiSessionsList } from '../components/ai/AiSessionsList'
import { PatientPickerModal } from '../components/ai/PatientPickerModal'
import { useAiChat } from '../hooks/useAiChat'
import { useAuth } from '../lib/auth'
import { prepareImage, validateImage, type PreparedImage } from '../lib/image'
import { Eyebrow } from '../components/ui/Eyebrow'

// Human-readable file size for the staged-image chip.
function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

// Role keys map to i18n entries under `aiAssistant.roleContext.*`
// (resolved via t() inside the component so labels/hints localize).
const ROLE_CONTEXT_KEYS: Record<string, string> = {
  doctor: 'doctor',
  cro: 'cro',
  admin: 'admin',
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

function MessageBubble(
  { role, text, ts, imageThumb, onExpand }:
  { role: 'user' | 'assistant'; text: string; ts: Date; imageThumb?: string; onExpand?: (src: string) => void },
) {
  const { t } = useTranslation()
  const isUser = role === 'user'
  return (
    <div className={`animate-rise flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="mr-2 mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bbh-green-soft">
          <span className="font-serif text-sm font-semibold text-bbh-green-dark">B</span>
        </div>
      )}
      <div className={`max-w-[85%] md:max-w-[72%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {imageThumb && (
          <button
            type="button"
            onClick={() => onExpand?.(imageThumb)}
            className={`${isUser ? 'self-end' : 'self-start'} block cursor-zoom-in overflow-hidden rounded-2xl border border-bbh-line ${FOCUS_RING}`}
          >
            <img src={imageThumb} alt={t('aiAssistant.image.expanded')} className="max-h-56 w-auto object-contain" />
          </button>
        )}
        {text && (
          <div
            className={`px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? 'rounded-2xl rounded-tr-sm bg-bbh-green text-white'
                : 'rounded-2xl rounded-tl-sm border border-bbh-line bg-white text-bbh-ink'
            }`}
          >
            {text.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < text.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
        )}
        <p className="px-1 font-mono text-xs tabular-nums text-bbh-muted">
          {ts.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

// หน้าแชท AI ผู้ช่วยสำหรับ staff (CRO/หมอ/admin) — คุยแบบ free-form, pin คนไข้เพื่อให้ AI
// เห็น context, จัดการหลาย session แชท (เก็บใน localStorage ต่อผู้ใช้)
export function AiAssistant() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const {
    messages, isLoading, error, send,
    sessions, current, currentId, createNew, switchTo, remove, setPinned,
  } = useAiChat()
  const [input, setInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [staged, setStaged] = useState<PreparedImage | null>(null)
  const [imgError, setImgError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function stageFile(file: File | null | undefined) {
    if (!file) return
    const err = validateImage(file)
    if (err) {
      setImgError(t(`aiAssistant.image.${err}`))
      return
    }
    setImgError(null)
    try {
      setStaged(await prepareImage(file))
    } catch {
      setImgError(t('aiAssistant.image.readError'))
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    void stageFile(e.target.files?.[0])
    e.target.value = '' // let the same file be picked again after removing
  }

  // Paste an image straight from the clipboard (screenshot -> paste -> send).
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'))
    const file = imageItem?.getAsFile()
    if (file) {
      e.preventDefault()
      void stageFile(file)
    }
  }

  function clearStaged() {
    setStaged(null)
    setImgError(null)
  }

  const role = user?.role ?? 'cro'
  const ctxKey = ROLE_CONTEXT_KEYS[role] ?? ROLE_CONTEXT_KEYS.cro
  const ctx = {
    label: t(`aiAssistant.roleContext.${ctxKey}.label`),
    hint: t(`aiAssistant.roleContext.${ctxKey}.hint`),
  }
  const pinned = current?.pinnedPatient ?? null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Close the image lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  function handleSend() {
    if (!input.trim() && !staged) return
    void send(
      input,
      staged ? { mime: staged.mime, data: staged.data, thumb: staged.thumb } : undefined,
    )
    setInput('')
    clearStaged()
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
    <div className="relative flex h-full min-w-0 overflow-hidden bg-white">
      {/* Desktop sessions panel — flush to the chat column via its own border-r */}
      <div className="hidden w-64 shrink-0 lg:block">
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
        aria-label={t('aiAssistant.closeHistory')}
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

      {/* Top bar — instrument masthead, flush to the topbar chrome via border-b */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bbh-line bg-white px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setSessionsOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark lg:hidden ${FOCUS_RING}`}
          >
            <MessageSquare size={15} />
            {t('aiAssistant.history')}
          </button>
          <div className="hidden h-9 w-9 place-items-center rounded-lg bg-bbh-green-soft sm:grid">
            <span className="font-serif text-base font-semibold text-bbh-green-dark">AI</span>
          </div>
          <div className="min-w-0">
            <p className="font-serif text-sm font-semibold text-bbh-ink">BBH AI Assistant</p>
            <Eyebrow className="truncate">
              {ctx.label} · Gemini Flash
            </Eyebrow>
          </div>
        </div>

        {pinned ? (
          <div className="flex max-w-full items-center gap-2 rounded-full border border-bbh-green/40 bg-bbh-green-soft px-3 py-1.5 text-xs font-semibold text-bbh-green-dark">
            <User size={14} />
            <span>
              {pinned.hn ? <span className="font-mono tabular-nums">HN {pinned.hn}</span> : null}
              {pinned.hn ? ' · ' : ''}{pinned.display_name}
            </span>
            <button
              type="button"
              onClick={() => currentId && setPinned(currentId, null)}
              className={`ml-1 rounded-full p-0.5 transition hover:bg-white/60 ${FOCUS_RING}`}
              aria-label={t('common.cancel')}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-3 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            <User size={14} />
            {t('aiAssistant.selectPatient')}
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto bg-white px-3 py-4 md:px-6 md:py-5">
        {messages.length === 0 ? (
          /* Welcome state */
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="animate-rise text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-bbh-green-soft">
                <span className="font-serif text-3xl font-semibold text-bbh-green-dark">AI</span>
              </div>
              <p className="font-serif text-xl font-semibold text-bbh-ink">
                BBH AI Assistant
              </p>
              <p className="mt-1 text-sm leading-relaxed text-bbh-muted">{ctx.hint}</p>
              <Eyebrow className="mt-4">
                {t('aiAssistant.startHint')}
              </Eyebrow>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} text={m.text} ts={m.ts} imageThumb={m.imageThumb} onExpand={setLightbox} />
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
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-bbh-line bg-white px-3 py-3 md:px-6 md:py-4">
        <div className="max-w-3xl">
          {/* Staged image: preview chip + PDPA warning (shown before sending) */}
          {staged && (
            <div className="mb-2 space-y-2">
              <div className="flex items-center gap-3 rounded-lg border border-bbh-line bg-bbh-surface p-2">
                <button
                  type="button"
                  onClick={() => setLightbox(staged.thumb)}
                  className={`h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-md ${FOCUS_RING}`}
                >
                  <img src={staged.thumb} alt="" className="h-full w-full object-cover" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-bbh-ink">{staged.name}</p>
                  <p className="font-mono text-xs tabular-nums text-bbh-muted">{formatSize(staged.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={clearStaged}
                  aria-label={t('common.cancel')}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-md text-bbh-muted transition-colors hover:bg-white hover:text-bbh-ink ${FOCUS_RING}`}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{t('aiAssistant.image.warning')}</span>
              </div>
            </div>
          )}
          {imgError && (
            <p className="mb-2 flex items-center gap-1.5 text-[12px] text-red-600">
              <AlertTriangle size={13} className="shrink-0" />
              {imgError}
            </p>
          )}

          <div className="flex items-end gap-2 md:gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              aria-label={t('aiAssistant.image.attach')}
              title={t('aiAssistant.image.attach')}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-bbh-line text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Paperclip size={18} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={onPaste}
              placeholder={t('aiAssistant.inputPlaceholder')}
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-lg border border-bbh-line bg-white px-4 py-3 text-sm text-bbh-ink transition-colors duration-200 placeholder:text-bbh-muted focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30 disabled:opacity-50"
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
              disabled={(!input.trim() && !staged) || isLoading}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-bbh-green text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}
              aria-label={t('aiAssistant.sendMessage')}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
      </div>

      <PatientPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => {
          const sid = currentId ?? createNew()
          setPinned(sid, { id: p.id, hn: p.hn ?? null, display_name: p.display_name })
        }}
      />

      {/* Image lightbox — click a sent image to view it enlarged. Backdrop or Esc
          closes; clicking the image itself does not. */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('aiAssistant.image.expanded')}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bbh-ink/80 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label={t('common.cancel')}
            className={`absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 ${FOCUS_RING}`}
          >
            <X size={20} />
          </button>
          <img
            src={lightbox}
            alt={t('aiAssistant.image.expanded')}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}
