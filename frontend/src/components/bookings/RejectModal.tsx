import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Modal } from '../Modal'
import { useToast } from '../../hooks/useToast'
import { useRejectBooking } from '../../hooks/useRejectBooking'
import type { BookingOut } from '../../hooks/useBooking'
import { ApiError } from '../../lib/api'

interface RejectModalProps {
  booking: BookingOut | null
  open: boolean
  onClose: () => void
  onRejected: () => void
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

export function RejectModal({ booking, open, onClose, onRejected }: RejectModalProps) {
  const [reason, setReason] = useState('')
  const reject = useRejectBooking()
  const toast = useToast()

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!booking) return
    try {
      await reject.mutateAsync({
        uid: booking.request_uid,
        body: { reason },
      })
      toast.show('success', `ปฏิเสธการจองของ ${booking.patient_name ?? ''} แล้ว`)
      onRejected()
      onClose()
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'ปฏิเสธไม่สำเร็จ'
      toast.show('error', msg)
    }
  }

  return (
    <Modal open={open} title="ปฏิเสธการจอง" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-bbh-muted">
          คนไข้: <span className="font-semibold text-bbh-ink">{booking?.patient_name ?? '-'}</span>
        </p>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">เหตุผล (ระบบจะส่งให้คนไข้ทาง LINE)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={500}
            placeholder="เช่น แพทย์ไม่ว่างในวันที่ขอ"
            className="mt-1.5 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30"
          />
        </label>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={reject.isPending}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={reject.isPending}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-red-700 disabled:opacity-60 ${FOCUS_RING}`}
          >
            {reject.isPending ? 'กำลังส่ง...' : 'ยืนยันการปฏิเสธ'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
