// Effective AI mode + banner state for a patient's LINE session — polls 10s.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'

export type AiMode = 'auto' | 'copilot' | 'silent'
export type Banner = 'auto' | 'copilot' | 'silent' | 'paused' | 'after_hours' | 'keyword_handoff'
export type Reason = 'sticky_mode' | 'auto_pause' | 'after_hours'

export interface AiModeState {
  has_line_session: boolean
  session_id?: number
  ai_mode: AiMode
  ai_pause_until: string | null
  effective_mode: AiMode
  reason: Reason
  banner: Banner
  sticky_mode: AiMode
  pause_until: string | null
  mode_changed_by?: number | null
  mode_changed_at?: string | null
}

export function usePatientAiMode(patientId: number | null) {
  return useQuery({
    queryKey: ['patient-ai-mode', patientId],
    queryFn: () => api.get<AiModeState>(`/api/patients/${patientId}/ai-mode`),
    enabled: patientId != null,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
}

export function useSetPatientAiMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patientId, mode, reason }: { patientId: number; mode: AiMode; reason?: string }) =>
      api.post<{ ok: boolean; from_mode?: AiMode; ai_mode: AiMode }>(
        `/api/patients/${patientId}/ai-mode`,
        { mode, reason: reason ?? 'cro_manual' },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['patient-ai-mode', vars.patientId] })
    },
  })
}
