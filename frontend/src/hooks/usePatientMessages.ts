// Chat history for a patient's LINE conversation — polls every 5s.
import { useQuery } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface ChatMessage {
  id: number
  direction: 'in' | 'out' | 'system'
  message_type: string
  text: string | null
  route_prefix: string | null
  at: string | null
}

interface Response {
  data: ChatMessage[]
  count: number
}

export function usePatientMessages(patientId: number | null) {
  return useQuery({
    queryKey: ['patient-messages', patientId],
    queryFn: () => api.get<Response>(`/api/patients/${patientId}/messages`),
    enabled: patientId != null,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  })
}
