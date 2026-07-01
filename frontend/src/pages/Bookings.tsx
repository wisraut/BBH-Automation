import { useState } from 'react'
import { AlertTriangle, Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, Loader2, Plus, Stethoscope, X } from 'lucide-react'

import { ApproveModal } from '../components/bookings/ApproveModal'
import { NewBookingModal } from '../components/bookings/NewBookingModal'
import { RejectModal } from '../components/bookings/RejectModal'
import { RescheduleModal } from '../components/bookings/RescheduleModal'
import { SourceBadge } from '../components/SourceBadge'
import { StatusBadge } from '../components/StatusBadge'
import { useAssignDoctor } from '../hooks/useAssignDoctor'
import { useBooking } from '../hooks/useBooking'
import { useBookings } from '../hooks/useBookings'
import type { BookingStatus } from '../hooks/useBookings'
import { useDoctors } from '../hooks/useDoctors'
import { useToast } from '../hooks/useToast'
import { ApiError } from '../lib/api'

const FILTERS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending_approval', label: 'รอยืนยัน' },
  { key: 'approved', label: 'ยืนยันแล้ว' },
  { key: 'no_show', label: 'No-show' },
  { key: 'rejected', label: 'ปฏิเสธ' },
]

const PAGE_LIMIT = 20

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec} วินาทีที่แล้ว`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`
  const day = Math.floor(hr / 24)
  return `${day} วันที่แล้ว`
}

export function Bookings() {
  const [filter, setFilter] = useState<BookingStatus | 'all'>('pending_approval')
  const [page, setPage] = useState(1)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [newBookingOpen, setNewBookingOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)

  const list = useBookings({
    status: filter === 'all' ? undefined : filter,
    page,
    limit: PAGE_LIMIT,
  })
  const detail = useBooking(selectedUid)

  function handleFilter(key: BookingStatus | 'all') {
    setFilter(key)
    setPage(1)
    setSelectedUid(null)
  }

  const totalPages = list.data?.pagination.total_pages ?? 0
  const total = list.data?.pagination.total ?? 0

  return (
    <div className="flex h-full min-w-0 overflow-hidden rounded-2xl bg-white/70 backdrop-blur">
      <section className={`${selectedUid ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col overflow-y-auto bg-gradient-to-br from-white via-white to-bbh-green-soft/30 p-4 md:p-7`}>
        <div className="mb-8 flex flex-wrap items-center gap-2 rounded-2xl border border-bbh-line bg-white/80 p-3 shadow-sm">
          {FILTERS.map((item) => {
            const active = item.key === filter
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleFilter(item.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-bbh-green text-white shadow-md shadow-bbh-green/15'
                    : 'border border-bbh-line bg-white text-bbh-muted hover:border-bbh-green hover:text-bbh-green'
                }`}
              >
                {item.label}
              </button>
            )
          })}
          <span className="ml-0 text-xs text-bbh-muted sm:ml-auto">{total} รายการ</span>
          <button
            type="button"
            onClick={() => setNewBookingOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-bbh-green px-4 py-2 text-sm font-semibold text-white shadow-md shadow-bbh-green/15 transition hover:bg-bbh-green-dark"
          >
            <Plus size={16} /> จองใหม่
          </button>
        </div>

        {list.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-bbh-surface" />
            ))}
          </div>
        ) : null}

        {list.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">โหลดข้อมูลไม่สำเร็จ</p>
            <p className="mt-1 text-xs">
              {list.error instanceof ApiError ? list.error.message : 'กรุณาลองใหม่'}
            </p>
            <button
              type="button"
              onClick={() => void list.refetch()}
              className="mt-2 rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              ลองใหม่
            </button>
          </div>
        ) : null}

        {!list.isLoading && !list.isError && list.data && list.data.data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-bbh-line bg-white p-12 text-center">
            <p className="font-serif text-lg text-bbh-ink">ยังไม่มีรายการในฟิลเตอร์นี้</p>
            <p className="mt-2 text-sm text-bbh-muted">ลองเปลี่ยนฟิลเตอร์ด้านบน</p>
          </div>
        ) : null}

        <div className="space-y-2">
          {list.data?.data.map((row) => {
            const active = row.request_uid === selectedUid
            return (
              <button
                key={row.request_uid}
                type="button"
                onClick={() => setSelectedUid(row.request_uid)}
                className={`flex w-full items-center gap-4 rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition ${
                  active
                    ? 'border-bbh-green shadow-bbh-card ring-4 ring-bbh-green/10'
                    : 'border-bbh-line hover:border-bbh-green/40 hover:shadow-bbh-card'
                }`}
              >
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-bbh-ink">
                      {row.patient_name ?? '-'}
                    </p>
                    <SourceBadge source={row.booking_source} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-bbh-muted">
                    {row.phone ?? '-'} · {row.requested_datetime_text ?? '-'}
                  </p>
                  <p className="mt-1 truncate text-xs text-bbh-muted">
                    {row.symptom ?? '-'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={row.status} />
                  <span className="text-[11px] text-bbh-muted">
                    {formatRelative(row.created_at)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {totalPages > 1 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 rounded-xl border border-bbh-line px-3 py-1.5 font-medium text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green disabled:opacity-40"
            >
              <ChevronLeft size={16} /> ก่อนหน้า
            </button>
            <span className="text-bbh-muted">
              หน้า {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1 rounded-xl border border-bbh-line px-3 py-1.5 font-medium text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green disabled:opacity-40"
            >
              ถัดไป <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </section>

      <aside className={`${selectedUid ? 'block' : 'hidden lg:block'} w-full overflow-y-auto bg-white/95 p-4 md:p-6 lg:w-[420px] lg:border-l lg:border-bbh-line`}>
        {selectedUid ? (
          <button
            type="button"
            onClick={() => setSelectedUid(null)}
            className="mb-4 inline-flex items-center gap-1.5 rounded-xl border border-bbh-line px-3 py-2 text-sm font-semibold text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green lg:hidden"
          >
            <ChevronLeft size={16} />
            กลับไปรายการ
          </button>
        ) : null}
        {!selectedUid ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-bbh-muted">
            <div className="rounded-3xl border border-dashed border-bbh-line bg-bbh-surface px-8 py-10">
              เลือกรายการเพื่อดูรายละเอียด
            </div>
          </div>
        ) : detail.isLoading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-bbh-surface" />
        ) : detail.isError ? (
          <p className="text-sm text-red-700">โหลดรายละเอียดไม่สำเร็จ</p>
        ) : detail.data ? (
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-bbh-muted">คนไข้</p>
              <p className="mt-1 font-serif text-2xl font-semibold text-bbh-ink">
                {detail.data.patient_name ?? '-'}
              </p>
              <p className="text-sm text-bbh-muted">{detail.data.phone ?? '-'}</p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={detail.data.status} />
                <SourceBadge source={detail.data.booking_source} />
              </div>
            </div>

            <div className="rounded-2xl border border-bbh-line p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">
                เวลาที่ลูกค้าขอ
              </p>
              <p className="mt-1 text-sm text-bbh-ink">
                {detail.data.requested_datetime_text ?? '-'}
              </p>
            </div>

            <div className="rounded-2xl border border-bbh-line p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">
                อาการ / รายละเอียด
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-bbh-ink">
                {detail.data.symptom ?? '-'}
              </p>
            </div>

            {detail.data.calendar_event_url ? (
              <a
                href={detail.data.calendar_event_url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-bbh-green/30 bg-bbh-green-soft p-4 text-sm font-medium text-bbh-green-dark hover:bg-bbh-green-soft/70"
              >
                เปิด Google Calendar event ↗
              </a>
            ) : null}

            {detail.data.notes ? (
              <div className="rounded-2xl border border-bbh-line p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">
                  หมายเหตุ
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-bbh-ink">
                  {detail.data.notes}
                </p>
              </div>
            ) : null}

            {detail.data.status === 'pending_approval' ? (
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setApproveOpen(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-bbh-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-bbh-green-dark"
                >
                  <Check size={16} /> ยืนยันนัด
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                >
                  <X size={16} /> ปฏิเสธ
                </button>
              </div>
            ) : null}

            {detail.data.status === 'approved' ? (
              <div className="space-y-3 pt-2">
                {!detail.data.assigned_doctor_id ? (
                  <AssignDoctorInlinePanel uid={detail.data.request_uid} onDone={() => void list.refetch()} />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRescheduleOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-bbh-line bg-white px-4 py-2.5 text-sm font-semibold text-bbh-ink transition-all duration-200 hover:border-bbh-green hover:text-bbh-green-dark"
                  >
                    <CalendarIcon size={16} /> เลื่อนนัด
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      <ApproveModal
        booking={detail.data ?? null}
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onApproved={() => void list.refetch()}
      />
      <RejectModal
        booking={detail.data ?? null}
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onRejected={() => void list.refetch()}
      />
      <RescheduleModal
        open={rescheduleOpen}
        uid={detail.data?.request_uid ?? null}
        currentDateTimeText={detail.data?.requested_datetime_text ?? null}
        onClose={() => setRescheduleOpen(false)}
        onSuccess={() => void list.refetch()}
      />
      <NewBookingModal
        open={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
        onCreated={(requestUid) => {
          setFilter('pending_approval')
          setPage(1)
          setSelectedUid(requestUid)
          void list.refetch()
        }}
      />
    </div>
  )
}

// Inline picker for bookings that were confirmed via LINE (n8n CONFIRM) and
// arrived without a doctor. CRO picks a doctor to complete the assignment;
// email reschedule notifications rely on this being set.
function AssignDoctorInlinePanel({ uid, onDone }: { uid: string; onDone: () => void }) {
  const doctorsQ = useDoctors()
  const assign = useAssignDoctor()
  const toast = useToast()
  const [doctorId, setDoctorId] = useState<number | ''>('')

  async function submit() {
    if (doctorId === '') {
      toast.show('error', 'กรุณาเลือกแพทย์')
      return
    }
    try {
      await assign.mutateAsync({ uid, body: { assigned_doctor_id: Number(doctorId) } })
      toast.show('success', 'บันทึกแพทย์ประจำตัวสำเร็จ')
      onDone()
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ'
      toast.show('error', msg)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">ยังไม่ได้เลือกแพทย์ประจำตัว</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
            การจองนี้ยืนยันผ่าน LINE โดยไม่ได้ระบุแพทย์ กรุณาเลือกแพทย์เพื่อให้ระบบส่งอีเมลแจ้งได้ตอนเลื่อนนัด
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value === '' ? '' : Number(e.target.value))}
          className="min-w-[180px] flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">— เลือกแพทย์ —</option>
          {(doctorsQ.data?.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}{d.specialty ? ` (${d.specialty})` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={assign.isPending || doctorId === ''}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {assign.isPending ? <Loader2 size={14} className="animate-spin" /> : <Stethoscope size={14} />}
          บันทึก
        </button>
      </div>
    </div>
  )
}
