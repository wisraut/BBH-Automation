// Change own password — requires verifying the old password server-side.
import { useMutation } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest']

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      api.post<void>('/auth/change-password', body),
  })
}
