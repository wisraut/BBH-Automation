// Functional-medicine view of the SAME confirmed measurements as LabResults, but
// as trends compared to an OPTIMAL zone (not just the clinical reference range).
// Each marker is a card: sparkline with the optimal band, latest value, trend
// delta, and an in/below/above-optimal status. Physicians read trends from a
// graph faster than from a table, so this complements LabResults.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

import { Sparkline } from './Sparkline'
import { Eyebrow } from '../ui/Eyebrow'
import {
  useMeasurementCatalog,
  usePatientMeasurements,
  type Measurement,
  type MeasurementCatalogItem,
} from '../../hooks/useMeasurements'

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

type OptStatus = 'optimal' | 'below' | 'above'

function optStatus(value: number, cat: MeasurementCatalogItem): OptStatus {
  if (value < cat.optimal_low) return 'below'
  if (value > cat.optimal_high) return 'above'
  return 'optimal'
}

const STATUS_STYLE: Record<OptStatus, string> = {
  optimal: 'bg-bbh-green-soft text-bbh-green-dark',
  below: 'bg-amber-50 text-amber-700',
  above: 'bg-red-50 text-red-700',
}
const STATUS_LABEL_KEY: Record<OptStatus, string> = {
  optimal: 'statusOptimal',
  below: 'statusBelow',
  above: 'statusAbove',
}

function MarkerCard({ cat, series }: { cat: MeasurementCatalogItem; series: Measurement[] }) {
  const { t } = useTranslation()
  const values = series.map((m) => m.value)
  const latest = values[values.length - 1]
  const prev = values.length > 1 ? values[values.length - 2] : null
  const delta = prev != null ? latest - prev : null
  const status = optStatus(latest, cat)
  const latestColor = status === 'optimal' ? 'text-bbh-green-dark' : status === 'above' ? 'text-red-700' : 'text-amber-700'

  return (
    <div className="rounded-xl border border-bbh-line bg-bbh-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-bbh-ink">{cat.label_th}</p>
          <p className="font-mono text-xs text-bbh-muted">{t('biomarkerSection.optimalRange', { low: fmt(cat.optimal_low), high: fmt(cat.optimal_high), unit: cat.unit })}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
          {t(`biomarkerSection.${STATUS_LABEL_KEY[status]}`)}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className={`font-mono text-xl font-semibold tabular-nums ${latestColor}`}>
            {fmt(latest)}<span className="ml-1 text-xs font-normal text-bbh-muted">{cat.unit}</span>
          </p>
          <p className="flex items-center gap-1 font-mono text-xs text-bbh-muted">
            {delta == null ? (
              t('biomarkerSection.singleValue')
            ) : (
              <>
                {delta > 0 ? <ArrowUp size={11} /> : delta < 0 ? <ArrowDown size={11} /> : <Minus size={11} />}
                {t('biomarkerSection.fromPrevious', { delta: `${delta > 0 ? '+' : ''}${fmt(delta)}` })}
              </>
            )}
          </p>
        </div>
        <Sparkline values={values} optimalLow={cat.optimal_low} optimalHigh={cat.optimal_high} />
      </div>
    </div>
  )
}

export function BiomarkerSection({ patientId }: { patientId: number }) {
  const { t } = useTranslation()
  const catalogQ = useMeasurementCatalog()
  const confirmedQ = usePatientMeasurements(patientId, 'confirmed')

  const cards = useMemo(() => {
    const catalog = catalogQ.data?.data ?? []
    const rows = confirmedQ.data?.data ?? []
    const byCode = new Map<string, Measurement[]>()
    for (const m of rows) {
      const list = byCode.get(m.code) ?? []
      list.push(m)
      byCode.set(m.code, list)
    }
    // Oldest -> newest per code so the sparkline reads left-to-right in time.
    for (const list of byCode.values()) {
      list.sort((a, b) => (a.measured_at < b.measured_at ? -1 : a.measured_at > b.measured_at ? 1 : a.id - b.id))
    }
    // Catalog order, only markers with data.
    return catalog
      .filter((c) => byCode.has(c.code))
      .map((c) => ({ cat: c, series: byCode.get(c.code)! }))
  }, [catalogQ.data, confirmedQ.data])

  const loading = confirmedQ.isLoading || catalogQ.isLoading

  return (
    <section>
      <Eyebrow as="h2" className="mb-3">
        {t('biomarkerSection.title')}
      </Eyebrow>
      {loading ? (
        <div className="rounded-xl border border-bbh-line bg-white p-6 text-center text-sm text-bbh-muted">{t('biomarkerSection.loading')}</div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-bbh-line bg-white p-6 text-center text-sm text-bbh-muted">
          {t('biomarkerSection.empty')}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {cards.map(({ cat, series }) => <MarkerCard key={cat.code} cat={cat} series={series} />)}
        </div>
      )}
    </section>
  )
}
