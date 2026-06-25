// Manually resolve an admin alert (admin closes after reviewing).
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type ResolveRequest = components['schemas']['ResolveRequest']
export type AlertOut = components['schemas']['AlertOut']

export function useResolveAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ alertId, body }: { alertId: number; body: ResolveRequest }) =>
      api.post<AlertOut>(`/api/admin/alerts/${alertId}/resolve`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-alerts'] })
      qc.invalidateQueries({ queryKey: ['admin-alert-summary'] })
    },
  })
}
