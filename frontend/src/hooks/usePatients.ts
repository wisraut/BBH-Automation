// Patients list from backend patient registry with search and pagination.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type PatientListItem = components['schemas']['PatientListItem']
export type PatientListResponse = components['schemas']['PatientListResponse']

export type PatientSortKey = 'hn' | 'name' | 'latest_visit'
export type SortDirection = 'asc' | 'desc'

export interface UsePatientsArgs {
  search?: string
  mine?: boolean
  page?: number
  limit?: number
  sort?: PatientSortKey
  direction?: SortDirection
}

export function usePatients({
  search, mine = false, page = 1, limit = 20, sort = 'hn', direction = 'desc',
}: UsePatientsArgs = {}) {
  return useQuery({
    queryKey: ['patients', { search: search?.trim() || '', mine, page, limit, sort, direction }] as const,
    queryFn: () => {
      const params = new URLSearchParams()
      const q = search?.trim()
      if (q) params.set('search', q)
      if (mine) params.set('mine', 'true')
      params.set('page', String(page))
      params.set('limit', String(limit))
      params.set('sort', sort)
      params.set('direction', direction)
      return api.get<PatientListResponse>(`/api/patients?${params.toString()}`)
    },
  })
}
