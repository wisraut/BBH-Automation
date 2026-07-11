// Current user's personal integration settings (their own NotebookLM link and
// Google Calendar id).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface AccountSettings {
  notebooklm_url: string | null
  google_calendar_id: string | null
  // Read-only: the address a doctor shares their Google Calendar with.
  service_account_email: string | null
}

export interface AccountSettingsInput {
  notebooklm_url: string | null
  google_calendar_id: string | null
}

export function useAccountSettings() {
  return useQuery({
    queryKey: ['account-settings'] as const,
    queryFn: () => api.get<AccountSettings>('/api/account/settings'),
  })
}

export function useSaveAccountSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AccountSettingsInput) => api.put<AccountSettings>('/api/account/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account-settings'] }),
  })
}
