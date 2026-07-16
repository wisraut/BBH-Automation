import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, Plus, Stethoscope, X } from 'lucide-react'

import { ApproveModal } from '../components/bookings/ApproveModal'
import { NewBookingModal } from '../components/bookings/NewBookingModal'
import { RejectModal } from '../components/bookings/RejectModal'
import { RescheduleModal } from '../components/bookings/RescheduleModal'
import { SourceBadge } from '../components/SourceBadge'
import { StatusBadge } from '../components/StatusBadge'
import { useAssignDoctor } from '../hooks/useAssignDoctor'
import { useBooking } from '../hooks/useBooking'
import { useBookings } from '../hooks/useBookings'
import type { BookingGroup, BookingStatus } from '../hooks/useBookings'
import { useDoctors } from '../hooks/useDoctors'
import { useScheduleBlocks, type ScheduleBlock } from '../hooks/useScheduleBlocks'
import { useToast } from '../hooks/useToast'
import { ApiError } from '../lib/api'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const TABS: { key: BookingGroup; labelKey: string }[] = [
  { key: 'active', labelKey: 'bookings.tabs.active' },
  { key: 'history', labelKey: 'bookings.tabs.history' },
]

// Status pills scoped to each tab. 'all' means "no status filter — show the
// whole group" and the backend group param drives the list.
const FILTERS_BY_TAB: Record<BookingGroup, { key: BookingStatus | 'all'; labelKey: string }[]> = {
  active: [
    { key: 'all', labelKey: 'common.all' },
    { key: 'pending_approval', labelKey: 'bookings.filters.pendingApproval' },
    { key: 'approved', labelKey: 'bookings.filters.approved' },
  ],
  history: [
    { key: 'all', labelKey: 'common.all' },
    { key: 'no_show', labelKey: 'bookings.filters.noShow' },
    { key: 'rejected', labelKey: 'bookings.filters.rejected' },
    { key: 'cancelled', labelKey: 'bookings.filters.cancelled' },
    { key: 'expired', labelKey: 'bookings.filters.expired' },
  ],
}

const PAGE_LIMIT = 20

function formatRelative(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return t('bookings.relative.seconds', { count: sec })
  const min = Math.floor(sec / 60)
  if (min < 60) return t('bookings.relative.minutes', { count: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('bookings.relative.hours', { count: hr })
  const day = Math.floor(hr / 24)
  return t('bookings.relative.days', { count: day })
}

// Safety-net conflict detection: a booking's ASSIGNED doctor is unavailable
// (a time-off block overlaps the appointment). The approve/assign guards stop
// you assigning INTO a block, but a doctor can add a block AFTER being assigned
// — this surfaces that as a yellow pill so the CRO can reschedule.
function overlapsBlock(doctorId: number, start: Date, durationMin: number, blocks: ScheduleBlock[]): boolean {
  if (Number.isNaN(start.getTime())) return false
  const end = new Date(start.getTime() + durationMin * 60000)
  return blocks.some(
    (b) => b.doctor_id === doctorId && new Date(b.start_at) < end && new Date(b.end_at) > start,
  )
}

// Best-effort parse of the list item's free-text datetime. Handles both the
// ISO "YYYY-MM-DD HH:MM" and the Thai web display "DD/MM/YYYY HH:MM" formats.
// Unparseable (e.g. Thai month names) -> null -> no pill (never a false one).
function parseBookingStart(text?: string | null): Date | null {
  const s = text ?? ''
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4]), Number(iso[5]))
  const dmy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\D+(\d{1,2}):(\d{2})/)
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4]), Number(dmy[5]))
  return null
}

function ConflictPill() {
  const { t } = useTranslation()
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
      title={t('bookings.timeConflictHint')}
    >
      <AlertTriangle size={11} /> {t('bookings.timeConflict')}
    </span>
  )
}

// หน้า inbox รายการนัดของ CRO (และ admin) — แท็บ active/history, กรอง status,
// กด approve (เลือกหมอ) / reject / reschedule คำขอจองที่มาจาก LINE bot
export function Bookings() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<BookingGroup>('active')
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [newBookingOpen, setNewBookingOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)

  const filters = FILTERS_BY_TAB[tab]

  const list = useBookings({
    // When no specific status is picked, drive the list by the tab's group.
    status: filter === 'all' ? undefined : filter,
    group: filter === 'all' ? tab : undefined,
    page,
    limit: PAGE_LIMIT,
  })
  const detail = useBooking(selectedUid)

  // All doctors' time-off blocks over a wide window (computed once so the query
  // key stays stable) — used to flag bookings whose assigned doctor is now
  // unavailable at the appointment time.
  const [blocksRange] = useState(() => {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const from = new Date(); from.setDate(from.getDate() - 90)
    const to = new Date(); to.setDate(to.getDate() + 365)
    return { from: iso(from), to: iso(to) }
  })
  const blocks = useScheduleBlocks({ dateFrom: blocksRange.from, dateTo: blocksRange.to }).data?.data ?? []

  function handleTab(key: BookingGroup) {
    setTab(key)
    setFilter('all')
    setPage(1)
    setSelectedUid(null)
  }

  function handleFilter(key: BookingStatus | 'all') {
    setFilter(key)
    setPage(1)
    setSelectedUid(null)
  }

  const totalPages = list.data?.pagination.total_pages ?? 0
  const total = list.data?.pagination.total ?? 0

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-white">
      <section
        className={`${selectedUid ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col overflow-y-auto bg-white p-6 md:p-8 lg:p-10`}
      >
        {/* Masthead — instrument label + serif heading, primary action on the right */}
        <div className="animate-rise mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
              CRO Bookings
            </p>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{t('bookings.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bbh-muted">
              {t('bookings.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewBookingOpen(true)}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            <Plus size={16} /> {t('bookings.newBooking')}
          </button>
        </div>

        {/* Lifecycle tabs — segmented control; green reserved for the active tab */}
        <div
          className="animate-rise mb-4 inline-flex rounded-lg border border-bbh-line bg-white p-1"
          role="tablist"
          style={{ animationDelay: '40ms' }}
        >
          {TABS.map((item) => {
            const active = item.key === tab
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleTab(item.key)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ${FOCUS_RING} ${
                  active
                    ? 'bg-bbh-green text-white'
                    : 'bg-transparent text-bbh-muted hover:text-bbh-green-dark'
                }`}
              >
                {t(item.labelKey)}
              </button>
            )
          })}
        </div>

        {/* Filter rail — hairline pills; green reserved for the active filter */}
        <div className="animate-rise mb-8 flex flex-wrap items-center gap-2" style={{ animationDelay: '70ms' }}>
          {filters.map((item) => {
            const active = item.key === filter
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleFilter(item.key)}
                aria-pressed={active}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${FOCUS_RING} ${
                  active
                    ? 'border-bbh-green bg-bbh-green text-white'
                    : 'border-bbh-line bg-white text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark'
                }`}
              >
                {t(item.labelKey)}
              </button>
            )
          })}
          <span className="ml-auto font-mono text-xs tabular-nums text-bbh-muted">{t('bookings.itemCount', { count: total })}</span>
        </div>

        <div className="animate-rise" style={{ animationDelay: '140ms' }}>
          {list.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-bbh-surface" />
              ))}
            </div>
          ) : null}

          {list.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              <p className="font-semibold">{t('common.loadFailed')}</p>
              <p className="mt-1 text-xs">
                {list.error instanceof ApiError ? list.error.message : t('bookings.pleaseRetry')}
              </p>
              <button
                type="button"
                onClick={() => void list.refetch()}
                className={`mt-3 inline-flex items-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors duration-200 hover:bg-red-100 ${FOCUS_RING}`}
              >
                {t('common.retry')}
              </button>
            </div>
          ) : null}

          {!list.isLoading && !list.isError && list.data && list.data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-bbh-line bg-white p-12 text-center">
              <p className="font-serif text-lg text-bbh-ink">{t('bookings.emptyTitle')}</p>
              <p className="mt-2 text-sm text-bbh-muted">{t('bookings.emptyHint')}</p>
            </div>
          ) : null}

          {!list.isLoading && !list.isError && list.data && list.data.data.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-bbh-line bg-white">
              <div className="divide-y divide-bbh-line">
                {list.data.data.map((row, i) => {
                  const active = row.request_uid === selectedUid
                  const rowStart = row.assigned_doctor_id != null ? parseBookingStart(row.requested_datetime_text) : null
                  const rowConflict = rowStart != null && overlapsBlock(row.assigned_doctor_id as number, rowStart, 60, blocks)
                  return (
                    <button
                      key={row.request_uid}
                      type="button"
                      onClick={() => setSelectedUid(row.request_uid)}
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                      className={`animate-rise relative flex w-full items-center gap-4 px-4 py-4 text-left transition-colors duration-200 ${FOCUS_RING} ${
                        active ? 'bg-bbh-green-soft/60' : 'bg-white hover:bg-bbh-surface'
                      }`}
                    >
                      {/* selected lead rail — green reserved for the active row */}
                      {active ? (
                        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-bbh-green" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-bbh-ink">
                            {row.patient_name ?? '-'}
                          </p>
                          <SourceBadge source={row.booking_source} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-bbh-muted">
                          <span className="font-mono tabular-nums">{row.phone ?? '-'}</span> ·{' '}
                          <span className="font-mono tabular-nums">{row.requested_datetime_text ?? '-'}</span>
                        </p>
                        <p className="mt-1 truncate text-xs text-bbh-muted">{row.symptom ?? '-'}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge status={row.status} />
                        {rowConflict ? <ConflictPill /> : null}
                        <span className="font-mono text-[11px] tabular-nums text-bbh-muted">
                          {formatRelative(row.created_at, t)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {totalPages > 1 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}
              >
                <ChevronLeft size={16} /> {t('bookings.previous')}
              </button>
              <span className="font-mono text-sm tabular-nums text-bbh-muted">
                {t('bookings.pageOf', { page, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className={`inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}
              >
                {t('bookings.next')} <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <aside
        className={`${selectedUid ? 'block' : 'hidden lg:block'} animate-rise w-full overflow-y-auto bg-white p-6 md:p-8 lg:w-[420px] lg:border-l lg:border-bbh-line`}
        style={{ animationDelay: '120ms' }}
      >
        {selectedUid ? (
          <button
            type="button"
            onClick={() => setSelectedUid(null)}
            className={`mb-6 inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark lg:hidden ${FOCUS_RING}`}
          >
            <ChevronLeft size={16} />
            {t('bookings.backToList')}
          </button>
        ) : null}
        {!selectedUid ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-bbh-muted">
            <div className="rounded-xl border border-dashed border-bbh-line bg-bbh-surface px-8 py-10">
              {t('bookings.selectToView')}
            </div>
          </div>
        ) : detail.isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-bbh-surface" />
        ) : detail.isError ? (
          <p className="text-sm text-red-700">{t('bookings.detailLoadFailed')}</p>
        ) : detail.data ? (
          <div className="space-y-5">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('bookings.patient')}</p>
              <p className="mt-2 font-serif text-2xl font-semibold text-bbh-ink">
                {detail.data.patient_name ?? '-'}
              </p>
              <p className="font-mono text-sm tabular-nums text-bbh-muted">{detail.data.phone ?? '-'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={detail.data.status} />
                <SourceBadge source={detail.data.booking_source} />
                {detail.data.assigned_doctor_id != null && detail.data.requested_date && detail.data.requested_time &&
                overlapsBlock(detail.data.assigned_doctor_id, new Date(`${detail.data.requested_date}T${detail.data.requested_time}`), detail.data.duration_min ?? 60, blocks)
                  ? <ConflictPill />
                  : null}
              </div>
            </div>

            <div className="rounded-xl border border-bbh-line bg-white p-4">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
                {t('bookings.requestedTime')}
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-bbh-ink">
                {detail.data.requested_datetime_text ?? '-'}
              </p>
            </div>

            <div className="rounded-xl border border-bbh-line bg-white p-4">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
                {t('bookings.symptomDetail')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-bbh-ink">
                {detail.data.symptom ?? '-'}
              </p>
            </div>

            {detail.data.calendar_event_url ? (
              <a
                href={detail.data.calendar_event_url}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center justify-between gap-2 rounded-xl border border-bbh-green/30 bg-bbh-green-soft px-4 py-3 text-sm font-medium text-bbh-green-dark transition-colors duration-200 hover:bg-bbh-green-soft/70 ${FOCUS_RING}`}
              >
                {t('bookings.openCalendarEvent')}
                <ExternalLink size={15} />
              </a>
            ) : null}

            {detail.data.notes ? (
              <div className="rounded-xl border border-bbh-line bg-white p-4">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
                  {t('bookings.notes')}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-bbh-ink">
                  {detail.data.notes}
                </p>
              </div>
            ) : null}

            {detail.data.status === 'pending_approval' ? (
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setApproveOpen(true)}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
                >
                  <Check size={16} /> {t('bookings.confirmAppointment')}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen(true)}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors duration-200 hover:bg-red-50 ${FOCUS_RING}`}
                >
                  <X size={16} /> {t('bookings.reject')}
                </button>
              </div>
            ) : null}

            {detail.data.status === 'approved' ? (
              <div className="space-y-3 pt-2">
                <AssignedDoctorField
                  key={detail.data.request_uid}
                  uid={detail.data.request_uid}
                  assignedDoctorId={detail.data.assigned_doctor_id ?? null}
                  onDone={() => void list.refetch()}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRescheduleOpen(true)}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                  >
                    <CalendarIcon size={16} /> {t('bookings.reschedule')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      <ApproveModal
        booking={detail.data ?? null}
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onApproved={() => void list.refetch()}
      />
      <RejectModal
        booking={detail.data ?? null}
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onRejected={() => void list.refetch()}
      />
      <RescheduleModal
        open={rescheduleOpen}
        uid={detail.data?.request_uid ?? null}
        currentDateTimeText={detail.data?.requested_datetime_text ?? null}
        onClose={() => setRescheduleOpen(false)}
        onSuccess={() => void list.refetch()}
      />
      <NewBookingModal
        open={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
        onCreated={(requestUid) => {
          setTab('active')
          setFilter('pending_approval')
          setPage(1)
          setSelectedUid(requestUid)
          void list.refetch()
        }}
      />
    </div>
  )
}

// Attending-doctor field for an approved booking. Shown ALWAYS (context-field
// pattern — Linear/Jira): read state resolves the name via useDoctors and
// "เปลี่ยน" swaps to an inline picker on the same spot. Reschedule email
// notifications rely on this being set, so the unassigned state stays amber and
// opens straight into the picker to prompt the CRO to complete it.
function AssignedDoctorField({ uid, assignedDoctorId, onDone }: {
  uid: string
  assignedDoctorId: number | null
  onDone: () => void
}) {
  const { t } = useTranslation()
  const doctorsQ = useDoctors()
  const assign = useAssignDoctor()
  const toast = useToast()
  const assigned = assignedDoctorId != null
  const [editing, setEditing] = useState(!assigned)
  const [doctorId, setDoctorId] = useState<number | ''>(assignedDoctorId ?? '')

  const doctors = doctorsQ.data?.data ?? []
  const current = doctors.find((d) => d.id === assignedDoctorId)

  async function submit() {
    if (doctorId === '') {
      toast.show('error', t('bookings.selectDoctorRequired'))
      return
    }
    try {
      await assign.mutateAsync({ uid, body: { assigned_doctor_id: Number(doctorId) } })
      toast.show('success', t('bookings.assignDoctorSuccess'))
      setEditing(false)
      onDone()
    } catch (error) {
      toast.show('error', error instanceof ApiError ? error.message : t('bookings.saveFailed'))
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${assigned ? 'border-bbh-line bg-white' : 'border-amber-300 bg-amber-50'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('bookings.attendingDoctor')}</p>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`rounded text-xs font-medium text-bbh-muted transition-colors duration-200 hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            {assigned ? t('bookings.changeDoctor') : t('bookings.assignDoctorCta')}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value === '' ? '' : Number(e.target.value))}
            className={`min-w-[160px] flex-1 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30 ${FOCUS_RING}`}
          >
            <option value="">{t('bookings.selectDoctorPlaceholder')}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}{d.specialty ? ` (${d.specialty})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={assign.isPending || doctorId === ''}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {assign.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('common.save')}
          </button>
          {assigned ? (
            <button
              type="button"
              onClick={() => { setEditing(false); setDoctorId(assignedDoctorId ?? '') }}
              className={`rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              {t('common.cancel')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <Stethoscope size={16} className={assigned ? 'text-bbh-green' : 'text-amber-600'} />
          <span className={`text-sm font-semibold ${assigned ? 'text-bbh-ink' : 'text-amber-800'}`}>
            {current
              ? current.display_name
              : assigned
                ? (doctorsQ.isLoading ? '…' : t('bookings.doctorNumber', { id: assignedDoctorId }))
                : t('bookings.noDoctorAssignedTitle')}
          </span>
        </div>
      )}

      {!assigned ? (
        <p className="mt-2 text-xs leading-relaxed text-amber-800">{t('bookings.noDoctorAssignedHint')}</p>
      ) : null}
    </div>
  )
}
