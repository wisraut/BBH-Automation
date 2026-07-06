import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Modal } from '../Modal'
import { useCreateBooking } from '../../hooks/useCreateBooking'
import type { BookingCreateRequest } from '../../hooks/useCreateBooking'
import { useToast } from '../../hooks/useToast'
import { ApiError } from '../../lib/api'

type BookingSource = BookingCreateRequest['booking_source']

interface NewBookingModalProps {
  open: boolean
  onClose: () => void
  onCreated: (requestUid: string) => void
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const FIELD_CLASS =
  'w-full rounded-lg border border-bbh-line px-3 py-2 text-sm transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

const SOURCE_OPTIONS: { value: BookingSource; label: string }[] = [
  { value: 'phone', label: 'โทรศัพท์' },
  { value: 'line', label: 'LINE' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'walkin', label: 'Walk-in' },
]

function defaultDateTime() {
  const next = new Date()
  next.setHours(next.getHours() + 1, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`
}

function splitLocalDateTime(value: string) {
  const [datePart, timePart = ''] = value.split('T')
  return {
    requested_date: datePart,
    requested_time: timePart,
  }
}

export function NewBookingModal({ open, onClose, onCreated }: NewBookingModalProps) {
  const [patientName, setPatientName] = useState('')
  const [phone, setPhone] = useState('')
  const [dateTime, setDateTime] = useState(defaultDateTime())
  const [symptom, setSymptom] = useState('')
  const [source, setSource] = useState<BookingSource>('phone')
  const createBooking = useCreateBooking()
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setPatientName('')
    setPhone('')
    setDateTime(defaultDateTime())
    setSymptom('')
    setSource('phone')
  }, [open])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const requested = splitLocalDateTime(dateTime)

    try {
      const created = await createBooking.mutateAsync({
        patient_name: patientName.trim(),
        phone: phone.trim(),
        requested_date: requested.requested_date,
        requested_time: requested.requested_time,
        symptom: symptom.trim(),
        booking_source: source,
      })
      toast.show('success', `สร้างคำขอจองของ ${patientName.trim()} สำเร็จ`)
      onCreated(created.request_uid)
      onClose()
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'สร้างคำขอจองไม่สำเร็จ'
      toast.show('error', msg)
    }
  }

  return (
    <Modal open={open} title="จองใหม่" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-bbh-ink">ชื่อคนไข้</span>
            <input
              value={patientName}
              onChange={(event) => setPatientName(event.target.value)}
              className={`mt-1.5 ${FIELD_CLASS}`}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-bbh-ink">เบอร์โทร</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={`mt-1.5 ${FIELD_CLASS}`}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-bbh-ink">วันเวลา</span>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(event) => setDateTime(event.target.value)}
              className={`mt-1.5 ${FIELD_CLASS}`}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-bbh-ink">Source</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as BookingSource)}
              className={`mt-1.5 ${FIELD_CLASS}`}
            >
              {SOURCE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">อาการ</span>
          <textarea
            value={symptom}
            onChange={(event) => setSymptom(event.target.value)}
            rows={3}
            maxLength={1000}
            className={`mt-1.5 ${FIELD_CLASS}`}
          />
        </label>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={createBooking.isPending}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={createBooking.isPending}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {createBooking.isPending ? 'กำลังสร้าง...' : 'สร้างคำขอจอง'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
