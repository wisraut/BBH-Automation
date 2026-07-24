import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Send } from 'lucide-react'

import { Modal } from '../Modal'
import { useToast } from '../../hooks/useToast'
import { useAccountSettings } from '../../hooks/useAccountSettings'
import { useSendReports } from '../../hooks/useSendReports'
import type { ReportListItem } from '../../hooks/usePatientReports'
import { ApiError } from '../../lib/api'

// Subject-prefix formats the doctor's email->summary automation keys off. SOAP
// for now; add to this list as their pipeline grows (backend has a matching
// whitelist — keep the two in sync).
const FORMATS = ['SOAP'] as const

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

interface Props {
  open: boolean
  onClose: () => void
  patientId: number | null
  patientName: string
  reports: ReportListItem[]
}

export function SendToDoctorModal({ open, onClose, patientId, patientName, reports }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const settingsQ = useAccountSettings()
  const send = useSendReports()

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [format, setFormat] = useState<string>(FORMATS[0])
  const [toEmail, setToEmail] = useState('')

  // Initialize ONCE per open (false->true edge), not on every reports/settings
  // change — otherwise an async settings load or a background reports refetch
  // would wipe the user's in-progress selection and typed destination.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setSelected(new Set(reports.filter((r) => r.has_file).map((r) => r.id)))
      setFormat(FORMATS[0])
      setToEmail(settingsQ.data?.summary_email ?? '')
    }
    wasOpen.current = open
  }, [open, reports, settingsQ.data])

  // If settings resolve AFTER the modal opened, fill the destination — but only
  // when the user hasn't typed one yet (never clobber their input).
  useEffect(() => {
    if (open && !toEmail && settingsQ.data?.summary_email) {
      setToEmail(settingsQ.data.summary_email)
    }
  }, [open, toEmail, settingsQ.data])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSend() {
    if (patientId == null || selected.size === 0 || !toEmail.trim()) return
    try {
      const result = await send.mutateAsync({
        patientId,
        report_ids: [...selected],
        format_prefix: format,
        to_email: toEmail.trim() || null,
      })
      if (result.skipped.length > 0) {
        // Partial send — some reports were dropped (no file / too large). Surface
        // it so the sender doesn't assume everything reached the doctor.
        toast.show('info', t('sendToDoctor.sentPartial', {
          count: result.attached, skipped: result.skipped.length, email: result.to,
        }))
      } else {
        toast.show('success', t('sendToDoctor.sentSuccess', { count: result.attached, email: result.to }))
      }
      onClose()
    } catch (err) {
      toast.show('error', err instanceof ApiError ? err.message : t('sendToDoctor.sendFailed'))
    }
  }

  const canSend = selected.size > 0 && !!toEmail.trim() && patientId != null && !send.isPending

  return (
    <Modal open={open} title={t('sendToDoctor.title')} onClose={onClose} size="md">
      <div className="space-y-4">
        <p className="text-sm text-bbh-muted">
          {t('sendToDoctor.intro', { name: patientName })}
        </p>

        {/* Destination */}
        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">{t('sendToDoctor.toEmail')}</span>
          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="soap-inbox@gmail.com"
            className={`mt-1.5 w-full rounded-lg border border-bbh-line px-3 py-2 text-sm transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30 ${FOCUS_RING}`}
          />
          {!settingsQ.data?.summary_email ? (
            <span className="mt-1 block text-xs text-bbh-muted">{t('sendToDoctor.noDefaultHint')}</span>
          ) : null}
        </label>

        {/* Format */}
        <label className="block">
          <span className="text-sm font-medium text-bbh-ink">{t('sendToDoctor.format')}</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className={`mt-1.5 w-full rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm transition-colors duration-200 focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30 ${FOCUS_RING}`}
          >
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <span className="mt-1 block text-xs text-bbh-muted">{t('sendToDoctor.subjectPreview', { prefix: format, name: patientName })}</span>
        </label>

        {/* Report selection */}
        <div>
          <span className="text-sm font-medium text-bbh-ink">{t('sendToDoctor.chooseReports')}</span>
          {reports.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-bbh-line p-4 text-center text-sm text-bbh-muted">
              {t('sendToDoctor.noReports')}
            </p>
          ) : (
            <div className="mt-1.5 max-h-64 divide-y divide-bbh-line overflow-y-auto rounded-lg border border-bbh-line">
              {reports.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-start gap-3 px-3 py-2.5 ${r.has_file ? 'cursor-pointer hover:bg-bbh-surface' : 'cursor-not-allowed opacity-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    disabled={!r.has_file}
                    onChange={() => toggle(r.id)}
                    className={`mt-0.5 h-4 w-4 shrink-0 accent-bbh-green ${FOCUS_RING}`}
                  />
                  <FileText size={16} className="mt-0.5 shrink-0 text-bbh-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-bbh-ink">{r.title}</span>
                    <span className="block text-xs text-bbh-muted">
                      {r.report_type}
                      {!r.has_file ? ` · ${t('sendToDoctor.noFile')}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={send.isPending}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:opacity-60 ${FOCUS_RING}`}
          >
            <Send size={16} />
            {send.isPending
              ? t('sendToDoctor.sending')
              : t('sendToDoctor.sendCount', { count: selected.size })}
          </button>
        </div>
      </div>
    </Modal>
  )
}
