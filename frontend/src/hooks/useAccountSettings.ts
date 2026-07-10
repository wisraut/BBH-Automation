// Current user's personal integration settings (e.g. their own NotebookLM link).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface AccountSettings {
  notebooklm_url: string | null
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
    mutationFn: (body: AccountSettings) => api.put<AccountSettings>('/api/account/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account-settings'] }),
  })
}
