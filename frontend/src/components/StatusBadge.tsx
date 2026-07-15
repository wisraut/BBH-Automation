import { useTranslation } from 'react-i18next'

import type { BookingStatus } from '../hooks/useBookings'

const STYLES: Record<BookingStatus, string> = {
  draft: 'border border-bbh-line bg-bbh-surface text-bbh-muted',
  pending_approval: 'border border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark',
  rejected: 'border border-red-200 bg-red-50 text-red-700',
  cancelled: 'border border-bbh-line bg-bbh-surface text-bbh-muted',
  expired: 'border border-bbh-line bg-bbh-surface text-bbh-muted',
  no_show: 'border border-amber-300 bg-white text-amber-700',
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STYLES[status]}`}>
      {t(`statusBadge.${status}`)}
    </span>
  )
}
