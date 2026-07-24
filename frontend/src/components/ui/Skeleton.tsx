import { useTranslation } from 'react-i18next'

// Placeholder shapes for content that is still loading. Research: a skeleton
// that mirrors the incoming layout reads ~2x faster than a spinner for the same
// wait, because the user sees structure immediately instead of a blank void.
//
// The pulse is ambient/looping motion — the global prefers-reduced-motion reset
// in index.css caps it to a single pass, so no per-component guard is needed.

// A single placeholder block. Sizing/rounding comes from className so it can
// match whatever it stands in for (row, avatar, chip).
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-bbh-surface ${className}`} />
}

// A stack of placeholder rows for a loading list/table. Exposed as an ARIA busy
// status with an sr-only label so screen-reader users are told the content is
// loading instead of hearing silence (the placeholder blocks are aria-hidden).
export function SkeletonList({
  rows = 5,
  rowClassName = 'h-11 rounded-lg',
  className = 'space-y-2 p-3',
}: {
  rows?: number
  rowClassName?: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
