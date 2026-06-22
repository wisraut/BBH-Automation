// Report analysis list query for one report.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type AnalysisOut = components['schemas']['AnalysisOut']
export type AnalysisListResponse = components['schemas']['AnalysisListResponse']

export function useReportAnalyses(reportId: number | null | undefined) {
  return useQuery({
    queryKey: ['report-analyses', reportId] as const,
    queryFn: () => api.get<AnalysisListResponse>(`/api/reports/${reportId}/analyses`),
    enabled: reportId != null,
  })
}
