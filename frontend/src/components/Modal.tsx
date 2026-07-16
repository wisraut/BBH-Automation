import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'md' | 'lg'
}

// กล่อง Modal กลางที่ทุกหน้าใช้ร่วมกัน (approve/reject/reschedule/patient picker)
// มี overlay กดปิด + ปิดด้วยปุ่ม Escape + เลื่อนขึ้นจากล่างบนจอมือถือ
export function Modal({ open, title, onClose, children, size = 'md' }: ModalProps) {
  const { t } = useTranslation()
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
    <div className="fixed inset-0 z-40 flex items-end justify-center p-0 md:items-center md:p-4 lg:p-6">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 bg-bbh-ink/45 backdrop-blur-[2px]"
      />
      <div
        className={`relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-bbh-line bg-white shadow-2xl shadow-bbh-ink/20 md:max-h-[calc(100vh-5rem)] md:rounded-2xl ${
          size === 'lg' ? 'max-w-2xl' : 'max-w-md'
        }`}
      >
        <div className="h-1 bg-bbh-green" />
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-bbh-line bg-bbh-surface px-4 py-4 md:px-7">
          <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-transparent p-2 text-bbh-muted transition hover:border-bbh-line hover:bg-white hover:text-bbh-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-5 md:px-7">{children}</div>
      </div>
    </div>
  )
}
