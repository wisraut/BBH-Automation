import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { X } from 'lucide-react'

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
        className="absolute inset-0 bg-bbh-ink/45 backdrop-blur-[2px]"
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-bbh-line bg-white shadow-2xl shadow-bbh-ink/20">
        <div className="h-1 bg-bbh-green" />
        <div className="flex items-start justify-between gap-4 border-b border-bbh-line bg-bbh-surface px-7 py-5">
          <h2 className="font-serif text-xl font-semibold text-bbh-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-transparent p-2 text-bbh-muted transition hover:border-bbh-line hover:bg-white hover:text-bbh-ink"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
        <div className="bg-white px-7 py-6">{children}</div>
      </div>
    </div>
  )
}
