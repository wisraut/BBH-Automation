import { useEffect, useMemo, useState } from 'react'
import { dateLocale } from '../i18n/datetime'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock, Stethoscope, Video, X } from 'lucide-react'

import { ApproveModal } from '../components/bookings/ApproveModal'
import { RescheduleModal } from '../components/bookings/RescheduleModal'
import { SourceBadge } from '../components/SourceBadge'
import { StatusBadge } from '../components/StatusBadge'
import { useAllBookings } from '../hooks/useAllBookings'
import { useBooking } from '../hooks/useBooking'
import { useCancelBooking } from '../hooks/useCancelBooking'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { useDoctors } from '../hooks/useDoctors'
import { useAvailability } from '../hooks/useAvailability'
import { useScheduleBlocks, type ScheduleBlock } from '../hooks/useScheduleBlocks'
import type { CalendarEvent } from '../hooks/useCalendarEvents'
import { useRescheduledMarks } from '../hooks/useRescheduledMarks'
import { useToast } from '../hooks/useToast'
import { useSetVideoLink } from '../hooks/useSetVideoLink'
import type { components } from '../lib/api-types'

type BookingItem = components['schemas']['BookingListItem']
type BookingStatus = BookingItem['status']

// Weekday short labels (Sunday-first) in the active locale. 2024-12-01 is a
// Sunday, so formatting that reference week yields localized weekday names.
function weekdayShortLabels(): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 11, 1 + i).toLocaleDateString(dateLocale(), { weekday: 'short' }),
  )
}

// label is an i18next key resolved with t() at render time (module scope has no hook).
const STATUS_FILTER_ITEMS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'common.all' },
  { key: 'approved', label: 'calendar.filterApproved' },
  { key: 'pending_approval', label: 'calendar.filterPending' },
  { key: 'cancelled', label: 'calendar.filterCancelled' },
  { key: 'rejected', label: 'calendar.filterRejected' },
]

// values are i18next keys resolved with t() at render time.
const APPT_TYPE_LABELS: Record<string, string> = {
  new: 'calendar.apptTypeNew',
  followup: 'calendar.apptTypeFollowup',
  procedure: 'calendar.apptTypeProcedure',
  consult: 'calendar.apptTypeConsult',
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonthFor(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// CRO-editable online-meeting link on an approved booking. Saving writes it to
// the Google Calendar event (backend PATCH); the doctor schedule reads it back.
function VideoLinkEditor({ uid, current }: { uid: string; current: string | null }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(current ?? '')
  const setLink = useSetVideoLink()
  const changed = value.trim() !== (current ?? '')
  return (
    <div className="mt-3 border-t border-bbh-line pt-3">
      <label className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">{t('calendar.onlineMeetingLink')}</label>
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('calendar.pasteMeetingLinkPlaceholder')}
          className={`min-w-0 flex-1 rounded-lg border border-bbh-line bg-white px-2 py-1.5 text-xs text-bbh-ink focus:border-bbh-green focus:outline-none ${FOCUS_RING}`}
        />
        <button
          type="button"
          disabled={setLink.isPending || !changed}
          onClick={() => setLink.mutate({ uid, videoLink: value.trim() || null })}
          className={`shrink-0 rounded-lg bg-bbh-green px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-50 ${FOCUS_RING}`}
        >
          {t('common.save')}
        </button>
      </div>
      {setLink.isError ? <p className="mt-1 text-[11px] text-red-600">{t('calendar.videoLinkSaveFailed')}</p> : null}
    </div>
  )
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

function eventTimeLabel(event: CalendarEvent, t: (key: string) => string): string {
  if (event.all_day) return t('calendar.allDay')
  const date = new Date(event.start)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
}

function blockOverlapsDay(block: ScheduleBlock, dateKey: string): boolean {
  const start = new Date(block.start_at)
  const end = new Date(block.end_at)
  const dayStart = new Date(`${dateKey}T00:00:00`)
  const dayEnd = new Date(`${dateKey}T23:59:59`)
  return start <= dayEnd && end >= dayStart
}

function blockTypeLabel(type: string, t: (key: string) => string): string {
  const keys: Record<string, string> = {
    vacation: 'calendar.blockTypeVacation',
    off_hours: 'calendar.blockTypeOffHours',
    conference: 'calendar.blockTypeConference',
    sick: 'calendar.blockTypeSick',
    other: 'calendar.blockTypeOther',
  }
  return keys[type] ? t(keys[type]) : type
}

function formatBlockRange(block: ScheduleBlock): string {
  const start = new Date(block.start_at)
  const end = new Date(block.end_at)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '-'
  const sameDay = start.toDateString() === end.toDateString()
  const startDate = start.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
  const endDate = end.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
  const startTime = start.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  const endTime = end.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `${startDate} ${startTime}-${endTime}` : `${startDate} ${startTime} - ${endDate} ${endTime}`
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
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

// Month-summary readout — a cell in the hairline metric cluster at the top of
// the page. Numbers read as instrument values in mono/tabular. Green stays
// reserved for confirmed load; other tones carry status semantics only.
// Month-summary readout — label + number only. No per-metric icon/colour: the
// numbers are the signal, and decorative rainbow icons diluted the palette.
function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-3 bg-white p-4 md:p-5">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{label}</span>
      <span className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums text-bbh-ink md:text-3xl">{value}</span>
    </div>
  )
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
  const { t } = useTranslation()
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
  const [approveTargetUid, setApproveTargetUid] = useState<string | null>(null)
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | ''>('')
  const [doctorInit, setDoctorInit] = useState(false)

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
  const doctorsQ = useDoctors()
  const availabilityQ = useAvailability(selectedDoctorId === '' ? undefined : selectedDoctorId)
  // Default to the first doctor once loaded — the calendar is doctor-scoped;
  // "แพทย์ทุกคน" stays available as an explicit overview choice.
  useEffect(() => {
    if (!doctorInit && (doctorsQ.data?.data?.length ?? 0) > 0) {
      setSelectedDoctorId(doctorsQ.data!.data[0].id)
      setDoctorInit(true)
    }
  }, [doctorInit, doctorsQ.data])
  const blocksQ = useScheduleBlocks({
    doctorId: selectedDoctorId === '' ? undefined : selectedDoctorId,
    dateFrom: monthKey(new Date(year, month, 1)),
    dateTo: monthKey(new Date(year, month + 1, 1)),
  })
  const rescheduledQ = useRescheduledMarks(
    monthKey(new Date(year, month, 1)),
    monthKey(new Date(year, month, daysInMonthFor(year, month))),
  )

  const bookingsByDate = useMemo(() => {
    let all = [
      ...approvedQ.data,
      ...pendingQ.data,
      ...cancelledQ.data,
      ...rejectedQ.data,
    ]
    // Doctor-scoped: this doctor's bookings PLUS any still-unassigned (pending)
    // request, so the CRO never loses new requests that need a doctor. '' = all.
    if (selectedDoctorId !== '') {
      all = all.filter((b) => b.assigned_doctor_id === selectedDoctorId || b.assigned_doctor_id == null)
    }
    return mapByDate(all, (booking) => parseBookingDate(booking.requested_datetime_text))
  }, [approvedQ.data, pendingQ.data, cancelledQ.data, rejectedQ.data, selectedDoctorId])

  // The shared Google layer aggregates every doctor, so it only makes sense in
  // the "แพทย์ทุกคน" overview; a doctor-scoped view relies on DB bookings.
  const googleByDate = useMemo(
    () => (selectedDoctorId === '' ? mapByDate(googleQ.data?.data ?? [], eventDateKey) : {}),
    [googleQ.data, selectedDoctorId],
  )

  const rescheduledByDate = useMemo(
    () => mapByDate(rescheduledQ.data ?? [], (m) => m.display_date),
    [rescheduledQ.data],
  )

  const blocksByDate = useMemo(() => {
    const map: Record<string, ScheduleBlock[]> = {}
    for (let d = 1; d <= daysInMonthFor(year, month); d++) {
      const dk = toDateKey(year, month, d)
      const dayBlocks = (blocksQ.data?.data ?? []).filter((block) => blockOverlapsDay(block, dk))
      if (dayBlocks.length > 0) map[dk] = dayBlocks
    }
    return map
  }, [blocksQ.data, month, year])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = monthStart.getDay()
  const leadingBlanks = firstDayOfWeek
  // Pad the tail so the grid always fills complete week rows (multiple of 7);
  // otherwise the cluster's bg-bbh-line shows through the missing trailing cells.
  const trailingBlanks = (7 - ((leadingBlanks + daysInMonth) % 7)) % 7
  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array(trailingBlanks).fill(null),
  ]

  // The selected doctor's open-for-booking hours on the selected weekday
  // (day_of_week 0=Mon..6=Sun; JS getDay() is 0=Sun, so shift by +6 %7).
  const openHoursForSelected = useMemo(() => {
    if (!selectedDate || selectedDoctorId === '') return []
    const dow = (new Date(selectedDate + 'T00:00:00').getDay() + 6) % 7
    return (availabilityQ.data?.data ?? [])
      .filter((r) => r.day_of_week === dow)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  }, [selectedDate, selectedDoctorId, availabilityQ.data])

  const rawSelected = selectedDate ? bookingsByDate[selectedDate] ?? [] : []
  const selectedGoogle = selectedDate ? googleByDate[selectedDate] ?? [] : []
  const selectedBlocks = selectedDate ? blocksByDate[selectedDate] ?? [] : []
  const tbdMarksSelected = useMemo(
    () => selectedDate
      ? (rescheduledByDate[selectedDate] ?? []).filter((m) => m.is_tbd)
      : [],
    [selectedDate, rescheduledByDate],
  )
  const tbdBookings = useMemo(() => {
    if (tbdMarksSelected.length === 0) return []
    const uids = new Set(tbdMarksSelected.map((m) => m.request_uid))
    return pendingQ.data.filter((b) => uids.has(b.request_uid))
  }, [tbdMarksSelected, pendingQ.data])
  const approveDetailQ = useBooking(approveTargetUid)
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
    googleQ.isLoading ||
    blocksQ.isLoading

  // Month-scoped rollup (only days shown in this month) — feeds the summary
  // strip and each day cell's density readout so both tell the same story.
  const monthSummary = useMemo(() => {
    let approved = 0, pending = 0, cancelled = 0, rescheduled = 0, google = 0, unavailable = 0
    for (let d = 1; d <= daysInMonthFor(year, month); d++) {
      const dk = toDateKey(year, month, d)
      const items = bookingsByDate[dk] ?? []
      approved += items.filter((b) => b.status === 'approved').length
      pending += items.filter((b) => b.status === 'pending_approval').length
      cancelled += items.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length
      rescheduled += (rescheduledByDate[dk] ?? []).length
      google += (googleByDate[dk] ?? []).length
      unavailable += (blocksByDate[dk] ?? []).length
    }
    return { approved, pending, cancelled, rescheduled, google, unavailable, total: approved + pending + cancelled + rescheduled + google }
  }, [year, month, bookingsByDate, rescheduledByDate, googleByDate, blocksByDate])

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
    const ok = window.confirm(t('calendar.confirmCancelAppointment', { name: patientName || t('calendar.patientFallback') }))
    if (!ok) return
    try {
      await cancelBooking.mutateAsync({ uid, reason: 'Cancelled by CRO from calendar' })
      toast.show('success', t('calendar.cancelSuccess'))
    } catch {
      toast.show('error', t('calendar.cancelFailed'))
    }
  }

  return (
    <div className="relative flex h-full min-w-0 overflow-hidden bg-white lg:static">
      <section className="min-w-0 flex-1 overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Masthead — instrument label + month readout with inline navigation */}
        <div className="animate-rise mb-8">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
            CRO Calendar
          </p>
        </div>

        {/* Month-summary strip — instrument metric cluster (hairline gap-px) so the
            page opens with a confident readout of the month's load, not empty space */}
        <div className="animate-rise mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line md:grid-cols-5" style={{ animationDelay: '40ms' }}>
          <SummaryCell label={t('calendar.summaryTotal')} value={monthSummary.total} />
          <SummaryCell label={t('calendar.summaryApproved')} value={monthSummary.approved} />
          <SummaryCell label={t('calendar.summaryPending')} value={monthSummary.pending} />
          <SummaryCell label={t('calendar.summaryInCalendar')} value={monthSummary.google} />
          <SummaryCell label={t('calendar.summaryDoctorOff')} value={monthSummary.unavailable} />
        </div>

        {/* Month navigation — kept right above the grid so changing month
            does not require scrolling up and back to see the result */}
        <div className="animate-rise mb-4 flex flex-wrap items-center gap-2" style={{ animationDelay: '55ms' }}>
          <button
            type="button"
            onClick={prevMonth}
            className={`grid h-10 w-10 place-items-center rounded-lg border border-bbh-line bg-white text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            aria-label={t('calendar.prevMonth')}
          >
            <ChevronLeft size={18} />
          </button>
          <h1 className="min-w-[180px] flex-1 text-center font-serif text-2xl font-semibold text-bbh-ink sm:flex-none md:text-3xl">
            {new Date(year, month, 1).toLocaleDateString(dateLocale(), { month: 'long' })}{' '}
            <span className="font-mono tabular-nums">{year}</span>
          </h1>
          <button
            type="button"
            onClick={nextMonth}
            className={`grid h-10 w-10 place-items-center rounded-lg border border-bbh-line bg-white text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            aria-label={t('calendar.nextMonth')}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className={`rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            {t('common.today')}
          </button>
          <label className="flex min-w-[220px] items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink">
            <Stethoscope size={15} className="text-bbh-muted" />
            <select
              value={selectedDoctorId}
              onChange={(event) => setSelectedDoctorId(event.target.value === '' ? '' : Number(event.target.value))}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label={t('calendar.selectDoctorCalendar')}
            >
              <option value="">{t('calendar.allDoctorsOverview')}</option>
              {(doctorsQ.data?.data ?? []).map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.display_name}</option>
              ))}
            </select>
          </label>
          <span className="ml-0 w-full font-mono text-xs tabular-nums text-bbh-muted sm:ml-auto sm:w-auto">
            {isLoading ? <span className="animate-pulse">{t('common.loading')}</span> : null}
          </span>
        </div>

        <div className="animate-rise overflow-x-auto pb-2" style={{ animationDelay: '70ms' }}>
          <div className="min-w-[640px] md:min-w-0">
            {/* Weekday rail — instrument column labels */}
            <div className="mb-2 grid grid-cols-7 gap-px">
              {weekdayShortLabels().map((d) => (
                <div key={d} className="py-2 text-center font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">
                  {d}
                </div>
              ))}
            </div>

            {/* Month grid — one hairline-ruled cluster (gap-px reveals bbh-line as
                rules) so each day reads as a cell in an instrument, not a card */}
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line">
              {cells.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} className="h-16 bg-white" />

                const dk = toDateKey(year, month, day)
                const isToday = dk === todayKey
                const isSelected = dk === selectedDate
                const items = bookingsByDate[dk] ?? []
                const googleItems = googleByDate[dk] ?? []
                const rescheduledItems = rescheduledByDate[dk] ?? []
                const blockCnt = (blocksByDate[dk] ?? []).length
                const approvedCnt = items.filter((b) => b.status === 'approved').length
                const pendingCnt = items.filter((b) => b.status === 'pending_approval').length
                const cancelledCnt = items.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length
                const rescheduledCnt = rescheduledItems.length

                return (
                  <button
                    key={dk}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : dk)}
                    aria-pressed={isSelected}
                    className={`relative flex h-16 flex-col items-start p-1.5 text-left transition-colors duration-200 ${FOCUS_RING} ${
                      isSelected ? 'bg-bbh-green-soft' : 'bg-white hover:bg-bbh-surface'
                    }`}
                  >
                    {/* today lead rail — green reserved for today */}
                    {isToday ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-bbh-green" /> : null}
                    <span className={`font-mono text-sm font-semibold leading-none tabular-nums ${isSelected ? 'text-bbh-green-dark' : isToday ? 'text-bbh-green' : 'text-bbh-ink'}`}>
                      {day}
                    </span>
                    <div className="mt-auto flex w-full flex-col gap-0.5">
                      {approvedCnt > 0 && <span className="truncate rounded bg-bbh-green-soft px-1 text-[10px] font-medium leading-tight text-bbh-green-dark"><span className="font-mono tabular-nums">{approvedCnt}</span> {t('calendar.badgeApproved')}</span>}
                      {pendingCnt > 0 && <span className="truncate rounded bg-amber-50 px-1 text-[10px] font-medium leading-tight text-amber-700"><span className="font-mono tabular-nums">{pendingCnt}</span> {t('calendar.badgePending')}</span>}
                      {rescheduledCnt > 0 && <span className="truncate rounded bg-bbh-surface px-1 text-[10px] font-medium leading-tight text-bbh-muted"><span className="font-mono tabular-nums">{rescheduledCnt}</span> {t('calendar.badgeRescheduled')}</span>}
                      {blockCnt > 0 && <span className="truncate rounded bg-amber-50 px-1 text-[10px] font-medium leading-tight text-amber-700"><span className="font-mono tabular-nums">{blockCnt}</span> {t('calendar.badgeDoctorOff')}</span>}
                      {cancelledCnt > 0 && <span className="truncate rounded bg-bbh-surface px-1 text-[10px] font-medium leading-tight text-bbh-muted"><span className="font-mono tabular-nums">{cancelledCnt}</span> {t('common.cancel')}</span>}
                      {googleItems.length > 0 && <span className="truncate rounded bg-bbh-surface px-1 text-[10px] font-medium leading-tight text-bbh-muted"><span className="font-mono tabular-nums">{googleItems.length}</span> {t('calendar.badgeAppointment')}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="animate-rise mt-6 flex flex-wrap items-center gap-4 text-xs text-bbh-muted" style={{ animationDelay: '140ms' }}>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border border-bbh-green/30 bg-bbh-green-soft" />{t('calendar.summaryApproved')}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border border-amber-200 bg-amber-50" />{t('calendar.summaryPending')}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-[3px] rounded-full bg-bbh-green" />{t('common.today')}</span>
        </div>
      </section>

      {selectedDate ? (
        <button
          type="button"
          aria-label={t('calendar.closeAppointmentDetails')}
          onClick={() => setSelectedDate(null)}
          className="fixed inset-0 z-30 bg-bbh-ink/35 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside className={`${selectedDate ? 'fixed inset-x-0 bottom-0 z-40 block max-h-[82vh] rounded-t-2xl shadow-2xl shadow-bbh-ink/20' : 'hidden'} animate-rise overflow-y-auto border-bbh-line bg-white p-6 md:p-8 lg:static lg:block lg:h-full lg:w-[400px] lg:rounded-none lg:border-l lg:shadow-none`} style={{ animationDelay: '120ms' }}>
        <div className="mb-4 flex items-center justify-end lg:hidden">
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className={`grid h-9 w-9 place-items-center rounded-lg border border-bbh-line bg-white text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            aria-label={t('calendar.closeAppointmentDetails')}
          >
            <X size={18} />
          </button>
        </div>
        {!selectedDate ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-bbh-muted">
            <div className="rounded-xl border border-dashed border-bbh-line bg-bbh-surface px-8 py-10">
              {t('calendar.selectDayPrompt')}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('calendar.appointmentsLabel')}</p>
              <p className="mt-2 font-serif text-xl font-semibold text-bbh-ink">
                {formatThaiDate(selectedDate)}
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-bbh-muted">
                {rawSelected.length + selectedGoogle.length === 0 ? t('calendar.noAppointments') : t('calendar.appointmentCount', { count: rawSelected.length + selectedGoogle.length })}
              </p>
              {selectedDoctorId !== '' ? (
                <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${openHoursForSelected.length > 0 ? 'bg-bbh-green-soft text-bbh-green-dark' : 'bg-bbh-surface text-bbh-muted'}`}>
                  <Clock size={12} />
                  {openHoursForSelected.length > 0
                    ? t('calendar.openForBooking', { hours: openHoursForSelected.map((r) => `${r.start_time}–${r.end_time}`).join(', ') })
                    : t('calendar.doctorNotOpenToday')}
                </p>
              ) : null}
            </div>

            {rawSelected.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-1.5">
                {STATUS_FILTER_ITEMS.map(({ key, label }) => {
                  const count = key === 'all' ? rawSelected.length : rawSelected.filter((b) => b.status === key).length
                  if (key !== 'all' && count === 0) return null
                  const active = panelFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPanelFilter(key)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200 ${FOCUS_RING} ${
                        active
                          ? 'border-bbh-green bg-bbh-green text-white'
                          : 'border-bbh-line bg-white text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark'
                      }`}
                    >
                      {t(label)} {count > 0 && <span className="ml-0.5 font-mono tabular-nums opacity-70">({count})</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-bbh-surface" />)}
              </div>
            ) : filteredSelected.length === 0 && selectedGoogle.length === 0 && tbdBookings.length === 0 && selectedBlocks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-bbh-line bg-white p-10 text-center">
                <p className="text-sm text-bbh-muted">{t('calendar.noAppointmentsToday')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedBlocks.map((block) => (
                  <div key={`block-${block.id}`} className="rounded-xl border border-bbh-line bg-bbh-surface p-4 text-sm text-bbh-muted">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-bbh-ink">{block.doctor_name ?? t('calendar.doctorNumber', { id: block.doctor_id })}</p>
                        <p className="mt-1 font-mono text-xs tabular-nums text-bbh-muted">{formatBlockRange(block)}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-bbh-line bg-white px-2 py-0.5 text-[11px] font-semibold text-bbh-muted">{blockTypeLabel(block.block_type, t)}</span>
                    </div>
                    {block.reason ? <p className="mt-2 line-clamp-2 text-xs text-bbh-muted">{block.reason}</p> : null}
                    <p className="mt-3 rounded-lg border border-bbh-line bg-white px-3 py-2 text-xs text-bbh-muted">{t('calendar.doctorStatedLabel')} <span className="font-semibold text-bbh-ink">{blockTypeLabel(block.block_type, t)}</span></p>
                  </div>
                ))}
                {tbdBookings.map((b) => (
                  <div key={`tbd-${b.request_uid}`} className="group rounded-xl border border-bbh-line bg-bbh-surface p-4 transition-colors duration-200 hover:border-bbh-green/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-bbh-ink">{b.patient_name ?? '-'}</p>
                        <p className="mt-0.5 font-mono text-xs tabular-nums text-bbh-muted">{b.phone ?? '-'}</p>
                      </div>
                      <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-[11px] font-semibold text-bbh-muted">{t('calendar.rescheduleAwaitingTime')}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-full bg-white px-2 py-0.5 text-bbh-muted">{t('calendar.patientNotConfirmedTime')}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-bbh-muted">{APPT_TYPE_LABELS[b.appointment_type] ? t(APPT_TYPE_LABELS[b.appointment_type]) : b.appointment_type}</span>
                      <SourceBadge source={b.booking_source} />
                    </div>
                    {b.symptom && <p className="mt-2 line-clamp-2 text-xs text-bbh-muted">{b.symptom}</p>}
                    <div className="grid overflow-hidden transition-all duration-200 lg:max-h-0 lg:opacity-0 lg:group-hover:mt-3 lg:group-hover:max-h-16 lg:group-hover:opacity-100 lg:group-focus-within:mt-3 lg:group-focus-within:max-h-16 lg:group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => setApproveTargetUid(b.request_uid)}
                        className={`w-full rounded-lg bg-bbh-green px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
                      >
                        {t('calendar.setNewDateTime')}
                      </button>
                    </div>
                  </div>
                ))}

                {filteredSelected.map((b) => {
                  const time = parseBookingTime(b.requested_datetime_text)
                  const dimmed = b.status === 'cancelled' || b.status === 'rejected' || b.status === 'expired'
                  return (
                    <div key={b.request_uid} className={`group rounded-xl border p-4 transition-colors duration-200 ${dimmed ? 'border-bbh-line bg-bbh-surface opacity-60' : 'border-bbh-line bg-white hover:border-bbh-green/40'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-bbh-ink">{b.patient_name ?? '-'}</p>
                          <p className="mt-0.5 font-mono text-xs tabular-nums text-bbh-muted">{b.phone ?? '-'}</p>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {time && <span className="font-mono font-semibold tabular-nums text-bbh-ink">{t('calendar.timeSuffix', { time })}</span>}
                        <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-bbh-muted">{APPT_TYPE_LABELS[b.appointment_type] ? t(APPT_TYPE_LABELS[b.appointment_type]) : b.appointment_type}</span>
                        <SourceBadge source={b.booking_source} />
                      </div>
                      {b.symptom && <p className="mt-2 line-clamp-2 text-xs text-bbh-muted">{b.symptom}</p>}
                      {b.status === 'approved' ? (
                        <div className="grid grid-cols-2 gap-2 overflow-hidden transition-all duration-200 lg:max-h-0 lg:opacity-0 lg:group-hover:mt-3 lg:group-hover:max-h-16 lg:group-hover:opacity-100 lg:group-focus-within:mt-3 lg:group-focus-within:max-h-16 lg:group-focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => setRescheduleTarget({ uid: b.request_uid, currentText: b.requested_datetime_text })}
                            className={`rounded-lg border border-bbh-line bg-white px-3 py-2 text-xs font-semibold text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                          >
                            {t('calendar.reschedule')}
                          </button>
                          <button
                            type="button"
                            disabled={cancelBooking.isPending}
                            onClick={() => void handleCancelBooking(b.request_uid, b.patient_name)}
                            className={`rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors duration-200 hover:bg-red-50 disabled:opacity-60 ${FOCUS_RING}`}
                          >
                            {t('calendar.cancelAppointment')}
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
                      className="group rounded-xl border border-bbh-line bg-bbh-surface p-4 transition-colors duration-200 hover:border-bbh-green/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-bbh-ink">{info.patientName}</p>
                          <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-bbh-ink">{t('calendar.timeSuffix', { time: eventTimeLabel(event, t) })}</p>
                        </div>
                        <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-[11px] font-semibold text-bbh-muted">{t('calendar.calendarBadge')}</span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-bbh-muted">
                        {info.phone ? <p><span className="font-semibold text-bbh-ink">{t('calendar.phoneLabel')}</span> <span className="font-mono tabular-nums">{info.phone}</span></p> : null}
                        {info.symptom ? <p><span className="font-semibold text-bbh-ink">{t('calendar.symptomLabel')}</span> {info.symptom}</p> : null}
                        {info.requestUid ? <p className="truncate font-mono text-[11px] text-bbh-muted/80">{t('calendar.requestIdLabel', { uid: info.requestUid })}</p> : null}
                      </div>
                      {event.video_link ? (
                        <a
                          href={event.video_link}
                          target="_blank"
                          rel="noreferrer"
                          className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-bbh-green px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
                        >
                          <Video size={13} /> {t('calendar.joinOnline')}
                        </a>
                      ) : null}
                      {info.requestUid ? <VideoLinkEditor uid={info.requestUid} current={event.video_link} /> : null}
                      <div className="grid grid-cols-2 gap-2 overflow-hidden transition-all duration-200 lg:max-h-0 lg:opacity-0 lg:group-hover:mt-3 lg:group-hover:max-h-16 lg:group-hover:opacity-100 lg:group-focus-within:mt-3 lg:group-focus-within:max-h-16 lg:group-focus-within:opacity-100">
                        <a
                          href={event.html_link ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className={`rounded-lg border border-bbh-line bg-white px-3 py-2 text-center text-xs font-semibold text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                        >
                          {t('calendar.openCalendar')}
                        </a>
                        {info.requestUid ? (
                          <button
                            type="button"
                            disabled={cancelBooking.isPending}
                            onClick={() => void handleCancelBooking(info.requestUid!, info.patientName)}
                            className={`rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors duration-200 hover:bg-red-50 disabled:opacity-60 ${FOCUS_RING}`}
                          >
                            {t('calendar.cancelAppointment')}
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
          toast.show('success', t('calendar.rescheduleSuccess'))
        }}
      />

      <ApproveModal
        booking={approveDetailQ.data ?? null}
        defaultDoctorId={selectedDoctorId === '' ? undefined : selectedDoctorId}
        open={approveTargetUid !== null && !!approveDetailQ.data}
        onClose={() => setApproveTargetUid(null)}
        onApproved={() => {
          void qc.invalidateQueries({ queryKey: ['bookings-all'] })
          void qc.invalidateQueries({ queryKey: ['calendar-events'] })
          void qc.invalidateQueries({ queryKey: ['rescheduled-marks'] })
        }}
      />
    </div>
  )
}
