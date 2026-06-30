// Patient call log — list + add + delete.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export type CallDirection = 'out' | 'in'
export type CallOutcome =
  | 'answered' | 'no_answer' | 'voicemail' | 'wrong_number' | 'refused' | 'busy' | 'other'

export interface CallLogEntry {
  id: number
  patient_id: number
  called_at: string
  direction: CallDirection
  outcome: CallOutcome
  duration_min: number | null
  subject: string | null
  reference_booking_uid: string | null
  note: string | null
  called_by: number | null
  called_by_name: string | null
  created_at: string
}

export interface CallLogCreateBody {
  direction: CallDirection
  outcome: CallOutcome
  duration_min?: number | null
  subject?: string | null
  reference_booking_uid?: string | null
  note?: string | null
}

export function usePatientCallLog(patientId: number | null) {
  return useQuery({
    queryKey: ['patient-call-log', patientId] as const,
    queryFn: () => api.get<{ data: CallLogEntry[] }>(`/api/patients/${patientId}/calls`),
    enabled: patientId !== null,
  })
}

export function useAddCallLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, body }: { patientId: number; body: CallLogCreateBody }) =>
      api.post<CallLogEntry>(`/api/patients/${patientId}/calls`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['patient-call-log', vars.patientId] })
    },
  })
}

export function useDeleteCallLog(patientId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/calls/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-call-log', patientId] })
    },
  })
}
