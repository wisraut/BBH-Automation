// Read a report in place from the Reports workspace — a right-side detail drawer
// (master-detail) so the list stays put and you can click through reports without
// being routed away to the patient page. Deep actions (analyse / triage / lab
// values) still link out to the patient page, but viewing no longer forces it.
import { useEffect, useState } from 'react'
import { dateLocale } from '../../i18n/datetime'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { X, ExternalLink, Download, Loader2, ArrowUpRight, Send } from 'lucide-react'

import { useReport } from '../../hooks/useReport'
import { useAccountSettings } from '../../hooks/useAccountSettings'
import { useToast } from '../../hooks/useToast'
import { openReportFile, downloadReportFile } from '../../lib/reportFile'
import type { WorkspaceReport } from '../../hooks/useReportsWorkspace'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-1'

const DECISION_KEYS: Record<string, string> = {
  no_analysis: 'decision.noAnalysis', pending: 'decision.pending', review: 'decision.review', accept: 'decision.accept', reject: 'decision.reject',
}
const DECISION_STYLES: Record<string, string> = {
  no_analysis: 'border-bbh-line bg-bbh-surface text-bbh-muted',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  review: 'border-amber-200 bg-amber-50 text-amber-700',
  accept: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
  reject: 'border-red-200 bg-red-50 text-red-700',
}

function extFor(mime?: string | null): string {
  if (!mime) return ''
  if (mime.includes('pdf')) return '.pdf'
  if (mime.includes('png')) return '.png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg'
  return ''
}

export function ReportDetailDrawer({ report, onClose }: { report: WorkspaceReport; onClose: () => void }) {
  const { t } = useTranslation()
  const q = useReport(report.report_id)
  const settingsQ = useAccountSettings()
  const toast = useToast()
  const [open, setOpen] = useState(false)

  // Slide in on mount; Esc closes.
  useEffect(() => { setOpen(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const detail = q.data
  const decision = report.latest_decision ?? 'no_analysis'
  const hasFile = detail?.has_file ?? Boolean(report.has_file)

  const doOpen = () => { void openReportFile(report.report_id).catch(() => toast.show('error', t('reportDetailDrawer.openFileFailed'))) }
  const doDownload = () => { void downloadReportFile(report.report_id, `${report.title}${extFor(detail?.file_mime)}`).catch(() => toast.show('error', t('reportDetailDrawer.downloadFailed'))) }

  // NotebookLM has no ingestion API, so "forward" = open the doctor's own
  // notebook + copy the report text to paste in. The link lives per-user on the
  // Account page.
  const doForward = () => {
    const url = settingsQ.data?.notebooklm_url
    if (!url) {
      toast.show('error', t('reportDetailDrawer.notebooklmNotSet'))
      return
    }
    const text = detail?.extracted_text
    if (text) {
      void navigator.clipboard.writeText(text).then(
        () => toast.show('success', t('reportDetailDrawer.copiedForNotebooklm')),
        () => toast.show('success', t('reportDetailDrawer.openedNotebooklmNoCopy')),
      )
    } else {
      toast.show('success', t('reportDetailDrawer.openedNotebooklmNoText'))
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-bbh-ink/20" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={t('reportDetailDrawer.dialogLabel', { title: report.title })}
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-bbh-line bg-white shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-bbh-line px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">{t('reportDetailDrawer.eyebrow')}</p>
            <h2 className="mt-1 truncate font-serif text-xl font-semibold text-bbh-ink">{report.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-bbh-line text-bbh-muted transition-colors hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border px-2.5 py-0.5 font-semibold ${DECISION_STYLES[decision]}`}>
              {DECISION_KEYS[decision] ? t(`reportDetailDrawer.${DECISION_KEYS[decision]}`) : decision}
            </span>
            <span className="rounded-full border border-bbh-line bg-bbh-surface px-2.5 py-0.5 text-bbh-muted">{report.report_type}</span>
            <span className="rounded-full border border-bbh-line bg-bbh-surface px-2.5 py-0.5 text-bbh-muted">{report.source}</span>
          </div>

          <div className="rounded-xl border border-bbh-line bg-bbh-surface p-3">
            <p className="text-sm">
              <span className="text-bbh-muted">{t('reportDetailDrawer.patient')}</span>{' '}
              <span className="font-semibold text-bbh-ink">{report.patient_name}</span>{' '}
              <span className="font-mono text-xs text-bbh-muted">{report.hn ?? '-'}</span>
            </p>
            <p className="mt-1 text-xs text-bbh-muted">
              {t('reportDetailDrawer.uploadedOn', { date: new Date(report.uploaded_at).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: '2-digit' }) })}
              {report.assigned_doctor_name ? ` · ${t('reportDetailDrawer.assignedTo', { name: report.assigned_doctor_name })}` : ''}
            </p>
          </div>

          {hasFile ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={doOpen} className={`inline-flex items-center gap-1.5 rounded-lg bg-bbh-green px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-bbh-green-dark ${FOCUS_RING}`}>
                <ExternalLink size={15} /> {t('reportDetailDrawer.openFile')}
              </button>
              <button type="button" onClick={doDownload} className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line bg-white px-3 py-2 text-sm font-medium text-bbh-ink transition-colors hover:border-bbh-green hover:text-bbh-green-dark ${FOCUS_RING}`}>
                <Download size={15} /> {t('reportDetailDrawer.download')}
              </button>
            </div>
          ) : null}

          <div>
            <button
              type="button"
              onClick={doForward}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-green/40 bg-bbh-green-soft px-3 py-2 text-sm font-semibold text-bbh-green-dark transition-colors hover:bg-bbh-green hover:text-white ${FOCUS_RING}`}
            >
              <Send size={15} /> {t('reportDetailDrawer.forwardToNotebooklm')}
            </button>
            {settingsQ.data && !settingsQ.data.notebooklm_url ? (
              <Link to="/account" className="ml-3 text-xs text-bbh-muted underline hover:text-bbh-green-dark">{t('reportDetailDrawer.setNotebooklmLink')}</Link>
            ) : null}
          </div>

          {detail?.notebooklm_url ? (
            <a href={detail.notebooklm_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-sm text-bbh-green underline">
              {t('reportDetailDrawer.notebooklmForReport')} <ExternalLink size={13} />
            </a>
          ) : null}

          <div>
            <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">{t('reportDetailDrawer.content')}</p>
            {q.isLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-bbh-line p-4 text-sm text-bbh-muted"><Loader2 size={15} className="animate-spin" /> {t('common.loading')}</div>
            ) : detail?.extracted_text ? (
              <div className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-bbh-line bg-white p-3 text-sm leading-6 text-bbh-ink">{detail.extracted_text}</div>
            ) : (
              <p className="rounded-xl border border-dashed border-bbh-line p-4 text-sm text-bbh-muted">{t('reportDetailDrawer.noText')}</p>
            )}
          </div>

          {detail?.notes ? (
            <div>
              <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">{t('reportDetailDrawer.notes')}</p>
              <p className="rounded-xl border border-bbh-line bg-bbh-surface p-3 text-sm text-bbh-ink">{detail.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="border-t border-bbh-line px-5 py-3">
          <Link
            to={`/patients?patient=${report.patient_id}&report=${report.report_id}`}
            className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-bbh-green transition-colors hover:text-bbh-green-dark ${FOCUS_RING}`}
          >
            {t('reportDetailDrawer.openInPatientPage')} <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
    </>
  )
}
