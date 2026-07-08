// Biomarker — trend of key markers vs an OPTIMAL range (functional/longevity),
// not just the lab reference range.
// FRONTEND-ONLY: the optimal-range catalog below is clinical reference config
// (constants), NOT patient data. Real per-patient values + trend need
// GET /api/patients/{id}/biomarkers, which does not exist yet — so by default
// each card shows the optimal band with an empty "ยังไม่มีผลตรวจ" state. Demo mode
// (button / ?demo=1) overlays sample readings + sparkline so the page can be
// previewed; see mockBiomarkers.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, Info, TrendingDown, TrendingUp } from 'lucide-react'

import { MONTH_LABELS, MOCK_BIOMARKER_SERIES } from '../lib/mockBiomarkers'

interface Marker {
  key: string
  name: string
  unit: string
  scaleMin: number
  scaleMax: number
  optimalLow: number
  optimalHigh: number
  note: string
}

// Optimal (functional-medicine) targets — reference config, not patient data.
const MARKER_CATALOG: Marker[] = [
  { key: 'hscrp', name: 'hs-CRP', unit: 'mg/L', scaleMin: 0, scaleMax: 5, optimalLow: 0, optimalHigh: 1, note: 'อักเสบทั้งร่างกาย — ยิ่งต่ำยิ่งดี' },
  { key: 'hba1c', name: 'HbA1c', unit: '%', scaleMin: 4, scaleMax: 7, optimalLow: 4.8, optimalHigh: 5.3, note: 'น้ำตาลเฉลี่ย 3 เดือน' },
  { key: 'vitd', name: 'Vitamin D (25-OH)', unit: 'ng/mL', scaleMin: 0, scaleMax: 100, optimalLow: 40, optimalHigh: 60, note: 'ภูมิคุ้มกัน · กระดูก · อารมณ์' },
  { key: 'glucose', name: 'Fasting Glucose', unit: 'mg/dL', scaleMin: 60, scaleMax: 120, optimalLow: 75, optimalHigh: 90, note: 'น้ำตาลขณะอดอาหาร' },
  { key: 'insulin', name: 'Fasting Insulin', unit: 'µIU/mL', scaleMin: 0, scaleMax: 15, optimalLow: 2, optimalHigh: 5, note: 'ความไวต่ออินซูลิน' },
  { key: 'ferritin', name: 'Ferritin', unit: 'ng/mL', scaleMin: 0, scaleMax: 300, optimalLow: 50, optimalHigh: 150, note: 'คลังธาตุเหล็ก' },
]

function pct(v: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
}

// latest value vs the optimal band → status shown on the card.
function markerStatus(v: number, m: Marker): { label: string; pill: string; dot: string } {
  if (v < m.optimalLow) return { label: 'ต่ำกว่า optimal', pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-500' }
  if (v > m.optimalHigh) return { label: 'สูงกว่า optimal', pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-500' }
  return { label: 'อยู่ในโซน optimal', pill: 'bg-bbh-green-soft text-bbh-green-dark ring-1 ring-bbh-green/30', dot: 'bg-bbh-green' }
}

// Inline single-series sparkline. Uses currentColor so the parent sets the hue.
function Sparkline({ values }: { values: number[] }) {
  const w = 100
  const h = 30
  const pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return [x, y] as const
  })
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full text-bbh-green" aria-hidden="true">
      <path d={area} fill="currentColor" opacity={0.12} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill="currentColor" />
    </svg>
  )
}

function MarkerCard({ m, demo }: { m: Marker; demo: boolean }) {
  const left = pct(m.optimalLow, m.scaleMin, m.scaleMax)
  const right = pct(m.optimalHigh, m.scaleMin, m.scaleMax)
  const series = demo ? MOCK_BIOMARKER_SERIES[m.key] : undefined

  const latest = series ? series[series.length - 1] : undefined
  const prev = series && series.length > 1 ? series[series.length - 2] : undefined
  const status = latest !== undefined ? markerStatus(latest, m) : undefined
  const delta = latest !== undefined && prev !== undefined ? latest - prev : undefined

  return (
    <div className="rounded-2xl bg-white/80 p-5 ring-1 ring-bbh-line transition-all duration-200 hover:ring-bbh-green/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-bbh-ink">{m.name}</p>
          <p className="text-xs text-bbh-muted">{m.note}</p>
        </div>
        <span className="shrink-0 font-mono text-xs text-bbh-muted">{m.unit}</span>
      </div>

      {/* Latest value + status (demo only) */}
      {latest !== undefined && status ? (
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-3xl font-semibold leading-none text-bbh-ink">{latest}</span>
            {delta !== undefined && delta !== 0 ? (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-bbh-muted">
                {delta < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                {Math.abs(Number(delta.toFixed(1)))}
              </span>
            ) : null}
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.pill}`}>{status.label}</span>
        </div>
      ) : null}

      {/* Trend: sparkline in demo, empty state otherwise */}
      <div className="mt-3 h-14 rounded-lg bg-bbh-surface ring-1 ring-bbh-line/70">
        {series ? (
          <div className="h-full px-1 py-1">
            <Sparkline values={series} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-bbh-muted">
            <TrendingUp size={14} className="mr-1.5 opacity-60" /> ยังไม่มีผลตรวจ
          </div>
        )}
      </div>
      {series ? (
        <p className="mt-1.5 text-[11px] text-bbh-muted">
          {series.length} ครั้ง · ล่าสุด {MONTH_LABELS[MONTH_LABELS.length - 1]}
        </p>
      ) : null}

      {/* Optimal-range band (+ live dot at latest value in demo) */}
      <div className="mt-4">
        <div className="relative h-2.5 rounded-full bg-bbh-line/60">
          <div
            className="absolute inset-y-0 rounded-full bg-bbh-green"
            style={{ left: `${left}%`, right: `${100 - right}%` }}
          />
          {latest !== undefined && status ? (
            <span
              className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${status.dot}`}
              style={{ left: `${pct(latest, m.scaleMin, m.scaleMax)}%` }}
              title={`ค่าล่าสุด ${latest} ${m.unit}`}
            />
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-bbh-muted">
          <span className="font-mono">{m.scaleMin}</span>
          <span className="font-semibold text-bbh-green-dark">
            optimal {m.optimalLow}–{m.optimalHigh}
          </span>
          <span className="font-mono">{m.scaleMax}</span>
        </div>
      </div>
    </div>
  )
}

export function Biomarker() {
  const [params] = useSearchParams()
  const [demo, setDemo] = useState(params.get('demo') === '1')

  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">Functional Markers</p>
          <h1 className="mt-2 flex items-center gap-2 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">
            <Activity size={28} className="text-bbh-green" /> Biomarker
          </h1>
          <p className="mt-1 text-sm text-bbh-muted">
            แนวโน้มค่าตรวจสำคัญเทียบ <span className="font-semibold text-bbh-green-dark">optimal range</span> —
            เป้าหมายสายfunctional คือเข้าโซน optimal ไม่ใช่แค่ &ldquo;ไม่ผิดปกติ&rdquo;
          </p>
        </div>
        {!demo ? (
          <button
            type="button"
            onClick={() => setDemo(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-bbh-green-soft px-3 py-2 text-sm font-semibold text-bbh-green-dark ring-1 ring-bbh-green/20 transition-colors hover:ring-bbh-green/40"
          >
            <Activity size={15} /> ดูตัวอย่างข้อมูล (demo)
          </button>
        ) : null}
      </div>

      {demo ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          <span>โหมดตัวอย่าง — แนวโน้มสมมุติสำหรับดูหน้าตาเท่านั้น ไม่ใช่ผลตรวจคนไข้จริง</span>
          <button
            type="button"
            onClick={() => setDemo(false)}
            className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            ปิดตัวอย่าง
          </button>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-bbh-green-soft/50 px-4 py-3 text-sm text-bbh-ink ring-1 ring-bbh-green/20">
          <Info size={16} className="mt-0.5 shrink-0 text-bbh-green-dark" />
          <span>
            แถบเขียวคือช่วง optimal ของแต่ละ marker (ค่าอ้างอิงทางคลินิก) — เส้นแนวโน้มของคนไข้จะแสดงเมื่อเชื่อมข้อมูลผลตรวจจริง
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MARKER_CATALOG.map((m) => (
          <MarkerCard key={m.key} m={m} demo={demo} />
        ))}
      </div>
    </div>
  )
}
