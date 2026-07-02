import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, Edit3, ExternalLink, FileText, Link2, MessageCircle, Plus, Search, Trash2, Upload } from 'lucide-react'

import { API_BASE } from '../lib/apiBase'
import { PatientFormModal } from '../components/patients/PatientFormModal'
import { AllergyBanner } from '../components/patients/AllergyBanner'
import { PatientCallLog } from '../components/patients/PatientCallLog'
import { PatientMedicalRecords } from '../components/patients/PatientMedicalRecords'
import { PatientChatDrawer } from '../components/patients/PatientChatDrawer'
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
  const [selectedId, setSelectedId] = useState<number | null>(queryPatientId)
  const [showPatientDetail, setShowPatientDetail] = useState(Boolean(queryPatientId))
  const [selectedReportId, setSelectedReportId] = useState<number | null>(queryReportId)
  const [patientModal, setPatientModal] = useState<'create' | 'edit' | null>(null)
  const [sendMsgOpen, setSendMsgOpen] = useState(false)
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

  const patientsQ = usePatients({ search: debouncedSearch, page, limit: 20 })
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
                className="h-11 w-full rounded-xl border border-bbh-line bg-bbh-surface py-2 pl-9 pr-3 text-sm text-bbh-ink placeholder:text-bbh-muted focus:border-bbh-green focus:outline-none"
              />
            </div>
            {canWritePatient ? (
              <button
                type="button"
                onClick={() => setPatientModal('create')}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bbh-green text-white"
                title="เพิ่มคนไข้"
              >
                <Plus size={18} />
              </button>
            ) : null}
          </div>
          <p className="text-xs text-bbh-muted">
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
              {patients.map((patient) => {
                const active = patient.id === selectedId
                return (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(patient.id)
                      setShowPatientDetail(true)
                      setSelectedReportId(null)
                    }}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      active ? 'border-bbh-green bg-bbh-green-soft' : 'border-bbh-line bg-white hover:border-bbh-green/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-bbh-ink">{patient.display_name}</p>
                        <p className="mt-0.5 truncate text-xs text-bbh-muted">
                          {patient.hn ?? 'ยังไม่มี HN'} · {patient.phone ?? 'ไม่มีเบอร์'}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-bbh-surface px-2 py-0.5 text-[11px] text-bbh-muted">
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
          <button type="button" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))} className="rounded-lg border border-bbh-line px-2 py-1 disabled:opacity-40">
            ก่อนหน้า
          </button>
          <span>{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((v) => v + 1)} className="rounded-lg border border-bbh-line px-2 py-1 disabled:opacity-40">
            ถัดไป
          </button>
        </div>
      </section>

      <main className={`${showPatientDetail ? 'block' : 'hidden lg:block'} min-w-0 flex-1 overflow-y-auto p-4 md:p-6`}>
        {!selectedPatient ? (
          <div className="flex h-full items-center justify-center text-center text-bbh-muted">
            เลือกคนไข้จากรายการด้านซ้าย
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-5">
            <button
              type="button"
              onClick={() => setShowPatientDetail(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-bbh-line px-3 py-2 text-sm font-semibold text-bbh-muted transition-all duration-200 hover:border-bbh-green hover:text-bbh-green lg:hidden"
            >
              <ChevronLeft size={16} />
              กลับไปรายการ
            </button>
            <section className="flex flex-wrap items-start justify-between gap-4 border-b border-bbh-line pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">{selectedPatient.display_name}</h1>
                  <span className="rounded-full bg-bbh-surface px-2.5 py-1 text-xs text-bbh-muted">{selectedPatient.hn ?? 'ไม่มี HN'}</span>
                </div>
                <p className="mt-1 text-sm text-bbh-muted">
                  {selectedPatient.phone ?? 'ไม่มีเบอร์'} · {selectedPatient.email ?? 'ไม่มีอีเมล'} · เกิด {formatDate(selectedPatient.dob)}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {canWritePatient ? (
                  <button type="button" onClick={() => setPatientModal('edit')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-bbh-line px-3 py-2 text-sm font-semibold text-bbh-ink hover:border-bbh-green hover:text-bbh-green sm:flex-none">
                    <Edit3 size={16} />
                    แก้ไข
                  </button>
                ) : null}
                <button type="button" onClick={() => setSendMsgOpen(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-bbh-line px-3 py-2 text-sm font-semibold text-bbh-ink hover:border-bbh-green hover:text-bbh-green sm:flex-none">
                  <MessageCircle size={16} />
                  Chat LINE
                </button>
                <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-bbh-green px-3 py-2 text-sm font-semibold text-white sm:flex-none">
                  <Upload size={16} />
                  อัพโหลด Report
                </button>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <section className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-bbh-line p-4">
                    <p className="text-xs text-bbh-muted">Reports</p>
                    <p className="mt-1 font-serif text-2xl font-semibold text-bbh-ink">{reports.length}</p>
                  </div>
                  <div className="rounded-xl border border-bbh-line p-4">
                    <p className="text-xs text-bbh-muted">Bookings</p>
                    <p className="mt-1 font-serif text-2xl font-semibold text-bbh-ink">{patientBookings.length}</p>
                  </div>
                  <div className="rounded-xl border border-bbh-line p-4">
                    <p className="text-xs text-bbh-muted">Latest visit</p>
                    <p className="mt-1 text-sm font-semibold text-bbh-ink">{formatDate(patients.find((p) => p.id === selectedId)?.latest_visit_at)}</p>
                  </div>
                </div>

                <section>
                  <h2 className="mb-3 text-sm font-semibold text-bbh-ink">ประวัติการแพทย์</h2>
                  <PatientMedicalRecords patientId={selectedPatient.id} />
                </section>

                <PatientCallLog patientId={selectedPatient.id} />

                <section>
                  <h2 className="mb-3 text-sm font-semibold text-bbh-ink">Timeline</h2>
                  <PatientTimeline reports={reports} bookings={patientBookings} onSelectReport={setSelectedReportId} />
                </section>
              </section>

              <aside className="space-y-4">
                <section className="rounded-xl border border-bbh-line bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-bbh-ink">Selected report</h2>
                    {selectedReportId ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openReportFile(selectedReportId)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-2.5 py-1.5 text-xs font-semibold text-bbh-muted hover:text-bbh-green"
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
                          className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-2.5 py-1.5 text-xs font-semibold text-bbh-muted hover:text-bbh-green"
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
                          className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-2.5 py-1.5 text-xs font-semibold text-bbh-muted hover:text-bbh-green"
                          title="คัดลอกลิงก์เข้า report นี้"
                        >
                          <Link2 size={14} />
                          คัดลอกลิงก์
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {reports.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
                      ยังไม่มี report
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {reports.map((report) => (
                        <div
                          key={report.id}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                            report.id === selectedReportId ? 'border-bbh-green bg-bbh-green-soft' : 'border-bbh-line hover:border-bbh-green/40'
                          }`}
                        >
                          <button type="button" onClick={() => setSelectedReportId(report.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <FileText size={17} className="shrink-0 text-bbh-green" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-bbh-ink">{report.title}</p>
                              <p className="text-xs text-bbh-muted">{report.report_type} · {formatDate(report.uploaded_at)}</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteReportById(report.id)}
                            disabled={deleteReport.isPending}
                            title="ลบ report"
                            className="shrink-0 rounded-lg p-1.5 text-bbh-muted hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                            className="h-9 flex-1 rounded-lg border border-bbh-line px-3 text-xs focus:border-bbh-green focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={setNotebookLmUrl.isPending || !notebookUrlDraft.trim()}
                            className="h-9 shrink-0 rounded-lg bg-bbh-green px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
      <PatientChatDrawer
        open={sendMsgOpen}
        patientId={selectedPatient?.id ?? null}
        patientName={selectedPatient?.display_name ?? null}
        onClose={() => setSendMsgOpen(false)}
      />
    </div>
  )
}


