import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-bbh-ink/40"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-bbh-line bg-white p-6 shadow-bbh-card">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-serif text-xl font-semibold text-bbh-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-bbh-muted transition hover:bg-bbh-surface hover:text-bbh-ink"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
