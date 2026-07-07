// Biomarker — trend of key markers vs an OPTIMAL range (functional/longevity),
// not just the lab reference range.
// FRONTEND-ONLY: the optimal-range catalog below is clinical reference config
// (constants), NOT patient data. Actual per-patient values + sparkline trend
// need GET /api/patients/{id}/biomarkers, which does not exist yet — so each
// card shows the optimal band with an empty "ยังไม่มีผลตรวจ" trend state.
import { Activity, Info, TrendingUp } from 'lucide-react'

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

function MarkerCard({ m }: { m: Marker }) {
  const left = pct(m.optimalLow, m.scaleMin, m.scaleMax)
  const right = pct(m.optimalHigh, m.scaleMin, m.scaleMax)
  return (
    <div className="rounded-2xl bg-white/80 p-5 ring-1 ring-bbh-line transition-all duration-200 hover:ring-bbh-green/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-bbh-ink">{m.name}</p>
          <p className="text-xs text-bbh-muted">{m.note}</p>
        </div>
        <span className="shrink-0 font-mono text-xs text-bbh-muted">{m.unit}</span>
      </div>

      {/* Empty trend state (sparkline lands with real data) */}
      <div className="mt-4 flex h-14 items-center justify-center rounded-lg bg-bbh-surface text-xs text-bbh-muted ring-1 ring-bbh-line/70">
        <TrendingUp size={14} className="mr-1.5 opacity-60" /> ยังไม่มีผลตรวจ
      </div>

      {/* Optimal-range band */}
      <div className="mt-4">
        <div className="relative h-2.5 rounded-full bg-bbh-line/60">
          <div
            className="absolute inset-y-0 rounded-full bg-bbh-green"
            style={{ left: `${left}%`, right: `${100 - right}%` }}
          />
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
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-xl bg-bbh-green-soft/50 px-4 py-3 text-sm text-bbh-ink ring-1 ring-bbh-green/20">
        <Info size={16} className="mt-0.5 shrink-0 text-bbh-green-dark" />
        <span>
          แถบเขียวคือช่วง optimal ของแต่ละ marker (ค่าอ้างอิงทางคลินิก) — เส้นแนวโน้มของคนไข้จะแสดงเมื่อเชื่อมข้อมูลผลตรวจจริง
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MARKER_CATALOG.map((m) => (
          <MarkerCard key={m.key} m={m} />
        ))}
      </div>
    </div>
  )
}
