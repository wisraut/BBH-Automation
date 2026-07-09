import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain,
  Calendar as CalendarIcon,
  CalendarOff,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Phone,
  Plus,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Clock,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useMySchedule, type ScheduleAppointment, type ScheduleReport } from '../hooks/useMySchedule'
import { usePatientAiSummary } from '../hooks/usePatientAiSummary'
import { useCreateScheduleBlock, useDeleteScheduleBlock, useScheduleBlocks } from '../hooks/useScheduleBlocks'
import { RescheduleModal } from '../components/bookings/RescheduleModal'
import { PatientPickerModal } from '../components/ai/PatientPickerModal'
import { useAuth } from '../lib/auth'
import type { components } from '../lib/api-types'

type PatientListItem = components['schemas']['PatientListItem']

// Doctor-side "hold a slot for a patient": stored as a schedule block
// (block_type='other') whose reason starts with this marker, so CRO cannot
// double-book the time. Frontend-only — reuses the existing block endpoints.
const LOCK_PREFIX = 'ล็อคคิวคนไข้:'

// Add minutes to a datetime-local "YYYY-MM-DDTHH:MM" string (for default end).
function plusMinutesLocal(dt: string, mins: number): string {
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  d.setMinutes(d.getMinutes() + mins)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">{label}</p>
        <Icon size={18} className={iconClass} />
      </div>
      <p className="mt-2 font-serif text-3xl font-semibold text-bbh-ink">{value}</p>
    </div>
  )
}

function AppointmentCard({ apt, onReschedule }: { apt: ScheduleAppointment; onReschedule?: (apt: ScheduleAppointment) => void }) {
  const isToday = apt.requested_date === todayIso()
  const isPending = apt.status === 'pending_approval'
  const [briefOpen, setBriefOpen] = useState(false)
  const briefM = usePatientAiSummary()
  const canBrief = apt.patient_id !== null

  const loadBrief = () => {
    if (!apt.patient_id) return
    setBriefOpen(true)
    if (!briefM.data && !briefM.isPending) briefM.mutate(apt.patient_id)
  }
  return (
    <div className={`rounded-2xl border bg-white p-6 shadow-sm ${isToday ? 'border-bbh-green/40 ring-1 ring-bbh-green/20' : 'border-bbh-line'}`}>
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
            {isPending ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200">
                รอ CRO
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
          {!isPending && onReschedule ? (
            <button
              type="button"
              onClick={() => onReschedule(apt)}
              className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
              title="เลื่อนนัด"
            >
              <CalendarIcon size={13} /> เลื่อนนัด
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
  const [reschedule, setReschedule] = useState<{ uid: string; text: string | null } | null>(null)
  const dateFrom = useMemo(() => todayIso(), [])
  const dateTo = useMemo(() => addDaysIso(dateFrom, windowDays), [dateFrom, windowDays])
  const q = useMySchedule({ dateFrom, dateTo })
  const data = q.data

  const openReschedule = (apt: ScheduleAppointment) => {
    const text =
      apt.requested_datetime_text ||
      (apt.requested_date ? `${formatThaiDate(apt.requested_date)} ${formatTime(apt.requested_time)}` : null)
    setReschedule({ uid: apt.request_uid, text })
  }

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
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">My Workspace</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">ตารางงาน</h1>
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

          {/* Schedule blocks (vacation) */}
          <ScheduleBlocksSection />

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
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">
                      {formatThaiDate(date_)}
                      {date_ === todayIso() ? <span className="ml-2 text-bbh-green-dark">· วันนี้</span> : null}
                    </p>
                    <div className="grid gap-6 md:grid-cols-2">
                      {items.map((apt) => <AppointmentCard key={apt.request_uid} apt={apt} onReschedule={openReschedule} />)}
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
                <div className="hidden grid-cols-[160px_1fr_140px_120px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-bbh-muted lg:grid">
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

      <RescheduleModal
        open={reschedule !== null}
        uid={reschedule?.uid ?? null}
        currentDateTimeText={reschedule?.text ?? null}
        onClose={() => setReschedule(null)}
        onSuccess={() => q.refetch()}
      />
    </div>
  )
}

// --- Schedule blocks (leave) + patient-slot locks -----------------------

function ScheduleBlocksSection() {
  const { user } = useAuth()
  const doctorId = user ? Number(user.id) : undefined
  const q = useScheduleBlocks({ doctorId })
  const create = useCreateScheduleBlock()
  const del = useDeleteScheduleBlock()

  // Generic block (leave / off-hours / conference).
  const [open, setOpen] = useState(false)
  const [blockType, setBlockType] = useState('vacation')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [reason, setReason] = useState('')

  // Patient-slot lock.
  const [lockOpen, setLockOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lockPatient, setLockPatient] = useState<PatientListItem | null>(null)
  const [lockStart, setLockStart] = useState('')
  const [lockEnd, setLockEnd] = useState('')
  const [lockNote, setLockNote] = useState('')

  if (!doctorId) return null
  const blocks = q.data?.data ?? []

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!startAt || !endAt) return
    create.mutate(
      { doctor_id: doctorId, block_type: blockType, start_at: startAt, end_at: endAt, reason: reason || null },
      { onSuccess: () => { setOpen(false); setStartAt(''); setEndAt(''); setReason(''); setBlockType('vacation') } },
    )
  }

  const resetLock = () => {
    setLockOpen(false); setLockPatient(null); setLockStart(''); setLockEnd(''); setLockNote('')
  }
  const onLockStart = (v: string) => {
    setLockStart(v)
    if (v && !lockEnd) setLockEnd(plusMinutesLocal(v, 30))
  }
  const submitLock = (e: React.FormEvent) => {
    e.preventDefault()
    if (!lockPatient || !lockStart || !lockEnd) return
    const hn = lockPatient.hn ? ` (HN ${lockPatient.hn})` : ''
    const note = lockNote.trim() ? ` — ${lockNote.trim()}` : ''
    const built = `${LOCK_PREFIX} ${lockPatient.display_name}${hn}${note}`
    create.mutate(
      { doctor_id: doctorId, block_type: 'other', start_at: lockStart, end_at: lockEnd, reason: built },
      { onSuccess: resetLock },
    )
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-base font-semibold text-bbh-ink inline-flex items-center gap-2">
          <CalendarOff size={16} className="text-amber-500" />
          เวลาที่ไม่ว่าง / ล็อคคิว
          <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-[11px] text-bbh-muted">{blocks.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLockOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-bbh-green/30 bg-bbh-green-soft px-2 py-1 text-xs font-semibold text-bbh-green-dark hover:border-bbh-green"
          >
            <Lock size={12} /> ล็อคคิวคนไข้
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
          >
            <Plus size={12} /> ลา / ไม่อยู่
          </button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <p className="rounded-2xl border border-bbh-line bg-white p-4 text-sm text-bbh-muted">— ยังไม่มีเวลาที่ไม่ว่างหรือคิวที่ล็อคไว้ —</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {blocks.map((b) => {
            const isLock = b.reason?.startsWith(LOCK_PREFIX) ?? false
            const lockText = isLock ? (b.reason ?? '').slice(LOCK_PREFIX.length).trim() : ''
            return (
              <div key={b.id} className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${isLock ? 'border-bbh-green/30 bg-bbh-green-soft/40' : 'border-bbh-line bg-white'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isLock ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-bbh-green-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bbh-green-dark ring-1 ring-bbh-green/30">
                        <Lock size={10} /> ล็อคคิวคนไข้
                      </span>
                    ) : (
                      <span className="rounded-full border border-bbh-line bg-bbh-surface px-2 py-0.5 text-[10px] font-mono text-bbh-muted">{b.block_type}</span>
                    )}
                  </div>
                  {isLock ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-bbh-ink">
                      <UserRound size={13} className="text-bbh-green-dark" /> {lockText}
                    </p>
                  ) : null}
                  <p className="mt-1 font-mono text-xs text-bbh-ink">
                    {b.start_at.replace('T', ' ').slice(0, 16)}
                    <span className="mx-1 text-bbh-muted">→</span>
                    {b.end_at.replace('T', ' ').slice(0, 16)}
                  </p>
                  {!isLock && b.reason ? <p className="mt-1 text-xs text-bbh-muted">{b.reason}</p> : null}
                </div>
                <button type="button" onClick={() => { if (confirm(isLock ? 'ปลดล็อคคิวนี้?' : 'ลบรายการนี้?')) del.mutate(b.id) }} className="text-bbh-muted hover:text-red-600" title={isLock ? 'ปลดล็อค' : 'ลบ'}><Trash2 size={13} /></button>
              </div>
            )
          })}
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bbh-ink/30" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-bbh-line bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">เพิ่มวันลา / ไม่อยู่</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-bbh-muted hover:text-bbh-ink"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <select value={blockType} onChange={(e) => setBlockType(e.target.value)} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm">
                <option value="vacation">vacation</option>
                <option value="off_hours">off_hours</option>
                <option value="conference">conference</option>
                <option value="sick">sick</option>
                <option value="other">other</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input required type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
                <input required type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
              </div>
              <input type="text" placeholder="หมายเหตุ (เช่น พักร้อน)" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
              {create.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
                <button type="submit" disabled={create.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {lockOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-bbh-ink/30 p-4" onClick={resetLock}>
          <div className="w-full max-w-md rounded-2xl border border-bbh-line bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-xl font-semibold text-bbh-ink inline-flex items-center gap-2 md:text-2xl">
                <Lock size={18} className="text-bbh-green-dark" /> ล็อคคิวคนไข้
              </h3>
              <button type="button" onClick={resetLock} className="text-bbh-muted hover:text-bbh-ink"><X size={18} /></button>
            </div>
            <form onSubmit={submitLock} className="space-y-3">
              {lockPatient ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-bbh-green/30 bg-bbh-green-soft/40 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-bbh-ink">{lockPatient.display_name}</p>
                    <p className="text-xs text-bbh-muted">{lockPatient.hn ? `HN ${lockPatient.hn}` : 'ไม่มี HN'}{lockPatient.phone ? ` · ${lockPatient.phone}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => setPickerOpen(true)} className="shrink-0 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark">เปลี่ยน</button>
                </div>
              ) : (
                <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-bbh-green/40 bg-bbh-green-soft/30 px-3 py-3 text-sm font-medium text-bbh-green-dark hover:border-bbh-green">
                  <UserRound size={15} /> เลือกคนไข้
                </button>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-bbh-muted">ช่วงเวลาที่ล็อค</label>
                <div className="grid grid-cols-2 gap-2">
                  <input required type="datetime-local" value={lockStart} onChange={(e) => onLockStart(e.target.value)} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
                  <input required type="datetime-local" value={lockEnd} onChange={(e) => setLockEnd(e.target.value)} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
                </div>
              </div>
              <input type="text" placeholder="หมายเหตุ (เช่น รอผลแล็บ, ตรวจติดตาม)" value={lockNote} onChange={(e) => setLockNote(e.target.value)} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
              <p className="rounded-lg bg-bbh-surface px-3 py-2 text-xs text-bbh-muted">ล็อคช่วงเวลานี้ไว้ให้คนไข้ — CRO จะจองทับไม่ได้ แล้วค่อยเปลี่ยนเป็นนัดจริงในระบบ CRO</p>
              {create.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={resetLock} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
                <button type="submit" disabled={create.isPending || !lockPatient} className="inline-flex items-center gap-1 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">
                  {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} ล็อคคิว
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <PatientPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => setLockPatient(p)}
        title="เลือกคนไข้ที่จะล็อคคิว"
      />
    </section>
  )
}
