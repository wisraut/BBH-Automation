import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, UserRound } from 'lucide-react'

import { Modal } from '../Modal'
import { ModalActions } from '../ui/ModalActions'
import type { PatientCreateRequest } from '../../hooks/useCreatePatient'
import type { PatientOut } from '../../hooks/usePatient'
import type { PatientUpdateRequest } from '../../hooks/useUpdatePatient'

type Gender = NonNullable<PatientCreateRequest['gender']>
// Tri-state for the smoking/drinking pickers: '' = not recorded, 'no', 'yes'.
type YesNo = '' | 'no' | 'yes'

// Canonical nationality options — kept in sync with the LINE bot's normalize
// target (rag/prompts.py) so both channels store the same values. "อื่นๆ" reveals
// a free-text field for the long tail.
const NATIONALITIES = [
  'ไทย', 'เมียนมา', 'กัมพูชา', 'ลาว', 'เวียดนาม', 'มาเลเซีย', 'จีน',
  'อินเดีย', 'ญี่ปุ่น', 'เกาหลีใต้', 'ฟิลิปปินส์', 'สหรัฐอเมริกา', 'สหราชอาณาจักร',
]
const OTHER = '__other__'

// Shared field vocabulary so every input reads the same.
const FIELD = 'mt-1 h-12 w-full rounded-xl border border-bbh-line px-3 text-sm focus:border-bbh-green focus:outline-none'
const TEXTAREA = 'mt-1 w-full resize-none rounded-xl border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none'

type FormState = {
  display_name: string
  phone: string
  email: string
  dob: string
  gender: Gender
  nationality: string
  notes: string
  english_name: string
  religion: string
  marital_status: string
  occupation: string
  father_name: string
  father_phone: string
  mother_name: string
  mother_phone: string
  emergency_contact_name: string
  emergency_contact_relation: string
  emergency_contact_phone: string
  emergency_contact_address: string
  past_illness: string
  congenital_disease: string
  drugs_supplements: string
  drug_allergy: string
  food_allergy: string
  chief_complaint: string
  smoking: YesNo
  smoking_years: string
  drinking: YesNo
  drinking_years: string
}

interface PatientFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  patient?: PatientOut | null
  saving?: boolean
  onClose: () => void
  onSubmit: (body: PatientCreateRequest | PatientUpdateRequest) => void
}

const EMPTY: FormState = {
  display_name: '', phone: '', email: '', dob: '', gender: 'unknown', nationality: '', notes: '',
  english_name: '', religion: '', marital_status: '', occupation: '',
  father_name: '', father_phone: '', mother_name: '', mother_phone: '',
  emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_phone: '', emergency_contact_address: '',
  past_illness: '', congenital_disease: '', drugs_supplements: '', drug_allergy: '', food_allergy: '', chief_complaint: '',
  smoking: '', smoking_years: '', drinking: '', drinking_years: '',
}

function clean(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

// bool | null (from DB) -> tri-state string for the picker
function toYesNo(v: boolean | null | undefined): YesNo {
  return v == null ? '' : v ? 'yes' : 'no'
}

// Section heading inside the scrolling form.
function Section({ children }: { children: ReactNode }) {
  return <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-bbh-muted">{children}</p>
}

// Modal ฟอร์มเพิ่ม/แก้ไขข้อมูลคนไข้ — ครอบคลุมทั้งข้อมูลส่วนตัว, ครอบครัว/ผู้ติดต่อฉุกเฉิน
// และประวัติสุขภาพ (แพ้/โรค/ยา/สูบ/ดื่ม) ให้ตรงกับใบ "บันทึกประวัติ / Health Record"
// ใช้ทั้งตอนสร้างคนไข้ใหม่และแก้ข้อมูลเดิม (mode create/edit) จากหน้ารายชื่อคนไข้
export function PatientFormModal({ open, mode, patient, saving, onClose, onSubmit }: PatientFormModalProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(EMPTY)
  // Whether the nationality picker is in free-text mode (value not in the list).
  const [natOther, setNatOther] = useState(false)

  useEffect(() => {
    if (!open) return
    const nat = patient?.nationality ?? ''
    setForm({
      display_name: patient?.display_name ?? '',
      phone: patient?.phone ?? '',
      email: patient?.email ?? '',
      dob: patient?.dob ?? '',
      gender: patient?.gender ?? 'unknown',
      nationality: nat,
      notes: patient?.notes ?? '',
      english_name: patient?.english_name ?? '',
      religion: patient?.religion ?? '',
      marital_status: patient?.marital_status ?? '',
      occupation: patient?.occupation ?? '',
      father_name: patient?.father_name ?? '',
      father_phone: patient?.father_phone ?? '',
      mother_name: patient?.mother_name ?? '',
      mother_phone: patient?.mother_phone ?? '',
      emergency_contact_name: patient?.emergency_contact_name ?? '',
      emergency_contact_relation: patient?.emergency_contact_relation ?? '',
      emergency_contact_phone: patient?.emergency_contact_phone ?? '',
      emergency_contact_address: patient?.emergency_contact_address ?? '',
      past_illness: patient?.past_illness ?? '',
      congenital_disease: patient?.congenital_disease ?? '',
      drugs_supplements: patient?.drugs_supplements ?? '',
      drug_allergy: patient?.drug_allergy ?? '',
      food_allergy: patient?.food_allergy ?? '',
      chief_complaint: patient?.chief_complaint ?? '',
      smoking: toYesNo(patient?.smoking),
      smoking_years: patient?.smoking_years != null ? String(patient.smoking_years) : '',
      drinking: toYesNo(patient?.drinking),
      drinking_years: patient?.drinking_years != null ? String(patient.drinking_years) : '',
    })
    setNatOther(!!nat && !NATIONALITIES.includes(nat))
  }, [open, patient])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const body = {
      display_name: form.display_name.trim(),
      phone: clean(form.phone),
      email: clean(form.email),
      dob: clean(form.dob),
      gender: form.gender,
      nationality: clean(form.nationality),
      notes: clean(form.notes),
      english_name: clean(form.english_name),
      religion: clean(form.religion),
      marital_status: clean(form.marital_status),
      occupation: clean(form.occupation),
      father_name: clean(form.father_name),
      father_phone: clean(form.father_phone),
      mother_name: clean(form.mother_name),
      mother_phone: clean(form.mother_phone),
      emergency_contact_name: clean(form.emergency_contact_name),
      emergency_contact_relation: clean(form.emergency_contact_relation),
      emergency_contact_phone: clean(form.emergency_contact_phone),
      emergency_contact_address: clean(form.emergency_contact_address),
      past_illness: clean(form.past_illness),
      congenital_disease: clean(form.congenital_disease),
      drugs_supplements: clean(form.drugs_supplements),
      drug_allergy: clean(form.drug_allergy),
      food_allergy: clean(form.food_allergy),
      chief_complaint: clean(form.chief_complaint),
      // '' (not recorded) leaves the stored value untouched; 'no'/'yes' persist.
      smoking: form.smoking === '' ? null : form.smoking === 'yes',
      smoking_years: form.smoking === 'yes' && form.smoking_years ? Number(form.smoking_years) : null,
      drinking: form.drinking === '' ? null : form.drinking === 'yes',
      drinking_years: form.drinking === 'yes' && form.drinking_years ? Number(form.drinking_years) : null,
    }
    onSubmit(body)
  }

  return (
    <Modal open={open} title={mode === 'create' ? t('patientFormModal.addTitle') : t('patientFormModal.editTitle')} onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-4">
        <Section>{t('patientFormModal.secPersonal')}</Section>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.fullName')}
            <input required value={form.display_name} onChange={(e) => update('display_name', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.englishName')}
            <input value={form.english_name} onChange={(e) => update('english_name', e.target.value)} className={FIELD} />
          </label>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.dob')}
            <input type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.sex')}
            <select value={form.gender} onChange={(e) => update('gender', e.target.value as Gender)} className={FIELD}>
              <option value="unknown">{t('patientFormModal.sexUnknown')}</option>
              <option value="female">{t('patientFormModal.sexFemale')}</option>
              <option value="male">{t('patientFormModal.sexMale')}</option>
              <option value="other">{t('patientFormModal.sexOther')}</option>
            </select>
          </label>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.religion')}
            <input value={form.religion} onChange={(e) => update('religion', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.maritalStatus')}
            <input value={form.marital_status} onChange={(e) => update('marital_status', e.target.value)} className={FIELD} />
          </label>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.occupation')}
            <input value={form.occupation} onChange={(e) => update('occupation', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.phone')}
            <input value={form.phone} onChange={(e) => update('phone', e.target.value)} className={FIELD} />
          </label>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.email')}
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.nationality')}
            <select
              value={natOther ? OTHER : form.nationality}
              onChange={(e) => {
                const v = e.target.value
                if (v === OTHER) { setNatOther(true); update('nationality', '') }
                else { setNatOther(false); update('nationality', v) }
              }}
              className={FIELD}
            >
              <option value="">{t('patientFormModal.nationalityUnset')}</option>
              {NATIONALITIES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value={OTHER}>{t('patientFormModal.nationalityOther')}</option>
            </select>
          </label>
        </div>
        {natOther && (
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.nationalitySpecify')}
            <input value={form.nationality} maxLength={60} onChange={(e) => update('nationality', e.target.value)} className={FIELD} />
          </label>
        )}

        <Section>{t('patientFormModal.secFamily')}</Section>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.fatherName')}
            <input value={form.father_name} onChange={(e) => update('father_name', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.fatherPhone')}
            <input value={form.father_phone} onChange={(e) => update('father_phone', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.motherName')}
            <input value={form.mother_name} onChange={(e) => update('mother_name', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.motherPhone')}
            <input value={form.mother_phone} onChange={(e) => update('mother_phone', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.emergencyName')}
            <input value={form.emergency_contact_name} onChange={(e) => update('emergency_contact_name', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.emergencyRelation')}
            <input value={form.emergency_contact_relation} onChange={(e) => update('emergency_contact_relation', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.emergencyPhone')}
            <input value={form.emergency_contact_phone} onChange={(e) => update('emergency_contact_phone', e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.emergencyAddress')}
            <input value={form.emergency_contact_address} onChange={(e) => update('emergency_contact_address', e.target.value)} className={FIELD} />
          </label>
        </div>

        <Section>{t('patientFormModal.secHealth')}</Section>
        <label className="block text-sm font-medium text-bbh-ink">
          {t('patientFormModal.pastIllness')}
          <textarea rows={2} value={form.past_illness} onChange={(e) => update('past_illness', e.target.value)} placeholder={t('patientFormModal.healthHint')} className={TEXTAREA} />
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          {t('patientFormModal.congenitalDisease')}
          <textarea rows={2} value={form.congenital_disease} onChange={(e) => update('congenital_disease', e.target.value)} placeholder={t('patientFormModal.healthHint')} className={TEXTAREA} />
        </label>
        <label className="block text-sm font-medium text-bbh-ink">
          {t('patientFormModal.drugsSupplements')}
          <textarea rows={2} value={form.drugs_supplements} onChange={(e) => update('drugs_supplements', e.target.value)} placeholder={t('patientFormModal.healthHint')} className={TEXTAREA} />
        </label>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.drugAllergy')}
            <textarea rows={2} value={form.drug_allergy} onChange={(e) => update('drug_allergy', e.target.value)} placeholder={t('patientFormModal.healthHint')} className={TEXTAREA} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.foodAllergy')}
            <textarea rows={2} value={form.food_allergy} onChange={(e) => update('food_allergy', e.target.value)} placeholder={t('patientFormModal.healthHint')} className={TEXTAREA} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink sm:col-span-2">
            {t('patientFormModal.chiefComplaint')}
            <textarea rows={2} value={form.chief_complaint} onChange={(e) => update('chief_complaint', e.target.value)} placeholder={t('patientFormModal.healthHint')} className={TEXTAREA} />
          </label>
        </div>

        <Section>{t('patientFormModal.secBehavior')}</Section>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.smoking')}
            <select value={form.smoking} onChange={(e) => update('smoking', e.target.value as YesNo)} className={FIELD}>
              <option value="">{t('patientFormModal.htUnset')}</option>
              <option value="no">{t('patientFormModal.htNo')}</option>
              <option value="yes">{t('patientFormModal.htYes')}</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.years')}
            <input type="number" min={0} max={120} value={form.smoking_years} disabled={form.smoking !== 'yes'} onChange={(e) => update('smoking_years', e.target.value)} className={`${FIELD} disabled:cursor-not-allowed disabled:bg-bbh-surface`} />
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.drinking')}
            <select value={form.drinking} onChange={(e) => update('drinking', e.target.value as YesNo)} className={FIELD}>
              <option value="">{t('patientFormModal.htUnset')}</option>
              <option value="no">{t('patientFormModal.htNo')}</option>
              <option value="yes">{t('patientFormModal.htYes')}</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-bbh-ink">
            {t('patientFormModal.years')}
            <input type="number" min={0} max={120} value={form.drinking_years} disabled={form.drinking !== 'yes'} onChange={(e) => update('drinking_years', e.target.value)} className={`${FIELD} disabled:cursor-not-allowed disabled:bg-bbh-surface`} />
          </label>
        </div>

        <label className="block text-sm font-medium text-bbh-ink">
          {t('patientFormModal.notes')}
          <textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} className={TEXTAREA} />
        </label>

        <ModalActions>
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-bbh-line px-4 text-sm text-bbh-muted hover:text-bbh-ink sm:h-auto sm:py-2">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || !form.display_name.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-bbh-green px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:h-auto sm:py-2"
          >
            {mode === 'create' ? <UserRound size={16} /> : <Save size={16} />}
            {t('common.save')}
          </button>
        </ModalActions>
      </form>
    </Modal>
  )
}
