// Confirm an analysis triage decision and refresh report analysis lists.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type TriageDecisionRequest = components['schemas']['TriageDecideRequest']
export type SimpleOkResponse = components['schemas']['SimpleOkResponse']

export function useDecideTriage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ analysisId, decision, note }: { analysisId: number } & TriageDecisionRequest) =>
      api.post<SimpleOkResponse>(`/api/reports/analyses/${analysisId}/decide`, { decision, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-analyses'] })
    },
  })
}
