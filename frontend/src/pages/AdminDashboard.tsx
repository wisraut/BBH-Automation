import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
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
import { useAdminAlerts, type AlertOut } from '../hooks/useAdminAlerts'
import { useResolveAlert } from '../hooks/useResolveAlert'

type RoleWorkspace = {
  label: string
  description: string
  path: string
  icon: LucideIcon
}

const ROLE_WORKSPACES: RoleWorkspace[] = [
  { label: 'Go as CRO', description: 'ดูงาน booking, calendar และการประสานงานคนไข้', path: '/bookings?as=cro', icon: ClipboardList },
  { label: 'Go as Doctor', description: 'ดู schedule และรายงานที่เกี่ยวกับแพทย์', path: '/schedule?as=doctor', icon: Stethoscope },
  { label: 'Go as Nurse', description: 'ดูข้อมูลคนไข้และงานติดตามเชิงปฏิบัติการ', path: '/patients?as=nurse', icon: Users },
  { label: 'Go as Lab', description: 'ดูพื้นที่รายงานและงานแล็บที่ต้องจัดการ', path: '/reports?as=lab_staff', icon: FileText },
]

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

function MetricCard({ label, value, helper, icon: Icon, tone }: {
  label: string; value: string | number; helper: string; icon: LucideIcon; tone?: 'critical' | 'warning' | 'default'
}) {
  const iconClass =
    tone === 'critical' ? 'text-red-500' : tone === 'warning' ? 'text-amber-500' : 'text-bbh-green'
  return (
    <div className="rounded-2xl border border-bbh-line bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bbh-muted">{label}</p>
        <Icon size={18} className={iconClass} />
      </div>
      <p className="mt-2 font-serif text-3xl font-semibold text-bbh-ink">{value}</p>
      <p className="mt-1 text-xs text-bbh-muted">{helper}</p>
    </div>
  )
}

function StatusPill({ status }: { status: AlertOut['status'] }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function AdminDashboard() {
  const alertsQ = useAdminAlerts({ limit: 100 })
  const summaryQ = useAdminAlertSummary()
  const rulesQ = useAdminAlertRules()

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
    <div className="flex h-full min-w-0 overflow-hidden rounded-[20px] border border-bbh-line bg-white/90 shadow-bbh-card backdrop-blur md:rounded-[28px]">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-gradient-to-br from-white via-white to-bbh-green-soft/30 p-4 md:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-green">Admin Control Room</p>
            <h1 className="mt-2 font-serif text-2xl font-semibold text-bbh-ink md:text-3xl">ภาพรวมสำหรับผู้ดูแลระบบ</h1>
            <p className="mt-1 max-w-3xl text-sm text-bbh-muted">
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

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Critical"
            value={summary?.by_severity?.critical ?? 0}
            helper="ต้องจัดการทันที"
            icon={AlertTriangle}
            tone="critical"
          />
          <MetricCard
            label="Warning"
            value={summary?.by_severity?.warning ?? 0}
            helper="ติดตามใกล้ชิด"
            icon={Activity}
            tone="warning"
          />
          <MetricCard
            label="Info"
            value={summary?.by_severity?.info ?? 0}
            helper="ทราบไว้เพื่อตัดสินใจ"
            icon={ShieldCheck}
          />
          <MetricCard
            label="Roles"
            value="5"
            helper="admin, doctor, cro, nurse, lab_staff"
            icon={UserCog}
          />
        </div>

        <div className="mb-6 rounded-2xl border border-bbh-line bg-white/85 p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ExternalLink size={18} className="text-bbh-green" />
            <h2 className="font-serif text-lg font-semibold text-bbh-ink">Role workspaces</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ROLE_WORKSPACES.map((item) => {
              const Icon = item.icon
              return (
                <a
                  key={item.label}
                  href={item.path}
                  className="rounded-2xl border border-bbh-line bg-white p-4 transition hover:border-bbh-green hover:shadow-bbh-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-bbh-green-soft text-bbh-green-dark">
                      <Icon size={19} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-bbh-ink">{item.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-bbh-muted">{item.description}</p>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-bbh-line bg-white/80 p-3 shadow-sm">
          <div className="mr-2 flex items-center gap-2 text-sm font-semibold text-bbh-ink">
            <BellRing size={18} className="text-bbh-green" />
            Action required
          </div>
          <span className="ml-0 text-xs text-bbh-muted sm:ml-auto">
            {alertsQ.isLoading ? 'กำลังโหลด…' : `${alerts.length} รายการ`}
          </span>
        </div>

        {alertsQ.isLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-bbh-line bg-white p-8 text-sm text-bbh-muted">
            <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลดรายการ
          </div>
        ) : alertsQ.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
            <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-bbh-muted lg:grid-cols-[130px_1.3fr_130px_120px]">
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
                    className={`grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-4 text-left transition lg:grid-cols-[130px_1.3fr_130px_120px] ${
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

      <aside className="hidden w-[420px] overflow-y-auto border-l border-bbh-line bg-white/95 p-6 lg:block">
        {selected ? <AlertDetail alert={selected} ruleDescription={rulesByKey[selected.rule_key]?.description ?? null} /> : (
          <div className="rounded-2xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
            เลือก alert จากด้านซ้ายเพื่อดูรายละเอียดและจัดการ
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
        <p className="text-xs uppercase tracking-[0.18em] text-bbh-muted">
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
        <div className="rounded-2xl border border-bbh-line p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-muted">Rule</p>
          <p className="mt-2 text-sm font-semibold text-bbh-ink">{alert.rule_display_name}</p>
          <p className="mt-1 text-xs leading-relaxed text-bbh-muted">{ruleDescription}</p>
        </div>
      ) : null}

      {detailEntries.length > 0 ? (
        <div className="rounded-2xl border border-bbh-line p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-muted">Context</p>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-bbh-line p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bbh-muted">First seen</p>
          <p className="mt-2 text-sm font-semibold text-bbh-ink">{formatRelative(alert.first_seen_at)}</p>
        </div>
        <div className="rounded-2xl border border-bbh-line p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bbh-muted">Last seen</p>
          <p className="mt-2 text-sm font-semibold text-bbh-ink">{formatRelative(alert.last_seen_at)}</p>
        </div>
      </div>

      {alert.status === 'open' ? (
        <div className="rounded-2xl border border-bbh-line p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-muted">Acknowledge</p>
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
        <div className="rounded-2xl border border-bbh-line p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-muted">Resolve</p>
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
        <div className="rounded-2xl border border-bbh-green/30 bg-bbh-green-soft p-4 text-sm text-bbh-green-dark">
          ปิดแล้วเมื่อ {alert.resolved_at ? formatRelative(alert.resolved_at) : '—'} ({alert.resolved_reason ?? 'unknown'})
        </div>
      )}
    </div>
  )
}
