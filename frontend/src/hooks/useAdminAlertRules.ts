// Admin alert rule definitions — used for category labels and rule_key → display_name mapping.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type RuleOut = components['schemas']['RuleOut']

export function useAdminAlertRules() {
  return useQuery({
    queryKey: ['admin-alert-rules'] as const,
    queryFn: () => api.get<RuleOut[]>('/api/admin/alert-rules'),
    staleTime: 5 * 60_000,
  })
}
