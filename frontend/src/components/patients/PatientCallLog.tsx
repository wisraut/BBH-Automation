import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import {
  useAddCallLog,
  useDeleteCallLog,
  usePatientCallLog,
  type CallLogCreateBody,
  type CallOutcome,
} from '../../hooks/usePatientCallLog'

const OUTCOME_META: Record<CallOutcome, { label: string; tone: string; icon: typeof Phone }> = {
  answered:     { label: 'รับสาย',       tone: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark', icon: Phone },
  no_answer:    { label: 'ไม่รับ',       tone: 'border-amber-200 bg-amber-50 text-amber-700', icon: PhoneMissed },
  voicemail:    { label: 'ฝากข้อความ',   tone: 'border-amber-200 bg-amber-50 text-amber-700', icon: PhoneMissed },
  wrong_number: { label: 'เบอร์ผิด',     tone: 'border-red-200 bg-red-50 text-red-700', icon: PhoneOff },
  refused:      { label: 'ปฏิเสธสาย',    tone: 'border-red-200 bg-red-50 text-red-700', icon: PhoneOff },
  busy:         { label: 'สายไม่ว่าง',    tone: 'border-amber-200 bg-amber-50 text-amber-700', icon: PhoneMissed },
  other:        { label: 'อื่นๆ',         tone: 'border-bbh-line bg-bbh-surface text-bbh-muted', icon: Phone },
}

const SUBJECTS = [
  { key: 'booking_confirm', label: 'ยืนยันนัด' },
  { key: 'no_show_followup', label: 'ตามคนไข้ no-show' },
  { key: 'lab_result', label: 'แจ้งผลแล็บ' },
  { key: 'billing', label: 'ค่าใช้จ่าย' },
  { key: 'other', label: 'อื่นๆ' },
]

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function PatientCallLog({ patientId }: { patientId: number }) {
  const q = usePatientCallLog(patientId)
  const del = useDeleteCallLog(patientId)
  const [addOpen, setAddOpen] = useState(false)

  const calls = q.data?.data ?? []

  return (
    <section className="rounded-2xl border border-bbh-line bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PhoneIncoming size={18} className="text-bbh-green" />
          <h3 className="font-serif text-base font-semibold text-bbh-ink">บันทึกการโทร</h3>
          <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-[11px] text-bbh-muted">{calls.length}</span>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
        >
          <Plus size={12} /> บันทึกสาย
        </button>
      </div>

      {q.isLoading ? (
        <p className="text-xs text-bbh-muted">กำลังโหลด...</p>
      ) : calls.length === 0 ? (
        <p className="text-xs text-bbh-muted">— ยังไม่มีบันทึกการโทร —</p>
      ) : (
        <ul className="space-y-2">
          {calls.map((c) => {
            const meta = OUTCOME_META[c.outcome] ?? OUTCOME_META.other
            const Icon = meta.icon
            return (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-bbh-line bg-bbh-surface/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    {c.direction === 'out' ? (
                      <ArrowUpRight size={12} className="text-bbh-muted" />
                    ) : (
                      <ArrowDownLeft size={12} className="text-bbh-muted" />
                    )}
                    <Icon size={12} />
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.tone}`}>
                      {meta.label}
                    </span>
                    {c.duration_min != null ? (
                      <span className="text-bbh-muted">{c.duration_min} นาที</span>
                    ) : null}
                    <span className="text-bbh-muted">·</span>
                    <span className="font-mono text-bbh-muted">{fmtDateTime(c.called_at)}</span>
                  </div>
                  {c.subject ? (
                    <p className="mt-1 text-xs">
                      <span className="text-bbh-muted">เรื่อง: </span>
                      <span className="text-bbh-ink">{SUBJECTS.find((s) => s.key === c.subject)?.label ?? c.subject}</span>
                    </p>
                  ) : null}
                  {c.note ? <p className="mt-1 text-sm text-bbh-ink whitespace-pre-wrap">{c.note}</p> : null}
                  {c.called_by_name ? (
                    <p className="mt-1 text-[10px] text-bbh-muted">โดย {c.called_by_name}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => { if (confirm('ลบบันทึกนี้?')) del.mutate(c.id) }}
                  className="text-bbh-muted hover:text-red-600"
                  title="ลบ"
                ><Trash2 size={13} /></button>
              </li>
            )
          })}
        </ul>
      )}

      {addOpen ? <AddCallForm patientId={patientId} onClose={() => setAddOpen(false)} /> : null}
    </section>
  )
}

function AddCallForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const m = useAddCallLog()
  const [b, setB] = useState<CallLogCreateBody>({
    direction: 'out',
    outcome: 'answered',
    duration_min: null,
    subject: 'booking_confirm',
    note: '',
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    m.mutate(
      { patientId, body: b },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bbh-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-bbh-line bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">บันทึกการโทร</h2>
          <button type="button" onClick={onClose} className="text-bbh-muted hover:text-bbh-ink"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={b.direction} onChange={(e) => setB({ ...b, direction: e.target.value as 'out' | 'in' })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm">
              <option value="out">โทรออก</option>
              <option value="in">รับโทรเข้า</option>
            </select>
            <select value={b.outcome} onChange={(e) => setB({ ...b, outcome: e.target.value as CallOutcome })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm">
              {(Object.keys(OUTCOME_META) as CallOutcome[]).map((k) => (
                <option key={k} value={k}>{OUTCOME_META[k].label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={b.subject ?? ''} onChange={(e) => setB({ ...b, subject: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm">
              <option value="">— เรื่อง (ไม่บังคับ) —</option>
              {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input
              type="number"
              min={0}
              max={600}
              placeholder="ความยาว (นาที)"
              value={b.duration_min ?? ''}
              onChange={(e) => setB({ ...b, duration_min: e.target.value ? Number(e.target.value) : null })}
              className="rounded-lg border border-bbh-line px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="โน้ตการสนทนา"
            rows={3}
            value={b.note ?? ''}
            onChange={(e) => setB({ ...b, note: e.target.value || null })}
            maxLength={2000}
            className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm"
          />
          {m.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
            <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">บันทึก</button>
          </div>
        </form>
      </div>
    </div>
  )
}
