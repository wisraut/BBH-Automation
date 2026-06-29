// Cross-patient reports list for the /reports workspace.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'

export type ReportDecision = 'no_analysis' | 'pending' | 'review' | 'accept' | 'reject'

export interface WorkspaceReport {
  report_id: number
  patient_id: number
  title: string
  report_type: string
  source: string
  uploaded_at: string
  notes: string | null
  assigned_doctor_id: number | null
  assigned_doctor_name: string | null
  has_file: number | boolean
  patient_name: string
  hn: string | null
  latest_decision: string | null
  analysis_at: string | null
}

export interface ReportsWorkspaceResponse {
  data: WorkspaceReport[]
  pagination: { page: number; limit: number; total: number; total_pages: number }
}

export interface UseReportsWorkspaceArgs {
  reportType?: string
  source?: string
  decision?: ReportDecision
  search?: string
  mineOnly?: boolean
  page?: number
  limit?: number
}

export function useReportsWorkspace(args: UseReportsWorkspaceArgs = {}) {
  const { reportType, source, decision, search, mineOnly, page = 1, limit = 30 } = args
  return useQuery({
    queryKey: ['reports-workspace', { reportType, source, decision, search, mineOnly, page, limit }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      if (reportType) params.set('report_type', reportType)
      if (source) params.set('source', source)
      if (decision) params.set('decision', decision)
      if (search) params.set('search', search)
      if (mineOnly) params.set('mine_only', 'true')
      params.set('page', String(page))
      params.set('limit', String(limit))
      return api.get<ReportsWorkspaceResponse>(`/api/reports?${params.toString()}`)
    },
  })
}
