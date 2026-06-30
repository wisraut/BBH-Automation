// Quick reschedule of an approved booking.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type RescheduleRequest = components['schemas']['RescheduleRequest']
export type BookingOut = components['schemas']['BookingOut']

export function useRescheduleBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: RescheduleRequest }) =>
      api.post<BookingOut>(`/api/bookings/${uid}/reschedule`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['booking', vars.uid] })
      qc.invalidateQueries({ queryKey: ['calendar-events'] })
    },
  })
}
