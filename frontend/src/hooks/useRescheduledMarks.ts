// Active reschedule markers for the Calendar page — gray pill on day cell.
// With-time reschedules render on the new date; TBD ones render on the
// ORIGINAL date until CRO re-approves with a time.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type RescheduledMark = components['schemas']['RescheduledMark']

export function useRescheduledMarks(from: string, to: string) {
  return useQuery({
    queryKey: ['rescheduled-marks', from, to] as const,
    queryFn: () =>
      api.get<RescheduledMark[]>(
        `/api/bookings/rescheduled?${new URLSearchParams({ from, to })}`,
      ),
    staleTime: 30_000,
  })
}
