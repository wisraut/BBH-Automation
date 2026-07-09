import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'

import { useAuth } from '../lib/auth'
import { useReportsWorkspace, type ReportDecision, type WorkspaceReport } from '../hooks/useReportsWorkspace'
import { MOCK_WORKSPACE_REPORTS } from '../lib/mockReports'

const DECISION_LABELS: Record<string, string> = {
  no_analysis: 'ยังไม่วิเคราะห์',
  pending: 'รอตัดสิน',
  review: 'รอ review',
  accept: 'รับ',
  reject: 'ปฏิเสธ',
}
const DECISION_STYLES: Record<string, string> = {
  no_analysis: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  review: 'border-amber-200 bg-amber-50 text-amber-700',
  accept: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
  reject: 'border-red-200 bg-red-50 text-red-700',
}

const DECISION_FILTERS: Array<{ key: ReportDecision | 'all'; label: string }> = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'no_analysis', label: 'ยังไม่วิเคราะห์' },
  { key: 'pending', label: 'รอตัดสิน' },
  { key: 'review', label: 'รอ review' },
  { key: 'accept', label: 'รับ' },
  { key: 'reject', label: 'ปฏิเสธ' },
]

const REPORT_TYPES = ['lab', 'imaging', 'history', 'prescription', 'referral', 'other']
const SOURCES = ['web', 'line', 'email', 'whatsapp', 'walkin']

function ReportRow({ r }: { r: WorkspaceReport }) {
  const decision = r.latest_decision ?? 'no_analysis'
  return (
    <Link
      to={`/patients?patient=${r.patient_id}&report=${r.report_id}`}
      className="grid grid-cols-[1fr_auto] gap-3 border-b border-bbh-line bg-white px-4 py-3 transition last:border-b-0 hover:bg-bbh-surface lg:grid-cols-[180px_1fr_110px_140px_120px]"
    >
      <div className="hidden lg:block">
        <p className="truncate text-sm font-semibold text-bbh-ink">{r.patient_name}</p>
        <p className="font-mono text-xs text-bbh-muted">{r.hn ?? '-'}</p>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-bbh-muted lg:hidden">
          <span className="font-semibold text-bbh-ink">{r.patient_name}</span>
          <span>·</span>
          <span className="font-mono">{r.hn ?? '-'}</span>
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold text-bbh-ink">{r.title}</p>
        <p className="mt-0.5 truncate text-xs text-bbh-muted">
          {r.report_type} · {r.source}
          {r.assigned_doctor_name ? ` · มอบ ${r.assigned_doctor_name}` : ''}
        </p>
      </div>
      <div className="hidden text-xs text-bbh-muted lg:block">
        {r.report_type}
      </div>
      <div className="hidden text-right text-xs text-bbh-muted lg:block">
        {new Date(r.uploaded_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
      </div>
      <div className="text-right">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${DECISION_STYLES[decision]}`}>
          {DECISION_LABELS[decision] ?? decision}
        </span>
      </div>
    </Link>
  )
}

export function Reports() {
  const { user } = useAuth()
  const isDoctorOrNurse = user?.role === 'doctor' || user?.role === 'nurse'

  const [decision, setDecision] = useState<ReportDecision | 'all'>('all')
  const [reportType, setReportType] = useState<string>('')
  const [source, setSource] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState<boolean>(isDoctorOrNurse)
  const [page, setPage] = useState(1)
  const [searchParams] = useSearchParams()
  const [demo, setDemo] = useState(searchParams.get('demo') === '1')

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

  // Demo rows (sample uploaded files) — filtered client-side so the chips/search still work.
  const demoRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return MOCK_WORKSPACE_REPORTS.filter((r) => {
      if (decision !== 'all' && (r.latest_decision ?? 'no_analysis') !== decision) return false
      if (reportType && r.report_type !== reportType) return false
      if (source && r.source !== source) return false
      if (term && !`${r.patient_name} ${r.hn ?? ''} ${r.title}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [decision, reportType, source, search])

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto rounded-[20px] border border-bbh-line bg-white/90 p-4 shadow-bbh-card backdrop-blur md:rounded-[28px] md:p-7">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">Patient Reports</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">รายงาน</h1>
          <p className="mt-1 text-sm text-bbh-muted">
            ค้นหา filter และดู report ของคนไข้ — คลิกเพื่อไปยังหน้าคนไข้และตัดสินใจ triage
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!demo ? (
            <button
              type="button"
              onClick={() => setDemo(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-bbh-green-soft px-3 py-2 text-sm font-semibold text-bbh-green-dark ring-1 ring-bbh-green/20 transition-colors hover:ring-bbh-green/40"
            >
              <FlaskConical size={15} /> ดูตัวอย่างข้อมูล (demo)
            </button>
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

      {demo ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          <span>โหมดตัวอย่าง — ไฟล์ผลแล็บสมมุติสำหรับดูหน้าตาเท่านั้น ไม่ใช่ข้อมูลคนไข้จริง</span>
          <button
            type="button"
            onClick={() => setDemo(false)}
            className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            ปิดตัวอย่าง
          </button>
        </div>
      ) : null}

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {DECISION_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setDecision(f.key); setPage(1) }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                decision === f.key
                  ? 'border-bbh-green bg-bbh-green text-white'
                  : 'border-bbh-line bg-white text-bbh-muted hover:border-bbh-green/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={reportType}
            onChange={(e) => { setReportType(e.target.value); setPage(1) }}
            className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
          >
            <option value="">ประเภททั้งหมด</option>
            {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1) }}
            className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
          >
            <option value="">ที่มาทั้งหมด</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => { setMineOnly(e.target.checked); setPage(1) }}
              className="h-4 w-4 accent-bbh-green"
            />
            ของฉัน
          </label>
          <form onSubmit={submitSearch} className="flex flex-1 min-w-[200px] items-center gap-2 rounded-xl border border-bbh-line bg-white px-3 py-2">
            <Search size={15} className="shrink-0 text-bbh-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ค้นหาชื่อคนไข้ / HN / หัวข้อ"
              className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => { setSearch(''); setSearchInput('') }}
                className="text-xs text-bbh-muted hover:text-bbh-ink"
              >
                ล้าง
              </button>
            ) : null}
          </form>
        </div>
      </div>

      {/* Results */}
      {demo ? (
        demoRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-bbh-line bg-white p-10 text-center">
            <FileText size={28} className="mb-2 text-bbh-muted" />
            <p className="text-sm font-semibold text-bbh-ink">ไม่พบรายงาน (ตัวอย่าง)</p>
            <p className="mt-1 text-xs text-bbh-muted">ลองปรับ filter หรือล้างคำค้น</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-bbh-line bg-white shadow-sm">
            <div className="hidden grid-cols-[180px_1fr_110px_140px_120px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-bbh-muted lg:grid">
              <span>คนไข้ / HN</span>
              <span>เรื่อง</span>
              <span>ประเภท</span>
              <span className="text-right">วันที่อัพโหลด</span>
              <span className="text-right">สถานะ</span>
            </div>
            <div className="divide-y divide-bbh-line">
              {demoRows.map((r) => <ReportRow key={r.report_id} r={r} />)}
            </div>
          </div>
        )
      ) : q.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted">
          <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลด
        </div>
      ) : q.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-bbh-line bg-white p-10 text-center">
          <FileText size={28} className="mb-2 text-bbh-muted" />
          <p className="text-sm font-semibold text-bbh-ink">ไม่พบรายงาน</p>
          <p className="mt-1 text-xs text-bbh-muted">ลองปรับ filter หรือล้างคำค้น</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-bbh-line bg-white shadow-sm">
            <div className="hidden grid-cols-[180px_1fr_110px_140px_120px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-bbh-muted lg:grid">
              <span>คนไข้ / HN</span>
              <span>เรื่อง</span>
              <span>ประเภท</span>
              <span className="text-right">วันที่อัพโหลด</span>
              <span className="text-right">สถานะ</span>
            </div>
            <div className="divide-y divide-bbh-line">
              {data.data.map((r) => <ReportRow key={r.report_id} r={r} />)}
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-bbh-muted">
            <span>
              {(data.pagination.page - 1) * data.pagination.limit + 1}
              –{Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} จาก {data.pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={data.pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 disabled:opacity-50"
              >
                <ChevronLeft size={14} /> ก่อน
              </button>
              <span className="font-mono">
                {data.pagination.page} / {data.pagination.total_pages}
              </span>
              <button
                type="button"
                disabled={data.pagination.page >= data.pagination.total_pages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 disabled:opacity-50"
              >
                ถัดไป <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
