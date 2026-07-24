// Client-side filter bar over a patient's already-loaded report list: type tabs
// (only for types present), a "not yet analysed" toggle, and a text search.
// Purely presentational — the parent owns the filter state and applies it.
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'

const TYPE_KEYS: Record<string, string> = {
  lab: 'type.lab',
  imaging: 'type.imaging',
  history: 'type.history',
  prescription: 'type.prescription',
  referral: 'type.referral',
  other: 'type.other',
}

type ReportLike = { report_type: string; latest_analysis_at?: string | null }

export function ReportFilterBar({
  reports,
  activeType,
  onType,
  unreadOnly,
  onUnreadToggle,
  search,
  onSearch,
  onReset,
}: {
  reports: ReportLike[]
  activeType: string
  onType: (value: string) => void
  unreadOnly: boolean
  onUnreadToggle: () => void
  search: string
  onSearch: (value: string) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const anyActive = activeType !== 'all' || unreadOnly || search.trim() !== ''
  const counts = new Map<string, number>()
  let unread = 0
  for (const r of reports) {
    counts.set(r.report_type, (counts.get(r.report_type) ?? 0) + 1)
    if (r.latest_analysis_at == null) unread += 1
  }
  const presentTypes = [...counts.keys()].sort()

  const chip = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? 'bg-bbh-green text-white' : 'bg-white text-bbh-muted hover:text-bbh-ink border border-bbh-line'
    }`

  return (
    <div className="mb-3 space-y-2">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-bbh-muted" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('reportFilterBar.searchPlaceholder')}
          className="h-9 w-full rounded-lg border border-bbh-line bg-white pl-8 pr-3 text-sm text-bbh-ink transition-colors focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onType('all')} className={chip(activeType === 'all')}>
          {t('common.all')} ({reports.length})
        </button>
        {presentTypes.map((type) => (
          <button key={type} type="button" onClick={() => onType(type)} className={chip(activeType === type)}>
            {TYPE_KEYS[type] ? t(`reportFilterBar.${TYPE_KEYS[type]}`) : type} ({counts.get(type)})
          </button>
        ))}
        {unread > 0 ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-bbh-line" />
            <button
              type="button"
              onClick={onUnreadToggle}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                unreadOnly ? 'bg-amber-500 text-white' : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              {t('reportFilterBar.notAnalyzed')} ({unread})
            </button>
          </>
        ) : null}
        {anyActive ? (
          <button type="button" onClick={onReset} className="ml-auto text-xs text-bbh-muted underline transition-colors hover:text-bbh-ink">
            {t('reportFilterBar.clearFilters')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
