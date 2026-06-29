// Schedule for the logged-in doctor/nurse — appointments + pending reports.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface ScheduleAppointment {
  request_uid: string
  patient_id: number | null
  patient_name: string | null
  phone: string | null
  requested_date: string
  requested_time: string | null
  requested_datetime_text: string | null
  symptom: string | null
  appointment_type: string | null
  status: string
  calendar_event_id: string | null
  calendar_event_url: string | null
  created_at: string
}

export interface ScheduleReport {
  report_id: number
  patient_id: number
  patient_name: string
  hn: string | null
  title: string
  report_type: string
  source: string
  uploaded_at: string
  notes: string | null
  latest_decision: string | null
  analysis_at: string | null
}

export interface MyScheduleResponse {
  user: { id: number; display_name?: string; role?: string }
  window: { from: string; to: string }
  stats: {
    today_appointments: number
    window_appointments: number
    pending_reports: number
  }
  appointments: ScheduleAppointment[]
  pending_reports: ScheduleReport[]
}

export interface UseMyScheduleArgs {
  dateFrom?: string
  dateTo?: string
}

export function useMySchedule({ dateFrom, dateTo }: UseMyScheduleArgs = {}) {
  return useQuery({
    queryKey: ['my-schedule', { dateFrom, dateTo }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const qs = params.toString()
      return api.get<MyScheduleResponse>(`/api/schedule/me${qs ? `?${qs}` : ''}`)
    },
  })
}
