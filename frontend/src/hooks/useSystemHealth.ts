// System health snapshot — polls every 5s for live status.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'

export type ServiceStatus = 'ok' | 'warn' | 'error'

export interface ServiceCheck {
  name: string
  status: ServiceStatus
  detail?: string
  latency_ms?: number
}

export interface ActivityItem {
  kind: 'booking' | 'report' | 'alert'
  subject: string
  summary: string
  ts: string
}

export interface SystemHealthResponse {
  checked_at: string
  overall: ServiceStatus
  services: ServiceCheck[]
  db_stats: Record<string, number | string>
  recent_activity: ActivityItem[]
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'] as const,
    queryFn: () => api.get<SystemHealthResponse>('/api/admin/system/health'),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  })
}
