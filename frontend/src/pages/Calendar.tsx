import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

import { RescheduleModal } from '../components/bookings/RescheduleModal'
import { SourceBadge } from '../components/SourceBadge'
import { StatusBadge } from '../components/StatusBadge'
import { useAllBookings } from '../hooks/useAllBookings'
import { useCancelBooking } from '../hooks/useCancelBooking'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import type { CalendarEvent } from '../hooks/useCalendarEvents'
import { useRescheduledMarks } from '../hooks/useRescheduledMarks'
import { useToast } from '../hooks/useToast'
import type { components } from '../lib/api-types'

type BookingItem = components['schemas']['BookingListItem']
type BookingStatus = BookingItem['status']

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]
const WEEKDAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

const STATUS_FILTER_ITEMS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'approved', label: 'ยืนยัน' },
  { key: 'pending_approval', label: 'รอ' },
  { key: 'cancelled', label: 'ยกเลิก' },
  { key: 'rejected', label: 'ปฏิเสธ' },
]

const APPT_TYPE_LABELS: Record<string, string> = {
  new: 'ใหม่',
  followup: 'ติดตาม',
  procedure: 'หัตถการ',
  consult: 'ปรึกษา',
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonthFor(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function parseBookingDate(text: string | null | undefined): string | null {
  if (!text) return null
  const slash = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (slash) {
    const day = slash[1].padStart(2, '0')
    const month = slash[2].padStart(2, '0')
    let year = slash[3] ? Number(slash[3]) : new Date().getFullYear()
    if (year < 100) year += 2000
    return `${year}-${month}-${day}`
  }
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
}

function parseBookingTime(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function eventDateKey(event: CalendarEvent): string | null {
  if (event.all_day) return event.start.slice(0, 10)
  const date = new Date(event.start)
  if (Number.isNaN(date.getTime())) return null
  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate())
}

function eventTimeLabel(event: CalendarEvent): string {
  if (event.all_day) return 'ทั้งวัน'
  const date = new Date(event.start)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function parseBbhCalendarEvent(event: CalendarEvent) {
  const summaryName = event.summary
    .replace(/^BBH\s*[—-]\s*/i, '')
    .replace(/^\[OPD\]\s*/i, '')
    .split(' - ')[0]
    ?.trim()
  const desc = event.description ?? ''
  const patient = desc.match(/(?:ผู้ป่วย|ชื่อ):\s*([^\n]+)/)?.[1]?.trim()
  const phone = desc.match(/(?:เบอร์|เบอร์โทร):\s*([^\n]+)/)?.[1]?.trim()
  const symptom = desc.match(/อาการ:\s*([^\n]+)/)?.[1]?.trim()
  const requestUid = desc.match(/Request UID:\s*([^\n]+)/i)?.[1]?.trim()
  return {
    patientName: patient || summaryName || event.summary,
    phone,
    symptom,
    requestUid,
  }
}

function formatThaiDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay()
  return `วัน${THAI_WEEKDAYS[weekday]}ที่ ${d} ${THAI_MONTHS[m - 1]} ${y}`
}

function mapByDate<T>(items: T[], getDate: (item: T) => string | null): Record<string, T[]> {
  const map: Record<string, T[]> = {}
  for (const item of items) {
    const date = getDate(item)
    if (!date) continue
    if (!map[date]) map[date] = []
    map[date].push(item)
  }
  return map
}

export function Calendar() {
  const cancelBooking = useCancelBooking()
  const toast = useToast()
  const qc = useQueryClient()
  const now = new Date()
  const [monthStart, setMonthStart] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  )
  const [selectedDate, setSelectedDate] = useState<string | null>(
    () => toDateKey(now.getFullYear(), now.getMonth(), now.getDate()),
  )
  const [panelFilter, setPanelFilter] = useState<BookingStatus | 'all'>('all')
  const [rescheduleTarget, setRescheduleTarget] = useState<{
    uid: string; currentText: string | null
  } | null>(null)

  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeStart = useMemo(() => new Date(year, month, 1).toISOString(), [year, month])
  const rangeEnd = useMemo(() => new Date(year, month + 1, 1).toISOString(), [year, month])

  const approvedQ = useAllBookings('approved')
  const pendingQ = useAllBookings('pending_approval')
  const cancelledQ = useAllBookings('cancelled')
  const rejectedQ = useAllBookings('rejected')
  const googleQ = useCalendarEvents(rangeStart, rangeEnd)
  const monthKey = (d: Date) => toDateKey(d.getFullYear(), d.getMonth(), d.getDate())
  const rescheduledQ = useRescheduledMarks(
    monthKey(new Date(year, month, 1)),
    monthKey(new Date(year, month, daysInMonthFor(year, month))),
  )

  const bookingsByDate = useMemo(() => {
    const all = [
      ...approvedQ.data,
      ...pendingQ.data,
      ...cancelledQ.data,
      ...rejectedQ.data,
    ]
    return mapByDate(all, (booking) => parseBookingDate(booking.requested_datetime_text))
  }, [approvedQ.data, pendingQ.data, cancelledQ.data, rejectedQ.data])

  const googleByDate = useMemo(
    () => mapByDate(googleQ.data?.data ?? [], eventDateKey),
    [googleQ.data],
  )

  const rescheduledByDate = useMemo(
    () => mapByDate(rescheduledQ.data ?? [], (m) => m.display_date),
    [rescheduledQ.data],
  )

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = monthStart.getDay()
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const rawSelected = selectedDate ? bookingsByDate[selectedDate] ?? [] : []
  const selectedGoogle = selectedDate ? googleByDate[selectedDate] ?? [] : []
  const filteredSelected = (
    panelFilter === 'all' ? rawSelected : rawSelected.filter((b) => b.status === panelFilter)
  ).sort((a, b) => {
    const tA = parseBookingTime(a.requested_datetime_text) ?? '99:99'
    const tB = parseBookingTime(b.requested_datetime_text) ?? '99:99'
    return tA.localeCompare(tB)
  })

  const isLoading =
    approvedQ.isLoading ||
    pendingQ.isLoading ||
    cancelledQ.isLoading ||
    rejectedQ.isLoading ||
    googleQ.isLoading
  const totalCount =
    approvedQ.total +
    pendingQ.total +
    cancelledQ.total +
    rejectedQ.total +
    (googleQ.data?.data.length ?? 0)

  function prevMonth() {
    setMonthStart(new Date(year, month - 1, 1))
  }

  function nextMonth() {
    setMonthStart(new Date(year, month + 1, 1))
  }

  function goToday() {
    const t = new Date()
    setMonthStart(new Date(t.getFullYear(), t.getMonth(), 1))
    setSelectedDate(toDateKey(t.getFullYear(), t.getMonth(), t.getDate()))
  }

  async function handleCancelBooking(uid: string, patientName?: string | null) {
    const ok = window.confirm(`ยืนยันยกเลิกนัดของ ${patientName || 'คนไข้'} ใช่ไหม?`)
    if (!ok) return
    try {
      await cancelBooking.mutateAsync({ uid, reason: 'Cancelled by CRO from calendar' })
      toast.show('success', 'ยกเลิกนัดเรียบร้อยแล้ว')
    } catch {
      toast.show('error', 'ยกเลิกนัดไม่สำเร็จ')
    }
  }

  return (
    <div className="relative flex h-full min-w-0 overflow-hidden lg:static">
      <section className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={prevMonth} className="grid h-10 w-10 place-items-center rounded-xl border border-bbh-line text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green" aria-label="เดือนก่อนหน้า">
            <ChevronLeft size={18} />
          </button>
          <h2 className="min-w-[160px] flex-1 text-center font-serif text-xl font-semibold text-bbh-ink md:text-2xl sm:flex-none md:text-xl">
            {THAI_MONTHS[month]} {year}
          </h2>
          <button type="button" onClick={nextMonth} className="grid h-10 w-10 place-items-center rounded-xl border border-bbh-line text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green" aria-label="เดือนถัดไป">
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={goToday} className="rounded-xl border border-bbh-line px-3 py-2 text-sm font-medium text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green">
            วันนี้
          </button>
          <span className="ml-0 w-full text-xs text-bbh-muted sm:ml-auto sm:w-auto">
            {isLoading ? <span className="animate-pulse">กำลังโหลด...</span> : `${totalCount} นัดทั้งหมด`}
          </span>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="min-w-[640px] md:min-w-0">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-semibold tracking-wide text-bbh-muted">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="h-16 rounded-xl" />

            const dk = toDateKey(year, month, day)
            const isToday = dk === todayKey
            const isSelected = dk === selectedDate
            const items = bookingsByDate[dk] ?? []
            const googleItems = googleByDate[dk] ?? []
            const rescheduledItems = rescheduledByDate[dk] ?? []
            const approvedCnt = items.filter((b) => b.status === 'approved').length
            const pendingCnt = items.filter((b) => b.status === 'pending_approval').length
            const cancelledCnt = items.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length
            const rescheduledCnt = rescheduledItems.length

            return (
              <button
                key={dk}
                type="button"
                onClick={() => setSelectedDate(isSelected ? null : dk)}
                className={`flex h-16 flex-col items-start rounded-xl border p-1.5 transition ${
                  isSelected
                    ? 'border-bbh-green bg-bbh-green-soft ring-2 ring-bbh-green/20'
                    : isToday
                    ? 'border-bbh-green/50 bg-white'
                    : 'border-bbh-line bg-white hover:border-bbh-green/40 hover:bg-bbh-surface'
                }`}
              >
                <span className={`text-sm font-semibold leading-none ${isSelected ? 'text-bbh-green-dark' : isToday ? 'text-bbh-green' : 'text-bbh-ink'}`}>
                  {day}
                </span>
                <div className="mt-auto flex w-full flex-col gap-0.5">
                  {approvedCnt > 0 && <span className="truncate rounded bg-bbh-green-soft px-1 text-[10px] font-medium leading-tight text-bbh-green-dark">{approvedCnt} ยืนยัน</span>}
                  {pendingCnt > 0 && <span className="truncate rounded bg-amber-50 px-1 text-[10px] font-medium leading-tight text-amber-700">{pendingCnt} รอ</span>}
                  {rescheduledCnt > 0 && <span className="truncate rounded bg-slate-200 px-1 text-[10px] font-medium leading-tight text-slate-700">{rescheduledCnt} เลื่อนนัด</span>}
                  {cancelledCnt > 0 && <span className="truncate rounded bg-gray-100 px-1 text-[10px] font-medium leading-tight text-gray-500">{cancelledCnt} ยกเลิก</span>}
                  {googleItems.length > 0 && <span className="truncate rounded bg-sky-50 px-1 text-[10px] font-medium leading-tight text-sky-700">{googleItems.length} นัด</span>}
                </div>
              </button>
            )
          })}
        </div>

          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-bbh-muted">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border border-bbh-green/30 bg-bbh-green-soft" />ยืนยันแล้ว</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border border-amber-200 bg-amber-50" />รอยืนยัน</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border border-slate-300 bg-slate-200" />เลื่อนนัด (รอเวลาใหม่)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border border-gray-200 bg-gray-100" />ยกเลิก / ปฏิเสธ</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border border-sky-200 bg-sky-50" />นัดในปฏิทิน</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border-2 border-bbh-green/50 bg-white" />วันนี้</span>
        </div>
      </section>

      {selectedDate ? (
        <button
          type="button"
          aria-label="ปิดรายละเอียดนัดหมาย"
          onClick={() => setSelectedDate(null)}
          className="fixed inset-0 z-30 bg-bbh-ink/35 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside className={`${selectedDate ? 'fixed inset-x-0 bottom-0 z-40 block max-h-[82vh] rounded-t-[28px] shadow-2xl shadow-bbh-ink/20' : 'hidden'} overflow-y-auto border-bbh-line bg-white p-4 md:p-6 lg:static lg:block lg:h-full lg:w-[400px] lg:rounded-none lg:border-l lg:shadow-none`}>
        <div className="mb-4 flex items-center justify-end lg:hidden">
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-bbh-line text-bbh-muted"
            aria-label="ปิดรายละเอียดนัดหมาย"
          >
            <X size={18} />
          </button>
        </div>
        {!selectedDate ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-bbh-muted">
            เลือกวันเพื่อดูนัดหมาย
          </div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.2em] text-bbh-muted">นัดหมาย</p>
              <p className="mt-1 font-serif text-xl font-semibold text-bbh-ink">
                {formatThaiDate(selectedDate)}
              </p>
              <p className="mt-0.5 text-sm text-bbh-muted">
                {rawSelected.length + selectedGoogle.length === 0 ? 'ไม่มีนัดหมาย' : `${rawSelected.length + selectedGoogle.length} นัดหมาย`}
              </p>
            </div>

            {rawSelected.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {STATUS_FILTER_ITEMS.map(({ key, label }) => {
                  const count = key === 'all' ? rawSelected.length : rawSelected.filter((b) => b.status === key).length
                  if (key !== 'all' && count === 0) return null
                  const active = panelFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPanelFilter(key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        active ? 'bg-bbh-green text-white' : 'border border-bbh-line text-bbh-muted hover:border-bbh-green hover:text-bbh-green'
                      }`}
                    >
                      {label} {count > 0 && <span className="ml-0.5 opacity-70">({count})</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-bbh-surface" />)}
              </div>
            ) : filteredSelected.length === 0 && selectedGoogle.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-bbh-line p-10 text-center">
                <p className="text-sm text-bbh-muted">ยังไม่มีนัดหมายในวันนี้</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSelected.map((b) => {
                  const time = parseBookingTime(b.requested_datetime_text)
                  const dimmed = b.status === 'cancelled' || b.status === 'rejected' || b.status === 'expired'
                  return (
                    <div key={b.request_uid} className={`group rounded-2xl border p-4 transition ${dimmed ? 'border-bbh-line bg-bbh-surface opacity-60' : 'border-bbh-line bg-white hover:border-bbh-green/30 hover:shadow-sm'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-bbh-ink">{b.patient_name ?? '-'}</p>
                          <p className="mt-0.5 text-xs text-bbh-muted">{b.phone ?? '-'}</p>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {time && <span className="font-semibold text-bbh-ink">{time} น.</span>}
                        <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-bbh-muted">{APPT_TYPE_LABELS[b.appointment_type] ?? b.appointment_type}</span>
                        <SourceBadge source={b.booking_source} />
                      </div>
                      {b.symptom && <p className="mt-2 line-clamp-2 text-xs text-bbh-muted">{b.symptom}</p>}
                      {b.status === 'approved' ? (
                        <div className="grid grid-cols-2 gap-2 overflow-hidden transition-all duration-200 lg:max-h-0 lg:opacity-0 lg:group-hover:mt-3 lg:group-hover:max-h-16 lg:group-hover:opacity-100 lg:group-focus-within:mt-3 lg:group-focus-within:max-h-16 lg:group-focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => setRescheduleTarget({ uid: b.request_uid, currentText: b.requested_datetime_text })}
                            className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-xs font-semibold text-bbh-ink transition hover:border-bbh-green hover:text-bbh-green-dark"
                          >
                            เลื่อนนัด
                          </button>
                          <button
                            type="button"
                            disabled={cancelBooking.isPending}
                            onClick={() => void handleCancelBooking(b.request_uid, b.patient_name)}
                            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                          >
                            ยกเลิกนัด
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}

                {selectedGoogle.map((event) => {
                  const info = parseBbhCalendarEvent(event)
                  return (
                    <div
                      key={event.id}
                      className="group rounded-2xl border border-sky-100 bg-sky-50 p-4 transition hover:border-sky-300 hover:bg-sky-100/70"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-bbh-ink">{info.patientName}</p>
                          <p className="mt-0.5 text-xs font-semibold text-sky-700">{eventTimeLabel(event)} น.</p>
                        </div>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-700">ปฏิทิน</span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-bbh-muted">
                        {info.phone ? <p><span className="font-semibold text-bbh-ink">เบอร์:</span> {info.phone}</p> : null}
                        {info.symptom ? <p><span className="font-semibold text-bbh-ink">อาการ:</span> {info.symptom}</p> : null}
                        {info.requestUid ? <p className="truncate text-[11px] text-bbh-muted/80">รหัสคำขอ: {info.requestUid}</p> : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 overflow-hidden transition-all duration-200 lg:max-h-0 lg:opacity-0 lg:group-hover:mt-3 lg:group-hover:max-h-16 lg:group-hover:opacity-100 lg:group-focus-within:mt-3 lg:group-focus-within:max-h-16 lg:group-focus-within:opacity-100">
                        <a
                          href={event.html_link ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-center text-xs font-semibold text-sky-700 transition hover:bg-sky-50"
                        >
                          เปิดปฏิทิน
                        </a>
                        {info.requestUid ? (
                          <button
                            type="button"
                            disabled={cancelBooking.isPending}
                            onClick={() => void handleCancelBooking(info.requestUid!, info.patientName)}
                            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                          >
                            ยกเลิกนัด
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </aside>

      <RescheduleModal
        open={rescheduleTarget !== null}
        uid={rescheduleTarget?.uid ?? null}
        currentDateTimeText={rescheduleTarget?.currentText ?? null}
        onClose={() => setRescheduleTarget(null)}
        onSuccess={() => {
          void qc.invalidateQueries({ queryKey: ['bookings-all'] })
          void qc.invalidateQueries({ queryKey: ['calendar-events'] })
          void qc.invalidateQueries({ queryKey: ['rescheduled-marks'] })
          toast.show('success', 'เลื่อนนัดสำเร็จ')
        }}
      />
    </div>
  )
}
