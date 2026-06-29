// Admin: enable/disable an alert rule.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type RuleOut = components['schemas']['RuleOut']

export function useToggleAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleKey, enabled }: { ruleKey: string; enabled: boolean }) =>
      api.patch<RuleOut>(`/api/admin/alert-rules/${ruleKey}/enabled`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-alert-rules'] })
      qc.invalidateQueries({ queryKey: ['admin-alerts'] })
    },
  })
}
