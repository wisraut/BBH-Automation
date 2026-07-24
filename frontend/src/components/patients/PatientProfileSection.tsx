import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Printer, Save, X } from 'lucide-react'

import { usePatient } from '../../hooks/usePatient'
import { useUpdatePatient } from '../../hooks/useUpdatePatient'
import { useToast } from '../../hooks/useToast'
import { ApiError } from '../../lib/api'
import { Eyebrow } from '../ui/Eyebrow'

const NATIONALITIES = [
  'ไทย', 'เมียนมา', 'กัมพูชา', 'ลาว', 'เวียดนาม', 'มาเลเซีย', 'จีน',
  'อินเดีย', 'ญี่ปุ่น', 'เกาหลีใต้', 'ฟิลิปปินส์', 'สหรัฐอเมริกา', 'สหราชอาณาจักร',
]
const OTHER = '__other__'
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// smoking/drinking flags are stored bool|null; the form carries them as a tri-state
// string picker. Everything else is a plain string field.
const FLAG_KEYS = new Set(['smoking', 'smoking_years', 'drinking', 'drinking_years'])

interface Form {
  display_name: string
  gender: string
  dob: string
  national_id: string
  nationality: string
  blood_type: string
  phone: string
  phone2: string
  phone3: string
  phone4: string
  email: string
  address: string
  intake_by: string
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
  smoking: string
  smoking_years: string
  drinking: string
  drinking_years: string
}
const EMPTY: Form = {
  display_name: '', gender: '', dob: '', national_id: '', nationality: '', blood_type: '',
  phone: '', phone2: '', phone3: '', phone4: '', email: '', address: '', intake_by: '', notes: '',
  english_name: '', religion: '', marital_status: '', occupation: '',
  father_name: '', father_phone: '', mother_name: '', mother_phone: '',
  emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_phone: '', emergency_contact_address: '',
  past_illness: '', congenital_disease: '', drugs_supplements: '', drug_allergy: '', food_allergy: '', chief_complaint: '',
  smoking: '', smoking_years: '', drinking: '', drinking_years: '',
}

const BASE = 'w-full rounded-lg border border-bbh-line px-3 py-2 text-sm focus:border-bbh-green focus:outline-none focus:ring-2 focus:ring-bbh-green/30'

// Read-only value row (view mode).
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5">
      <span className="text-xs text-bbh-muted">{label}</span>
      <span className="text-sm text-bbh-ink">{value?.trim() ? value : '—'}</span>
    </div>
  )
}
function Head({ text }: { text: string }) {
  return <Eyebrow>{text}</Eyebrow>
}

// The editable "personal profile" tab of the patient record. Read-only by default
// (a hospital chart — edits are deliberate) with an Edit toggle; grouped sections
// mirror the paper "บันทึกประวัติ / Health Record" intake form.
export function PatientProfileSection({ patientId }: { patientId: number }) {
  const { t } = useTranslation()
  const patientQ = usePatient(patientId)
  const update = useUpdatePatient()
  const toast = useToast()
  const p = patientQ.data

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Form>(EMPTY)
  const [natOther, setNatOther] = useState(false)

  function startEdit() {
    if (!p) return
    const nat = p.nationality ?? ''
    setForm({
      display_name: p.display_name ?? '', gender: p.gender ?? '', dob: p.dob ?? '',
      national_id: p.national_id ?? '', nationality: nat, blood_type: p.blood_type ?? '',
      phone: p.phone ?? '', phone2: p.phone2 ?? '', phone3: p.phone3 ?? '', phone4: p.phone4 ?? '',
      email: p.email ?? '', address: p.address ?? '', intake_by: p.intake_by ?? '', notes: p.notes ?? '',
      english_name: p.english_name ?? '', religion: p.religion ?? '',
      marital_status: p.marital_status ?? '', occupation: p.occupation ?? '',
      father_name: p.father_name ?? '', father_phone: p.father_phone ?? '',
      mother_name: p.mother_name ?? '', mother_phone: p.mother_phone ?? '',
      emergency_contact_name: p.emergency_contact_name ?? '',
      emergency_contact_relation: p.emergency_contact_relation ?? '',
      emergency_contact_phone: p.emergency_contact_phone ?? '',
      emergency_contact_address: p.emergency_contact_address ?? '',
      past_illness: p.past_illness ?? '', congenital_disease: p.congenital_disease ?? '',
      drugs_supplements: p.drugs_supplements ?? '', drug_allergy: p.drug_allergy ?? '', food_allergy: p.food_allergy ?? '',
      chief_complaint: p.chief_complaint ?? '',
      smoking: p.smoking == null ? '' : p.smoking ? 'yes' : 'no',
      smoking_years: p.smoking_years != null ? String(p.smoking_years) : '',
      drinking: p.drinking == null ? '' : p.drinking ? 'yes' : 'no',
      drinking_years: p.drinking_years != null ? String(p.drinking_years) : '',
    })
    setNatOther(!!nat && !NATIONALITIES.includes(nat))
    setEditing(true)
  }
  // Leave edit mode if the selected patient changes underneath us.
  useEffect(() => { setEditing(false) }, [patientId])

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    // Text fields: trimmed, empty -> null (clears). smoking/drinking: tri-state
    // '' -> null (unset), 'no' -> false, 'yes' -> true; years only when 'yes'.
    const body: Record<string, unknown> = Object.fromEntries(
      Object.entries(form)
        .filter(([k]) => !FLAG_KEYS.has(k))
        .map(([k, v]) => [k, (v as string).trim() || null]),
    )
    body.smoking = form.smoking === '' ? null : form.smoking === 'yes'
    body.smoking_years = form.smoking === 'yes' && form.smoking_years ? Number(form.smoking_years) : null
    body.drinking = form.drinking === '' ? null : form.drinking === 'yes'
    body.drinking_years = form.drinking === 'yes' && form.drinking_years ? Number(form.drinking_years) : null
    try {
      await update.mutateAsync({ id: patientId, body })
      toast.show('success', t('patientProfile.saved'))
      setEditing(false)
    } catch (error) {
      toast.show('error', error instanceof ApiError ? error.message : t('patientProfile.saveFailed'))
    }
  }

  if (patientQ.isLoading || !p) {
    return <p className="text-sm text-bbh-muted">{t('common.loading')}</p>
  }

  const genderLabel = p.gender ? t(`patientFormModal.sex${p.gender[0].toUpperCase()}${p.gender.slice(1)}`) : '—'

  // "ไม่/ใช่ (N ปี)" for a stored smoking/drinking flag; null = not recorded -> — via Row.
  function flagText(flag?: boolean | null, years?: number | null): string | null {
    if (flag == null) return null
    if (!flag) return t('patientFormModal.htNo')
    return years != null
      ? `${t('patientFormModal.htYes')} · ${years} ${t('patientFormModal.years')}`
      : t('patientFormModal.htYes')
  }

  if (!editing) {
    return (
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <Head text={t('patients.tabs.profile')} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.open(`/print/patient/${patientId}`, '_blank')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-3 py-1.5 text-xs font-medium text-bbh-ink transition-colors hover:border-bbh-green hover:text-bbh-green-dark"
            >
              <Printer size={13} /> {t('patientProfile.print')}
            </button>
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-3 py-1.5 text-xs font-medium text-bbh-ink transition-colors hover:border-bbh-green hover:text-bbh-green-dark"
            >
              <Pencil size={13} /> {t('patientProfile.edit')}
            </button>
          </div>
        </div>

        <div>
          <Eyebrow>{t('patientFormModal.secPersonal')}</Eyebrow>
          <div className="mt-1 divide-y divide-bbh-line">
            <Row label={t('intake.name')} value={p.display_name} />
            <Row label={t('patientFormModal.englishName')} value={p.english_name} />
            <Row label={t('intake.gender')} value={genderLabel} />
            <Row label={t('intake.dob')} value={p.dob} />
            <Row label={t('intake.nationalId')} value={p.national_id} />
            <Row label={t('patientFormModal.nationality')} value={p.nationality} />
            <Row label={t('intake.bloodType')} value={p.blood_type} />
            <Row label={t('patientFormModal.religion')} value={p.religion} />
            <Row label={t('patientFormModal.maritalStatus')} value={p.marital_status} />
            <Row label={t('patientFormModal.occupation')} value={p.occupation} />
          </div>
        </div>

        <div>
          <Eyebrow>{t('intake.sectionContact')}</Eyebrow>
          <div className="mt-1 divide-y divide-bbh-line">
            <Row label={t('intake.phone1')} value={p.phone} />
            <Row label={t('intake.phone2')} value={p.phone2} />
            <Row label={t('intake.phone3')} value={p.phone3} />
            <Row label={t('intake.phone4')} value={p.phone4} />
            <Row label={t('intake.email')} value={p.email} />
            <Row label={t('intake.address')} value={p.address} />
          </div>
        </div>

        <div>
          <Eyebrow>{t('patientFormModal.secFamily')}</Eyebrow>
          <div className="mt-1 divide-y divide-bbh-line">
            <Row label={t('patientFormModal.fatherName')} value={p.father_name} />
            <Row label={t('patientFormModal.fatherPhone')} value={p.father_phone} />
            <Row label={t('patientFormModal.motherName')} value={p.mother_name} />
            <Row label={t('patientFormModal.motherPhone')} value={p.mother_phone} />
            <Row label={t('patientFormModal.emergencyName')} value={p.emergency_contact_name} />
            <Row label={t('patientFormModal.emergencyRelation')} value={p.emergency_contact_relation} />
            <Row label={t('patientFormModal.emergencyPhone')} value={p.emergency_contact_phone} />
            <Row label={t('patientFormModal.emergencyAddress')} value={p.emergency_contact_address} />
          </div>
        </div>

        <div>
          <Eyebrow>{t('patientFormModal.secHealth')}</Eyebrow>
          <div className="mt-1 divide-y divide-bbh-line">
            <Row label={t('patientFormModal.pastIllness')} value={p.past_illness} />
            <Row label={t('patientFormModal.congenitalDisease')} value={p.congenital_disease} />
            <Row label={t('patientFormModal.drugsSupplements')} value={p.drugs_supplements} />
            <Row label={t('patientFormModal.drugAllergy')} value={p.drug_allergy} />
            <Row label={t('patientFormModal.foodAllergy')} value={p.food_allergy} />
            <Row label={t('patientFormModal.chiefComplaint')} value={p.chief_complaint} />
          </div>
        </div>

        <div>
          <Eyebrow>{t('patientFormModal.secBehavior')}</Eyebrow>
          <div className="mt-1 divide-y divide-bbh-line">
            <Row label={t('patientFormModal.smoking')} value={flagText(p.smoking, p.smoking_years)} />
            <Row label={t('patientFormModal.drinking')} value={flagText(p.drinking, p.drinking_years)} />
          </div>
        </div>

        <div>
          <Eyebrow>{t('intake.sectionIntakeBy')}</Eyebrow>
          <div className="mt-1 divide-y divide-bbh-line">
            <Row label={t('intake.intakeBy')} value={p.intake_by} />
            <Row label={t('patientFormModal.notes')} value={p.notes} />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <Head text={t('patients.tabs.profile')} />

      {/* Personal */}
      <div className="space-y-2.5">
        <Eyebrow>{t('patientFormModal.secPersonal')}</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.name')}</span>
            <input value={form.display_name} onChange={set('display_name')} maxLength={120} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.englishName')}</span>
            <input value={form.english_name} onChange={set('english_name')} maxLength={120} className={BASE} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.gender')}</span>
            <select value={form.gender} onChange={set('gender')} className={BASE}>
              <option value="">{t('intake.selectPlaceholder')}</option>
              <option value="female">{t('patientFormModal.sexFemale')}</option>
              <option value="male">{t('patientFormModal.sexMale')}</option>
              <option value="other">{t('patientFormModal.sexOther')}</option>
              <option value="unknown">{t('patientFormModal.sexUnknown')}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.dob')}</span>
            <input type="date" value={form.dob} onChange={set('dob')} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.nationalId')}</span>
            <input value={form.national_id} onChange={set('national_id')} maxLength={30} className={BASE} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.nationality')}</span>
            <select
              value={natOther ? OTHER : form.nationality}
              onChange={(e) => {
                const v = e.target.value
                if (v === OTHER) { setNatOther(true); setForm((f) => ({ ...f, nationality: '' })) }
                else { setNatOther(false); setForm((f) => ({ ...f, nationality: v })) }
              }}
              className={BASE}
            >
              <option value="">{t('patientFormModal.nationalityUnset')}</option>
              {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={OTHER}>{t('patientFormModal.nationalityOther')}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.bloodType')}</span>
            <select value={form.blood_type} onChange={set('blood_type')} className={BASE}>
              <option value="">{t('intake.bloodUnknown')}</option>
              {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
        {natOther ? (
          <label className="block sm:w-1/2">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.nationalitySpecify')}</span>
            <input value={form.nationality} onChange={set('nationality')} maxLength={60} className={BASE} />
          </label>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.religion')}</span>
            <input value={form.religion} onChange={set('religion')} maxLength={60} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.maritalStatus')}</span>
            <input value={form.marital_status} onChange={set('marital_status')} maxLength={30} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.occupation')}</span>
            <input value={form.occupation} onChange={set('occupation')} maxLength={120} className={BASE} />
          </label>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-2.5 border-t border-bbh-line pt-3">
        <Eyebrow>{t('intake.sectionContact')}</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.phone1')}</span>
            <input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.phone2')}</span>
            <input type="tel" inputMode="tel" value={form.phone2} onChange={set('phone2')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.phone3')}</span>
            <input type="tel" inputMode="tel" value={form.phone3} onChange={set('phone3')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.phone4')}</span>
            <input type="tel" inputMode="tel" value={form.phone4} onChange={set('phone4')} maxLength={20} className={BASE} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.email')}</span>
          <input type="email" value={form.email} onChange={set('email')} maxLength={191} className={BASE} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.address')}</span>
          <textarea value={form.address} onChange={set('address')} rows={2} maxLength={2000} className={`resize-none ${BASE}`} />
        </label>
      </div>

      {/* Family & emergency contact */}
      <div className="space-y-2.5 border-t border-bbh-line pt-3">
        <Eyebrow>{t('patientFormModal.secFamily')}</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.fatherName')}</span>
            <input value={form.father_name} onChange={set('father_name')} maxLength={120} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.fatherPhone')}</span>
            <input type="tel" inputMode="tel" value={form.father_phone} onChange={set('father_phone')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.motherName')}</span>
            <input value={form.mother_name} onChange={set('mother_name')} maxLength={120} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.motherPhone')}</span>
            <input type="tel" inputMode="tel" value={form.mother_phone} onChange={set('mother_phone')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.emergencyName')}</span>
            <input value={form.emergency_contact_name} onChange={set('emergency_contact_name')} maxLength={120} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.emergencyRelation')}</span>
            <input value={form.emergency_contact_relation} onChange={set('emergency_contact_relation')} maxLength={60} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.emergencyPhone')}</span>
            <input type="tel" inputMode="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} maxLength={20} className={BASE} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.emergencyAddress')}</span>
            <input value={form.emergency_contact_address} onChange={set('emergency_contact_address')} maxLength={500} className={BASE} />
          </label>
        </div>
      </div>

      {/* Health history */}
      <div className="space-y-2.5 border-t border-bbh-line pt-3">
        <Eyebrow>{t('patientFormModal.secHealth')}</Eyebrow>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.pastIllness')}</span>
          <textarea value={form.past_illness} onChange={set('past_illness')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${BASE}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.congenitalDisease')}</span>
          <textarea value={form.congenital_disease} onChange={set('congenital_disease')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${BASE}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.drugsSupplements')}</span>
          <textarea value={form.drugs_supplements} onChange={set('drugs_supplements')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${BASE}`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.drugAllergy')}</span>
            <textarea value={form.drug_allergy} onChange={set('drug_allergy')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${BASE}`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.foodAllergy')}</span>
            <textarea value={form.food_allergy} onChange={set('food_allergy')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${BASE}`} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.chiefComplaint')}</span>
            <textarea value={form.chief_complaint} onChange={set('chief_complaint')} rows={2} maxLength={2000} placeholder={t('patientFormModal.healthHint')} className={`resize-none ${BASE}`} />
          </label>
        </div>
      </div>

      {/* Lifestyle */}
      <div className="space-y-2.5 border-t border-bbh-line pt-3">
        <Eyebrow>{t('patientFormModal.secBehavior')}</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.smoking')}</span>
            <select value={form.smoking} onChange={set('smoking')} className={BASE}>
              <option value="">{t('patientFormModal.htUnset')}</option>
              <option value="no">{t('patientFormModal.htNo')}</option>
              <option value="yes">{t('patientFormModal.htYes')}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.years')}</span>
            <input type="number" min={0} max={120} value={form.smoking_years} disabled={form.smoking !== 'yes'} onChange={set('smoking_years')} className={`${BASE} disabled:cursor-not-allowed disabled:bg-bbh-surface`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.drinking')}</span>
            <select value={form.drinking} onChange={set('drinking')} className={BASE}>
              <option value="">{t('patientFormModal.htUnset')}</option>
              <option value="no">{t('patientFormModal.htNo')}</option>
              <option value="yes">{t('patientFormModal.htYes')}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.years')}</span>
            <input type="number" min={0} max={120} value={form.drinking_years} disabled={form.drinking !== 'yes'} onChange={set('drinking_years')} className={`${BASE} disabled:cursor-not-allowed disabled:bg-bbh-surface`} />
          </label>
        </div>
      </div>

      {/* Other */}
      <div className="space-y-2.5 border-t border-bbh-line pt-3">
        <Eyebrow>{t('intake.sectionIntakeBy')}</Eyebrow>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('intake.intakeBy')}</span>
          <input value={form.intake_by} onChange={set('intake_by')} maxLength={120} className={BASE} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-bbh-ink">{t('patientFormModal.notes')}</span>
          <textarea value={form.notes} onChange={set('notes')} rows={3} maxLength={2000} className={`resize-none ${BASE}`} />
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={update.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-bbh-line px-3 py-2 text-sm font-medium text-bbh-muted hover:text-bbh-ink disabled:opacity-60"
        >
          <X size={15} /> {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={update.isPending || !form.display_name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bbh-green px-4 py-2 text-sm font-semibold text-white hover:bg-bbh-green-dark disabled:opacity-60"
        >
          <Save size={15} /> {t('common.save')}
        </button>
      </div>
    </section>
  )
}
