// Single report detail query enabled only when a report id is selected.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type ReportOut = components['schemas']['ReportOut']

export function useReport(id: number | null | undefined) {
  return useQuery({
    queryKey: ['report', id] as const,
    queryFn: () => api.get<ReportOut>(`/api/reports/${id}`),
    enabled: id != null,
  })
}
