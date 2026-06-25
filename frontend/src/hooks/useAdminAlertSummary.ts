// Admin dashboard summary — counts by rule + severity for KPI widgets.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type AlertSummary = components['schemas']['AlertSummary']

export function useAdminAlertSummary() {
  return useQuery({
    queryKey: ['admin-alert-summary'] as const,
    queryFn: () => api.get<AlertSummary>('/api/admin/alerts/summary'),
  })
}
