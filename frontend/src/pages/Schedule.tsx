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
  Phone,
  Plus,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Clock,
  Trash2,
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { useMySchedule, type ScheduleAppointment, type ScheduleReport } from '../hooks/useMySchedule'
import { usePatientAiSummary } from '../hooks/usePatientAiSummary'
import { useCreateScheduleBlock, useDeleteScheduleBlock, useScheduleBlocks } from '../hooks/useScheduleBlocks'
import { useAuth } from '../lib/auth'

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
  return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatTime(t: string | null): string {
  if (!t) return '-'
  return t.slice(0, 5)
}

// Stat cell — lives inside a hairline-ruled cluster (gap-px reveals bbh-line as
// rules) rather than floating as its own card. Numbers read as instrument
// readouts in mono/tabular so they line up column-to-column.
function StatCard({ label, value, icon: Icon, tone = 'green' }: {
  label: string; value: number | string; icon: typeof Stethoscope; tone?: 'green' | 'amber' | 'red'
}) {
  const iconClass = tone === 'red' ? 'text-red-500' : tone === 'amber' ? 'text-amber-500' : 'text-bbh-green'
  return (
    <div className="flex flex-col gap-4 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{label}</p>
        <Icon size={16} className={iconClass} />
      </div>
      <p className="font-mono text-4xl font-semibold leading-none tracking-tight tabular-nums text-bbh-ink">{value}</p>
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
    <div className={`rounded-xl border bg-white p-6 ${isToday ? 'border-bbh-green/40 ring-1 ring-bbh-green/20' : 'border-bbh-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-bbh-muted">
            <Clock size={13} />
            <span className="font-mono tabular-nums text-bbh-ink">{formatTime(apt.requested_time)}</span>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums">{formatThaiDate(apt.requested_date)}</span>
            {isToday ? (
              <span className="rounded-full border border-bbh-green/30 bg-bbh-green-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bbh-green-dark">
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
              <a href={`tel:${apt.phone}`} className={`inline-flex items-center gap-1 rounded transition-colors duration-200 hover:text-bbh-green-dark ${FOCUS_RING}`}>
                <Phone size={12} /> <span className="font-mono tabular-nums">{apt.phone}</span>
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
              className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
              title="เปิดใน Google Calendar"
            >
              <CalendarIcon size={13} /> Calendar
            </a>
          ) : null}
          {canBrief ? (
            <button
              type="button"
              onClick={loadBrief}
              className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
              title="สรุปก่อนตรวจ"
            >
              <Brain size={13} /> AI brief
            </button>
          ) : null}
          {apt.patient_id ? (
            <Link
              to={`/patients?patient=${apt.patient_id}`}
              className={`inline-flex items-center gap-1 rounded-lg border border-bbh-green/30 bg-bbh-green-soft px-2 py-1 text-xs font-semibold text-bbh-green-dark transition-colors duration-200 hover:border-bbh-green ${FOCUS_RING}`}
            >
              คนไข้ <ExternalLink size={11} />
            </Link>
          ) : null}
        </div>
      </div>
      {briefOpen ? (
        <div className="mt-3 rounded-xl border border-bbh-green/30 bg-bbh-green-soft/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-green-dark">
              <Sparkles size={12} /> สรุปก่อนตรวจ (AI)
            </p>
            <button type="button" onClick={() => setBriefOpen(false)} className={`rounded text-xs text-bbh-muted transition-colors duration-200 hover:text-bbh-ink ${FOCUS_RING}`}>ซ่อน</button>
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
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="min-w-0 flex-1 overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Masthead — instrument label + serif heading, controls on the right */}
        <div className="animate-rise mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">My Workspace</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">ตารางงาน</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              นัดหมายและรายงานที่ได้รับมอบหมายให้กับท่าน — เริ่ม{' '}
              <span className="font-mono tabular-nums">{formatThaiDate(dateFrom)}</span> ถึง{' '}
              <span className="font-mono tabular-nums">{formatThaiDate(dateTo)}</span>
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
                  <span className="font-mono tabular-nums">{d}</span> วัน
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => q.refetch()}
              className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
              รีเฟรช
            </button>
          </div>
        </div>

        {q.isLoading ? (
          <div className="animate-rise flex items-center justify-center rounded-xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted" style={{ animationDelay: '70ms' }}>
            <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลดตารางงาน
          </div>
        ) : q.isError ? (
          <div className="animate-rise rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700" style={{ animationDelay: '70ms' }}>
            โหลดข้อมูลไม่สำเร็จ
          </div>
        ) : data ? (
          <div className="space-y-10">
            {/* Stat cluster — one hairline-ruled panel (gap-px reveals bbh-line as
                rules) instead of floating cards */}
            <div className="animate-rise grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line sm:grid-cols-3" style={{ animationDelay: '70ms' }}>
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
            <div className="animate-rise" style={{ animationDelay: '140ms' }}>
              <ScheduleBlocksSection />
            </div>

            {/* Appointments grouped by date */}
            <section className="animate-rise" style={{ animationDelay: '210ms' }}>
              <h2 className="mb-4 font-serif text-lg font-semibold text-bbh-ink md:text-xl">นัดหมาย</h2>
              {data.appointments.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-bbh-line bg-white p-6 text-sm text-bbh-muted">
                  <CheckCircle2 size={16} className="text-bbh-green" />
                  ไม่มีนัดหมายในช่วงเวลานี้
                </div>
              ) : (
                <div className="space-y-6">
                  {apptsByDate.map(([date_, items]) => (
                    <div key={date_}>
                      <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
                        {formatThaiDate(date_)}
                        {date_ === todayIso() ? <span className="ml-2 text-bbh-green-dark">· วันนี้</span> : null}
                      </p>
                      <div className="grid gap-6 md:grid-cols-2">
                        {items.map((apt) => <AppointmentCard key={apt.request_uid} apt={apt} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Pending reports */}
            <section className="animate-rise" style={{ animationDelay: '280ms' }}>
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="font-serif text-lg font-semibold text-bbh-ink md:text-xl">Report ที่ต้องดู</h2>
                <span className="font-mono text-xs tabular-nums text-bbh-muted">{data.pending_reports.length} รายการ</span>
              </div>
              {data.pending_reports.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-bbh-line bg-white p-6 text-sm text-bbh-muted">
                  <CheckCircle2 size={16} className="text-bbh-green" />
                  ไม่มี report ค้างให้พิจารณา
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
                  <div className="hidden grid-cols-[160px_1fr_140px_120px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-4 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted lg:grid">
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
      </section>
    </div>
  )
}

// --- Schedule blocks (vacation) ----------------------------------------

function ScheduleBlocksSection() {
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

  const fieldClass =
    `w-full rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30`

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-bbh-ink md:text-xl">
          <CalendarOff size={16} className="text-amber-500" />
          ลา / ไม่อยู่
          <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-xs font-semibold text-bbh-muted">
            <span className="font-mono tabular-nums">{blocks.length}</span>
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
        >
          <Plus size={12} /> เพิ่ม block
        </button>
      </div>

      {blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-bbh-line bg-white p-4 text-sm text-bbh-muted">— ไม่มีรายการลา —</p>
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
              </div>
              <button
                type="button"
                onClick={() => { if (confirm('ลบรายการนี้?')) del.mutate(b.id) }}
                className={`rounded text-bbh-muted transition-colors duration-200 hover:text-red-600 ${FOCUS_RING}`}
                title="ลบ"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} title="เพิ่ม block" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">ประเภท</label>
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
              <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">เริ่ม</label>
              <input required type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`mt-2 font-mono tabular-nums ${fieldClass}`} />
            </div>
            <div>
              <label className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">สิ้นสุด</label>
              <input required type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={`mt-2 font-mono tabular-nums ${fieldClass}`} />
            </div>
          </div>
          <input type="text" placeholder="หมายเหตุ (เช่น พักร้อน)" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
          {create.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`rounded-lg border border-bbh-line bg-white px-4 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className={`rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
            >
              บันทึก
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
