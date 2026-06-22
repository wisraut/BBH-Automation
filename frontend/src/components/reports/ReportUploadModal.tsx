import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'

import { Modal } from '../Modal'

type ReportType = 'lab' | 'imaging' | 'history' | 'prescription' | 'referral' | 'other'
type ReportSource = 'web' | 'line' | 'email' | 'whatsapp' | 'walkin'

interface ReportUploadModalProps {
  open: boolean
  saving?: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => void
}

export function ReportUploadModal({ open, saving, onClose, onSubmit }: ReportUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [reportType, setReportType] = useState<ReportType>('lab')
  const [source, setSource] = useState<ReportSource>('web')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setFile(null)
    setTitle('')
    setReportType('lab')
    setSource('web')
    setNotes('')
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
    onSubmit(formData)
  }

  return (
    <Modal open={open} title="Upload report" onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-bbh-ink">
          ไฟล์ report
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full rounded-xl border border-bbh-line px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          ชื่อ report
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            ประเภท
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="mt-1 w-full rounded-xl border border-bbh-line px-3 py-2 text-sm">
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
            <select value={source} onChange={(e) => setSource(e.target.value as ReportSource)} className="mt-1 w-full rounded-xl border border-bbh-line px-3 py-2 text-sm">
              <option value="web">Web</option>
              <option value="line">LINE</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="walkin">Walk-in</option>
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-bbh-ink">
          Notes
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full resize-none rounded-xl border border-bbh-line px-3 py-2 text-sm" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line px-4 py-2 text-sm text-bbh-muted hover:text-bbh-ink">
            ยกเลิก
          </button>
          <button type="submit" disabled={saving || !file || !title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            <Upload size={16} />
            Upload
          </button>
        </div>
      </form>
    </Modal>
  )
}
