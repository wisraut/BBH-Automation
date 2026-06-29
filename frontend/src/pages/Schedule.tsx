import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain,
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  Phone,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Clock,
} from 'lucide-react'
import { useMySchedule, type ScheduleAppointment, type ScheduleReport } from '../hooks/useMySchedule'
import { usePatientAiSummary } from '../hooks/usePatientAiSummary'

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
  return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatTime(t: string | null): string {
  if (!t) return '-'
  return t.slice(0, 5)
}

function StatCard({ label, value, icon: Icon, tone = 'green' }: {
  label: string; value: number | string; icon: typeof Stethoscope; tone?: 'green' | 'amber' | 'red'
}) {
  const iconClass = tone === 'red' ? 'text-red-500' : tone === 'amber' ? 'text-amber-500' : 'text-bbh-green'
  return (
    <div className="rounded-2xl border border-bbh-line bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bbh-muted">{label}</p>
        <Icon size={18} className={iconClass} />
      </div>
      <p className="mt-2 font-serif text-3xl font-semibold text-bbh-ink">{value}</p>
    </div>
  )
}

function AppointmentCard({ apt }: { apt: ScheduleAppointment }) {
  const isToday = apt.requested_date === todayIso()
  const [briefOpen, setBriefOpen] = useState(false)
  const briefM = usePatientAiSummary()
  const canBrief = apt.patient_id !== null

  const loadBrief = () => {
    if (!apt.patient_id) return
    setBriefOpen(true)
    if (!briefM.data && !briefM.isPending) briefM.mutate(apt.patient_id)
  }
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${isToday ? 'border-bbh-green/40 ring-1 ring-bbh-green/20' : 'border-bbh-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-bbh-muted">
            <Clock size={13} />
            <span className="font-mono">{formatTime(apt.requested_time)}</span>
            <span>·</span>
            <span>{formatThaiDate(apt.requested_date)}</span>
            {isToday ? (
              <span className="rounded-full bg-bbh-green-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bbh-green-dark">
                วันนี้
              </span>
            ) : null}
          </div>
          <p className="mt-2 truncate text-base font-semibold text-bbh-ink">{apt.patient_name || '(ไม่ระบุชื่อ)'}</p>
          {apt.symptom ? (
            <p className="mt-1 line-clamp-2 text-sm text-bbh-muted">{apt.symptom}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-bbh-muted">
            {apt.phone ? (
              <a href={`tel:${apt.phone}`} className="inline-flex items-center gap-1 hover:text-bbh-green-dark">
                <Phone size={12} /> {apt.phone}
              </a>
            ) : null}
            {apt.appointment_type ? <span>· {apt.appointment_type}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {apt.calendar_event_url ? (
            <a
              href={apt.calendar_event_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
              title="เปิดใน Google Calendar"
            >
              <CalendarIcon size={13} /> Calendar
            </a>
          ) : null}
          {canBrief ? (
            <button
              type="button"
              onClick={loadBrief}
              className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
              title="สรุปก่อนตรวจ"
            >
              <Brain size={13} /> AI brief
            </button>
          ) : null}
          {apt.patient_id ? (
            <Link
              to={`/patients?patient=${apt.patient_id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-bbh-green/30 bg-bbh-green-soft px-2 py-1 text-xs font-semibold text-bbh-green-dark hover:border-bbh-green"
            >
              คนไข้ <ExternalLink size={11} />
            </Link>
          ) : null}
        </div>
      </div>
      {briefOpen ? (
        <div className="mt-3 rounded-xl border border-bbh-green/30 bg-bbh-green-soft/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-bbh-green-dark">
              <Sparkles size={12} /> สรุปก่อนตรวจ (AI)
            </p>
            <button type="button" onClick={() => setBriefOpen(false)} className="text-xs text-bbh-muted hover:text-bbh-ink">ซ่อน</button>
          </div>
          {briefM.isPending ? (
            <p className="inline-flex items-center gap-2 text-sm text-bbh-muted"><Loader2 size={14} className="animate-spin" /> กำลังสรุป...</p>
          ) : briefM.error ? (
            <p className="text-sm text-red-700">โหลด AI brief ไม่สำเร็จ</p>
          ) : briefM.data ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-bbh-ink">{briefM.data.summary}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ReportRow({ r }: { r: ScheduleReport }) {
  const decision = r.latest_decision ?? 'no_analysis'
  const decisionLabel: Record<string, string> = {
    no_analysis: 'ยังไม่วิเคราะห์',
    pending: 'รอแพทย์ตัดสิน',
    review: 'รอ review',
    accept: 'รับ',
    reject: 'ปฏิเสธ',
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
      className="grid grid-cols-[1fr_auto] gap-3 border-b border-bbh-line bg-white px-4 py-3 transition last:border-b-0 hover:bg-bbh-surface lg:grid-cols-[160px_1fr_140px_120px]"
    >
      <div className="hidden text-sm text-bbh-muted lg:block">
        <p className="font-semibold text-bbh-ink">{r.patient_name}</p>
        <p className="font-mono text-xs">{r.hn ?? '-'}</p>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-bbh-muted lg:hidden">
          <span className="font-semibold text-bbh-ink">{r.patient_name}</span>
          <span>·</span>
          <span className="font-mono">{r.hn ?? '-'}</span>
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold text-bbh-ink">{r.title}</p>
        <p className="mt-0.5 truncate text-xs text-bbh-muted">{r.report_type} · {r.source}</p>
      </div>
      <div className="hidden text-right text-xs text-bbh-muted lg:block">
        {new Date(r.uploaded_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
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
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(7)
  const dateFrom = useMemo(() => todayIso(), [])
  const dateTo = useMemo(() => addDaysIso(dateFrom, windowDays), [dateFrom, windowDays])
  const q = useMySchedule({ dateFrom, dateTo })
  const data = q.data

  // Group appointments by date
  const apptsByDate = useMemo(() => {
    const map = new Map<string, ScheduleAppointment[]>()
    for (const apt of data?.appointments ?? []) {
      const k = apt.requested_date
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(apt)
    }
    return Array.from(map.entries())
  }, [data])

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto rounded-[20px] border border-bbh-line bg-white/90 p-4 shadow-bbh-card backdrop-blur md:rounded-[28px] md:p-7">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-green">My Workspace</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-bbh-ink md:text-3xl">ตารางงาน</h1>
          <p className="mt-1 text-sm text-bbh-muted">
            นัดหมายและรายงานที่ได้รับมอบหมายให้กับท่าน — เริ่ม {formatThaiDate(dateFrom)} ถึง {formatThaiDate(dateTo)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-bbh-line bg-white p-1 text-xs font-medium">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d as 7 | 14 | 30)}
                className={`rounded-lg px-3 py-1.5 ${windowDays === d ? 'bg-bbh-green text-white' : 'text-bbh-muted hover:text-bbh-ink'}`}
              >
                {d} วัน
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-2 rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink hover:border-bbh-green"
          >
            <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted">
          <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลดตารางงาน
        </div>
      ) : q.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <StatCard label="วันนี้" value={data.stats.today_appointments} icon={CalendarIcon} tone="green" />
            <StatCard label={`ใน ${windowDays} วัน`} value={data.stats.window_appointments} icon={Stethoscope} tone="green" />
            <StatCard
              label="Report รอตัดสิน"
              value={data.stats.pending_reports}
              icon={ClipboardList}
              tone={data.stats.pending_reports > 0 ? 'amber' : 'green'}
            />
          </div>

          {/* Appointments grouped by date */}
          <section>
            <h2 className="mb-3 font-serif text-base font-semibold text-bbh-ink">นัดหมาย</h2>
            {data.appointments.length === 0 ? (
              <div className="flex items-center gap-2 rounded-2xl border border-bbh-line bg-white p-6 text-sm text-bbh-muted">
                <CheckCircle2 size={16} className="text-bbh-green" />
                ไม่มีนัดหมายในช่วงเวลานี้
              </div>
            ) : (
              <div className="space-y-4">
                {apptsByDate.map(([date_, items]) => (
                  <div key={date_}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-bbh-muted">
                      {formatThaiDate(date_)}
                      {date_ === todayIso() ? <span className="ml-2 text-bbh-green-dark">· วันนี้</span> : null}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {items.map((apt) => <AppointmentCard key={apt.request_uid} apt={apt} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pending reports */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-serif text-base font-semibold text-bbh-ink">Report ที่ต้องดู</h2>
              <span className="text-xs text-bbh-muted">{data.pending_reports.length} รายการ</span>
            </div>
            {data.pending_reports.length === 0 ? (
              <div className="flex items-center gap-2 rounded-2xl border border-bbh-line bg-white p-6 text-sm text-bbh-muted">
                <CheckCircle2 size={16} className="text-bbh-green" />
                ไม่มี report ค้างให้พิจารณา
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-bbh-line bg-white shadow-sm">
                <div className="hidden grid-cols-[160px_1fr_140px_120px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-bbh-muted lg:grid">
                  <span>คนไข้</span>
                  <span>เรื่อง</span>
                  <span className="text-right">วันที่อัพโหลด</span>
                  <span className="text-right">สถานะ</span>
                </div>
                <div className="divide-y divide-bbh-line">
                  {data.pending_reports.map((r) => <ReportRow key={r.report_id} r={r} />)}
                </div>
              </div>
            )}
          </section>

          {/* footer hint */}
          <p className="flex items-center gap-2 text-xs text-bbh-muted">
            <FileText size={12} />
            คลิก report เพื่อไปยังหน้าคนไข้และตัดสินใจ (รับ / ปฏิเสธ / review)
          </p>
        </div>
      ) : null}
    </div>
  )
}
