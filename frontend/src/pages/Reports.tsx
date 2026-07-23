import { useState } from 'react'
import { dateLocale } from '../i18n/datetime'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react'

import { useAuth } from '../lib/auth'
import { useReportsWorkspace, type ReportDecision, type WorkspaceReport } from '../hooks/useReportsWorkspace'
import { ReportDetailDrawer } from '../components/reports/ReportDetailDrawer'
import { Eyebrow } from '../components/ui/Eyebrow'
import { SkeletonList } from '../components/ui/Skeleton'
import { staggerStyle } from '../lib/motion'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const DECISION_KEYS: Record<string, string> = {
  no_analysis: 'decision.noAnalysis',
  pending: 'decision.pending',
  review: 'decision.review',
  accept: 'decision.accept',
  reject: 'decision.reject',
}
const DECISION_STYLES: Record<string, string> = {
  no_analysis: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  review: 'border-amber-200 bg-amber-50 text-amber-700',
  accept: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
  reject: 'border-red-200 bg-red-50 text-red-700',
}

const DECISION_FILTERS: Array<{ key: ReportDecision | 'all'; labelKey: string }> = [
  { key: 'all', labelKey: 'common.all' },
  { key: 'no_analysis', labelKey: 'reports.decision.noAnalysis' },
  { key: 'pending', labelKey: 'reports.decision.pending' },
  { key: 'review', labelKey: 'reports.decision.review' },
  { key: 'accept', labelKey: 'reports.decision.accept' },
  { key: 'reject', labelKey: 'reports.decision.reject' },
]

const REPORT_TYPES = ['lab', 'imaging', 'history', 'prescription', 'referral', 'other']
const SOURCES = ['web', 'line', 'email', 'whatsapp', 'walkin']

function ReportRow({ r, index, onOpen }: { r: WorkspaceReport; index: number; onOpen: (r: WorkspaceReport) => void }) {
  const { t } = useTranslation()
  const decision = r.latest_decision ?? 'no_analysis'
  return (
    <button
      type="button"
      onClick={() => onOpen(r)}
      style={staggerStyle(index)}
      className={`animate-rise grid w-full grid-cols-[1fr_auto] gap-3 bg-white px-4 py-4 text-left transition-colors duration-200 hover:bg-bbh-surface lg:grid-cols-[180px_1fr_110px_140px_120px] ${FOCUS_RING}`}
    >
      <div className="hidden lg:block">
        <p className="truncate text-sm font-semibold text-bbh-ink">{r.patient_name}</p>
        <p className="font-mono text-xs tabular-nums text-bbh-muted">{r.hn ?? '-'}</p>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-bbh-muted lg:hidden">
          <span className="font-semibold text-bbh-ink">{r.patient_name}</span>
          <span>·</span>
          <span className="font-mono tabular-nums">{r.hn ?? '-'}</span>
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold text-bbh-ink">{r.title}</p>
        <p className="mt-0.5 truncate text-xs text-bbh-muted">
          {r.report_type} · {r.source}
          {r.assigned_doctor_name ? ` · ${t('reports.assignedTo', { name: r.assigned_doctor_name })}` : ''}
        </p>
      </div>
      <div className="hidden text-xs text-bbh-muted lg:block">
        {r.report_type}
      </div>
      <div className="hidden text-right font-mono text-xs tabular-nums text-bbh-muted lg:block">
        {new Date(r.uploaded_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: '2-digit' })}
      </div>
      <div className="text-right">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${DECISION_STYLES[decision]}`}>
          {DECISION_KEYS[decision] ? t(`reports.${DECISION_KEYS[decision]}`) : decision}
        </span>
      </div>
    </button>
  )
}

// หน้าจัดการผลแล็บ (หมอ/nurse/admin/lab_staff) — CRO/staff อัปโหลดผลแล็บ + ผูกกับคนไข้/หมอ,
// เปิดไฟล์ดู, และสั่ง AI วิเคราะห์เพื่อสรุปผล
export function Reports() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isDoctorOrNurse = user?.role === 'doctor' || user?.role === 'nurse'

  const [decision, setDecision] = useState<ReportDecision | 'all'>('all')
  const [reportType, setReportType] = useState<string>('')
  const [source, setSource] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState<boolean>(isDoctorOrNurse)
  const [page, setPage] = useState(1)

  const q = useReportsWorkspace({
    decision: decision === 'all' ? undefined : decision,
    reportType: reportType || undefined,
    source: source || undefined,
    search: search || undefined,
    mineOnly,
    page,
    limit: 30,
  })
  const data = q.data
  const [selected, setSelected] = useState<WorkspaceReport | null>(null)

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  const fieldClass = `rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30 ${FOCUS_RING}`

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 md:p-8 lg:p-10">
        {/* Masthead — instrument label + serif heading, refresh action on the right */}
        <div className="animate-rise mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>Patient Reports</Eyebrow>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('reports.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              {t('reports.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => q.refetch()}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
            {t('reports.refresh')}
          </button>
        </div>

        {/* Filters */}
        <div className="animate-rise mb-8 space-y-3" style={{ animationDelay: '70ms' }}>
          {/* Decision rail — hairline pills; green reserved for the active filter */}
          <div className="flex flex-wrap items-center gap-2">
            {DECISION_FILTERS.map((f) => {
              const active = decision === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => { setDecision(f.key); setPage(1) }}
                  aria-pressed={active}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${FOCUS_RING} ${
                    active
                      ? 'border-bbh-green bg-bbh-green text-white'
                      : 'border-bbh-line bg-white text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark'
                  }`}
                >
                  {t(f.labelKey)}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={reportType}
              onChange={(e) => { setReportType(e.target.value); setPage(1) }}
              className={fieldClass}
            >
              <option value="">{t('reports.allTypes')}</option>
              {REPORT_TYPES.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
            </select>
            <select
              value={source}
              onChange={(e) => { setSource(e.target.value); setPage(1) }}
              className={fieldClass}
            >
              <option value="">{t('reports.allSources')}</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => { setMineOnly(e.target.checked); setPage(1) }}
                className={`h-4 w-4 accent-bbh-green ${FOCUS_RING}`}
              />
              {t('reports.mineOnly')}
            </label>
            <form
              onSubmit={submitSearch}
              className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 transition-colors duration-200 focus-within:border-bbh-green focus-within:ring-2 focus-within:ring-bbh-green/30"
            >
              <Search size={15} className="shrink-0 text-bbh-muted" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('reports.searchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-sm text-bbh-ink placeholder:text-bbh-muted focus:outline-none"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSearchInput('') }}
                  className={`rounded text-xs text-bbh-muted transition-colors duration-200 hover:text-bbh-ink ${FOCUS_RING}`}
                >
                  {t('reports.clear')}
                </button>
              ) : null}
            </form>
          </div>
        </div>

        {/* Results */}
        <div className="animate-rise" style={{ animationDelay: '140ms' }}>
          {q.isLoading ? (
            <SkeletonList rows={5} rowClassName="h-14 rounded-xl" className="space-y-2" />
          ) : q.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {t('common.loadFailed')}
            </div>
          ) : !data || data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-bbh-line bg-white p-10 text-center">
              <p className="text-sm font-semibold text-bbh-ink">{t('reports.empty')}</p>
              <p className="mt-1 text-xs text-bbh-muted">{t('reports.emptyHint')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
                <div className="hidden grid-cols-[180px_1fr_110px_140px_120px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-4 font-mono text-xs font-medium uppercase tracking-[0.22em] text-bbh-muted lg:grid">
                  <span>{t('reports.colPatient')}</span>
                  <span>{t('reports.colTitle')}</span>
                  <span>{t('reports.colType')}</span>
                  <span className="text-right">{t('reports.colUploaded')}</span>
                  <span className="text-right">{t('reports.colStatus')}</span>
                </div>
                <div className="divide-y divide-bbh-line">
                  {data.data.map((r, i) => <ReportRow key={r.report_id} r={r} index={i} onOpen={setSelected} />)}
                </div>
              </div>

              {/* Pagination */}
              <div className="mt-6 flex items-center justify-between gap-3">
                <span className="font-mono text-xs tabular-nums text-bbh-muted">
                  {(data.pagination.page - 1) * data.pagination.limit + 1}
                  –{Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} {t('reports.paginationOf', { total: data.pagination.total })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={data.pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}
                  >
                    <ChevronLeft size={16} /> {t('reports.prev')}
                  </button>
                  <span className="font-mono text-sm tabular-nums text-bbh-muted">
                    {data.pagination.page} / {data.pagination.total_pages}
                  </span>
                  <button
                    type="button"
                    disabled={data.pagination.page >= data.pagination.total_pages}
                    onClick={() => setPage((p) => p + 1)}
                    className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}
                  >
                    {t('reports.next')} <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
      {selected ? <ReportDetailDrawer report={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}
