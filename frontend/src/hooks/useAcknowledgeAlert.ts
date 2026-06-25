// Acknowledge an admin alert — optional snooze hours for sticky policy.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type AckRequest = components['schemas']['AckRequest']
export type AlertOut = components['schemas']['AlertOut']

export function useAcknowledgeAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ alertId, body }: { alertId: number; body: AckRequest }) =>
      api.post<AlertOut>(`/api/admin/alerts/${alertId}/acknowledge`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-alerts'] })
      qc.invalidateQueries({ queryKey: ['admin-alert-summary'] })
    },
  })
}
