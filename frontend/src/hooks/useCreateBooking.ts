import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export type BookingCreateRequest = {
  patient_name: string
  phone: string
  requested_date: string
  requested_time: string
  symptom: string
  booking_source: 'line' | 'phone' | 'whatsapp' | 'email' | 'walkin'
}

export type BookingCreateResponse = {
  ok: boolean
  request_uid: string
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BookingCreateRequest) =>
      api.post<BookingCreateResponse>('/api/bookings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}
