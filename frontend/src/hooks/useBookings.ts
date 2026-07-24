// Bookings list for CRO inbox — paginated, filtered by exact status or by
// lifecycle group (active vs history).
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type BookingStatus = components['schemas']['BookingListItem']['status']
export type BookingListResponse = components['schemas']['BookingListResponse']
export type BookingGroup = 'active' | 'history'

export interface UseBookingsArgs {
  status?: BookingStatus
  group?: BookingGroup
  page?: number
  limit?: number
}

export function useBookings({ status, group, page = 1, limit = 20 }: UseBookingsArgs = {}) {
  return useQuery({
    queryKey: ['bookings', { status, group, page, limit }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      // Exact status wins on the backend; only send group when no status.
      if (status) params.set('status', status)
      else if (group) params.set('group', group)
      params.set('page', String(page))
      params.set('limit', String(limit))
      return api.get<BookingListResponse>(`/api/bookings?${params.toString()}`)
    },
  })
}
