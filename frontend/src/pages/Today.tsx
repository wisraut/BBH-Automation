// Doctor "วันนี้" dashboard — action-oriented summary of what needs attention today.
// Phase 1 wires the real /api/schedule/me data (today appts + pending reports + counts).
// The richer aside (pinned patient, biomarker mini, program tracker) and the dedicated
// /api/doctors/me/summary metric set arrive in later phases.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Calendar,
  CalendarClock,
  Clock,
  FlaskConical,
  Loader2,
  Sparkles,
  Stethoscope,
} from 'lucide-react'

import { useMySchedule, type ScheduleAppointment, type ScheduleReport } from '../hooks/useMySchedule'
import { useAuth } from '../lib/auth'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
function formatThaiToday(): string {
  return new Date().toLocaleDateString('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'สวัสดีตอนเช้า'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}
function formatTime(t: string | null): string {
  if (!t) return '-'
  return t.slice(0, 5)
}

// Triage decision → colored pill. Bound to real latest_decision; no hardcoded state.
function triageTone(decision: string | null): { label: string; className: string } {
  switch (decision) {
    case 'review':
      return { label: 'ต้องรีวิว', className: 'bg-red-50 text-red-600 ring-1 ring-red-200' }
    case 'pending':
      return { label: 'รอวิเคราะห์', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' }
    case 'accept':
      return { label: 'รับทราบ', className: 'bg-bbh-green-soft text-bbh-green-dark ring-1 ring-bbh-green/30' }
    case 'reject':
      return { label: 'ตีกลับ', className: 'bg-bbh-line/60 text-bbh-muted ring-1 ring-bbh-line' }
    default:
      return { label: 'ใหม่', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' }
  }
}

function MetricCard({
  to,
  label,
  value,
  hint,
  icon: Icon,
  tone = 'green',
}: {
  to: string
  label: string
  value: number | string
  hint: string
  icon: typeof Stethoscope
  tone?: 'green' | 'amber'
}) {
  const iconClass = tone === 'amber' ? 'text-amber-500' : 'text-bbh-green'
  const valueClass = tone === 'amber' ? 'text-amber-600' : 'text-bbh-ink'
  return (
    <Link
      to={to}
      className="group rounded-2xl bg-white/80 p-6 ring-1 ring-bbh-line transition-all duration-200 hover:shadow-sm hover:ring-bbh-green/40"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">{label}</p>
        <Icon size={18} className={iconClass} />
      </div>
      <p className={`mt-3 font-serif text-5xl font-semibold leading-none tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-bbh-muted opacity-70 transition-opacity group-hover:opacity-100">
        {hint}
        <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
      </p>
    </Link>
  )
}

function ActionRow({ report }: { report: ScheduleReport }) {
  const tone = triageTone(report.latest_decision)
  return (
    <Link
      to={`/patients?patient=${report.patient_id}&report=${report.report_id}`}
      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-bbh-green-soft/50"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bbh-surface text-bbh-green-dark ring-1 ring-bbh-line">
        <FlaskConical size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-bbh-ink">{report.patient_name}</p>
        <p className="truncate text-xs text-bbh-muted">
          {report.title}
          {report.hn ? ` · ${report.hn}` : ''}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.className}`}>{tone.label}</span>
      <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-bbh-green-dark group-hover:flex">
        รีวิว <ArrowRight size={12} />
      </span>
    </Link>
  )
}

function QueueRow({ apt }: { apt: ScheduleAppointment }) {
  const isPending = apt.status === 'pending_approval'
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-bbh-line">
      <span className="w-12 shrink-0 font-mono text-xs font-semibold text-bbh-muted">{formatTime(apt.requested_time)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-bbh-ink">{apt.patient_name || '(ไม่ระบุชื่อ)'}</p>
        {apt.symptom ? <p className="truncate text-xs text-bbh-muted">{apt.symptom}</p> : null}
      </div>
      {isPending ? (
        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
          รอ CRO
        </span>
      ) : apt.appointment_type ? (
        <span className="shrink-0 rounded-full bg-bbh-green-soft px-2.5 py-1 text-[11px] font-semibold text-bbh-green-dark">
          {apt.appointment_type}
        </span>
      ) : null}
    </div>
  )
}

export function Today() {
  const { user } = useAuth()
  const scheduleQ = useMySchedule()
  const data = scheduleQ.data

  const todaysAppointments = useMemo(
    () => (data?.appointments ?? []).filter((a) => a.requested_date === todayIso()),
    [data],
  )
  const pendingReports = data?.pending_reports ?? []

  const firstName = (user?.display_name || '').split(' ')[0] || 'คุณหมอ'
  const pendingTotal = todaysAppointments.length + pendingReports.length

  return (
    <div className="h-full space-y-6 overflow-y-auto pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-bbh-muted">
            {formatThaiToday()}
            {scheduleQ.isSuccess ? ` · วันนี้มี ${todaysAppointments.length} คิว · ${pendingTotal} รายการรอจัดการ` : ''}
          </p>
        </div>
        <Link
          to="/ai"
          className="inline-flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2.5 text-sm font-semibold text-bbh-green-dark ring-1 ring-bbh-line transition-all duration-200 hover:ring-bbh-green/40"
        >
          <Sparkles size={16} /> ถาม BBH AI
        </Link>
      </div>

      {/* Metric cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          to="/schedule"
          label="คิววันนี้"
          value={data?.stats.today_appointments ?? '—'}
          hint="ดูตารางนัด"
          icon={Calendar}
        />
        <MetricCard
          to="/reports"
          label="ผลแล็บรอรีวิว"
          value={data?.stats.pending_reports ?? '—'}
          hint="ไปที่ผลแล็บ"
          icon={FlaskConical}
          tone="amber"
        />
        <MetricCard
          to="/schedule"
          label="นัดใน 7 วัน"
          value={data?.stats.window_appointments ?? '—'}
          hint="ดูทั้งสัปดาห์"
          icon={CalendarClock}
        />
      </div>

      {scheduleQ.isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-bbh-muted">
          <Loader2 size={18} className="animate-spin" /> กำลังโหลด...
        </div>
      ) : scheduleQ.isError ? (
        <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600 ring-1 ring-red-200">
          โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Action queue: pending reports (real, actionable) */}
          <section className="rounded-2xl bg-white/80 p-6 ring-1 ring-bbh-line">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">รอหมอจัดการ</h2>
              <span className="text-xs font-semibold text-bbh-muted">{pendingReports.length} รายการ</span>
            </div>
            <p className="mt-1 text-xs text-bbh-muted">ผลแล็บที่มอบหมายให้คุณและยังไม่ได้รีวิว</p>
            <div className="mt-4 space-y-1">
              {pendingReports.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-bbh-muted">
                  <Stethoscope size={22} className="text-bbh-green" />
                  ไม่มีงานค้าง — เคลียร์หมดแล้ว
                </div>
              ) : (
                pendingReports.map((r) => <ActionRow key={r.report_id} report={r} />)
              )}
            </div>
          </section>

          {/* Today's queue + AI aside */}
          <div className="space-y-6">
            <section className="rounded-2xl bg-white/80 p-6 ring-1 ring-bbh-line">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">คิววันนี้</h2>
                <span className="text-xs font-semibold text-bbh-muted">{todaysAppointments.length} คน</span>
              </div>
              <div className="mt-4 space-y-2">
                {todaysAppointments.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-bbh-muted">
                    <Clock size={20} className="text-bbh-muted" />
                    วันนี้ยังไม่มีนัด
                  </div>
                ) : (
                  todaysAppointments.map((a) => <QueueRow key={a.request_uid} apt={a} />)
                )}
              </div>
            </section>

            <Link
              to="/ai"
              className="group flex items-center gap-3 rounded-2xl bg-bbh-green-soft/60 p-6 ring-1 ring-bbh-green/20 transition-all duration-200 hover:ring-bbh-green/40"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-bbh-green-dark ring-1 ring-bbh-green/20">
                <Bot size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-bbh-ink">ถาม AI ผู้ช่วย</p>
                <p className="text-xs text-bbh-muted">สรุปเคส · ค้นข้อมูลคนไข้ · ช่วยตัดสินใจ</p>
              </div>
              <ArrowRight size={16} className="shrink-0 text-bbh-green-dark transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
