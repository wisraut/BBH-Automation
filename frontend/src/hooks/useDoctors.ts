// Active doctor list for assignment dropdowns (report upload, etc).
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type DoctorOut = components['schemas']['DoctorOut']
export type DoctorListResponse = components['schemas']['DoctorListResponse']

export function useDoctors() {
  return useQuery({
    queryKey: ['doctors'] as const,
    queryFn: () => api.get<DoctorListResponse>('/api/doctors'),
  })
}
