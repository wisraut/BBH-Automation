// Single booking detail by request_uid.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type BookingOut = components['schemas']['BookingOut']

export function useBooking(uid: string | null) {
  return useQuery({
    queryKey: ['booking', uid] as const,
    queryFn: () => api.get<BookingOut>(`/api/bookings/${uid}`),
    enabled: Boolean(uid),
  })
}
