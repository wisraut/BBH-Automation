import { Brain, Check, CircleAlert, FileSearch, X } from 'lucide-react'

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

const DECISION_STYLES: Record<Decision, string> = {
  accept: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reject: 'bg-red-50 text-red-700 border-red-200',
  review: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-bbh-surface text-bbh-muted border-bbh-line',
}

function decisionIcon(decision: Decision) {
  if (decision === 'accept') return <Check size={14} />
  if (decision === 'reject') return <X size={14} />
  if (decision === 'review') return <CircleAlert size={14} />
  return <FileSearch size={14} />
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
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-bbh-ink">AI analyses</h3>
        {onAnalyze ? (
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-xl border border-bbh-green px-3 py-1.5 text-xs font-semibold text-bbh-green hover:bg-bbh-green-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Brain size={15} />
            วิเคราะห์
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-bbh-surface" />
      ) : analyses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-bbh-line p-5 text-center text-sm text-bbh-muted">
          ยังไม่มีผลวิเคราะห์
        </div>
      ) : (
        analyses.map((analysis) => (
          <article key={analysis.id} className="rounded-xl border border-bbh-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${DECISION_STYLES[analysis.triage_decision]}`}>
                {decisionIcon(analysis.triage_decision)}
                {analysis.triage_decision}
              </span>
              <span className="text-xs text-bbh-muted">
                {new Date(analysis.created_at).toLocaleString('th-TH')}
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
                    className="rounded-lg border border-bbh-line px-3 py-1.5 text-xs font-semibold text-bbh-muted hover:border-bbh-green hover:text-bbh-green disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    ยืนยัน {decision}
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

