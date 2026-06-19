import { useMemo } from 'react'

import { useAllBookings } from './useAllBookings'
import type { components } from '../lib/api-types'

type BookingItem = components['schemas']['BookingListItem']

export interface PatientRecord {
  key: string
  name: string
  phone: string | null
  bookings: BookingItem[]
  latestAt: string
  approvedCount: number
  pendingCount: number
}

function patientKey(b: BookingItem): string {
  return b.phone?.trim() || b.patient_name?.trim() || b.request_uid
}

export function usePatients() {
  const approvedQ  = useAllBookings('approved')
  const pendingQ   = useAllBookings('pending_approval')
  const rejectedQ  = useAllBookings('rejected')
  const cancelledQ = useAllBookings('cancelled')

  const patients = useMemo<PatientRecord[]>(() => {
    const all = [
      ...approvedQ.data,
      ...pendingQ.data,
      ...rejectedQ.data,
      ...cancelledQ.data,
    ]

    const map = new Map<string, PatientRecord>()
    for (const b of all) {
      const key = patientKey(b)
      const existing = map.get(key)
      if (existing) {
        existing.bookings.push(b)
        if (b.created_at > existing.latestAt) existing.latestAt = b.created_at
        if (b.status === 'approved') existing.approvedCount++
        if (b.status === 'pending_approval') existing.pendingCount++
      } else {
        map.set(key, {
          key,
          name: b.patient_name ?? '-',
          phone: b.phone ?? null,
          bookings: [b],
          latestAt: b.created_at,
          approvedCount: b.status === 'approved' ? 1 : 0,
          pendingCount: b.status === 'pending_approval' ? 1 : 0,
        })
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => b.latestAt.localeCompare(a.latestAt)
    )
  }, [approvedQ.data, pendingQ.data, rejectedQ.data, cancelledQ.data])

  return {
    patients,
    isLoading: approvedQ.isLoading || pendingQ.isLoading || rejectedQ.isLoading || cancelledQ.isLoading,
    total: patients.length,
  }
}
