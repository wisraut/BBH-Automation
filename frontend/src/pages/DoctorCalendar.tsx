import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { dateLocale } from '../i18n/datetime'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Stethoscope,
  Trash2,
  UserRound,
  Video,
} from 'lucide-react'

import { Modal } from '../components/Modal'
import { useMySchedule, type ScheduleAppointment } from '../hooks/useMySchedule'
import {
  useCreateScheduleBlock,
  useDeleteScheduleBlock,
  useScheduleBlocks,
  type ScheduleBlock,
} from '../hooks/useScheduleBlocks'
import { useAuth } from '../lib/auth'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

// Weekday header cells (Sunday-first). Labels resolved via t('doctorCalendar.monthDayShort.*').
const MONTH_DAY_CELLS = Array.from({ length: 7 })
const HOURS = Array.from({ length: 11 }, (_, index) => index + 8)
const DAY_START_HOUR = 8
const DAY_END_HOUR = 19
const PX_PER_MINUTE = 1.2
const DAY_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * 60 * PX_PER_MINUTE
const BLOCK_TYPES = [
  { value: 'vacation', labelKey: 'blockType.vacation' },
  { value: 'off_hours', labelKey: 'blockType.offHours' },
  { value: 'conference', labelKey: 'blockType.conference' },
  { value: 'sick', labelKey: 'blockType.sick' },
  { value: 'other', labelKey: 'blockType.other' },
]

type CalendarMode = 'week' | 'month'
type Selection =
  | { kind: 'appointment'; item: ScheduleAppointment }
  | { kind: 'block'; item: ScheduleBlock }
  | null

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  return d
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}
function daysInMonthFor(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
function monthCells(year: number, month: number): (number | null)[] {
  const days = daysInMonthFor(year, month)
  const leadingBlanks = new Date(year, month, 1).getDay()
  const trailingBlanks = (7 - ((leadingBlanks + days) % 7)) % 7
  return [...Array(leadingBlanks).fill(null), ...Array.from({ length: days }, (_, i) => i + 1), ...Array(trailingBlanks).fill(null)]
}
function formatDate(date: Date): string {
  return date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
}
function formatLongDate(date: Date): string {
  return date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatTime(value: string | null): string {
  if (!value) return '-'
  return value.slice(0, 5)
}
function blockTypeLabel(type: string, t: (key: string) => string): string {
  const found = BLOCK_TYPES.find((item) => item.value === type)
  return found ? t(`doctorCalendar.${found.labelKey}`) : type
}
function dateTimeLocal(dateKey: string, hour: number): string {
  return `${dateKey}T${String(hour).padStart(2, '0')}:00`
}
function minutesFromDayStart(date: Date): number {
  return Math.max(0, (date.getHours() - DAY_START_HOUR) * 60 + date.getMinutes())
}
function positionForDateTime(date: Date, fallbackMinutes = 60) {
  const top = Math.max(0, minutesFromDayStart(date) * PX_PER_MINUTE)
  return { top, height: Math.max(34, fallbackMinutes * PX_PER_MINUTE) }
}
function appointmentPosition(apt: ScheduleAppointment) {
  const time = apt.requested_time ?? '09:00'
  const date = new Date(`${apt.requested_date}T${time}`)
  const pos = positionForDateTime(date, apt.appointment_type === 'new' ? 75 : 45)
  // Cap the card to one hour row (minus a small gap) so a 'new' appointment
  // (assumed 75 min = 90px) does not bleed past its slot into the row below.
  const rowPx = 60 * PX_PER_MINUTE
  return { top: pos.top, height: Math.min(pos.height, rowPx - 6) }
}
function blockPosition(block: ScheduleBlock, dayKey: string) {
  const start = new Date(block.start_at)
  const end = new Date(block.end_at)
  const dayStart = new Date(`${dayKey}T${String(DAY_START_HOUR).padStart(2, '0')}:00`)
  const dayEnd = new Date(`${dayKey}T${String(DAY_END_HOUR).padStart(2, '0')}:00`)
  const visibleStart = start > dayStart ? start : dayStart
  const visibleEnd = end < dayEnd ? end : dayEnd
  const duration = Math.max(30, Math.round((visibleEnd.getTime() - visibleStart.getTime()) / 60000))
  return positionForDateTime(visibleStart, duration)
}
function overlapsDay(block: ScheduleBlock, dayKey: string): boolean {
  const start = new Date(block.start_at)
  const end = new Date(block.end_at)
  const dayStart = new Date(`${dayKey}T00:00`)
  const dayEnd = new Date(`${dayKey}T23:59:59`)
  return start <= dayEnd && end >= dayStart
}
function formatBlockRange(block: ScheduleBlock): string {
  const start = new Date(block.start_at)
  const end = new Date(block.end_at)
  return `${start.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} ${start.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}`
}

function MetricCell({ label, value, icon: Icon, tone = 'green' }: {
  label: string
  value: string | number
  icon: typeof CalendarClock
  tone?: 'green' | 'slate' | 'amber'
}) {
  const color = tone === 'amber' ? 'text-amber-500' : tone === 'slate' ? 'text-slate-500' : 'text-bbh-green'
  return (
    <div className="flex min-h-[112px] flex-col justify-between bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{label}</span>
        <Icon size={15} className={color} />
      </div>
      <span className="font-mono text-3xl font-semibold leading-none tabular-nums text-bbh-ink">{value}</span>
    </div>
  )
}

function CreateBlockModal({
  open,
  doctorId,
  initialStart,
  onClose,
}: {
  open: boolean
  doctorId: number | undefined
  initialStart: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const create = useCreateScheduleBlock()
  const [blockType, setBlockType] = useState('off_hours')
  const [startAt, setStartAt] = useState(initialStart)
  const [endAt, setEndAt] = useState('')
  const [reason, setReason] = useState('')
  const [videoLink, setVideoLink] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!doctorId || !startAt || !endAt) return
    create.mutate(
      {
        doctor_id: doctorId, block_type: blockType, start_at: startAt, end_at: endAt,
        reason: reason || null, video_link: videoLink.trim() || null,
      },
      { onSuccess: () => { setReason(''); setVideoLink(''); onClose() } },
    )
  }

  useEffect(() => {
    setStartAt(initialStart)
    if (!initialStart) return
    const d = new Date(initialStart)
    d.setHours(d.getHours() + 1)
    setEndAt(`${toDateKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  }, [initialStart])

  const fieldClass =
    `w-full rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30`

  return (
    <Modal open={open} title={t('doctorCalendar.addTimeOff')} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('doctorCalendar.type')}</label>
          <select value={blockType} onChange={(e) => setBlockType(e.target.value)} className={`mt-2 ${fieldClass}`}>
            {BLOCK_TYPES.map((item) => <option key={item.value} value={item.value}>{t(`doctorCalendar.${item.labelKey}`)}</option>)}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('doctorCalendar.start')}</label>
            <input required type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`mt-2 font-mono tabular-nums ${fieldClass}`} />
          </div>
          <div>
            <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('doctorCalendar.end')}</label>
            <input required type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={`mt-2 font-mono tabular-nums ${fieldClass}`} />
          </div>
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} placeholder={t('doctorCalendar.reasonPlaceholder')} />
        <input
          type="url"
          value={videoLink}
          onChange={(e) => setVideoLink(e.target.value)}
          className={fieldClass}
          placeholder={t('doctorCalendar.videoLinkPlaceholder')}
        />
        {create.error ? <p className="text-xs text-red-600">{t('doctorCalendar.saveFailed')}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={`rounded-lg border border-bbh-line bg-white px-4 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}>{t('common.cancel')}</button>
          <button type="submit" disabled={create.isPending} className={`rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}>{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

function MonthGrid({
  monthStart,
  appointments,
  blocks,
  todayKey,
  selectedDate,
  setSelectedDate,
  openBlock,
}: {
  monthStart: Date
  appointments: ScheduleAppointment[]
  blocks: ScheduleBlock[]
  todayKey: string
  selectedDate: string | null
  setSelectedDate: (date: string | null) => void
  openBlock: (dateKey: string, hour?: number) => void
}) {
  const { t } = useTranslation()
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const cells = monthCells(year, month)

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[640px] md:min-w-0">
        <div className="mb-2 grid grid-cols-7 gap-px">
          {MONTH_DAY_CELLS.map((_day, index) => (
            <div key={index} className="py-2 text-center font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">
              {t(`doctorCalendar.monthDayShort.${index}`)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line">
          {cells.map((day, index) => {
            if (day === null) return <div key={`empty-${index}`} className="h-24 bg-white lg:h-28" />
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayAppointments = appointments.filter((apt) => apt.requested_date === dateKey)
            const dayBlocks = blocks.filter((block) => overlapsDay(block, dateKey))
            const isToday = dateKey === todayKey
            const isSelected = dateKey === selectedDate
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                onDoubleClick={() => openBlock(dateKey, 9)}
                aria-pressed={isSelected}
                className={`relative flex h-24 flex-col items-start p-1.5 text-left transition-colors duration-200 lg:h-28 ${FOCUS_RING} ${isSelected ? 'bg-bbh-green-soft' : 'bg-white hover:bg-bbh-surface'}`}
              >
                {isToday ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-bbh-green" /> : null}
                <span className={`font-mono text-sm font-semibold leading-none tabular-nums ${isSelected ? 'text-bbh-green-dark' : isToday ? 'text-bbh-green' : 'text-bbh-ink'}`}>
                  {day}
                </span>
                <div className="mt-auto flex w-full flex-col gap-0.5">
                  {dayAppointments.length > 0 ? (
                    <span className="truncate rounded bg-bbh-green-soft px-1 text-[10px] font-medium leading-tight text-bbh-green-dark">
                      <span className="font-mono tabular-nums">{dayAppointments.length}</span> {t('doctorCalendar.appointmentsUnit')}
                    </span>
                  ) : null}
                  {dayBlocks.length > 0 ? (
                    <span className="truncate rounded bg-slate-200 px-1 text-[10px] font-medium leading-tight text-slate-700">
                      <span className="font-mono tabular-nums">{dayBlocks.length}</span> {t('doctorCalendar.awayUnit')}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
export function DoctorCalendar() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const doctorId = user ? Number(user.id) : undefined
  const [mode, setMode] = useState<CalendarMode>('week')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<string | null>(() => toDateKey(new Date()))
  const [selection, setSelection] = useState<Selection>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockStart, setBlockStart] = useState(() => dateTimeLocal(toDateKey(new Date()), 9))

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const dateFrom = mode === 'week' ? toDateKey(weekDays[0]) : toDateKey(monthStart)
  const dateTo = mode === 'week' ? toDateKey(addDays(weekDays[6], 1)) : toDateKey(addMonths(monthStart, 1))
  const scheduleQ = useMySchedule({ dateFrom, dateTo })
  const blocksQ = useScheduleBlocks({ doctorId, dateFrom, dateTo })
  const deleteBlock = useDeleteScheduleBlock()

  // Wheel over the week grid scrolls it left/right so end-of-week days that
  // overflow the viewport are reachable without hunting for the bottom
  // scrollbar. While the pointer is over the grid the wheel is horizontal-only
  // (it never bubbles to vertical page scroll, even at the edges) — to scroll
  // the page the user moves the pointer off the grid. Native non-passive
  // listener because React's onWheel is passive and cannot preventDefault.
  const weekScrollRef = useRef<HTMLDivElement | null>(null)
  const weekGridReady =
    mode === 'week' &&
    !scheduleQ.isLoading && !blocksQ.isLoading &&
    !scheduleQ.isError && !blocksQ.isError
  useEffect(() => {
    const el = weekScrollRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return
      if (el.scrollWidth <= el.clientWidth) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [weekGridReady])

  const appointments = useMemo(() => scheduleQ.data?.appointments ?? [], [scheduleQ.data])
  const blocks = blocksQ.data?.data ?? []
  const todayKey = toDateKey(new Date())
  const todayAppointments = appointments.filter((apt) => apt.requested_date === todayKey)
  const visibleAppointmentCount = appointments.length
  const selectedAppointments = selectedDate ? appointments.filter((apt) => apt.requested_date === selectedDate) : []
  const selectedBlocks = selectedDate ? blocks.filter((block) => overlapsDay(block, selectedDate)) : []
  const blockedHourCount = Math.round(blocks.reduce((sum, block) => {
    const start = new Date(block.start_at)
    const end = new Date(block.end_at)
    return sum + Math.max(0, end.getTime() - start.getTime()) / 3600000
  }, 0))
  const openBlock = (dateKey: string, hour = 9) => {
    setBlockStart(dateTimeLocal(dateKey, hour))
    setBlockOpen(true)
  }
  const goToday = () => {
    const now = new Date()
    setWeekStart(startOfWeek(now))
    setMonthStart(startOfMonth(now))
    setSelectedDate(toDateKey(now))
  }
  const goPrevious = () => {
    if (mode === 'week') setWeekStart(addDays(weekStart, -7))
    else setMonthStart(addMonths(monthStart, -1))
  }
  const goNext = () => {
    if (mode === 'week') setWeekStart(addDays(weekStart, 7))
    else setMonthStart(addMonths(monthStart, 1))
  }
  const periodTitle = mode === 'week'
    ? `${formatLongDate(weekDays[0])} - ${formatLongDate(weekDays[6])}`
    : `${t(`doctorCalendar.monthName.${monthStart.getMonth()}`)} ${monthStart.getFullYear()}`

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="min-w-0 flex-1 overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        <div className="animate-rise mb-8 flex flex-col gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Doctor Calendar</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('doctorCalendar.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              {t('doctorCalendar.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-bbh-line bg-white p-1 text-xs font-medium">
              {(['week', 'month'] as CalendarMode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`rounded-md px-3 py-1.5 transition-colors duration-200 ${FOCUS_RING} ${mode === item ? 'bg-bbh-green text-white' : 'text-bbh-muted hover:text-bbh-ink'}`}
                >
                  {item === 'week' ? t('doctorCalendar.week') : t('doctorCalendar.month')}
                </button>
              ))}
            </div>
            <button type="button" onClick={goToday} className={`rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}>{t('common.today')}</button>
            <button type="button" onClick={goPrevious} className={`grid h-10 w-10 place-items-center rounded-lg border border-bbh-line bg-white text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`} aria-label={t('doctorCalendar.previous')}><ArrowLeft size={16} /></button>
            <button type="button" onClick={goNext} className={`grid h-10 w-10 place-items-center rounded-lg border border-bbh-line bg-white text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`} aria-label={t('doctorCalendar.next')}><ArrowRight size={16} /></button>
            <button type="button" onClick={() => openBlock(selectedDate ?? todayKey, 9)} className={`inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}><Plus size={16} /> {t('doctorCalendar.blockTime')}</button>
            <button type="button" onClick={() => { void scheduleQ.refetch(); void blocksQ.refetch() }} className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}>
              <RefreshCw size={15} className={scheduleQ.isFetching || blocksQ.isFetching ? 'animate-spin' : ''} /> {t('doctorCalendar.refresh')}
            </button>
          </div>
        </div>

        <div className="animate-rise mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line sm:grid-cols-2 xl:grid-cols-4" style={{ animationDelay: '50ms' }}>
          <MetricCell label={t('doctorCalendar.metricToday')} value={todayAppointments.length} icon={CalendarClock} />
          <MetricCell label={mode === 'week' ? t('doctorCalendar.metricThisWeek') : t('doctorCalendar.metricThisMonth')} value={visibleAppointmentCount} icon={Stethoscope} />
          <MetricCell label={t('doctorCalendar.metricBlocked')} value={t('doctorCalendar.hoursValue', { count: blockedHourCount })} icon={CalendarOff} tone={blockedHourCount > 0 ? 'amber' : 'green'} />
          <MetricCell label={t('doctorCalendar.metricAvailability')} value="09-17" icon={Clock} tone="slate" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="animate-rise min-w-0 overflow-hidden rounded-xl border border-bbh-line bg-white" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-4">
              <div>
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{mode === 'week' ? t('doctorCalendar.weekView') : t('doctorCalendar.monthView')}</p>
                <p className="mt-1 font-serif text-xl font-semibold text-bbh-ink">
                  {periodTitle}
                </p>
              </div>
              <div className="hidden items-center gap-3 text-xs text-bbh-muted md:flex">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-bbh-green" /> {t('doctorCalendar.legendAppointment')}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> {t('doctorCalendar.legendAway')}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-bbh-green-soft" /> {t('doctorCalendar.legendAvailable')}</span>
              </div>
            </div>

            {scheduleQ.isLoading || blocksQ.isLoading ? (
              <div className="flex h-[480px] items-center justify-center text-sm text-bbh-muted"><Loader2 size={16} className="mr-2 animate-spin" /> {t('doctorCalendar.loadingCalendar')}</div>
            ) : scheduleQ.isError || blocksQ.isError ? (
              <div className="p-6 text-sm text-red-700">{t('doctorCalendar.loadCalendarFailed')}</div>
            ) : mode === 'month' ? (
              <MonthGrid
                monthStart={monthStart}
                appointments={appointments}
                blocks={blocks}
                todayKey={todayKey}
                selectedDate={selectedDate}
                setSelectedDate={(date) => { setSelectedDate(date); setSelection(null) }}
                openBlock={openBlock}
              />
            ) : (
              <div ref={weekScrollRef} className="overflow-x-auto">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[72px_repeat(7,minmax(116px,1fr))] border-b border-bbh-line bg-white">
                    <div className="border-r border-bbh-line px-3 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-bbh-muted">{t('doctorCalendar.timeColumn')}</div>
                    {weekDays.map((day, index) => {
                      const key = toDateKey(day)
                      const active = key === todayKey
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => openBlock(key, 9)}
                          className={`border-r border-bbh-line px-3 py-3 text-left transition-colors duration-200 hover:bg-bbh-surface ${FOCUS_RING}`}
                        >
                          <p className={`font-mono text-[10px] font-medium uppercase tracking-[0.18em] ${active ? 'text-bbh-green-dark' : 'text-bbh-muted'}`}>{t(`doctorCalendar.dayLabel.${index}`)}</p>
                          <p className="mt-1 font-serif text-lg font-semibold text-bbh-ink">{formatDate(day)}</p>
                        </button>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-[72px_repeat(7,minmax(116px,1fr))]">
                    <div className="border-r border-bbh-line bg-bbh-surface">
                      {HOURS.map((hour) => (
                        <div key={hour} className="h-[72px] border-b border-bbh-line px-3 py-2 text-right font-mono text-[11px] tabular-nums text-bbh-muted">
                          {String(hour).padStart(2, '0')}:00
                        </div>
                      ))}
                    </div>
                    {weekDays.map((day) => {
                      const dayKey = toDateKey(day)
                      const dayAppointments = appointments.filter((apt) => apt.requested_date === dayKey)
                      const dayBlocks = blocks.filter((block) => overlapsDay(block, dayKey))
                      return (
                        <div key={dayKey} className="relative border-r border-bbh-line bg-bbh-green-soft/20" style={{ height: DAY_HEIGHT }}>
                          {HOURS.map((hour) => (
                            <button
                              key={hour}
                              type="button"
                              onClick={() => openBlock(dayKey, hour)}
                              aria-label={t('doctorCalendar.addBlockAria', { date: dayKey, hour })}
                              className={`absolute left-0 right-0 border-b border-bbh-line/80 transition-colors duration-200 hover:bg-bbh-green-soft/50 ${FOCUS_RING}`}
                              style={{ top: (hour - DAY_START_HOUR) * 60 * PX_PER_MINUTE, height: 60 * PX_PER_MINUTE }}
                            />
                          ))}
                          {dayBlocks.map((block) => {
                            const pos = blockPosition(block, dayKey)
                            return (
                              <button
                                key={block.id}
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setSelection({ kind: 'block', item: block }) }}
                                className={`absolute left-1 right-1 overflow-hidden rounded-lg border border-slate-300 bg-slate-100 px-2 py-1 text-left text-xs text-slate-700 shadow-sm transition-colors duration-200 hover:bg-slate-200 ${FOCUS_RING}`}
                                style={{ top: pos.top, height: pos.height }}
                              >
                                <p className="truncate font-semibold">{blockTypeLabel(block.block_type, t)}</p>
                                <p className="truncate font-mono text-[10px] tabular-nums">{formatBlockRange(block)}</p>
                              </button>
                            )
                          })}
                          {dayAppointments.map((apt) => {
                            const pos = appointmentPosition(apt)
                            return (
                              <button
                                key={apt.request_uid}
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setSelection({ kind: 'appointment', item: apt }) }}
                                className={`absolute left-2 right-2 overflow-hidden rounded-lg border border-bbh-green/40 bg-white px-2 py-1 text-left text-xs shadow-sm shadow-bbh-green/10 ring-1 ring-bbh-green/10 transition-colors duration-200 hover:bg-bbh-green-soft/80 ${FOCUS_RING}`}
                                style={{ top: pos.top, height: pos.height }}
                              >
                                <p className="truncate font-mono text-[10px] tabular-nums text-bbh-green-dark">{formatTime(apt.requested_time)}</p>
                                <p className="truncate font-semibold text-bbh-ink">{apt.patient_name || t('doctorCalendar.unnamedPatient')}</p>
                                <p className="truncate text-[11px] text-bbh-muted">{apt.symptom || apt.appointment_type || t('doctorCalendar.consultation')}</p>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="animate-rise space-y-4" style={{ animationDelay: '140ms' }}>
            <div className="rounded-xl border border-bbh-line bg-white p-5">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Inspector</p>
              {!selection && !selectedDate ? (
                <div className="mt-6 text-sm leading-relaxed text-bbh-muted">
                  <p>{t('doctorCalendar.inspectorEmpty')}</p>
                  <button type="button" onClick={() => openBlock(todayKey, 9)} className={`mt-4 inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}>
                    <Plus size={15} /> {t('doctorCalendar.addTimeOff')}
                  </button>
                </div>
              ) : !selection && selectedDate ? (
                <div className="mt-5 space-y-5">
                  <div>
                    <p className="font-serif text-2xl font-semibold text-bbh-ink">{selectedDate}</p>
                    <p className="mt-1 font-mono text-sm tabular-nums text-bbh-muted">{t('doctorCalendar.appointmentsCount', { count: selectedAppointments.length })} · {t('doctorCalendar.blocksCount', { count: selectedBlocks.length })}</p>
                  </div>
                  <div className="space-y-2">
                    {selectedAppointments.map((apt) => (
                      <button
                        key={apt.request_uid}
                        type="button"
                        onClick={() => setSelection({ kind: 'appointment', item: apt })}
                        className={`w-full rounded-lg border border-bbh-line bg-white p-3 text-left transition-colors duration-200 hover:bg-bbh-surface ${FOCUS_RING}`}
                      >
                        <p className="font-mono text-[11px] tabular-nums text-bbh-green-dark">{formatTime(apt.requested_time)}</p>
                        <p className="mt-1 text-sm font-semibold text-bbh-ink">{apt.patient_name || t('doctorCalendar.unnamedPatient')}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-bbh-muted">{apt.symptom || apt.appointment_type || t('doctorCalendar.consultation')}</p>
                      </button>
                    ))}
                    {selectedBlocks.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => setSelection({ kind: 'block', item: block })}
                        className={`w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-left text-slate-700 transition-colors duration-200 hover:bg-slate-100 ${FOCUS_RING}`}
                      >
                        <p className="text-sm font-semibold">{blockTypeLabel(block.block_type, t)}</p>
                        <p className="mt-1 font-mono text-[11px] tabular-nums">{formatBlockRange(block)}</p>
                      </button>
                    ))}
                    {selectedAppointments.length === 0 && selectedBlocks.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-bbh-line bg-bbh-surface p-4 text-sm text-bbh-muted">{t('doctorCalendar.noItemsToday')}</p>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => openBlock(selectedDate, 9)} className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}>
                    <Plus size={15} /> {t('doctorCalendar.addBlockToday')}
                  </button>
                </div>
              ) : selection?.kind === 'appointment' ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="font-serif text-2xl font-semibold text-bbh-ink">{selection.item.patient_name || t('doctorCalendar.unnamedPatient')}</p>
                    <p className="mt-1 font-mono text-sm tabular-nums text-bbh-muted">{selection.item.requested_date} · {formatTime(selection.item.requested_time)}</p>
                  </div>
                  <div className="rounded-lg border border-bbh-line bg-bbh-surface p-3">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">Reason</p>
                    <p className="mt-1 text-sm text-bbh-ink">{selection.item.symptom || '-'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selection.item.video_link ? (
                      <a href={selection.item.video_link} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}>
                        <Video size={15} /> {t('doctorCalendar.joinOnline')}
                      </a>
                    ) : null}
                    {selection.item.patient_id ? (
                      <Link to={`/patients?patient=${selection.item.patient_id}`} className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-4 py-2 text-sm font-semibold text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}>
                        <UserRound size={15} /> {t('doctorCalendar.openCase')}
                      </Link>
                    ) : null}
                    {selection.item.calendar_event_url ? (
                      <a href={selection.item.calendar_event_url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}>
                        Calendar <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="font-serif text-2xl font-semibold text-bbh-ink">{blockTypeLabel(selection.item.block_type, t)}</p>
                    <p className="mt-1 font-mono text-sm tabular-nums text-bbh-muted">{formatBlockRange(selection.item)}</p>
                  </div>
                  <div className="rounded-lg border border-bbh-line bg-bbh-surface p-3">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">Reason</p>
                    <p className="mt-1 text-sm text-bbh-ink">{selection.item.reason || '-'}</p>
                  </div>
                  {selection.item.video_link ? (
                    <a
                      href={selection.item.video_link}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
                    >
                      <Video size={15} /> {t('doctorCalendar.joinOnline')}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(t('doctorCalendar.deleteBlockConfirm'))) {
                        deleteBlock.mutate(selection.item.id, { onSuccess: () => setSelection(null) })
                      }
                    }}
                    className={`inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition-colors duration-200 hover:bg-red-50 ${FOCUS_RING}`}
                  >
                    <Trash2 size={15} /> {t('doctorCalendar.deleteBlock')}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-bbh-line bg-white p-5">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Availability rule</p>
              <div className="mt-4 space-y-3 text-sm text-bbh-muted">
                <p className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-bbh-green" /> {t('doctorCalendar.availabilityRule1')}</p>
                <p className="flex items-start gap-2"><CalendarOff size={15} className="mt-0.5 shrink-0 text-slate-500" /> {t('doctorCalendar.availabilityRule2')}</p>
                <p className="flex items-start gap-2"><Stethoscope size={15} className="mt-0.5 shrink-0 text-bbh-green" /> {t('doctorCalendar.availabilityRule3')}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <CreateBlockModal open={blockOpen} doctorId={doctorId} initialStart={blockStart} onClose={() => setBlockOpen(false)} />
    </div>
  )
}
