// Admin: update display_name / role / specialty / is_active.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type UserUpdateRequest = components['schemas']['UserUpdateRequest']
export type UserOut = components['schemas']['schemas__users__UserOut']

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UserUpdateRequest }) =>
      api.patch<UserOut>(`/api/users/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }) },
  })
}
