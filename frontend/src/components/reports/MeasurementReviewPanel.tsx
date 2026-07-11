// Doctor-facing draft review for LLM-extracted lab values. Extraction produces
// UNCONFIRMED drafts; the doctor edits/confirms each (or rejects) before any
// value is trusted by the LabResults/Biomarker views. Only doctor/admin see this.
import { useState } from 'react'
import { Wand2, Check, X, Loader2, CheckCheck } from 'lucide-react'

import {
  useConfirmMeasurement,
  useExtractMeasurements,
  useMeasurementCatalog,
  useRejectMeasurement,
  useBulkConfirmMeasurements,
  useReportMeasurementDrafts,
  type Measurement,
  type MeasurementCatalogItem,
} from '../../hooks/useMeasurements'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bbh-green focus-visible:ring-offset-1'

function DraftRow({
  draft,
  catalog,
  reportId,
  patientId,
}: {
  draft: Measurement
  catalog: MeasurementCatalogItem[]
  reportId: number
  patientId: number
}) {
  const [code, setCode] = useState(draft.code)
  const [value, setValue] = useState(String(draft.value))
  const [unit, setUnit] = useState(draft.unit ?? '')
  const [date, setDate] = useState(draft.measured_at)
  const confirm = useConfirmMeasurement()
  const reject = useRejectMeasurement()
  const busy = confirm.isPending || reject.isPending

  const onConfirm = () => {
    const num = Number(value)
    if (!Number.isFinite(num)) return
    confirm.mutate({
      id: draft.id,
      patientId,
      reportId,
      edit: { code, value: num, unit: unit.trim() || null, measured_at: date },
    })
  }

  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={catalog.some((c) => c.code === code) ? code : 'unknown'}
          onChange={(e) => setCode(e.target.value)}
          className={`h-8 min-w-0 flex-1 rounded-md border border-bbh-line bg-white px-2 text-xs text-bbh-ink ${FOCUS_RING}`}
        >
          <option value="unknown">— เลือกค่า —</option>
          {catalog.map((c) => <option key={c.code} value={c.code}>{c.label_th}</option>)}
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          className={`h-8 w-20 rounded-md border border-bbh-line bg-white px-2 text-right font-mono text-xs tabular-nums text-bbh-ink ${FOCUS_RING}`}
        />
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="หน่วย"
          className={`h-8 w-16 rounded-md border border-bbh-line bg-white px-2 text-xs text-bbh-ink ${FOCUS_RING}`}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`h-8 rounded-md border border-bbh-line bg-white px-2 text-xs text-bbh-ink ${FOCUS_RING}`}
        />
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || code === 'unknown'}
          title="ยืนยัน"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-md bg-bbh-green text-white transition-colors hover:bg-bbh-green-dark disabled:opacity-50 ${FOCUS_RING}`}
        >
          {confirm.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button
          type="button"
          onClick={() => reject.mutate({ id: draft.id, patientId, reportId })}
          disabled={busy}
          title="ปฏิเสธ"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border border-bbh-line text-bbh-muted transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50 ${FOCUS_RING}`}
        >
          {reject.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
        </button>
      </div>
      {draft.raw_label && draft.raw_label.toLowerCase() !== code ? (
        <p className="mt-1 truncate font-mono text-[10px] text-bbh-muted">จากผลตรวจ: {draft.raw_label}</p>
      ) : null}
    </div>
  )
}

export function MeasurementReviewPanel({
  reportId,
  patientId,
}: {
  reportId: number
  patientId: number
}) {
  const catalogQ = useMeasurementCatalog()
  const draftsQ = useReportMeasurementDrafts(reportId)
  const extract = useExtractMeasurements()
  const bulkConfirm = useBulkConfirmMeasurements()

  const catalog = catalogQ.data?.data ?? []
  const drafts = draftsQ.data?.data ?? []
  const [parseError, setParseError] = useState(false)

  const onExtract = () => {
    extract.mutate(
      { reportId, patientId },
      { onSuccess: (data) => setParseError(data.parse_error && data.data.length === 0) },
    )
  }

  const onConfirmAll = () => {
    // Skip unknown-code drafts — the per-row Confirm blocks them, so bulk must too.
    const ready = drafts.filter((d) => d.code !== 'unknown')
    if (ready.length === 0) return
    bulkConfirm.mutate({ items: ready.map((d) => ({ id: d.id })), reportId, patientId })
  }

  return (
    <section className="rounded-xl border border-bbh-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-bbh-muted">สกัดค่าแล็บ (AI)</h2>
        <button
          type="button"
          onClick={onExtract}
          disabled={extract.isPending}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-3 py-1.5 text-xs font-semibold text-bbh-ink transition-colors hover:border-bbh-green hover:text-bbh-green-dark disabled:opacity-50 ${FOCUS_RING}`}
        >
          {extract.isPending ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          {drafts.length > 0 ? 'สกัดใหม่' : 'สกัดค่าแล็บ'}
        </button>
      </div>

      <p className="mb-3 text-[11px] leading-5 text-bbh-muted">
        AI จะอ่านค่าจากข้อความผลตรวจ แล้วให้แพทย์ตรวจ/แก้/ยืนยันก่อนบันทึก — ค่าที่ยังไม่ยืนยันจะไม่ถูกนำไปแสดงผล
      </p>

      {extract.isError ? (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">สกัดค่าไม่สำเร็จ — report อาจไม่มีข้อความ (scanned) ให้กรอกเอง</p>
      ) : null}
      {parseError ? (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">อ่านค่าอัตโนมัติไม่ได้จาก report นี้ — กรอกค่าเองได้ในภายหลัง</p>
      ) : null}

      {drafts.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-bbh-muted">{drafts.length} ค่ารอยืนยัน</p>
            <button
              type="button"
              onClick={onConfirmAll}
              disabled={bulkConfirm.isPending}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-bbh-green px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-bbh-green-dark disabled:opacity-50 ${FOCUS_RING}`}
            >
              {bulkConfirm.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
              ยืนยันทั้งหมด
            </button>
          </div>
          {drafts.map((d) => (
            <DraftRow key={d.id} draft={d} catalog={catalog} reportId={reportId} patientId={patientId} />
          ))}
        </div>
      ) : !extract.isPending ? (
        <p className="text-xs text-bbh-muted">ยังไม่มีค่าที่รอยืนยัน — กด "สกัดค่าแล็บ" เพื่อดึงค่าจากผลตรวจ</p>
      ) : null}
    </section>
  )
}
