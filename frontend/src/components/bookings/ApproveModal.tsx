import { useEffect, useState } from 'react'
import { dateLocale } from '../../i18n/datetime'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

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
  // Pre-select this doctor when the booking has none yet (e.g. the CRO calendar
  // is scoped to one doctor).
  defaultDoctorId?: number
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const FIELD_CLASS =
  'w-full rounded-lg border border-bbh-line px-3 py-2 text-sm transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

// ค่าเริ่มต้นของช่องวัน-เวลานัด = ต้นชั่วโมงถัดไป (รูปแบบ local สำหรับ input datetime-local)
function defaultStart(): string {
  // Local datetime input (no TZ) - naive YYYY-MM-DDTHH:MM
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// คืนวันถัดไป (YYYY-MM-DD) — ใช้ทำช่วง dateFrom..dateTo ตอน query ตารางว่าง/ไม่ว่างของหมอ 1 วัน
function nextDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// แปลงชนิดช่วงเวลาที่หมอไม่ว่าง (ลาพักร้อน/นอกเวลา/ประชุม/ลาป่วย/อื่นๆ) เป็นข้อความแปลไว้แสดง
function blockTypeLabel(type: string, t: (key: string) => string): string {
  const keys: Record<string, string> = {
    vacation: 'approveModal.blockType.vacation',
    off_hours: 'approveModal.blockType.offHours',
    conference: 'approveModal.blockType.conference',
    sick: 'approveModal.blockType.sick',
    other: 'approveModal.blockType.other',
  }
  return keys[type] ? t(keys[type]) : type
}

// จัดรูปช่วงเวลาที่หมอไม่ว่างเป็น "HH:MM-HH:MM" สำหรับโชว์ในกล่องเตือนชนคิว
function formatBlockRange(block: ScheduleBlock): string {
  const start = new Date(block.start_at)
  const end = new Date(block.end_at)
  const startTime = start.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  const endTime = end.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  return `${startTime}-${endTime}`
}

// เช็คว่านัด (เวลาเริ่ม+ระยะเวลา) ทับกับช่วงที่หมอไม่ว่างไหม — ใช้เตือน/ปิดปุ่มยืนยันไม่ให้จองชนคิว
function overlapsBlock(block: ScheduleBlock, startAt: string, duration: number): boolean {
  if (!startAt) return false
  const start = new Date(`${startAt}:00`)
  const end = new Date(start.getTime() + duration * 60000)
  const blockStart = new Date(block.start_at)
  const blockEnd = new Date(block.end_at)
  if ([start, end, blockStart, blockEnd].some((d) => Number.isNaN(d.getTime()))) return false
  return start < blockEnd && end > blockStart
}

// Modal ยืนยันอนุมัตินัด (ใช้โดย CRO) — เลือกหมอ + วัน-เวลา + ระยะเวลา, เตือน/ปิดปุ่มถ้าชนช่วงที่หมอไม่ว่าง
// และบังคับยืนยันตัวตนคนไข้เมื่อเบอร์โทรตรงกับหลายเวชระเบียน (ห้าม merge จากเบอร์อย่างเดียว)
export function ApproveModal({ booking, open, onClose, onApproved, defaultDoctorId }: ApproveModalProps) {
  const { t } = useTranslation()
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
      setDoctorId(booking?.assigned_doctor_id ?? defaultDoctorId ?? '')
      setPatientChoice(null)
    }
  }, [open, booking, defaultDoctorId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!booking) return
    if (doctorId === '') {
      toast.show('error', t('approveModal.selectPatientDoctorRequired'))
      return
    }
    if (blockConflict) {
      toast.show('error', t('approveModal.doctorUnavailableSlot'))
      return
    }
    if (patientUnresolved) {
      toast.show('error', t('approveModal.confirmPatientIdentityRequired'))
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
      toast.show('success', t('approveModal.approveSuccess', { name: booking.patient_name ?? '' }))
      onApproved()
      onClose()
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : t('approveModal.approveFailed')
      toast.show('error', msg)
    }
  }

  return (
    <Modal open={open} title={t('approveModal.title')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('approveModal.patient')}</p>
          <p className="mt-1 text-base font-semibold text-bbh-ink">
            {booking?.patient_name ?? '-'}
          </p>
          {booking?.requested_datetime_text ? (
            <p className="text-xs text-bbh-muted">
              {t('approveModal.requestedByCustomer')} <span className="font-mono tabular-nums">{booking.requested_datetime_text}</span>
            </p>
          ) : null}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">{t('approveModal.appointmentDateTime')}</span>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className={`mt-1.5 ${FIELD_CLASS}`}
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">{t('approveModal.durationMinutes')}</span>
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
          <span className="text-sm font-medium text-bbh-ink">{t('approveModal.patientDoctor')}</span>
          <select
            value={doctorId}
            onChange={(event) => setDoctorId(event.target.value === '' ? '' : Number(event.target.value))}
            className={`mt-1.5 ${FIELD_CLASS}`}
            required
          >
            <option value="">{t('approveModal.selectDoctorPlaceholder')}</option>
            {(doctorsQ.data?.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}{d.specialty ? ` (${d.specialty})` : ''}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs leading-relaxed text-bbh-muted">
            {t('approveModal.doctorEmailNote')}
          </span>
        </label>

        {hasCandidates ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-amber-900">{t('approveModal.matchExistingPatientTitle')}</p>
            <p className="mt-0.5 text-xs text-amber-800">
              {t('approveModal.matchExistingPatientHint')}
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
                    {c.hn ? <span className="font-mono text-xs text-bbh-muted"> · {t('approveModal.hn', { hn: c.hn })}</span> : null}
                    {c.phone ? <span className="text-xs text-bbh-muted"> · {c.phone}</span> : null}
                    {c.latest_visit_at ? (
                      <span className="block text-[11px] text-bbh-muted">
                        {t('approveModal.lastVisit', { date: new Date(c.latest_visit_at).toLocaleDateString(dateLocale()) })}
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
                <span className="text-sm font-medium text-bbh-ink">{t('approveModal.newPatientOption')}</span>
              </label>
            </div>
          </div>
        ) : null}

        {blockConflict ? (
          <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <p className="font-semibold text-bbh-ink">{t('approveModal.doctorUnavailableSlotTitle')}</p>
            <p className="mt-1 font-mono tabular-nums">{formatBlockRange(blockConflict)} · {blockTypeLabel(blockConflict.block_type, t)}</p>
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
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={approve.isPending || !!blockConflict || patientUnresolved}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {blockConflict
              ? t('approveModal.doctorUnavailable')
              : patientUnresolved
                ? t('approveModal.confirmPatientFirst')
                : approve.isPending
                  ? t('approveModal.confirming')
                  : t('approveModal.confirmAppointment')}
          </button>
        </div>
      </form>
    </Modal>
  )
}