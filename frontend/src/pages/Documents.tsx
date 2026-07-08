// กล่องเอกสาร — the doctor's inbox for files CRO uploaded and assigned to them
// (nurse exam notes → CRO consolidates → doctor). Tabs classify by real report_type.
// FRONTEND-ONLY: reads the EXISTING GET /api/reports (mine_only) that the Reports
// page already uses — no backend change. Opening/downloading a file reuses the
// patient view (/patients?patient=…&report=…) exactly like the Reports page, so no
// new download endpoint is needed. When a doctor-specific inbox endpoint arrives,
// only the hook call swaps out.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  ClipboardList,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Inbox,
  Loader2,
  Paperclip,
  Pill,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useReportsWorkspace, type WorkspaceReport } from '../hooks/useReportsWorkspace'
import { MOCK_DOCUMENTS } from '../lib/mockDocuments'

// One entry per backend report_type. Tabs are built only for types that actually
// have documents in the inbox, so the doctor never sees empty categories.
interface TypeMeta {
  label: string
  icon: LucideIcon
}
const TYPE_META: Record<string, TypeMeta> = {
  lab: { label: 'ผลแล็บ', icon: FlaskConical },
  imaging: { label: 'ภาพวินิจฉัย', icon: ImageIcon },
  history: { label: 'บันทึกการตรวจ', icon: ClipboardList },
  prescription: { label: 'ใบสั่งยา', icon: Pill },
  referral: { label: 'ใบส่งตัว', icon: Send },
  other: { label: 'อื่นๆ', icon: FileText },
}
function typeMeta(t: string): TypeMeta {
  return TYPE_META[t] ?? { label: t || 'อื่นๆ', icon: FileText }
}

// latest_decision → the doctor's "have I dealt with this yet" state.
function statusPill(decision: string | null): { label: string; className: string; unread: boolean } {
  switch (decision) {
    case 'accept':
      return { label: 'รับแล้ว', className: 'bg-bbh-green-soft text-bbh-green-dark ring-1 ring-bbh-green/30', unread: false }
    case 'reject':
      return { label: 'ตีกลับ', className: 'bg-bbh-line/60 text-bbh-muted ring-1 ring-bbh-line', unread: false }
    case 'pending':
    case 'review':
      return { label: 'กำลังรีวิว', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', unread: false }
    default:
      // null / 'no_analysis' — never been opened for triage yet.
      return { label: 'รอดู', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', unread: true }
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function DocRow({ r }: { r: WorkspaceReport }) {
  const meta = typeMeta(r.report_type)
  const Icon = meta.icon
  const status = statusPill(r.latest_decision)
  const hasFile = r.has_file === true || r.has_file === 1
  return (
    <Link
      to={`/patients?patient=${r.patient_id}&report=${r.report_id}`}
      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-bbh-green-soft/50"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bbh-surface text-bbh-green-dark ring-1 ring-bbh-line">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-bbh-ink">{r.title}</p>
          {hasFile ? <Paperclip size={13} className="shrink-0 text-bbh-muted" /> : null}
        </div>
        <p className="truncate text-xs text-bbh-muted">
          {r.patient_name}
          {r.hn ? ` · ${r.hn}` : ''} · {meta.label} · {r.source}
        </p>
      </div>
      <span className="hidden shrink-0 text-xs text-bbh-muted sm:block">{formatDate(r.uploaded_at)}</span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
      <ArrowRight size={14} className="hidden shrink-0 text-bbh-green-dark transition-transform group-hover:translate-x-0.5 sm:block" />
    </Link>
  )
}

export function Documents() {
  const [params] = useSearchParams()
  // Demo can be turned on by ?demo=1 OR by the in-page button, so the doctor never
  // has to edit the URL (the sidebar link drops query params).
  const [demo, setDemo] = useState(params.get('demo') === '1')
  const [activeType, setActiveType] = useState<string>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [search, setSearch] = useState('')

  // Doctor's inbox = reports assigned to them (mine_only). Pull one page (backend
  // caps limit at 100) and categorize client-side so tab switching is instant and
  // every tab can show a live count. In ?demo=1 mode the real query is ignored and
  // sample rows are shown instead (see mockDocuments).
  const q = useReportsWorkspace({ mineOnly: true, limit: 100 })
  const all = useMemo(() => (demo ? MOCK_DOCUMENTS : q.data?.data ?? []), [demo, q.data])
  const total = demo ? MOCK_DOCUMENTS.length : q.data?.pagination.total ?? 0
  const capped = !demo && total > all.length
  const isPending = !demo && q.isPending
  const isError = !demo && q.isError

  // Count per type across the whole inbox (before the type filter) so tab badges
  // stay stable while a tab is active.
  const countsByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of all) m[r.report_type] = (m[r.report_type] ?? 0) + 1
    return m
  }, [all])

  const tabs = useMemo(() => {
    const present = Object.keys(countsByType).sort(
      (a, b) => Object.keys(TYPE_META).indexOf(a) - Object.keys(TYPE_META).indexOf(b),
    )
    return [
      { key: 'all', label: 'ทั้งหมด', count: all.length },
      ...present.map((t) => ({ key: t, label: typeMeta(t).label, count: countsByType[t] })),
    ]
  }, [countsByType, all.length])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return all.filter((r) => {
      if (activeType !== 'all' && r.report_type !== activeType) return false
      if (unreadOnly && !statusPill(r.latest_decision).unread) return false
      if (term) {
        // Searchable across patient, HN, title, Thai type label, source and notes
        // so "ผลแล็บ" / "ใบสั่งยา" / "email" all match too.
        const hay = [
          r.patient_name,
          r.hn ?? '',
          r.title,
          typeMeta(r.report_type).label,
          r.source,
          r.notes ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [all, activeType, unreadOnly, search])

  const unreadTotal = useMemo(() => all.filter((r) => statusPill(r.latest_decision).unread).length, [all])

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto rounded-2xl bg-white/80 p-4 ring-1 ring-bbh-line md:p-7">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">Document Inbox</p>
          <h1 className="mt-2 flex items-center gap-2 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">
            <Inbox size={28} className="text-bbh-green" /> กล่องเอกสาร
          </h1>
          <p className="mt-1 text-sm text-bbh-muted">
            เอกสารที่ CRO อัปโหลดและมอบหมายให้คุณ — แยกแท็บตามประเภท · คลิกเพื่อเปิด/ดาวน์โหลดไฟล์
          </p>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-bbh-ink ring-1 ring-bbh-line transition-colors hover:ring-bbh-green/40"
        >
          <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} /> รีเฟรช
        </button>
      </div>

      {demo ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          <span>โหมดตัวอย่าง — ข้อมูลสมมุติสำหรับดูหน้าตาเท่านั้น ไม่ใช่ข้อมูลคนไข้จริง</span>
          <button
            type="button"
            onClick={() => setDemo(false)}
            className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            ปิดตัวอย่าง
          </button>
        </div>
      ) : null}

      {/* Type tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => {
          const active = t.key === activeType
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveType(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-bbh-green text-white'
                  : 'bg-white text-bbh-muted ring-1 ring-bbh-line hover:text-bbh-green-dark'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  active ? 'bg-white/25 text-white' : 'bg-bbh-surface text-bbh-muted'
                }`}
              >
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Sub-filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setUnreadOnly((v) => !v)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            unreadOnly
              ? 'bg-bbh-green-soft text-bbh-green-dark ring-1 ring-bbh-green/30'
              : 'bg-white text-bbh-muted ring-1 ring-bbh-line hover:text-bbh-green-dark'
          }`}
        >
          เฉพาะที่ยังไม่ได้ดู{unreadTotal ? ` · ${unreadTotal}` : ''}
        </button>
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-bbh-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อคนไข้ / HN / หัวข้อ / ประเภท / ที่มา"
            className="w-full rounded-lg border border-bbh-line bg-white py-2 pl-9 pr-8 text-sm focus:outline-none"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="ล้างคำค้น"
              className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-bbh-muted hover:text-bbh-ink"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* List */}
      {isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-bbh-muted">
          <Loader2 size={18} className="animate-spin" /> กำลังโหลด...
        </div>
      ) : isError ? (
        <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600 ring-1 ring-red-200">
          โหลดเอกสารไม่สำเร็จ ลองรีเฟรชอีกครั้ง
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-bbh-muted">
          <Inbox size={26} className="text-bbh-green" />
          <p>{all.length === 0 ? 'ยังไม่มีเอกสารที่มอบหมายให้คุณ' : 'ไม่พบเอกสารตามเงื่อนไขที่เลือก'}</p>
          {all.length === 0 && !demo ? (
            <button
              type="button"
              onClick={() => setDemo(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bbh-green-soft px-3 py-1.5 text-xs font-semibold text-bbh-green-dark ring-1 ring-bbh-green/20 hover:ring-bbh-green/40"
            >
              <Inbox size={13} /> ดูตัวอย่างข้อมูล (demo)
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1">
          {visible.map((r) => (
            <DocRow key={r.report_id} r={r} />
          ))}
        </div>
      )}

      {capped ? (
        <p className="mt-4 text-center text-[11px] text-bbh-muted">
          แสดง {all.length} เอกสารล่าสุดจากทั้งหมด {total} — ค้นหาเพื่อจำกัดให้แคบลง
        </p>
      ) : null}
    </div>
  )
}
