import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Modal } from '../Modal'
import { useToast } from '../../hooks/useToast'
import { useApproveBooking } from '../../hooks/useApproveBooking'
import type { BookingOut } from '../../hooks/useBooking'
import { useDoctors } from '../../hooks/useDoctors'
import { ApiError } from '../../lib/api'

interface ApproveModalProps {
  booking: BookingOut | null
  open: boolean
  onClose: () => void
  onApproved: () => void
}

function defaultStart(): string {
  // Local datetime input (no TZ) — naive YYYY-MM-DDTHH:MM
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ApproveModal({ booking, open, onClose, onApproved }: ApproveModalProps) {
  const [startAt, setStartAt] = useState(defaultStart())
  const [duration, setDuration] = useState(60)
  const [doctorId, setDoctorId] = useState<number | ''>('')
  const approve = useApproveBooking()
  const doctorsQ = useDoctors()
  const toast = useToast()

  useEffect(() => {
    if (open) {
      setStartAt(defaultStart())
      setDuration(booking?.duration_min ?? 60)
      setDoctorId(booking?.assigned_doctor_id ?? '')
    }
  }, [open, booking])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!booking) return
    if (doctorId === '') {
      toast.show('error', 'กรุณาเลือกแพทย์ประจำตัวคนไข้')
      return
    }
    try {
      // Browser sends "YYYY-MM-DDTHH:MM"; treat as Asia/Bangkok by appending +07:00
      const isoBangkok = `${startAt}:00+07:00`
      await approve.mutateAsync({
        uid: booking.request_uid,
        body: {
          start_at: isoBangkok,
          duration_min: duration,
          assigned_doctor_id: Number(doctorId),
        },
      })
      toast.show('success', `ยืนยันนัด ${booking.patient_name ?? ''} สำเร็จ`)
      onApproved()
      onClose()
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'ยืนยันไม่สำเร็จ'
      toast.show('error', msg)
    }
  }

  return (
    <Modal open={open} title="ยืนยันการจอง" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-bbh-muted">คนไข้</p>
          <p className="mt-1 text-base font-semibold text-bbh-ink">
            {booking?.patient_name ?? '-'}
          </p>
          {booking?.requested_datetime_text ? (
            <p className="text-xs text-bbh-muted">
              ลูกค้าขอ: {booking.requested_datetime_text}
            </p>
          ) : null}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">วัน-เวลานัด</span>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">ระยะเวลา (นาที)</span>
          <input
            type="number"
            min={15}
            max={240}
            step={15}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">แพทย์ประจำตัวคนไข้</span>
          <select
            value={doctorId}
            onChange={(event) => setDoctorId(event.target.value === '' ? '' : Number(event.target.value))}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            required
          >
            <option value="">— เลือกแพทย์ —</option>
            {(doctorsQ.data?.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}{d.specialty ? ` (${d.specialty})` : ''}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs leading-relaxed text-bbh-muted">
            ระบบจะส่งอีเมลแจ้งแพทย์เมื่อมีการเลื่อนนัดในภายหลัง
          </span>
        </label>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={approve.isPending}
            className="rounded-xl border border-bbh-line px-4 py-2 text-sm font-medium text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={approve.isPending}
            className="rounded-xl bg-bbh-green px-5 py-2 text-sm font-semibold text-white transition hover:bg-bbh-green-dark disabled:opacity-60"
          >
            {approve.isPending ? 'กำลังยืนยัน...' : 'ยืนยันนัด'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
