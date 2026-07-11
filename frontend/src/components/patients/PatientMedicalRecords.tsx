import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Heart,
  Pill,
  Plus,
  Scissors,
  Trash2,
  X,
} from 'lucide-react'

import {
  useAddAllergy,
  useAddCondition,
  useAddMedication,
  useAddTreatment,
  useDeleteAllergy,
  useDeleteCondition,
  useDeleteMedication,
  useDeleteTreatment,
  usePatientMedicalBundle,
  useToggleMedication,
  type AllergyCreate,
  type ConditionCreate,
  type MedicationCreate,
  type TreatmentCreate,
} from '../../hooks/usePatientMedicalBundle'

const STATUS_STYLE: Record<string, string> = {
  active: 'border-red-200 bg-red-50 text-red-700',
  controlled: 'border-amber-200 bg-amber-50 text-amber-700',
  resolved: 'border-bbh-line bg-bbh-surface text-bbh-muted',
}
const SEVERITY_STYLE: Record<string, string> = {
  life_threatening: 'border-red-300 bg-red-100 text-red-800',
  severe: 'border-red-200 bg-red-50 text-red-700',
  moderate: 'border-amber-200 bg-amber-50 text-amber-700',
  mild: 'border-bbh-line bg-bbh-surface text-bbh-muted',
}

function SectionCard({
  title, icon: Icon, count, accent, children, onAdd,
}: {
  title: string
  icon: typeof Activity
  count: number
  accent: string
  children: React.ReactNode
  onAdd?: () => void
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={18} className={accent} />
          <h3 className="font-serif text-base font-semibold text-bbh-ink">{title}</h3>
          <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-[11px] text-bbh-muted">{count}</span>
        </div>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
          >
            <Plus size={12} /> เพิ่ม
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function PatientMedicalRecords({ patientId }: { patientId: number }) {
  const q = usePatientMedicalBundle(patientId)
  const [openForm, setOpenForm] = useState<'cond' | 'allergy' | 'med' | 'treat' | null>(null)

  const delCond = useDeleteCondition(patientId)
  const delAllergy = useDeleteAllergy(patientId)
  const delMed = useDeleteMedication(patientId)
  const delTreat = useDeleteTreatment(patientId)
  const toggleMed = useToggleMedication(patientId)

  if (q.isLoading) return <p className="text-sm text-bbh-muted">กำลังโหลดประวัติการแพทย์...</p>
  if (q.isError || !q.data) return <p className="text-sm text-red-600">โหลดข้อมูลไม่สำเร็จ</p>

  const { conditions, allergies, medications, treatments } = q.data

  return (
    <div className="space-y-4">
      {/* Allergies first — most safety-critical */}
      <SectionCard
        title="แพ้ยา / สารก่อภูมิแพ้"
        icon={AlertTriangle}
        accent="text-red-500"
        count={allergies.length}
        onAdd={() => setOpenForm('allergy')}
      >
        {allergies.length === 0 ? (
          <p className="text-xs text-bbh-muted">— ไม่พบประวัติแพ้ —</p>
        ) : (
          <ul className="space-y-2">
            {allergies.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-bbh-line bg-bbh-surface/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-bbh-ink">{a.allergen}</p>
                    {a.severity ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLE[a.severity] ?? ''}`}>
                        {a.severity}
                      </span>
                    ) : null}
                  </div>
                  {a.reaction ? <p className="text-xs text-bbh-muted">→ {a.reaction}</p> : null}
                  {a.notes ? <p className="mt-1 text-xs text-bbh-muted">{a.notes}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => { if (confirm(`ลบ "${a.allergen}"?`)) delAllergy.mutate(a.id) }}
                  className="text-bbh-muted hover:text-red-600"
                  title="ลบ"
                ><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="โรคประจำตัว"
        icon={Heart}
        accent="text-pink-500"
        count={conditions.length}
        onAdd={() => setOpenForm('cond')}
      >
        {conditions.length === 0 ? (
          <p className="text-xs text-bbh-muted">— ไม่พบโรคประจำตัว —</p>
        ) : (
          <ul className="space-y-2">
            {conditions.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-bbh-line bg-bbh-surface/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-bbh-ink">{c.condition_name}</p>
                    {c.icd10 ? <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-[10px] font-mono text-bbh-muted">{c.icd10}</span> : null}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                  </div>
                  {c.diagnosed_year ? <p className="text-xs text-bbh-muted">วินิจฉัยปี {c.diagnosed_year}</p> : null}
                  {c.notes ? <p className="mt-1 text-xs text-bbh-muted">{c.notes}</p> : null}
                </div>
                <button type="button" onClick={() => { if (confirm(`ลบ "${c.condition_name}"?`)) delCond.mutate(c.id) }} className="text-bbh-muted hover:text-red-600" title="ลบ"><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="ยาที่ใช้อยู่"
        icon={Pill}
        accent="text-bbh-green"
        count={medications.filter((m) => m.is_active).length}
        onAdd={() => setOpenForm('med')}
      >
        {medications.length === 0 ? (
          <p className="text-xs text-bbh-muted">— ไม่มีรายการยา —</p>
        ) : (
          <ul className="space-y-2">
            {medications.map((m) => (
              <li key={m.id} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${m.is_active ? 'border-bbh-green/30 bg-bbh-green-soft/30' : 'border-bbh-line bg-bbh-surface/40 opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-bbh-ink">
                    {m.drug_name}
                    {m.dose ? <span className="ml-2 text-xs font-normal text-bbh-muted">{m.dose}</span> : null}
                  </p>
                  <p className="text-xs text-bbh-muted">
                    {m.frequency ?? '-'}
                    {m.indication ? ` · ${m.indication}` : ''}
                    {m.started_year ? ` · ตั้งแต่ ${m.started_year}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleMed.mutate({ id: m.id, isActive: !m.is_active })}
                    className="rounded border border-bbh-line bg-white px-2 py-0.5 text-[10px] font-semibold text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
                  >
                    {m.is_active ? 'หยุดใช้' : 'ใช้อีก'}
                  </button>
                  <button type="button" onClick={() => { if (confirm(`ลบ "${m.drug_name}"?`)) delMed.mutate(m.id) }} className="text-bbh-muted hover:text-red-600" title="ลบ"><Trash2 size={13} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="ประวัติการรักษา"
        icon={Scissors}
        accent="text-blue-500"
        count={treatments.length}
        onAdd={() => setOpenForm('treat')}
      >
        {treatments.length === 0 ? (
          <p className="text-xs text-bbh-muted">— ไม่พบประวัติการรักษา —</p>
        ) : (
          <ul className="space-y-2">
            {treatments.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-bbh-line bg-bbh-surface/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-[10px] font-mono text-bbh-muted">{t.treatment_type}</span>
                    {t.treated_date ? <span className="text-[10px] text-bbh-muted">{t.treated_date}</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-bbh-ink">{t.description}</p>
                  {t.hospital ? <p className="text-xs text-bbh-muted">@ {t.hospital}</p> : null}
                  {t.outcome ? <p className="text-xs text-bbh-muted">ผล: {t.outcome}</p> : null}
                </div>
                <button type="button" onClick={() => { if (confirm('ลบรายการนี้?')) delTreat.mutate(t.id) }} className="text-bbh-muted hover:text-red-600" title="ลบ"><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {openForm === 'cond' ? <ConditionForm patientId={patientId} onClose={() => setOpenForm(null)} /> : null}
      {openForm === 'allergy' ? <AllergyForm patientId={patientId} onClose={() => setOpenForm(null)} /> : null}
      {openForm === 'med' ? <MedicationForm patientId={patientId} onClose={() => setOpenForm(null)} /> : null}
      {openForm === 'treat' ? <TreatmentForm patientId={patientId} onClose={() => setOpenForm(null)} /> : null}
    </div>
  )
}

// --- Inline forms (small modals) -----------------------------------------

function FormShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bbh-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-bbh-line bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="text-bbh-muted hover:text-bbh-ink"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ConditionForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const m = useAddCondition()
  const [b, setB] = useState<ConditionCreate>({ condition_name: '', status: 'active', icd10: null, diagnosed_year: null, notes: null })
  return (
    <FormShell title="เพิ่มโรคประจำตัว" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ patientId, body: b }, { onSuccess: onClose }) }} className="space-y-3">
        <input required type="text" placeholder="ชื่อโรค *" value={b.condition_name} onChange={(e) => setB({ ...b, condition_name: e.target.value })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="ICD-10" value={b.icd10 ?? ''} onChange={(e) => setB({ ...b, icd10: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
          <input type="number" placeholder="ปีที่วินิจฉัย" value={b.diagnosed_year ?? ''} onChange={(e) => setB({ ...b, diagnosed_year: e.target.value ? Number(e.target.value) : null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        </div>
        <select value={b.status} onChange={(e) => setB({ ...b, status: e.target.value as ConditionCreate['status'] })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm">
          <option value="active">active</option>
          <option value="controlled">controlled</option>
          <option value="resolved">resolved</option>
        </select>
        <textarea placeholder="หมายเหตุ" value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        {m.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
          <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">บันทึก</button>
        </div>
      </form>
    </FormShell>
  )
}

function AllergyForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const m = useAddAllergy()
  const [b, setB] = useState<AllergyCreate>({ allergen: '', reaction: null, severity: null, notes: null })
  return (
    <FormShell title="เพิ่มประวัติแพ้" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ patientId, body: b }, { onSuccess: onClose }) }} className="space-y-3">
        <input required type="text" placeholder="ยา/สารก่อภูมิแพ้ *" value={b.allergen} onChange={(e) => setB({ ...b, allergen: e.target.value })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <input type="text" placeholder="ปฏิกิริยา (เช่น ผื่น คลื่นไส้)" value={b.reaction ?? ''} onChange={(e) => setB({ ...b, reaction: e.target.value || null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <select value={b.severity ?? ''} onChange={(e) => setB({ ...b, severity: (e.target.value || null) as AllergyCreate['severity'] })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm">
          <option value="">— ความรุนแรง —</option>
          <option value="mild">mild</option>
          <option value="moderate">moderate</option>
          <option value="severe">severe</option>
          <option value="life_threatening">life threatening</option>
        </select>
        <textarea placeholder="หมายเหตุ" value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        {m.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
          <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">บันทึก</button>
        </div>
      </form>
    </FormShell>
  )
}

function MedicationForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const m = useAddMedication()
  const [b, setB] = useState<MedicationCreate>({ drug_name: '', dose: null, frequency: null, indication: null, started_year: null, is_active: true, notes: null })
  return (
    <FormShell title="เพิ่มยาที่ใช้" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ patientId, body: b }, { onSuccess: onClose }) }} className="space-y-3">
        <input required type="text" placeholder="ชื่อยา *" value={b.drug_name} onChange={(e) => setB({ ...b, drug_name: e.target.value })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="ขนาด (5mg)" value={b.dose ?? ''} onChange={(e) => setB({ ...b, dose: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
          <input type="text" placeholder="ความถี่ (วันละ 1)" value={b.frequency ?? ''} onChange={(e) => setB({ ...b, frequency: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        </div>
        <input type="text" placeholder="ข้อบ่งใช้ (เช่น HT)" value={b.indication ?? ''} onChange={(e) => setB({ ...b, indication: e.target.value || null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <input type="number" placeholder="ปีที่เริ่มใช้" value={b.started_year ?? ''} onChange={(e) => setB({ ...b, started_year: e.target.value ? Number(e.target.value) : null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <textarea placeholder="หมายเหตุ" value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        {m.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
          <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">บันทึก</button>
        </div>
      </form>
    </FormShell>
  )
}

function TreatmentForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const m = useAddTreatment()
  const [b, setB] = useState<TreatmentCreate>({ treatment_type: 'procedure', description: '', hospital: null, treated_date: null, outcome: null, notes: null })
  return (
    <FormShell title="เพิ่มประวัติการรักษา" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ patientId, body: b }, { onSuccess: onClose }) }} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select value={b.treatment_type} onChange={(e) => setB({ ...b, treatment_type: e.target.value })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm">
            <option value="surgery">surgery</option>
            <option value="procedure">procedure</option>
            <option value="therapy">therapy</option>
            <option value="other">other</option>
          </select>
          <input type="date" value={b.treated_date ?? ''} onChange={(e) => setB({ ...b, treated_date: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        </div>
        <textarea required placeholder="รายละเอียด *" value={b.description} onChange={(e) => setB({ ...b, description: e.target.value })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <input type="text" placeholder="โรงพยาบาล" value={b.hospital ?? ''} onChange={(e) => setB({ ...b, hospital: e.target.value || null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <input type="text" placeholder="ผลการรักษา" value={b.outcome ?? ''} onChange={(e) => setB({ ...b, outcome: e.target.value || null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <textarea placeholder="หมายเหตุ" value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        {m.error ? <p className="text-xs text-red-600">บันทึกไม่สำเร็จ</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">ยกเลิก</button>
          <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">บันทึก</button>
        </div>
      </form>
    </FormShell>
  )
}
