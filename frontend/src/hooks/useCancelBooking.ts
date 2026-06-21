import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type SimpleOkResponse = components['schemas']['SimpleOkResponse']

export function useCancelBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, reason }: { uid: string; reason?: string }) =>
      api.post<SimpleOkResponse>(`/api/bookings/${uid}/cancel`, {
        reason: reason ?? 'Cancelled by CRO',
      }),
    onSuccess: (_data, { uid }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
      qc.invalidateQueries({ queryKey: ['booking', uid] })
      qc.invalidateQueries({ queryKey: ['calendar-events'] })
    },
  })
}
