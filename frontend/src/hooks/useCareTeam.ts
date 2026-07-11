// Patient care team (patient_doctors) — list / add / remove members.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export type CareTeamRole = 'primary' | 'specialist' | 'consultant'

export interface CareTeamMember {
  doctor_id: number
  doctor_name: string | null
  specialty: string | null
  role: CareTeamRole
  is_active: number
  added_at: string
}

export function useCareTeam(patientId: number | null) {
  return useQuery({
    queryKey: ['care-team', patientId] as const,
    queryFn: () => api.get<{ data: CareTeamMember[] }>(`/api/patients/${patientId}/care-team`),
    enabled: Boolean(patientId),
  })
}

export function useAddCareTeamMember(patientId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { doctor_id: number; role: CareTeamRole }) =>
      api.post<{ ok: boolean }>(`/api/patients/${patientId}/care-team`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['care-team', patientId] })
      qc.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}

export function useRemoveCareTeamMember(patientId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doctorId: number) =>
      api.delete<{ ok: boolean }>(`/api/patients/${patientId}/care-team/${doctorId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['care-team', patientId] })
      qc.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}
