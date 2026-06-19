// Reject booking — mark rejected + push patient apology.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type RejectRequest = components['schemas']['RejectRequest']
export type SimpleOkResponse = components['schemas']['SimpleOkResponse']

export function useRejectBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: RejectRequest }) =>
      api.post<SimpleOkResponse>(`/api/bookings/${uid}/reject`, body),
    onSuccess: (_data, { uid }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['booking', uid] })
    },
  })
}
