import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'

export type CalendarEvent = {
  id: string
  summary: string
  description: string | null
  html_link: string | null
  status: string | null
  start: string
  end: string
  all_day: boolean
  location: string | null
  video_link: string | null
}

type CalendarEventsResponse = {
  data: CalendarEvent[]
}

// Google Calendar events for the visible calendar range.
export function useCalendarEvents(timeMin: string, timeMax: string) {
  return useQuery({
    queryKey: ['calendar-events', timeMin, timeMax],
    queryFn: () =>
      api.get<CalendarEventsResponse>(
        `/api/calendar/events?time_min=${encodeURIComponent(timeMin)}&time_max=${encodeURIComponent(timeMax)}`,
      ),
  })
}
