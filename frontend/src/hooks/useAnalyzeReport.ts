// Trigger AI analysis for a report and refresh analysis caches.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type AnalyzeResponse = components['schemas']['AnalyzeResponse']

export function useAnalyzeReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId }: { reportId: number }) =>
      api.post<AnalyzeResponse>(`/api/reports/${reportId}/analyze`),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['report-analyses', variables.reportId] })
      qc.invalidateQueries({ queryKey: ['report', variables.reportId] })
    },
  })
}
