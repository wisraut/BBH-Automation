// Bookings list for CRO inbox — paginated, optional status filter.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type BookingStatus = components['schemas']['BookingListItem']['status']
export type BookingListResponse = components['schemas']['BookingListResponse']

export interface UseBookingsArgs {
  status?: BookingStatus
  page?: number
  limit?: number
}

export function useBookings({ status, page = 1, limit = 20 }: UseBookingsArgs = {}) {
  return useQuery({
    queryKey: ['bookings', { status, page, limit }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      params.set('page', String(page))
      params.set('limit', String(limit))
      return api.get<BookingListResponse>(`/api/bookings?${params.toString()}`)
    },
  })
}
