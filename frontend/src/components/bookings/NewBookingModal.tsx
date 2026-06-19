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
    <Modal open={open} title="จองใหม่" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">ชื่อคนไข้</span>
          <input
            value={patientName}
            onChange={(event) => setPatientName(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">เบอร์โทร</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">วันเวลา</span>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(event) => setDateTime(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">Source</span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as BookingSource)}
            className="mt-2 h-12 w-full rounded-2xl border border-bbh-line bg-white px-4 text-base outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
          >
            {SOURCE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">อาการ</span>
          <textarea
            value={symptom}
            onChange={(event) => setSymptom(event.target.value)}
            rows={4}
            maxLength={1000}
            className="mt-2 w-full rounded-2xl border border-bbh-line bg-white px-4 py-3 text-base outline-none focus:border-bbh-green focus:ring-4 focus:ring-bbh-green/10"
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={createBooking.isPending}
            className="rounded-xl border border-bbh-line px-4 py-2 text-sm font-medium text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={createBooking.isPending}
            className="rounded-xl bg-bbh-green px-5 py-2 text-sm font-semibold text-white transition hover:bg-bbh-green-dark disabled:opacity-60"
          >
            {createBooking.isPending ? 'กำลังสร้าง...' : 'สร้างคำขอจอง'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
