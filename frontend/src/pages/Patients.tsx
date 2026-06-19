import { useMemo, useState } from 'react'

import { SourceBadge } from '../components/SourceBadge'
import { StatusBadge } from '../components/StatusBadge'
import { usePatients } from '../hooks/usePatients'
import type { PatientRecord } from '../hooks/usePatients'
import type { components } from '../lib/api-types'

type BookingItem = components['schemas']['BookingListItem']
type SortKey = 'recent' | 'name' | 'most'
type FilterKey = 'all' | 'pending' | 'frequent'

const APPT_TYPE_LABELS: Record<string, string> = {
  new: 'ใหม่',
  followup: 'ติดตาม',
  procedure: 'หัตถการ',
  consult: 'ปรึกษา',
}

const SOURCE_LABELS: Record<string, string> = {
  line: 'LINE',
  phone: 'โทร',
  whatsapp: 'WhatsApp',
  email: 'Email',
  walkin: 'Walk-in',
}

const STATUS_ORDER: Record<string, number> = {
  pending_approval: 0,
  approved: 1,
  cancelled: 2,
  rejected: 3,
  draft: 4,
  expired: 5,
}

const FREQUENT_THRESHOLD = 3

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'เมื่อกี้'
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} วันที่แล้ว`
  return formatDate(iso)
}

// ─── Avatar ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-bbh-green-soft text-bbh-green-dark',
  'bg-blue-50 text-blue-700',
  'bg-purple-50 text-purple-700',
  'bg-orange-50 text-orange-700',
  'bg-pink-50 text-pink-700',
]

function avatarColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function InitialAvatar({ name, pkey }: { name: string; pkey: string }) {
  return (
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-serif text-base font-semibold ${avatarColor(pkey)}`}>
      {name.trim().slice(0, 1) || '?'}
    </div>
  )
}

// ─── Source breakdown ──────────────────────────────────────────────────────

function sourceBreakdown(bookings: BookingItem[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const b of bookings) {
    map[b.booking_source] = (map[b.booking_source] ?? 0) + 1
  }
  return map
}

// ─── Booking timeline card ─────────────────────────────────────────────────

function BookingTimelineItem({ b, index }: { b: BookingItem; index: number }) {
  const [open, setOpen] = useState(false)
  const hasSymptom = Boolean(b.symptom)

  return (
    <div className="flex gap-3">
      {/* Dot + line */}
      <div className="flex flex-col items-center">
        <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
          b.status === 'approved'
            ? 'border-bbh-green bg-bbh-green'
            : b.status === 'pending_approval'
            ? 'border-amber-400 bg-amber-50'
            : 'border-bbh-line bg-white'
        }`} />
        {index > 0 && (
          <div className="mt-1 w-px flex-1 bg-bbh-line" />
        )}
      </div>

      {/* Content */}
      <div className="mb-4 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={b.status} />
          <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-[11px] text-bbh-muted">
            {APPT_TYPE_LABELS[b.appointment_type] ?? b.appointment_type}
          </span>
          <SourceBadge source={b.booking_source} />
        </div>

        {b.requested_datetime_text ? (
          <p className="mt-1 text-sm font-medium text-bbh-ink">
            {b.requested_datetime_text}
          </p>
        ) : null}

        <p className="mt-0.5 text-xs text-bbh-muted">
          จองเมื่อ {formatDate(b.created_at)}
        </p>

        {hasSymptom && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 text-xs font-medium text-bbh-green hover:text-bbh-green-dark"
          >
            {open ? '▲ ซ่อนอาการ' : '▼ ดูอาการ'}
          </button>
        )}
        {open && b.symptom && (
          <p className="mt-1.5 rounded-xl bg-bbh-surface px-3 py-2 text-xs text-bbh-muted">
            {b.symptom}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Patient detail ────────────────────────────────────────────────────────

function PatientDetail({ patient }: { patient: PatientRecord }) {
  const [historyFilter, setHistoryFilter] = useState<'all' | 'approved' | 'pending_approval'>('all')

  const sorted = [...patient.bookings].sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      b.created_at.localeCompare(a.created_at)
  )

  const filtered = historyFilter === 'all'
    ? sorted
    : sorted.filter((b) => b.status === historyFilter)

  const sources = sourceBreakdown(patient.bookings)
  const topSources = Object.entries(sources).sort((a, b) => b[1] - a[1])

  const isFrequent = patient.bookings.length >= FREQUENT_THRESHOLD
  const cancelledCount = patient.bookings.filter(
    (b) => b.status === 'cancelled' || b.status === 'rejected'
  ).length

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-serif text-2xl font-semibold ${avatarColor(patient.key)}`}>
          {patient.name.trim().slice(0, 1) || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-2xl font-semibold text-bbh-ink">
              {patient.name}
            </h2>
            {isFrequent && (
              <span className="rounded-full bg-bbh-green-soft px-2.5 py-0.5 text-xs font-semibold text-bbh-green-dark">
                มาบ่อย
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-bbh-muted">
            {patient.phone ?? 'ไม่มีเบอร์'}
          </p>
          <p className="mt-0.5 text-xs text-bbh-muted">
            ล่าสุด {formatRelative(patient.latestAt)}
          </p>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-2xl border border-bbh-line bg-white p-3 text-center">
          <p className="font-serif text-xl font-semibold text-bbh-ink">
            {patient.bookings.length}
          </p>
          <p className="text-[11px] text-bbh-muted">ทั้งหมด</p>
        </div>
        <div className="rounded-2xl border border-bbh-green/30 bg-bbh-green-soft p-3 text-center">
          <p className="font-serif text-xl font-semibold text-bbh-green-dark">
            {patient.approvedCount}
          </p>
          <p className="text-[11px] text-bbh-muted">ยืนยัน</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="font-serif text-xl font-semibold text-amber-700">
            {patient.pendingCount}
          </p>
          <p className="text-[11px] text-bbh-muted">รอ</p>
        </div>
        <div className="rounded-2xl border border-bbh-line bg-white p-3 text-center">
          <p className="font-serif text-xl font-semibold text-bbh-muted">
            {cancelledCount}
          </p>
          <p className="text-[11px] text-bbh-muted">ยกเลิก</p>
        </div>
      </div>

      {/* ── Channel breakdown ── */}
      {topSources.length > 0 && (
        <div className="rounded-2xl border border-bbh-line p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-bbh-muted">
            ช่องทางที่ใช้
          </p>
          <div className="flex flex-wrap gap-2">
            {topSources.map(([src, cnt]) => (
              <div
                key={src}
                className="flex items-center gap-1.5 rounded-xl bg-bbh-surface px-3 py-1.5"
              >
                <span className="text-xs font-semibold text-bbh-ink">
                  {SOURCE_LABELS[src] ?? src}
                </span>
                <span className="text-xs text-bbh-muted">{cnt} ครั้ง</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Booking history ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bbh-muted">
            ประวัติการจอง
          </p>
          <div className="flex gap-1">
            {(
              [
                { key: 'all', label: 'ทั้งหมด' },
                { key: 'approved', label: 'ยืนยัน' },
                { key: 'pending_approval', label: 'รอ' },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setHistoryFilter(key)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  historyFilter === key
                    ? 'bg-bbh-green text-white'
                    : 'border border-bbh-line text-bbh-muted hover:border-bbh-green hover:text-bbh-green'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-bbh-line p-8 text-center">
            <p className="text-sm text-bbh-muted">ไม่มีการจองในหมวดนี้</p>
          </div>
        ) : (
          <div className="pl-1">
            {filtered.map((b, i) => (
              <BookingTimelineItem key={b.request_uid} b={b} index={filtered.length - 1 - i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'ล่าสุด' },
  { key: 'name', label: 'ชื่อ A-Z' },
  { key: 'most', label: 'มาบ่อย' },
]

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'มี pending' },
  { key: 'frequent', label: `มาบ่อย (${FREQUENT_THRESHOLD}+)` },
]

export function Patients() {
  const { patients, isLoading, total } = usePatients()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [filterKey, setFilterKey] = useState<FilterKey>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase()

    let list = q
      ? patients.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.phone ?? '').includes(q)
        )
      : patients

    if (filterKey === 'pending') list = list.filter((p) => p.pendingCount > 0)
    if (filterKey === 'frequent') list = list.filter((p) => p.bookings.length >= FREQUENT_THRESHOLD)

    return [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'th')
      if (sortKey === 'most') return b.bookings.length - a.bookings.length
      return b.latestAt.localeCompare(a.latestAt)
    })
  }, [patients, search, sortKey, filterKey])

  const selected = selectedKey
    ? (patients.find((p) => p.key === selectedKey) ?? null)
    : null

  return (
    <div className="flex h-full">

      {/* ─── Patient list ─── */}
      <section className="flex w-[400px] shrink-0 flex-col border-r border-bbh-line">

        {/* Search + controls */}
        <div className="space-y-2 border-b border-bbh-line px-4 pb-3 pt-4">
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedKey(null) }}
            placeholder="ค้นหาชื่อ หรือเบอร์โทร…"
            className="w-full rounded-xl border border-bbh-line bg-bbh-surface px-4 py-2 text-sm text-bbh-ink placeholder:text-bbh-muted focus:border-bbh-green focus:outline-none"
          />

          {/* Sort */}
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-xs text-bbh-muted">เรียง:</span>
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  sortKey === key
                    ? 'bg-bbh-green text-white'
                    : 'border border-bbh-line text-bbh-muted hover:border-bbh-green hover:text-bbh-green'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filter */}
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-xs text-bbh-muted">กรอง:</span>
            {FILTER_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterKey(key)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  filterKey === key
                    ? 'bg-bbh-ink text-white'
                    : 'border border-bbh-line text-bbh-muted hover:border-bbh-ink hover:text-bbh-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-xs text-bbh-muted">
            {isLoading ? (
              <span className="animate-pulse">กำลังโหลด...</span>
            ) : (
              `${total} คนไข้ · แสดง ${processed.length}`
            )}
          </p>
        </div>

        {/* Patient rows */}
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-bbh-surface" />
              ))}
            </div>
          ) : processed.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-bbh-line p-8 text-center">
              <p className="text-sm text-bbh-muted">
                {search ? 'ไม่พบคนไข้ที่ค้นหา' : 'ยังไม่มีข้อมูลคนไข้'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {processed.map((p) => {
                const active = p.key === selectedKey
                const frequent = p.bookings.length >= FREQUENT_THRESHOLD
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedKey(active ? null : p.key)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                      active
                        ? 'border-bbh-green bg-bbh-green-soft ring-4 ring-bbh-green/10'
                        : 'border-bbh-line bg-white hover:border-bbh-green/40'
                    }`}
                  >
                    <InitialAvatar name={p.name} pkey={p.key} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-bbh-ink">
                          {p.name}
                        </p>
                        {frequent && (
                          <span className="shrink-0 rounded-full bg-bbh-green-soft px-1.5 py-0.5 text-[10px] font-semibold text-bbh-green-dark">
                            บ่อย
                          </span>
                        )}
                        {p.pendingCount > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            รอ {p.pendingCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-bbh-muted">
                        {p.phone ?? 'ไม่มีเบอร์'} · {p.bookings.length} การจอง
                      </p>
                    </div>
                    <p className="shrink-0 text-[11px] text-bbh-muted">
                      {formatRelative(p.latestAt)}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ─── Patient detail ─── */}
      <aside className="flex-1 overflow-y-auto p-8">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="font-serif text-lg text-bbh-ink">เลือกคนไข้</p>
              <p className="mt-1 text-sm text-bbh-muted">คลิกชื่อคนไข้ทางซ้ายเพื่อดูรายละเอียด</p>
            </div>
          </div>
        ) : (
          <PatientDetail patient={selected} />
        )}
      </aside>
    </div>
  )
}
