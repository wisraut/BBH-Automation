import { useEffect, useState } from 'react'
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

function localIsoNow(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  return d.toISOString().slice(0, 16)
}

export function RescheduleModal({ open, uid, currentDateTimeText, onClose, onSuccess }: Props) {
  const m = useRescheduleBooking()
  const [whenLocal, setWhenLocal] = useState(localIsoNow())
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) {
      setWhenLocal(localIsoNow())
      setReason('')
      m.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!uid) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    // datetime-local has no zone — append +07:00 (Asia/Bangkok).
    const iso = `${whenLocal}:00+07:00`
    m.mutate(
      { uid, body: { new_start_at: iso, reason: reason || null } },
      {
        onSuccess: () => {
          onSuccess?.()
          onClose()
        },
      },
    )
  }

  return (
    <Modal open={open} title="เลื่อนนัด" onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-3">
        {currentDateTimeText ? (
          <div className="rounded-lg border border-bbh-line bg-bbh-surface px-3 py-2 text-xs text-bbh-muted">
            เวลานัดเดิม: <span className="font-mono text-bbh-ink">{currentDateTimeText}</span>
          </div>
        ) : null}
        <label className="block text-sm font-medium text-bbh-ink">
          เวลานัดใหม่
          <input
            type="datetime-local"
            required
            value={whenLocal}
            onChange={(e) => setWhenLocal(e.target.value)}
            className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          เหตุผล / หมายเหตุ (ไม่บังคับ)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={255}
            placeholder="เช่น คนไข้ขอเลื่อน, ตรงกับวันหยุด"
            className="mt-1 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm"
          />
        </label>
        {m.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            เลื่อนไม่สำเร็จ — อาจชนนัดอื่นหรือแพทย์ลาในช่วงเวลานี้
          </p>
        ) : null}
        <p className="text-[11px] text-bbh-muted">
          ระบบจะยกเลิก Google Calendar event เดิม สร้าง event ใหม่ และส่ง LINE
          แจ้งคนไข้อัตโนมัติ
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
          <button type="submit" disabled={m.isPending} className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">
            {m.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            ยืนยันเลื่อนนัด
          </button>
        </div>
      </form>
    </Modal>
  )
}
