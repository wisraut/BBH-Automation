// Structured lab/biomarker measurements: LLM-extracted drafts a doctor confirms,
// then the confirmed values power the LabResults + Biomarker patient views.
//
// Types are declared locally (not from api-types) until the measurements
// backend is deployed and `npm run gen-types` can pick up its schema.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export type MeasurementStatus = 'draft' | 'confirmed' | 'rejected'

export interface Measurement {
  id: number
  patient_id: number
  report_id: number | null
  code: string
  value: number
  unit: string | null
  measured_at: string // YYYY-MM-DD
  status: MeasurementStatus
  raw_label: string | null
  note: string | null
  created_by: number | null
  confirmed_by: number | null
  confirmed_at: string | null
  created_at: string
}

export interface MeasurementCatalogItem {
  code: string
  label_th: string
  unit: string
  panel: string
  ref_low: number
  ref_high: number
  optimal_low: number
  optimal_high: number
}

interface MeasurementListResponse { data: Measurement[] }
interface CatalogResponse { data: MeasurementCatalogItem[] }
interface ExtractResponse { ok: boolean; data: Measurement[]; parse_error: boolean }

export interface MeasurementEdit {
  code?: string
  value?: number
  unit?: string | null
  measured_at?: string
  note?: string | null
}

export function useMeasurementCatalog() {
  return useQuery({
    queryKey: ['measurement-catalog'] as const,
    queryFn: () => api.get<CatalogResponse>('/api/measurements/catalog'),
    staleTime: 1000 * 60 * 30, // clinical constants — rarely change within a session
  })
}

export function usePatientMeasurements(
  patientId: number | null | undefined,
  status?: MeasurementStatus,
) {
  return useQuery({
    queryKey: ['patient-measurements', patientId, status ?? 'all'] as const,
    queryFn: () => {
      const q = status ? `?status=${status}` : ''
      return api.get<MeasurementListResponse>(`/api/patients/${patientId}/measurements${q}`)
    },
    enabled: patientId != null,
  })
}

export function useReportMeasurementDrafts(reportId: number | null | undefined) {
  return useQuery({
    queryKey: ['report-measurement-drafts', reportId] as const,
    queryFn: () => api.get<MeasurementListResponse>(`/api/reports/${reportId}/measurement-drafts`),
    enabled: reportId != null,
  })
}

export function useExtractMeasurements() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId }: { reportId: number; patientId: number }) =>
      api.post<ExtractResponse>(`/api/reports/${reportId}/extract-measurements`),
    onSuccess: (_data, { reportId, patientId }) => {
      qc.invalidateQueries({ queryKey: ['report-measurement-drafts', reportId] })
      qc.invalidateQueries({ queryKey: ['patient-measurements', patientId] })
    },
  })
}

export function useConfirmMeasurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, edit }: { id: number; edit: MeasurementEdit; reportId?: number | null; patientId: number }) =>
      api.put<{ ok: boolean }>(`/api/measurements/${id}/confirm`, edit),
    onSuccess: (_data, { reportId, patientId }) => {
      if (reportId != null) qc.invalidateQueries({ queryKey: ['report-measurement-drafts', reportId] })
      qc.invalidateQueries({ queryKey: ['patient-measurements', patientId] })
    },
  })
}

export function useRejectMeasurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: number; reportId?: number | null; patientId: number }) =>
      api.post<{ ok: boolean }>(`/api/measurements/${id}/reject`),
    onSuccess: (_data, { reportId, patientId }) => {
      if (reportId != null) qc.invalidateQueries({ queryKey: ['report-measurement-drafts', reportId] })
      qc.invalidateQueries({ queryKey: ['patient-measurements', patientId] })
    },
  })
}

export function useBulkConfirmMeasurements() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ items }: { items: Array<{ id: number } & MeasurementEdit>; reportId?: number | null; patientId: number }) =>
      api.post<{ ok: boolean; confirmed: number }>('/api/measurements/bulk-confirm', { items }),
    onSuccess: (_data, { reportId, patientId }) => {
      if (reportId != null) qc.invalidateQueries({ queryKey: ['report-measurement-drafts', reportId] })
      qc.invalidateQueries({ queryKey: ['patient-measurements', patientId] })
    },
  })
}

// ─── shared helpers ──────────────────────────────────────────────────────────

export type MeasurementFlag = 'high' | 'low' | 'normal' | 'unknown'

export function flagFor(value: number, cat: MeasurementCatalogItem | undefined): MeasurementFlag {
  if (!cat) return 'unknown'
  if (value < cat.ref_low) return 'low'
  if (value > cat.ref_high) return 'high'
  return 'normal'
}
