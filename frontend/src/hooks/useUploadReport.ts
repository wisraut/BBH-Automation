// Upload patient report mutation using multipart FormData.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type ReportUploadResponse = components['schemas']['ReportUploadResponse']

export function useUploadReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, formData }: { patientId: number; formData: FormData }) =>
      api.post<ReportUploadResponse>(`/api/patients/${patientId}/reports`, formData),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['patient-reports', variables.patientId] })
      qc.invalidateQueries({ queryKey: ['patient', variables.patientId] })
    },
  })
}
