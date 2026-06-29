// Admin: reset another user's password.
import { useMutation } from '@tanstack/react-query'

import { api } from '../lib/api'

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: number; newPassword: string }) =>
      api.post<void>(`/api/users/${id}/reset-password`, { new_password: newPassword }),
  })
}
