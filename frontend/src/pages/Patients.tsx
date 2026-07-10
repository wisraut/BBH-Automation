import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, Edit3, ExternalLink, FileText, Link2, MessageCircle, Plus, Search, Trash2, Upload } from 'lucide-react'

import { API_BASE } from '../lib/apiBase'
import { PatientFormModal } from '../components/patients/PatientFormModal'
import { AllergyBanner } from '../components/patients/AllergyBanner'
import { PatientCallLog } from '../components/patients/PatientCallLog'
import { PatientMedicalRecords } from '../components/patients/PatientMedicalRecords'
import { CareTeamSection } from '../components/patients/CareTeamSection'
import { LabResultsSection } from '../components/patients/LabResultsSection'
import { BiomarkerSection } from '../components/patients/BiomarkerSection'
import { MeasurementReviewPanel } from '../components/reports/MeasurementReviewPanel'
import { ReportFilterBar } from '../components/reports/ReportFilterBar'
import { ChatPane } from '../components/patients/ChatPane'
import { PatientTimeline } from '../components/patients/PatientTimeline'
import { AnalysisPanel } from '../components/reports/AnalysisPanel'
import { ReportUploadModal } from '../components/reports/ReportUploadModal'
import { useAllBookings } from '../hooks/useAllBookings'
import { useAnalyzeReport } from '../hooks/useAnalyzeReport'
import { useCreatePatient } from '../hooks/useCreatePatient'
import { useDecideTriage } from '../hooks/useDecideTriage'
import { useDeleteReport } from '../hooks/useDeleteReport'
import { useSetNotebookLmUrl } from '../hooks/useSetNotebookLmUrl'
import { usePatient } from '../hooks/usePatient'
import { usePatientReports } from '../hooks/usePatientReports'
import { usePatients } from '../hooks/usePatients'
import { useReport } from '../hooks/useReport'
import { useReportAnalyses } from '../hooks/useReportAnalyses'
import { useUpdatePatient } from '../hooks/useUpdatePatient'
import { useUploadReport } from '../hooks/useUploadReport'
import { useToast } from '../hooks/useToast'
import { getToken } from '../lib/api'
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
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

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

async function fetchReportBlob(reportId: number): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/reports/${reportId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) throw new Error('Cannot fetch report file')
  return res.blob()
}

async function openReportFile(reportId: number) {
  const blob = await fetchReportBlob(reportId)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function downloadReportFile(reportId: number, filename: string) {
  const blob = await fetchReportBlob(reportId)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function Patients() {
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
  const [selectedId, setSelectedId] = useState<number | null>(queryPatientId)
  const [showPatientDetail, setShowPatientDetail] = useState(Boolean(queryPatientId))
  const [selectedReportId, setSelectedReportId] = useState<number | null>(queryReportId)
  const [patientModal, setPatientModal] = useState<'create' | 'edit' | null>(null)
  const [viewMode, setViewMode] = useState<'detail' | 'chat'>('detail')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [notebookUrlDraft, setNotebookUrlDraft] = useState('')

  // Strip ?patient&?report from URL once we've consumed them so the user's
  // back-button history doesn't keep re-opening the same record.
  useEffect(() => {
    if (queryPatientId || queryReportId) {
      const next = new URLSearchParams(searchParams)
      next.delete('patient')
      next.delete('report')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const patientsQ = usePatients({ search: debouncedSearch, mine, page, limit: 20 })
  const patientQ = usePatient(selectedId)
  const reportsQ = usePatientReports(selectedId)
  const reportQ = useReport(selectedReportId)
  const analysesQ = useReportAnalyses(selectedReportId)

  const createPatient = useCreatePatient()
  const updatePatient = useUpdatePatient()
  const uploadReport = useUploadReport()
  const deleteReport = useDeleteReport()
  const setNotebookLmUrl = useSetNotebookLmUrl()
  const analyzeReport = useAnalyzeReport()
  const decideTriage = useDecideTriage()

  const approvedQ = useAllBookings('approved')
  const pendingQ = useAllBookings('pending_approval')
  const rejectedQ = useAllBookings('rejected')
  const cancelledQ = useAllBookings('cancelled')

  const patients = useMemo(() => patientsQ.data?.data ?? [], [patientsQ.data])
  const pagination = patientsQ.data?.pagination
  const selectedPatient = patientQ.data ?? null
  const reports = useMemo(() => reportsQ.data?.data ?? [], [reportsQ.data])
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
  const analyses = analysesQ.data?.data ?? []
  const allBookings = useMemo(
    () => [...approvedQ.data, ...pendingQ.data, ...rejectedQ.data, ...cancelledQ.data],
    [approvedQ.data, pendingQ.data, rejectedQ.data, cancelledQ.data]
  )
  const patientBookings = useMemo(
    () => matchingBookings(allBookings, selectedPatient),
    [allBookings, selectedPatient]
  )

  useEffect(() => {
    // Wait until the patient list query has resolved so we don't clobber
    // an id passed in via ?patient= deep link before the list arrives.
    if (patientsQ.isLoading) return
    if (selectedId != null) return  // keep user/deep-link selection; detail query loads it
    setSelectedId(patients[0]?.id ?? null)
  }, [patients, selectedId, patientsQ.isLoading])

  useEffect(() => {
    // Don't auto-pick the first report while a specific one is being requested via deep link.
    if (reportsQ.isLoading) return
    if (selectedReportId != null && reports.some((report) => report.id === selectedReportId)) return
    if (selectedReportId != null && reports.length === 0) return  // deep link to report still pending
    setSelectedReportId(reports[0]?.id ?? null)
  }, [reports, selectedReportId, reportsQ.isLoading])

  function submitPatient(body: PatientCreateRequest | PatientUpdateRequest) {
    if (patientModal === 'create') {
      createPatient.mutate(body as PatientCreateRequest, {
        onSuccess: (patient) => {
          setSelectedId(patient.id)
          setShowPatientDetail(true)
          toast.show('success', 'สร้างคนไข้สำเร็จ')
          setPatientModal(null)
        },
        onError: () => toast.show('error', 'สร้างคนไข้ไม่สำเร็จ'),
      })
      return
    }
    if (selectedId == null) return
    updatePatient.mutate({ id: selectedId, body: body as PatientUpdateRequest }, {
      onSuccess: () => {
        toast.show('success', 'บันทึกข้อมูลคนไข้สำเร็จ')
        setPatientModal(null)
      },
      onError: () => toast.show('error', 'บันทึกข้อมูลคนไข้ไม่สำเร็จ'),
    })
  }

  function submitReport(formData: FormData) {
    if (selectedId == null) return
    uploadReport.mutate({ patientId: selectedId, formData }, {
      onSuccess: (result) => {
        setSelectedReportId(result.id)
        toast.show('success', result.notified_doctor ? 'อัพโหลด Report สำเร็จ และแจ้งเตือนหมอทางอีเมลแล้ว' : 'อัพโหลด Report สำเร็จ')
        setUploadOpen(false)
      },
      onError: () => toast.show('error', 'อัพโหลด Report ไม่สำเร็จ'),
    })
  }

  function deleteReportById(reportId: number) {
    if (selectedId == null) return
    if (!window.confirm('ลบ Report นี้ใช่ไหม? การลบจะลบไฟล์และผลวิเคราะห์ที่เกี่ยวข้องทั้งหมด')) return
    deleteReport.mutate({ reportId, patientId: selectedId }, {
      onSuccess: () => {
        if (selectedReportId === reportId) setSelectedReportId(null)
        toast.show('success', 'ลบ Report สำเร็จ')
      },
      onError: () => toast.show('error', 'ลบ Report ไม่สำเร็จ'),
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
          toast.show('success', 'บันทึก link NotebookLM สำเร็จ')
        },
        onError: () => toast.show('error', 'บันทึก link NotebookLM ไม่สำเร็จ'),
      }
    )
  }

  const totalPages = pagination?.total_pages ?? 1

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden bg-white">
      <section
        className={`${showPatientDetail ? 'hidden lg:flex' : 'flex'} relative w-full shrink-0 flex-col border-bbh-line bg-white lg:w-80 lg:border-r`}
      >
        <div className="space-y-3 border-b border-bbh-line p-4">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-bbh-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ HN หรือเบอร์โทร"
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
                title="แสดงเฉพาะคนไข้ในความดูแลของฉัน"
              >
                คนไข้ของฉัน
              </button>
            ) : null}
            {canWritePatient ? (
              <button
                type="button"
                onClick={() => setPatientModal('create')}
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-bbh-green text-white transition-colors duration-200 hover:bg-bbh-green-dark ${FOCUS_RING}`}
                title="เพิ่มคนไข้"
              >
                <Plus size={18} />
              </button>
            ) : null}
          </div>
          <p className="font-mono text-xs tabular-nums text-bbh-muted">
            {patientsQ.isLoading ? 'กำลังโหลด' : `${pagination?.total ?? 0} คนไข้`}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {patientsQ.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-bbh-surface" />)}
            </div>
          ) : patients.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
              ไม่พบคนไข้
            </div>
          ) : (
            <div className="space-y-1.5">
              {patients.map((patient, i) => {
                const active = patient.id === selectedId
                return (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(patient.id)
                      setShowPatientDetail(true)
                      setSelectedReportId(null)
                      setViewMode('detail')
                    }}
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                    className={`animate-rise w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-200 ${FOCUS_RING} ${
                      active ? 'border-bbh-green bg-bbh-green-soft' : 'border-bbh-line bg-white hover:border-bbh-green hover:bg-bbh-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-bbh-ink">{patient.display_name}</p>
                        <p className="mt-0.5 truncate font-mono text-xs tabular-nums text-bbh-muted">
                          {patient.hn ?? 'ยังไม่มี HN'} · {patient.phone ?? 'ไม่มีเบอร์'}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-bbh-line bg-bbh-surface px-2 py-0.5 font-mono text-[11px] tabular-nums text-bbh-muted">
                        {patient.total_reports} reports
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-bbh-line p-3 text-xs text-bbh-muted">
          <button type="button" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))} className={`rounded-lg border border-bbh-line bg-white px-3 py-1.5 font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}>
            ก่อนหน้า
          </button>
          <span className="font-mono tabular-nums">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((v) => v + 1)} className={`rounded-lg border border-bbh-line bg-white px-3 py-1.5 font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-40 ${FOCUS_RING}`}>
            ถัดไป
          </button>
        </div>
      </section>

      <main className={`${showPatientDetail ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col overflow-hidden ${viewMode === 'chat' ? '' : 'overflow-y-auto p-6 md:p-8 lg:p-10'}`}>
        {!selectedPatient ? (
          <div className="flex h-full items-center justify-center text-center text-bbh-muted">
            เลือกคนไข้จากรายการด้านซ้าย
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
                กลับข้อมูลคนไข้
              </button>
              <div className="min-w-0 text-right">
                <p className="truncate font-serif text-lg font-semibold text-bbh-ink">{selectedPatient.display_name}</p>
                <p className="font-mono text-xs tabular-nums text-bbh-muted">{selectedPatient.hn ?? 'ไม่มี HN'} · {selectedPatient.phone ?? 'ไม่มีเบอร์'}</p>
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
          <div className="mx-auto max-w-6xl space-y-5">
            <button
              type="button"
              onClick={() => setShowPatientDetail(false)}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark lg:hidden ${FOCUS_RING}`}
            >
              <ChevronLeft size={16} />
              กลับไปรายการ
            </button>
            <section className="animate-rise flex flex-wrap items-start justify-between gap-4 border-b border-bbh-line pb-4">
              <div>
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Patient Record</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h1 className="font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{selectedPatient.display_name}</h1>
                  <span className="rounded-full border border-bbh-line bg-bbh-surface px-2.5 py-1 font-mono text-xs tabular-nums text-bbh-muted">{selectedPatient.hn ?? 'ไม่มี HN'}</span>
                </div>
                <p className="mt-2 text-sm text-bbh-muted">
                  <span className="font-mono tabular-nums">{selectedPatient.phone ?? 'ไม่มีเบอร์'}</span> · {selectedPatient.email ?? 'ไม่มีอีเมล'} · เกิด <span className="font-mono tabular-nums">{formatDate(selectedPatient.dob)}</span>
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {canWritePatient ? (
                  <button type="button" onClick={() => setPatientModal('edit')} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark sm:flex-none ${FOCUS_RING}`}>
                    <Edit3 size={16} />
                    แก้ไข
                  </button>
                ) : null}
                <button type="button" onClick={() => setViewMode('chat')} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark sm:flex-none ${FOCUS_RING}`}>
                  <MessageCircle size={16} />
                  Chat LINE
                </button>
                <button type="button" onClick={() => setUploadOpen(true)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-bbh-green px-3 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark sm:flex-none ${FOCUS_RING}`}>
                  <Upload size={16} />
                  อัพโหลด Report
                </button>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <section className="space-y-4">
                <div className="grid gap-px overflow-hidden rounded-xl border border-bbh-line bg-bbh-line sm:grid-cols-3">
                  <div className="bg-white p-4">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Reports</p>
                    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-bbh-ink">{reports.length}</p>
                  </div>
                  <div className="bg-white p-4">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Bookings</p>
                    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-bbh-ink">{patientBookings.length}</p>
                  </div>
                  <div className="bg-white p-4">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Latest visit</p>
                    <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-bbh-ink">{formatDate(patients.find((p) => p.id === selectedId)?.latest_visit_at)}</p>
                  </div>
                </div>

                <CareTeamSection patientId={selectedPatient.id} />

                <section>
                  <h2 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">ประวัติการแพทย์</h2>
                  <PatientMedicalRecords patientId={selectedPatient.id} />
                </section>

                <LabResultsSection patientId={selectedPatient.id} />

                <BiomarkerSection patientId={selectedPatient.id} />

                <PatientCallLog patientId={selectedPatient.id} />

                <section>
                  <h2 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Timeline</h2>
                  <PatientTimeline reports={reports} bookings={patientBookings} onSelectReport={setSelectedReportId} />
                </section>
              </section>

              <aside className="space-y-4">
                <section className="rounded-xl border border-bbh-line bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">Selected report</h2>
                    {selectedReportId ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openReportFile(selectedReportId)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-2.5 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                          title="เปิด report ในแท็บใหม่"
                        >
                          <ExternalLink size={14} />
                          เปิดไฟล์
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
                          title="ดาวน์โหลดไฟล์ลงเครื่อง"
                        >
                          <Download size={14} />
                          ดาวน์โหลด
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedId) return
                            const link = `${window.location.origin}/patients?patient=${selectedId}&report=${selectedReportId}`
                            void navigator.clipboard.writeText(link).then(
                              () => toast.show('success', 'คัดลอกลิงก์แล้ว'),
                              () => toast.show('error', 'คัดลอกไม่สำเร็จ'),
                            )
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-2.5 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
                          title="คัดลอกลิงก์เข้า report นี้"
                        >
                          <Link2 size={14} />
                          คัดลอกลิงก์
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
                    />
                  ) : null}

                  {filteredReports.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
                      {reports.length === 0 ? 'ยังไม่มี report' : 'ไม่พบเอกสารที่ตรงกับตัวกรอง'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredReports.map((report) => (
                        <div
                          key={report.id}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-200 ${
                            report.id === selectedReportId ? 'border-bbh-green bg-bbh-green-soft' : 'border-bbh-line bg-white hover:border-bbh-green'
                          }`}
                        >
                          <button type="button" onClick={() => setSelectedReportId(report.id)} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left ${FOCUS_RING}`}>
                            <FileText size={17} className="shrink-0 text-bbh-green" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-bbh-ink">{report.title}</p>
                              <p className="text-xs text-bbh-muted">{report.report_type} · <span className="font-mono tabular-nums">{formatDate(report.uploaded_at)}</span></p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteReportById(report.id)}
                            disabled={deleteReport.isPending}
                            title="ลบ report"
                            className={`shrink-0 rounded-lg p-1.5 text-bbh-muted transition-colors duration-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {reportQ.data?.extracted_text ? (
                    <div className="mt-4 rounded-xl bg-bbh-surface p-3">
                      <p className="mb-2 text-xs font-semibold text-bbh-muted">Extracted text</p>
                      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-bbh-ink">
                        {reportQ.data.extracted_text}
                      </p>
                    </div>
                  ) : null}

                  {selectedReportId ? (
                    <div className="mt-4 rounded-xl border border-bbh-line p-3">
                      <p className="mb-2 text-xs font-semibold text-bbh-muted">NotebookLM</p>
                      {reportQ.data?.notebooklm_url ? (
                        <a href={reportQ.data.notebooklm_url} target="_blank" rel="noreferrer" className="mb-2 block truncate text-sm text-bbh-green underline">
                          {reportQ.data.notebooklm_url}
                        </a>
                      ) : (
                        <p className="mb-2 text-xs text-bbh-muted">ยังไม่มี link NotebookLM — อัพโหลด report นี้เข้า NotebookLM เองผ่านเว็บ แล้ววาง link ไว้ที่นี่</p>
                      )}
                      {canAnalyze ? (
                        <form onSubmit={submitNotebookUrl} className="flex gap-2">
                          <input
                            type="url"
                            value={notebookUrlDraft}
                            onChange={(e) => setNotebookUrlDraft(e.target.value)}
                            placeholder="วาง link NotebookLM ที่นี่"
                            className="h-9 flex-1 rounded-lg border border-bbh-line px-3 text-xs transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30"
                          />
                          <button
                            type="submit"
                            disabled={setNotebookLmUrl.isPending || !notebookUrlDraft.trim()}
                            className={`h-9 shrink-0 rounded-lg bg-bbh-green px-3 text-xs font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
                          >
                            บันทึก
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="rounded-xl border border-bbh-line bg-white p-4 space-y-3">
                  <AllergyBanner patientId={selectedPatient.id} compact />
                  <AnalysisPanel
                    analyses={analyses}
                    loading={analysesQ.isLoading}
                    canDecide={canAnalyze}
                    analyzing={analyzeReport.isPending}
                    decidingId={decideTriage.isPending ? decideTriage.variables?.analysisId ?? null : null}
                    onAnalyze={selectedReportId && canAnalyze ? () => analyzeReport.mutate({ reportId: selectedReportId }, { onSuccess: () => toast.show('success', 'วิเคราะห์ Report สำเร็จ'), onError: () => toast.show('error', 'วิเคราะห์ Report ไม่สำเร็จ') }) : undefined}
                    onDecide={canAnalyze ? (analysisId, decision) => decideTriage.mutate({ analysisId, decision, note: null }, { onSuccess: () => toast.show('success', 'บันทึก triage สำเร็จ'), onError: () => toast.show('error', 'บันทึก triage ไม่สำเร็จ') }) : undefined}
                  />
                </section>

                {selectedReportId && canAnalyze ? (
                  <MeasurementReviewPanel reportId={selectedReportId} patientId={selectedPatient.id} />
                ) : null}
              </aside>
            </div>
          </div>
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


