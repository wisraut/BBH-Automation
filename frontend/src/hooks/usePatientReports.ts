// Patient report list query for the selected patient.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type ReportListItem = components['schemas']['ReportListItem']
export type ReportListResponse = components['schemas']['ReportListResponse']

export function usePatientReports(patientId: number | null | undefined) {
  return useQuery({
    queryKey: ['patient-reports', patientId] as const,
    queryFn: () => api.get<ReportListResponse>(`/api/patients/${patientId}/reports`),
    enabled: patientId != null,
  })
}
