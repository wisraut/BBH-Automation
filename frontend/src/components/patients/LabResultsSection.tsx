// Structured lab values for one patient: latest confirmed value per marker,
// grouped by panel, each flagged สูง/ต่ำ/ปกติ against the catalog reference
// range. Markers without a reference range render visibly distinct ("ไม่มีเกณฑ์")
// rather than being silently shown as normal. Draft (unconfirmed) values are
// excluded by default and, when shown, are clearly labelled รอยืนยัน.
import { useMemo, useState } from 'react'
import { FlaskConical, ArrowUp, ArrowDown } from 'lucide-react'

import {
  flagFor,
  useMeasurementCatalog,
  usePatientMeasurements,
  type Measurement,
  type MeasurementCatalogItem,
  type MeasurementFlag,
} from '../../hooks/useMeasurements'

// Panel order + Thai labels mirror backend services/measurement_catalog.PANELS.
const PANEL_ORDER: Array<[string, string]> = [
  ['metabolic', 'เมตาบอลิก / น้ำตาล'],
  ['lipid', 'ไขมัน'],
  ['inflammation', 'การอักเสบ'],
  ['vitamins', 'วิตามิน / แร่ธาตุ'],
  ['liver', 'ตับ'],
  ['kidney', 'ไต'],
  ['cbc', 'ความสมบูรณ์เม็ดเลือด'],
]

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function latestPerCode(rows: Measurement[]): Measurement[] {
  const best = new Map<string, Measurement>()
  for (const r of rows) {
    const cur = best.get(r.code)
    if (!cur || r.measured_at > cur.measured_at || (r.measured_at === cur.measured_at && r.id > cur.id)) {
      best.set(r.code, r)
    }
  }
  return [...best.values()]
}

const FLAG_STYLE: Record<MeasurementFlag, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  low: 'bg-amber-50 text-amber-700 border-amber-200',
  normal: 'bg-bbh-green-soft text-bbh-green-dark border-transparent',
  unknown: 'bg-slate-100 text-slate-500 border-transparent',
}
const FLAG_LABEL: Record<MeasurementFlag, string> = {
  high: 'สูง', low: 'ต่ำ', normal: 'ปกติ', unknown: 'ไม่มีเกณฑ์',
}

function Row({ m, cat }: { m: Measurement; cat: MeasurementCatalogItem | undefined }) {
  const flag = flagFor(m.value, cat)
  const draft = m.status === 'draft'
  const valueColor = flag === 'high' ? 'text-red-700' : flag === 'low' ? 'text-amber-700' : 'text-bbh-ink'
  return (
    <div className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg px-3 py-2 ${draft ? 'border border-dashed border-amber-300 bg-amber-50/40' : 'bg-bbh-surface'}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-bbh-ink">{cat?.label_th ?? m.raw_label ?? m.code}</p>
        <p className="font-mono text-[11px] text-bbh-muted">
          {cat ? `เกณฑ์ ${fmt(cat.ref_low)}–${fmt(cat.ref_high)} ${cat.unit}` : 'ไม่มีเกณฑ์อ้างอิง'}
          <span className="mx-1.5 text-bbh-line">·</span>
          {m.measured_at}
          {draft ? <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">รอยืนยัน</span> : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-mono text-sm font-semibold tabular-nums ${valueColor}`}>
          {fmt(m.value)}<span className="ml-1 text-[11px] font-normal text-bbh-muted">{m.unit ?? cat?.unit ?? ''}</span>
        </span>
        <span className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${FLAG_STYLE[flag]}`}>
          {flag === 'high' ? <ArrowUp size={11} /> : flag === 'low' ? <ArrowDown size={11} /> : null}
          {FLAG_LABEL[flag]}
        </span>
      </div>
    </div>
  )
}

export function LabResultsSection({ patientId }: { patientId: number }) {
  const [includeDrafts, setIncludeDrafts] = useState(false)
  const catalogQ = useMeasurementCatalog()
  const confirmedQ = usePatientMeasurements(patientId, 'confirmed')
  const draftsQ = usePatientMeasurements(includeDrafts ? patientId : undefined, 'draft')

  const catByCode = useMemo(() => {
    const map = new Map<string, MeasurementCatalogItem>()
    for (const c of catalogQ.data?.data ?? []) map.set(c.code, c)
    return map
  }, [catalogQ.data])

  const rows = useMemo(() => {
    const confirmed = latestPerCode(confirmedQ.data?.data ?? [])
    const drafts = includeDrafts ? latestPerCode(draftsQ.data?.data ?? []) : []
    // Drafts only for codes without a confirmed value, so we never show two rows
    // for the same marker.
    const haveConfirmed = new Set(confirmed.map((m) => m.code))
    return [...confirmed, ...drafts.filter((d) => !haveConfirmed.has(d.code))]
  }, [confirmedQ.data, draftsQ.data, includeDrafts])

  const abnormal = rows.filter((m) => {
    const f = flagFor(m.value, catByCode.get(m.code))
    return f === 'high' || f === 'low'
  }).length

  const byPanel = useMemo(() => {
    const groups = new Map<string, Measurement[]>()
    for (const m of rows) {
      const panel = catByCode.get(m.code)?.panel ?? 'other'
      const list = groups.get(panel) ?? []
      list.push(m)
      groups.set(panel, list)
    }
    return groups
  }, [rows, catByCode])

  const loading = confirmedQ.isLoading || catalogQ.isLoading

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">
          <FlaskConical size={13} /> ผลแล็บ (ค่าที่ยืนยันแล้ว)
        </h2>
        <div className="flex items-center gap-3">
          {rows.length > 0 ? (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${abnormal > 0 ? 'bg-red-50 text-red-700' : 'bg-bbh-green-soft text-bbh-green-dark'}`}>
              {abnormal > 0 ? `${abnormal} ค่าผิดปกติ` : 'ทุกค่าปกติ'}
            </span>
          ) : null}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-bbh-muted">
            <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} className="accent-bbh-green" />
            รวมค่าที่รอยืนยัน
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-bbh-line bg-white p-6 text-center text-sm text-bbh-muted">กำลังโหลดผลแล็บ</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-bbh-line bg-white p-6 text-center text-sm text-bbh-muted">
          ยังไม่มีค่าแล็บที่ยืนยัน — เลือก report แล้วกด "สกัดค่าแล็บ" เพื่อดึงค่าจากผลตรวจ
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-bbh-line bg-white p-4">
          {PANEL_ORDER.map(([key, label]) => {
            const items = byPanel.get(key)
            if (!items || items.length === 0) return null
            return (
              <div key={key}>
                <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">{label}</p>
                <div className="space-y-1.5">
                  {items.map((m) => <Row key={m.id} m={m} cat={catByCode.get(m.code)} />)}
                </div>
              </div>
            )
          })}
          {byPanel.get('other')?.length ? (
            <div>
              <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bbh-muted">อื่น ๆ</p>
              <div className="space-y-1.5">
                {byPanel.get('other')!.map((m) => <Row key={m.id} m={m} cat={catByCode.get(m.code)} />)}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
