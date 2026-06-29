import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'

import { Modal } from '../Modal'
import { AllergyBanner } from '../patients/AllergyBanner'
import { useDoctors } from '../../hooks/useDoctors'

type ReportType = 'lab' | 'imaging' | 'history' | 'prescription' | 'referral' | 'other'
type ReportSource = 'web' | 'line' | 'email' | 'whatsapp' | 'walkin'

interface ReportUploadModalProps {
  open: boolean
  saving?: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => void
  patientId?: number
}

export function ReportUploadModal({ open, saving, onClose, onSubmit, patientId }: ReportUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [reportType, setReportType] = useState<ReportType>('lab')
  const [source, setSource] = useState<ReportSource>('web')
  const [notes, setNotes] = useState('')
  const [doctorId, setDoctorId] = useState('')

  const doctorsQ = useDoctors()
  const doctors = doctorsQ.data?.data ?? []

  useEffect(() => {
    if (!open) return
    setFile(null)
    setTitle('')
    setReportType('lab')
    setSource('web')
    setNotes('')
    setDoctorId('')
  }, [open])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!file || !title.trim()) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', title.trim())
    formData.append('report_type', reportType)
    formData.append('source', source)
    if (notes.trim()) formData.append('notes', notes.trim())
    if (doctorId) formData.append('assigned_doctor_id', doctorId)
    onSubmit(formData)
  }

  return (
    <Modal open={open} title="Upload report" onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-4">
        {patientId !== undefined ? (
          <AllergyBanner patientId={patientId} scanText={`${title}\n${notes}`} compact />
        ) : null}
        <label className="block text-sm font-medium text-bbh-ink">
          ไฟล์ report
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          ชื่อ report
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            ประเภท
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm">
              <option value="lab">Lab</option>
              <option value="imaging">Imaging</option>
              <option value="history">History</option>
              <option value="prescription">Prescription</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            แหล่งที่มา
            <select value={source} onChange={(e) => setSource(e.target.value as ReportSource)} className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm">
              <option value="web">Web</option>
              <option value="line">LINE</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="walkin">Walk-in</option>
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-bbh-ink">
          หมอที่รับผิดชอบ
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm">
            <option value="">— ไม่ระบุ —</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.display_name}
                {doctor.specialty ? ` (${doctor.specialty})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          Notes
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full resize-none rounded-xl border border-bbh-line px-3 py-3 text-sm" />
        </label>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-bbh-line px-4 text-sm text-bbh-muted hover:text-bbh-ink sm:h-auto sm:py-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={saving || !file || !title.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-bbh-green px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:h-auto sm:py-2">
            <Upload size={16} />
            Upload
          </button>
        </div>
      </form>
    </Modal>
  )
}
