import { useMemo, useState } from 'react'
import { dateLocale } from '../i18n/datetime'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import { Eyebrow } from '../components/ui/Eyebrow'
import { SkeletonList } from '../components/ui/Skeleton'
import { staggerStyle } from '../lib/motion'
import { useAuditLog, type AuditEntry } from '../hooks/useAuditLog'
import { useUsers } from '../hooks/useUsers'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const ACTIONS: Array<{ key: string; labelKey: string }> = [
  { key: '', labelKey: 'auditLog.actionAll' },
  { key: 'view_patient', labelKey: 'auditLog.actionViewPatient' },
  { key: 'list_patients', labelKey: 'auditLog.actionListPatients' },
  { key: 'view_report', labelKey: 'auditLog.actionViewReport' },
  { key: 'download_report', labelKey: 'auditLog.actionDownloadReport' },
  { key: 'list_reports', labelKey: 'auditLog.actionListReports' },
  { key: 'analyze_report', labelKey: 'auditLog.actionAnalyzeReport' },
  { key: 'decide_triage', labelKey: 'auditLog.actionDecideTriage' },
]

// Colour is reserved for the one action that matters most on a compliance scan:
// download_report = PHI leaving the system (amber = pay attention). Every other
// audited action is neutral — the text label identifies it (palette discipline).
const ACTION_STYLES: Record<string, string> = {
  view_patient: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  list_patients: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  view_report: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  download_report: 'border-amber-200 bg-amber-50 text-amber-700',
  list_reports: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  analyze_report: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  decide_triage: 'border-bbh-line bg-bbh-surface text-bbh-muted',
}

function todayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}
function nowIso(): string {
  return new Date().toISOString().slice(0, 16)
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(dateLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// หน้าดู audit trail ทั้งระบบ (admin เท่านั้น) — ใครเข้าดู/ดาวน์โหลด record คนไข้เมื่อไหร่
// สำหรับ compliance ระดับ HIPAA-like; กรองตาม action และ user พร้อม pagination
export function AuditLog() {
  const { t } = useTranslation()
  const usersQ = useUsers({ limit: 100 })
  const userOptions = useMemo(() => usersQ.data?.data ?? [], [usersQ.data])

  const [actorId, setActorId] = useState<number | undefined>(undefined)
  const [action, setAction] = useState<string>('')
  const [patientIdInput, setPatientIdInput] = useState<string>('')
  const [patientId, setPatientId] = useState<number | undefined>(undefined)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [page, setPage] = useState(1)

  const q = useAuditLog({
    actorId,
    action: action || undefined,
    patientId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: 50,
  })

  const clearFilters = () => {
    setActorId(undefined); setAction(''); setPatientIdInput(''); setPatientId(undefined)
    setDateFrom(''); setDateTo(''); setPage(1)
  }

  const applyPatientId = () => {
    const n = parseInt(patientIdInput, 10)
    setPatientId(Number.isFinite(n) ? n : undefined)
    setPage(1)
  }

  const fieldClass = `rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30 ${FOCUS_RING}`

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Masthead — instrument label + serif heading, quick-range actions on the right */}
        <div className="animate-rise mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>Audit Trail</Eyebrow>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('auditLog.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              {t('auditLog.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => { setDateFrom(todayIso()); setDateTo(nowIso()); setPage(1) }}
              className={`rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              {t('common.today')}
            </button>
            <button
              type="button"
              onClick={() => q.refetch()}
              className={`inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
              {t('auditLog.refresh')}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="animate-rise mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" style={{ animationDelay: '70ms' }}>
          <select
            value={actorId ?? ''}
            onChange={(e) => { setActorId(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}
            className={fieldClass}
          >
            <option value="">{t('auditLog.allUsers')}</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>{u.display_name} ({u.role})</option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className={fieldClass}
          >
            {ACTIONS.map((a) => <option key={a.key} value={a.key}>{t(a.labelKey)}</option>)}
          </select>
          <input
            type="text"
            inputMode="numeric"
            value={patientIdInput}
            onChange={(e) => setPatientIdInput(e.target.value.replace(/\D/g, ''))}
            onBlur={applyPatientId}
            onKeyDown={(e) => { if (e.key === 'Enter') applyPatientId() }}
            placeholder="patient_id"
            className={`w-full font-mono tabular-nums ${fieldClass}`}
          />
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className={`font-mono tabular-nums ${fieldClass}`}
          />
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className={`font-mono tabular-nums ${fieldClass}`}
          />
        </div>

        {(actorId || action || patientId || dateFrom || dateTo) ? (
          <div className="animate-rise mb-4 flex items-center gap-2" style={{ animationDelay: '100ms' }}>
            <button type="button" onClick={clearFilters} className={`rounded text-xs text-bbh-muted underline transition-colors hover:text-bbh-ink ${FOCUS_RING}`}>{t('auditLog.clearAllFilters')}</button>
          </div>
        ) : null}

        {/* Table */}
        <div className="animate-rise" style={{ animationDelay: '140ms' }}>
          {q.isLoading ? (
            <SkeletonList rows={6} rowClassName="h-12 rounded-lg" className="space-y-2" />
          ) : q.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t('common.loadFailed')}</div>
          ) : !q.data || q.data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-bbh-line bg-white p-10 text-center">
              <ShieldCheck size={28} className="mb-2 text-bbh-green" />
              <p className="text-sm font-semibold text-bbh-ink">{t('auditLog.noEvents')}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
              <div className="hidden grid-cols-[160px_160px_140px_180px_1fr_100px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.22em] text-bbh-muted lg:grid">
                <span>{t('auditLog.colTime')}</span>
                <span>Actor</span>
                <span>Action</span>
                <span>Patient</span>
                <span>Subject / Path</span>
                <span className="text-right">IP</span>
              </div>
              <div className="divide-y divide-bbh-line">
                {q.data.data.map((r, i) => <AuditRow key={r.id} r={r} index={i} />)}
              </div>
            </div>
          )}

          {q.data && q.data.pagination.total_pages > 1 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-sm tabular-nums text-bbh-muted">{t('auditLog.pageInfo', { page: q.data.pagination.page, totalPages: q.data.pagination.total_pages, total: q.data.pagination.total })}</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}><ChevronLeft size={16}/> {t('auditLog.prev')}</button>
                <button type="button" disabled={page >= q.data.pagination.total_pages} onClick={() => setPage(p => p + 1)} className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}>{t('auditLog.next')} <ChevronRight size={16}/></button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function AuditRow({ r, index }: { r: AuditEntry; index: number }) {
  const actionStyle = ACTION_STYLES[r.action] ?? 'border-bbh-line bg-bbh-surface text-bbh-muted'
  return (
    <div
      style={staggerStyle(index)}
      className="animate-rise grid grid-cols-[1fr_auto] gap-3 bg-white px-4 py-3 text-sm transition-colors duration-200 hover:bg-bbh-surface lg:grid-cols-[160px_160px_140px_180px_1fr_100px]"
    >
      <span className="font-mono text-xs tabular-nums text-bbh-muted">{fmtDateTime(r.created_at)}</span>
      <div className="min-w-0">
        <p className="truncate text-bbh-ink">{r.actor_email ?? '(system)'}</p>
        {r.actor_role ? <p className="text-xs text-bbh-muted">{r.actor_role}</p> : null}
      </div>
      <span className="hidden lg:flex">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${actionStyle}`}>{r.action}</span>
      </span>
      <div className="hidden min-w-0 lg:block">
        {r.patient_id ? (
          <>
            <p className="truncate text-bbh-ink">{r.patient_display_name ?? `#${r.patient_id}`}</p>
            <p className="truncate font-mono text-xs tabular-nums text-bbh-muted">{r.patient_hn ?? `id=${r.patient_id}`}</p>
          </>
        ) : <span className="text-bbh-muted">—</span>}
      </div>
      <div className="hidden min-w-0 lg:block">
        <p className="truncate font-mono text-xs tabular-nums text-bbh-muted">{r.subject_type}:{r.subject_id}</p>
        <p className="truncate font-mono text-xs text-bbh-muted">{r.request_method} {r.request_path}</p>
      </div>
      <span className="text-right font-mono text-xs tabular-nums text-bbh-muted">{r.ip_address ?? '—'}</span>
    </div>
  )
}
