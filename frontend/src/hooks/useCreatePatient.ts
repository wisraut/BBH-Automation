// Create patient mutation that refreshes patient lists after success.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type PatientCreateRequest = components['schemas']['PatientCreateRequest']
export type PatientOut = components['schemas']['PatientOut']

export function useCreatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PatientCreateRequest) => api.post<PatientOut>('/api/patients', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}
