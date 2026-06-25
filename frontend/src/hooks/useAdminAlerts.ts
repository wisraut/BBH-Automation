// Admin alert list — filterable, refetched on dashboard view.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type AlertOut = components['schemas']['AlertOut']
export type AlertSeverity = AlertOut['severity']
export type AlertStatus = AlertOut['status']
export type RuleCategory = AlertOut['rule_category']

export interface UseAdminAlertsArgs {
  status?: AlertStatus
  severity?: AlertSeverity
  category?: RuleCategory
  rule_key?: string
  page?: number
  limit?: number
}

export interface AdminAlertsResponse {
  data: AlertOut[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

export function useAdminAlerts(args: UseAdminAlertsArgs = {}) {
  const { status, severity, category, rule_key, page = 1, limit = 50 } = args
  return useQuery({
    queryKey: ['admin-alerts', { status, severity, category, rule_key, page, limit }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (severity) params.set('severity', severity)
      if (category) params.set('category', category)
      if (rule_key) params.set('rule_key', rule_key)
      params.set('page', String(page))
      params.set('limit', String(limit))
      return api.get<AdminAlertsResponse>(`/api/admin/alerts?${params.toString()}`)
    },
  })
}
