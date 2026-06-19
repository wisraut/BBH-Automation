// Approve booking — calendar check + book event + push patient.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type ApproveRequest = components['schemas']['ApproveRequest']
export type ApproveResponse = components['schemas']['ApproveResponse']

export function useApproveBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: ApproveRequest }) =>
      api.post<ApproveResponse>(`/api/bookings/${uid}/approve`, body),
    onSuccess: (_data, { uid }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['booking', uid] })
    },
  })
}
