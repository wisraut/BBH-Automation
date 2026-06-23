// Delete a patient report (file + analyses cascade on the backend).
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type SimpleOkResponse = components['schemas']['SimpleOkResponse']

export function useDeleteReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId }: { reportId: number; patientId: number }) =>
      api.delete<SimpleOkResponse>(`/api/reports/${reportId}`),
    onSuccess: (_data, { patientId }) => {
      qc.invalidateQueries({ queryKey: ['patient-reports', patientId] })
      qc.invalidateQueries({ queryKey: ['patient', patientId] })
    },
  })
}
