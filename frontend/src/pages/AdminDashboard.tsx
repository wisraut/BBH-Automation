import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UserCog,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Modal } from '../components/Modal'
import { useAcknowledgeAlert } from '../hooks/useAcknowledgeAlert'
import { useAdminAlertRules } from '../hooks/useAdminAlertRules'
import { useAdminAlertSummary } from '../hooks/useAdminAlertSummary'
import { useAdminAlerts, type AlertOut, type AlertSeverity } from '../hooks/useAdminAlerts'
import { useResolveAlert } from '../hooks/useResolveAlert'

type RoleWorkspace = {
  label: string
  description: string
  path: string
  icon: LucideIcon
}

// Nurse / Lab workspaces are temporarily hidden via HIDDEN_ROLES — keep
// the definitions so we can re-enable them once those role pages ship.
const HIDDEN_ROLES = new Set<string>(['Go as Nurse', 'Go as Lab'])

const ROLE_WORKSPACES: RoleWorkspace[] = [
  { label: 'Go as CRO', description: 'ดูงาน booking, calendar และการประสานงานคนไข้', path: '/bookings?as=cro', icon: ClipboardList },
  { label: 'Go as Doctor', description: 'ดู schedule และรายงานที่เกี่ยวกับแพทย์', path: '/schedule?as=doctor', icon: Stethoscope },
  { label: 'Go as Nurse', description: 'ดูข้อมูลคนไข้และงานติดตามเชิงปฏิบัติการ', path: '/patients?as=nurse', icon: Users },
  { label: 'Go as Lab', description: 'ดูพื้นที่รายงานและงานแล็บที่ต้องจัดการ', path: '/reports?as=lab_staff', icon: FileText },
].filter((w) => !HIDDEN_ROLES.has(w.label))

const CATEGORY_LABELS: Record<string, string> = {
  operations: 'Operations',
  security: 'Security',
  integration: 'Integration',
  data_quality: 'Data Quality',
}

const STATUS_LABELS: Record<AlertOut['status'], string> = {
  open: 'Open',
  acknowledged: 'Reviewing',
  resolved: 'OK',
}

const STATUS_STYLES: Record<AlertOut['status'], string> = {
  open: 'border-red-200 bg-red-50 text-red-700',
  acknowledged: 'border-amber-200 bg-amber-50 text-amber-700',
  resolved: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
}

const SEVERITY_STYLES: Record<AlertOut['severity'], string> = {
  critical: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-bbh-muted',
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.round((Date.now() - then) / 60_000)
  if (diffMin < 1) return 'เมื่อกี้'
  if (diffMin < 60) return `${diffMin} นาทีก่อน`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} ชม.ที่แล้ว`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay} วันก่อน`
}

function MetricCard({ label, value, helper, icon: Icon, tone, onClick, active }: {
  label: string; value: string | number; helper: string; icon: LucideIcon
  tone?: 'critical' | 'warning' | 'default'
  onClick?: () => void
  active?: boolean
}) {
  const iconClass =
    tone === 'critical' ? 'text-red-500' : tone === 'warning' ? 'text-amber-500' : 'text-bbh-green'
  const activeState =
    active
      ? tone === 'critical'
        ? 'ring-2 ring-red-400 bg-red-50/60'
        : tone === 'warning'
          ? 'ring-2 ring-amber-400 bg-amber-50/60'
          : 'ring-2 ring-bbh-green bg-bbh-green-soft/40'
      : 'ring-1 ring-bbh-line hover:ring-bbh-green/40 hover:shadow-sm'
  const className =
    `group rounded-2xl bg-white p-6 transition-all duration-200 ${activeState} ` +
    (onClick ? 'cursor-pointer text-left w-full' : '')

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bbh-muted">{label}</p>
        <Icon size={18} className={iconClass} />
      </div>
      <p className="mt-4 font-serif text-5xl font-semibold leading-none tracking-tight text-bbh-ink">{value}</p>
      <p className={`mt-4 text-xs leading-relaxed text-bbh-muted transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>{helper}</p>
    </>
  )
  if (onClick) {
    return <button type="button" onClick={onClick} className={className}>{content}</button>
  }
  return <div className={className}>{content}</div>
}

function StatusPill({ status }: { status: AlertOut['status'] }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function AdminDashboard() {
  const navigate = useNavigate()
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | null>(null)
  const alertsQ = useAdminAlerts({ limit: 100, severity: severityFilter ?? undefined })
  const summaryQ = useAdminAlertSummary()
  const rulesQ = useAdminAlertRules()

  const toggleSeverity = (s: AlertSeverity) => {
    setSeverityFilter((cur) => (cur === s ? null : s))
  }

  const alerts = alertsQ.data?.data ?? []
  const summary = summaryQ.data
  const rulesByKey = useMemo(
    () => Object.fromEntries((rulesQ.data ?? []).map((r) => [r.rule_key, r])),
    [rulesQ.data],
  )

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const selected = alerts.find((a) => a.alert_id === selectedId) ?? null

  return (
    <div className="flex h-full min-w-0 overflow-hidden rounded-2xl bg-white/70 backdrop-blur">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-gradient-to-br from-white via-white to-bbh-green-soft/30 p-6 md:p-8 lg:p-10">
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">Admin Control Room</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">ภาพรวมสำหรับผู้ดูแลระบบ</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              หน้านี้แสดงเรื่องที่ต้องลงมือทำ (Action Required) ความเสี่ยง ระบบ และ compliance ของโรงพยาบาล
            </p>
          </div>
          <button
            type="button"
            onClick={() => { alertsQ.refetch(); summaryQ.refetch() }}
            className="inline-flex items-center gap-2 rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink hover:border-bbh-green"
          >
            <RefreshCw size={15} />
            รีเฟรช
          </button>
        </div>

        <div className="mb-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Critical"
            value={summary?.by_severity?.critical ?? 0}
            helper={severityFilter === 'critical' ? 'กำลังกรอง — คลิกอีกครั้งเพื่อยกเลิก' : 'ต้องจัดการทันที — คลิกเพื่อกรอง'}
            icon={AlertTriangle}
            tone="critical"
            onClick={() => toggleSeverity('critical')}
            active={severityFilter === 'critical'}
          />
          <MetricCard
            label="Warning"
            value={summary?.by_severity?.warning ?? 0}
            helper={severityFilter === 'warning' ? 'กำลังกรอง — คลิกอีกครั้งเพื่อยกเลิก' : 'ติดตามใกล้ชิด — คลิกเพื่อกรอง'}
            icon={Activity}
            tone="warning"
            onClick={() => toggleSeverity('warning')}
            active={severityFilter === 'warning'}
          />
          <MetricCard
            label="Info"
            value={summary?.by_severity?.info ?? 0}
            helper={severityFilter === 'info' ? 'กำลังกรอง — คลิกอีกครั้งเพื่อยกเลิก' : 'ทราบไว้เพื่อตัดสินใจ — คลิกเพื่อกรอง'}
            icon={ShieldCheck}
            onClick={() => toggleSeverity('info')}
            active={severityFilter === 'info'}
          />
          <MetricCard
            label="Roles"
            value="5"
            helper="admin, doctor, cro, nurse, lab_staff — คลิกเพื่อจัดการ"
            icon={UserCog}
            onClick={() => navigate('/users')}
          />
        </div>

        <div className="mb-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">Role workspaces</h2>
            <p className="text-xs text-bbh-muted">เข้าใช้งานในมุมของแต่ละ role</p>
          </div>
          <div
            className={`grid gap-4 ${
              ROLE_WORKSPACES.length >= 4
                ? 'md:grid-cols-2 xl:grid-cols-4'
                : ROLE_WORKSPACES.length === 3
                  ? 'md:grid-cols-3'
                  : 'md:grid-cols-2'
            }`}
          >
            {ROLE_WORKSPACES.map((item) => {
              const Icon = item.icon
              return (
                <a
                  key={item.label}
                  href={item.path}
                  className="group group rounded-2xl bg-white p-6 ring-1 ring-bbh-line transition-all duration-200 hover:ring-bbh-green/40 hover:shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bbh-green-soft text-bbh-green-dark transition group-hover:bg-bbh-green group-hover:text-white">
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-bbh-ink">{item.label}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-bbh-muted">{item.description}</p>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">Action required</h2>
          <span className="text-xs text-bbh-muted">
            {alertsQ.isLoading ? 'กำลังโหลด…' : `${alerts.length} รายการ`}
          </span>
        </div>
        {severityFilter ? (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setSeverityFilter(null)}
              className="inline-flex items-center gap-1 rounded-full border border-bbh-green/40 bg-bbh-green-soft px-3 py-1 text-xs font-semibold text-bbh-green-dark hover:border-bbh-green"
              title="ยกเลิกตัวกรอง"
            >
              กรอง: {severityFilter}
              <span className="text-bbh-muted">×</span>
            </button>
          </div>
        ) : null}

        {alertsQ.isLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-bbh-line bg-white p-8 text-sm text-bbh-muted">
            <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลดรายการ
          </div>
        ) : alertsQ.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ — ลองรีเฟรชอีกครั้ง
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-bbh-line bg-white p-10 text-center">
            <CheckCircle2 size={32} className="mb-2 text-bbh-green" />
            <p className="text-sm font-semibold text-bbh-ink">ไม่มีรายการที่ต้องดำเนินการ</p>
            <p className="mt-1 text-xs text-bbh-muted">ระบบ healthy — รีเฟรชเพื่อตรวจซ้ำ</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-bbh-line bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-bbh-line bg-bbh-surface px-6 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted lg:grid-cols-[140px_1.3fr_140px_120px]">
              <span>Area</span>
              <span>เรื่อง</span>
              <span className="hidden lg:block">Last seen</span>
              <span className="text-right">Status</span>
            </div>
            <div className="divide-y divide-bbh-line">
              {alerts.map((a) => {
                const active = a.alert_id === selectedId
                return (
                  <button
                    key={a.alert_id}
                    type="button"
                    onClick={() => { setSelectedId(a.alert_id); setDetailOpen(true) }}
                    className={`grid w-full grid-cols-[1fr_auto] gap-3 px-6 py-6 text-left transition lg:grid-cols-[140px_1.3fr_140px_120px] ${
                      active ? 'bg-bbh-green-soft/60' : 'bg-white hover:bg-bbh-surface'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${SEVERITY_STYLES[a.severity]}`}>
                      {CATEGORY_LABELS[a.rule_category] ?? a.rule_category}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-bbh-ink">{a.title}</p>
                      <p className="mt-1 truncate text-xs text-bbh-muted">
                        {a.rule_display_name} · {a.subject_type}:{a.subject_id}
                      </p>
                    </div>
                    <div className="hidden text-sm text-bbh-muted lg:block">{formatRelative(a.last_seen_at)}</div>
                    <div className="text-right"><StatusPill status={a.status} /></div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <aside className="hidden w-[380px] overflow-y-auto border-l border-bbh-line bg-white/95 p-6 lg:block xl:w-[440px]">
        {severityFilter ? (
          alerts.length === 0 ? (
            <div className="rounded-2xl border border-bbh-green/30 bg-bbh-green-soft p-6 text-center">
              <CheckCircle2 size={28} className="mx-auto mb-2 text-bbh-green" />
              <p className="text-sm font-semibold text-bbh-ink">
                ไม่มี {severityFilter} alert เปิดอยู่
              </p>
              <p className="mt-1 text-xs text-bbh-muted">ระบบ healthy ในระดับความรุนแรงนี้</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className={`rounded-xl border px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] ${SEVERITY_STYLES[severityFilter]}`}>
                {alerts.length} {severityFilter} alert{alerts.length > 1 ? 's' : ''} · เลื่อนดูทุกอัน
              </div>
              {alerts.map((a, i) => (
                <div key={a.alert_id} className={i < alerts.length - 1 ? 'border-b border-bbh-line pb-6' : ''}>
                  <AlertDetail alert={a} ruleDescription={rulesByKey[a.rule_key]?.description ?? null} />
                </div>
              ))}
            </div>
          )
        ) : selected ? (
          <AlertDetail alert={selected} ruleDescription={rulesByKey[selected.rule_key]?.description ?? null} />
        ) : (
          <div className="rounded-2xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
            เลือก alert จากด้านซ้าย หรือกด Critical/Warning/Info เพื่อกรอง
          </div>
        )}
      </aside>

      <div className="lg:hidden">
        <Modal
          open={detailOpen && Boolean(selected)}
          title={selected?.title ?? 'รายละเอียด'}
          onClose={() => setDetailOpen(false)}
          size="lg"
        >
          {selected ? <AlertDetail alert={selected} ruleDescription={rulesByKey[selected.rule_key]?.description ?? null} compact /> : null}
        </Modal>
      </div>
    </div>
  )
}

function AlertDetail({ alert, ruleDescription, compact = false }: {
  alert: AlertOut; ruleDescription: string | null; compact?: boolean
}) {
  const ack = useAcknowledgeAlert()
  const resolve = useResolveAlert()

  const [ackNote, setAckNote] = useState('')
  const [snoozeHours, setSnoozeHours] = useState<number | ''>('')
  const [resolveReason, setResolveReason] = useState('manual_close')
  const [resolveNote, setResolveNote] = useState('')

  const detailEntries = Object.entries(alert.detail_json ?? {})

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-bbh-muted">
          #{alert.alert_id} · {alert.subject_type}:{alert.subject_id}
        </p>
        <h2 className={`${compact ? 'text-xl' : 'text-2xl'} mt-1 font-serif font-semibold text-bbh-ink`}>{alert.title}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill status={alert.status} />
          <span className={`rounded-full border border-bbh-line bg-white px-3 py-1 text-xs font-semibold ${SEVERITY_STYLES[alert.severity]}`}>
            {alert.severity}
          </span>
          <span className="rounded-full border border-bbh-line bg-white px-3 py-1 text-xs font-semibold text-bbh-muted">
            {CATEGORY_LABELS[alert.rule_category] ?? alert.rule_category}
          </span>
        </div>
      </div>

      {ruleDescription ? (
        <div className="rounded-2xl border border-bbh-line p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">Rule</p>
          <p className="mt-2 text-sm font-semibold text-bbh-ink">{alert.rule_display_name}</p>
          <p className="mt-1 text-xs leading-relaxed text-bbh-muted">{ruleDescription}</p>
        </div>
      ) : null}

      {detailEntries.length > 0 ? (
        <div className="rounded-2xl border border-bbh-line p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">Context</p>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-xs">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-bbh-muted">{k}</dt>
                <dd className="font-mono text-bbh-ink">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-bbh-line p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">First seen</p>
          <p className="mt-2 text-sm font-semibold text-bbh-ink">{formatRelative(alert.first_seen_at)}</p>
        </div>
        <div className="rounded-2xl border border-bbh-line p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">Last seen</p>
          <p className="mt-2 text-sm font-semibold text-bbh-ink">{formatRelative(alert.last_seen_at)}</p>
        </div>
      </div>

      {alert.status === 'open' ? (
        <div className="rounded-2xl border border-bbh-line p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">Acknowledge</p>
          <textarea
            value={ackNote}
            onChange={(e) => setAckNote(e.target.value)}
            placeholder="หมายเหตุ (ไม่บังคับ)"
            rows={2}
            className="mt-2 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2 text-xs text-bbh-muted">
            <label className="flex items-center gap-1">
              Snooze
              <input
                type="number"
                min={1}
                max={720}
                value={snoozeHours}
                onChange={(e) => setSnoozeHours(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="ชม."
                className="w-20 rounded border border-bbh-line px-2 py-1"
              />
              ชม. (ไม่บังคับ)
            </label>
          </div>
          <button
            type="button"
            disabled={ack.isPending}
            onClick={() => ack.mutate({
              alertId: alert.alert_id,
              body: {
                note: ackNote || null,
                snooze_hours: snoozeHours === '' ? null : snoozeHours,
              },
            })}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {ack.isPending ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
            Acknowledge
          </button>
        </div>
      ) : null}

      {alert.status !== 'resolved' ? (
        <div className="rounded-2xl border border-bbh-line p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-muted">Resolve</p>
          <select
            value={resolveReason}
            onChange={(e) => setResolveReason(e.target.value)}
            className="mt-2 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm"
          >
            <option value="manual_close">ปิด — แก้ไขเสร็จแล้ว</option>
            <option value="false_positive">ปิด — เป็น false positive</option>
            <option value="duplicate">ปิด — ซ้ำกับรายการอื่น</option>
            <option value="wont_fix">ปิด — won&apos;t fix</option>
          </select>
          <textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="หมายเหตุ (ไม่บังคับ)"
            rows={2}
            className="mt-2 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none"
          />
          <button
            type="button"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({
              alertId: alert.alert_id,
              body: { reason: resolveReason, note: resolveNote || null },
            })}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60"
          >
            {resolve.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Resolve
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-bbh-green/30 bg-bbh-green-soft p-6 text-sm text-bbh-green-dark">
          ปิดแล้วเมื่อ {alert.resolved_at ? formatRelative(alert.resolved_at) : '—'} ({alert.resolved_reason ?? 'unknown'})
        </div>
      )}
    </div>
  )
}
