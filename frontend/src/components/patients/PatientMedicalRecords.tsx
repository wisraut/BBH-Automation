import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, X } from 'lucide-react'

import { useAuth } from '../../lib/auth'
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

// การ์ดหัวข้อหนึ่งกลุ่ม (แพ้ยา/โรค/ยา/การรักษา) — หัวเรื่อง + จำนวน + ปุ่มเพิ่ม (ถ้าอยู่โหมดแก้ไข)
function SectionCard({
  title, count, children, onAdd,
}: {
  title: string
  count: number
  children: React.ReactNode
  onAdd?: () => void
}) {
  const { t } = useTranslation()
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-serif text-base font-semibold text-bbh-ink">{title}</h3>
          <span className="rounded-full bg-bbh-surface px-2 py-0.5 text-[11px] text-bbh-muted">{count}</span>
        </div>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-lg border border-bbh-line bg-white px-2 py-1 text-xs font-medium text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
          >
            <Plus size={12} /> {t('common.add')}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

// บันทึกทางการแพทย์ของคนไข้ครบ 4 กลุ่ม (แพ้ยาก่อนเพราะสำคัญสุด, โรคประจำตัว, ยาที่ใช้, ประวัติการรักษา)
// หมอเปิดดูเป็นหลัก แก้ไขน้อย จึงซ่อนปุ่ม add/delete ไว้เริ่มต้น; CRO/พยาบาล/admin เข้าโหมดแก้ทันที
export function PatientMedicalRecords({ patientId }: { patientId: number }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const q = usePatientMedicalBundle(patientId)
  const [openForm, setOpenForm] = useState<'cond' | 'allergy' | 'med' | 'treat' | null>(null)
  // Doctors read this record far more often than they edit it, so data-entry
  // controls (add/delete/stop) start hidden for them and reveal on demand
  // (Hick's law — fewer competing actions while reading). CRO/nurse/admin, who
  // maintain the data, start in edit mode.
  const [editing, setEditing] = useState(!!user && user.role !== 'doctor')

  const delCond = useDeleteCondition(patientId)
  const delAllergy = useDeleteAllergy(patientId)
  const delMed = useDeleteMedication(patientId)
  const delTreat = useDeleteTreatment(patientId)
  const toggleMed = useToggleMedication(patientId)

  if (q.isLoading) return <p className="text-sm text-bbh-muted">{t('patientMedicalRecords.loading')}</p>
  if (q.isError || !q.data) return <p className="text-sm text-red-600">{t('common.loadFailed')}</p>

  const { conditions, allergies, medications, treatments } = q.data

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${editing ? 'border-bbh-green bg-bbh-green-soft text-bbh-green-dark' : 'border-bbh-line bg-white text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark'}`}
        >
          {editing ? t('patientMedicalRecords.doneEditing') : t('patientMedicalRecords.edit')}
        </button>
      </div>

      {/* Allergies first — most safety-critical */}
      <SectionCard
        title={t('patientMedicalRecords.allergies.title')}
        count={allergies.length}
        onAdd={editing ? () => setOpenForm('allergy') : undefined}
      >
        {allergies.length === 0 ? (
          <p className="text-xs text-bbh-muted">{t('patientMedicalRecords.allergies.empty')}</p>
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
                {editing ? (
                  <button
                    type="button"
                    onClick={() => { if (confirm(t('patientMedicalRecords.confirmDeleteNamed', { name: a.allergen }))) delAllergy.mutate(a.id) }}
                    className="text-bbh-muted hover:text-red-600"
                    title={t('common.delete')}
                  ><Trash2 size={13} /></button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={t('patientMedicalRecords.conditions.title')}
        count={conditions.length}
        onAdd={editing ? () => setOpenForm('cond') : undefined}
      >
        {conditions.length === 0 ? (
          <p className="text-xs text-bbh-muted">{t('patientMedicalRecords.conditions.empty')}</p>
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
                  {c.diagnosed_year ? <p className="text-xs text-bbh-muted">{t('patientMedicalRecords.conditions.diagnosedYear', { year: c.diagnosed_year })}</p> : null}
                  {c.notes ? <p className="mt-1 text-xs text-bbh-muted">{c.notes}</p> : null}
                </div>
                {editing ? (
                  <button type="button" onClick={() => { if (confirm(t('patientMedicalRecords.confirmDeleteNamed', { name: c.condition_name }))) delCond.mutate(c.id) }} className="text-bbh-muted hover:text-red-600" title={t('common.delete')}><Trash2 size={13} /></button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={t('patientMedicalRecords.medications.title')}
        count={medications.filter((m) => m.is_active).length}
        onAdd={editing ? () => setOpenForm('med') : undefined}
      >
        {medications.length === 0 ? (
          <p className="text-xs text-bbh-muted">{t('patientMedicalRecords.medications.empty')}</p>
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
                    {m.started_year ? ` · ${t('patientMedicalRecords.medications.since', { year: m.started_year })}` : ''}
                  </p>
                </div>
                {editing ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleMed.mutate({ id: m.id, isActive: !m.is_active })}
                      className="rounded border border-bbh-line bg-white px-2 py-0.5 text-[10px] font-semibold text-bbh-muted hover:border-bbh-green hover:text-bbh-green-dark"
                    >
                      {m.is_active ? t('patientMedicalRecords.medications.stop') : t('patientMedicalRecords.medications.resume')}
                    </button>
                    <button type="button" onClick={() => { if (confirm(t('patientMedicalRecords.confirmDeleteNamed', { name: m.drug_name }))) delMed.mutate(m.id) }} className="text-bbh-muted hover:text-red-600" title={t('common.delete')}><Trash2 size={13} /></button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={t('patientMedicalRecords.treatments.title')}
        count={treatments.length}
        onAdd={editing ? () => setOpenForm('treat') : undefined}
      >
        {treatments.length === 0 ? (
          <p className="text-xs text-bbh-muted">{t('patientMedicalRecords.treatments.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {treatments.map((tr) => (
              <li key={tr.id} className="flex items-start justify-between gap-3 rounded-lg border border-bbh-line bg-bbh-surface/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-bbh-line bg-white px-2 py-0.5 text-[10px] font-mono text-bbh-muted">{tr.treatment_type}</span>
                    {tr.treated_date ? <span className="text-[10px] text-bbh-muted">{tr.treated_date}</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-bbh-ink">{tr.description}</p>
                  {tr.hospital ? <p className="text-xs text-bbh-muted">@ {tr.hospital}</p> : null}
                  {tr.outcome ? <p className="text-xs text-bbh-muted">{t('patientMedicalRecords.treatments.outcomeLabel', { outcome: tr.outcome })}</p> : null}
                </div>
                {editing ? (
                  <button type="button" onClick={() => { if (confirm(t('patientMedicalRecords.confirmDeleteItem'))) delTreat.mutate(tr.id) }} className="text-bbh-muted hover:text-red-600" title={t('common.delete')}><Trash2 size={13} /></button>
                ) : null}
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

// เปลือก modal กลางจอที่ฟอร์มเพิ่มข้อมูลทั้ง 4 แบบใช้ร่วมกัน — หัวเรื่อง + ปุ่มปิด + backdrop
function FormShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bbh-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-bbh-line bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-bbh-ink md:text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="text-bbh-muted hover:text-bbh-ink" title={t('common.close')}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ฟอร์มเพิ่มโรคประจำตัว — ชื่อโรค/ICD-10/ปีที่วินิจฉัย/สถานะ (active/controlled/resolved)
function ConditionForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const m = useAddCondition()
  const [b, setB] = useState<ConditionCreate>({ condition_name: '', status: 'active', icd10: null, diagnosed_year: null, notes: null })
  return (
    <FormShell title={t('patientMedicalRecords.conditions.addTitle')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ patientId, body: b }, { onSuccess: onClose }) }} className="space-y-3">
        <input required type="text" placeholder={t('patientMedicalRecords.conditions.namePlaceholder')} value={b.condition_name} onChange={(e) => setB({ ...b, condition_name: e.target.value })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="ICD-10" value={b.icd10 ?? ''} onChange={(e) => setB({ ...b, icd10: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
          <input type="number" placeholder={t('patientMedicalRecords.conditions.diagnosedYearPlaceholder')} value={b.diagnosed_year ?? ''} onChange={(e) => setB({ ...b, diagnosed_year: e.target.value ? Number(e.target.value) : null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        </div>
        <select value={b.status} onChange={(e) => setB({ ...b, status: e.target.value as ConditionCreate['status'] })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm">
          <option value="active">active</option>
          <option value="controlled">controlled</option>
          <option value="resolved">resolved</option>
        </select>
        <textarea placeholder={t('patientMedicalRecords.notesPlaceholder')} value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        {m.error ? <p className="text-xs text-red-600">{t('patientMedicalRecords.saveFailed')}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">{t('common.save')}</button>
        </div>
      </form>
    </FormShell>
  )
}

// ฟอร์มเพิ่มประวัติแพ้ — สารก่อแพ้/อาการ/ระดับความรุนแรง (mild ถึง life-threatening)
function AllergyForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const m = useAddAllergy()
  const [b, setB] = useState<AllergyCreate>({ allergen: '', reaction: null, severity: null, notes: null })
  return (
    <FormShell title={t('patientMedicalRecords.allergies.addTitle')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ patientId, body: b }, { onSuccess: onClose }) }} className="space-y-3">
        <input required type="text" placeholder={t('patientMedicalRecords.allergies.allergenPlaceholder')} value={b.allergen} onChange={(e) => setB({ ...b, allergen: e.target.value })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <input type="text" placeholder={t('patientMedicalRecords.allergies.reactionPlaceholder')} value={b.reaction ?? ''} onChange={(e) => setB({ ...b, reaction: e.target.value || null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <select value={b.severity ?? ''} onChange={(e) => setB({ ...b, severity: (e.target.value || null) as AllergyCreate['severity'] })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm">
          <option value="">{t('patientMedicalRecords.allergies.severityPlaceholder')}</option>
          <option value="mild">mild</option>
          <option value="moderate">moderate</option>
          <option value="severe">severe</option>
          <option value="life_threatening">life threatening</option>
        </select>
        <textarea placeholder={t('patientMedicalRecords.notesPlaceholder')} value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        {m.error ? <p className="text-xs text-red-600">{t('patientMedicalRecords.saveFailed')}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">{t('common.save')}</button>
        </div>
      </form>
    </FormShell>
  )
}

// ฟอร์มเพิ่มยาที่ใช้อยู่ — ชื่อยา/ขนาด/ความถี่/ข้อบ่งใช้/ปีที่เริ่ม
function MedicationForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const m = useAddMedication()
  const [b, setB] = useState<MedicationCreate>({ drug_name: '', dose: null, frequency: null, indication: null, started_year: null, is_active: true, notes: null })
  return (
    <FormShell title={t('patientMedicalRecords.medications.addTitle')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate({ patientId, body: b }, { onSuccess: onClose }) }} className="space-y-3">
        <input required type="text" placeholder={t('patientMedicalRecords.medications.drugNamePlaceholder')} value={b.drug_name} onChange={(e) => setB({ ...b, drug_name: e.target.value })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder={t('patientMedicalRecords.medications.dosePlaceholder')} value={b.dose ?? ''} onChange={(e) => setB({ ...b, dose: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
          <input type="text" placeholder={t('patientMedicalRecords.medications.frequencyPlaceholder')} value={b.frequency ?? ''} onChange={(e) => setB({ ...b, frequency: e.target.value || null })} className="rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        </div>
        <input type="text" placeholder={t('patientMedicalRecords.medications.indicationPlaceholder')} value={b.indication ?? ''} onChange={(e) => setB({ ...b, indication: e.target.value || null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <input type="number" placeholder={t('patientMedicalRecords.medications.startedYearPlaceholder')} value={b.started_year ?? ''} onChange={(e) => setB({ ...b, started_year: e.target.value ? Number(e.target.value) : null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <textarea placeholder={t('patientMedicalRecords.notesPlaceholder')} value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        {m.error ? <p className="text-xs text-red-600">{t('patientMedicalRecords.saveFailed')}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">{t('common.save')}</button>
        </div>
      </form>
    </FormShell>
  )
}

// ฟอร์มเพิ่มประวัติการรักษา/ผ่าตัด — ประเภท/รายละเอียด/โรงพยาบาล/วันที่/ผลลัพธ์
function TreatmentForm({ patientId, onClose }: { patientId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const m = useAddTreatment()
  const [b, setB] = useState<TreatmentCreate>({ treatment_type: 'procedure', description: '', hospital: null, treated_date: null, outcome: null, notes: null })
  return (
    <FormShell title={t('patientMedicalRecords.treatments.addTitle')} onClose={onClose}>
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
        <textarea required placeholder={t('patientMedicalRecords.treatments.descriptionPlaceholder')} value={b.description} onChange={(e) => setB({ ...b, description: e.target.value })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <input type="text" placeholder={t('patientMedicalRecords.treatments.hospitalPlaceholder')} value={b.hospital ?? ''} onChange={(e) => setB({ ...b, hospital: e.target.value || null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <input type="text" placeholder={t('patientMedicalRecords.treatments.outcomePlaceholder')} value={b.outcome ?? ''} onChange={(e) => setB({ ...b, outcome: e.target.value || null })} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        <textarea placeholder={t('patientMedicalRecords.notesPlaceholder')} value={b.notes ?? ''} onChange={(e) => setB({ ...b, notes: e.target.value || null })} rows={2} className="w-full rounded-lg border border-bbh-line px-3 py-2 text-sm" />
        {m.error ? <p className="text-xs text-red-600">{t('patientMedicalRecords.saveFailed')}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-bbh-line bg-white px-4 py-2 text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={m.isPending} className="rounded-xl bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60">{t('common.save')}</button>
        </div>
      </form>
    </FormShell>
  )
}
