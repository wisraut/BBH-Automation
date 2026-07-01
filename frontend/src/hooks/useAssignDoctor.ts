// Assign (or clear) doctor on a booking. Used to complete LINE-originated
// approvals that arrive without a doctor + correct wrong assignments.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type AssignDoctorRequest = components['schemas']['AssignDoctorRequest']
export type BookingOut = components['schemas']['BookingOut']

export function useAssignDoctor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, body }: { uid: string; body: AssignDoctorRequest }) =>
      api.post<BookingOut>(`/api/bookings/${uid}/assign-doctor`, body),
    onSuccess: (_data, { uid }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['booking', uid] })
    },
  })
}
