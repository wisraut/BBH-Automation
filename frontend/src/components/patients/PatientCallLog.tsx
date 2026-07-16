import { useState } from 'react'
import { dateLocale } from '../../i18n/datetime'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2, X } from 'lucide-react'

import {
  useAddCallLog,
  useDeleteCallLog,
  usePatientCallLog,
  type CallLogCreateBody,
  type CallOutcome,
} from '../../hooks/usePatientCallLog'

const OUTCOME_META: Record<CallOutcome, { tone: string }> = {
  answered:     { tone: 'border-bbh-green/30 bg-bbh-green-soft text-bbh-green-dark' },
  no_answer:    { tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  voicemail:    { tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  wrong_number: { tone: 'border-red-200 bg-red-50 text-red-700' },
  refused:      { tone: 'border-red-200 bg-red-50 text-red-700' },
  busy:         { tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  other:        { tone: 'border-bbh-line bg-bbh-surface text-bbh-muted' },
}

const SUBJECT_KEYS = ['booking_confirm', 'no_show_followup', 'lab_result', 'billing', 'other'] as const

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(dateLocale(), {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// บันทึกการโทรของคนไข้ — แสดงประวัติโทรเข้า/ออกพร้อมผลลัพธ์ (รับสาย/ไม่รับ/ฝากข้อความ)
// ให้ CRO ติดตามการติดต่อคนไข้ (ยืนยันนัด/ตาม no-show/แจ้งผลแล็บ) และเพิ่มบันทึกใหม่ได้
export function PatientCallLog({ patientId }: { patientId: number }) {
  const { t } = useTranslation()
  const q = usePatientCallLog(patientId)
  const del = useDeleteCallLog(patientId)
  const [addOpen, setAddOpen] = useState(false)

  const calls = q.data?.data ?? []

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-serif text-base font-semibold text-bbh-ink">{t('patientCallLog.title')}</h3>
          <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-[11px] text-bbh-muted">{calls.length}</span>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
        >
          <Plus size={12} /> {t('patientCallLog.logCall')}
        </button>
      </div>

      {q.isLoading ? (
        <p className="text-xs text-bbh-muted">{t('common.loading')}</p>
      ) : calls.length === 0 ? (
        <p className="text-xs text-bbh-muted">{t('patientCallLog.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {calls.map((c) => {
            const meta = OUTCOME_META[c.outcome] ?? OUTCOME_META.other
            return (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-bbh-line bg-bbh-surface/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    {c.direction === 'out' ? (
                      <ArrowUpRight size={12} className="text-bbh-muted" />
                    ) : (
                      <ArrowDownLeft size={12} className="text-bbh-muted" />
                    )}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.tone}`}>
                      {t(`patientCallLog.outcome.${c.outcome}`)}
                    </span>
                    {c.duration_min != null ? (
                      <span className="text-bbh-muted">{t('patientCallLog.minutes', { count: c.duration_min })}</span>
                    ) : null}
                    <span className="text-bbh-muted">·</span>
                    <span className="font-mono text-bbh-muted">{fmtDateTime(c.called_at)}</span>
                  </div>
                  {c.subject ? (
                    <p className="mt-1 text-xs">
                      <span className="text-bbh-muted">{t('patientCallLog.subjectLabel')} </span>
                      <span className="text-bbh-ink">{(SUBJECT_KEYS as readonly string[]).includes(c.subject) ? t(`patientCallLog.subject.${c.subject}`) : c.subject}</span>
                    </p>
                  ) : null}
                  {c.note ? <p className="mt-1 text-sm text-bbh-ink whitespace-pre-wrap">{c.note}</p> : null}
                  {c.called_by_name ? (
                    <p className="mt-1 text-[10px] text-bbh-muted">{t('patientCallLog.by', { name: c.called_by_name })}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => { if (confirm(t('patientCallLog.confirmDelete'))) del.mutate(c.id) }}
                  className="text-bbh-muted hover:text-red-600"
                  title={t('common.delete')}
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

// ฟอร์ม modal สำหรับบันทึกการโทรครั้งใหม่ — เลือกทิศทาง/ผลลัพธ์/เรื่องที่คุย + จดโน้ต
function AddCallForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const { t } = useTranslation()
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
          <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{t('patientCallLog.title')}</h2>
          <button type="button" onClick={onClose} className="text-bbh-muted hover:text-bbh-ink" title={t('common.close')}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={b.direction} onChange={(e) => setB({ ...b, direction: e.target.value as 'out' | 'in' })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm">
              <option value="out">{t('patientCallLog.directionOut')}</option>
              <option value="in">{t('patientCallLog.directionIn')}</option>
            </select>
            <select value={b.outcome} onChange={(e) => setB({ ...b, outcome: e.target.value as CallOutcome })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm">
              {(Object.keys(OUTCOME_META) as CallOutcome[]).map((k) => (
                <option key={k} value={k}>{t(`patientCallLog.outcome.${k}`)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={b.subject ?? ''} onChange={(e) => setB({ ...b, subject: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm">
              <option value="">{t('patientCallLog.subjectOptional')}</option>
              {SUBJECT_KEYS.map((key) => <option key={key} value={key}>{t(`patientCallLog.subject.${key}`)}</option>)}
            </select>
            <input
              type="number"
              min={0}
              max={600}
              placeholder={t('patientCallLog.durationPlaceholder')}
              value={b.duration_min ?? ''}
              onChange={(e) => setB({ ...b, duration_min: e.target.value ? Number(e.target.value) : null })}
              className="rounded-lg border border-bbh-line px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder={t('patientCallLog.notePlaceholder')}
            rows={3}
            value={b.note ?? ''}
            onChange={(e) => setB({ ...b, note: e.target.value || null })}
            maxLength={2000}
            className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm"
          />
          {m.error ? <p className="text-xs text-red-600">{t('patientCallLog.saveFailed')}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">{t('common.cancel')}</button>
            <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">{t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
