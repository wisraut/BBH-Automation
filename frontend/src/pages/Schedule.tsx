import { useMemo, useState } from 'react'
import { dateLocale } from '../i18n/datetime'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Brain,
  Calendar as CalendarIcon,
  CalendarOff,
  CheckCircle2,
  ClipboardList,
  CalendarDays,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Clock,
  Trash2,
  UserRound,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from '../components/Modal'
import { useMySchedule, type ScheduleAppointment, type ScheduleReport } from '../hooks/useMySchedule'
import { usePatientAiSummary } from '../hooks/usePatientAiSummary'
import { useCreateScheduleBlock, useDeleteScheduleBlock, useScheduleBlocks } from '../hooks/useScheduleBlocks'
import { useAuth } from '../lib/auth'
import { AvailabilitySection } from '../components/schedule/AvailabilitySection'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function formatThaiDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatTime(t: string | null): string {
  if (!t) return '-'
  return t.slice(0, 5)
}
function appointmentSortValue(apt: ScheduleAppointment): string {
  return `${apt.requested_date}T${apt.requested_time ?? '99:99'}`
}
function describeTimeToAppointment(apt: ScheduleAppointment, t: TFunction): string {
  if (apt.requested_date !== todayIso() || !apt.requested_time) return formatThaiDate(apt.requested_date)
  const target = new Date(`${apt.requested_date}T${apt.requested_time}`)
  const diffMin = Math.round((target.getTime() - Date.now()) / 60000)
  if (Number.isNaN(diffMin)) return t('common.today')
  if (diffMin < -45) return t('schedule.timeAgo.past')
  if (diffMin < 0) return t('schedule.timeAgo.arriving')
  if (diffMin < 60) return t('schedule.timeAgo.inMinutes', { count: diffMin })
  return t('schedule.timeAgo.inHoursMinutes', { hours: Math.floor(diffMin / 60), minutes: diffMin % 60 })
}

function MetricCell({ label, value, icon: Icon, tone = 'green' }: {
  label: string
  value: number | string
  icon: LucideIcon
  tone?: 'green' | 'amber' | 'red' | 'ink'
}) {
  const iconClass =
    tone === 'red' ? 'text-red-500' : tone === 'amber' ? 'text-amber-500' : tone === 'ink' ? 'text-bbh-ink' : 'text-bbh-green'
  return (
    <div className="flex min-h-[128px] flex-col justify-between bg-white p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{label}</p>
        <Icon size={16} className={iconClass} />
      </div>
      <p className="font-mono text-3xl font-semibold leading-none tabular-nums text-bbh-ink md:text-4xl">{value}</p>
    </div>
  )
}

function AiBriefPanel({ patientId }: { patientId: number }) {
  const { t } = useTranslation()
  const briefM = usePatientAiSummary()
  const [open, setOpen] = useState(false)

  function loadBrief() {
    setOpen(true)
    if (!briefM.data && !briefM.isPending) briefM.mutate(patientId)
  }

  return (
    <div className="rounded-xl border border-bbh-green/30 bg-bbh-green-soft/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-green-dark">
          <Sparkles size={13} /> Pre-visit AI brief
        </p>
        <button
          type="button"
          onClick={loadBrief}
          className={`inline-flex items-center gap-2 rounded-lg border border-bbh-green/30 bg-white px-3 py-1.5 text-xs font-semibold text-bbh-green-dark transition-colors duration-200 hover:border-bbh-green ${FOCUS_RING}`}
        >
          <Brain size={13} /> {t('schedule.summarizeCase')}
        </button>
      </div>
      {open ? (
        <div className="mt-3">
          {briefM.isPending ? (
            <p className="inline-flex items-center gap-2 text-sm text-bbh-muted"><Loader2 size={14} className="animate-spin" /> {t('schedule.summarizing')}</p>
          ) : briefM.error ? (
            <p className="text-sm text-red-700">{t('schedule.briefLoadFailed')}</p>
          ) : briefM.data ? (
            <pre className="max-h-[280px] overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-bbh-ink">{briefM.data.summary}</pre>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-bbh-muted">
          {t('schedule.briefHint')}
        </p>
      )}
    </div>
  )
}

function NextPatientPanel({ apt, pendingReports }: { apt: ScheduleAppointment | null; pendingReports: ScheduleReport[] }) {
  const { t } = useTranslation()
  if (!apt) {
    return (
      <section className="animate-rise rounded-xl border border-bbh-line bg-white p-6 md:p-8">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Next patient</p>
        <div className="mt-8 flex items-center gap-3 text-bbh-muted">
          <CheckCircle2 size={18} className="text-bbh-green" />
          <p className="text-sm">{t('schedule.noNextPatient')}</p>
        </div>
      </section>
    )
  }

  const patientReports = apt.patient_id
    ? pendingReports.filter((report) => report.patient_id === apt.patient_id)
    : []

  return (
    <section className="animate-rise rounded-xl border border-bbh-line bg-white p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Next patient</p>
          <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight text-bbh-ink">
            {apt.patient_name || t('schedule.unnamedPatient')}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-bbh-muted">
            <span className="inline-flex items-center gap-1.5"><Clock size={14} /> <span className="font-mono tabular-nums text-bbh-ink">{formatTime(apt.requested_time)}</span></span>
            <span className="font-mono tabular-nums">{describeTimeToAppointment(apt, t)}</span>
            {apt.phone ? (
              <a href={`tel:${apt.phone}`} className={`inline-flex items-center gap-1.5 rounded transition-colors duration-200 hover:text-bbh-green-dark ${FOCUS_RING}`}>
                <Phone size={14} /> <span className="font-mono tabular-nums">{apt.phone}</span>
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {apt.video_link ? (
            <a
              href={apt.video_link}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
            >
              <Video size={15} /> {t('schedule.joinOnline')}
            </a>
          ) : null}
          {apt.patient_id ? (
            <Link
              to={`/patients?patient=${apt.patient_id}`}
              className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-4 py-2 text-sm font-semibold text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              {t('schedule.openCase')} <ArrowRight size={15} />
            </Link>
          ) : null}
          {apt.calendar_event_url ? (
            <a
              href={apt.calendar_event_url}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              Calendar <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line md:grid-cols-3">
        <div className="bg-white p-4">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Reason</p>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-bbh-ink">{apt.symptom || '-'}</p>
        </div>
        <div className="bg-white p-4">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Visit type</p>
          <p className="mt-2 text-sm text-bbh-ink">{apt.appointment_type || 'consultation'}</p>
        </div>
        <div className="bg-white p-4">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Reports</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-bbh-ink">{patientReports.length}</p>
        </div>
      </div>

      {apt.patient_id ? <div className="mt-5"><AiBriefPanel patientId={apt.patient_id} /></div> : null}
    </section>
  )
}

function SignalRail({ todayAppointments, pendingReports }: {
  todayAppointments: ScheduleAppointment[]
  pendingReports: ScheduleReport[]
}) {
  const { t } = useTranslation()
  const overdueReports = pendingReports.filter((report) => report.latest_decision === null || report.latest_decision === 'review')
  const noPhone = todayAppointments.filter((apt) => !apt.phone)
  const signals = [
    {
      icon: ShieldAlert,
      label: 'Safety watch',
      value: overdueReports.length > 0 ? t('schedule.signals.reportsToReview', { count: overdueReports.length }) : t('schedule.signals.noUrgent'),
      tone: overdueReports.length > 0 ? 'amber' : 'green',
    },
    {
      icon: MessageSquareText,
      label: 'Team notes',
      value: noPhone.length > 0 ? t('schedule.signals.appointmentsNoPhone', { count: noPhone.length }) : t('schedule.signals.noPendingNotes'),
      tone: noPhone.length > 0 ? 'amber' : 'green',
    },
    {
      icon: UserRound,
      label: 'Patient prep',
      value: todayAppointments.length > 0 ? t('schedule.signals.casesToday', { count: todayAppointments.length }) : t('schedule.signals.noCasesToday'),
      tone: 'green',
    },
  ] as const

  return (
    <aside className="animate-rise space-y-3" style={{ animationDelay: '100ms' }}>
      <div className="rounded-xl border border-bbh-line bg-white p-5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Medical signals</p>
        <div className="mt-4 space-y-3">
          {signals.map((signal) => {
            const Icon = signal.icon
            const toneClass = signal.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark'
            return (
              <div key={signal.label} className="flex items-start gap-3 rounded-lg border border-bbh-line bg-white p-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${toneClass}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">{signal.label}</p>
                  <p className="mt-1 text-sm font-medium text-bbh-ink">{signal.value}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

function AppointmentCard({ apt }: { apt: ScheduleAppointment }) {
  const { t } = useTranslation()
  const isToday = apt.requested_date === todayIso()
  return (
    <div className={`rounded-xl border bg-white p-5 ${isToday ? 'border-bbh-green/40 ring-1 ring-bbh-green/20' : 'border-bbh-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-bbh-muted">
            <Clock size={13} />
            <span className="font-mono tabular-nums text-bbh-ink">{formatTime(apt.requested_time)}</span>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums">{formatThaiDate(apt.requested_date)}</span>
            {isToday ? (
              <span className="rounded-full border border-bbh-green/30 bg-bbh-green-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bbh-green-dark">
                {t('common.today')}
              </span>
            ) : null}
          </div>
          <p className="mt-2 truncate text-base font-semibold text-bbh-ink">{apt.patient_name || t('schedule.unnamedPatient')}</p>
          {apt.symptom ? <p className="mt-1 line-clamp-2 text-sm text-bbh-muted">{apt.symptom}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {apt.video_link ? (
            <a
              href={apt.video_link}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1 rounded-lg bg-bbh-green px-2 py-1 text-xs font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
            >
              <Video size={11} /> {t('schedule.online')}
            </a>
          ) : null}
          {apt.patient_id ? (
            <Link
              to={`/patients?patient=${apt.patient_id}`}
              className={`inline-flex items-center gap-1 rounded-lg border border-bbh-green/30 bg-bbh-green-soft px-2 py-1 text-xs font-semibold text-bbh-green-dark transition-colors duration-200 hover:border-bbh-green ${FOCUS_RING}`}
            >
              {t('schedule.case')} <ExternalLink size={11} />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ReportRow({ r }: { r: ScheduleReport }) {
  const { t } = useTranslation()
  const decision = r.latest_decision ?? 'no_analysis'
  const decisionLabel: Record<string, string> = {
    no_analysis: t('schedule.decision.noAnalysis'),
    pending: t('schedule.decision.pending'),
    review: t('schedule.decision.review'),
    accept: t('schedule.decision.accept'),
    reject: t('schedule.decision.reject'),
  }
  const decisionStyle: Record<string, string> = {
    no_analysis: 'border-bbh-line bg-bbh-surface text-bbh-muted',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    review: 'border-amber-200 bg-amber-50 text-amber-700',
    accept: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
    reject: 'border-red-200 bg-red-50 text-red-700',
  }

  return (
    <Link
      to={`/patients?patient=${r.patient_id}&report=${r.report_id}`}
      className={`grid grid-cols-[1fr_auto] gap-3 bg-white px-4 py-4 transition-colors duration-200 hover:bg-bbh-surface lg:grid-cols-[160px_1fr_140px_120px] ${FOCUS_RING}`}
    >
      <div className="hidden text-sm text-bbh-muted lg:block">
        <p className="font-semibold text-bbh-ink">{r.patient_name}</p>
        <p className="font-mono text-xs tabular-nums">{r.hn ?? '-'}</p>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-bbh-muted lg:hidden">
          <span className="font-semibold text-bbh-ink">{r.patient_name}</span>
          <span aria-hidden>·</span>
          <span className="font-mono tabular-nums">{r.hn ?? '-'}</span>
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold text-bbh-ink">{r.title}</p>
        <p className="mt-0.5 truncate text-xs text-bbh-muted">{r.report_type} · {r.source}</p>
      </div>
      <div className="hidden text-right font-mono text-xs tabular-nums text-bbh-muted lg:block">
        {new Date(r.uploaded_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
      </div>
      <div className="text-right">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${decisionStyle[decision]}`}>
          {decisionLabel[decision] ?? decision}
        </span>
      </div>
    </Link>
  )
}

export function Schedule() {
  const { t } = useTranslation()
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(7)
  const dateFrom = useMemo(() => todayIso(), [])
  const dateTo = useMemo(() => addDaysIso(dateFrom, windowDays), [dateFrom, windowDays])
  const q = useMySchedule({ dateFrom, dateTo })
  const data = q.data

  const sortedAppointments = useMemo(
    () => [...(data?.appointments ?? [])].sort((a, b) => appointmentSortValue(a).localeCompare(appointmentSortValue(b))),
    [data?.appointments],
  )
  const todayAppointments = useMemo(
    () => sortedAppointments.filter((apt) => apt.requested_date === todayIso()),
    [sortedAppointments],
  )
  const nextAppointment = useMemo(() => {
    const now = new Date()
    return todayAppointments.find((apt) => {
      if (!apt.requested_time) return true
      return new Date(`${apt.requested_date}T${apt.requested_time}`).getTime() >= now.getTime() - 45 * 60000
    }) ?? todayAppointments[0] ?? sortedAppointments[0] ?? null
  }, [sortedAppointments, todayAppointments])

  const apptsByDate = useMemo(() => {
    const map = new Map<string, ScheduleAppointment[]>()
    for (const apt of sortedAppointments) {
      const k = apt.requested_date
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(apt)
    }
    return Array.from(map.entries())
  }, [sortedAppointments])

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="min-w-0 flex-1 overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        <div className="animate-rise mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Doctor Today</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('schedule.pageTitle')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              {t('schedule.pageSubtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-bbh-line bg-white p-1 text-xs font-medium">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWindowDays(d as 7 | 14 | 30)}
                  aria-pressed={windowDays === d}
                  className={`rounded-md px-3 py-1.5 transition-colors duration-200 ${FOCUS_RING} ${
                    windowDays === d ? 'bg-bbh-green text-white' : 'text-bbh-muted hover:text-bbh-ink'
                  }`}
                >
                  <span className="font-mono tabular-nums">{d}</span> {t('schedule.daysUnit')}
                </button>
              ))}
            </div>
            <Link
              to="/doctor-calendar"
              className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              <CalendarDays size={15} /> {t('schedule.fullCalendar')}
            </Link>
            <button
              type="button"
              onClick={() => q.refetch()}
              className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
              {t('schedule.refresh')}
            </button>
          </div>
        </div>

        {q.isLoading ? (
          <div className="animate-rise flex items-center justify-center rounded-xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted">
            <Loader2 size={16} className="mr-2 animate-spin" /> {t('schedule.loadingToday')}
          </div>
        ) : q.isError ? (
          <div className="animate-rise rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t('common.loadFailed')}</div>
        ) : data ? (
          <div className="space-y-8">
            <div className="animate-rise grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line sm:grid-cols-2 xl:grid-cols-4" style={{ animationDelay: '50ms' }}>
              <MetricCell label={t('schedule.metrics.todayAppointments')} value={data.stats.today_appointments} icon={CalendarIcon} />
              <MetricCell label={t('schedule.metrics.nextPatient')} value={nextAppointment ? formatTime(nextAppointment.requested_time) : '-'} icon={Stethoscope} tone="ink" />
              <MetricCell label={t('schedule.metrics.reportsToReview')} value={data.stats.pending_reports} icon={ClipboardList} tone={data.stats.pending_reports > 0 ? 'amber' : 'green'} />
              <MetricCell label={t('schedule.metrics.withinDays', { count: windowDays })} value={data.stats.window_appointments} icon={Clock} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <NextPatientPanel apt={nextAppointment} pendingReports={data.pending_reports} />
              <SignalRail todayAppointments={todayAppointments} pendingReports={data.pending_reports} />
            </div>

            <div className="animate-rise" style={{ animationDelay: '140ms' }}>
              <AvailabilitySection />

              <ScheduleBlocksSection />
            </div>

            <section className="animate-rise" style={{ animationDelay: '210ms' }}>
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="font-serif text-lg font-semibold text-bbh-ink md:text-xl">{t('schedule.appointmentTimeline')}</h2>
                <span className="font-mono text-xs tabular-nums text-bbh-muted">{t('schedule.itemsCount', { count: data.appointments.length })}</span>
              </div>
              {data.appointments.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-bbh-line bg-white p-6 text-sm text-bbh-muted">
                  <CheckCircle2 size={16} className="text-bbh-green" />
                  {t('schedule.noAppointmentsInRange')}
                </div>
              ) : (
                <div className="space-y-6">
                  {apptsByDate.map(([date_, items]) => (
                    <div key={date_}>
                      <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
                        {formatThaiDate(date_)}
                        {date_ === todayIso() ? <span className="ml-2 text-bbh-green-dark">· {t('common.today')}</span> : null}
                      </p>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {items.map((apt) => <AppointmentCard key={apt.request_uid} apt={apt} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="animate-rise" style={{ animationDelay: '280ms' }}>
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="font-serif text-lg font-semibold text-bbh-ink md:text-xl">Review queue</h2>
                <span className="font-mono text-xs tabular-nums text-bbh-muted">{t('schedule.itemsCount', { count: data.pending_reports.length })}</span>
              </div>
              {data.pending_reports.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-bbh-line bg-white p-6 text-sm text-bbh-muted">
                  <CheckCircle2 size={16} className="text-bbh-green" />
                  {t('schedule.noPendingReports')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
                  <div className="hidden grid-cols-[160px_1fr_140px_120px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-4 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted lg:grid">
                    <span>{t('schedule.tableHead.patient')}</span>
                    <span>{t('schedule.tableHead.subject')}</span>
                    <span className="text-right">{t('schedule.tableHead.uploadedDate')}</span>
                    <span className="text-right">{t('schedule.tableHead.status')}</span>
                  </div>
                  <div className="divide-y divide-bbh-line">
                    {data.pending_reports.map((r) => <ReportRow key={r.report_id} r={r} />)}
                  </div>
                </div>
              )}
            </section>

            <p className="flex items-center gap-2 text-xs text-bbh-muted">
              <FileText size={12} />
              {t('schedule.footerNote')}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  )
}

// --- Schedule blocks (vacation) ----------------------------------------

function ScheduleBlocksSection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const doctorId = user ? Number(user.id) : undefined
  const q = useScheduleBlocks({ doctorId })
  const create = useCreateScheduleBlock()
  const del = useDeleteScheduleBlock()
  const [open, setOpen] = useState(false)
  const [blockType, setBlockType] = useState('vacation')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [reason, setReason] = useState('')
  const [videoLink, setVideoLink] = useState('')

  if (!doctorId) return null
  const blocks = q.data?.data ?? []

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!startAt || !endAt) return
    create.mutate(
      {
        doctor_id: doctorId, block_type: blockType, start_at: startAt, end_at: endAt,
        reason: reason || null, video_link: videoLink.trim() || null,
      },
      { onSuccess: () => { setOpen(false); setStartAt(''); setEndAt(''); setReason(''); setVideoLink(''); setBlockType('vacation') } },
    )
  }

  const fieldClass =
    `w-full rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30`

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-bbh-ink md:text-xl">
          <CalendarOff size={16} className="text-amber-500" />
          {t('schedule.timeOff.title')}
          <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-xs font-semibold text-bbh-muted">
            <span className="font-mono tabular-nums">{blocks.length}</span>
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
        >
          <Plus size={12} /> {t('schedule.timeOff.addBlock')}
        </button>
      </div>

      {blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-bbh-line bg-white p-4 text-sm text-bbh-muted">{t('schedule.timeOff.empty')}</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {blocks.map((b) => (
            <div key={b.id} className="flex items-start justify-between gap-3 rounded-xl border border-bbh-line bg-white p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-bbh-line bg-bbh-surface px-2 py-0.5 font-mono text-[10px] text-bbh-muted">{b.block_type}</span>
                </div>
                <p className="mt-2 font-mono text-xs tabular-nums text-bbh-ink">
                  {b.start_at.replace('T', ' ').slice(0, 16)}
                  <span className="mx-1 text-bbh-muted">→</span>
                  {b.end_at.replace('T', ' ').slice(0, 16)}
                </p>
                {b.reason ? <p className="mt-1 text-xs text-bbh-muted">{b.reason}</p> : null}
                {b.video_link ? (
                  <a
                    href={b.video_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-2 inline-flex items-center gap-1 rounded-lg border border-bbh-green/40 bg-bbh-green/5 px-2 py-1 text-xs font-medium text-bbh-green-dark transition-colors duration-200 hover:bg-bbh-green/10 ${FOCUS_RING}`}
                  >
                    <Video size={12} /> {t('schedule.joinOnline')}
                  </a>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => { if (confirm(t('schedule.timeOff.confirmDelete'))) del.mutate(b.id) }}
                className={`rounded text-bbh-muted transition-colors duration-200 hover:text-red-600 ${FOCUS_RING}`}
                title={t('common.delete')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} title={t('schedule.timeOff.addBlock')} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('schedule.timeOff.type')}</label>
            <select value={blockType} onChange={(e) => setBlockType(e.target.value)} className={`mt-2 ${fieldClass}`}>
              <option value="vacation">vacation</option>
              <option value="off_hours">off_hours</option>
              <option value="conference">conference</option>
              <option value="sick">sick</option>
              <option value="other">other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('schedule.timeOff.start')}</label>
              <input required type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`mt-2 font-mono tabular-nums ${fieldClass}`} />
            </div>
            <div>
              <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('schedule.timeOff.end')}</label>
              <input required type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={`mt-2 font-mono tabular-nums ${fieldClass}`} />
            </div>
          </div>
          <input type="text" placeholder={t('schedule.timeOff.reasonPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
          <div>
            <input
              type="url"
              placeholder={t('schedule.timeOff.videoLinkPlaceholder')}
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              className={fieldClass}
            />
            <p className="mt-1 text-[11px] text-bbh-muted">{t('schedule.timeOff.videoLinkHint')}</p>
          </div>
          {create.error ? <p className="text-xs text-red-600">{t('schedule.timeOff.saveFailed')}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`rounded-lg border border-bbh-line bg-white px-4 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className={`rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
