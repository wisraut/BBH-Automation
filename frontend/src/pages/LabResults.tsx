// ผลแล็บ (ละเอียด) — the doctor's granular lab VALUES view: each analyte with its
// result, reference range and normal/abnormal flag. This complements กล่องเอกสาร
// (which lists incoming files); here we break a report down to the numbers.
// FRONTEND-ONLY: there is no structured-lab endpoint yet (the system stores lab
// reports as files), so real data can't load. Demo mode (button / ?demo=1) overlays
// sample panels; see mockLabResults. When a backend lab table + endpoint arrive,
// swap the demo source for the query.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, FlaskConical, TriangleAlert, User } from 'lucide-react'

import { MOCK_LAB_PATIENTS, type Analyte } from '../lib/mockLabResults'

type Flag = 'high' | 'low' | 'normal'

function flagOf(a: Analyte): Flag {
  if (a.value > a.high) return 'high'
  if (a.value < a.low) return 'low'
  return 'normal'
}

const FLAG_META: Record<Flag, { label: string; pill: string; row: string }> = {
  high: { label: 'สูง', pill: 'bg-red-50 text-red-600 ring-1 ring-red-200', row: 'text-red-600' },
  low: { label: 'ต่ำ', pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', row: 'text-amber-700' },
  normal: { label: 'ปกติ', pill: 'bg-bbh-green-soft text-bbh-green-dark ring-1 ring-bbh-green/30', row: 'text-bbh-ink' },
}

function AnalyteRow({ a }: { a: Analyte }) {
  const flag = flagOf(a)
  const meta = FLAG_META[flag]
  const abnormal = flag !== 'normal'
  return (
    <tr className="border-b border-bbh-line/70 last:border-b-0">
      <td className="py-2.5 pr-3">
        <p className="text-sm font-medium text-bbh-ink">{a.name}</p>
        {a.note ? <p className="text-[11px] text-bbh-muted">{a.note}</p> : null}
      </td>
      <td className={`py-2.5 px-3 text-right font-mono text-sm font-semibold ${abnormal ? meta.row : 'text-bbh-ink'}`}>
        {a.value}
      </td>
      <td className="py-2.5 px-3 text-left text-xs text-bbh-muted">{a.unit}</td>
      <td className="hidden py-2.5 px-3 text-right font-mono text-xs text-bbh-muted sm:table-cell">
        {a.low}–{a.high}
      </td>
      <td className="py-2.5 pl-3 text-right">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}>{meta.label}</span>
      </td>
    </tr>
  )
}

export function LabResults() {
  const [params] = useSearchParams()
  const [demo, setDemo] = useState(params.get('demo') === '1')
  const [patientId, setPatientId] = useState<number>(MOCK_LAB_PATIENTS[0].id)

  const patient = MOCK_LAB_PATIENTS.find((p) => p.id === patientId) ?? MOCK_LAB_PATIENTS[0]
  const panels = demo ? patient.panels : []
  const abnormalCount = panels.reduce(
    (sum, p) => sum + p.analytes.filter((a) => flagOf(a) !== 'normal').length,
    0,
  )

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bbh-green">Lab Results</p>
          <h1 className="mt-2 flex items-center gap-2 font-serif text-3xl font-semibold text-bbh-ink md:text-4xl">
            <FlaskConical size={28} className="text-bbh-green" /> ผลแล็บ (ละเอียด)
          </h1>
          <p className="mt-1 text-sm text-bbh-muted">
            ค่าตรวจแตกรายตัว — ผล · ค่าอ้างอิง · สถานะปกติ/ผิดปกติ
          </p>
        </div>
        {!demo ? (
          <button
            type="button"
            onClick={() => setDemo(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-bbh-green-soft px-3 py-2 text-sm font-semibold text-bbh-green-dark ring-1 ring-bbh-green/20 transition-colors hover:ring-bbh-green/40"
          >
            <FlaskConical size={15} /> ดูตัวอย่างข้อมูล (demo)
          </button>
        ) : null}
      </div>

      {demo ? (
        <>
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
            <span>โหมดตัวอย่าง — ค่าแล็บสมมุติสำหรับดูหน้าตาเท่านั้น ไม่ใช่ผลตรวจคนไข้จริง</span>
            <button
              type="button"
              onClick={() => setDemo(false)}
              className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
            >
              ปิดตัวอย่าง
            </button>
          </div>

          {/* Patient picker + summary */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-bbh-line">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bbh-surface text-bbh-green-dark ring-1 ring-bbh-line">
                <User size={18} />
              </span>
              <div>
                <div className="relative inline-block">
                  <select
                    value={patientId}
                    onChange={(e) => setPatientId(Number(e.target.value))}
                    className="cursor-pointer appearance-none rounded-lg border border-bbh-line bg-white py-1 pl-2 pr-7 text-sm font-semibold text-bbh-ink focus:outline-none focus:ring-1 focus:ring-bbh-green"
                    aria-label="เลือกคนไข้"
                  >
                    {MOCK_LAB_PATIENTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-bbh-muted" />
                </div>
                <p className="mt-1 text-xs text-bbh-muted">
                  {patient.hn} · เก็บตัวอย่าง {patient.collectedAt}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                abnormalCount
                  ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                  : 'bg-bbh-green-soft text-bbh-green-dark ring-1 ring-bbh-green/30'
              }`}
            >
              <TriangleAlert size={13} />
              {abnormalCount ? `${abnormalCount} ค่าผิดปกติ` : 'ทุกค่าปกติ'}
            </span>
          </div>

          {/* Panels */}
          <div className="grid gap-4 lg:grid-cols-2">
            {panels.map((panel) => (
              <div key={panel.key} className="rounded-2xl bg-white/80 p-5 ring-1 ring-bbh-line">
                <h2 className="mb-2 font-serif text-lg font-semibold text-bbh-ink">{panel.name}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-bbh-line text-[11px] font-semibold uppercase tracking-wider text-bbh-muted">
                        <th className="py-1.5 pr-3 text-left">รายการ</th>
                        <th className="py-1.5 px-3 text-right">ผล</th>
                        <th className="py-1.5 px-3 text-left">หน่วย</th>
                        <th className="hidden py-1.5 px-3 text-right sm:table-cell">ค่าอ้างอิง</th>
                        <th className="py-1.5 pl-3 text-right">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panel.analytes.map((a) => (
                        <AnalyteRow key={a.name} a={a} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/80 py-16 text-center text-sm text-bbh-muted ring-1 ring-bbh-line">
          <FlaskConical size={26} className="text-bbh-green" />
          <p>ยังไม่ได้เชื่อมข้อมูลผลแล็บแบบละเอียด — รอ backend เก็บค่าตรวจเป็นตัวเลขแยกช่อง</p>
          <button
            type="button"
            onClick={() => setDemo(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bbh-green-soft px-3 py-1.5 text-xs font-semibold text-bbh-green-dark ring-1 ring-bbh-green/20 hover:ring-bbh-green/40"
          >
            <FlaskConical size={13} /> ดูตัวอย่างข้อมูล (demo)
          </button>
        </div>
      )}
    </div>
  )
}
