import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, Loader2 } from 'lucide-react'

import { Modal } from '../Modal'
import { useRescheduleBooking } from '../../hooks/useRescheduleBooking'

interface Props {
  open: boolean
  uid: string | null
  currentDateTimeText: string | null
  onClose: () => void
  onSuccess?: () => void
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const FIELD_CLASS =
  'w-full rounded-lg border border-bbh-line px-3 py-2 text-sm transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

// ค่าเริ่มต้นช่องเวลาใหม่ = อีก 1 ชั่วโมงข้างหน้า ปัดเป็นต้นชั่วโมง (รูปแบบ local สำหรับ datetime-local)
function localIsoNow(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  return d.toISOString().slice(0, 16)
}

// Modal เลื่อนนัด (CRO) — ตั้งเวลาใหม่ หรือติ๊ก TBD (ยังไม่รู้เวลา → ดันนัดกลับไปรออนุมัติ) พร้อมเหตุผล
export function RescheduleModal({ open, uid, currentDateTimeText, onClose, onSuccess }: Props) {
  const { t } = useTranslation()
  const m = useRescheduleBooking()
  const [whenLocal, setWhenLocal] = useState(localIsoNow())
  const [reason, setReason] = useState('')
  const [tbd, setTbd] = useState(false)

  useEffect(() => {
    if (open) {
      setWhenLocal(localIsoNow())
      setReason('')
      setTbd(false)
      m.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!uid) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    // TBD: no new time — server moves booking back to pending_approval.
    // Otherwise datetime-local has no zone — append +07:00 (Asia/Bangkok).
    const body = tbd
      ? { new_start_at: null, reason: reason || null }
      : { new_start_at: `${whenLocal}:00+07:00`, reason: reason || null }
    m.mutate(
      { uid, body },
      {
        onSuccess: () => {
          onSuccess?.()
          onClose()
        },
      },
    )
  }

  return (
    <Modal open={open} title={t('rescheduleModal.title')} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-3">
        {currentDateTimeText ? (
          <div className="rounded-lg border border-bbh-line bg-bbh-surface px-3 py-2 text-xs text-bbh-muted">
            {t('rescheduleModal.currentTime')} <span className="font-mono text-bbh-ink">{currentDateTimeText}</span>
          </div>
        ) : null}

        <label className="flex items-start gap-3 rounded-lg border border-bbh-line bg-bbh-surface px-3 py-3 text-sm text-bbh-ink">
          <input
            type="checkbox"
            checked={tbd}
            onChange={(e) => setTbd(e.target.checked)}
            className={`mt-0.5 h-4 w-4 shrink-0 accent-bbh-green ${FOCUS_RING}`}
          />
          <span>
            <span className="font-medium">{t('rescheduleModal.tbdLabel')}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-bbh-muted">
              {t('rescheduleModal.tbdHint')}
            </span>
          </span>
        </label>

        <label className={`block text-sm font-medium text-bbh-ink transition-opacity ${tbd ? 'opacity-40' : ''}`}>
          {t('rescheduleModal.newTime')}
          <input
            type="datetime-local"
            required={!tbd}
            disabled={tbd}
            value={whenLocal}
            onChange={(e) => setWhenLocal(e.target.value)}
            className={`mt-1 ${FIELD_CLASS} disabled:cursor-not-allowed disabled:bg-bbh-surface`}
          />
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          {t('rescheduleModal.reasonLabel')}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={255}
            placeholder={t('rescheduleModal.reasonPlaceholder')}
            className={`mt-1 ${FIELD_CLASS}`}
          />
        </label>
        {m.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {t('rescheduleModal.rescheduleFailed')}
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-bbh-muted">
          {tbd
            ? t('rescheduleModal.effectTbd')
            : t('rescheduleModal.effectScheduled')}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={m.isPending}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            {tbd ? t('rescheduleModal.confirmTbd') : t('rescheduleModal.confirm')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
