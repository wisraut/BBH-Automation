// Update patient mutation that refreshes list and detail caches.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type PatientUpdateRequest = components['schemas']['PatientUpdateRequest']
export type PatientOut = components['schemas']['PatientOut']

export function useUpdatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PatientUpdateRequest }) =>
      api.patch<PatientOut>(`/api/patients/${id}`, body),
    onSuccess: (patient) => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      qc.invalidateQueries({ queryKey: ['patient', patient.id] })
    },
  })
}
