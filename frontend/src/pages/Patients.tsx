import { useEffect, useMemo, useState } from 'react'
import { dateLocale } from '../i18n/datetime'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronUp, Download, Edit3, ExternalLink, Link2, MessageCircle, Plus, Search, Trash2, Upload } from 'lucide-react'

import { openReportFile, downloadReportFile } from '../lib/reportFile'
import { Eyebrow } from '../components/ui/Eyebrow'
import { PatientFormModal } from '../components/patients/PatientFormModal'
import { AllergyBanner } from '../components/patients/AllergyBanner'
import { PatientCallLog } from '../components/patients/PatientCallLog'
import { PatientMedicalRecords } from '../components/patients/PatientMedicalRecords'
import { PatientProfileSection } from '../components/patients/PatientProfileSection'
import { CareTeamSection } from '../components/patients/CareTeamSection'
import { LabResultsSection } from '../components/patients/LabResultsSection'
import { BiomarkerSection } from '../components/patients/BiomarkerSection'
import { ReportFilterBar } from '../components/reports/ReportFilterBar'
import { ChatPane } from '../components/patients/ChatPane'
import { PatientTimeline } from '../components/patients/PatientTimeline'
import { ReportUploadModal } from '../components/reports/ReportUploadModal'
import { useAllBookings } from '../hooks/useAllBookings'
import { useCreatePatient } from '../hooks/useCreatePatient'
import { useDeleteReport } from '../hooks/useDeleteReport'
import { useSetNotebookLmUrl } from '../hooks/useSetNotebookLmUrl'
import { usePatient } from '../hooks/usePatient'
import { usePatientReports } from '../hooks/usePatientReports'
import { usePatients, type PatientSortKey, type SortDirection } from '../hooks/usePatients'
import { useReport } from '../hooks/useReport'
import { useUpdatePatient } from '../hooks/useUpdatePatient'
import { useUploadReport } from '../hooks/useUploadReport'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../lib/auth'
import type { components } from '../lib/api-types'

type BookingItem = components['schemas']['BookingListItem']
type PatientCreateRequest = components['schemas']['PatientCreateRequest']
type PatientUpdateRequest = components['schemas']['PatientUpdateRequest']

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

function formatDate(iso?: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString(dateLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// Shared grid template so the browse-table header and rows stay column-aligned.
// Mobile shows HN · name · reports; ≥sm adds gender/age, phone, last-visit.
// Name is capped (minmax 10–22rem) instead of eating all free width, and a
// trailing 1fr spacer soaks up the leftover — so gender/phone/last-visit/reports
// stay grouped to the left rather than being flung to the far right on a wide card.
const LIST_COLS =
  'grid-cols-[5.5rem_minmax(0,1fr)_2.75rem] sm:grid-cols-[6.5rem_minmax(10rem,22rem)_5rem_8rem_7rem_3rem_1fr]'

function computeAge(dob?: string | null): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 && age < 150 ? age : null
}
function genderShort(g?: string | null): string {
  return g === 'male' ? 'ช' : g === 'female' ? 'ญ' : g === 'other' ? 'อ' : '—'
}

// Clickable column header — sorts by its key, flips direction on re-click, and
// shows an arrow for the active column (spreadsheet convention; no guessing).
function SortHead({ k, label, sortKey, sortDir, onSort, className = 'flex' }: {
  k: PatientSortKey
  label: string
  sortKey: PatientSortKey
  sortDir: SortDirection
  onSort: (k: PatientSortKey) => void
  className?: string
}) {
  const active = sortKey === k
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`${className} items-center gap-1 uppercase tracking-wider transition-colors ${active ? 'text-bbh-green-dark' : 'hover:text-bbh-ink'}`}
    >
      {label}
      {active ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
    </button>
  )
}

// Patient detail is split into tabs so a doctor isn't scrolling one long column
// of clinical modules (collapsible/tab organization — clinical-dashboard density
// guidance). The report workspace stays persistent in the right aside.
const PATIENT_TABS = [
  { key: 'overview' },
  { key: 'labs' },
  { key: 'activity' },
  { key: 'profile' },
] as const
type PatientTab = (typeof PATIENT_TABS)[number]['key']

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

// จับคู่รายการนัดกับคนไข้ด้วยเบอร์โทรหรือชื่อ (normalize ก่อนเทียบ) เพื่อโชว์ประวัตินัดในหน้าคนไข้
function matchingBookings(bookings: BookingItem[], patient?: { display_name?: string; phone?: string | null } | null) {
  if (!patient) return []
  const phone = normalize(patient.phone)
  const name = normalize(patient.display_name)
  return bookings.filter((booking) => {
    const bookingPhone = normalize(booking.phone)
    const bookingName = normalize(booking.patient_name)
    return Boolean((phone && bookingPhone === phone) || (name && bookingName === name))
  })
}

// หน้าเวชระเบียนคนไข้ (CRO/หมอ/nurse/admin) — ค้นหา/เพิ่ม/แก้คนไข้ และดูรายละเอียด:
// โรคประจำตัว, แพ้ยา, ยาที่ใช้, ประวัตินัด, ผลแล็บ; การเข้าดูถูกบันทึกลง audit log
export function Patients() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const canWritePatient = user?.role === 'cro' || user?.role === 'admin'
  const canAnalyze = user?.role === 'doctor' || user?.role === 'admin'

  const [searchParams, setSearchParams] = useSearchParams()
  const queryPatientId = Number(searchParams.get('patient')) || null
  const queryReportId = Number(searchParams.get('report')) || null

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [mine, setMine] = useState(false)
  const [sortKey, setSortKey] = useState<PatientSortKey>('hn')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  // Selected patient is driven by the URL (?patient=<id>), not local state, so the
  // browser Back button returns to the list and a record is shareable / survives a
  // refresh. openPatient/backToList (below) push+clear that param.
  const selectedId = queryPatientId
  const showPatientDetail = queryPatientId != null
  const [selectedReportId, setSelectedReportId] = useState<number | null>(queryReportId)
  const [patientModal, setPatientModal] = useState<'create' | 'edit' | null>(null)
  const [viewMode, setViewMode] = useState<'detail' | 'chat'>('detail')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [notebookUrlDraft, setNotebookUrlDraft] = useState('')
  // Secondary report data (raw extracted text + NotebookLM) is collapsed by
  // default so the aside leads with the report list + analysis (Hick's law —
  // fewer competing choices per screen).
  const [showReportExtras, setShowReportExtras] = useState(false)

  // Open a patient's record = push ?patient=<id> (a real history entry, so the
  // browser Back button pops it and returns to the list); clearing the param goes
  // back to the list. The report picker stays local — opening a patient resets it.
  function openPatient(id: number) {
    setSelectedReportId(null)
    setViewMode('detail')
    setSearchParams({ patient: String(id) })
  }
  function backToList() {
    setSearchParams({})
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setNotebookUrlDraft('')
  }, [selectedReportId])

  const patientsQ = usePatients({ search: debouncedSearch, mine, page, limit: 20, sort: sortKey, direction: sortDir })

  // Click a column header to sort by it; clicking the active column flips
  // direction. New columns start on their most useful direction (names A→Z,
  // HN / last-visit newest first).
  function toggleSort(key: PatientSortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
    setPage(1)
  }
  const patientQ = usePatient(selectedId)
  const reportsQ = usePatientReports(selectedId)
  const reportQ = useReport(selectedReportId)

  const createPatient = useCreatePatient()
  const updatePatient = useUpdatePatient()
  const uploadReport = useUploadReport()
  const deleteReport = useDeleteReport()
  const setNotebookLmUrl = useSetNotebookLmUrl()

  const approvedQ = useAllBookings('approved')
  const pendingQ = useAllBookings('pending_approval')
  const rejectedQ = useAllBookings('rejected')
  const cancelledQ = useAllBookings('cancelled')

  const patients = useMemo(() => patientsQ.data?.data ?? [], [patientsQ.data])
  const pagination = patientsQ.data?.pagination
  const selectedPatient = patientQ.data ?? null
  const reports = useMemo(() => reportsQ.data?.data ?? [], [reportsQ.data])
  const [mainTab, setMainTab] = useState<PatientTab>('overview')
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('all')
  const [reportUnreadOnly, setReportUnreadOnly] = useState(false)
  const [reportSearch, setReportSearch] = useState('')
  const filteredReports = useMemo(() => {
    const s = reportSearch.trim().toLowerCase()
    return reports.filter((r) =>
      (reportTypeFilter === 'all' || r.report_type === reportTypeFilter) &&
      (!reportUnreadOnly || r.latest_analysis_at == null) &&
      (s === '' || r.title.toLowerCase().includes(s) || r.report_type.toLowerCase().includes(s)),
    )
  }, [reports, reportTypeFilter, reportUnreadOnly, reportSearch])
  const allBookings = useMemo(
    () => [...approvedQ.data, ...pendingQ.data, ...rejectedQ.data, ...cancelledQ.data],
    [approvedQ.data, pendingQ.data, rejectedQ.data, cancelledQ.data]
  )
  const patientBookings = useMemo(
    () => matchingBookings(allBookings, selectedPatient),
    [allBookings, selectedPatient]
  )

  useEffect(() => {
    // Don't auto-pick the first report while a specific one is being requested via deep link.
    if (reportsQ.isLoading) return
    if (selectedReportId != null && reports.some((report) => report.id === selectedReportId)) return
    if (selectedReportId != null && reports.length === 0) return  // deep link to report still pending
    // Lead with the newest report that still needs analysis (Tesler's law — the
    // system surfaces the doctor's pending work instead of making them hunt for
    // it); pick from the VISIBLE (filtered) list so the auto-selected report
    // always has a highlightable row, falling back to the newest report.
    const firstUnanalyzed = filteredReports.find((r) => r.latest_analysis_at == null)
    setSelectedReportId((firstUnanalyzed ?? filteredReports[0] ?? reports[0])?.id ?? null)
  }, [reports, filteredReports, selectedReportId, reportsQ.isLoading])

  function submitPatient(body: PatientCreateRequest | PatientUpdateRequest) {
    if (patientModal === 'create') {
      createPatient.mutate(body as PatientCreateRequest, {
        onSuccess: (patient) => {
          openPatient(patient.id)
          toast.show('success', t('patients.toast.createSuccess'))
          setPatientModal(null)
        },
        onError: () => toast.show('error', t('patients.toast.createFailed')),
      })
      return
    }
    if (selectedId == null) return
    updatePatient.mutate({ id: selectedId, body: body as PatientUpdateRequest }, {
      onSuccess: () => {
        toast.show('success', t('patients.toast.saveSuccess'))
        setPatientModal(null)
      },
      onError: () => toast.show('error', t('patients.toast.saveFailed')),
    })
  }

  function submitReport(formData: FormData) {
    if (selectedId == null) return
    uploadReport.mutate({ patientId: selectedId, formData }, {
      onSuccess: (result) => {
        setSelectedReportId(result.id)
        toast.show('success', result.notified_doctor ? t('patients.toast.uploadSuccessNotified') : t('patients.toast.uploadSuccess'))
        setUploadOpen(false)
      },
      onError: () => toast.show('error', t('patients.toast.uploadFailed')),
    })
  }

  function deleteReportById(reportId: number) {
    if (selectedId == null) return
    if (!window.confirm(t('patients.confirmDeleteReport'))) return
    deleteReport.mutate({ reportId, patientId: selectedId }, {
      onSuccess: () => {
        if (selectedReportId === reportId) setSelectedReportId(null)
        toast.show('success', t('patients.toast.deleteReportSuccess'))
      },
      onError: () => toast.show('error', t('patients.toast.deleteReportFailed')),
    })
  }

  function submitNotebookUrl(event: React.FormEvent) {
    event.preventDefault()
    if (selectedId == null || selectedReportId == null || !notebookUrlDraft.trim()) return
    setNotebookLmUrl.mutate(
      { reportId: selectedReportId, patientId: selectedId, url: notebookUrlDraft.trim() },
      {
        onSuccess: () => {
          setNotebookUrlDraft('')
          toast.show('success', t('patients.toast.notebookUrlSuccess'))
        },
        onError: () => toast.show('error', t('patients.toast.notebookUrlFailed')),
      }
    )
  }

  const totalPages = pagination?.total_pages ?? 1

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden bg-white">
      <section
        className={`${showPatientDetail ? 'hidden' : 'flex'} m-6 min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-bbh-line bg-white shadow-bbh-md`}
      >
        <div className="space-y-3 border-b border-bbh-line p-4">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-bbh-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('patients.searchPlaceholder')}
                className="h-11 w-full rounded-lg border border-bbh-line py-2 pl-9 pr-3 text-sm text-bbh-ink placeholder:text-bbh-muted transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30"
              />
            </div>
            {user?.role === 'doctor' ? (
              <button
                type="button"
                onClick={() => { setMine((v) => !v); setPage(1) }}
                aria-pressed={mine}
                className={`inline-flex h-11 shrink-0 items-center rounded-lg border px-3 text-sm font-medium transition-colors duration-200 ${FOCUS_RING} ${
                  mine
                    ? 'border-bbh-green bg-bbh-green-soft text-bbh-green-dark'
                    : 'border-bbh-line bg-white text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark'
                }`}
                title={t('patients.myPatientsTooltip')}
              >
                {t('patients.myPatients')}
              </button>
            ) : null}
            {canWritePatient ? (
              <button
                type="button"
                onClick={() => setPatientModal('create')}
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-bbh-green text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
                title={t('patients.addPatient')}
              >
                <Plus size={18} />
              </button>
            ) : null}
          </div>
          <p className="font-mono text-xs tabular-nums text-bbh-muted">
            {patientsQ.isLoading ? t('common.loading') : t('patients.patientCount', { count: pagination?.total ?? 0 })}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {patientsQ.isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-bbh-surface" />)}
            </div>
          ) : patients.length === 0 ? (
            <div className="m-3 mt-8 rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
              {t('patients.notFound')}
            </div>
          ) : (
            <>
              {/* Sortable header — click a column to sort; arrow shows direction */}
              <div className={`sticky top-0 z-10 grid ${LIST_COLS} items-center gap-3 border-b border-bbh-line bg-white px-3 py-2 text-xs font-medium uppercase tracking-wider text-bbh-muted`}>
                <SortHead k="hn" label={t('patients.colHn')} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead k="name" label={t('patients.colName')} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <span className="hidden sm:block">{t('patients.colGenderAge')}</span>
                <span className="hidden sm:block">{t('patients.colPhone')}</span>
                <SortHead k="latest_visit" label={t('patients.colLastVisit')} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="hidden sm:flex" />
                <span className="text-right">{t('patients.colReports')}</span>
              </div>
              {/* Hairline-divided rows, no zebra: with row separators already
                  present, alternating fills are redundant ink (Tufte). White rows +
                  divide-y + green-soft selection = the same list language as Bookings. */}
              <div className="divide-y divide-bbh-line/60">
                {patients.map((patient) => {
                  const active = patient.id === selectedId
                  const age = computeAge(patient.dob)
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => openPatient(patient.id)}
                      className={`grid ${LIST_COLS} w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors duration-150 ${FOCUS_RING} ${
                        active ? 'bg-bbh-green-soft' : 'bg-white hover:bg-bbh-surface'
                      }`}
                    >
                      <span className="font-mono text-xs tabular-nums text-bbh-muted">{patient.hn ?? '—'}</span>
                      <span className={`min-w-0 truncate font-medium ${active ? 'text-bbh-green-dark' : 'text-bbh-ink'}`}>{patient.display_name}</span>
                      <span className="hidden text-xs text-bbh-muted sm:block">{genderShort(patient.gender)}{age != null ? ` · ${age}` : ''}</span>
                      <span className="hidden truncate font-mono text-xs tabular-nums text-bbh-muted sm:block">{patient.phone ?? '—'}</span>
                      <span className="hidden font-mono text-xs tabular-nums text-bbh-muted sm:block">{patient.latest_visit_at ? formatDate(patient.latest_visit_at) : '—'}</span>
                      <span className="text-right font-mono text-xs tabular-nums text-bbh-muted">{patient.total_reports}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-bbh-line p-3 text-xs text-bbh-muted">
          <button type="button" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))} className={`rounded-lg border border-bbh-line bg-white px-3 py-1.5 font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}>
            {t('patients.prev')}
          </button>
          <span className="font-mono tabular-nums">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((v) => v + 1)} className={`rounded-lg border border-bbh-line bg-white px-3 py-1.5 font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}>
            {t('patients.next')}
          </button>
        </div>
      </section>

      <main className={`${showPatientDetail ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-hidden ${viewMode === 'chat' ? '' : 'overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]'}`}>
        {!selectedPatient ? (
          <div className="flex h-full items-center justify-center text-center text-bbh-muted">
            {t('patients.selectPatient')}
          </div>
        ) : viewMode === 'chat' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-bbh-line px-4 py-3">
              <button
                type="button"
                onClick={() => setViewMode('detail')}
                className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
              >
                <ChevronLeft size={16} />
                {t('patients.backToPatientInfo')}
              </button>
              <div className="min-w-0 text-right">
                <p className="truncate font-serif text-lg font-semibold text-bbh-ink">{selectedPatient.display_name}</p>
                <p className="font-mono text-xs tabular-nums text-bbh-muted">{selectedPatient.hn ?? t('patients.noHnShort')} · {selectedPatient.phone ?? t('patients.noPhone')}</p>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPane
                patientId={selectedPatient.id}
                patientName={selectedPatient.display_name}
                showHeader={false}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Full-width WHITE header band — the record masthead sits on solid
                white, edge to edge, so the name reads clearly instead of sinking
                into the tinted canvas. Content stays width-capped + centered inside
                the band; the record body below keeps the tinted canvas. */}
            <div className="border-b border-bbh-line bg-white px-6 py-6 md:px-8 lg:px-10">
              <div className="flex w-full flex-col gap-4">
            {/* w-full is REQUIRED: <main> is a flex-col container, so a flex child
                with mx-auto but no explicit width shrinks to its content's
                max-content instead of filling. That made the record width vary per
                patient AND per tab. w-full pins it to 100% (capped at max-w-5xl),
                so the width is constant regardless of what content is inside.
                Back to the patient list — the page is list-first (list → detail),
                so this is the single way back on every breakpoint. */}
            <button
              type="button"
              onClick={backToList}
              className={`inline-flex items-center gap-1.5 self-start rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
            >
              <ChevronLeft size={16} />
              {t('patients.backToList')}
            </button>
            <section className="animate-rise flex flex-wrap items-start justify-between gap-4">
              <div>
                <Eyebrow>Patient Record</Eyebrow>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h1 className="font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{selectedPatient.display_name}</h1>
                  <span className="rounded-full border border-bbh-line bg-bbh-surface px-2.5 py-1 font-mono text-xs tabular-nums text-bbh-muted">{selectedPatient.hn ?? t('patients.noHnShort')}</span>
                </div>
                <p className="mt-2 text-sm text-bbh-muted">
                  <span className="font-mono tabular-nums">{selectedPatient.phone ?? t('patients.noPhone')}</span> · {selectedPatient.email ?? t('patients.noEmail')} · {t('patients.born')} <span className="font-mono tabular-nums">{formatDate(selectedPatient.dob)}</span>
                  {selectedPatient.nationality ? <> · {selectedPatient.nationality}</> : null}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {canWritePatient ? (
                  <button type="button" onClick={() => setPatientModal('edit')} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark sm:flex-none ${FOCUS_RING}`}>
                    <Edit3 size={16} />
                    {t('common.edit')}
                  </button>
                ) : null}
                <button type="button" onClick={() => setViewMode('chat')} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark sm:flex-none ${FOCUS_RING}`}>
                  <MessageCircle size={16} />
                  Chat LINE
                </button>
                <button type="button" onClick={() => setUploadOpen(true)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-bbh-green px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark sm:flex-none ${FOCUS_RING}`}>
                  <Upload size={16} />
                  {t('patients.uploadReport')}
                </button>
              </div>
            </section>
              </div>
            </div>

            {/* Record body — on the tinted canvas below the white masthead. */}
            <div className="w-full space-y-5 px-6 py-6 md:px-8 lg:px-10">
            {/* Drug allergies are the single highest-priority safety signal for a
                doctor opening a record, so they lead the record full-width (clinical-
                priority hierarchy) instead of sitting compact in the right aside.
                Renders nothing when the patient has no allergies. */}
            <AllergyBanner patientId={selectedPatient.id} />

            {/* Report workspace is a FIXED 360px column; the tab content column
                takes all remaining width. Fixed aside = the tab column is a
                constant width on every tab, so switching ภาพรวม/ผลแล็บ/กิจกรรม
                never changes the content width (previously the fr-sized aside
                flexed per tab and made labs widest). */}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0 space-y-4">
                <div className="grid gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line shadow-bbh-sm sm:grid-cols-3">
                  <div className="bg-white p-4">
                    <Eyebrow>Reports</Eyebrow>
                    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-bbh-ink">{reports.length}</p>
                  </div>
                  <div className="bg-white p-4">
                    <Eyebrow>Bookings</Eyebrow>
                    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-bbh-ink">{patientBookings.length}</p>
                  </div>
                  <div className="bg-white p-4">
                    <Eyebrow>Latest visit</Eyebrow>
                    <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-bbh-ink">{formatDate(patients.find((p) => p.id === selectedId)?.latest_visit_at)}</p>
                  </div>
                </div>

                <div className="inline-flex rounded-xl border border-bbh-line bg-white p-1 text-sm font-medium shadow-bbh-sm">
                  {PATIENT_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setMainTab(tab.key)}
                      className={`rounded-lg px-4 py-1.5 transition-colors duration-200 ${FOCUS_RING} ${mainTab === tab.key ? 'bg-bbh-green text-white' : 'text-bbh-muted hover:text-bbh-ink'}`}
                    >
                      {t(`patients.tabs.${tab.key}`)}
                    </button>
                  ))}
                </div>

                {/* ONE persistent panel element for all three tabs — React swaps only
                    the children, so the panel width is identical on every tab by
                    construction (not three separate divs sized independently).
                    min-w-0 stops any wide child (Biomarker grid / sparkline) from
                    expanding it; sub-sections are bare to avoid a double border. */}
                <div className="min-w-0 space-y-6 rounded-xl border border-bbh-line bg-white p-4 shadow-bbh-sm">
                  {mainTab === 'overview' ? (
                    <>
                      <CareTeamSection patientId={selectedPatient.id} />
                      <section>
                        <Eyebrow as="h2" className="mb-3">{t('patients.medicalHistory')}</Eyebrow>
                        <PatientMedicalRecords patientId={selectedPatient.id} />
                      </section>
                    </>
                  ) : null}

                  {mainTab === 'labs' ? (
                    <>
                      <LabResultsSection patientId={selectedPatient.id} />
                      <BiomarkerSection patientId={selectedPatient.id} />
                    </>
                  ) : null}

                  {mainTab === 'activity' ? (
                    <>
                      <PatientCallLog patientId={selectedPatient.id} />
                      <section>
                        <Eyebrow as="h2" className="mb-3">Timeline</Eyebrow>
                        <PatientTimeline reports={reports} bookings={patientBookings} onSelectReport={setSelectedReportId} />
                      </section>
                    </>
                  ) : null}

                  {mainTab === 'profile' ? (
                    <PatientProfileSection patientId={selectedPatient.id} />
                  ) : null}
                </div>
              </section>

              <aside className="space-y-4">
                <section className="rounded-xl border border-bbh-line bg-white p-4 shadow-bbh-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Eyebrow as="h2">Selected report</Eyebrow>
                    {selectedReportId ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openReportFile(selectedReportId)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-2.5 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                          title={t('patients.openReportTooltip')}
                        >
                          <ExternalLink size={14} />
                          {t('patients.openFile')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const r = reportQ.data
                            const fallback = r?.title ?? `report-${selectedReportId}`
                            const ext = (r?.file_mime ?? '').includes('pdf') ? '.pdf'
                              : (r?.file_mime ?? '').includes('png') ? '.png'
                              : (r?.file_mime ?? '').includes('jpeg') ? '.jpg'
                              : (r?.file_mime ?? '').includes('text') ? '.txt'
                              : ''
                            void downloadReportFile(selectedReportId, `${fallback}${ext}`)
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-2.5 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                          title={t('patients.downloadTooltip')}
                        >
                          <Download size={14} />
                          {t('patients.download')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedId) return
                            const link = `${window.location.origin}/patients?patient=${selectedId}&report=${selectedReportId}`
                            void navigator.clipboard.writeText(link).then(
                              () => toast.show('success', t('patients.toast.linkCopied')),
                              () => toast.show('error', t('patients.toast.copyFailed')),
                            )
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-2.5 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                          title={t('patients.copyLinkTooltip')}
                        >
                          <Link2 size={14} />
                          {t('patients.copyLink')}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {reports.length > 0 ? (
                    <ReportFilterBar
                      reports={reports}
                      activeType={reportTypeFilter}
                      onType={setReportTypeFilter}
                      unreadOnly={reportUnreadOnly}
                      onUnreadToggle={() => setReportUnreadOnly((v) => !v)}
                      search={reportSearch}
                      onSearch={setReportSearch}
                      onReset={() => { setReportTypeFilter('all'); setReportUnreadOnly(false); setReportSearch('') }}
                    />
                  ) : null}

                  {filteredReports.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
                      {reports.length === 0 ? t('patients.noReports') : t('patients.noReportsMatchFilter')}
                    </div>
                  ) : (
                    /* One list zone (Proximity + Data-ink): hairline-divided rows in
                       a single container instead of N separate bordered cards.
                       Selected row = green-soft fill + a left rail — the same list
                       language as the Bookings inbox (Repetition/consistency). */
                    <div className="divide-y divide-bbh-line overflow-hidden rounded-xl border border-bbh-line">
                      {filteredReports.map((report) => {
                        const active = report.id === selectedReportId
                        return (
                          <div
                            key={report.id}
                            className={`relative flex w-full items-center transition-colors duration-200 ${
                              active ? 'bg-bbh-green-soft' : 'bg-white hover:bg-bbh-surface'
                            }`}
                          >
                            {active ? (
                              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-bbh-green" />
                            ) : null}
                            <button type="button" onClick={() => setSelectedReportId(report.id)} className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left ${FOCUS_RING}`}>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-bbh-ink">{report.title}</p>
                                <p className="text-xs text-bbh-muted">{report.report_type} · <span className="font-mono tabular-nums">{formatDate(report.uploaded_at)}</span></p>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteReportById(report.id)}
                              disabled={deleteReport.isPending}
                              title={t('patients.deleteReportTooltip')}
                              className={`mr-2 shrink-0 rounded-lg p-1.5 text-bbh-muted transition-colors duration-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {selectedReportId ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setShowReportExtras((v) => !v)}
                        aria-expanded={showReportExtras}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                      >
                        {t('patients.reportDetails')}
                        <ChevronDown size={14} className={`transition-transform duration-200 ${showReportExtras ? 'rotate-180' : ''}`} />
                      </button>
                      {showReportExtras ? (
                        <div className="mt-3 space-y-3">
                          {reportQ.data?.extracted_text ? (
                            <div className="rounded-xl bg-bbh-surface p-3">
                              <p className="mb-2 text-xs font-semibold text-bbh-muted">Extracted text</p>
                              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-bbh-ink">
                                {reportQ.data.extracted_text}
                              </p>
                            </div>
                          ) : null}
                          <div className="rounded-xl border border-bbh-line p-3">
                            <p className="mb-2 text-xs font-semibold text-bbh-muted">NotebookLM</p>
                            {reportQ.data?.notebooklm_url ? (
                              <a href={reportQ.data.notebooklm_url} target="_blank" rel="noreferrer" className="mb-2 block truncate text-sm text-bbh-green underline">
                                {reportQ.data.notebooklm_url}
                              </a>
                            ) : (
                              <p className="mb-2 text-xs text-bbh-muted">{t('patients.notebookLmHint')}</p>
                            )}
                            {canAnalyze ? (
                              <form onSubmit={submitNotebookUrl} className="flex gap-2">
                                <input
                                  type="url"
                                  value={notebookUrlDraft}
                                  onChange={(e) => setNotebookUrlDraft(e.target.value)}
                                  placeholder={t('patients.notebookLmPlaceholder')}
                                  className="h-9 flex-1 rounded-lg border border-bbh-line px-3 text-xs transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30"
                                />
                                <button
                                  type="submit"
                                  disabled={setNotebookLmUrl.isPending || !notebookUrlDraft.trim()}
                                  className={`h-9 shrink-0 rounded-lg bg-bbh-green px-3 text-xs font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
                                >
                                  {t('common.save')}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

              </aside>
            </div>
          </div>
          </>
        )}
      </main>

      <PatientFormModal
        open={patientModal != null}
        mode={patientModal ?? 'create'}
        patient={selectedPatient}
        saving={createPatient.isPending || updatePatient.isPending}
        onClose={() => setPatientModal(null)}
        onSubmit={submitPatient}
      />
      <ReportUploadModal
        open={uploadOpen}
        saving={uploadReport.isPending}
        onClose={() => setUploadOpen(false)}
        onSubmit={submitReport}
        patientId={selectedPatient?.id}
      />
    </div>
  )
}


