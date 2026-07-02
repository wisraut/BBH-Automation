// Send a custom LINE message to a patient. Invalidates chat history + AI mode
// (send auto-pauses AI so the mode banner should refetch).
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export function useSendPatientMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, message }: { patientId: number; message: string }) =>
      api.post<{ ok: boolean; channel: string; ai_paused_minutes?: number }>(
        `/api/patients/${patientId}/message`,
        { message },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['patient-messages', vars.patientId] })
      qc.invalidateQueries({ queryKey: ['patient-ai-mode', vars.patientId] })
    },
  })
}
