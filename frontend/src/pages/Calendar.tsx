import { useMemo, useState } from 'react'

import { SourceBadge } from '../components/SourceBadge'
import { StatusBadge } from '../components/StatusBadge'
import { useAllBookings } from '../hooks/useAllBookings'
import type { components } from '../lib/api-types'

type BookingItem = components['schemas']['BookingListItem']
type BookingStatus = BookingItem['status']

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const THAI_MONTH_MAP: Record<string, string> = {
  มกราคม: '01', กุมภาพันธ์: '02', มีนาคม: '03', เมษายน: '04',
  พฤษภาคม: '05', มิถุนายน: '06', กรกฎาคม: '07', สิงหาคม: '08',
  กันยายน: '09', ตุลาคม: '10', พฤศจิกายน: '11', ธันวาคม: '12',
}

const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const WEEKDAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const APPT_TYPE_LABELS: Record<string, string> = {
  new: 'ใหม่',
  followup: 'ติดตาม',
  procedure: 'หัตถการ',
  consult: 'ปรึกษา',
}

const STATUS_FILTER_ITEMS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'approved', label: 'ยืนยัน' },
  { key: 'pending_approval', label: 'รอ' },
  { key: 'cancelled', label: 'ยกเลิก' },
  { key: 'rejected', label: 'ปฏิเสธ' },
]

function parseDateFromText(text: string): string | null {
  const match = text.match(
    /ที่\s*(\d+)\s*(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{4})/
  )
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = THAI_MONTH_MAP[match[2]]
  const year = match[3]
  return `${year}-${month}-${day}`
}

function parseTimeFromText(text: string): string | null {
  const match = text.match(/เวลา\s*(\d{1,2}):(\d{2})/)
  if (!match) return null
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatThaiDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay()
  return `วัน${THAI_WEEKDAYS[weekday]}ที่ ${d} ${THAI_MONTHS[m - 1]} ${y}`
}

export function Calendar() {
  const now = new Date()
  const [monthStart, setMonthStart] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1)
  )
  const [selectedDate, setSelectedDate] = useState<string | null>(
    () => toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  )
  const [panelFilter, setPanelFilter] = useState<BookingStatus | 'all'>('all')

  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())

  const approvedQ   = useAllBookings('approved')
  const pendingQ    = useAllBookings('pending_approval')
  const cancelledQ  = useAllBookings('cancelled')
  const rejectedQ   = useAllBookings('rejected')

  const bookingsByDate = useMemo(() => {
    const map: Record<string, BookingItem[]> = {}
    const all = [
      ...approvedQ.data,
      ...pendingQ.data,
      ...cancelledQ.data,
      ...rejectedQ.data,
    ]
    for (const b of all) {
      if (!b.requested_datetime_text) continue
      const date = parseDateFromText(b.requested_datetime_text)
      if (!date) continue
      if (!map[date]) map[date] = []
      map[date].push(b)
    }
    return map
  }, [approvedQ.data, pendingQ.data, cancelledQ.data, rejectedQ.data])

  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = monthStart.getDay()

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  function prevMonth() { setMonthStart(new Date(year, month - 1, 1)) }
  function nextMonth() { setMonthStart(new Date(year, month + 1, 1)) }
  function goToday() {
    const t = new Date()
    setMonthStart(new Date(t.getFullYear(), t.getMonth(), 1))
    setSelectedDate(toDateKey(t.getFullYear(), t.getMonth(), t.getDate()))
  }

  const rawSelected = selectedDate ? (bookingsByDate[selectedDate] ?? []) : []
  const filteredSelected = (
    panelFilter === 'all'
      ? rawSelected
      : rawSelected.filter((b) => b.status === panelFilter)
  ).sort((a, b) => {
    const tA = parseTimeFromText(a.requested_datetime_text ?? '') ?? '99:99'
    const tB = parseTimeFromText(b.requested_datetime_text ?? '') ?? '99:99'
    return tA.localeCompare(tB)
  })

  const isLoading = approvedQ.isLoading || pendingQ.isLoading || cancelledQ.isLoading || rejectedQ.isLoading
  const totalCount = approvedQ.total + pendingQ.total + cancelledQ.total + rejectedQ.total

  return (
    <div className="flex h-full">

      {/* ─── Calendar grid ─── */}
      <section className="flex-1 overflow-y-auto p-8">

        {/* Month navigation */}
        <div className="mb-5 flex items-center gap-2">
          <button type="button" onClick={prevMonth}
            className="rounded-xl border border-bbh-line px-3 py-1.5 text-sm font-medium text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green">
            ←
          </button>
          <h2 className="min-w-[180px] text-center font-serif text-xl font-semibold text-bbh-ink">
            {THAI_MONTHS[month]} {year}
          </h2>
          <button type="button" onClick={nextMonth}
            className="rounded-xl border border-bbh-line px-3 py-1.5 text-sm font-medium text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green">
            →
          </button>
          <button type="button" onClick={goToday}
            className="ml-1 rounded-xl border border-bbh-line px-3 py-1.5 text-sm font-medium text-bbh-muted transition hover:border-bbh-green hover:text-bbh-green">
            วันนี้
          </button>
          <span className="ml-auto text-xs text-bbh-muted">
            {isLoading
              ? <span className="animate-pulse">กำลังโหลด...</span>
              : `${totalCount} นัดทั้งหมด`}
          </span>
        </div>

        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-semibold tracking-wide text-bbh-muted">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="h-16 rounded-xl" />

            const dk = toDateKey(year, month, day)
            const isToday    = dk === todayKey
            const isSelected = dk === selectedDate
            const items = bookingsByDate[dk] ?? []

            const approvedCnt  = items.filter((b) => b.status === 'approved').length
            const pendingCnt   = items.filter((b) => b.status === 'pending_approval').length
            const cancelledCnt = items.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length

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
                <span className={`text-sm font-semibold leading-none ${
                  isSelected ? 'text-bbh-green-dark' : isToday ? 'text-bbh-green' : 'text-bbh-ink'
                }`}>
                  {day}
                </span>
                <div className="mt-auto flex w-full flex-col gap-0.5">
                  {approvedCnt > 0 && (
                    <span className="truncate rounded px-1 text-[10px] font-medium leading-tight bg-bbh-green-soft text-bbh-green-dark">
                      {approvedCnt} ยืนยัน
                    </span>
                  )}
                  {pendingCnt > 0 && (
                    <span className="truncate rounded px-1 text-[10px] font-medium leading-tight bg-amber-50 text-amber-700">
                      {pendingCnt} รอ
                    </span>
                  )}
                  {cancelledCnt > 0 && (
                    <span className="truncate rounded px-1 text-[10px] font-medium leading-tight bg-gray-100 text-gray-500">
                      {cancelledCnt} ยกเลิก
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-bbh-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded border border-bbh-green/30 bg-bbh-green-soft" />
            ยืนยันแล้ว
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded border border-amber-200 bg-amber-50" />
            รอยืนยัน
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded border border-gray-200 bg-gray-100" />
            ยกเลิก / ปฏิเสธ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded border-2 border-bbh-green/50 bg-white" />
            วันนี้
          </span>
        </div>
      </section>

      {/* ─── Day detail panel ─── */}
      <aside className="w-[400px] overflow-y-auto border-l border-bbh-line bg-white p-6">
        {!selectedDate ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-bbh-muted">
            เลือกวันเพื่อดูนัดหมาย
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.18em] text-bbh-muted">นัดหมาย</p>
              <p className="mt-1 font-serif text-xl font-semibold text-bbh-ink">
                {formatThaiDate(selectedDate)}
              </p>
              <p className="mt-0.5 text-sm text-bbh-muted">
                {rawSelected.length === 0 ? 'ไม่มีนัดหมาย' : `${rawSelected.length} นัดหมาย`}
              </p>
            </div>

            {/* Status filter tabs */}
            {rawSelected.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {STATUS_FILTER_ITEMS.map(({ key, label }) => {
                  const count = key === 'all'
                    ? rawSelected.length
                    : rawSelected.filter((b) => b.status === key).length
                  if (key !== 'all' && count === 0) return null
                  const active = panelFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPanelFilter(key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        active
                          ? 'bg-bbh-green text-white'
                          : 'border border-bbh-line text-bbh-muted hover:border-bbh-green hover:text-bbh-green'
                      }`}
                    >
                      {label} {count > 0 && <span className="ml-0.5 opacity-70">({count})</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Booking cards */}
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl bg-bbh-surface" />
                ))}
              </div>
            ) : filteredSelected.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-bbh-line p-10 text-center">
                <p className="text-sm text-bbh-muted">
                  {rawSelected.length === 0 ? 'ยังไม่มีนัดหมายในวันนี้' : 'ไม่มีนัดในหมวดนี้'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSelected.map((b) => {
                  const time = parseTimeFromText(b.requested_datetime_text ?? '')
                  const dimmed = b.status === 'cancelled' || b.status === 'rejected' || b.status === 'expired'
                  return (
                    <div
                      key={b.request_uid}
                      className={`rounded-2xl border p-4 transition ${
                        dimmed
                          ? 'border-bbh-line bg-bbh-surface opacity-60'
                          : 'border-bbh-line bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-bbh-ink">
                            {b.patient_name ?? '-'}
                          </p>
                          <p className="mt-0.5 text-xs text-bbh-muted">{b.phone ?? '-'}</p>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {time && (
                          <span className="font-semibold text-bbh-ink">{time} น.</span>
                        )}
                        <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-bbh-muted">
                          {APPT_TYPE_LABELS[b.appointment_type] ?? b.appointment_type}
                        </span>
                        <SourceBadge source={b.booking_source} />
                      </div>

                      {b.symptom && (
                        <p className="mt-2 line-clamp-2 text-xs text-bbh-muted">{b.symptom}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
