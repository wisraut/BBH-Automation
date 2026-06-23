// Saves the NotebookLM notebook link a doctor pasted after manually
// uploading the report there (NotebookLM has no public upload API).
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type ReportOut = components['schemas']['ReportOut']

export function useSetNotebookLmUrl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, url }: { reportId: number; patientId: number; url: string }) =>
      api.put<ReportOut>(`/api/reports/${reportId}/notebooklm`, { url }),
    onSuccess: (_data, { reportId, patientId }) => {
      qc.invalidateQueries({ queryKey: ['report', reportId] })
      qc.invalidateQueries({ queryKey: ['patient-reports', patientId] })
    },
  })
}
