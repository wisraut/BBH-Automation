// Doctor recurring weekly "open for booking" template.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface AvailabilityRange {
  day_of_week: number // 0=Mon .. 6=Sun
  start_time: string // 'HH:MM'
  end_time: string
}

interface AvailabilityRow extends AvailabilityRange {
  id: number
  doctor_id: number
}

export function useAvailability(doctorId: number | null | undefined) {
  return useQuery({
    queryKey: ['availability', doctorId] as const,
    queryFn: () => {
      const q = doctorId != null ? `?doctor_id=${doctorId}` : ''
      return api.get<{ data: AvailabilityRow[] }>(`/api/schedule/availability${q}`)
    },
    enabled: doctorId != null,
  })
}

export function useSaveAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ doctorId, ranges }: { doctorId: number; ranges: AvailabilityRange[] }) =>
      api.put<{ ok: boolean; count: number }>('/api/schedule/availability', {
        doctor_id: doctorId,
        ranges,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability'] }),
  })
}
