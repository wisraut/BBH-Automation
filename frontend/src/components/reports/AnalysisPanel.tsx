import { useTranslation } from 'react-i18next'
import { dateLocale } from '../../i18n/datetime'
import { Brain, Loader2 } from 'lucide-react'

import type { AnalysisOut } from '../../hooks/useReportAnalyses'

type Decision = AnalysisOut['triage_decision']

interface AnalysisPanelProps {
  analyses: AnalysisOut[]
  loading?: boolean
  canDecide?: boolean
  decidingId?: number | null
  onAnalyze?: () => void
  onDecide?: (analysisId: number, decision: 'accept' | 'reject' | 'review') => void
  analyzing?: boolean
}

// Shared focus treatment so every interactive element gets a visible,
// on-brand keyboard ring without repeating the class list everywhere.
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const DECISION_STYLES: Record<Decision, string> = {
  accept: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
  reject: 'border-red-200 bg-red-50 text-red-700',
  review: 'border-amber-200 bg-amber-50 text-amber-700',
  pending: 'border-bbh-line bg-bbh-surface text-bbh-muted',
}

export function AnalysisPanel({
  analyses,
  loading,
  canDecide,
  decidingId,
  onAnalyze,
  onDecide,
  analyzing,
}: AnalysisPanelProps) {
  const { t } = useTranslation()
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-bbh-ink">{t('analysisPanel.heading')}</h3>
        {/* Once results exist, re-analysis is a secondary affordance (small,
            muted). The primary call to action lives in the empty state below. */}
        {onAnalyze && analyses.length > 0 ? (
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-2.5 py-1.5 text-xs font-medium text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />}
            {t('analysisPanel.reAnalyze')}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-bbh-surface" />
      ) : analyses.length === 0 ? (
        // Analysing the pending report is the doctor's primary action, so it is
        // a large, full-width, filled button where attention lands (Fitts's law).
        onAnalyze ? (
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing}
            className={`flex w-full items-center justify-center gap-2 rounded-xl bg-bbh-green px-4 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-bbh-green-dark disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
            {t('analysisPanel.analyzeThisReport')}
          </button>
        ) : (
          <div className="rounded-xl border border-dashed border-bbh-line p-6 text-center text-sm text-bbh-muted">
            {t('analysisPanel.empty')}
          </div>
        )
      ) : (
        analyses.map((analysis) => (
          <article key={analysis.id} className="rounded-xl border border-bbh-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${DECISION_STYLES[analysis.triage_decision]}`}>
                {analysis.triage_decision}
              </span>
              <span className="font-mono text-xs tabular-nums text-bbh-muted">
                {new Date(analysis.created_at).toLocaleString(dateLocale())}
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-bbh-ink">
              {analysis.summary_text}
            </div>
            {canDecide ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {(['accept', 'reject', 'review'] as const).map((decision) => (
                  <button
                    key={decision}
                    type="button"
                    onClick={() => onDecide?.(analysis.id, decision)}
                    disabled={decidingId === analysis.id}
                    className={`rounded-lg border border-bbh-line bg-white px-3 py-1.5 text-xs font-semibold text-bbh-muted transition-colors duration-200 hover:border-bbh-green hover:text-bbh-green-dark disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
                  >
                    {t('analysisPanel.confirmDecision', { decision })}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))
      )}
    </section>
  )
}

