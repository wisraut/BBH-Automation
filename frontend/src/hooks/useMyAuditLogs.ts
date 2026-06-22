// Current user's recent auth events (login/logout/password_change/fail).
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type AuditLogItem = components['schemas']['AuditLogItem']
export type AuditLogListResponse = components['schemas']['AuditLogListResponse']

export function useMyAuditLogs(limit = 20) {
  return useQuery({
    queryKey: ['my-audit-logs', limit] as const,
    queryFn: () => api.get<AuditLogListResponse>(`/auth/audit-logs?limit=${limit}`),
  })
}
