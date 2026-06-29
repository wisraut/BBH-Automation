import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import { useAuditLog, type AuditEntry } from '../hooks/useAuditLog'
import { useUsers } from '../hooks/useUsers'

const ACTIONS: Array<{ key: string; label: string }> = [
  { key: '', label: 'ทุก action' },
  { key: 'view_patient', label: 'ดูคนไข้' },
  { key: 'list_patients', label: 'list คนไข้' },
  { key: 'view_report', label: 'ดู report' },
  { key: 'download_report', label: 'download report' },
  { key: 'list_reports', label: 'list reports' },
  { key: 'analyze_report', label: 'AI analyze' },
  { key: 'decide_triage', label: 'ตัดสิน triage' },
]

const ACTION_STYLES: Record<string, string> = {
  view_patient: 'border-blue-200 bg-blue-50 text-blue-700',
  list_patients: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  view_report: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
  download_report: 'border-amber-200 bg-amber-50 text-amber-700',
  list_reports: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  analyze_report: 'border-purple-200 bg-purple-50 text-purple-700',
  decide_triage: 'border-pink-200 bg-pink-50 text-pink-700',
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
  return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function AuditLog() {
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

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto rounded-[20px] border border-bbh-line bg-white/90 p-4 shadow-bbh-card backdrop-blur md:rounded-[28px] md:p-7">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-green">Audit Trail</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-bbh-ink md:text-3xl">บันทึกการเข้าถึงข้อมูลคนไข้</h1>
          <p className="mt-1 text-sm text-bbh-muted">
            ใครเข้าดู / download / ตัดสิน record ของคนไข้ — สำหรับ compliance audit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setDateFrom(todayIso()); setDateTo(nowIso()); setPage(1) }}
            className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-xs font-medium text-bbh-muted hover:border-bbh-green"
          >
            วันนี้
          </button>
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

      {/* Filters */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <select
          value={actorId ?? ''}
          onChange={(e) => { setActorId(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}
          className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
        >
          <option value="">ทุก user</option>
          {userOptions.map((u) => (
            <option key={u.id} value={u.id}>{u.display_name} ({u.role})</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}
          className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
        >
          {ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            value={patientIdInput}
            onChange={(e) => setPatientIdInput(e.target.value.replace(/\D/g, ''))}
            onBlur={applyPatientId}
            onKeyDown={(e) => { if (e.key === 'Enter') applyPatientId() }}
            placeholder="patient_id"
            className="w-full rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
          />
        </div>
        <input
          type="datetime-local"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
          className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
        />
        <input
          type="datetime-local"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
          className="rounded-xl border border-bbh-line bg-white px-3 py-2 text-sm"
        />
      </div>

      {(actorId || action || patientId || dateFrom || dateTo) ? (
        <div className="mb-4 flex items-center gap-2">
          <button type="button" onClick={clearFilters} className="text-xs text-bbh-muted hover:text-bbh-ink underline">ล้าง filter ทั้งหมด</button>
        </div>
      ) : null}

      {/* Table */}
      {q.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-bbh-line bg-white p-10 text-sm text-bbh-muted">
          <Loader2 size={16} className="mr-2 animate-spin" /> กำลังโหลด audit log
        </div>
      ) : q.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ</div>
      ) : !q.data || q.data.data.length === 0 ? (
        <div className="rounded-2xl border border-bbh-line bg-white p-10 text-center">
          <ShieldCheck size={28} className="mx-auto mb-2 text-bbh-green" />
          <p className="text-sm font-semibold text-bbh-ink">ไม่พบ event ใน filter นี้</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-bbh-line bg-white shadow-sm">
          <div className="hidden grid-cols-[160px_160px_140px_180px_1fr_100px] gap-3 border-b border-bbh-line bg-bbh-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-bbh-muted lg:grid">
            <span>เวลา</span>
            <span>Actor</span>
            <span>Action</span>
            <span>Patient</span>
            <span>Subject / Path</span>
            <span className="text-right">IP</span>
          </div>
          <div className="divide-y divide-bbh-line">
            {q.data.data.map((r) => <AuditRow key={r.id} r={r} />)}
          </div>
        </div>
      )}

      {q.data && q.data.pagination.total_pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-bbh-muted">
          <span>หน้า {q.data.pagination.page} / {q.data.pagination.total_pages} · {q.data.pagination.total} events</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 disabled:opacity-50"><ChevronLeft size={14}/> ก่อน</button>
            <button type="button" disabled={page >= q.data.pagination.total_pages} onClick={() => setPage(p => p + 1)} className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 disabled:opacity-50">ถัดไป <ChevronRight size={14}/></button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AuditRow({ r }: { r: AuditEntry }) {
  const actionStyle = ACTION_STYLES[r.action] ?? 'border-bbh-line bg-bbh-surface text-bbh-muted'
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm lg:grid-cols-[160px_160px_140px_180px_1fr_100px]">
      <span className="font-mono text-xs text-bbh-muted">{fmtDateTime(r.created_at)}</span>
      <div className="min-w-0">
        <p className="truncate text-bbh-ink">{r.actor_email ?? '(system)'}</p>
        {r.actor_role ? <p className="text-[10px] text-bbh-muted">{r.actor_role}</p> : null}
      </div>
      <span className="hidden lg:flex">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${actionStyle}`}>{r.action}</span>
      </span>
      <div className="hidden min-w-0 lg:block">
        {r.patient_id ? (
          <>
            <p className="truncate text-bbh-ink">{r.patient_display_name ?? `#${r.patient_id}`}</p>
            <p className="font-mono text-[10px] text-bbh-muted">{r.patient_hn ?? `id=${r.patient_id}`}</p>
          </>
        ) : <span className="text-bbh-muted">—</span>}
      </div>
      <div className="hidden min-w-0 lg:block">
        <p className="truncate font-mono text-[11px] text-bbh-muted">{r.subject_type}:{r.subject_id}</p>
        <p className="truncate font-mono text-[10px] text-bbh-muted">{r.request_method} {r.request_path}</p>
      </div>
      <span className="text-right font-mono text-[11px] text-bbh-muted">{r.ip_address ?? '—'}</span>
    </div>
  )
}
