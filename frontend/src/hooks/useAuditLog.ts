// Admin: patient-access audit log with filters + pagination.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface AuditEntry {
  id: number
  actor_id: number | null
  actor_email: string | null
  actor_role: string | null
  action: string
  subject_type: string
  subject_id: string
  patient_id: number | null
  patient_display_name: string | null
  patient_hn: string | null
  ip_address: string | null
  request_path: string | null
  request_method: string | null
  extra_json: Record<string, unknown> | null
  created_at: string
}

export interface AuditResponse {
  data: AuditEntry[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

export interface UseAuditLogArgs {
  actorId?: number
  patientId?: number
  action?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export function useAuditLog(args: UseAuditLogArgs = {}) {
  const { actorId, patientId, action, dateFrom, dateTo, page = 1, limit = 50 } = args
  return useQuery({
    queryKey: ['admin-audit', { actorId, patientId, action, dateFrom, dateTo, page, limit }] as const,
    queryFn: () => {
      const p = new URLSearchParams()
      if (actorId !== undefined) p.set('actor_id', String(actorId))
      if (patientId !== undefined) p.set('patient_id', String(patientId))
      if (action) p.set('action', action)
      if (dateFrom) p.set('date_from', dateFrom)
      if (dateTo) p.set('date_to', dateTo)
      p.set('page', String(page))
      p.set('limit', String(limit))
      return api.get<AuditResponse>(`/api/admin/audit?${p.toString()}`)
    },
  })
}
