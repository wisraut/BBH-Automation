// Single patient detail query enabled only when a patient id is selected.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type PatientOut = components['schemas']['PatientOut']

export function usePatient(id: number | null | undefined) {
  return useQuery({
    queryKey: ['patient', id] as const,
    queryFn: () => api.get<PatientOut>(`/api/patients/${id}`),
    enabled: id != null,
  })
}
