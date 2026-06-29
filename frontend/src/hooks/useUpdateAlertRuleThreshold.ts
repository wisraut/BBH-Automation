// Admin: update threshold JSON for an alert rule.
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '../lib/api'
import type { components } from '../lib/api-types'

export type RuleOut = components['schemas']['RuleOut']

export function useUpdateAlertRuleThreshold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleKey, threshold }: { ruleKey: string; threshold: Record<string, unknown> }) =>
      api.patch<RuleOut>(`/api/admin/alert-rules/${ruleKey}/threshold`, { threshold }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-alert-rules'] })
    },
  })
}
