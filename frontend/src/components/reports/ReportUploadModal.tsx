import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'

import { Modal } from '../Modal'
import { AllergyBanner } from '../patients/AllergyBanner'
import { useDoctors } from '../../hooks/useDoctors'

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'
// Locked input vocabulary — hairline border, rounded-lg, soft green focus ring.
const FIELD =
  'mt-1 h-12 w-full rounded-lg border border-bbh-line bg-white px-3 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'
// Textarea shares the field vocabulary but grows by rows instead of a fixed height.
const TEXTAREA =
  'mt-1 w-full resize-none rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm text-bbh-ink transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

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
  const { t } = useTranslation()
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
    <Modal open={open} title={t('reportUploadModal.title')} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-4">
        {patientId !== undefined ? (
          <AllergyBanner patientId={patientId} scanText={`${title}\n${notes}`} compact />
        ) : null}
        <label className="block text-sm font-medium text-bbh-ink">
          {t('reportUploadModal.fileLabel')}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={`${FIELD} py-2 ${FOCUS_RING}`}
          />
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          {t('reportUploadModal.nameLabel')}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={FIELD}
          />
        </label>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('reportUploadModal.typeLabel')}
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className={FIELD}>
              <option value="lab">Lab</option>
              <option value="imaging">Imaging</option>
              <option value="history">History</option>
              <option value="prescription">Prescription</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('reportUploadModal.sourceLabel')}
            <select value={source} onChange={(e) => setSource(e.target.value as ReportSource)} className={FIELD}>
              <option value="web">Web</option>
              <option value="line">LINE</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="walkin">Walk-in</option>
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-bbh-ink">
          {t('reportUploadModal.assignedDoctor')}
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={FIELD}>
            <option value="">{t('reportUploadModal.unassigned')}</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.display_name}
                {doctor.specialty ? ` (${doctor.specialty})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          {t('reportUploadModal.notes')}
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={TEXTAREA} />
        </label>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={`inline-flex h-11 items-center justify-center rounded-lg border border-bbh-line bg-white px-4 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark sm:h-auto sm:py-2 ${FOCUS_RING}`}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving || !file || !title.trim()} className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:cursor-not-allowed disabled:opacity-60 sm:h-auto sm:py-2 ${FOCUS_RING}`}>
            <Upload size={16} />
            {t('reportUploadModal.submit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
