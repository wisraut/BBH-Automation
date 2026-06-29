// TOTP 2FA hooks (status + setup + enable + disable).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface TotpStatus {
  enabled: boolean
  pending_setup: boolean
  enrolled_at: string | null
}

export function useTotpStatus() {
  return useQuery({
    queryKey: ['totp-status'] as const,
    queryFn: () => api.get<TotpStatus>('/auth/2fa/status'),
  })
}

export function useTotpSetup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ secret: string; otpauth_url: string }>('/auth/2fa/setup'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['totp-status'] }) },
  })
}

export function useTotpEnable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api.post<void>('/auth/2fa/enable', { code }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['totp-status'] }) },
  })
}

export function useTotpDisable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ password, code }: { password: string; code: string }) =>
      api.post<void>('/auth/2fa/disable', { password, code }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['totp-status'] }) },
  })
}
