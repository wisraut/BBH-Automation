// Doctor schedule blocks (vacation/off-hours/conference).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface ScheduleBlock {
  id: number
  doctor_id: number
  doctor_name: string | null
  block_type: string
  start_at: string
  end_at: string
  reason: string | null
  video_link: string | null
  calendar_event_id: string | null
  calendar_event_url: string | null
  created_by: number | null
  created_at: string
}

export interface ScheduleBlockCreateBody {
  doctor_id: number
  block_type: string
  start_at: string
  end_at: string
  reason?: string | null
  video_link?: string | null
}

export function useScheduleBlocks(args: { doctorId?: number; dateFrom?: string; dateTo?: string } = {}) {
  const { doctorId, dateFrom, dateTo } = args
  return useQuery({
    queryKey: ['schedule-blocks', { doctorId, dateFrom, dateTo }] as const,
    queryFn: () => {
      const p = new URLSearchParams()
      if (doctorId !== undefined) p.set('doctor_id', String(doctorId))
      if (dateFrom) p.set('date_from', dateFrom)
      if (dateTo) p.set('date_to', dateTo)
      return api.get<{ data: ScheduleBlock[] }>(`/api/schedule-blocks?${p.toString()}`)
    },
  })
}

export function useCreateScheduleBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ScheduleBlockCreateBody) =>
      api.post<{ id: number }>('/api/schedule-blocks', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-blocks'] }) },
  })
}

export function useDeleteScheduleBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/schedule-blocks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-blocks'] }) },
  })
}
