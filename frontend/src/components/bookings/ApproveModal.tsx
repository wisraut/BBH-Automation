import { useEffect, useState } from 'react'
import { dateLocale } from '../../i18n/datetime'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '../Modal'
import { useToast } from '../../hooks/useToast'
import { useApproveBooking } from '../../hooks/useApproveBooking'
import type { BookingOut } from '../../hooks/useBooking'
import { useDoctors } from '../../hooks/useDoctors'
import { usePatient } from '../../hooks/usePatient'
import { useScheduleBlocks, type ScheduleBlock } from '../../hooks/useScheduleBlocks'
import { ApiError } from '../../lib/api'
import type { ApproveRequest } from '../../hooks/useApproveBooking'
import {
  PatientIntakeFields,
  EMPTY_INTAKE,
  isIntakeComplete,
  missingIntakeKeys,
  INTAKE_LABEL_KEY,
  type IntakeForm,
} from './PatientIntakeFields'
import { Eyebrow } from '../ui/Eyebrow'
import { ModalActions } from '../ui/ModalActions'

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
  // Patient intake the CRO must complete before confirming.
  const [intake, setIntake] = useState<IntakeForm>(EMPTY_INTAKE)
  // Turns empty required fields red once the CRO tries to confirm early.
  const [showErrors, setShowErrors] = useState(false)
  const approve = useApproveBooking()
  // When linking an existing chart, pull its saved details so the CRO reviews
  // rather than re-types (returning patients).
  const linkedId = typeof patientChoice === 'number' ? patientChoice : null
  const linkedQ = usePatient(linkedId)
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
      setShowErrors(false)
      // Seed the intake with what the booking already carries; the CRO fills the rest.
      setIntake({ ...EMPTY_INTAKE, display_name: booking?.patient_name ?? '', phone: booking?.phone ?? '' })
    }
  }, [open, booking, defaultDoctorId])

  // Prefill the intake from the linked chart (review-and-edit, not re-entry).
  const linked = linkedQ.data
  useEffect(() => {
    if (!linked) return
    setIntake((prev) => ({
      ...prev,
      display_name: linked.display_name ?? prev.display_name,
      gender: linked.gender ?? prev.gender,
      dob: linked.dob ?? prev.dob,
      national_id: linked.national_id ?? prev.national_id,
      blood_type: linked.blood_type ?? prev.blood_type,
      phone: linked.phone ?? prev.phone,
      phone2: linked.phone2 ?? prev.phone2,
      phone3: linked.phone3 ?? prev.phone3,
      phone4: linked.phone4 ?? prev.phone4,
      email: linked.email ?? prev.email,
      address: linked.address ?? prev.address,
      english_name: linked.english_name ?? prev.english_name,
      religion: linked.religion ?? prev.religion,
      marital_status: linked.marital_status ?? prev.marital_status,
      occupation: linked.occupation ?? prev.occupation,
      father_name: linked.father_name ?? prev.father_name,
      father_phone: linked.father_phone ?? prev.father_phone,
      mother_name: linked.mother_name ?? prev.mother_name,
      mother_phone: linked.mother_phone ?? prev.mother_phone,
      emergency_contact_name: linked.emergency_contact_name ?? prev.emergency_contact_name,
      emergency_contact_relation: linked.emergency_contact_relation ?? prev.emergency_contact_relation,
      emergency_contact_phone: linked.emergency_contact_phone ?? prev.emergency_contact_phone,
      emergency_contact_address: linked.emergency_contact_address ?? prev.emergency_contact_address,
      past_illness: linked.past_illness ?? prev.past_illness,
      congenital_disease: linked.congenital_disease ?? prev.congenital_disease,
      drugs_supplements: linked.drugs_supplements ?? prev.drugs_supplements,
      drug_allergy: linked.drug_allergy ?? prev.drug_allergy,
      food_allergy: linked.food_allergy ?? prev.food_allergy,
      smoking: linked.smoking == null ? prev.smoking : linked.smoking ? 'yes' : 'no',
      smoking_years: linked.smoking_years != null ? String(linked.smoking_years) : prev.smoking_years,
      drinking: linked.drinking == null ? prev.drinking : linked.drinking ? 'yes' : 'no',
      drinking_years: linked.drinking_years != null ? String(linked.drinking_years) : prev.drinking_years,
    }))
  }, [linked])

  const intakeComplete = isIntakeComplete(intake)
  const missingKeys = missingIntakeKeys(intake)

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
    if (!intakeComplete) {
      setShowErrors(true)
      toast.show('error', t('intake.incompleteError'))
      return
    }
    // Send only the filled fields — empty date/gender would fail validation, and
    // blank optionals must not overwrite existing chart data on the backend.
    const flagKeys = ['smoking', 'smoking_years', 'drinking', 'drinking_years']
    const patientIntake: Record<string, unknown> = Object.fromEntries(
      Object.entries(intake)
        .filter(([k]) => !flagKeys.includes(k))
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v !== ''),
    )
    // smoking/drinking are a tri-state picker: '' omitted, 'no'->false, 'yes'->true;
    // years only when 'yes'. (Bool/int, so they can't go through the string trim above.)
    if (intake.smoking) patientIntake.smoking = intake.smoking === 'yes'
    if (intake.smoking === 'yes' && intake.smoking_years) patientIntake.smoking_years = Number(intake.smoking_years)
    if (intake.drinking) patientIntake.drinking = intake.drinking === 'yes'
    if (intake.drinking === 'yes' && intake.drinking_years) patientIntake.drinking_years = Number(intake.drinking_years)
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
          patient_intake: patientIntake as ApproveRequest['patient_intake'],
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
          <Eyebrow>{t('approveModal.patient')}</Eyebrow>
          <p className="mt-1 text-base font-semibold text-bbh-ink">
            {booking?.patient_name ?? '-'}
          </p>
          {booking?.requested_datetime_text ? (
            <p className="text-xs text-bbh-muted">
              {t('approveModal.requestedByCustomer')} <span className="font-mono tabular-nums">{booking.requested_datetime_text}</span>
            </p>
          ) : null}
        </div>

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
                      <span className="block text-xs text-bbh-muted">
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

        <PatientIntakeFields value={intake} onChange={setIntake} showErrors={showErrors} />

        <div className="space-y-4 border-t border-bbh-line pt-4">
          <Eyebrow>{t('approveModal.scheduleSection')}</Eyebrow>

          <label className="block">
            <span className="text-sm font-medium text-bbh-ink">{t('approveModal.appointmentDateTime')}</span>
            <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className={`mt-1.5 ${FIELD_CLASS}`} required />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-bbh-ink">{t('approveModal.durationMinutes')}</span>
            <input type="number" min={15} max={240} step={15} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className={`mt-1.5 ${FIELD_CLASS}`} required />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-bbh-ink">{t('approveModal.patientDoctor')}</span>
            <select value={doctorId} onChange={(event) => setDoctorId(event.target.value === '' ? '' : Number(event.target.value))} className={`mt-1.5 ${FIELD_CLASS}`} required>
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

          {blockConflict ? (
            <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <p className="font-semibold text-bbh-ink">{t('approveModal.doctorUnavailableSlotTitle')}</p>
              <p className="mt-1 font-mono tabular-nums">{formatBlockRange(blockConflict)} · {blockTypeLabel(blockConflict.block_type, t)}</p>
              {blockConflict.reason ? <p className="mt-1 text-bbh-muted">{blockConflict.reason}</p> : null}
            </div>
          ) : null}
        </div>

        {/* Missing-required transparency, right where the eye lands before the
            confirm button — so the CRO sees exactly what's left, not a mystery
            disabled button. */}
        {showErrors && missingKeys.length > 0 ? (
          <p className="text-xs font-medium text-red-600">
            {t('intake.missingPrefix')}: {missingKeys.map((k) => t(INTAKE_LABEL_KEY[k])).join(', ')}
          </p>
        ) : null}

        <ModalActions>
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
            disabled={approve.isPending || !!blockConflict}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {blockConflict
              ? t('approveModal.doctorUnavailable')
              : approve.isPending
                ? t('approveModal.confirming')
                : t('approveModal.confirmAppointment')}
          </button>
        </ModalActions>
      </form>
    </Modal>
  )
}