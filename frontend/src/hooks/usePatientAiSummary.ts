// Pre-visit AI summary — on-demand only (button click).
import { useMutation } from '@tanstack/react-query'

import { api } from '../lib/api'

export function usePatientAiSummary() {
  return useMutation({
    mutationFn: (patientId: number) =>
      api.get<{ summary: string; conversation_id: string }>(`/api/patients/${patientId}/ai-summary`),
  })
}
