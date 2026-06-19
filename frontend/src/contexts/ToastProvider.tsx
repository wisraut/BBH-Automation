import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { ToastContext } from './toast-context'
import type { Toast, ToastKind } from './toast-context'

const STYLES: Record<ToastKind, string> = {
  success: 'bg-bbh-green-soft text-bbh-green-dark border-bbh-green/30',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-bbh-surface text-bbh-ink border-bbh-line',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++counterRef.current
      setToasts((prev) => [...prev, { id, kind, message }])
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
            className={`pointer-events-auto min-w-[280px] max-w-md rounded-xl border px-4 py-3 text-sm font-medium shadow-bbh-card ${STYLES[t.kind]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
