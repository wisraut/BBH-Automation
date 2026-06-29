// Admin: create a new user.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type UserCreateRequest = components['schemas']['UserCreateRequest']
export type UserOut = components['schemas']['schemas__users__UserOut']

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UserCreateRequest) => api.post<UserOut>('/api/users', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }) },
  })
}
