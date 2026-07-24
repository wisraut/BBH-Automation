import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type SimpleOkResponse = components['schemas']['SimpleOkResponse']

// ยกเลิกการจอง (POST /api/bookings/{uid}/cancel) พร้อมเหตุผล ถ้าไม่ระบุจะ default เป็น "Cancelled by CRO"
// ใช้ที่ CRO inbox/ปฏิทิน หลังยกเลิกจะ invalidate cache ทั้ง list, booking รายตัว และ calendar-events
export function useCancelBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, reason }: { uid: string; reason?: string }) =>
      api.post<SimpleOkResponse>(`/api/bookings/${uid}/cancel`, {
        reason: reason ?? 'Cancelled by CRO',
      }),
    onSuccess: (_data, { uid }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings-all'] })
      qc.invalidateQueries({ queryKey: ['booking', uid] })
      qc.invalidateQueries({ queryKey: ['calendar-events'] })
    },
  })
}
