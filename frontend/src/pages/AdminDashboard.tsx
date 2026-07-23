import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { Eyebrow } from '../components/ui/Eyebrow'
import { staggerStyle } from '../lib/motion'
import { useAcknowledgeAlert } from '../hooks/useAcknowledgeAlert'
import { useAdminAlertRules } from '../hooks/useAdminAlertRules'
import { useAdminAlertSummary } from '../hooks/useAdminAlertSummary'
import { useAdminAlerts, type AlertOut, type AlertSeverity } from '../hooks/useAdminAlerts'
import { useResolveAlert } from '../hooks/useResolveAlert'

type RoleWorkspace = {
  label: string
  descriptionKey: string
  path: string
  icon: LucideIcon
}

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

// Nurse / Lab workspaces are temporarily hidden via HIDDEN_ROLES — keep
// the definitions so we can re-enable them once those role pages ship.
const HIDDEN_ROLES = new Set<string>(['Go as Nurse', 'Go as Lab'])

const ROLE_WORKSPACES: RoleWorkspace[] = [
  { label: 'Go as CRO', descriptionKey: 'adminDashboard.roleWorkspaceCro', path: '/bookings?as=cro', icon: ClipboardList },
  { label: 'Go as Doctor', descriptionKey: 'adminDashboard.roleWorkspaceDoctor', path: '/schedule?as=doctor', icon: Stethoscope },
  { label: 'Go as Nurse', descriptionKey: 'adminDashboard.roleWorkspaceNurse', path: '/patients?as=nurse', icon: Users },
  { label: 'Go as Lab', descriptionKey: 'adminDashboard.roleWorkspaceLab', path: '/reports?as=lab_staff', icon: FileText },
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

// Signature "vital-sign lead": a thin colored rail that carries severity so the
// row text can stay calm ink. Green is reserved for live/OK, so info reads as a
// neutral lead rather than a brand accent.
const SEVERITY_RAIL: Record<AlertOut['severity'], string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-bbh-muted/50',
}

type TFn = (key: string, opts?: Record<string, unknown>) => string

function formatRelative(iso: string, t: TFn): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.round((Date.now() - then) / 60_000)
  if (diffMin < 1) return t('adminDashboard.justNow')
  if (diffMin < 60) return t('adminDashboard.minutesAgo', { count: diffMin })
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return t('adminDashboard.hoursAgo', { count: diffHr })
  const diffDay = Math.round(diffHr / 24)
  return t('adminDashboard.daysAgo', { count: diffDay })
}

function MetricCard({ label, value, helper, icon: Icon, tone, onClick, active, live }: {
  label: string; value: string | number; helper: string; icon: LucideIcon
  tone?: 'critical' | 'warning' | 'default'
  onClick?: () => void
  active?: boolean
  // `live` lights a gentle beacon dot when this metric is carrying open items
  // that need eyes — a quiet, data-driven "monitoring" pulse, not decoration.
  live?: boolean
}) {
  const iconClass =
    tone === 'critical' ? 'text-red-500' : tone === 'warning' ? 'text-amber-500' : 'text-bbh-green'
  const railClass =
    tone === 'critical' ? 'bg-red-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-bbh-green'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative flex w-full flex-col gap-4 p-6 text-left transition-colors duration-200 ${FOCUS_RING} ${
        active ? 'bg-bbh-surface' : 'bg-white hover:bg-bbh-surface/70'
      }`}
    >
      {/* readout rail — quiet until hovered, lit when this filter is active */}
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-0.5 origin-left transition-transform duration-300 ${railClass} ${
          active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
        }`}
      />
      <div className="flex items-center justify-between gap-3">
        <Eyebrow as="span">{label}</Eyebrow>
        <span className="flex items-center gap-2">
          {live ? (
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className={`absolute inline-flex h-full w-full rounded-full ${railClass} opacity-30`} />
              <span className={`relative inline-flex h-2 w-2 animate-beacon rounded-full ${railClass}`} />
            </span>
          ) : null}
          <Icon size={16} className={iconClass} />
        </span>
      </div>
      <span className="font-mono text-5xl font-semibold leading-none tracking-tight tabular-nums text-bbh-ink">
        {value}
      </span>
      <span className="text-xs leading-relaxed text-bbh-muted">{helper}</span>
    </button>
  )
}

function StatusPill({ status }: { status: AlertOut['status'] }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// หน้าแรกของ admin — ศูนย์รวมภาพรวมระบบ: การ์ด alert ที่ต้องจัดการ (acknowledge/resolve),
// ทางลัดไป workspace ของแต่ละ role และสรุปสถานะ operations ของโรงพยาบาล
export function AdminDashboard() {
  const { t } = useTranslation()
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

  const refreshing = alertsQ.isFetching || summaryQ.isFetching

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Header — instrument masthead with a live monitoring beacon */}
        <div className="animate-rise mb-10 flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full rounded-full bg-bbh-green opacity-30" />
                <span className="relative inline-flex h-2 w-2 animate-beacon rounded-full bg-bbh-green" />
              </span>
              <span className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-bbh-green">
                Admin Control Room
              </span>
            </p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('adminDashboard.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              {t('adminDashboard.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { alertsQ.refetch(); summaryQ.refetch() }}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            {t('adminDashboard.refresh')}
          </button>
        </div>

        {/* Metric cluster — one hairline-ruled panel (gap-px reveals bbh-line as
            rules at every breakpoint) instead of floating cards */}
        <div className="animate-rise mb-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line xl:grid-cols-4" style={{ animationDelay: '70ms' }}>
          <MetricCard
            label="Critical"
            value={summary?.by_severity?.critical ?? 0}
            helper={severityFilter === 'critical' ? t('adminDashboard.helperFiltering') : t('adminDashboard.helperCritical')}
            icon={AlertTriangle}
            tone="critical"
            onClick={() => toggleSeverity('critical')}
            active={severityFilter === 'critical'}
            live={(summary?.by_severity?.critical ?? 0) > 0}
          />
          <MetricCard
            label="Warning"
            value={summary?.by_severity?.warning ?? 0}
            helper={severityFilter === 'warning' ? t('adminDashboard.helperFiltering') : t('adminDashboard.helperWarning')}
            icon={Activity}
            tone="warning"
            onClick={() => toggleSeverity('warning')}
            active={severityFilter === 'warning'}
          />
          <MetricCard
            label="Info"
            value={summary?.by_severity?.info ?? 0}
            helper={severityFilter === 'info' ? t('adminDashboard.helperFiltering') : t('adminDashboard.helperInfo')}
            icon={ShieldCheck}
            onClick={() => toggleSeverity('info')}
            active={severityFilter === 'info'}
          />
          <MetricCard
            label="Roles"
            value="5"
            helper={t('adminDashboard.helperRoles')}
            icon={UserCog}
            onClick={() => navigate('/users')}
          />
        </div>

        <div className="animate-rise mb-10" style={{ animationDelay: '140ms' }}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{t('adminDashboard.roleWorkspaces')}</h2>
            <p className="text-xs text-bbh-muted">{t('adminDashboard.roleWorkspacesHint')}</p>
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
            {ROLE_WORKSPACES.map((item, i) => {
              const Icon = item.icon
              return (
                <a
                  key={item.label}
                  href={item.path}
                  style={staggerStyle(i)}
                  className={`animate-rise group rounded-xl border border-bbh-line bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-bbh-green/40 hover:shadow-bbh-card ${FOCUS_RING}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-bbh-green-soft text-bbh-green-dark transition-colors duration-200 group-hover:bg-bbh-green group-hover:text-white">
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-bbh-ink">{item.label}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-bbh-muted">{t(item.descriptionKey)}</p>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>

        <div className="animate-rise" style={{ animationDelay: '210ms' }}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{t('adminDashboard.actionRequired')}</h2>
            <span className="font-mono text-xs tabular-nums text-bbh-muted">
              {alertsQ.isLoading ? t('adminDashboard.loadingEllipsis') : t('adminDashboard.itemCount', { count: alerts.length })}
            </span>
          </div>
          {severityFilter ? (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setSeverityFilter(null)}
                className={`inline-flex items-center gap-1.5 rounded-full border border-bbh-green/40 bg-bbh-green-soft px-3 py-1 text-xs font-semibold text-bbh-green-dark transition-colors duration-200 hover:border-bbh-green ${FOCUS_RING}`}
                aria-label={t('adminDashboard.clearFilterAria', { severity: severityFilter })}
                title={t('adminDashboard.clearFilter')}
              >
                {t('adminDashboard.filterLabel', { severity: severityFilter })}
                <span aria-hidden className="text-bbh-muted">×</span>
              </button>
            </div>
          ) : null}

          {alertsQ.isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-bbh-line bg-white p-8 text-sm text-bbh-muted">
              <Loader2 size={16} className="mr-2 animate-spin" /> {t('adminDashboard.loadingList')}
            </div>
          ) : alertsQ.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {t('adminDashboard.loadFailedRetry')}
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-bbh-line bg-white p-10 text-center">
              <CheckCircle2 size={32} className="mb-2 text-bbh-green" />
              <p className="text-sm font-semibold text-bbh-ink">{t('adminDashboard.noActionItems')}</p>
              <p className="mt-1 text-xs text-bbh-muted">{t('adminDashboard.systemHealthyHint')}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
              <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-bbh-line bg-bbh-surface px-6 py-4 font-mono text-xs font-medium uppercase tracking-[0.22em] text-bbh-muted lg:grid-cols-[140px_1.3fr_140px_120px]">
                <span>Area</span>
                <span>{t('adminDashboard.colTitle')}</span>
                <span className="hidden lg:block">Last seen</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-bbh-line">
                {alerts.map((a, i) => {
                  const active = a.alert_id === selectedId
                  return (
                    <button
                      key={a.alert_id}
                      type="button"
                      onClick={() => { setSelectedId(a.alert_id); setDetailOpen(true) }}
                      style={staggerStyle(i)}
                      className={`animate-rise relative grid w-full grid-cols-[1fr_auto] gap-3 px-6 py-5 text-left transition-colors duration-200 lg:grid-cols-[140px_1.3fr_140px_120px] ${FOCUS_RING} ${
                        active ? 'bg-bbh-green-soft/60' : 'bg-white hover:bg-bbh-surface'
                      }`}
                    >
                      {/* severity lead rail */}
                      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_RAIL[a.severity]}`} />
                      <div className={`text-sm font-semibold ${SEVERITY_STYLES[a.severity]}`}>
                        {CATEGORY_LABELS[a.rule_category] ?? a.rule_category}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-bbh-ink">{a.title}</p>
                        <p className="mt-1 truncate text-xs text-bbh-muted">
                          {a.rule_display_name} · <span className="font-mono">{a.subject_type}:{a.subject_id}</span>
                        </p>
                      </div>
                      <div className="hidden font-mono text-xs tabular-nums text-bbh-muted lg:block">{formatRelative(a.last_seen_at, t)}</div>
                      <div className="text-right"><StatusPill status={a.status} /></div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="animate-rise hidden w-[380px] overflow-y-auto border-l border-bbh-line bg-bbh-surface/40 p-6 lg:block xl:w-[440px]" style={{ animationDelay: '160ms' }}>
        {severityFilter ? (
          alerts.length === 0 ? (
            <div className="rounded-xl border border-bbh-green/30 bg-bbh-green-soft p-6 text-center">
              <CheckCircle2 size={28} className="mx-auto mb-2 text-bbh-green" />
              <p className="text-sm font-semibold text-bbh-ink">
                {t('adminDashboard.noOpenAlertsForSeverity', { severity: severityFilter })}
              </p>
              <p className="mt-1 text-xs text-bbh-muted">{t('adminDashboard.systemHealthyAtSeverity')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className={`rounded-lg border px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.22em] ${SEVERITY_STYLES[severityFilter]}`}>
                <span className="tabular-nums">{alerts.length}</span> {severityFilter} alert{alerts.length > 1 ? 's' : ''} · {t('adminDashboard.scrollToSeeAll')}
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
          <div className="rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
            {t('adminDashboard.selectAlertHint')}
          </div>
        )}
      </aside>

      <div className="lg:hidden">
        <Modal
          open={detailOpen && Boolean(selected)}
          title={selected?.title ?? t('adminDashboard.detail')}
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
  const { t } = useTranslation()
  const ack = useAcknowledgeAlert()
  const resolve = useResolveAlert()

  const [ackNote, setAckNote] = useState('')
  const [snoozeHours, setSnoozeHours] = useState<number | ''>('')
  const [resolveReason, setResolveReason] = useState('manual_close')
  const [resolveNote, setResolveNote] = useState('')

  const detailEntries = Object.entries(alert.detail_json ?? {})

  const fieldClass =
    'w-full rounded-lg border border-bbh-line px-3 py-2 text-sm transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>
          #{alert.alert_id} · {alert.subject_type}:{alert.subject_id}
        </Eyebrow>
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
        <div className="rounded-xl border border-bbh-line bg-white p-6">
          <Eyebrow>Rule</Eyebrow>
          <p className="mt-2 text-sm font-semibold text-bbh-ink">{alert.rule_display_name}</p>
          <p className="mt-1 text-xs leading-relaxed text-bbh-muted">{ruleDescription}</p>
        </div>
      ) : null}

      {detailEntries.length > 0 ? (
        <div className="rounded-xl border border-bbh-line bg-white p-6">
          <Eyebrow>Context</Eyebrow>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-xs">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-bbh-line/60 py-1 last:border-0">
                <dt className="text-bbh-muted">{k}</dt>
                <dd className="font-mono tabular-nums text-bbh-ink">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="grid grid-cols-1 divide-y divide-bbh-line overflow-hidden rounded-xl border border-bbh-line bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="p-6">
          <Eyebrow>First seen</Eyebrow>
          <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-bbh-ink">{formatRelative(alert.first_seen_at, t)}</p>
        </div>
        <div className="p-6">
          <Eyebrow>Last seen</Eyebrow>
          <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-bbh-ink">{formatRelative(alert.last_seen_at, t)}</p>
        </div>
      </div>

      {alert.status === 'open' ? (
        <div className="rounded-xl border border-bbh-line bg-white p-6">
          <Eyebrow>Acknowledge</Eyebrow>
          <textarea
            value={ackNote}
            onChange={(e) => setAckNote(e.target.value)}
            placeholder={t('adminDashboard.notePlaceholder')}
            rows={2}
            className={`mt-2 ${fieldClass}`}
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
                placeholder={t('adminDashboard.hoursShort')}
                className="w-20 rounded border border-bbh-line px-2 py-1 font-mono tabular-nums transition-colors duration-200 focus:border-bbh-green focus:outline-none"
              />
              {t('adminDashboard.hoursOptional')}
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
            className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-amber-600 disabled:opacity-60 ${FOCUS_RING}`}
          >
            {ack.isPending ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
            Acknowledge
          </button>
        </div>
      ) : null}

      {alert.status !== 'resolved' ? (
        <div className="rounded-xl border border-bbh-line bg-white p-6">
          <Eyebrow>Resolve</Eyebrow>
          <select
            value={resolveReason}
            onChange={(e) => setResolveReason(e.target.value)}
            className={`mt-2 ${fieldClass}`}
          >
            <option value="manual_close">{t('adminDashboard.resolveManualClose')}</option>
            <option value="false_positive">{t('adminDashboard.resolveFalsePositive')}</option>
            <option value="duplicate">{t('adminDashboard.resolveDuplicate')}</option>
            <option value="wont_fix">{t('adminDashboard.resolveWontFix')}</option>
          </select>
          <textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder={t('adminDashboard.notePlaceholder')}
            rows={2}
            className={`mt-2 ${fieldClass}`}
          />
          <button
            type="button"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({
              alertId: alert.alert_id,
              body: { reason: resolveReason, note: resolveNote || null },
            })}
            className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {resolve.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Resolve
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-bbh-green/30 bg-bbh-green-soft p-6 text-sm text-bbh-green-dark">
          {t('adminDashboard.resolvedAt', { when: alert.resolved_at ? formatRelative(alert.resolved_at, t) : '—', reason: alert.resolved_reason ?? 'unknown' })}
        </div>
      )}
    </div>
  )
}
