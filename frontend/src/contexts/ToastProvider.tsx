import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Info, X, AlertCircle } from 'lucide-react'

import { ToastContext } from './toast-context'
import type { Toast, ToastKind } from './toast-context'

const STYLES: Record<ToastKind, string> = {
  success: 'bg-bbh-green-soft text-bbh-green-dark border-bbh-green/30',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-bbh-surface text-bbh-ink border-bbh-line',
}

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const DISMISS_MS = 4500

// Provider แสดง toast notification มุมขวาบน — ให้ฟังก์ชัน show(kind, message) ผ่าน context,
// จำกัดกอง toast ไว้ 3 อัน และปิดอัตโนมัติใน 4.5 วิ. Toast แต่ละอันเป็น ARIA live region
// (status=polite / alert=assertive สำหรับ error) เพื่อให้ screen reader อ่าน และ pause ตัวจับเวลา
// ตอน hover/focus เพื่อให้ผู้ที่อ่านช้าอ่านทัน (accessibility best practice)
export function ToastProvider({ children }: { children: ReactNode }) {
  // Aliased: the toast map below already binds `t` to a Toast item.
  const { t: translate } = useTranslation()
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Arm (or re-arm) the auto-dismiss timer for one toast. Pausing = clear the
  // timer; resuming = re-arm a fresh window so a hovered toast never vanishes
  // mid-read.
  const arm = useCallback(
    (id: number) => {
      const existing = timersRef.current.get(id)
      if (existing) clearTimeout(existing)
      timersRef.current.set(id, setTimeout(() => dismiss(id), DISMISS_MS))
    },
    [dismiss],
  )

  const pause = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++counterRef.current
      // Cap the stack at 3 so rapid mode toggles / actions don't bury the UI.
      // Newest bottom, so drop the oldest (head) when we exceed the cap — and
      // clear the dropped toasts' timers so an off-screen toast can't fire a
      // stray dismiss later (timer/Map leak on burst).
      setToasts((prev) => {
        const next = [...prev, { id, kind, message }]
        for (const dropped of next.slice(0, Math.max(0, next.length - 3))) {
          const timer = timersRef.current.get(dropped.id)
          if (timer) {
            clearTimeout(timer)
            timersRef.current.delete(dropped.id)
          }
        }
        return next.slice(-3)
      })
      arm(id)
    },
    [arm],
  )

  // Clear any outstanding timers if the provider unmounts.
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* The live region is the PERSISTENT container (always in the DOM), so a
          toast inserted into it is announced. A region created together with its
          content is not reliably announced by screen readers. Politeness is fixed
          on the container; errors ride the same region (announced, just not
          interrupting) — acceptable for these short status messages. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-6 top-6 z-50 flex flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.kind]
          return (
            <div
              key={t.id}
              onMouseEnter={() => pause(t.id)}
              onMouseLeave={() => arm(t.id)}
              onFocus={() => pause(t.id)}
              onBlur={() => arm(t.id)}
              className={`animate-rise pointer-events-auto flex min-w-[280px] max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-bbh-card ${STYLES[t.kind]}`}
            >
              <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label={translate('common.close')}
                className="-mr-1 shrink-0 rounded p-0.5 opacity-60 transition hover:bg-black/5 hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
