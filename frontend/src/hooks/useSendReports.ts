// Email selected patient report files to a doctor's summary inbox
// (POST /api/patients/:id/reports/send). PHI leaves the system server-side;
// the backend audits every send.
import { useMutation } from '@tanstack/react-query'

import { api } from '../lib/api'

export interface SendReportsInput {
  patientId: number
  report_ids: number[]
  format_prefix: string
  to_email: string | null
}

export interface SendReportsResult {
  sent: boolean
  to: string
  attached: number
  skipped: { id: number; reason: string }[]
}

export function useSendReports() {
  return useMutation({
    mutationFn: ({ patientId, ...body }: SendReportsInput) =>
      api.post<SendReportsResult>(`/api/patients/${patientId}/reports/send`, body),
  })
}
