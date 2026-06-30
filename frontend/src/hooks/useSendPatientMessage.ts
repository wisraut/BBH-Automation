// Send a custom LINE message to a patient.
import { useMutation } from '@tanstack/react-query'

import { api } from '../lib/api'

export function useSendPatientMessage() {
  return useMutation({
    mutationFn: ({ patientId, message }: { patientId: number; message: string }) =>
      api.post<{ ok: boolean; channel: string }>(`/api/patients/${patientId}/message`, { message }),
  })
}
