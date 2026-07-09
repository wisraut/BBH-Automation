import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Modal } from '../Modal'
import { useToast } from '../../hooks/useToast'
import { useApproveBooking } from '../../hooks/useApproveBooking'
import type { BookingOut } from '../../hooks/useBooking'
import { useDoctors } from '../../hooks/useDoctors'
import { useScheduleBlocks, type ScheduleBlock } from '../../hooks/useScheduleBlocks'
import { ApiError } from '../../lib/api'

interface ApproveModalProps {
  booking: BookingOut | null
  open: boolean
  onClose: () => void
  onApproved: () => void
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const FIELD_CLASS =
  'w-full rounded-lg border border-bbh-line px-3 py-2 text-sm transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

function defaultStart(): string {
  // Local datetime input (no TZ) - naive YYYY-MM-DDTHH:MM
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nextDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function blockTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    vacation: 'ลา',
    off_hours: 'ไม่อยู่',
    conference: 'ประชุม',
    sick: 'ป่วย',
    other: 'ไม่ว่าง',
  }
  return labels[type] ?? type
}

function formatBlockRange(block: ScheduleBlock): string {
  const start = new Date(block.start_at)
  const end = new Date(block.end_at)
  const startTime = start.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  const endTime = end.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  return `${startTime}-${endTime}`
}

function overlapsBlock(block: ScheduleBlock, startAt: string, duration: number): boolean {
  if (!startAt) return false
  const start = new Date(`${startAt}:00`)
  const end = new Date(start.getTime() + duration * 60000)
  const blockStart = new Date(block.start_at)
  const blockEnd = new Date(block.end_at)
  if ([start, end, blockStart, blockEnd].some((d) => Number.isNaN(d.getTime()))) return false
  return start < blockEnd && end > blockStart
}

export function ApproveModal({ booking, open, onClose, onApproved }: ApproveModalProps) {
  const [startAt, setStartAt] = useState(defaultStart())
  const [duration, setDuration] = useState(60)
  const [doctorId, setDoctorId] = useState<number | ''>('')
  // Patient identity: number = link to that existing chart, 'new' = fresh chart.
  const [patientChoice, setPatientChoice] = useState<number | 'new' | null>(null)
  const approve = useApproveBooking()
  const doctorsQ = useDoctors()
  const blockDate = startAt.slice(0, 10)
  const blocksQ = useScheduleBlocks({
    doctorId: doctorId === '' ? undefined : Number(doctorId),
    dateFrom: blockDate || undefined,
    dateTo: blockDate ? nextDateKey(blockDate) : undefined,
  })
  const blockConflict = (blocksQ.data?.data ?? []).find((block) => overlapsBlock(block, startAt, duration))
  const toast = useToast()

  // Existing charts sharing this phone. When present the CRO must confirm
  // identity before approving — never merge on phone alone.
  const candidates = booking?.patient_candidates ?? []
  const hasCandidates = candidates.length > 0
  const patientUnresolved = hasCandidates && patientChoice === null

  useEffect(() => {
    if (open) {
      setStartAt(defaultStart())
      setDuration(booking?.duration_min ?? 60)
      setDoctorId(booking?.assigned_doctor_id ?? '')
      setPatientChoice(null)
    }
  }, [open, booking])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!booking) return
    if (doctorId === '') {
      toast.show('error', 'กรุณาเลือกแพทย์ประจำตัวคนไข้')
      return
    }
    if (blockConflict) {
      toast.show('error', 'แพทย์ไม่ว่างในช่วงเวลานี้')
      return
    }
    if (patientUnresolved) {
      toast.show('error', 'กรุณายืนยันตัวตนคนไข้ (เลือกคนเดิม หรือเป็นคนไข้ใหม่)')
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
          link_patient_id: typeof patientChoice === 'number' ? patientChoice : undefined,
          create_new_patient: patientChoice === 'new',
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
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">คนไข้</p>
          <p className="mt-1 text-base font-semibold text-bbh-ink">
            {booking?.patient_name ?? '-'}
          </p>
          {booking?.requested_datetime_text ? (
            <p className="text-xs text-bbh-muted">
              ลูกค้าขอ: <span className="font-mono tabular-nums">{booking.requested_datetime_text}</span>
            </p>
          ) : null}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">วัน-เวลานัด</span>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className={`mt-1.5 ${FIELD_CLASS}`}
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
            className={`mt-1.5 ${FIELD_CLASS}`}
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">แพทย์ประจำตัวคนไข้</span>
          <select
            value={doctorId}
            onChange={(event) => setDoctorId(event.target.value === '' ? '' : Number(event.target.value))}
            className={`mt-1.5 ${FIELD_CLASS}`}
            required
          >
            <option value="">- เลือกแพทย์ -</option>
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

        {hasCandidates ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-amber-900">เบอร์นี้ตรงกับคนไข้เดิม — ยืนยันตัวตน</p>
            <p className="mt-0.5 text-xs text-amber-800">
              เลือกว่าเป็นคนเดียวกัน หรือเป็นคนไข้ใหม่ เพื่อกันเปิดเวชระเบียนผิดคน
            </p>
            <div className="mt-2 space-y-1">
              {candidates.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-amber-100/60"
                >
                  <input
                    type="radio"
                    name="patient-choice"
                    className="mt-1 accent-bbh-green"
                    checked={patientChoice === c.id}
                    onChange={() => setPatientChoice(c.id)}
                  />
                  <span className="text-sm leading-snug">
                    <span className="font-medium text-bbh-ink">{c.display_name}</span>
                    {c.hn ? <span className="font-mono text-xs text-bbh-muted"> · HN {c.hn}</span> : null}
                    {c.phone ? <span className="text-xs text-bbh-muted"> · {c.phone}</span> : null}
                    {c.latest_visit_at ? (
                      <span className="block text-[11px] text-bbh-muted">
                        มาล่าสุด {new Date(c.latest_visit_at).toLocaleDateString('th-TH')}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-amber-100/60">
                <input
                  type="radio"
                  name="patient-choice"
                  className="accent-bbh-green"
                  checked={patientChoice === 'new'}
                  onChange={() => setPatientChoice('new')}
                />
                <span className="text-sm font-medium text-bbh-ink">เป็นคนไข้ใหม่ (สร้างเวชระเบียนใหม่)</span>
              </label>
            </div>
          </div>
        ) : null}

        {blockConflict ? (
          <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <p className="font-semibold text-bbh-ink">แพทย์ไม่ว่างช่วงเวลานี้</p>
            <p className="mt-1 font-mono tabular-nums">{formatBlockRange(blockConflict)} · {blockTypeLabel(blockConflict.block_type)}</p>
            {blockConflict.reason ? <p className="mt-1 text-bbh-muted">{blockConflict.reason}</p> : null}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={approve.isPending}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={approve.isPending || !!blockConflict || patientUnresolved}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {blockConflict
              ? 'แพทย์ไม่ว่าง'
              : patientUnresolved
                ? 'ยืนยันตัวตนคนไข้ก่อน'
                : approve.isPending
                  ? 'กำลังยืนยัน...'
                  : 'ยืนยันนัด'}
          </button>
        </div>
      </form>
    </Modal>
  )
}