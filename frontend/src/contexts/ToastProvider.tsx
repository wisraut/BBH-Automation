import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import { ToastContext } from './toast-context'
import type { Toast, ToastKind } from './toast-context'

const STYLES: Record<ToastKind, string> = {
  success: 'bg-bbh-green-soft text-bbh-green-dark border-bbh-green/30',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-bbh-surface text-bbh-ink border-bbh-line',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // Aliased: the toast map below already binds `t` to a Toast item.
  const { t: translate } = useTranslation()
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++counterRef.current
      // Cap the stack at 3 so rapid mode toggles / actions don't bury the UI.
      // Newest bottom, so drop the oldest (head) when we exceed the cap.
      setToasts((prev) => [...prev, { id, kind, message }].slice(-3))
      setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-6 top-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex min-w-[280px] max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-bbh-card ${STYLES[t.kind]}`}
          >
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
        ))}
      </div>
    </ToastContext.Provider>
  )
}
