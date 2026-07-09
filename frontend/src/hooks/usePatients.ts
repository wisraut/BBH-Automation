// Patients list from backend patient registry with search and pagination.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type PatientListItem = components['schemas']['PatientListItem']
export type PatientListResponse = components['schemas']['PatientListResponse']

export interface UsePatientsArgs {
  search?: string
  mine?: boolean
  page?: number
  limit?: number
}

export function usePatients({ search, mine = false, page = 1, limit = 20 }: UsePatientsArgs = {}) {
  return useQuery({
    queryKey: ['patients', { search: search?.trim() || '', mine, page, limit }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      const q = search?.trim()
      if (q) params.set('search', q)
      if (mine) params.set('mine', 'true')
      params.set('page', String(page))
      params.set('limit', String(limit))
      return api.get<PatientListResponse>(`/api/patients?${params.toString()}`)
    },
  })
}
