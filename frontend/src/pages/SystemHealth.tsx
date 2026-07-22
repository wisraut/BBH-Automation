import { useMemo } from 'react'
import { dateLocale } from '../i18n/datetime'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Server,
  Webhook,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Eyebrow } from '../components/ui/Eyebrow'
import { useSystemHealth, type ServiceCheck, type ServiceStatus } from '../hooks/useSystemHealth'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const SERVICE_ICONS: Record<string, LucideIcon> = {
  bridge: Server,
  mysql_bot_ops: Database,
  n8n: Activity,
  line_main_webhook: Webhook,
  line_cro_webhook: Webhook,
}

const SERVICE_LABELS: Record<string, string> = {
  bridge: 'Bridge (FastAPI)',
  mysql_bot_ops: 'MySQL bot_ops',
  n8n: 'n8n Workflow',
  line_main_webhook: 'LINE Main Bot',
  line_cro_webhook: 'LINE CRO Bot',
}

// Status carries meaning through a semantic dot + lead rail, not a big fill.
// Green is reserved for healthy — a warn/down cell stays calm ink text.
const STATUS_STYLES: Record<ServiceStatus, { dot: string; rail: string; badge: string; label: string }> = {
  ok: {
    dot: 'bg-bbh-green',
    rail: 'bg-bbh-green',
    badge: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
    label: 'OK',
  },
  warn: {
    dot: 'bg-amber-500',
    rail: 'bg-amber-500',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    label: 'Warn',
  },
  error: {
    dot: 'bg-red-500',
    rail: 'bg-red-500',
    badge: 'border-red-200 bg-red-50 text-red-700',
    label: 'Down',
  },
}

const DB_STAT_LABEL_KEYS: Record<string, string> = {
  patients: 'systemHealth.dbStatPatients',
  active_users: 'systemHealth.dbStatActiveUsers',
  active_doctors: 'systemHealth.dbStatActiveDoctors',
  pending_bookings: 'systemHealth.dbStatPendingBookings',
  today_bookings: 'systemHealth.dbStatTodayBookings',
  today_reports: 'systemHealth.dbStatTodayReports',
  open_alerts: 'systemHealth.dbStatOpenAlerts',
  webhook_pending: 'systemHealth.dbStatWebhookPending',
  webhook_failed_24h: 'systemHealth.dbStatWebhookFailed24h',
}

const ACTIVITY_KIND_LABEL: Record<string, string> = {
  booking: 'BOOK',
  report: 'REP',
  alert: 'ALRT',
}

type TFn = (key: string, opts?: Record<string, unknown>) => string

function formatRelative(iso: string, t: TFn): string {
  const then = new Date(iso).getTime()
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 5) return t('systemHealth.justNow')
  if (diffSec < 60) return t('systemHealth.secondsAgo', { count: diffSec })
  if (diffSec < 3600) return t('systemHealth.minutesAgo', { count: Math.round(diffSec / 60) })
  const diffHr = Math.round(diffSec / 3600)
  if (diffHr < 24) return t('systemHealth.hoursAgo', { count: diffHr })
  return t('systemHealth.daysAgo', { count: Math.round(diffHr / 24) })
}

function ServiceCard({ check }: { check: ServiceCheck }) {
  const Icon = SERVICE_ICONS[check.name] ?? Activity
  const label = SERVICE_LABELS[check.name] ?? check.name
  const s = STATUS_STYLES[check.status]
  return (
    <div className="relative flex flex-col gap-3 bg-white p-6">
      {/* status lead rail — carries state so the card body stays calm ink */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${s.rail}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative shrink-0 text-bbh-muted">
            <Icon size={18} />
            {/* healthy beacon pulses; warn/down hold a steady dot */}
            {check.status === 'ok' ? (
              <span className="absolute -right-1 -top-1 flex h-2 w-2" aria-hidden>
                <span className={`absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-30`} />
                <span className={`relative inline-flex h-2 w-2 animate-beacon rounded-full ${s.dot}`} />
              </span>
            ) : (
              <span aria-hidden className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${s.dot}`} />
            )}
          </span>
          <p className="truncate text-sm font-semibold text-bbh-ink">{label}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${s.badge}`}>
          {s.label}
        </span>
      </div>
      {check.detail ? (
        <p className="truncate text-xs leading-relaxed text-bbh-muted">{check.detail}</p>
      ) : null}
      {typeof check.latency_ms === 'number' ? (
        <p className="font-mono text-xs tabular-nums text-bbh-muted">{check.latency_ms} ms</p>
      ) : null}
    </div>
  )
}

// หน้าเฝ้าดูสุขภาพระบบ (admin เท่านั้น) — สถานะ health check ของแต่ละ service (DB, RAG,
// LINE, Google Calendar ฯลฯ) พร้อม latency เพื่อจับปัญหา infra ก่อนกระทบผู้ใช้
export function SystemHealth() {
  const { t } = useTranslation()
  const q = useSystemHealth()
  const data = q.data

  const overallStyle = data ? STATUS_STYLES[data.overall] : STATUS_STYLES.ok
  const dbStatsEntries = useMemo(() => {
    if (!data?.db_stats) return []
    return Object.entries(data.db_stats).filter(([k]) => k !== 'error')
  }, [data])

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Masthead — instrument label with a live monitoring beacon */}
        <div className="animate-rise mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full rounded-full bg-bbh-green opacity-30" />
                <span className="relative inline-flex h-2 w-2 animate-beacon rounded-full bg-bbh-green" />
              </span>
              <span className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-bbh-green">
                System Monitor
              </span>
            </p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('systemHealth.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              {t('systemHealth.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data ? (
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${overallStyle.badge}`}>
                <span className={`h-2 w-2 rounded-full ${overallStyle.dot}`} />
                {t('systemHealth.overallLabel', { status: overallStyle.label })}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => q.refetch()}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
              {t('systemHealth.refresh')}
            </button>
          </div>
        </div>

        {q.isLoading ? (
          <div className="animate-rise flex items-center justify-center rounded-xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted">
            <Loader2 size={16} className="mr-2 animate-spin" /> {t('systemHealth.checkingStatus')}
          </div>
        ) : q.isError ? (
          <div className="animate-rise rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} />
              {t('systemHealth.loadFailedBackendDown')}
            </div>
          </div>
        ) : data ? (
          <div className="space-y-12">
            {/* Services — one hairline-ruled cluster; gap-px reveals bbh-line */}
            <section className="animate-rise" style={{ animationDelay: '70ms' }}>
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">Services</h2>
                <span className="font-mono text-xs tabular-nums text-bbh-muted">{data.services.length} services</span>
              </div>
              <div className="grid gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line sm:grid-cols-2 xl:grid-cols-3">
                {data.services.map((s) => (
                  <ServiceCard key={s.name} check={s} />
                ))}
              </div>
            </section>

            {/* DB stats — metric cluster, all figures mono tabular-nums */}
            <section className="animate-rise" style={{ animationDelay: '140ms' }}>
              <h2 className="mb-4 font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{t('systemHealth.dbStatsHeading')}</h2>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line md:grid-cols-3 xl:grid-cols-7">
                {dbStatsEntries.map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-3 bg-white p-6">
                    <Eyebrow>
                      {DB_STAT_LABEL_KEYS[key] ? t(DB_STAT_LABEL_KEYS[key]) : key}
                    </Eyebrow>
                    <p className="font-mono text-3xl font-semibold leading-none tabular-nums text-bbh-ink">
                      {String(value)}
                    </p>
                  </div>
                ))}
              </div>
              {data.db_stats.error ? (
                <p className="mt-3 text-xs text-red-600">DB error: {String(data.db_stats.error)}</p>
              ) : null}
            </section>

            {/* Recent activity — hairline list */}
            <section className="animate-rise" style={{ animationDelay: '210ms' }}>
              <h2 className="mb-4 font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{t('systemHealth.recentActivity')}</h2>
              {data.recent_activity.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-bbh-line bg-white p-6 text-sm text-bbh-muted">
                  <CheckCircle2 size={16} className="text-bbh-green" />
                  {t('systemHealth.noActivity')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
                  <div className="divide-y divide-bbh-line">
                    {data.recent_activity.map((a, i) => (
                      <div
                        key={`${a.kind}-${a.subject}-${i}`}
                        className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-6 py-4 text-sm"
                      >
                        <span className="rounded-full border border-bbh-line bg-bbh-surface px-2 py-0.5 text-center font-mono text-xs font-semibold uppercase tracking-wider text-bbh-muted">
                          {ACTIVITY_KIND_LABEL[a.kind] ?? a.kind}
                        </span>
                        <span className="truncate text-bbh-ink">{a.summary}</span>
                        <span className="text-right font-mono text-xs tabular-nums text-bbh-muted">{formatRelative(a.ts, t)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <p className="text-right font-mono text-xs tabular-nums text-bbh-muted">
              {t('systemHealth.lastChecked', { time: new Date(data.checked_at).toLocaleTimeString(dateLocale()) })}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
