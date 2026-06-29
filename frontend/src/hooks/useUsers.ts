// Admin user list with filters + pagination.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type UserOut = components['schemas']['schemas__users__UserOut']
export type UserListResponse = components['schemas']['UserListResponse']

export interface UseUsersArgs {
  role?: string
  isActive?: boolean
  search?: string
  page?: number
  limit?: number
}

export function useUsers(args: UseUsersArgs = {}) {
  const { role, isActive, search, page = 1, limit = 30 } = args
  return useQuery({
    queryKey: ['users', { role, isActive, search, page, limit }] as const,
    queryFn: () => {
      const p = new URLSearchParams()
      if (role) p.set('role', role)
      if (isActive !== undefined) p.set('is_active', String(isActive))
      if (search) p.set('search', search)
      p.set('page', String(page))
      p.set('limit', String(limit))
      return api.get<UserListResponse>(`/api/users?${p.toString()}`)
    },
  })
}
