import { useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Loader2,
  RefreshCw,
  Server,
  Webhook,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useSystemHealth, type ServiceCheck, type ServiceStatus } from '../hooks/useSystemHealth'

const SERVICE_ICONS: Record<string, LucideIcon> = {
  bridge: Server,
  mysql_bot_ops: Database,
  dify_api: Cpu,
  n8n: Activity,
  line_main_webhook: Webhook,
  line_cro_webhook: Webhook,
}

const SERVICE_LABELS: Record<string, string> = {
  bridge: 'Bridge (FastAPI)',
  mysql_bot_ops: 'MySQL bot_ops',
  dify_api: 'Dify API',
  n8n: 'n8n Workflow',
  line_main_webhook: 'LINE Main Bot',
  line_cro_webhook: 'LINE CRO Bot',
}

const STATUS_STYLES: Record<ServiceStatus, { dot: string; ring: string; label: string; pill: string }> = {
  ok: {
    dot: 'bg-bbh-green',
    ring: 'ring-bbh-green/30',
    label: 'OK',
    pill: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
  },
  warn: {
    dot: 'bg-amber-500',
    ring: 'ring-amber-500/30',
    label: 'Warn',
    pill: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  error: {
    dot: 'bg-red-500',
    ring: 'ring-red-500/30',
    label: 'Down',
    pill: 'border-red-200 bg-red-50 text-red-700',
  },
}

const DB_STAT_LABELS: Record<string, string> = {
  patients: 'คนไข้ทั้งหมด',
  active_users: 'User ที่ active',
  active_doctors: 'แพทย์ active',
  pending_bookings: 'จองรอ approve',
  today_bookings: 'จองวันนี้',
  today_reports: 'รายงานวันนี้',
  open_alerts: 'Alert ค้าง',
  webhook_pending: 'Webhook คิวค้าง',
  webhook_failed_24h: 'Webhook fail 24h',
}

const ACTIVITY_KIND_LABEL: Record<string, string> = {
  booking: 'BOOK',
  report: 'REP',
  alert: 'ALRT',
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 5) return 'เมื่อกี้'
  if (diffSec < 60) return `${diffSec} วิ`
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} นาที`
  const diffHr = Math.round(diffSec / 3600)
  if (diffHr < 24) return `${diffHr} ชม.`
  return `${Math.round(diffHr / 24)} วัน`
}

function ServiceCard({ check }: { check: ServiceCheck }) {
  const Icon = SERVICE_ICONS[check.name] ?? Activity
  const label = SERVICE_LABELS[check.name] ?? check.name
  const s = STATUS_STYLES[check.status]
  return (
    <div className="rounded-2xl border border-bbh-line bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0 pt-0.5 text-bbh-muted">
          <Icon size={20} />
          <span className={`absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${s.dot}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-bbh-ink">{label}</p>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.pill}`}>
              {s.label}
            </span>
          </div>
          {check.detail ? (
            <p className="mt-1 truncate text-xs text-bbh-muted">{check.detail}</p>
          ) : null}
          {typeof check.latency_ms === 'number' ? (
            <p className="mt-0.5 font-mono text-[11px] text-bbh-muted">{check.latency_ms} ms</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function SystemHealth() {
  const q = useSystemHealth()
  const data = q.data

  const overallStyle = data ? STATUS_STYLES[data.overall] : STATUS_STYLES.ok
  const dbStatsEntries = useMemo(() => {
    if (!data?.db_stats) return []
    return Object.entries(data.db_stats).filter(([k]) => k !== 'error')
  }, [data])

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto rounded-[20px] border border-bbh-line bg-white/90 p-4 shadow-bbh-card backdrop-blur md:rounded-[28px] md:p-7">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-green">System Monitor</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-bbh-ink md:text-3xl">สถานะระบบโรงพยาบาล</h1>
          <p className="mt-1 text-sm text-bbh-muted">
            ตรวจสถานะของ Bridge, Dify, n8n, MySQL, LINE webhooks และข้อมูลล่าสุดในระบบ — รีเฟรชอัตโนมัติทุก 5 วินาที
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data ? (
            <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold ${overallStyle.pill}`}>
              <span className={`h-2 w-2 rounded-full ${overallStyle.dot}`} />
              ภาพรวม: {overallStyle.label}
            </div>
          ) : null}
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
          <Loader2 size={16} className="mr-2 animate-spin" /> กำลังตรวจสถานะ
        </div>
      ) : q.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            โหลดข้อมูลไม่ได้ — backend อาจ down
          </div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Services grid */}
          <section>
            <h2 className="mb-3 font-serif text-base font-semibold text-bbh-ink">Services</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.services.map((s) => (
                <ServiceCard key={s.name} check={s} />
              ))}
            </div>
          </section>

          {/* DB stats */}
          <section>
            <h2 className="mb-3 font-serif text-base font-semibold text-bbh-ink">ข้อมูลในระบบ</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
              {dbStatsEntries.map(([key, value]) => (
                <div key={key} className="rounded-2xl border border-bbh-line bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bbh-muted">
                    {DB_STAT_LABELS[key] ?? key}
                  </p>
                  <p className="mt-2 font-serif text-2xl font-semibold text-bbh-ink">{String(value)}</p>
                </div>
              ))}
            </div>
            {data.db_stats.error ? (
              <p className="mt-2 text-xs text-red-600">DB error: {String(data.db_stats.error)}</p>
            ) : null}
          </section>

          {/* Recent activity */}
          <section>
            <h2 className="mb-3 font-serif text-base font-semibold text-bbh-ink">Activity ล่าสุด</h2>
            {data.recent_activity.length === 0 ? (
              <div className="flex items-center gap-2 rounded-2xl border border-bbh-line bg-white p-4 text-sm text-bbh-muted">
                <CheckCircle2 size={16} className="text-bbh-green" />
                ยังไม่มี activity
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-bbh-line bg-white shadow-sm">
                <div className="divide-y divide-bbh-line">
                  {data.recent_activity.map((a, i) => (
                    <div key={`${a.kind}-${a.subject}-${i}`} className="grid grid-cols-[80px_1fr_90px] items-center gap-3 px-4 py-3 text-sm">
                      <span className="rounded-full border border-bbh-line bg-bbh-surface px-2 py-0.5 text-center font-mono text-[10px] font-bold uppercase tracking-wider text-bbh-muted">
                        {ACTIVITY_KIND_LABEL[a.kind] ?? a.kind}
                      </span>
                      <span className="truncate text-bbh-ink">{a.summary}</span>
                      <span className="text-right font-mono text-xs text-bbh-muted">{formatRelative(a.ts)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <p className="text-right text-[11px] text-bbh-muted">
            ตรวจล่าสุด: {new Date(data.checked_at).toLocaleTimeString('th-TH')}
          </p>
        </div>
      ) : null}
    </div>
  )
}
